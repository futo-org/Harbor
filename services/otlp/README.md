# OTLP Service

Receives OpenTelemetry logs and traces from Harbor clients over OTLP/HTTP
(JSON) and forwards them, re-encoded as OTLP protobuf since that is the only
encoding they accept, to [VictoriaLogs](https://docs.victoriametrics.com/victorialogs/data-ingestion/opentelemetry/)
and [VictoriaTraces](https://docs.victoriametrics.com/victoriatraces/data-ingestion/opentelemetry/).

Every request must carry the same bearer JWT clients mint for the server
(`createServerJwt` in js-core, with this service's public URL as the
audience). The service verifies the signature, audience and expiry, then checks
the signing key against the issuer's identity document fetched from a
polycentric server. The verified identity is written onto each payload's
resource as `harbor.auth.identity` and `harbor.auth.signing_key`, replacing
anything the client put there, so downstream queries can trust those fields.

| Route | Forwards to |
|---|---|
| `POST /v1/logs` | `$HARBOR_VICTORIA_LOGS_URL/insert/opentelemetry/v1/logs` |
| `POST /v1/traces` | `$HARBOR_VICTORIA_TRACES_URL/insert/opentelemetry/v1/traces` |
| `GET /status` | — |

Only `application/json` bodies are accepted. A signal whose upstream URL is
unset answers `503`. `app.feedback` and `app.error` spans are also mirrored
into VictoriaLogs as one record each (body: the feedback message or the
error's status message; the span's attributes plus `span.name`; the trace
id), so they can be listed and counted with LogsQL. Every `app.feedback`
span is also posted to a Zulip topic when the bot below is configured. Both
happen alongside the trace; a failure is logged, never returned. Logs are forwarded with `VL-Stream-Fields` naming
`service.name`, `service.version`, `deployment.environment.name` and
`os.name`, so VictoriaLogs keeps one stream per app build and platform
rather than one per user.

Request counts and latencies are exported as `http_server_requests` and
`http_server_request_duration_seconds` (by `method`, `route`, `status`) on
the shared `/metrics` port.

## Environment Variables

All service variables are read and validated once at startup by
`src/config.rs`. A `.env` file in the working directory is loaded first.

| Variable | Default | Description |
|---|---|---|
| `HARBOR_OTLP_ADDR` | `0.0.0.0:3003` | Address the HTTP listener binds. |
| `HARBOR_ALLOW_HOSTS` | _(required)_ | Comma-separated JWT audiences: the URLs clients address this service by. |
| `HARBOR_QUERY_SERVERS` | _(required)_ | Comma-separated gRPC server URLs to fetch identity documents from. |
| `HARBOR_VICTORIA_LOGS_URL` | _(unset)_ | VictoriaLogs base URL, e.g. `http://victorialogs:9428`. |
| `HARBOR_VICTORIA_TRACES_URL` | _(unset)_ | VictoriaTraces base URL, e.g. `http://victoriatraces:10428`. |
| `HARBOR_OTLP_MAX_BODY_BYTES` | `4194304` (4 MiB) | Largest accepted request body. |
| `HARBOR_OTLP_ZULIP_BOT_EMAIL` | _(unset)_ | Zulip bot that relays feedback; with `HARBOR_OTLP_ZULIP_BOT_API_KEY`, enables the relay. |
| `HARBOR_OTLP_ZULIP_BOT_API_KEY` | _(unset)_ | The bot's API key. |
| `HARBOR_OTLP_ZULIP_URL` | `https://zulip.futo.org` | Zulip server. |
| `HARBOR_OTLP_ZULIP_STREAM` | `harbor` | Channel feedback is posted to. |
| `HARBOR_OTLP_ZULIP_TOPIC` | `feedback` | Topic within the channel. |

Additionally various shared variables are read, see the table in
[`services/server/README.md`](../server/README.md#common-environment-variables).
