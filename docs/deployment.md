# Deployment boundaries

`npm start` runs the local preview at `127.0.0.1:4818`. It does not load `deploy/staging.env`, the jurisdiction snapshot or bootstrap configuration. CI and the assessment example also use only synthetic fixtures.

The staging files capture the shape of the separate notice-gateway configuration: a jurisdiction policy, a gateway endpoint, an access key and an approval lifetime. This repository does not ship a gateway, a deploy workflow or a mail/SMS sender.

Treat configuration snapshots as explicit integration inputs. Ordinary development, tests, reading the source and running the local examples require no external credentials or outbound connection.

Before using this with real incident data, design authentication, access control, retention and encryption separately. Do not expose the loopback preview as a production service, and do not put real personal data in fixtures.
