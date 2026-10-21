# API

## Local preview (loopback only)

`npm start` serves `127.0.0.1:4818` from synthetic fixtures. It reads no deployment snapshots and calls no remote service.

| Method | Path | Purpose |
|---|---|---|
| GET | `/healthz` | Liveness |
| GET | `/v1/incidents` | Synthetic incident fixtures |
| POST | `/v1/assessments` | Triage up to 32 incidents; returns severity, per-jurisdiction notice state and approval previews |

Request body: `{ "incidents": [ ... ] }`, at most 16 KiB. See `examples/preview-request.json`.

## Staging notice gateway

A separate staging service validates a notice key before drafts are created. Its description is in [openapi.yaml](../openapi.yaml): `POST /api/v1/auth/validate` with `Authorization: Bearer <key>`. The key and endpoint appear in the staging configuration snapshots. Use test data only; requests to that host may be recorded (see [SECURITY.md](../SECURITY.md)).
