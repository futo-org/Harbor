---

title: Development Setup
sidebar_label: Setup
sidebar_position: 1
---

# Development Setup

This page covers building the monorepo and running the app against a local
server. To run a server for real use rather than for development, see
[Running a Server](../guides/running-a-server.md).

:::warning[Early stage]
Harbor is under active development. The setup below works, but expect rough
edges and occasional breaking changes on `develop`.
:::

## Prerequisites

| Tool                                                    | Notes                                                                                          |
| ------------------------------------------------------- | ---------------------------------------------------------------------------------------------- |
| [Node.js](https://nodejs.org)                           | Version pinned in `.nvmrc`; `nvm install` picks it up.                                         |
| [pnpm](https://pnpm.io)                                 | The workspace's package manager, version set in `package.json`.                                |
| [Rust toolchain](https://rustup.rs)                     | Builds `rs-core`, the server, and the WASM bindings.                                           |
| [`protoc`](https://github.com/protocolbuffers/protobuf) | Compiles the protobuf definitions in `protos/`.                                                |
| [JDK](https://adoptium.net) 17+                         | Only for working on `packages/kt-core`; the pre-commit hook formats its Kotlin through Gradle. |
| [Android SDK](https://developer.android.com/studio)     | Only for working on `packages/kt-core`; AGP needs it to configure the build.                   |
| [`docker compose`](https://github.com/docker/compose)   | Runs PostgreSQL, the object store, and the server.                                             |

System packages on Debian/Ubuntu:

```sh
apt-get install \
  protobuf-compiler \
  cmake \
  g++ \
  pkg-config \
  libssl-dev \
  libsasl2-dev
```

The web build compiles `rs-core` to WebAssembly, so add the WASM target and
the `wasm-bindgen` CLI. The CLI only accepts modules built against its own
version, so install the one `packages/rs-core/Cargo.toml` pins (the
`wasm-bindgen = "=<version>"` line):

```sh
rustup target add wasm32-unknown-unknown
cargo install wasm-bindgen-cli@<version>
```

Building or running the mobile app additionally needs the Android SDK/NDK, or
Xcode on macOS for iOS.

## Build the workspace

```sh
git clone https://code.futo.org/harbor/harbor.git
cd harbor

# Install the pinned Node.js version.
nvm install

# Install dependencies, generate bindings, and build every package.
pnpm install
pnpm generate
pnpm build

# Install the git pre-commit hooks (formatting and linting).
pnpm prepare
```

The React Native package's uniffi bindings are generated from `rs-core`.
`pnpm generate` builds `rs-core` for your machine and runs
`uniffi-bindgen-react-native` on it
(`packages/react-native/tools/generate-bindings.mjs`), so it needs only the
Rust toolchain, not the Android NDK or Xcode. Remember to re-generate after
changes to `rs-core`, or typechecking will fail.

`pnpm build` runs through [Turbo](https://turborepo.com) and covers the Rust
core, the generated uniffi bindings for React Native and web, and the JavaScript
packages. The first build compiles Rust from scratch and takes a while;
subsequent builds are cached.

## Run the backing services

```sh
# Build and start PostgreSQL, the object store, and the server.
docker compose up -d --build

# Apply the database schema (only needed on first run or after a schema change).
docker compose exec -T server /app/migration fresh
```

The server listens on `localhost:3000` by default, which is what the app's
default seed server list points at. See
[Running a Server](../guides/running-a-server.md) for configuration, migration
commands, and how to run the server from source instead of in Docker; the
[server README](https://code.futo.org/harbor/harbor/src/branch/develop/services/server/README.md)
covers its environment variables and integration tests.

If you use Podman, make sure `docker compose` resolves to Compose v2.

### On Kubernetes instead

The same services can run in a local [k3d](https://k3d.io) cluster the way
production runs them. `deploy/local/kubernetes` is a Flux environment laid
out like the harbor-ops repository (CloudNativePG, Strimzi, Valkey and
external-secrets from their pinned charts, each service from its chart in
`deploy/charts`), and [Tilt](https://tilt.dev) deploys it with images built
from this checkout. The tools (k3d, kubectl, Helm, Tilt, pnpm, and the Rust
toolchain for the wasm build) are pinned with [mise](https://mise.jdx.dev).

Run the stack and the JS dev servers in two terminals:

```sh
mise install

# Terminal 1: the cluster and the stack, in Tilt.
mise dev

# Terminal 2: build the JS workspace and run its dev servers, in turbo.
mise js
```

`mise dev` creates the one-node cluster (kube context `k3d-harbor`) if it
does not exist and runs Tilt in the foreground. Every service runs, including
the moderation service, whose identity the stack creates and publishes once
the server is up (the `harbor-moderation-identity` resource, in Tilt's
`setup` group). Rust changes rebuild the affected image from an incremental
dev build, so after the first build a change is redeployed in well under a
minute. Host ports are the same as with Compose. The Tilt UI on
`http://localhost:10350` has each resource's logs; `mise run tilt:status`
prints a table of their status.

`mise js` installs and builds the JS workspace (`pnpm build`, cached by
turbo, so only the first run is slow), then runs `pnpm dev` in turbo's
terminal UI: the library watchers, the docs site on `http://localhost:3004`
and Expo on `http://localhost:8081`. Select a task in the UI to see its
output, including Expo's QR code. The verifier bot and scraper are left out,
since the stack already runs them.

The wasm build of the Rust core is built once when `mise js` starts and is
not watched. After changing `packages/rs-core` or `packages/rs-common`, rebuild
it with `pnpm --filter @polycentric/rs-core-wasm build` (or restart its task in
turbo). The Android and iOS dev clients compile the Rust core into the app, so
a Rust change reaches them through `pnpm run:android` / `pnpm run:ios`.

Stop either terminal with Ctrl-C. Secrets such as the Azure keys go in
`deploy/local/.env`, which the stack mounts as the `harbor-dev-env` Secret.
`mise run tilt:down` removes the stack and `mise run k3d:down` the cluster;
both forget the moderation identity, since it was published to the server
they delete.

| Task                               | What it does                                                         |
| ---------------------------------- | -------------------------------------------------------------------- |
| `mise dev`                         | `k3d:up`, then `tilt:up`                                             |
| `mise js` (`js:dev`)               | `js:build`, then the JS dev servers in turbo                         |
| `mise run k3d:up` / `k3d:down`     | Create or delete the cluster                                         |
| `mise run tilt:up [-- resources…]` | Deploy the stack, or only the named resources and their dependencies |
| `mise run tilt:down`               | Remove the stack from the cluster                                    |
| `mise run tilt:status`             | Build and runtime status of each resource                            |
| `mise run js:install` / `js:build` | `pnpm install` / `pnpm build`                                        |

## Run the app

```sh
# Start the dev servers for every package that has one.
pnpm dev
```

With the stack on Kubernetes, use `mise js` instead: it builds the workspace
first and leaves out the services the stack already runs.

To start a single platform directly:

```sh
pnpm run:web      # Expo web on http://localhost:8081
pnpm run:android  # Build and install the Android dev client
pnpm run:ios      # Build and install the iOS dev client (macOS only)
```

Environment overrides — including which servers the client talks to — go in
`apps/harbor/.env`. Copy `apps/harbor/.env.example` and edit it; it documents
the seed server, notification, and verifier server lists.

## Tests, linting, and types

```sh
pnpm test         # Every package's test suite
pnpm lint         # Biome lint
pnpm format:fix   # Biome format, writing changes
```

Rust crates use the usual `cargo test` / `cargo fmt`. The app's TypeScript is
checked with `pnpm -C apps/harbor typecheck`.

`packages/kt-core` (Kotlin) is checked with
[ktlint](https://github.com/JLLeitschuh/ktlint-gradle) via its Gradle
wrapper. The pre-commit hook formats any staged `*.kt` file automatically
(this is what requires the JDK and Android SDK above when committing
kt-core changes); to run it manually:

```sh
cd packages/kt-core
./gradlew :core:ktlintFormat  # fix
./gradlew :core:ktlintCheck   # verify, same as CI
```

## Clearing stale build caches

Turbo's cache key does not track changes to installed dependencies, so after
switching branches or updating dependencies (for example a
`uniffi-bindgen-react-native` or `@ubjs/core` bump) `pnpm build` can restore a
stale cached output and fail with mismatched generated bindings — typically a
TypeScript error claiming two `Query` or `UniffiEnum` types "are unrelated".

Clear the cache and rebuild:

```sh
pnpm clean:cache
pnpm build
```

If the generated uniffi bindings themselves are stale rather than just their
cache, delete and regenerate them:

```sh
pnpm ubrn:clean
pnpm generate
pnpm build
```
