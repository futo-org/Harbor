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

```ts file=docs/examples/src/client.ts#node-client
```

### React Native and web

`@polycentric/react-native` provides a native-compiled core, with SQLite for storage, iOS and
Android; or a wasm core, with IndexedDB and OPFS for storage, on the web.

```ts file=docs/examples/src/react-native/client.ts#rn-client
```

### Browser, without React Native

Load the wasm core yourself and pass in the `@polycentric/js-browser` storage implementations.

```ts file=docs/examples/src/browser-client.ts#browser-client
```

### Kotlin

Kotlin/Android uses the Maven package, which provides a file store and SQLite storage
implementation.

```kotlin file=packages/kt-core/core/src/test/kotlin/examples/Examples.kt#client
```

## Creating an identity

Clients will restore the last active identity when it starts, so create one only
when `activeIdentityKey` is empty.

### JavaScript

`@polycentric/react-native` provides an easy helper:

```ts file=docs/examples/src/react-native/client.ts#rn-identity
```

If not using React Native, run through the following steps with the login manager:

```ts file=docs/examples/src/identity.ts#create-identity
```

### Kotlin

The Kotlin client will have a ready key pair after creating the client. Publish an identity
whose only rotation key is that key pair:

```kotlin file=packages/kt-core/core/src/test/kotlin/examples/Examples.kt#identity
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

```ts file=docs/examples/src/publishing.ts#post
```

`eventKey` identifies the new post. Keep it to reply to the post, react to it or
delete it.

### Setting a profile

```ts file=docs/examples/src/publishing.ts#profile
```

### Following and reacting

```ts file=docs/examples/src/publishing.ts#follow-react
```

### Replying

A reply is a post whose `reply` points at the post it answers.

```ts file=docs/examples/src/publishing.ts#reply
```

### Attaching an image

Images are blobs, uploaded separately and referenced from the post by digest.
`commitBlob` stores the bytes locally and returns the `Blob` that describes
them; `uploadBlob` sends them to your servers.

```ts file=docs/examples/src/publishing.ts#image
```

An `ImageSet` can hold several sizes of the same image; readers pick the one
that fits. Calling `client.blobUrl(blob.digest)` will return a URL to load
the image from.

### Kotlin

The Kotlin client will need to build an event, then sign it, and then commit it to local storage
before finally syncing.

```kotlin file=packages/kt-core/core/src/test/kotlin/examples/Examples.kt#publish
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

```ts file=docs/examples/src/reading.ts#profile
```

```kotlin file=packages/kt-core/core/src/test/kotlin/examples/Examples.kt#read-profile
```

### Listing an identity's posts

```ts file=docs/examples/src/reading.ts#identity-feed
```

```kotlin file=packages/kt-core/core/src/test/kotlin/examples/Examples.kt#read-feed
```

The response's `page_info` carries the cursors for loading further pages; see
[Feed Paging](./feed-paging.md).

### Getting a single event

Look up an event by its identity, collection and sequence, for example a post
you have an `EventKey` for.

```ts file=docs/examples/src/reading.ts#single-event
```

```kotlin file=packages/kt-core/core/src/test/kotlin/examples/Examples.kt#read-event
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

```ts file=docs/examples/src/sync.ts#live-sync
```

Push failures do not throw. Listen for them to surface errors:

```ts file=docs/examples/src/sync.ts#push-results
```

For a complete program, see the Node.js example server in
`packages/js-node/examples/server`, which creates an identity, posts, and renders
the feed.
