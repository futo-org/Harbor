---

title: Project Structure
sidebar_label: Project Structure
sidebar_position: 2
---

# Project Structure

The [repository](https://code.futo.org/harbor/harbor) is a pnpm +
Cargo monorepo. Builds are orchestrated by [Turbo](https://turborepo.com), so
each package declares its own `build`, `test`, and `lint` tasks and the root
scripts fan out across them.

## Top level

| Path        | Contents                                                                                                                              |
| ----------- | ------------------------------------------------------------------------------------------------------------------------------------- |
| `apps/`     | End-user applications.                                                                                                                |
| `packages/` | Libraries and SDKs — the protocol core and its language bindings.                                                                     |
| `services/` | Server-side processes.                                                                                                                |
| `protos/`   | Protobuf definitions for the [Polycentric Protocol](../protocol/overview.md). The Rust and TypeScript types are generated from these. |
| `docs/`     | This documentation site (Docusaurus).                                                                                                 |
| `dev/`      | Developer tooling for testing                                                                                                         |

## Apps

| App           | Description                                                                   |
| ------------- | ----------------------------------------------------------------------------- |
| `apps/harbor` | The Harbor client — one Expo/React Native codebase for web, Android, and iOS. |

## Packages

| Package                 | Description                                                                                                                                                                                                                          |
| ----------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `packages/rs-core`      | The Harbor client SDK in Rust: protocol engine (event signing and validation, queries) plus local storage (SQLite), keys, the commit pipeline, sync, identities and pairing. Every other client package is a thin wrapper over this. |
| `packages/rs-common`    | Shared Rust code — protocol models and the generated protobuf types — used by `rs-core` and the services.                                                                                                                            |
| `packages/rs-core-wasm` | `uniffi-bindgen-react-native` bindings for `rs-core`: the shared TypeScript API, a WASM build for web and Node, and the web worker that runs the client for every tab.                                                               |
| `packages/react-native` | React Native SDK. The JSI TurboModule that wraps `rs-core` natively, and `js-core`'s web host on web.                                                                                                                                |
| `packages/js-core`      | TypeScript wrapper over `rs-core` (any binding), plus hosts for the browser (`@polycentric/js-core/web`) and Node (`@polycentric/js-core/node`).                                                                                     |
| `packages/kt-core`      | Kotlin wrapper over `rs-core` for Android, through UniFFI.                                                                                                                                                                           |

## Services

| Service                       | Description                                                                                                                                                         |
| ----------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `services/server`             | The Polycentric server: ingests events, serves feeds, search, and blobs. See [Running a Server](../guides/running-a-server.md).                                     |
| `services/moderation`         | Labels content pushed to FUTO-run servers and publishes a labelling feed other servers can poll.                                                                    |
| `services/push-notifications` | Consumes the server's `notifications` Kafka topic, delivers Expo push notifications, and serves the gRPC `NotificationService` clients register device tokens with. |
| `services/grayjay-migrator`   | Re-signs legacy (v1) Grayjay systems as Harbor identities and serves the legacy key to identity lookup.                                                             |
| `services/scraper`            | Fetches link metadata for link previews.                                                                                                                            |
| `services/verifier-bot`       | Verifies platform claims. See [Verifiers](../protocol/verifiers.md).                                                                                                |
| `services/common`             | Shared Rust crates for the services — `dotenv`, `kafka`, `object-store`, and `telemetry`.                                                                           |

## Generated code

Two kinds of generated artifacts are worth knowing about, because stale copies
cause confusing build failures:

- **Protobuf types** are generated from `protos/` at build time (`prost` and
  `tonic` for Rust). Clients don't use them directly: `rs-core`'s build turns
  the same protos into uniffi records, which reach TypeScript and Kotlin
  through the bindings below.
- **uniffi bindings** expose `rs-core` to TypeScript and Kotlin. None are
  committed: the React Native JSI bindings are generated into
  `packages/react-native/src/generated/rn/` and `cpp/generated/` (`pnpm
  generate`, which `pnpm build` runs), the wasm bindings into
  `packages/rs-core-wasm/src/generated/wasm/` (its build), and kt-core's Kotlin
  bindings by Gradle. In CI the wasm job generates the React Native ones and
  passes them on with the wasm build. If they look stale, see
  [Clearing stale build caches](./setup.md#clearing-stale-build-caches).
