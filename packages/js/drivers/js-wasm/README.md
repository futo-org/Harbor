# @polycentric/js-wasm

[uniffi-bindgen-react-native](https://github.com/jhugman/uniffi-bindgen-react-native)
(ubrn) bindings for the Rust core, `packages/rust/rs-core`: the generated TypeScript
API plus a wasm build of the crate, for browsers and Node.

## Building

```sh
pnpm build   # ubrn build wasm2, then tsc + tools/finish-node-build.mjs
pnpm clean   # delete dist/ and src/generated/wasm/
```

Turbo caches the build on rs-core/rs-common sources and this package's own
inputs (`turbo.json`). `src/generated/` and `dist/` are not tracked in git.

## Docs
See our docs for more info:

- [Generated code](https://join.harbor.social/docs/developer/project-structure#generated-code)
- [Clearing stale build caches](https://join.harbor.social/docs/developer/setup#clearing-stale-build-caches)
- [Examples](https://join.harbor.social/docs/developer/examples)
