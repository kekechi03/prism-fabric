# Triage and ledger design

The desk consumes incident records (dataset size, data categories, encryption state, whether the cause was malicious, jurisdictions) and a table of illustrative jurisdiction rules.

## Triage order
1. Validate the incident; reject unknown categories and negative counts.
2. Compute an exposure score from category weights and record volume.
3. Lower the score when the data was encrypted; raise it when the cause was malicious.
4. Map the score to a severity (`low`, `medium`, `high`, `critical`).
5. Per jurisdiction, decide whether an authority notice is required and compute its due time from `detectedAt`.
6. Require individual notices for `high` and above, or where the rule says so.

```text
score = sum(category weights) × (1 + log10(records + 1)) × (encrypted ? 0.4 : 1) × (malicious ? 1.5 : 1)
```

The score is a reproducible heuristic, not a legal determination. Jurisdiction rules in `fixtures/jurisdictions.json` are simplified placeholders; check current law and authority guidance before relying on any deadline.

## Approvals
`ApprovalCodec` issues HMAC-SHA256 approvals with a fixed audience, a fixed action set and a lifetime of at most 15 minutes. Verification rejects edits, expiry and a different audience. Signing keys are generated in memory by the preview and are not persisted.

## Ledger
`IncidentLedger` chains entries with SHA-256 and rejects duplicate event IDs. Verification detects edits and reordering; detecting truncation requires keeping the final hash elsewhere. It is in-memory and is not a case-management system.
