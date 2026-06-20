# Airport Service

Simulates passport control at the island resort airport. Arriving guests are routed to gates based on passport type, queued with priority ordering, and processed through timed passport control.

## Stack

- Python 3.12 + Flask
- SQLite (file-based)
- SQLAlchemy + Marshmallow
- Gunicorn (1 worker, 8 threads)

## Prerequisites

- Docker + Docker Compose
- Python 3.12 (for local development)

## Running locally

From the repo root:

```bash
docker compose up --build
```

The service starts on `http://localhost:3001`. On first boot the database is created automatically with an empty arrivals table. Gate worker threads start immediately.

Health check:

```bash
curl http://localhost:3001/health
```

## Environment variables

| Variable               | Default                    | Description                                                                                   |
| ---------------------- | -------------------------- | --------------------------------------------------------------------------------------------- |
| `PORT`                 | `3001`                     | HTTP listen port                                                                              |
| `DATABASE_PATH`        | `airport.db`               | SQLite database file path                                                                     |
| `BROADCAST_SERVICE_URL`| `http://broadcast:3002`    | Broadcast service base URL for airport domain events                                          |
| `INTERNAL_SECRET`      | `""`                       | Shared secret sent as `X-Internal-Key` header to the broadcast service                        |
| `SIMULATION_START_TIME`| `2026-06-20T00:00:00Z`     | ISO timestamp when in-game time starts                                                        |
| `GAME_SPEED`           | `300`                      | In-game seconds advanced per real-world second. `300` means 1 real second = 5 in-game minutes |
| `EU_GATES`             | `3`                        | Number of EU passport control gates                                                           |
| `ALL_GATES`            | `2`                        | Number of ALL (non-EU) passport control gates                                                 |
| `PROCESSING_TIME_EU`   | `300`                      | Game-time seconds to process one EU passport guest                                            |
| `PROCESSING_TIME_ALL`  | `600`                     | Game-time seconds to process one non-EU passport guest                                        |

The airport service derives current game time from elapsed real seconds:

```txt
real_elapsed = time.time() - SIMULATION_START
game_seconds = real_elapsed * GAME_SPEED
```

## Data model

### Arrival

| Field               | Type    | Notes                                                    |
| ------------------- | ------- | -------------------------------------------------------- |
| `id`                | Integer | Auto-increment primary key                               |
| `guest_id`          | String  | Guest ID, e.g. `guest-kiki-0001`                         |
| `name`              | String  | Guest first name                                         |
| `surname`           | String  | Guest surname                                            |
| `age`               | Integer | Guest age                                                |
| `passport_type`     | String  | `EU` or `non-EU`                                         |
| `priority`          | String  | `standard` or `fast`                                     |
| `disability`        | Boolean | Whether the guest has a disability (grants top priority) |
| `status`            | String  | `queued`, `processing`, or `processed`                   |
| `gate`              | String  | Assigned gate ID, e.g. `EU-1` or `ALL-2`                 |
| `queued_at`         | Float   | Game-time seconds when the guest entered the queue       |
| `processed_at`      | Float   | Game-time seconds when processing completed              |
| `wait_time_seconds` | Float   | `processed_at - queued_at`                               |

## Gate system

The airport has two types of passport control gates:

| Gate type | Count (default) | Accepts        | Processing time (game seconds) |
| --------- | --------------- | -------------- | ------------------------------ |
| EU        | 3               | EU passports   | 300 (5 game minutes)           |
| ALL       | 2               | non-EU passports | 600 (10 game minutes)        |

Each gate runs a background worker thread that processes guests one at a time.

### Queue assignment

When a guest arrives via `POST /arrivals`:

1. Determine the candidate gate by passport type:
   - `non-EU` guests are assigned to the shortest ALL gate.
   - `EU` guests are assigned to the shortest EU gate, but spill over to the shortest ALL gate when that ALL gate's queue is strictly shorter (cross-type load balancing).
2. Insert into the chosen gate's priority queue
3. If a same-surname family member is already waiting or processing at a gate, new guests with that surname are routed to the same gate so the family stays together.

### Priority ordering

Guests are ordered within each gate's queue by priority rank:

| Rank | Condition              |
| ---- | ---------------------- |
| 0    | `disability = true`    |
| 1    | `priority = "fast"`    |
| 2    | `priority = "standard"`|

A guest with a disability always jumps ahead of fast and standard guests. Fast-track guests jump ahead of standard guests.

### Minor hold rule

Guests under 12 may wait in the queue normally, but a minor cannot enter the booth or be processed unless the gate has a same-surname family member available at passport control. If a minor reaches the front without an accompanying family member, the gate worker skips them until a matching family member is available.

### Rehydration on restart

On startup, the gate manager rehydrates in-memory queues from the database. Any guest with status `processing` is reset to `queued` and placed at the front of their gate's queue.

