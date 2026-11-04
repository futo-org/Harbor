# @polycentric/js-core

The Harbor client for JavaScript and TypeScript: a thin, async layer over
[rs-core](../rs-core/README.md)'s `HarborClient`. rs-core does the work
(protocol engine, storage, keys, sync); this package gives it a JavaScript
shape and decides where it runs.

## Where the client runs

| Host | Entry point | rs-core | Storage | Keys sealed with |
|---|---|---|---|---|
| Browser | `@polycentric/js-core/web` → `createWebClient` | wasm, in one dedicated worker shared by every tab | SQLite on OPFS | a non-extractable WebCrypto key in IndexedDB |
| Node | `@polycentric/js-core/node` → `createNodeClient` | wasm, in-process | SQLite file via Node's `fs`, or memory | a 32-byte wrapping key you pass (`wrappingKey`) |
| React Native | [`@polycentric/react-native`](../react-native/README.md) | native, behind a TurboModule | SQLite file | a wrapping key in the platform keystore |

All three hand back the same `PolycentricClient`. Underneath it is an
`AsyncHarbor` (`src/harbor.ts`): every rs-core call as a promise, so the
client can be in-process (`localHarbor`) or behind a message channel
(`hosts/web-remote.ts`).

### The browser

OPFS's SQLite backend only works in a dedicated worker, and a database can be
open in only one. So the tab holding the Web Lock `harbor-client:<name>`
starts the worker (`@polycentric/rs-core-wasm`'s `client-worker.ts`), and
every tab, that one included, talks to it over a `BroadcastChannel` of the
same name. When that tab closes, the next one in line for the lock starts a
new worker; calls the old one hadn't answered reject, and query
subscriptions resume. Where the browser can't run the worker (some private
modes), the client runs in memory in the tab and `persistentStorage` is
false. Data written by the old IndexedDB store is imported once
(`hosts/web-migration.ts`).

The page also loads the wasm module itself, for the stateless helpers a UI
calls while rendering (labels, URLs, aliases).

## Using it

```ts
import { createNodeClient } from '@polycentric/js-core/node';
import { ContentBody, Post, Query, SyncStrategy } from '@polycentric/rs-core-wasm';

const client = await createNodeClient({
  databasePath: './state/harbor.db',
  wrappingKey: process.env.HARBOR_WRAPPING_KEY, // 64 hex characters
  seedServers: ['https://srv.example'],
});

await client.createIdentity();
const bundle = await client.publish({
  contentBody: new ContentBody.Post({ post: Post.create({ text: 'hello' }) }),
});
await client.sync(SyncStrategy.PartialPush);

const stop = client
  .fetchQuery(['profile', client.activeIdentityKey!], new Query.GetProfile({
    identity: client.activeIdentityKey!,
  }))
  .subscribe({ next: (result) => console.log(result.data), error() {}, complete() {} });
```

### Rules of the API

- **Everything is async**, except reads of the snapshot rs-core pushes
  (`snapshot`, `activeIdentityKey`, `activeLogin`, `activePublicKey`,
  `servers`, `persistentStorage`) and the pure URL helpers over it
  (`blobUrls`, `imageProxyUrls`). `subscribe(onChange)` makes the snapshot a
  store for `useSyncExternalStore`.
- **Data is records.** The protocol's messages are UniFFI records generated
  from the protos (`Content`, `EventBundle`, …), with factories
  (`Post.create`), enums (`KeyType.Ed25519`) and oneof variants
  (`new ContentBody.Post({ post })`). Import them from the host package. Bytes
  are `ArrayBuffer`s, maps are `Map`s, 64-bit integers are `bigint`s.
- **Signed bytes stay in rs-core.** Records show decoded events and content;
  `signedEvent.event` is present only if its signature verified. Refer to
  events by `EventKey` (`eventKeyId`/`parseEventKeyId` for string ids) and
  to content by `ContentDigest`. To show an event before storing it,
  `prepareEvent` returns a `PendingEventRef` to pass to `commitEvent`.
- **Events:** `client.on('committed' | 'pulled' | 'pushResults', cb)`.
- **Errors** are `PolycentricError` subclasses (`AlreadyExistsError`,
  `ServerAlreadyAddedError`, …), keyed by rs-core's `SdkError` variant.

Backups (`createBackup`, `checkBackup`, `recoverFromBackup`), pairing
(`createPairingSession` … `claim`), logins, identity edits, blobs and
moderation calls are methods on the client; see
`src/polycentric-client.ts`.

## Layout

| Path | |
|---|---|
| `src/polycentric-client.ts` | `PolycentricClient` |
| `src/harbor.ts` | `AsyncHarbor` and the in-process adapter |
| `src/local.ts` | opening an in-process client; wrapping-key ciphers |
| `src/hosts/` | `web.ts` (leader election, worker), `web-remote.ts` (the tab side of the worker protocol), `web-migration.ts`, `node.ts` |
| `src/bindings.ts` | the registered rs-core module (wasm or native) and its types |
| `src/errors.ts` | JavaScript error classes |
| `src/http/alias-resolver.ts` | alias parsing, synchronous and without bindings (mirrors rs-common's `alias`) |

## Development

```sh
pnpm --filter @polycentric/rs-core-wasm build  # the wasm bindings js-core is typed against
pnpm --filter @polycentric/js-core build
pnpm --filter @polycentric/js-core test         # Node, against the real wasm
pnpm --filter @polycentric/js-core test:browser # Chromium: OPFS, the worker, migration
```

The browser tests need Playwright's Chromium
(`npx playwright install --only-shell chromium`).
