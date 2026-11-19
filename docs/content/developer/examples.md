---

title: Examples
sidebar_label: Examples
---

# Examples

This page provides code snippets as usage examples of our packages: building a client, creating an
identity, publishing, and reading content. The examples connect to a server at
`http://localhost:3000`, the server from [Setup](./setup.md).
[Project Structure](./project-structure.md#packages) explains which package to pick for your
platform.

Note that third-party Harbor apps/clients should pass an `application` field on every event they
publish if they wish to advertise the app they were created with; see
[Declaring Your Application](./declaring-your-application.md).

## Creating a client

### Node.js

`@polycentric/js-node` stores events in SQLite (or Postgres, with `databaseUrl`) and blobs in a
directory.

```ts
import { createPolycentricNodeClient } from '@polycentric/js-node';

const client = await createPolycentricNodeClient({
  databasePath: './polycentric.db',
  blobDirectory: './polycentric-blobs',
  seedServers: ['http://localhost:3000'],
});
```

### React Native and web

`@polycentric/react-native` provides a native-compiled core, with SQLite for storage, iOS and
Android; or a wasm core, with IndexedDB and OPFS for storage, on the web.

```ts
import { createPolycentricClient } from '@polycentric/react-native';

const client = await createPolycentricClient({
  seedServers: ['http://localhost:3000'],
});
```

### Browser, without React Native

Load the wasm core yourself and pass in the `@polycentric/js-browser` storage implementations.

```ts
import { PolycentricClient } from '@polycentric/js-core';
import {
  IndexedDBStorageDriver,
  OpfsFileStoreDriver,
} from '@polycentric/js-browser';
import {
  PolycentricCore,
  uniffiInitAsync,
} from '@polycentric/rs-core-wasm/web';

await uniffiInitAsync();

const client = await PolycentricClient.create({
  core: new PolycentricCore(),
  storageDriver: await IndexedDBStorageDriver.create('polycentric'),
  filestoreDriver: await OpfsFileStoreDriver.create('polycentric-blobs'),
  seedServers: ['http://localhost:3000'],
});
```

### Kotlin

Kotlin/Android uses the Maven package, which provides a file store and SQLite storage
implementation.

```kotlin
import org.futo.polycentric.core.AndroidFileStoreDriver
import org.futo.polycentric.core.PolycentricClient
import org.futo.polycentric.core.SqliteStorageDriver
import org.futo.polycentric.ffi.PolycentricCore
import java.io.File

val client = PolycentricClient.create(
    core = PolycentricCore(),
    storageDriver = SqliteStorageDriver(context),
    filestore = AndroidFileStoreDriver(File(context.filesDir, "blobs")),
    seedServers = listOf("http://localhost:3000"),
)
```

## Creating an identity

Clients will restore the last active identity when it starts, so create one only
when `activeIdentityKey` is empty.

### JavaScript

`@polycentric/react-native` provides an easy helper:

```ts
import { createIdentity } from '@polycentric/react-native';

if (!client.activeIdentityKey) {
  await createIdentity(client, 'http://localhost:3000');
}
```

If not using React Native, run through the following steps with the login manager:

```ts
import { SyncStrategy } from '@polycentric/js-core';

if (!client.activeIdentityKey) {
  const { login, genesisEvent, identityContent, serializedContent } =
    await client.loginManager.beginSignup();
  await client.commitEvent({
    owner: login.identity,
    signedEvent: genesisEvent,
    content: identityContent,
    contentBytes: serializedContent.contentBytes,
  });
  await client.loginManager.finishSignup(login);
  await client.loginAs(login);
  await client.sync(SyncStrategy.PARTIAL_PUSH);
}

console.log('identity:', client.activeIdentityKey);
```

### Kotlin

The Kotlin client will have a ready key pair after creating the client. Publish an identity
whose only rotation key is that key pair:

```kotlin
if (client.activeIdentityKey == null) {
    client.identityManager.publish(
        identityKey = null,
        rotationKeys = listOf(client.currentSystem),
        signingKeys = emptyList(),
        servers = listOf("http://localhost:3000"),
    )
}
```

## Publishing content

Each kind of content goes in its own collection. Build the `Content`, call
`createEvent` with the matching collection, then `sync()` to push it.

| Content           | Collection     |
| ----------------- | -------------- |
| `post`            | `FEED`         |
| `profileUpdate`   | `PROFILE`      |
| `reaction`        | `INTERACTIONS` |
| `follow`, `block` | `GRAPH`        |

### Posting

```ts
import { COLLECTION, v2 } from '@polycentric/js-core';

const content = client.contentManager.build({
  oneofKind: 'post',
  post: v2.Post.create({ text: 'Hello, Polycentric!' }),
});
const { eventKey } = await client.createEvent({
  collection: COLLECTION.FEED,
  content,
});
await client.sync();
```

`eventKey` identifies the new post. Keep it to reply to the post, react to it or
delete it.

### Setting a profile

```ts
const content = client.contentManager.build({
  oneofKind: 'profileUpdate',
  profileUpdate: { name: 'Ada', description: 'Writing about engines.' },
});
await client.createEvent({ collection: COLLECTION.PROFILE, content });
await client.sync();
```

### Following and reacting

```ts
await client.createEvent({
  collection: COLLECTION.GRAPH,
  content: client.contentManager.build({
    oneofKind: 'follow',
    follow: { identity: otherIdentityKey },
  }),
});

await client.createEvent({
  collection: COLLECTION.INTERACTIONS,
  content: client.contentManager.build({
    oneofKind: 'reaction',
    reaction: { eventKey: postKey, emoji: '👍', positive: true },
  }),
});

await client.sync();
```

### Replying

A reply is a post whose `reply` points at the post it answers.

```ts
const content = client.contentManager.build({
  oneofKind: 'post',
  post: v2.Post.create({
    text: 'Agreed.',
    reply: { parent: postKey, root: postKey },
  }),
});
await client.createEvent({ collection: COLLECTION.FEED, content });
await client.sync();
```

### Attaching an image

Images are blobs, uploaded separately and referenced from the post by digest.
`commitBlob` stores the bytes locally and returns the `Blob` that describes
them; `uploadBlob` sends them to your servers.

```ts
import { readFile } from 'node:fs/promises';

const bytes = new Uint8Array(await readFile('./photo.jpg'));
const blob = await client.commitBlob(bytes, 'image/jpeg');
await client.uploadBlob(blob, bytes);

const content = client.contentManager.build({
  oneofKind: 'post',
  post: v2.Post.create({
    text: 'Look at this',
    images: [{ images: [{ blob, width: 1024, height: 768 }] }],
  }),
});
await client.createEvent({ collection: COLLECTION.FEED, content });
await client.sync();
```

An `ImageSet` can hold several sizes of the same image; readers pick the one
that fits. Calling `client.blobUrl(blob.digest)` will return a URL to load
the image from.

### Kotlin

The Kotlin client will need to build an event, then sign it, and then commit it to local storage
before finally syncing.

```kotlin
import org.futo.polycentric.core.Collections
import polycentric.v2.Content
import polycentric.v2.Post
import polycentric.v2.ProfileUpdate

suspend fun PolycentricClient.publish(content: Content, collection: Int) {
    val signed = signEvent(buildEvent(content, collection))
    commitEvent(signed, content)
    sync()
}

client.publish(Content(post = Post(text = "Hello, Polycentric!")), Collections.FEED)
client.publish(
    Content(profile_update = ProfileUpdate(name = "Ada")),
    Collections.PROFILE,
)
```

## Reading

Reads go through the core's query engine. Each query asks every configured server, merges their
answers into one response message, such as a `GetProfileResponse` or a `GetFeedResponse`. A server
that errors or takes longer than 5 seconds is left out. The same queries are available in both SDKs:

- **TypeScript:** pass a `Query` to `client.core.awaitQuery`. It resolves to the merged response as
  bytes once every server has answered or timed out, which you decode with a protobuf type (use the
  `v2` object, as shown in the examples below). Import `Query` from `@polycentric/react-native`, or
  from `@polycentric/rs-core-wasm` in Node.js and the browser.
- **Kotlin:** call the extension functions on `PolycentricClient`, such as `getProfile` and
  `getIdentityFeed`. They return the decoded response, or `null` when no server answered.

### Getting a profile

```ts
import { v2 } from '@polycentric/js-core';
import { Query } from '@polycentric/rs-core-wasm';

const bytes = await client.core.awaitQuery(
  new Query.GetProfile({ identity: identityKey }),
  undefined,
  undefined,
);
if (bytes) {
  const profile = v2.GetProfileResponse.fromBinary(new Uint8Array(bytes));
  console.log(profile.followersCount, 'followers');

  for (const bundle of profile.eventBundles) {
    const contentBytes = bundle.serializedContent?.contentBytes;
    if (!contentBytes) continue;
    const content = v2.Content.fromBinary(contentBytes);
    if (content.contentBody.oneofKind === 'profileUpdate') {
      console.log(content.contentBody.profileUpdate.name);
    }
  }
}
```

```kotlin
val profile = client.getProfile(identityKey)
if (profile != null) {
    println("${profile.followers_count} followers")
    profile.event_bundles.forEach { bundle ->
        val bytes = bundle.serialized_content?.content_bytes ?: return@forEach
        Content.ADAPTER.decode(bytes).profile_update?.let { println(it.name) }
    }
}
```

### Listing an identity's posts

```ts
const bytes = await client.core.awaitQuery(
  new Query.GetIdentityFeed({
    identity: identityKey,
    limit: 20,
    omitLabels: [],
  }),
  undefined,
  undefined,
);
if (bytes) {
  const feed = v2.GetFeedResponse.fromBinary(new Uint8Array(bytes));
  for (const bundle of feed.eventBundles) {
    const contentBytes = bundle.serializedContent?.contentBytes;
    if (!contentBytes) continue;
    const content = v2.Content.fromBinary(contentBytes);
    if (content.contentBody.oneofKind === 'post') {
      console.log(content.contentBody.post.text);
    }
  }
}
```

```kotlin
val feed = client.getIdentityFeed(identityKey, limit = 20)
feed?.event_bundles?.forEach { bundle ->
    val bytes = bundle.serialized_content?.content_bytes ?: return@forEach
    Content.ADAPTER.decode(bytes).post?.let { println(it.text) }
}
```

The response's `page_info` carries the cursors for loading further pages; see
[Feed Paging](./feed-paging.md).

### Getting a single event

Look up an event by its identity, collection and sequence, for example a post
you have an `EventKey` for.

```ts
const bytes = await client.core.awaitQuery(
  new Query.GetEvent({
    identity: postKey.identity,
    collection: postKey.collection,
    sequence: postKey.sequence,
  }),
  undefined,
  undefined,
);
const bundle = bytes && v2.EventBundle.fromBinary(new Uint8Array(bytes));
```

```kotlin
val bundle = client.getEvent(
    identity = postKey.identity,
    collection = postKey.collection,
    sequence = postKey.sequence,
)
```

### Other queries

`Query` also covers the following and recommended feeds, post threads, search, followers and
following, reactions, notifications and verifications. The Kotlin SDK wraps a subset of them. For a
UI that should show results before the slowest server answers, `client.core.fetchQuery` returns an
observable instead. It emits cached data first, and with `emitMode: EmitMode.Eager` it emits the
merged response again as each server's answer arrives.

## Staying in sync

`sync()` pushes local events your servers are missing and pulls events the
active identity created on other devices. Call it after writing, and on startup.

To pull as soon as another device publishes, start live sync and listen for
pulls:

```ts
client.events.onPulled((identity) => {
  console.log('new events for', identity);
});
const stopLiveSync = client.startLiveSync();

// later
stopLiveSync();
```

Push failures do not throw. Listen for them to surface errors:

```ts
client.events.onPushResults((results) => {
  for (const result of results) console.log(result);
});
```

For a complete program, see the Node.js example server in
`packages/js-node/examples/server`, which creates an identity, posts, and renders
the feed.
