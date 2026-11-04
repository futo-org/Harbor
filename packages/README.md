# packages

Harbor's client libraries. One Rust core does the work; everything else
exposes it to a language or platform.

```
                 protos/ (the protocol)
                        │
                 rs-common (Rust: protocol types and rules; also used by the services)
                        │
                 rs-core (Rust: the Harbor client SDK)
          ┌─────────────┼───────────────────────┐
     UniFFI Kotlin   uniffi-bindgen-react-native (TypeScript)
          │             │                       │
       kt-core     rs-core-wasm (wasm)    react-native (native TurboModule)
                        │                       │
                     js-core ◀──────────────────┘
                        │
                 apps/harbor, e2e
```

| Package | Language | Responsibility |
|---|---|---|
| [`rs-common`](rs-common/README.md) | Rust | The protocol itself: protobuf types, validation, signing, JWTs, Merkle proofs, aliases. Shared with the server and services. No client behaviour. |
| [`rs-core`](rs-core/README.md) | Rust | **Everything a Harbor client does**: the protocol engine and queries, local storage (SQLite), keys (sealed at rest), publishing, sync, identities and logins, backups, pairing, blobs. Exposes it all through one UniFFI API (`HarborClient`) whose data types are generated from the protos. Rust programs (e.g. `services/verifier-bot`) use its `sdk::Client` directly. |
| [`rs-core-wasm`](rs-core-wasm/README.md) | Rust → wasm, TypeScript | rs-core built for browsers and Node, with its TypeScript bindings, and the web worker that runs one client for every tab. |
| [`js-core`](js-core/README.md) | TypeScript | The client for JavaScript: an async `PolycentricClient` over rs-core, with hosts for the browser (the shared worker) and Node. |
| [`react-native`](react-native/README.md) | TypeScript, C++ | The client for React Native/Expo apps: rs-core built natively behind a TurboModule (iOS, Android), js-core on top, and the web build through rs-core-wasm. |
| [`kt-core`](kt-core/README.md) | Kotlin | The client for Android and the JVM: a coroutine/`Flow` facade over rs-core's Kotlin bindings, with an Android Keystore key cipher. |

## Principles

- **rs-core owns behaviour.** The wrappers (js-core, react-native, kt-core)
  only make rs-core idiomatic in their language and pick where it runs; no
  protocol logic lives in them.
- **Types are generated once.** rs-core turns the protos into UniFFI records,
  and the bindings generators produce the same types in TypeScript and
  Kotlin. Nobody writes them by hand.
- **Signed bytes never leave rs-core.** Hosts see decoded records
  (`SignedEvent.event` only when its signature verifies), refer to events by
  `EventKey` and content by `ContentDigest`, and rs-core encodes, hashes and
  signs.
- **Keys are sealed at rest.** Persistent storage requires a key cipher; each
  host supplies one from its platform keystore.

## Building

Code generated from rs-core (uniffi bindings and the React Native
TurboModule glue) isn't committed. After a checkout, run `pnpm install` then
`pnpm generate` at the root to produce it.

From the repository root, `pnpm build` builds the TypeScript packages and
their prerequisites through turbo (including the wasm build, which needs a
Rust toolchain with the `wasm32-unknown-unknown` target, `clang`, and the
pinned `wasm-bindgen` CLI). The native React Native and Kotlin builds are run
per package; see their READMEs.
