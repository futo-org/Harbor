# Polycentric Core Rs

Rust core library for the Polycentric protocol. Compiles to static libraries (FFI) for iOS/Android and to WASM for web/node.

From this directory, use the justfile for builds, tests, and tooling:

- `just build-all` — FFI (iOS sim + Android) + WASM for web and node; deploys into react-native
- `just build-all-device` — same but iOS device (not sim)
- `just build-ffi-ios-sim`, `just build-ffi-android-all`, `just build-wasm-all` — individual targets
- `just test`, `just check`, `just format`, `just clippy`, `just doc` — cargo workflows
- `just` — list all recipes
