import threading
import time

from models import db, Arrival
from config import EU_GATES, ALL_GATES, PROCESSING_TIME_EU, PROCESSING_TIME_ALL
from schemas import ArrivalSchema
from game_time import game_now, GAME_SPEED
from broadcast import BroadcastClient

_arrival_schema = ArrivalSchema()


PRIORITY_RANKS = {"fast": 1, "standard": 2}


def _effective_rank(guest: dict) -> int:
    if guest.get("disability"):
        return 0
    return PRIORITY_RANKS.get(guest.get("priority", "standard"), 2)


class Gate:

    def __init__(self, gate_id: str, gate_type: str, processing_time: float,
                 app, broadcast: BroadcastClient):
        self.gate_id = gate_id
        self.gate_type = gate_type
        self.processing_time = processing_time
        self.app = app
        self.broadcast = broadcast
        self.queue: list[dict] = []
        self.currently_processing: dict | None = None
        self.lock = threading.Lock()
        self.active = True

    def enqueue(self, guest: dict) -> int:
        rank = _effective_rank(guest)
        insert_at = len(self.queue)
        for i, existing in enumerate(self.queue):
            if _effective_rank(existing) >= rank:
                insert_at = i
                break
        self.queue.insert(insert_at, guest)
        return insert_at + 1  # 1-based position

    def _current_processing_remaining(self, now: float) -> float:
        if not self.currently_processing:
            return 0.0

        started_at = self.currently_processing.get("started_at")
        if started_at is None:
            return self.processing_time

        elapsed = now - started_at
        return max(self.processing_time - elapsed, 0.0)

    def estimate_wait_seconds(self, queue_position: int, now: float | None = None) -> float:
        current_time = now if now is not None else game_now()
        return self._current_processing_remaining(current_time) + (queue_position * self.processing_time)

    def start(self):
        thread = threading.Thread(target=self._run, daemon=True)
        thread.start()

    def _run(self):
        while self.active:
            guest = None
            with self.lock:
                if self.queue:
                    guest = self.queue.pop(0)
                    guest["status"] = "processing"
                    guest["started_at"] = game_now()
                    self.currently_processing = guest

            if guest is None:
                time.sleep(0.1)
                continue

            with self.app.app_context():
                arrival = db.session.get(Arrival, guest["arrival_id"])
                if arrival:
                    arrival.status = "processing"
                    db.session.commit()

            real_delay = self.processing_time / GAME_SPEED
            started_at = game_now()
            time.sleep(real_delay)

            processed_at = game_now()
            wait_time = processed_at - started_at
            guest["status"] = "processed"
            guest["processed_at"] = processed_at
            guest["wait_time_seconds"] = wait_time

            with self.app.app_context():
                arrival = db.session.get(Arrival, guest["arrival_id"])
                if arrival:
                    arrival.status = "processed"
                    arrival.processed_at = processed_at
                    arrival.wait_time_seconds = wait_time
                    db.session.commit()

            self.broadcast.publish_event(guest)

            with self.lock:
                self.currently_processing = None


class GateManager:

    def __init__(self, app, broadcast_client: BroadcastClient):
        self.app = app
        self.gates: dict[str, Gate] = {}
        self.assignment_lock = threading.Lock()

        eu_count = EU_GATES
        all_count = ALL_GATES
        eu_time = PROCESSING_TIME_EU
        all_time = PROCESSING_TIME_ALL

        for i in range(1, eu_count + 1):
            gid = f"EU-{i}"
            self.gates[gid] = Gate(gid, "EU", eu_time, app, broadcast_client)
        for i in range(1, all_count + 1):
            gid = f"ALL-{i}"
            self.gates[gid] = Gate(gid, "ALL", all_time, app, broadcast_client)

        self._rehydrate_from_db()

    def _rehydrate_from_db(self):
        with self.app.app_context():
            rows = Arrival.query.filter(
                Arrival.status.in_(["queued", "processing"])
            ).order_by(Arrival.queued_at).all()

            for row in rows:
                guest = _arrival_schema.dump(row)
                guest["arrival_id"] = row.id
                gate = self.gates.get(guest.get("gate"))
                if gate is None:
                    continue
                if guest["status"] == "processing":
                    guest["status"] = "queued"
                    row.status = "queued"
                    gate.queue.insert(0, guest)
                else:
                    gate.enqueue(guest)
            db.session.commit()

    def start_all(self):
        for gate in self.gates.values():
            gate.start()

    def stop_all(self):
        for gate in self.gates.values():
            gate.active = False

    def _shortest_queue_gate(self, gate_type: str) -> Gate:
        candidates = [g for g in self.gates.values() if g.gate_type == gate_type]
        return min(candidates, key=lambda g: len(g.queue))

    def assign_and_enqueue(self, guest: dict) -> dict:
        if guest["passport_type"] == "EU":
            eu_gate = self._shortest_queue_gate("EU")
            all_gate = self._shortest_queue_gate("ALL")
            gate = all_gate if len(all_gate.queue) < len(eu_gate.queue) else eu_gate
        else:
            gate = self._shortest_queue_gate("ALL")

        guest["queued_at"] = game_now()
        guest["status"] = "queued"
        guest["gate"] = gate.gate_id

        with self.assignment_lock:
            with self.app.app_context():
                arrival = Arrival(
                    guest_id=guest["guest_id"],
                    name=guest["name"],
                    surname=guest["surname"],
                    age=guest["age"],
                    passport_type=guest["passport_type"],
                    priority=guest["priority"],
                    disability=guest.get("disability", False),
                    status="queued",
                    gate=gate.gate_id,
                    queued_at=guest["queued_at"],
                )
                db.session.add(arrival)
                db.session.commit()
                guest["arrival_id"] = arrival.id

        with gate.lock:
            position = gate.enqueue(guest)
            estimated_wait_seconds = gate.estimate_wait_seconds(position)

        return {
            "guest_id": guest["guest_id"],
            "gate": gate.gate_id,
            "position": position,
            "queue_size": len(gate.queue),
            "queued_at": guest["queued_at"],
            "estimated_wait_seconds": estimated_wait_seconds,
        }

    def get_guest(self, guest_id: str) -> dict | None:
        with self.app.app_context():
            arrival = Arrival.query.filter_by(guest_id=guest_id)\
                .order_by(Arrival.queued_at.desc()).first()
            return _arrival_schema.dump(arrival) if arrival else None

    def get_guest_position(self, guest_id: str, gate_id: str) -> int | None:
        gate = self.gates.get(gate_id)
        if gate is None:
            return None
        with gate.lock:
            if gate.currently_processing and gate.currently_processing["guest_id"] == guest_id:
                return 0
            for i, g in enumerate(gate.queue):
                if g["guest_id"] == guest_id:
                    return i + 1
        return None

    def get_all_gates_status(self) -> dict:
        now = game_now()
        gates_list = []
        total_queued = 0
        for gate in self.gates.values():
            with gate.lock:
                queue_snapshot = []
                cp = gate.currently_processing
                if cp:
                    queue_snapshot.append({**cp, "position": 0, "wait_time_seconds": now - cp["queued_at"]})
                for i, g in enumerate(gate.queue):
                    queue_snapshot.append({**g, "position": i + 1, "wait_time_seconds": now - g["queued_at"]})
                total_queued += len(gate.queue)
            gates_list.append({
                "gate_id": gate.gate_id,
                "gate_type": gate.gate_type,
                "queue_size": len(queue_snapshot),
                "queue": queue_snapshot,
            })
        return {
            "gates": sorted(gates_list, key=lambda g: g["gate_id"]),
            "total_queued": total_queued,
            "current_game_time": now,
        }
