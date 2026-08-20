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

| Tool                                                          | Notes                                                    |
| ------------------------------------------------------------- | -------------------------------------------------------- |
| [Node.js](https://nodejs.org)                                 | Version pinned in `.nvmrc`; `nvm install` picks it up.    |
| [pnpm](https://pnpm.io)                                       | The workspace's package manager, version set in `package.json`. |
| [Rust toolchain](https://rustup.rs)                           | Builds `rs-core`, the server, and the WASM bindings.     |
| [`protoc`](https://github.com/protocolbuffers/protobuf)       | Compiles the protobuf definitions in `protos/`.          |
| [`docker compose`](https://github.com/docker/compose)         | Runs PostgreSQL, the object store, and the server.       |

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

The web build compiles `rs-core` to WebAssembly, so add the WASM target:

```sh
rustup target add wasm32-unknown-unknown
```

Building or running the mobile app additionally needs the Android SDK/NDK, or
Xcode on macOS for iOS.

## Build the workspace

```sh
git clone https://gitlab.futo.org/polycentric/polycentric.git
cd polycentric

# Install the pinned Node.js version.
nvm install

# Install dependencies and build every package.
pnpm install
pnpm build

# Install the git pre-commit hooks (formatting and linting).
pnpm prepare
```

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
[server README](https://gitlab.futo.org/polycentric/polycentric/-/blob/develop/services/server/README.md)
covers its environment variables and integration tests.

If you use Podman, make sure `docker compose` resolves to Compose v2.

## Run the app

```sh
# Start the dev servers for every package that has one.
pnpm dev
```

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
cache, regenerate them:

```sh
pnpm ubrn:clean
pnpm build
```
