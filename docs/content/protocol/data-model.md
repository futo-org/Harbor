---

title: Data Model
sidebar_label: Data Model
sidebar_position: 2
---

# Data Model

The Polycentric Protocol is a binary protocol using
[Protocol Buffers v3](https://protobuf.dev/). The messages below are the v2
definitions from the `protos/polycentric/v2` directory of the
[Harbor code repository](https://code.futo.org/harbor/harbor). RPC
request/response messages are covered in [gRPC](./grpc.mdx).

## Keys and identity

### KeyType

The only supported key type is Ed25519.

```protobuf file=protos/polycentric/v2/keypair.proto#KeyType
```

### PublicKey

There is usually one public key per account, per device.

```protobuf file=protos/polycentric/v2/keypair.proto#PublicKey
```

### Identity

The identity document. `rotation_keys` control the identity and can issue new keys;
`signing_keys` may sign events but not change the document; `revocation_bounds`
preserve the verifiability of events from a revoked key.

```protobuf file=protos/polycentric/v2/identity.proto#Identity,RevocationBound,EventProofTarget
```

### EventKey

The unique identifier of an event.

```protobuf file=protos/polycentric/v2/event_key.proto#EventKey
```

## Events

### VectorClock

The sequence numbers (of the same collection) the signing key is aware of.

```protobuf file=protos/polycentric/v2/events.proto#VectorClock
```

### Event

References, but does not contain, its content.

```protobuf file=protos/polycentric/v2/events.proto#Event
```

### Application

The application that authored an event. It is signed as part of the event, so it is
the author's own claim and cannot be changed afterwards.

```protobuf file=protos/polycentric/v2/events.proto#Application
```

Every application that writes events should set this on each one it creates. See
[Declaring Your Application](../developer/declaring-your-application.md) for what to
put in each field and how the SDKs stamp it for you.

### SignedEvent

The signature is computed over `event_bytes`, not over a re-encoded `Event`. The bytes
are stored as-is so the signature stays verifiable.

```protobuf file=protos/polycentric/v2/events.proto#SignedEvent
```

### EventBundle

Bundles a `SignedEvent` with its serialized content and any inclusion proofs. The
content is carried as `SerializedContent` so its checksum can be verified against the
event's `ContentDigest`.

```protobuf file=protos/polycentric/v2/events.proto#EventBundle
```

### EventProof

An [RFC 6962](https://datatracker.ietf.org/doc/html/rfc6962) Merkle inclusion proof:
the bundle's `SignedEvent` is the leaf at `leaf_index` in the tree rooted at the
target identified by `target_signature`.

```protobuf file=protos/polycentric/v2/events.proto#EventProof
```

### EventHint

Extra events a server may return to save the client a round trip — for example, the
root and parent posts of a reply, plus the author's latest profile event.

```protobuf file=protos/polycentric/v2/events.proto#EventHint
```

## Content

### ContentDigest

```protobuf file=protos/polycentric/v2/common.proto#ContentDigestType,ContentDigest
```

### Content

The body of an event. Exactly one variant is set.

```protobuf file=protos/polycentric/v2/content.proto#Content,SerializedContent
```

### Post, PostReply, Repost

```protobuf file=protos/polycentric/v2/content.proto#Post,PostReply,Repost
```

#### Link

```protobuf file=protos/polycentric/v2/content.proto#Link
```

### Delete

A `Delete` tells a server to forget the contents of a previous event. The server keeps
the data only if it is still referenced by another event.

```protobuf file=protos/polycentric/v2/content.proto#Delete
```

### Follow, Block

```protobuf file=protos/polycentric/v2/content.proto#Follow,Block
```

### Reaction

```protobuf file=protos/polycentric/v2/content.proto#Reaction
```

### ProfileUpdate

```protobuf file=protos/polycentric/v2/content.proto#ProfileUpdate
```

### Report

A `Report` flags another event for a category of policy violation. Reports are
themselves signed events, so a server can record who reported what and respond
according to its own moderation policy (moderation is per-server). `additional_info`
carries optional free-text context.

```protobuf file=protos/polycentric/v2/content.proto#Report,ReportCategory
```

### Labels

A `Labels` event records that a moderation service has classified content
against a set of label values. Labels are signed events in collection 7
(`Labels`). Like `Report`, labeling is per-server — a server indexes and
serves only labels from its configured trusted moderation service (set via
`HARBOR_MODERATION_IDENTITY` on the server side). Labels from any other identity
are stored and synced as normal events but are not indexed or served when
querying feeds.

The server returns matching `Labels` events as `EventHint` entries alongside
feed results; the client correlates each hint's event bundle to its target
by event key and renders it according to the user's preference
(Hide / Warn / Show). Because `EventHint` is a generic container, the client
differentiates label hints from identity/profile hints by checking whether the
event's collection is 7 (`Labels`).

```protobuf file=protos/polycentric/v2/content.proto#Labels
```

### Blob, Image, ImageSet

Media is stored as blobs in object storage and referenced by digest. Images may carry
multiple size variants.

```protobuf file=protos/polycentric/v2/media.proto#Blob,Image,ImageSet
```
