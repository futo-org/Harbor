# Polycentric Core Rs

Rust core library for the Polycentric protocol. Compiles to static libraries (FFI) for iOS/Android and to WASM for web/node.

## Building

```
just build-ffi-all    # iOS + Android static libraries
just build-wasm-all   # WASM for web + node
just build-all        # everything
```

Individual targets are also available, e.g. `just build-ffi-ios`, `just build-ffi-android-arm64`. Run `just` to see all recipes.
