# Polycentric Server

## Prerequisites

- Rust (edition 2024)
- Docker (for PostgreSQL and RustFS (Object storage))

## Getting Started

### 1. Start PostgreSQL

```sh
# In the root of the repo.
docker compose up -d postgres kafka
```

This starts PostgreSQL on port 5432 with user `postgres` and password `testing`.

### 2. Run Migrations

```sh
cd migration
DATABASE_URL=postgres://postgres:testing@localhost:5432 cargo run -- fresh
```

### 3. Setup .env file

```sh
cp .env.example .env
```

### 4. Start the Server

```sh
cargo run -p server
```

The server listens on `0.0.0.0:3000`, multiplexing gRPC (h2c), gRPC-Web,
and plain HTTP routes on the same port.

The `DATABASE_URL` environment variable can be set to override the default connection string (`postgres://postgres:testing@localhost:5432`).

## Running Integration Tests

The integration tests run against a live server, so the server must be running first.

NOTE: not currently maintained.

```sh
# In one terminal, start the server
cargo run -p server

# In another terminal, run the tests
cargo test -p integration-tests
```

## Project Structure

```
protos/polycentric/v2/ - Protobuf definitions
services/server/
  src/            - Server source code
  entity/         - SeaORM entity models (shared by server and migration)
  migration/      - Database migrations
  tests/          - Integration tests (gRPC client tests)
```
