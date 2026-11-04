# @polycentric/rs-core-wasm

[rs-core](../rs-core/README.md) compiled to WebAssembly, with its TypeScript
bindings, for browsers and Node. Apps don't use it directly: they go through
[js-core](../js-core/README.md) (or
[`@polycentric/react-native`](../react-native/README.md) on the web), which
loads it and decides where the client runs.

## What's in it

| Export | |
|---|---|
| `.` (`src/index.web.ts`, or `dist/node` under Node) | the generated bindings plus `uniffiInitAsync()`, which loads the wasm |
| `./web` | the browser entry by name (Expo's server bundle would otherwise resolve the Node one); also `wasmUrl` |
| `./generated` | the generated TypeScript bindings alone, for types |
| `./polycentric_core.wasm` | the module itself |
| `./client-worker` | `CLIENT_WORKER_SOURCE`, the bundled source of the client worker, started from a Blob URL |
| `./client-worker-protocol` | the messages between tabs and the worker (types) |

### The client worker

`src/client-worker.ts` runs the whole Harbor client for every tab of an
origin: rs-core's engine, its SQLite database on OPFS, and the key cipher (a
non-extractable AES-GCM key in IndexedDB, so the database alone can't unseal
keys). js-core's web host starts it in the tab that holds the Web Lock and
talks to it over a BroadcastChannel: `call` messages run a `HarborClient`
method with record arguments, `subscribe`/`unsubscribe` stream query results,
client events are broadcast, and pending events stay in the worker as
handles. `ready` carries an epoch that changes when a new worker takes over.
`tools/bundle-client-worker.mjs` bundles it with esbuild into a string module,
so it works with any bundler (Metro included) without an extra asset.

Under Node the module reads and writes SQLite files through Node's `fs` (rs-core's
`sdk/storage/node_vfs.rs`); `tools/finish-node-build.mjs` fixes up the Node
build's ESM imports.

## Building

```sh
pnpm --filter @polycentric/rs-core-wasm build
```

This runs `ubrn build wasm2` (cargo for `wasm32-unknown-unknown` without
rs-core's default `native-transport` feature, then `wasm-bindgen`), compiles
the Node entry, and bundles the client worker. It needs `clang` (SQLite is
compiled to wasm) and the `wasm-bindgen` CLI matching the version pinned in
rs-core's `Cargo.toml`. Everything it produces (`src/generated/`, `dist/`) is
gitignored.
