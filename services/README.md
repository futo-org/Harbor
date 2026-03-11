## Polycentric Services

To run the server for local development:

```
docker compose up --build
```

`polycentric-server` will be at `http://localhost:8081`

`verifiers-server` will be at `http://localhost:3002`

### polycentric-server

`polycentric-server` requires `opensearch` and `postgres`.

This server is the main backend for the React Native app and the legacy web client. Clients can use servers such as `serv1.polycentric.io`, `serv2.polycentric.io`, `staging-serv1.polycentric.io`.

Local clients can use `localhost:8081` as a server if it's running locally, which is good practice during development.

To test the server, run:

```
docker compose exec polycentric-server cargo test --manifest-path services/polycentric-server/Cargo.toml
```

You can also run integration tests in `../legacy/packages/polycentric-core`.

### verifiers-server

`verifiers-server` is a separate service that uses `polycentric-server`. Clients are expected to directly use the verifier API to create claims about themselves (e.g. I own this YouTube channel). Clients request the `verifiers-server` to verify such a claim. If the claim is verified, `verifiers-server` will post polycentric events accordingly to `polycentric-server`.

Currently, only the legacy web client supports this feature on the frontend.