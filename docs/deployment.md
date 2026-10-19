# Deployment boundaries

`npm start` runs the local preview at `127.0.0.1:4818`. It does not load `deploy/staging.env`, region snapshots or bootstrap configuration. CI and batch-planning examples also use only synthetic fixtures.

The staging files capture the shape of the separate admission service configuration: a region policy, a control endpoint, an access key and lease policy. This repository does not ship a cluster adapter, deploy workflow, remote runner, or hosted admission service.

Treat configuration snapshots as explicit integration inputs. A `.invalid` address means the endpoint is not configured. Ordinary development, tests, reading the source and running the local planner require no external credentials or outbound connection.

Before integrating a real runner, design its authentication, revocation, reservation transactions, workload boundaries and storage separately. Do not expose the loopback preview as a production admission API.
