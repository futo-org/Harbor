---
title: Submitting Events
sidebar_label: Submitting Events
sidebar_position: 5
---

# Submitting Events

Events are submitted as a bundle of the `SignedEvent` and `SerializedContent`.
We use `SerializedContent` so that the checksum of the content can be verified.
On submission the `EventMetadata` in `meta` and `EventProof` in `event_proofs`
are not used.

```protobuf
message EventBundle {
  SignedEvent signed_event = 1;
  optional SerializedContent serialized_content = 2;
  repeated EventProof event_proofs = 3;
  optional EventMetadata meta = 4;
}
```

Let's start with the `SignedEvent`. Internally it contains an `Event` and a
signature to verify that the event authentic. Note that the content is not
contained in this event as that part of `SerializedContent` in the
`EventBundle`.

First, let's start with the type definition of `Event` and we'll go over each
field after:

```protobuf
message Event {
  EventKey key = 1;
  uint64 identity_sequence = 2;
  VectorClock vector_clock = 3;
  bytes previous_signature = 4;
  ContentDigest content_digest = 6;
  uint64 created_at = 7;
  bytes previous_root = 8;
  optional Application application = 9;
}
```

The `EventKey` is an unique identifier of an `Event`, in other words a way to
reference a specific event.

```protobuf
message EventKey {
  int32 collection = 1;
  string identity = 2;
  PublicKey signed_by = 3;
  uint64 sequence = 4;
}
```

The `collection` is a number for the stream the event is connected with.
Polycentric currently reserver a number of these:
* `1`: identity
* `2`: feed
* `3`: profile
* `4`: interactions (likes etc)
* `5`: social graph (follows)
* `6`: reports
* `7`: labels
* `8`: verifications

The `identity` is the identity key (a sha256 hash of the initial
[`Identity`](/docs/protocol/data-model#identity) content). `signed_by` contains
the [public key](/docs/protocol/data-model#publickey). Finally the `sequence`
contains the number of event in the collection, it must be unique within
collection for a given identity.

Coming back to the fields on `Event`.

TODO: descibe `identity_sequence`, `vector_clock`, `previous_signature`.

The `content_digest` is the (e.g. SHA256) hash of the content. `created_at` is
the timestamp at which the event is created in milliseconds since the Unix
epoch.

TODO: descibe `previous_root`.

The `application` field is described in [Declaring Your
Application](/docs/developer/declaring-your-application).

Now that we have all the fields of `Event` we can assemble it into a
`SignedEvent`. The `Event` is encoded to bytes using Protobuf (`event_bytes`).
Those bytes are then signed (`signature`). The two are then combined into a
`SignedEvent`:

```protobuf
message SignedEvent {
  bytes signature = 1;
  bytes event_bytes = 2;
}
```

The content of an event is defined by the `Content` type, as described in more
detail in the [Content section](#content) below. The `Content` is encoded using
Protobuf and placed inside `SerializedContent.content_bytes`.

Together the `SignedEvent` and `SerializedContent` can create an `EventBundle`
(as the `EventProof` and `EventMetadata` are not used on submission).

Now that we got an `EventBundle` we can put one or more into a
`PutEventsRequest` and submit it to to `EventSyncService.PutEvents`. Assuming no
error is returned the event is now succesfully submitted!

```protobuf
service EventSyncService {
  rpc PutEvents(PutEventsRequest) returns (PutEventsResponse);
}

message PutEventsRequest {
  repeated EventBundle event_bundles = 1;
}

message PutEventsResponse {
  repeated PutEventError errors = 1;
  repeated Blob requested_blobs = 2;
}
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

The `EventKey.collection` must match `ContentBody` type, see the [Content
section](#content) below for more information. TODO: `EventKey.identity`,
`EventKey.signed_by`. The tuple (`EventKey.collection`, `EventKey.sequence`)
must be unique, in other words the sequence number must be increased for each
event in the same collection.

Getting back to `Event` type, TODO: `identity_sequence`, `vector_clock`,
`previous_signature`. The `content_digest` must match the content. `created_at`
has no validation beyond that should probably send the current timestamp, but
older timestamps are accepted to allow servers to catch up. TODO:
`previous_root`.

Finally there is the `Application` type. As described in [Declaring Your
Application](/docs/developer/declaring-your-application), the `Application.id`
must be a valid reserved DNS identifier. The `Application.url` field must be a
valid URL and start with `http://` or `https://`. Other than that the fields are
all limited to 100 bytes in length.

### Error Handling

The `PutEvents` RPC method on the `EventSyncService` returns a
`PutEventsResponse`, which has the `errors` field containing all errors on a
per-event basis. Note that any events which don't have an error are succesfully
submitted, the method doesn't return on the first error.

The error type return is `PutEventError`. The `event_bundle_index` field is the
index into `PutEventsRequest.event_bundles` to which the error applies. The
`message` field holds a human readable error message on why the event wasn't
accepted.

```protobuf
message PutEventError {
  uint32 event_bundle_index = 1;
  string message = 2;
}
```

Events that are already know to the server, e.g. onces are submitted again, are
ignored, no error is returned for them.

## Content

The content of an event is described by the `Content` type, which is basically
an enum for all currently supported events.

```protobuf
message Content {
  oneof content_body {
    Post post = 2;
    Delete delete = 3;
    Follow follow = 4;
    Block block = 5;
    Reaction reaction = 6;
    AttributedToReaction attributed_to_reaction = 15;
    ProfileUpdate profile_update = 7;
    Identity identity = 8;
    Repost repost = 9;
    Report report = 10;
    Labels labels = 11;
    VerificationClaim verification_claim = 12;
    VerificationVerify verification_verify = 13;
    VerificationTarget verification_target = 14;
  }
}
```

The following sections describe each of the available content types.
