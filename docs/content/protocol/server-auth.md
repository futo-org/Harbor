---
title: Server Auth
sidebar_label: Server Auth
sidebar_position: 4
---

# Server Auth

Clients authenticate to servers with a JWT sent on every gRPC request. The
token proves control of an identity: it is signed with one of the identity's
own keys, and the server checks that key against the identity document it
already stores.

There are no passwords or sessions. A server never issues credentials — the
client mints its own token and the server verifies it.

## Token format

A standard JWT signed with EdDSA (ed25519). The header's `kid` carries the
signing public key as lowercase hex:

```json
{ "alg": "EdDSA", "typ": "JWT", "kid": "6fe2c609a3d8...cab8772b" }
```

Claims:

```json
{
  "iss": "c9eb56f33fc9...adcbff8",
  "aud": "https://serv1.posts.futo.org",
  "iat": 1784371200,
  "exp": 1784374800
}
```

- `iss` — the identity key of the authenticating user.
- `aud` — the URL of the server the token is for. Tokens are per-server; a
  token minted for one server is rejected by every other.
- `exp` — tokens last one hour by default.

The token is sent as a header on every request:

```
authorization: Bearer <jwt>
```

## Client side

`createServerJwt` in js-core mints tokens:

```ts
import { createServerJwt } from '@polycentric/js-core';

const jwt = await createServerJwt({
  keyPair: client.currentKeyPair,
  iss: client.activeIdentityKey,
  aud: 'https://serv1.posts.futo.org',
});
```

The app does not call this directly. `PolycentricClient` registers a token
provider with the rust core, which attaches the header to every outgoing
request and caches one token per server, asking for a new one only when the
cached token is about to expire. Switching identity drops the cache.

## Server side

An interceptor in front of every gRPC service checks the header:

1. Verify the EdDSA signature against the key in `kid`.
2. Check `aud` is one of the server's accepted hosts
   (`POLYCENTRIC_ALLOW_HOSTS`, comma delimited, defaulting to
   `POLYCENTRIC_SERVER_NAME`) and `exp` has not passed.
3. Load the latest identity document for `iss` and check the `kid` key is
   one of its rotation or signing keys.

On success the verified identity is attached to the request for handlers to
use. Requests without a token pass through unauthenticated. Invalid tokens
are rejected with gRPC status `UNAUTHENTICATED` (16).

One exception: a token whose issuer has no identity document on the server
yet is treated as unauthenticated rather than rejected. A brand new
identity's first sync is what delivers the document, so rejecting it would
lock the identity out permanently.

Verification lives in `polycentric-common` (`jwt::verify_jwt`) so any
service can use it, with the middleware in the server's `service::auth`.
