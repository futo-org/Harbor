# rs-common (`polycentric-common`)

Shared Rust code for the Polycentric protocol, for both clients and servers. Includes the protobuf
data types, validation, identity chains, merkle proofs, signatures, and mention parsing.

## Protos

`build.rs` compiles the protos in the repo-root `protos/` directory into
`OUT_DIR`. Note that any new v2 proto file must be added to the list in
`build.rs`. Don't edit the generated code; put behaviour in a `models/`
submodule instead.

## Features

- `transport`: enables tonic's `transport` feature, so the generated v2 gRPC
  clients/servers include transport code. Used by the server test crates.
- `uniffi`: derives `uniffi::Enum` on the validation error enums (exported
  as `<Type>ValidationError`, e.g. `PostValidationError`) and calls
  `uniffi::setup_scaffolding!()` in `lib.rs`.

## Docs
See our docs for more info:

- [Data model](https://join.harbor.social/docs/protocol/data-model)
- [Submitting events](https://join.harbor.social/docs/developer/submitting-events): the validation rules applied to events
- [Verifiers](https://join.harbor.social/docs/protocol/verifiers)
- [Server authentication](https://join.harbor.social/docs/protocol/server-auth)
