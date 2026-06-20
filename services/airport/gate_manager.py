import threading
import time

from broadcast import BroadcastClient
from config import ALL_GATES, EU_GATES, GAME_SPEED, PROCESSING_TIME_ALL, PROCESSING_TIME_EU
from game_time import game_now
from models import Arrival, db
from schemas import ArrivalSchema

_arrival_schema = ArrivalSchema()


PRIORITY_RANKS = {"fast": 1, "standard": 2}


def _effective_rank(guest: dict) -> int:
    if guest.get("disability"):
        return 0
    return PRIORITY_RANKS.get(guest.get("priority", "standard"), 2)


class Gate:

    def __init__(self, gate_id: str, gate_type: str, processing_time: float, app, broadcast: BroadcastClient):
        self.gate_id = gate_id
        self.gate_type = gate_type
        self.processing_time = processing_time
        self.app = app
        self.broadcast = broadcast
        self.queue: list[dict] = []
        self.currently_processing: list[dict] = []
        self.processing_started_at: float | None = None
        self.active_family_surname: str | None = None
        self.lock = threading.Lock()
        self.accepting = True
        self.running = True
        self.thread_started = False

    def queue_size(self) -> int:
        return len(self.queue) + len(self.currently_processing)

    def enqueue(self, guest: dict) -> int:
        if not self.accepting:
            raise ValueError(f"Gate {self.gate_id} is closed")

        rank = _effective_rank(guest)
        insert_at = len(self.queue)
        for i, existing in enumerate(self.queue):
            if _effective_rank(existing) >= rank:
                insert_at = i
                break
        self.queue.insert(insert_at, guest)
        return insert_at + 1

    def _current_processing_remaining(self, now: float) -> float:
        if not self.currently_processing or self.processing_started_at is None:
            return 0.0

        elapsed = now - self.processing_started_at
        return max(self.processing_time - elapsed, 0.0)

    def estimate_wait_seconds(self, queue_position: int, now: float | None = None) -> float:
        current_time = now if now is not None else game_now()
        return self._current_processing_remaining(current_time) + (queue_position * self.processing_time)

    def _has_accompanying_adult_locked(self, minor: dict, exclude_index: int | None = None) -> bool:
        """A minor can only clear passport control alongside a same-surname
        guest aged 12+ who is also currently waiting at this gate."""
        for i, other in enumerate(self.queue):
            if i == exclude_index:
                continue
            if other["surname"] == minor["surname"] and other["age"] >= 12:
                return True
        return False

    def _pop_next_batch_locked(self) -> list[dict]:
        """Pop the next family unit to be processed together.

        Guests under 12 are skipped (held in the queue, where they keep
        advancing normally) unless a same-surname guest aged 12+ is also
        present in the queue to accompany them through the booth.
        """
        if not self.queue:
            return []

        surname = self.active_family_surname

        if surname is None:
            for index, guest in enumerate(self.queue):
                if guest["age"] < 12 and not self._has_accompanying_adult_locked(guest, exclude_index=index):
                    continue
                surname = guest["surname"]
                break
            else:
                return []
            self.active_family_surname = surname

        family_indices = [i for i, g in enumerate(self.queue) if g["surname"] == surname]
        if not family_indices:
            self.active_family_surname = None
            return []

        adults_present = any(self.queue[i]["age"] >= 12 for i in family_indices)

        batch: list[dict] = []
        held_minor = False
        for i in family_indices:
            guest = self.queue[i]
            if guest["age"] < 12 and not adults_present:
                held_minor = True
                continue
            batch.append(guest)

        if not batch:
            # Only unaccompanied minors remain for this family right now —
            # hold them and free up the gate to serve someone else.
            self.active_family_surname = None
            return []

        for guest in batch:
            self.queue.remove(guest)

        if not held_minor:
            self.active_family_surname = None  # family fully cleared this gate

        return batch

    def start(self):
        if self.thread_started:
            return
        self.thread_started = True
        thread = threading.Thread(target=self._run, daemon=True)
        thread.start()

    def stop(self):
        self.running = False

    def _run(self):
        while self.running:
            batch: list[dict] = []
            with self.lock:
                batch = self._pop_next_batch_locked()
                if batch:
                    now = game_now()
                    for guest in batch:
                        guest["status"] = "processing"
                        guest["started_at"] = now
                    self.currently_processing = batch
                    self.processing_started_at = now

            if not batch:
                time.sleep(0.1)
                continue

            with self.app.app_context():
                for guest in batch:
                    arrival = db.session.get(Arrival, guest["arrival_id"])
                    if arrival:
                        arrival.status = "processing"
                db.session.commit()

            real_delay = self.processing_time / GAME_SPEED
            started_at = self.processing_started_at
            time.sleep(real_delay)

            processed_at = game_now()
            wait_time = processed_at - started_at
            for guest in batch:
                guest["status"] = "processed"
                guest["processed_at"] = processed_at
                guest["wait_time_seconds"] = wait_time

            with self.app.app_context():
                for guest in batch:
                    arrival = db.session.get(Arrival, guest["arrival_id"])
                    if arrival:
                        arrival.status = "processed"
                        arrival.processed_at = processed_at
                        arrival.wait_time_seconds = wait_time
                db.session.commit()

            for guest in batch:
                self.broadcast.publish_event(guest)

            with self.lock:
                self.currently_processing = []
                self.processing_started_at = None


