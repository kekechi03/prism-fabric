# Admission and execution boundaries

The control plane consumes a snapshot of execution pools and a batch of capacity requests. A pool describes its region, available slots, per-slot memory, cached models, queue estimate and startup estimate. The planner rejects incompatible pools before applying its ranking policy.

## Admission order

1. Apply the caller's allowed-region set.
2. Require enough unreserved slots and sufficient memory per slot.
3. Include startup delay when a model is not in the pool cache.
4. Reject any placement that exceeds the request's readiness deadline.
5. Rank eligible pools with a deterministic policy score.
6. Subtract admitted slots before processing the next request in the batch.

Requests retain input order. An unplaceable request remains queued with per-pool reasons. The planner copies the fleet input and does not mutate its caller's state. It does not claim consistency across processes or independent HTTP requests.

## Policy score

```text
score = ready_ms + (requested_slots × cost_per_slot_hour × 250) + cold_cache_penalty
```

This score is a policy heuristic. It is not a latency forecast or dollar-denominated objective. Lower values rank first, with pool ID as a stable tie breaker.

## Receipts

`UsageJournal` assigns a sequence number and links each entry to the previous SHA-256 digest. Duplicate request IDs are rejected. Verification detects edits and reordering. Detecting truncation requires retaining the expected final digest separately. The journal is held in process memory; external storage and independent timestamping are not provided.

## Local process

The preview is a loopback-only simulator. It issues signed lease previews to demonstrate the protocol without running workloads, executing commands, fetching artifacts or reading deployment snapshots. The server process does not possess cloud credentials.
