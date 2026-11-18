# @polycentric/js-core

TypeScript client for the Polycentric protocol. This wraps around the Rust core
`@polycentric/rs-core`, which handles protocol work (Event signing, validation, identity resolution,
queries, gRPC transport, etc.) On top of the `rs-core` responsibilities, this package manages
login/identity and pairing sessions, and delegates platform storage and file access to external
packages under the `@polycentric` namespace:
- `@polycentric/js-browser`
- `@polycentric/js-node`
- `@polycentric/react-native`
- `@polycentric/js-storage-sqlite`
- `@polycentric/js-storage-postgres`

## Protobuf types

`src/proto/` is generated. Do not edit it. Note that the current definitions are under `v2`
namespace; the legacy `polycentric.proto` types are under `v1`.

## Docs
See our docs for more info:

- [Examples](https://join.harbor.social/docs/developer/examples): creating a client and identity, publishing and reading content
- [Project structure](https://join.harbor.social/docs/developer/project-structure)
- [Declaring your application](https://join.harbor.social/docs/developer/declaring-your-application)
- [Live sync](https://join.harbor.social/docs/developer/live-sync)
- [Submitting events](https://join.harbor.social/docs/developer/submitting-events)
- [Data model](https://join.harbor.social/docs/protocol/data-model)
