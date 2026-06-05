---
title: Running Your Own Server
sidebar_label: Running a Server
sidebar_position: 2
---

# Running Your Own Server

A Polycentric server is a single Rust binary. It listens on `0.0.0.0:3000` and
multiplexes three protocols on that one port:

- gRPC (HTTP/2 cleartext, h2c)
- gRPC-Web (for browser clients)
- plain HTTP (blob downloads and health checks)

It depends on two backing services:

- **PostgreSQL** — event and content metadata.
- **An S3-compatible object store** — blob bodies (images and other media). Any
  S3-compatible store, including AWS S3, works.

## Quick start (Docker Compose)

Requires `git`, `docker`, and Docker Compose v2.

```bash
git clone https://gitlab.futo.org/polycentric/polycentric.git
cd polycentric

# Build and start postgres, the object store, and the server.
docker compose up -d --build

# Apply the database schema.
docker compose run --rm server /app/migration fresh
```

The bundled `compose.yml` starts PostgreSQL, RustFS (with its `polycentric-blobs`
bucket created automatically), and the server. By default the server is published on
host port `3000`; override it with `POLYCENTRIC_SERVER_PORT`.

Confirm it is up:

```bash
curl http://localhost:3000/status   # -> OK.
```

Add the server to your profile in a Polycentric client to start using it.

## Running from source

To run the server without Docker (for development), you still need PostgreSQL and an
object store reachable — the simplest option is to start just those from the Compose
file. With the Rust toolchain installed:

```bash
# Start only the backing services.
docker compose up -d postgres rustfs rustfs-init

# Apply the schema, pointing at the local database.
cd services/server/migration
DATABASE_URL=postgres://postgres:testing@localhost:5432 cargo run -- fresh

# Run the server (reads the CONTENT_BLOB_OS_* and DATABASE_URL variables).
cargo run -p server
```

See [`services/server/README.md`](https://gitlab.futo.org/polycentric/polycentric/-/blob/develop/services/server/README.md)
for details.

## Configuration

The server is configured entirely through environment variables. On startup it also
loads a `.env` file from the working directory if one is present.

### Database

| Variable       | Default                                          | Description                  |
| -------------- | ------------------------------------------------ | ---------------------------- |
| `DATABASE_URL` | `postgres://postgres:testing@localhost:5432`     | PostgreSQL connection string |

### Object storage (blobs)

Blob bodies are written to an S3-compatible bucket.

| Variable                          | Default     | Description                                                              |
| --------------------------------- | ----------- | ------------------------------------------------------------------------ |
| `CONTENT_BLOB_OS_BUCKET`          | _(required)_ | Bucket name.                                                            |
| `CONTENT_BLOB_OS_REGION`          | `us-east-1` | Region.                                                                  |
| `CONTENT_BLOB_OS_ENDPOINT`        | _(unset)_   | Custom endpoint URL. Required for non-AWS stores such as RustFS.         |
| `CONTENT_BLOB_OS_FORCE_PATH_STYLE`| `false`     | Set to `true` for path-style addressing (required by RustFS and similar).|
| `CONTENT_BLOB_OS_ACCESS_KEY`      | _(unset)_   | Access key.                                                              |
| `CONTENT_BLOB_OS_SECRET_KEY`      | _(unset)_   | Secret key.                                                              |

When the access and secret keys are unset, the AWS SDK's default credential chain is
used (shared config files, environment, container/EC2 instance metadata). This lets
you run against AWS S3 without putting credentials in the environment directly.

### Other

| Variable            | Default                 | Description                                                                            |
| ------------------- | ----------------------- | -------------------------------------------------------------------------------------- |
| `CDN_URL`           | `http://localhost:3000` | Public base URL clients use to fetch blob bodies. Reported by `ServerService.GetInfo`. |
| `EXPO_ACCESS_TOKEN` | _(unset)_               | Optional. Access token for sending push notifications via Expo.                        |
| `RUST_LOG`          | _(unset)_               | Log filter, e.g. `info` or `debug`.                                                    |

`POLYCENTRIC_SERVER_PORT` is read by `compose.yml` to choose the published host port;
the server process itself always binds `3000` inside the container.

## Database migrations

Schema changes are applied with the `migration` binary, which ships in the same image.

```bash
# Drop all tables and reapply every migration (use for a fresh database).
docker compose run --rm server /app/migration fresh

# Apply only pending migrations (use when upgrading).
docker compose run --rm server /app/migration up

# Roll back the most recent migration.
docker compose run --rm server /app/migration down
```

## HTTP endpoints

Most traffic is gRPC, but a few plain-HTTP routes are served directly:

| Route                | Purpose                                                              |
| -------------------- | -------------------------------------------------------------------- |
| `GET /status`        | Health check. Returns `OK.`                                          |
| `GET /blob/{digest}` | Download a blob body by content digest (`{type}_{hex}`, e.g. `1_<sha256 hex>`). |
| `GET /docs`          | Live API browser generated from gRPC reflection.                     |

See [Protocol → gRPC](/protocol/grpc) for the gRPC services.

## TLS and production

The server speaks cleartext h2c and HTTP; it has no built-in TLS. For a public
deployment, terminate TLS at a reverse proxy in front of port `3000` and forward to
the server. The server already sends permissive CORS headers and enables gRPC-Web, so
browser clients can connect once TLS is in place.

Set `CDN_URL` to the public HTTPS URL of the server so clients fetch blobs over the
proxy.
