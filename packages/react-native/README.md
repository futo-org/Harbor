# @polycentric/react-native

Polycentric SDK for React Native applications, used by `apps/harbor`. It passeswires
the Rust core (`packages/rs-core`) and platform storage into a
`PolycentricClient` from `@polycentric/js-core`, and re-exports js-core and the
rs-core bindings so apps need only this one package.

## Usage

```ts
import { createPolycentricClient, createIdentity } from '@polycentric/react-native';

const client = await createPolycentricClient({
  databaseName: 'polycentric', // default; the blob store uses `<name>-blobs`
  seedServers: ['https://example.com'],
});
await createIdentity(client, 'https://example.com');
```

`createPolycentricClient` installs a batching console logger for rs-core on
first use, opens storage, and calls `PolycentricClient.create`.

## Generated code

The uniffi bindings (`src/generated/rn/`, `cpp/generated/`) and the TurboModule
layer that loads them (`cpp/`, `ios/`, `android/`'s module sources,
`ReactNative.podspec`, `src/NativeReactNative.ts`, `src/uniffi-init.tsx`) are
generated from `rs-core` and not committed. `.gitignore` lists them.

```sh
pnpm generate        # bindings, from a host build of rs-core
pnpm ubrn:android    # the same, plus the Android native libraries
pnpm ubrn:ios        # the same, plus the iOS framework (macOS only)
pnpm ubrn:clean      # delete everything generated
```

## Docs
See our docs for more info:

- [Examples](https://join.harbor.social/docs/developer/examples)
- [Declaring your application](https://join.harbor.social/docs/developer/declaring-your-application)
- [Live sync](https://join.harbor.social/docs/developer/live-sync)
- [Unread notifications](https://join.harbor.social/docs/developer/unread-notifications)
- [Project structure](https://join.harbor.social/docs/developer/project-structure)