## Endpoints

| Method | Path                          | Description                              |
| ------ | ----------------------------- | ---------------------------------------- |
| GET    | `/health`                     | Health check                             |
| POST   | `/arrivals`                   | Register a new guest arrival             |
| GET    | `/arrivals`                   | List arrivals (filterable)               |
| GET    | `/arrivals/:guest_id`         | Get arrival status for a specific guest  |
| GET    | `/queue`                      | Live gate queue status                   |
| GET    | `/stats`                      | Aggregate airport statistics             |

## API contract

### POST /arrivals

Request:

```json
{
  "guest_id": "guest-kiki-0001",
  "name": "Kiki",
  "surname": "Smith",
  "age": 28,
  "passport_type": "EU",
  "priority": "standard",
  "disability": false
}
```

Response 202:

```json
{
  "guest_id": "guest-kiki-0001",
  "gate": "EU-1",
  "position": 1,
  "queue_size": 1,
  "queued_at": 12345.67,
  "estimated_wait_seconds": 300
}
```

Response 400 — invalid request payload:

```json
{
  "errors": {
    "passport_type": ["Must be one of: EU, non-EU."]
  }
}
```

### GET /arrivals/:guest_id

Response 200:

```json
{
  "guest_id": "guest-kiki-0001",
  "status": "processed",
  "gate": "EU-1",
  "position": null,
  "queued_at": 12345.67,
  "processed_at": 12945.67,
  "wait_time_seconds": 600.0
}
```

`position` is the guest's current place in the gate queue (`null` when processed, `0` when actively being processed).

Response 404:

```json
{
  "error": "Guest not found"
}
```

### GET /arrivals

Query parameters:

| Param           | Description                          |
| --------------- | ------------------------------------ |
| `status`        | Filter by `queued`, `processing`, or `processed` |
| `passport_type` | Filter by `EU` or `non-EU`           |

Response 200:

```json
{
  "arrivals": [
    {
      "id": 1,
      "guest_id": "guest-kiki-0001",
      "name": "Kiki",
      "surname": "Smith",
      "age": 28,
      "passport_type": "EU",
      "priority": "standard",
      "disability": false,
      "status": "processed",
      "gate": "EU-1",
      "queued_at": 12345.67,
      "processed_at": 12945.67,
      "wait_time_seconds": 600.0
    }
  ]
}
```

### GET /queue

Response 200:

```json
{
  "gates": [
    {
      "gate_id": "ALL-1",
      "gate_type": "ALL",
      "queue_size": 2,
      "queue": [
        {
          "guest_id": "guest-bob-0042",
          "name": "Bob",
          "surname": "Jones",
          "age": 35,
          "passport_type": "non-EU",
          "priority": "standard",
          "disability": false,
          "status": "processing",
          "gate": "ALL-1",
          "queued_at": 54021.0,
          "arrival_id": 7,
          "position": 0,
          "wait_time_seconds": 300.0
        }
      ]
    }
  ],
  "total_queued": 5,
  "current_game_time": 54321.0
}
```

### GET /stats

Response 200:

```json
{
  "total_arrivals": 15,
  "total_processed": 12,
  "currently_in_queue": 2,
  "currently_processing": 1,
  "avg_wait_time_seconds": 750.5,
  "max_wait_time_seconds": 1200.0,
  "min_wait_time_seconds": 600.0,
  "gate_distribution": { "EU-1": 5, "EU-2": 4, "ALL-1": 3 },
  "passport_distribution": { "EU": 9, "non-EU": 6 },
  "priority_distribution": { "standard": 12, "fast": 3 },
  "current_game_time": 54321.0
}
```

## Guest IDs

Guest IDs are opaque, non-empty strings — there is no enforced format. The frontend uses
`<surname>-<firstname>` slugs (for example, `mango-miles`).

`guest-kiki-0001` is the fixed identifier for the mascot guest.

## Broadcast integration

After a guest is processed, the airport service publishes an event to the broadcast service via `POST ${BROADCAST_SERVICE_URL}/airport/arrival`. Publishing is **best-effort** — if the broadcast service is down, events are silently dropped. A broadcast failure does not affect guest processing.

Event payload:

```json
{
  "channel": "resort-wide",
  "message": "Kiki Smith (ID: guest-kiki-0001) processed at EU Passport Gate (EU-1). Passport: EU, Wait: 600s game time",
  "sender": "airport-service",
  "data": {
    "guest_id": "guest-kiki-0001",
    "name": "Kiki",
    "surname": "Smith",
    "age": 28,
    "passport_type": "EU",
    "priority": "standard",
    "disability": false,
    "status": "processed",
    "gate": "EU-1",
    "queued_at": 12345.67,
    "processed_at": 12945.67,
    "wait_time_seconds": 600.0
  }
}
```