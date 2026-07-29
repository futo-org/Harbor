---
title: Self-hosting
sidebar_label: Self-hosting
sidebar_position: 3
---

# Self-hosting the verifier bot

The verifier bot lives at `services/verifier-bot` in the Harbor monorepo.

## With Docker Compose (local development)

The repo's root `compose.yml` includes a `verifier-bot` service built from
`services/verifier-bot/Dockerfile.dev`. That image is **self-contained**: it
builds every dependency from source (the Rust→wasm `rs-core-uniffi-web`, the JS
SDKs, and the bot), so no prebuilt artifacts are needed.

```bash
# from the repo root
cp services/verifier-bot/.env.example services/verifier-bot/.env   # then edit
docker compose up -d verifier-bot
```

The bot listens on port `3002` by default (`POLYCENTRIC_VERIFIER_BOT_PORT`).

## Production image

`services/verifier-bot/Dockerfile` is the production image built in CI. Unlike
the dev image, it consumes the `js-core` / `js-node` / `rs-core-uniffi-web`
`dist/` produced by the CI SDK jobs rather than building them. Both images
compile the bot with `tsc` and run it with `node dist/app.js` (no tsx at
runtime).

## Environment variables

All configuration is via environment variables prefixed with
`POLYCENTRIC_VERIFIER_BOT_`. Copy `services/verifier-bot/.env.example` to `.env`
and fill it in.

### Core

| Variable | Description |
|---|---|
| `POLYCENTRIC_VERIFIER_BOT_SERVERS` | Harbor server(s) to sync with. Comma-delimited for multiple. |
| `POLYCENTRIC_VERIFIER_BOT_DATABASE_URL` | Postgres connection string (`?schema=<name>` scopes the tables). Unset uses a local sqlite file under `./state`. |
| `POLYCENTRIC_VERIFIER_BOT_ALLOWED_ORIGINS` | Comma-delimited CORS allow-list. |
| `POLYCENTRIC_VERIFIER_BOT_ALLOWED_CALLBACKS` | Comma-delimited callback URL prefixes the OAuth callback may redirect to (native app deep links). |
| `POLYCENTRIC_VERIFIER_BOT_OAUTH_CALLBACK_DOMAIN` | Public base domain of this bot, used to build OAuth callback URLs. |
| `POLYCENTRIC_VERIFIER_BOT_PUPPETEER_EXECUTABLE_PATH` | Path to a Chrome/Chromium binary for the headless-browser verifiers (e.g. Kick). |
| `POLYCENTRIC_VERIFIER_BOT_PROFILE_NAME` | Display name published for the bot's identity on first run. |
| `POLYCENTRIC_VERIFIER_BOT_PROFILE_DESCRIPTION` | Profile description published alongside the name. |

### OAuth credentials

Only needed for the OAuth platforms you enable. Each is a
`_CLIENT_ID` / `_CLIENT_SECRET` pair (X uses `_API_KEY` / `_API_SECRET`):

- `POLYCENTRIC_VERIFIER_BOT_DISCORD_CLIENT_ID` / `_CLIENT_SECRET`
- `POLYCENTRIC_VERIFIER_BOT_X_API_KEY` / `_API_SECRET`
- `POLYCENTRIC_VERIFIER_BOT_SPOTIFY_CLIENT_ID` / `_CLIENT_SECRET`
- `POLYCENTRIC_VERIFIER_BOT_INSTAGRAM_CLIENT_ID` / `_CLIENT_SECRET`
- `POLYCENTRIC_VERIFIER_BOT_PATREON_CLIENT_ID` / `_CLIENT_SECRET`

`.env.example` is the authoritative, up-to-date list.
