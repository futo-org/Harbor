# Push Notifications Service

Consumes the `notifications` Kafka topic produced by the server and delivers
push notifications through [Expo](https://docs.expo.dev/push-notifications/overview/).
It also serves the gRPC `NotificationService`, which clients call to register
and unregister device push tokens.

## Environment Variables

All service variables are read and validated once at startup by
`src/config.rs`. A `.env` file in the working directory is loaded first.

| Variable | Default | Description |
|---|---|---|
| `DATABASE_URL` | `postgres://postgres:testing@localhost:5432` | Postgres connection URL. |
| `POLYCENTRIC_NOTIFICATIONS_DATABASE_SCHEMA` | `notifications` | Postgres schema owning this service's tables. |
| `POLYCENTRIC_MAIN_SERVER` | _(required)_ | The server events must originate from for this service to fire notifications (prevents duplicates). |
| `POLYCENTRIC_QUERY_SERVERS` | _(required)_ | Comma-separated gRPC server URLs to fetch identity/profile data from. |
| `POLYCENTRIC_NOTIFICATIONS_GRPC_ADDR` | `0.0.0.0:3001` | Address the gRPC `NotificationService` listens on. |
| `EXPO_ACCESS_TOKEN` | _(unset)_ | Expo access token; blank is treated as unset. Only needed for projects with enhanced push security. |

The shared `services/common` crates additionally read the `POLYCENTRIC_KAFKA_*`
(broker/SASL/SSL) and `RUST_LOG`/`LOG_FORMAT`/`METRICS_PORT` (telemetry)
variables — see the table in
[`services/server/README.md`](../server/README.md#environment-variables).