class GateManager:

    def __init__(self, app, broadcast_client: BroadcastClient):
        self.app = app
        self.broadcast_client = broadcast_client
        self.gates: dict[str, Gate] = {}
        self.assignment_lock = threading.Lock()
        self.next_gate_index = {"EU": EU_GATES + 1, "ALL": ALL_GATES + 1}

        for i in range(1, EU_GATES + 1):
            gid = f"EU-{i}"
            self.gates[gid] = Gate(gid, "EU", PROCESSING_TIME_EU, app, broadcast_client)
        for i in range(1, ALL_GATES + 1):
            gid = f"ALL-{i}"
            self.gates[gid] = Gate(gid, "ALL", PROCESSING_TIME_ALL, app, broadcast_client)

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
            gate.stop()

    def _gate_size_locked(self, gate: Gate) -> int:
        return gate.queue_size()

    def _gate_status_locked(self, gate: Gate, now: float) -> dict:
        queue_snapshot = []
        for cp in gate.currently_processing:
            queue_snapshot.append({**cp, "position": 0, "wait_time_seconds": now - cp["queued_at"]})
        for i, g in enumerate(gate.queue):
            queue_snapshot.append({**g, "position": i + 1, "wait_time_seconds": now - g["queued_at"]})

        return {
            "gate_id": gate.gate_id,
            "gate_type": gate.gate_type,
            "open": gate.accepting,
            "queue_size": self._gate_size_locked(gate),
            "queue": queue_snapshot,
        }

    def _open_gates(self, gate_type: str, exclude_gate_id: str | None = None) -> list[Gate]:
        return [
            gate
            for gate in self.gates.values()
            if gate.gate_type == gate_type and gate.accepting and gate.gate_id != exclude_gate_id
        ]

    def _shortest_queue_gate(self, gate_type: str, exclude_gate_id: str | None = None) -> Gate:
        candidates = self._open_gates(gate_type, exclude_gate_id)
        if not candidates:
            raise ValueError(f"No open {gate_type} gates available")
        return min(candidates, key=lambda gate: gate.queue_size())

    def _select_gate_for_guest(self, guest: dict, exclude_gate_id: str | None = None) -> Gate:
        if guest["passport_type"] == "EU":
            eu_candidates = self._open_gates("EU", exclude_gate_id)
            all_candidates = self._open_gates("ALL", exclude_gate_id)

            if not eu_candidates and not all_candidates:
                raise ValueError("No open gate available for this guest")
            if not eu_candidates:
                return min(all_candidates, key=lambda gate: gate.queue_size())
            if not all_candidates:
                return min(eu_candidates, key=lambda gate: gate.queue_size())

            eu_gate = min(eu_candidates, key=lambda gate: gate.queue_size())
            all_gate = min(all_candidates, key=lambda gate: gate.queue_size())
            return all_gate if all_gate.queue_size() < eu_gate.queue_size() else eu_gate

        return self._shortest_queue_gate("ALL", exclude_gate_id)

    def _next_gate_id(self, gate_type: str) -> str:
        gate_id = f"{gate_type}-{self.next_gate_index[gate_type]}"
        self.next_gate_index[gate_type] += 1
        return gate_id

    def _persist_gate_change(self, guest: dict, gate_id: str):
        with self.app.app_context():
            arrival = db.session.get(Arrival, guest["arrival_id"])
            if arrival:
                arrival.gate = gate_id
                db.session.commit()

    def _enqueue_guest_to_gate(self, guest: dict, gate: Gate) -> int:
        guest["gate"] = gate.gate_id
        guest["status"] = "queued"
        self._persist_gate_change(guest, gate.gate_id)
        with gate.lock:
            return gate.enqueue(guest)

    def _family_gate_for_guest(self, guest: dict) -> Gate | None:
        surname = guest["surname"]
        passport_type = guest["passport_type"]
        best_gate = None
        best_count = 0

        for gate in self.gates.values():
            if passport_type == "non-EU" and gate.gate_type != "ALL":
                continue

            with gate.lock:
                family_count = sum(1 for member in gate.queue if member["surname"] == surname)
                family_count += sum(1 for member in gate.currently_processing if member["surname"] == surname)

            if family_count > best_count:
                best_gate = gate
                best_count = family_count

        return best_gate if best_count > 0 else None

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
            queue_size = self._gate_size_locked(gate)
            estimated_wait_seconds = gate.estimate_wait_seconds(position)

        return {
            "guest_id": guest["guest_id"],
            "gate": gate.gate_id,
            "position": position,
            "queue_size": queue_size,
            "queued_at": guest["queued_at"],
            "estimated_wait_seconds": estimated_wait_seconds,
        }

    def get_guest(self, guest_id: str) -> dict | None:
        with self.app.app_context():
            arrival = Arrival.query.filter_by(guest_id=guest_id).order_by(Arrival.queued_at.desc()).first()
            return _arrival_schema.dump(arrival) if arrival else None

    def get_guest_position(self, guest_id: str, gate_id: str) -> int | None:
        gate = self.gates.get(gate_id)
        if gate is None:
            return None
        with gate.lock:
            if any(g["guest_id"] == guest_id for g in gate.currently_processing):
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
                gate_status = self._gate_status_locked(gate, now)
                total_queued += gate_status["queue_size"]
            gates_list.append(gate_status)
        return {
            "gates": sorted(gates_list, key=lambda gate: gate["gate_id"]),
            "total_queued": total_queued,
            "current_game_time": now,
        }