# Packages

Libraries and SDKs for the Polycentric protocol. One Rust engine does the
protocol work; every other package is either a binding over it, or an
interface that provides platform-specific storage primitives for those
bindings.

```mermaid
flowchart TD
  common[rs-common] --> core[rs-core]
  core -- "uniffi (wasm)" --> wasm[js-wasm]
  core -- "uniffi (JSI)" --> rn[react-native-sdk]
  core -- "uniffi (Kotlin)" --> kt[kotlin-sdk]
  wasm --> jscore[js-sdk]
  jscore --> idb[js-datastore-indexeddb]
  jscore --> opfs[js-filestore-opfs]
  jscore --> node[node-sdk]
  jscore --> rn
  sqlite[js-datastore-sqlite] --> node
  sqlite --> rn
  pg[js-datastore-postgres] --> node
  idb --> rn
  opfs --> rn
  wasm --> node
  wasm --> rn
```

Arrows point from a dependency to its dependants. Outside `packages/`,
`apps/harbor` uses `react-native-sdk`, `services/verifier-bot` uses `node-sdk`,
Android apps use `kotlin-sdk`, and the Rust services use `rs-common` or `rs-core`.

Each package's README covers its internals. The
[Project Structure](../docs/content/developer/project-structure.md) page
summarizes the function of each package.

## How a client is put together

`js-sdk` provides `PolycentricClient.create()`, which takes:

1. **`core`**: a `PolycentricCore` type from the UniFFI bindings generated around `rs-core`.
    - Web and Node use a wrapper around a WASM build at `js-wasm`.
    - React Native uses a wrapper around a JSI build at `react-native-sdk`.
    - Kotlin directly uses the UniFFI-generated Kotlin bindings of `rs-core`.
2. **`storageDriver`**: a database for persisting events and login/identity state.
    - React Native uses SQLite through `js-datastore-sqlite`
    - Web uses IndexedDB from `js-datastore-indexeddb`
    - Node uses either SQLite or Postgres through `js-datastore-sqlite` or `js-datastore-postgres`
    - Kotlin uses SQLite included in `kotlin-sdk`.
3. **`filestoreDriver`**: stores content blobs.
    - Web uses OPFS in `js-filestore-opfs`.
    - Node uses the file system provided by `node-sdk`.
    - React Native uses the file system provided by `react-native-sdk`.
    - Kotlin uses the file system provided by `kotlin-sdk`.

## Generated code

- Protobuf types are generated from `protos/`: `prost`/`tonic` in `rs-common`,
  `protobuf-ts` in `js-sdk`, and Wire in `kotlin-sdk`.
- uniffi bindings for `rs-core` are generated at build time and not
  committed: into `js-wasm/src/generated/` and into `react-native-sdk`
  (`pnpm generate`). `kotlin-sdk`'s Gradle build generates its own.
