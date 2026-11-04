# @polycentric/react-native

The Harbor client for React Native and Expo apps (iOS, Android, and web through
react-native-web). It is [js-core](../js-core/README.md)'s `PolycentricClient`
with [rs-core](../rs-core/README.md) underneath: compiled natively and loaded
as a TurboModule on iOS and Android, and as wasm in a shared worker on the web.

## Using it

```ts
import {
  ContentBody,
  createPolycentricClient,
  Post,
  SyncStrategy,
} from '@polycentric/react-native';

const client = await createPolycentricClient({
  databaseName: 'polycentric.db',
  seedServers: ['https://srv.example'],
});

await client.createIdentity();
await client.publish({
  contentBody: new ContentBody.Post({ post: Post.create({ text: 'hello' }) }),
});
await client.sync(SyncStrategy.PartialPush);
```

The package exports rs-core's whole generated API (the protocol's records,
their factories and enums, `Query`, and the stateless helpers like
`eventKeyId` and `labelsChanged`), also as the `v2` namespace (`v2.Post`),
plus everything from js-core. See js-core's README for the rules of the
client API.

### Storage and keys

| Platform | Database | Private keys sealed with |
|---|---|---|
| iOS, Android | `<documents>/SQLite/<databaseName>`, blobs in `<documents>/<databaseName>-blobs` (where earlier versions kept them, so installs keep their data) | a 32-byte wrapping key in `expo-secure-store` (iOS Keychain / Android Keystore), created on first open |
| Web | SQLite on OPFS, shared by every tab through one worker | a non-extractable WebCrypto key |

Keys earlier versions stored unsealed are sealed on first open. The app needs
`expo-secure-store` and `expo-file-system` installed.

## Building

The native library and the bindings come from rs-core with
[uniffi-bindgen-react-native](https://github.com/jhugman/uniffi-bindgen-react-native)
(`ubrn`):

```sh
pnpm ubrn:android   # cargo-ndk build into android/src/main/jniLibs, plus bindings
pnpm ubrn:ios       # xcframework (macOS), plus bindings
pnpm ubrn:clean     # remove everything generated (restore with pnpm generate)
```

`ubrn:android` needs the Android NDK (`ANDROID_NDK_HOME`) and `cargo-ndk`;
`--release` and `-t arm64-v8a` (or other ABIs) are passed through.

Nothing ubrn generates is committed: the TypeScript (`src/generated/rn`) and
C++ (`cpp/generated`) bindings, and the TurboModule glue that loads them
(`cpp/`, `ios/`, `ReactNative.podspec`, `android/CMakeLists.txt`,
`android/build.gradle`, `android/cpp-adapter.cpp`, `android/src/main/`,
`src/NativeReactNative.ts`, `src/uniffi-init.tsx`). After a checkout, run
`pnpm generate` (here or at the root): `tools/generate-bindings.mjs` builds
rs-core for this machine, with no NDK or Xcode, and generates all of it. The
`ubrn:*` commands above regenerate it too. turbo runs `generate` before this
package's `build` and `typecheck`, keyed on rs-core's sources. In CI the wasm
job generates it and hands it on with the wasm build.

The web entry (`src/index.web.ts`) uses
[`@polycentric/rs-core-wasm`](../rs-core-wasm/README.md) instead and needs no
native build.

## Layout

| Path | |
|---|---|
| `src/index.tsx`, `src/index.web.ts` | the package's exports, native and web |
| `src/create-polycentric-client.ts` | opens the client on a device (paths, secure-store wrapping key) |
| `src/create-polycentric-client.web.ts` | opens the client in the browser (via js-core's web host) |
| `src/log-sink.ts` | batches rs-core's log lines into `console` |
| `src/generated/rn`, `cpp/generated` | generated bindings (not committed) |
| `tools/generate-bindings.mjs` | generates them from a host build of rs-core |
| `android/`, `ios/`, `cpp/` | the TurboModule that loads rs-core (generated, except `android/gradle.properties` and `proguard-rules.pro`) |
