---

title: Submitting Events
sidebar_label: Submitting Events
sidebar_position: 5
---

# Submitting Events

Events are submitted as a bundle of the `SignedEvent` and `SerializedContent`.
We use `SerializedContent` so that the checksum of the content can be verified.
`EventBundle` is defined as:

```protobuf file=protos/polycentric/v2/events.proto#EventBundle
```

On submission the `EventMetadata` in `meta` and `EventProof` in `event_proofs`
are not used, these are only useful when the `EventBundle`s are returned by a
server.

## Authentication

`PutEvents` takes an [auth token](/docs/protocol/server-auth) in the
`authorization: Bearer <token>` header. When one is sent, the server only
accepts events of the identity the token is for.

Requests without a token are still accepted for now, so that older clients
keep working. So are requests whose token the server can't match to an
identity yet, such as a first sync or a freshly paired device. Servers will
require the token in the future, so clients should always send it.

## Signed Event

Let's start with the `SignedEvent`. Internally it contains an `Event` and a
signature to verify that the event is authentic. Note that the content is not
contained in this event, that is a part of `SerializedContent` in the
`EventBundle`.

First, let's start with the type definition of `Event` and we'll go over each
field after:

```protobuf file=protos/polycentric/v2/events.proto#Event
```

The `EventKey` is an unique identifier of an `Event`, in other words a way to
reference a specific event.

```protobuf file=protos/polycentric/v2/event_key.proto#EventKey
```

The `collection` is a number for the stream the event is connected with.
Polycentric currently reserver a number of these:

- `1`: identity
- `2`: feed
- `3`: profile
- `4`: interactions (likes etc)
- `5`: social graph (follows)
- `6`: reports
- `7`: labels
- `8`: verifications

The `identity` is the identity key (a SHA256 hash of the initial
[`Identity`](/docs/protocol/data-model#identity) content). `signed_by` contains
the [public key](/docs/protocol/data-model#publickey). Finally the `sequence`
contains the number of event in the collection, it must be unique within
collection for a given identity.

Coming back to the fields of `Event`.

The `identity_sequence` is a reference to the sequence, of the `Identity`
collection, that holds the identity document. This should be the
`EventKey.sequence` of the `Identity` event that holds the key that signed this
event.

The `vector_clock` is used in determining the ordering of events if they would
conflict, see the [Wikipedia
article](https://en.wikipedia.org/wiki/Vector_clock) for more information on
vector clock.

The `previous_signature` is the signature of the previous event signed by the
same key. This helps in creating immutable collections, which can be fully
verified.

The `content_digest` is the (e.g. SHA256) hash of the content.

`created_at` is the timestamp at which the event is created in milliseconds
since the Unix epoch.

`previous_root` is [RFC 6962](https://www.rfc-editor.org/info/rfc6962/) Merkle
root over this signer's prior signatures in this collection (`leaf_count =
key.sequence - 1`). Lets later events attest to the writer's history, consumed
by [`EventProof`](/docs/protocol/data-model#eventproof) for membership
verification.

The `application` field is described in [Declaring Your
Application](/docs/developer/declaring-your-application).

Now that we have all the fields of `Event` we can assemble it into a
`SignedEvent`. The `Event` is encoded to bytes using Protobuf (`event_bytes`).
Those bytes are then signed (`signature`). The two are then combined into a
`SignedEvent`:

```protobuf file=protos/polycentric/v2/events.proto#SignedEvent
```

Now we've created the event, let's make it useful with some content.

## Serialized Content

The
[`SerializedContent`](../protocol/data-model.md#content-1)
type is defined as the following:

```protobuf file=protos/polycentric/v2/content.proto#SerializedContent
```

The content of an event is defined by the
[`Content`](/docs/protocol/data-model#content-1) type, which is described in
more detail in the [Content Types section](#content-types) below. The content is
then encoded using Protobuf and placed inside `SerializedContent.content_bytes`.

Together the `SignedEvent` and `SerializedContent` can create an `EventBundle`
(as the `EventProof` and `EventMetadata` are not used on submission).

## Submitting

Now that we got an `EventBundle` we can put one or more into a
`PutEventsRequest` and submit it to `EventSyncService.PutEvents`. Assuming no
error is returned the event is now succesfully submitted!

```protobuf file=protos/polycentric/v2/events.proto#EventSyncService,PutEventsRequest,PutEventsResponse
```

See the next section on validation to ensure that the events are submitted
succesfully and don't encounter an error.

## Validation

The first thing that is validated of an `EventBundle` is encoding of the `Event`
(in `signed_event`) and `Content` in (`serialized_content`) as well as the
digests and signatures of both. If the encoding, digests or signatures of any of
these are invalid or missing the event bundle is rejected.

Let's walk through the validation on a per-field basis (keep the type definition
of `Event` handy!). Starting with the `EventKey`.

The `EventKey.collection` must match `ContentBody` type, see the [Content Types
section](#content-types) below for more information. `EventKey.identity` must be
a hex-encoded SHA256 hash of the identity, if it's not a valid hash or it
doesn't match the identity the submitter of the event it's rejected. In
`EventKey.signed_by` currently only valid ED25519 keys are supported. The tuple
(`EventKey.collection`, `EventKey.sequence`) must be unique, in other words the
sequence number must be increased for each event in the same collection.

Getting back to `Event` type. As discussed previously the `identity_sequence`
must be the same as the `sequence` of the `EventKey` that points to the
`Identity` event that holds the key that signed this event. The `vector_clock`
is not strictly validated, but should be useable by the client to order events.
`previous_signature` must be a valid ed25519 signature. The `content_digest`
must match the content. `created_at` has no validation beyond that should
probably send the current timestamp, but older timestamps are accepted to allow
servers to catch up. `previous_root` must be a valid SHA256 hash.

Finally there is the `Application` type. As described in [Declaring Your
Application](/docs/developer/declaring-your-application), the `Application.id`
must be a valid reserved DNS identifier. The `Application.url` field must be a
valid URL and start with `http://` or `https://`. Other than that `name` and
`version` are limited to 50 bytes in length, `id` and `url` to 100.

### Error Handling

The `PutEvents` RPC method on the `EventSyncService` returns a
`PutEventsResponse`, which has the `errors` field containing all errors on a
per-event basis. It also contains `warnings`, which follow the same format.

Note that any events which don't have an error or warning are succesfully
submitted. The method doesn't stop on the first error, it always processes all
events, unless it encounters a fatal error (usually unrelated to the submitted
event itself), in which case it returns a gRPC error status (not a response).

Both the errors and warnings use the `PutEventError` type. The
`event_bundle_index` field is the index into `PutEventsRequest.event_bundles` to
which the error applies. The `message` field holds a human readable error
message on why the event wasn't accepted.

```protobuf file=protos/polycentric/v2/events.proto#PutEventError
```

If an error is returned for an event it means that the event is **not** stored.
The error should be fixed and retried.

If one or more warnings are returned for an event the event itself **is**
stored, but its content is **not**. For example if the content is too large, the
event is accepted to not break the chain of events. However, the content itself
is not stored.

Events that are already known to the server, e.g. ones are submitted again, are
ignored, no error is returned for them.

## Content Types

The content of an event is described by the `Content` type, which is basically
an enum for all currently supported events.

```protobuf file=protos/polycentric/v2/content.proto#Content
```

The following sections describe each of the available content types.
