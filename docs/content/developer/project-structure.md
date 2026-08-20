---
title: Project Structure
sidebar_label: Project Structure
sidebar_position: 2
---

# Project Structure

The [repository](https://gitlab.futo.org/polycentric/polycentric) is a pnpm +
Cargo monorepo. Builds are orchestrated by [Turbo](https://turborepo.com), so
each package declares its own `build`, `test`, and `lint` tasks and the root
scripts fan out across them.

## Top level

| Path        | Contents                                                                                  |
| ----------- | ----------------------------------------------------------------------------------------- |
| `apps/`     | End-user applications.                                                                    |
| `packages/` | Libraries and SDKs — the protocol core and its language bindings.                          |
| `services/` | Server-side processes.                                                                    |
| `protos/`   | Protobuf definitions for the [Polycentric Protocol](../protocol/overview.md). The Rust and TypeScript types are generated from these. |
| `docs/`     | This documentation site (Docusaurus).                                                     |

## Apps

| App           | Description                                                     |
| ------------- | --------------------------------------------------------------- |
| `apps/harbor` | The Harbor client — one Expo/React Native codebase for web, Android, and iOS. |

## Packages

| Package                       | Description                                                                                  |
| ----------------------------- | -------------------------------------------------------------------------------------------- |
| `packages/rs-core`            | The Rust protocol core: event signing and validation, queries, sync, and the local store. Everything else is a binding over this. |
| `packages/rs-common`          | Shared Rust code — protocol models and the generated protobuf types — used by `rs-core` and the services. |
| `packages/rs-core-uniffi-web` | `rs-core` compiled to WASM with `uniffi-bindgen-react-native` bindings, for the web build.    |
| `packages/react-native`       | React Native SDK. Wraps `rs-core` through uniffi (native) or the WASM build (web).            |
| `packages/js-core`            | Core JavaScript library holding the protocol logic and generated protobuf types.               |
| `packages/js-browser`         | Browser SDK, storing data in SQLite WASM.                                                     |
| `packages/js-node`            | Node.js SDK, storing data in sqlite3.                                                         |
| `packages/js-storage-sqlite`  | Shared SQLite storage layer (Drizzle ORM) behind the JS SDKs.                                  |
| `packages/js-storage-postgres` | PostgreSQL storage layer, used by the Node.js SDK.                                             |

## Services

| Service                       | Description                                                                                     |
| ----------------------------- | ----------------------------------------------------------------------------------------------- |
| `services/server`             | The Polycentric server: ingests events, serves feeds, search, and blobs. See [Running a Server](../guides/running-a-server.md). |
| `services/moderation`         | Labels content pushed to FUTO-run servers and publishes a labelling feed other servers can poll. |
| `services/push-notifications` | Consumes the server's `notifications` Kafka topic, delivers Expo push notifications, and serves the gRPC `NotificationService` clients register device tokens with. |
| `services/scraper`            | Fetches link metadata for link previews.                                                        |
| `services/verifier-bot`       | Verifies platform claims. See [Verifiers](../protocol/verifiers.md).                             |
| `services/common`             | Shared Rust crates for the services — `dotenv`, `kafka`, `object-store`, and `telemetry`.       |

## Generated code

Two kinds of generated artifacts are worth knowing about, because stale copies
cause confusing build failures:

- **Protobuf types** are generated from `protos/` at build time (`prost` and
  `tonic` for Rust, `protobuf-ts` for TypeScript).
- **uniffi bindings** expose `rs-core` to TypeScript. The React Native bindings
  are committed under `packages/react-native/src/generated/`; the web bindings
  are built into `packages/rs-core-uniffi-web/dist/`. Regenerate them with
  `pnpm ubrn:clean && pnpm build` — see
  [Clearing stale build caches](./setup.md#clearing-stale-build-caches).
