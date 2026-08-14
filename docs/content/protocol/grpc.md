---
title: gRPC
sidebar_label: gRPC
sidebar_position: 3
---

# gRPC

The server exposes its API as gRPC services, served over both gRPC (h2c) and gRPC-Web
on port `3000`. The message types referenced here are defined in
[Data Model](./data-model.md).

## EventSyncService

Synchronizes events between clients and servers.

```protobuf
service EventSyncService {
  rpc ListEvents(ListEventsRequest) returns (ListEventsResponse);
  rpc PutEvents(PutEventsRequest) returns (PutEventsResponse);
}
```

### ListEvents

Returns events (with content) matching the filters.

```protobuf
message ListEventsFilters {
  optional int32 collection = 1;
  optional string identity = 2;
  optional PublicKey signed_by = 3;
  optional int64 sequence_gt = 4;
  optional int64 sequence_lt = 5;
}

message ListEventsRequest {
  optional ListEventsFilters filters = 1;
  optional int32 size = 2;
}

message ListEventsResponse {
  repeated EventBundle event_bundles = 1;
  repeated EventHint event_hints = 2;
}
```

### PutEvents

Submits events from a client. The call succeeds even when some events are skipped;
per-event failures are returned diagnostically rather than failing the whole batch.

```protobuf
message PutEventsRequest {
  repeated EventBundle event_bundles = 1;
}

message PutEventError {
  uint32 event_bundle_index = 1;
  string message = 2;
}

message PutEventsResponse {
  // One entry per event the server could not store. Empty when all
  // events were accepted.
  repeated PutEventError errors = 1;
}
```

## ContentService

Synchronizes content bodies and uploads blobs.

```protobuf
service ContentService {
  rpc SyncContent(SyncContentRequest) returns (SyncContentResponse);
  rpc UploadBlob(UploadBlobRequest) returns (UploadBlobResponse);
}

message SyncContentRequest {
  // Digest created from the serialized content_bytes
  ContentDigest digest = 1;
  bytes content_bytes = 2;
}
message SyncContentResponse {}

message UploadBlobRequest {
  Blob blob = 1;
  bytes body = 2;
}
message UploadBlobResponse {}
```

A blob that is uploaded but never referenced by an event within a time window is
deleted by the server. Uploaded blob bodies are read back over plain HTTP at
`GET /blob/{digest}`.

## FeedsService

Server-curated feeds. These are computed by the server, so results depend on the
server queried.

```protobuf
service FeedsService {
  rpc GetIdentityFeed(GetIdentityFeedRequest) returns (GetFeedResponse);
  rpc GetFollowingFeed(GetFollowingFeedRequest) returns (GetFeedResponse);
  rpc GetExploreFeed(GetExploreFeedRequest) returns (GetFeedResponse);
  rpc GetPostThread(GetPostThreadRequest) returns (GetPostThreadResponse);
}

message FeedPageParams {
  optional int32 limit = 1;
  optional string before_token = 2;
  optional string after_token = 3;
}

message GetIdentityFeedRequest {
  string identity = 1;
  optional FeedPageParams page_params = 2;
}

message GetFollowingFeedRequest {
  string follower_identity = 1;
  optional FeedPageParams page_params = 2;
}

message GetExploreFeedRequest {
  optional string identity = 1;
  optional FeedPageParams page_params = 2;
}

message GetFeedResponse {
  repeated EventBundle event_bundles = 1;
  repeated EventHint event_hints = 2;
}

message GetPostThreadRequest {
  EventKey event_key = 1;
  int32 limit = 2;
}

message GetPostThreadResponse {
  repeated EventBundle thread = 1;
  repeated EventHint event_hints = 2;
}
```

- **GetIdentityFeed** — posts authored by one identity.
- **GetFollowingFeed** — the feed for a follower across the identities they follow.
- **GetExploreFeed** — trending / suggested posts.
- **GetPostThread** — replies under a post.

## PairingService

Links a new device to an existing identity. The issuer signs an
`InitialPairingSession`, the server stores it, and claimers sign to join.

```protobuf
service PairingService {
  rpc CreatePairingSession(CreatePairingSessionRequest) returns (CreatePairingSessionResponse);
  rpc GetPairingSession(GetPairingSessionRequest) returns (GetPairingSessionResponse);
  rpc JoinPairingSession(JoinPairingSessionRequest) returns (JoinPairingSessionResponse);
}

message InitialPairingSession {
  string issuer_identity = 1;
  int64 created_at = 2;       // unix milliseconds
}

message PairingSession {
  string pairing_session_signature = 1;
  PublicKey signed_by = 2;
  InitialPairingSession initial_session = 3;
  int64 expires_at = 4;       // unix milliseconds
  repeated PublicKey claimer_pubkeys = 5;
}
```

`CreatePairingSession` and `JoinPairingSession` wrap a
[`SignedMessage`](#signedmessage); `GetPairingSession` takes a session signature.

## NotificationService

Registers a device for push notifications. The request is a signed
`RegisterPushNotificationRequest`. The server currently supports Expo as the push
service (configured with the push-notifications service's `EXPO_ACCESS_TOKEN`).

```protobuf
service NotificationService {
  rpc RegisterPushNotifications(SignedMessage) returns (RegisterPushNotificationResponse);
}

message RegisterPushNotificationRequest {
  string service = 1;
  string token = 2;
}
message RegisterPushNotificationResponse {}
```

## ServerService

Reports information about the server.

```protobuf
service ServerService {
  rpc GetInfo(GetServerInfoRequest) returns (GetServerInfoResponse);
}

message ServerVersion {
  string version = 1;
}

message ServerInfo {
  ServerVersion version = 1;
  // URL used to resolve HTTP assets (blobs, images, etc.)
  string cdn_url = 2;
}
```

`cdn_url` reflects the server's `CDN_URL` configuration.

## SignedMessage

A generic envelope used by the pairing and notification services for requests that
must be authenticated.

```protobuf
message SignedMessage {
  bytes signature = 1;
  bytes message_bytes = 2;
  PublicKey public_key = 3;
}
```

## HTTP routes

Alongside gRPC, the server answers a few plain-HTTP routes:

| Route                | Purpose                                                     |
| -------------------- | ----------------------------------------------------------- |
| `GET /`              | Liveness string.                                            |
| `GET /status`        | Health check (`OK.`).                                       |
| `GET /docs`          | Reflection-generated API browser.                           |
| `GET /blob/{digest}` | Blob body by content digest, encoded `{type}_{hex}` (e.g. `1_<sha256 hex>` for SHA-256). |
