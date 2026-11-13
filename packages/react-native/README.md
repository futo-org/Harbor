# @polycentric/react-native

Polycentric SDK for React Native applications.

## Generated code

The uniffi bindings (`src/generated/rn/`, `cpp/generated/`) and the TurboModule
glue that loads them (`cpp/`, `ios/`, `android/`'s module sources,
`ReactNative.podspec`, `src/NativeReactNative.ts`, `src/uniffi-init.tsx`) are
generated from `rs-core` and not committed. `.gitignore` lists them.

```sh
pnpm generate        # bindings and glue, from a host build of rs-core
pnpm ubrn:android    # the same, plus the Android native libraries
pnpm ubrn:ios        # the same, plus the iOS framework (macOS only)
pnpm ubrn:clean      # delete everything generated
```

`pnpm generate` (`tools/generate-bindings.mjs`) only needs the Rust toolchain.
`build` and `typecheck` run it first through Turbo.
