# Polycentric Core Rs

Rust core library for the Polycentric protocol (crate `polycentric-core`). It
holds an in-memory replica of events, validates and signs them, syncs them with
servers over gRPC, and runs cached multi-server queries. The same crate is
compiled to native libraries (iOS/Android/desktop) and to WASM (web/Node), and
exposed to TypeScript and Kotlin through [uniffi](https://mozilla.github.io/uniffi-rs/).

Protocol types (protobuf models, signing, identity chains, validation rules) live
in `packages/rust/rs-common` (`polycentric-common`), which is shared with the
server/services.

The bindings and the higher-level clients (`js-sdk`, `kotlin-sdk`) manage
storeage/persistence, key storage, and signing. rs-core asks for signatures through
`SignBytesCallback` and never holds private keys.

## Development

`build.rs` expects the repo's `protos/` directory at `../../protos`.

Builds are usually driven from the root `pnpm` workspace, but `cargo` or `just` can be used in this
directory to run specific workflows.

## Docs
See our docs for more info:

- [Protocol overview](https://join.harbor.social/docs/protocol/overview)
- [Data model](https://join.harbor.social/docs/protocol/data-model)
- [Feed paging](https://join.harbor.social/docs/developer/feed-paging)
- [Live sync](https://join.harbor.social/docs/developer/live-sync)
- [gRPC API](https://join.harbor.social/docs/protocol/grpc)
- [Project structure](https://join.harbor.social/docs/developer/project-structure)
