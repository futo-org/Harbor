---
title: Running Your Own Server
sidebar_label: Running a Server
sidebar_position: 2
---

# Running Your Own Server

A Harbor server is a single Rust binary. It listens on `0.0.0.0:3000` and
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
docker compose exec -T server /app/migration fresh
```

The bundled `compose.yml` starts PostgreSQL, RustFS (with its `polycentric-blobs`
bucket created automatically), and the server. By default the server is published on
host port `3000`; override it with `POLYCENTRIC_SERVER_PORT`.

Confirm it is up:

```bash
curl http://localhost:3000/status   # -> OK.
```

Add the server to your profile in a Harbor client to start using it.

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

### Server

| Variable                          | Default                    | Description                                                                              |
| --------------------------------- | -------------------------- | ---------------------------------------------------------------------------------------- |
| `POLYCENTRIC_SERVER_NAME`         | `http://localhost:3000`    | Canonical URL of this server. Stamped as the source on the events it produces.           |
| `POLYCENTRIC_ALLOW_HOSTS`         | `POLYCENTRIC_SERVER_NAME`  | Hosts clients may address this server as, comma-delimited — the audiences accepted on auth tokens. |
| `CDN_URL`                         | `http://localhost:3000`    | Public base URL clients use to fetch blob bodies. Reported by `ServerService.GetInfo`.   |
| `POLYCENTRIC_SCRAPER_URL`         | `http://localhost:8855`    | Base URL of the internal scraper service (link-preview metadata and image proxy).        |
| `POLYCENTRIC_MODERATION_IDENTITY` | _(unset)_                  | Hex identity of the trusted moderation service — see [Content moderation](#content-moderation--removal). |

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

### Kafka

The server produces events to Kafka, and its background workers consume them.

| Variable                                   | Default          | Description                                     |
| ------------------------------------------ | ---------------- | ------------------------------------------------ |
| `POLYCENTRIC_KAFKA_BROKERS`                | `localhost:9092` | Bootstrap servers.                               |
| `POLYCENTRIC_KAFKA_CLUSTER_ID`             | _(unset)_        | Prefix for topics and group ids (`{id}.{name}`). |
| `POLYCENTRIC_KAFKA_SECURITY_PROTOCOL`      | `PLAINTEXT`      | Kafka `security.protocol`.                       |
| `POLYCENTRIC_KAFKA_SASL_MECHANISM`         | _(unset)_        | SASL mechanism, e.g. `SCRAM-SHA-256`.            |
| `POLYCENTRIC_KAFKA_SASL_USERNAME`          | _(unset)_        | SASL username.                                   |
| `POLYCENTRIC_KAFKA_SASL_PASSWORD`          | _(unset)_        | SASL password.                                   |
| `POLYCENTRIC_KAFKA_SSL_CA`                 | _(unset)_        | CA certificate, inline PEM.                      |
| `POLYCENTRIC_KAFKA_SSL_CERTIFICATE`        | _(unset)_        | Client certificate, inline PEM.                  |
| `POLYCENTRIC_KAFKA_SSL_KEY`                | _(unset)_        | Client key, inline PEM.                          |
| `POLYCENTRIC_KAFKA_BROKER_ADDRESS_FAMILY`  | `any`            | Kafka `broker.address.family`.                   |
| `POLYCENTRIC_KAFKA_AUTO_OFFSET_RESET`      | `latest`         | Consumer `auto.offset.reset` (workers only).     |

### Logging and metrics

| Variable       | Default   | Description                                                          |
| -------------- | --------- | --------------------------------------------------------------------- |
| `RUST_LOG`     | `info`    | Log filter, e.g. `info` or `debug`.                                  |
| `LOG_FORMAT`   | _(auto)_  | `json` or `text`; defaults to text on a terminal, JSON otherwise.    |
| `METRICS_PORT` | `9464`    | Port serving Prometheus `GET /metrics`.                              |

The companion services (moderation, push notifications, scraper) are configured the
same way; their variables are listed in each service's README under
[`services/`](https://gitlab.futo.org/polycentric/polycentric/-/tree/develop/services).

`POLYCENTRIC_SERVER_PORT` is read by `compose.yml` to choose the published host port;
the server process itself always binds `3000` inside the container.

## Database migrations

Schema changes are applied with the `migration` binary, which can be used from the same image.

```bash
# Drop all tables and reapply every migration (use for a fresh database).
docker compose exec -T server /app/migration fresh

# Apply only pending migrations (use when upgrading).
docker compose exec -T server /app/migration up

# Roll back the most recent migration.
docker compose exec -T server /app/migration down

# Show which migrations are applied.
docker compose exec -T server /app/migration status
```

## HTTP endpoints

Most traffic is gRPC, but a few plain-HTTP routes are served directly:

| Route                | Purpose                                                              |
| -------------------- | -------------------------------------------------------------------- |
| `GET /status`        | Health check. Returns `OK.`                                          |
| `GET /blob/{digest}` | Download a blob body by content digest (`{type}_{hex}`, e.g. `1_<sha256 hex>`). |
| `GET /docs`          | Live API browser generated from gRPC reflection.                     |

See [Protocol → gRPC](./protocol/grpc.md) for the gRPC services.

## Content moderation & removal

Moderation on Harbor is per-server: each server decides what it serves and
curates its own discovery feeds, while signed content stays reachable from other
servers.

The server stores blob bodies (images and other media) in the object store, and
never truly deletes them. A [`Delete`](./protocol/data-model.md#delete) event
acts as a *tombstone*: clients stop showing the content, but the blob bytes
remain in the object store.

Removing blob bodies can be done by a separate moderation service. FUTO runs
one, and you can
[run your own](https://gitlab.futo.org/polycentric/polycentric/-/blob/develop/services/moderation/README.md).
It scans images (for example, matching against PhotoDNA to detect known CSAM),
deletes matching blobs directly from the object store, and publishes a
[`Report`](./protocol/data-model.md#report) event recording the violation. Because it
deletes objects, the moderation service's `CONTENT_BLOB_OS_*` credentials need
delete permission on the bucket, while the server's own credentials do not.

### Moderation labels
Beyond blob deletion and `Report` events, the moderation service can also
**label** content by publishing a `Labels` event (collection 7, defined in
[protocol → Labels](./protocol/data-model.md#labels)). A label is a string
identifying the kind of violation detected — the vocabulary used by FUTO's
service is `hate`, `self-harm`, `sexually-suggestive`, `sexually-explicit`, and `violence`.

#### Trusting a moderation service
Set the **single** moderation service the server trusts via an environment
variable `POLYCENTRIC_MODERATION_IDENTITY`. It should be equal to the hex
identity string of the trusted moderation service. Until the identity is
set, clients will not be served label events alongside the feed events
such that they can filter locally, nor will the labels they wish to omit
be actually omitted by the server during feed requests.

#### Client filtering contract

Clients control what labeled content they see through per-request filters.
Each user picks a level per label — Hide, Warn, or Show — stored on the
device.

- **Hide**: the client sends the label value(s) to omit via the `omit_labels`
  field on `GetIdentityFeedRequest`, `GetFollowingFeedRequest`, and
  `GetExploreFeedRequest`. The server drops matching rows **before**
  pagination, so pages stay full.
- **Warn / Show**: the label is left out of `omit_labels`. The post appears in
  the feed, and the matching `Labels` event is returned in the response's
  `event_hints` collection. The client correlates each label to its target by
  event key and renders it behind a mask (Warn) or without annotation (Show).

The labeler's identity is visible to clients — the raw trusted `Labels` events
are served as-is.

#### What gets labeled

The moderation service inspects:

- **Post content**: text, link-preview URLs, and attached images.
- **Profile content**: name, description, avatar, and banner.

The `Labels` event always target a post or profile event, and indirectly
target any media or blob linked to that event.

#### Labels from moderator reports

Labels are also published in response to
[`Report`](./protocol/data-model.md#report) events, but only when the report was
signed by an identity the moderation service recognises as a moderator. Those
identities live in the `moderator` table in the moderation service's own
Postgres schema (`moderation` by default), so each service decides who it
listens to. This list is separate from a server's moderator list. The two
moderator lists may overlap, but neither is derived from the other.

Currently there is no admin UI to add moderators, so you must add them
directly to the database using SQL:

```sql
INSERT INTO moderation.moderator (identity, created_at, updated_at)
VALUES ('<hex identity>', now(), now())
ON CONFLICT (identity) DO NOTHING;
```

Note that removing a moderator (deleting the row) will not remove the label
events that have been signed for that moderator's reports.

Conveniently, if the moderation service shares a database with a server, you
can seed the list from that server's moderators:

```sql
INSERT INTO moderation.moderator (identity, created_at, updated_at)
SELECT identity, now(), now() FROM public.moderator
ON CONFLICT (identity) DO NOTHING;
```

Report categories must correspond to a label value to produce a label event.
This correspondence is as follows:

| Report category | Label |
|---|---|
| `REPORT_CATEGORY_HATE` | `hate` |
| `REPORT_CATEGORY_SELF_HARM` | `self-harm` |
| `REPORT_CATEGORY_SEXUALLY_EXPLICIT` | `sexually-explicit` |
| `REPORT_CATEGORY_VIOLENCE` | `violence` |

All other reports will not produce a label. The `sexually-suggestive` label
is also deliberately not reportable, as the confusion between suggestive/explicit
would be a burden on moderator time. Only automated scoring makes the distinction
between explicit/suggestive.

#### Changing the trusted service
Any identity can sign label events for any content, even if the server only
trusts one identity. The server stores all such label events. Thus, setting a
new `POLYCENTRIC_MODERATION_IDENTITY` will instantly update the moderation
labels served. Following requests will only serve the labels the server has
stored that match the trusted identity.

## TLS and production

The server speaks cleartext h2c and HTTP; it has no built-in TLS. For a public
deployment, terminate TLS at a reverse proxy in front of port `3000` and forward to
the server. The server already sends permissive CORS headers and enables gRPC-Web, so
browser clients can connect once TLS is in place.

Set `CDN_URL` to the public HTTPS URL of the server so clients fetch blobs over the
proxy.
