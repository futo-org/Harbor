<p align="center">
<img alt="harborlogo" src="https://gitlab.futo.org/polycentric/polycentric/-/raw/develop/apps/polycentric/src/common/assets/images/harbor-logo-256.png?ref_type=heads" width="50">

</p>

<p align="center">
  <a href="https://docs.polycentric.io/">Docs</a> - <a href="https://gitlab.futo.org/polycentric">Code</a>
</p>

## Harbor is an open-source, distributed social network

[Harbor](https://harbor.social) is an open-source, distributed social network that lets you publish content to multiple servers. If you're censored on one server, your content remains accessible from other servers.

## Getting started

> :warning: **We're working on this.**

You will need:

- [Node.js](https://nodejs.org), version pinned in `.nvmrc`
- [pnpm](https://pnpm.io)
- [Rust toolchain](https://rustup.rs)
- [`protoc`](https://github.com/protocolbuffers/protobuf)
- [`docker compose`](https://github.com/docker/compose)

The following commands will get you up and running:

```sh
# Use node version manager to install the pinned version of node
nvm install

# Check you have the correct dependencies
apt-get install \
 protobuf-compiler \
 cmake \
 g++ \
 pkg-config \
 libssl-dev \
 libsasl2-dev

# Add the WASM target to the rust toolchain
rustup target add wasm32-unknown-unknown

# Build the frontend and core binaries
pnpm install
pnpm build

# Setup the git pre-commit hooks
pnpm prepare

# Start the server process
docker compose up -d --build

# Apply the database schema if it has changed
docker compose run --rm server /app/migration fresh

# Start the frontend dev server
pnpm dev
```

If you're using Podman, ensure `docker compose` resolves to Compose v2.

To run the server from source instead, see [`services/server/README.md`](services/server/README.md).

### Clearing stale build caches

Builds are cached by [Turbo](https://turborepo.com). The cache key does not
track changes to installed dependencies, so after switching branches or updating
deps (e.g. a `uniffi-bindgen-react-native` / `@ubjs/core` bump) `pnpm build` can
restore a stale cached output and fail with mismatched generated bindings — for
example a TypeScript error that two `Query` / `UniffiEnum` types "are unrelated".

If that happens, clear the build cache and rebuild:

```sh
pnpm clean:cache
pnpm build
```

If the generated uniffi bindings themselves are stale (not just their cache),
also regenerate them with `pnpm ubrn:clean` followed by `pnpm build`.

## Project Structure

### Packages

| Package                       | Description                                                            |
| ----------------------------- | ---------------------------------------------------------------------- |
| `packages/js-core`            | Core JavaScript library containing the main Polycentric protocol logic |
| `packages/js-browser`         | Browser SDK using SQLite WASM for local storage                        |
| `packages/js-node`            | Node.js SDK using sqlite3 for local storage                            |
| `packages/js-storage-sqlite`  | Shared SQLite (Drizzle ORM) storage layer for the JS SDKs              |
| `packages/react-native`       | React Native SDK for mobile applications                               |
| `packages/rs-common`          | Shared Rust code used by rs-core                                       |
| `packages/rs-core`            | Rust core library - the underlying protocol implementation             |
| `packages/rs-core-uniffi-web` | rs-core on WASM with `uniffi-bindgen-react-native` bindings            |

### Apps

| App                | Description                                                         |
| ------------------ | ------------------------------------------------------------------- |
| `apps/polycentric` | The main social network application (Expo/React Native) |

### Services

| Service                              | Description                                                       |
| ------------------------------------ | ----------------------------------------------------------------- |
| `services/server`                    | Polycentric server                                                |
| `legacy/services/polycentric-server` | Legacy server                                                     |
| `legacy/services/verifiers-server`   | Legacy Server for verifying claims and signatures in the protocol |
