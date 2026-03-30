<p align="center">
<img alt="posthoglogo" src="https://gitlab.futo.org/polycentric/docs/-/raw/main/docs/static/logo.png?ref_type=heads" width="50">

</p>

<p align="center">
  <a href="https://docs.polycentric.io/">Docs</a> - <a href="https://gitlab.futo.org/polycentric">Code</a>
</p>

## Polycentric is an open-source, distributed social network

[Polycentric](https://polycentric.io) is an open-source, distributed social network that lets you publish content to multiple servers. If you're censored on one server, your content remains accessible from other servers.

## Getting started

> :warning: **We're working on this.**

You will need [just](https://github.com/casey/just), Docker, and pnpm.

1. **Build rs-core for all platforms:** `just packages/rs-core/build-all`
2. **Install dependencies:** `pnpm install`
3. **Run the app:** `pnpm:run web`, `pnpm run:ios`, or `pnpm run:android`

## Development

- `pnpm dev` builds all SDKs in watch mode.

## Project Structure

### Packages

| Package | Description |
|---------|-------------|
| `packages/js-core` | Core JavaScript library containing the main Polycentric protocol logic |
| `packages/js-browser` | Browser SDK using SQLite WASM for local storage |
| `packages/js-node` | Node.js SDK using sqlite3 for local storage |
| `packages/react-native` | React Native SDK for mobile applications |
| `packages/rs-core` | Rust core library - the underlying protocol implementation |
| `packages/rs-core-wasm-browser` | Rust core compiled to WebAssembly for browser environments |
| `packages/rs-core-wasm-node` | Rust core compiled to WebAssembly for Node.js environments |

### Apps

| App | Description |
|-----|-------------|
| `apps/polycentric` | The main Polycentric social network application (Expo/React Native) |

### Services

| Service | Description |
|---------|-------------|
| `services/server` | Polycentric server |
| `legacy/services/polycentric-server` | Legacy server  |
| `legacy/services/verifiers-server` | Legacy Server for verifying claims and signatures in the protocol |
