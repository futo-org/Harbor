# Polycentric Core Rs

The Harbor client SDK in Rust. It holds everything a Harbor client does:

- the protocol engine (`api.rs` `PolycentricCore`): event validation, vector
  clocks, the query engine, gRPC transport;
- the SDK (`sdk/`): local storage on SQLite, key custody, the commit
  pipeline, sync and live sync, identities and logins, backups, pairing, and
  blobs.

Rust programs use `sdk::Client` directly. Other languages use the UniFFI
surface in `sdk/ffi.rs` (`HarborClient`), wrapped idiomatically by
`packages/js-core` (TypeScript, via wasm or the React Native TurboModule) and
`packages/kt-core` (Kotlin).

## Types across the FFI

`build.rs` runs `protoc` on the v2 protos and `build/records.rs` turns the
descriptors into UniFFI records (`src/records.rs`): a record per message, an
enum per proto enum and per oneof, with prost conversions. UniFFI then
generates the same types in every host language, so none defines them by hand.

Signed and hashed bytes never leave rs-core:

- `SignedEvent.event`, `SerializedContent.content` and
  `SerializedVerificationSchema.schema` are decoded views of the bytes on the
  wire. `SignedEvent.event` is only set when the signature verifies.
- Records carrying signed data have no record → prost conversion, so hosts
  can't hand them back. They refer to events by `EventKey`, to content by
  `ContentDigest`, and hold a `PendingEvent` between `prepare_event` and
  `commit_event`. New content is encoded once, by rs-core, and those bytes are
  what's hashed, signed, stored and sent. Schema digests are derived the same
  way.
- Backups and pairing sessions are created, read and checked here; hosts see
  backup text and `PairingInfo`.

## Keys at rest

Persistent storage requires a `KeyCipher`; private keys are stored sealed, and
keys older stores kept inline are sealed on open. Hosts implement the cipher
with their keystore (WebCrypto non-extractable key on the web, Android
Keystore in kt-core) or hold a 32-byte wrapping key somewhere safe and use
`aead_key_cipher` (ChaCha20-Poly1305; React Native keeps the key in
expo-secure-store, services in a secret).

## Storage per platform

| Platform | Database | Blobs |
|---|---|---|
| Native (Android, iOS, desktop) | SQLite file (bundled SQLite) | files in a directory |
| Browser | SQLite on OPFS. The whole client runs in one dedicated worker shared by every tab (`packages/rs-core-wasm/src/client-worker.ts`). | in the database |
| Node | SQLite file through Node's `fs` (`sdk/storage/node_vfs.rs`) | in the database |

The schema is the one the old JS and Kotlin storage drivers wrote, so their
databases open (and migrate) in place.

Builds are usually driven from the root `pnpm` workspace, but `cargo` or `just` can be used in this
directory to run workflows specific to `just`. Use `just` in the terminal to list the recipes.
Building for `wasm32-unknown-unknown` needs `clang` (SQLite is compiled to wasm).
