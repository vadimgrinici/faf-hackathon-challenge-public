from flask import request, jsonify
from marshmallow import ValidationError
from models import Arrival
from schemas import ArrivalInputSchema, ArrivalSchema
from game_time import game_now
from stats import get_stats
import base64
import json

arrival_input_schema = ArrivalInputSchema()
arrival_schema = ArrivalSchema()
arrivals_schema = ArrivalSchema(many=True)


def _encode_cursor(queued_at: float, arrival_id: int) -> str:
    payload = json.dumps([queued_at, arrival_id])
    return base64.urlsafe_b64encode(payload.encode("utf-8")).decode("ascii")


def _decode_cursor(token: str) -> tuple[float, int]:
    payload = base64.urlsafe_b64decode(token.encode("ascii")).decode("utf-8")
    queued_at, arrival_id = json.loads(payload)
    return float(queued_at), int(arrival_id)


def register_routes(app):

    @app.route("/arrivals", methods=["POST"])
    def create_arrival():
        data = request.get_json(silent=True)
        if not data:
            return jsonify({"error": "Request body must be valid JSON"}), 400

        try:
            guest = arrival_input_schema.load(data)
        except ValidationError as err:
            return jsonify({"errors": err.messages}), 400

        result = app.gate_manager.assign_and_enqueue(guest)
        return jsonify(result), 202

    @app.route("/arrivals/<guest_id>", methods=["GET"])
    def get_arrival(guest_id):
        guest = app.gate_manager.get_guest(guest_id)
        if not guest:
            return jsonify({"error": "Guest not found"}), 404

        position = None
        if guest["status"] in ("queued", "processing"):
            position = app.gate_manager.get_guest_position(guest_id, guest["gate"])

        if guest["status"] == "processed":
            wait_time = guest["wait_time_seconds"]
        else:
            wait_time = game_now() - guest["queued_at"]

        return jsonify({
            "guest_id": guest["guest_id"],
            "status": guest["status"],
            "gate": guest["gate"],
            "position": position,
            "queued_at": guest["queued_at"],
            "processed_at": guest.get("processed_at"),
            "wait_time_seconds": wait_time,
        }), 200

    @app.route("/arrivals", methods=["GET"])
    def list_arrivals():
        query = Arrival.query

        status = request.args.get("status")
        if status:
            query = query.filter_by(status=status)

        passport_type = request.args.get("passport_type")
        if passport_type:
            query = query.filter_by(passport_type=passport_type)

        # Stable order: queued_at desc, with id desc as a tiebreaker since
        # queued_at is not guaranteed unique.
        query = query.order_by(Arrival.queued_at.desc(), Arrival.id.desc())

        total = query.count()

        limit_param = request.args.get("limit")
        if limit_param is None:
            # No limit provided: preserve original behavior — return
            # everything in one response.
            arrivals = query.all()
            return jsonify({
                "arrivals": arrivals_schema.dump(arrivals),
                "next_cursor": None,
                "total": total,
            }), 200

        try:
            limit = int(limit_param)
            if limit <= 0:
                raise ValueError
        except ValueError:
            return jsonify({"error": "limit must be a positive integer"}), 400

        cursor_param = request.args.get("cursor")
        if cursor_param:
            try:
                cursor_queued_at, cursor_id = _decode_cursor(cursor_param)
            except Exception:
                return jsonify({"error": "Invalid cursor"}), 400

            query = query.filter(
                (Arrival.queued_at < cursor_queued_at)
                | ((Arrival.queued_at == cursor_queued_at) & (Arrival.id < cursor_id))
            )

        # Fetch one extra row to know whether there's a next page.
        page = query.limit(limit + 1).all()

        has_more = len(page) > limit
        page = page[:limit]

        next_cursor = None
        if has_more and page:
            last = page[-1]
            next_cursor = _encode_cursor(last.queued_at, last.id)

        return jsonify({
            "arrivals": arrivals_schema.dump(page),
            "next_cursor": next_cursor,
            "total": total,
        }), 200

    @app.route("/queue", methods=["GET"])
    def get_queue():
        return jsonify(app.gate_manager.get_all_gates_status()), 200

    @app.route("/stats", methods=["GET"])
    def get_stats_route():
        return jsonify(get_stats()), 200

    @app.route("/health", methods=["GET"])
    def health():
        return jsonify({"status": "ok"}), 200