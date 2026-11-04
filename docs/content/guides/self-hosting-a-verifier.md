---

title: Host a Verifier Bot
sidebar_label: Host a Verifier Bot
sidebar_position: 2
---

# Host a Verifier Bot

The verifier bot lives at `services/verifier-bot` in the Harbor monorepo. It
is a Rust service (the `verifier-bot` crate) built on `rs-core`: it keeps its
Harbor identity and events in a SQLite file and publishes verifications as
that identity.

To run it straight from a checkout:

```bash
cp services/verifier-bot/.env.example services/verifier-bot/.env   # then edit
cd services/verifier-bot && cargo run --release
```

## With Docker Compose (local development)

The repo's root `compose.yml` includes a `verifier-bot` service built from
`services/verifier-bot/Dockerfile.dev`. That image is **self-contained**: it
builds the bot from source, so no prebuilt artifacts are needed. The bot's
database lives in the `verifier-bot-state` volume.

```bash
# from the repo root
cp services/verifier-bot/.env.example services/verifier-bot/.env   # then edit
docker compose up -d verifier-bot
```

The bot listens on port `3002` (`PORT` inside the container;
`HARBOR_VERIFIER_BOT_PORT` picks the host port in Compose).

## Production image

`services/verifier-bot/Dockerfile` is the production image. CI builds the
release binary outside Docker (with the other Rust services) and only the
runtime stage, Debian slim with Chromium for the headless-browser verifiers,
builds in the image job. Built on its own, the Dockerfile compiles the bot with
cargo-chef. The image runs as uid `10001` with its database in `/app/state`;
mount a volume there. The Helm chart (`deploy/charts/harbor-verifier-bot`)
takes the key encryption key from a Secret (`keyEncryptionKey.secretName`) and
can create the volume (`persistence.enabled`).

## Environment variables

All configuration is via environment variables prefixed with
`HARBOR_VERIFIER_BOT_`. Copy `services/verifier-bot/.env.example` to `.env` and
fill it in.

### Core

| Variable                                            | Description                                                                                                                                                                                                                                    |
| --------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `HARBOR_VERIFIER_BOT_SERVERS`                       | Harbor server(s) to sync with. Comma-delimited for multiple.                                                                                                                                                                                   |
| `HARBOR_VERIFIER_BOT_DATABASE_PATH`                 | SQLite file holding the bot's identity and events. Defaults to `./state/polycentric.db`; keep it on a volume so the identity survives restarts.                                                                                                |
| `HARBOR_VERIFIER_BOT_KEY_ENCRYPTION_KEY`            | **Required.** 32 bytes as 64 hex characters (`openssl rand -hex 32`). Seals the bot's private key in the database. Keep it in a secret store: losing or changing it makes the stored identity unreadable. The bot refuses to start without it. |
| `HARBOR_VERIFIER_BOT_DATABASE_URL`                  | Legacy: Postgres the bot used to keep its state in (`?schema=<name>` scopes the tables). When set, the bot imports its identity from there on each start, so deployments without a volume keep working.                                        |
| `HARBOR_VERIFIER_BOT_ALLOWED_ORIGINS`               | Comma-delimited CORS allow-list.                                                                                                                                                                                                               |
| `HARBOR_VERIFIER_BOT_ALLOWED_CALLBACKS`             | Comma-delimited callback URL prefixes the OAuth callback may redirect to (native app deep links).                                                                                                                                              |
| `HARBOR_VERIFIER_BOT_OAUTH_CALLBACK_DOMAIN`         | Public base domain of this bot, used to build OAuth callback URLs.                                                                                                                                                                             |
| `HARBOR_VERIFIER_BOT_CHROME_EXECUTABLE_PATH`        | Chrome/Chromium for the headless-browser verifiers (Kick, Rumble). Unset searches the usual install locations. The older `HARBOR_VERIFIER_BOT_PUPPETEER_EXECUTABLE_PATH` is still read as a fallback.                                          |
| `HARBOR_VERIFIER_BOT_PROFILE_NAME`                  | Display name published for the bot's identity on first run.                                                                                                                                                                                    |
| `HARBOR_VERIFIER_BOT_PROFILE_DESCRIPTION`           | Profile description published alongside the name.                                                                                                                                                                                              |
| `HARBOR_VERIFIER_BOT_HEALTH_CHECK_INTERVAL_SECONDS` | How often every platform's health check runs (default `900`). `0` disables the loop.                                                                                                                                                           |
| `PORT`                                              | Port the HTTP API and `/metrics` listen on (default `3002`).                                                                                                                                                                                   |
| `RUST_LOG`                                          | Log filter (default `info`). Logs are JSON when stdout isn't a terminal; `HARBOR_LOG_FORMAT` (`json` or `text`) overrides.                                                                                                                     |

### OAuth credentials

Only needed for the OAuth platforms you enable. Each is a
`_CLIENT_ID` / `_CLIENT_SECRET` pair (X uses `_API_KEY` / `_API_SECRET`);
empty values count as unset:

- `HARBOR_VERIFIER_BOT_DISCORD_CLIENT_ID` / `_CLIENT_SECRET`
- `HARBOR_VERIFIER_BOT_X_API_KEY` / `_API_SECRET`
- `HARBOR_VERIFIER_BOT_SPOTIFY_CLIENT_ID` / `_CLIENT_SECRET`
- `HARBOR_VERIFIER_BOT_INSTAGRAM_CLIENT_ID` / `_CLIENT_SECRET`
- `HARBOR_VERIFIER_BOT_PATREON_CLIENT_ID` / `_CLIENT_SECRET`

`.env.example` is the authoritative, up-to-date list.

## Metrics and health checks

`GET /metrics` serves Prometheus metrics, all prefixed `verifier_bot_` (plus
the standard `process_*` metrics), every series labelled
`service="verifier-bot"`:

| Metric                                                                | Labels                            | Meaning                                                                                                                                                            |
| --------------------------------------------------------------------- | --------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `verifier_bot_http_requests_total` / `_http_request_duration_seconds` | `platform`, `endpoint`, `status`  | Requests by platform route and endpoint (`verify`, `check`, `url`, `token`, `health-check`, ...).                                                                  |
| `verifier_bot_verifications_total` / `_verification_duration_seconds` | `platform`, `verifier`, `outcome` | Verify requests. `outcome` is `ok`, `rejected` (token not found), `bad_request`, `claim_fetch_failed`, `schema_mismatch`, `platform_mismatch` or `publish_failed`. |
| `verifier_bot_health_checks_total` / `_health_check_duration_seconds` | `platform`, `verifier`, `outcome` | Health check runs, `ok` / `failed` / `error`.                                                                                                                      |
| `verifier_bot_health_check_up`                                        | `platform`, `verifier`            | `1` when the platform's last health check passed.                                                                                                                  |
| `verifier_bot_health_check_last_success_timestamp_seconds`            | `platform`, `verifier`            | When the platform last passed.                                                                                                                                     |
| `verifier_bot_oauth_sessions_pending`                                 |                                   | OAuth sign-ins started but not yet called back.                                                                                                                    |

Every verifier's health check runs on boot and then every
`HARBOR_VERIFIER_BOT_HEALTH_CHECK_INTERVAL_SECONDS`. Text verifiers fetch
a known profile and parse a known URL; OAuth verifiers confirm their
credentials are set. `GET /platforms/<slug>/<type>/health-check` runs one on
demand and records it the same way. The Harbor Grafana dashboard for these
lives in `harbor-o11y` (`dashboards/harbor-verifier-bot.json`).
