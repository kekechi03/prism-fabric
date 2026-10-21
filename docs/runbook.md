# Runbook: staging notice gateway

Staging only. The local preview and tests do not need any of this.

## Check that a key works
```sh
curl -X POST "$FABRIC_NOTICE_GATEWAY" -H "Authorization: Bearer $FABRIC_NOTICE_KEY"
```
`200` means the key is accepted, `401` means it is not recognised.

## Rotate a staging key
1. Issue a new key in the gateway admin console.
2. Update `deploy/staging.env`, `config/jurisdictions/jp.staging.json` and `ops/bootstrap-control.json`.
3. Revoke the old key.

## Known follow-up
`INC-0004` in the fixtures is a rehearsal of the awkward case: a staging key committed to a repository. The tooling is better at triaging other people's incidents than ours.
