## Polycentric Services

From this directory, use the justfile for common tasks:

- `just start` — build and run (Docker Compose up --build)
- `just up` — run without building
- `just down` — stop
- `just test` — run server tests in container
- `just` — list all recipes

By default `polycentric-server` will be at `http://localhost:8787` and `verifiers-server` at `http://localhost:3002`. Create a`.env` file and set `POLYCENTRIC_PORT` or `VERIFIERS_PORT` to use different host ports.

### polycentric-server

`polycentric-server` requires `opensearch` and `postgres`.

This server is the main backend for the React Native app and the legacy web client. Clients can use servers such as `serv1.polycentric.io`, `serv2.polycentric.io`, `staging-serv1.polycentric.io`.

Local clients can use `localhost:8787` as a server if it's running locally, which is good practice during development.

You can also run integration tests in `../legacy/packages/polycentric-core`.

### verifiers-server

`verifiers-server` is a separate service that uses `polycentric-server`. Clients are expected to directly use the verifier API to create claims about themselves (e.g. I own this YouTube channel). Clients request the `verifiers-server` to verify such a claim. If the claim is verified, `verifiers-server` will post polycentric events accordingly to `polycentric-server`.
