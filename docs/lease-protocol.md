# Execution lease envelope

The codec uses two base64url segments:

```text
base64url(JSON claims) . base64url(HMAC-SHA256(payload))
```

Claims include `version`, `id`, `aud`, `pool`, `model`, `slots`, `iat` and `exp`. Lifetimes are restricted to 1–900 seconds. Verification checks the signature with constant-time comparison, the expected audience, issue time and expiry. A lease is signed, not encrypted.

The local preview generates an ephemeral signing key at startup. Its lease previews are unrelated to staging configuration keys and grant no access to external resources.

Replay prevention and durable reservation ownership are outside the codec. A future runner adapter must bind redemption to an accepted reservation and record lease use. A hash-chained usage receipt cannot substitute for runner authentication or workload isolation.
