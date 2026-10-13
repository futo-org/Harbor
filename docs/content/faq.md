---
title: FAQ
sidebar_label: FAQ
sidebar_position: 3
---

# FAQ

## What is Harbor?

Harbor is an open-source, distributed social network. Content is published to
multiple servers at once, so no single server owns the network or your data.
See the [Introduction](./intro.md) for the full model.

## Do I need an account on a server?

No. Your identity is a set of cryptographic keys held on your devices, not a
server account. Every post is signed by a key you control, so servers cannot
forge or alter your content, and your identity works across any servers you
choose.

## What happens if a server shuts down or bans me?

You post to the world, not to a server. Every post goes to all the servers you
use, and clients read from whichever server has the data. If one server
disappears or refuses to serve your content, your audience can still reach you
through the rest.

## How is Harbor different from Mastodon?

Both are open networks where anyone can run a server. The main difference is
where identity and content live: a Mastodon account belongs to its home server,
while a Harbor identity is a set of keys you hold, and your content lives on
several servers at once. See
[Compared to federated networks](./intro.md#compared-to-federated-networks).

## How is Harbor different from Nostr?

Both use signed events stored on servers you choose, with no account on any
server. Nostr keeps its core deliberately minimal and leaves the rest to
optional extensions. Harbor is more opinionated: it specifies more up front so
that apps and servers behave the same way.

- **One specification.** Nostr's core is a small JSON event format, and almost
  everything else, from replies and reactions to deletes and direct messages,
  comes from optional NIPs that each client and relay may or may not support.
  The [Polycentric Protocol](./protocol/overview.md) defines its event and
  content types (posts, replies, reposts, reactions, follows, profiles,
  reports, labels and verifications) as one typed
  [Protocol Buffers schema](./protocol/data-model.md), and servers expose the
  same [gRPC API](./protocol/grpc.mdx). A client can rely on every server
  understanding the same events.
- **Keys.** A Nostr identity is a single key pair, copied to every device and
  app, and if it leaks or is lost the identity goes with it. A Harbor identity
  is a document of keys: each device gets its own key, keys can be revoked, and
  the identity can be recovered with a new key. See
  [Identities and keys](./protocol/overview.md#identities-and-keys).
- **Complete history.** Each Harbor event links to the ones before it, and
  carries a vector clock recording the latest event it knew of from each of the
  identity's other devices. A client can tell when a server is missing or hiding
  someone's posts, and order posts made on different devices. Nostr events
  stand alone, so a relay can leave some out without anyone noticing. See
  [Hash-linking and proofs](./protocol/overview.md#hash-linking-and-proofs) and
  [Vector clocks](./protocol/overview.md#vector-clocks).
- **Deleting content.** Harbor events point to their content instead of
  carrying it, so a post's content can be deleted while the history stays
  verifiable.
- **Discovery and moderation.** Search, recommended feeds and
  [content labels](./features/moderation.md) are part of what every Harbor
  server provides, and clients combine results from several servers. On Nostr
  these come from whichever relays and third-party services a client chooses
  to support.
- **Verified accounts.** Harbor has
  [verifications](./features/verifications.md) built in: you can prove you own
  accounts on other platforms, and people you choose can vouch for claims about
  you.

## Is Harbor a blockchain?

No. Harbor provides distributed synchronization and censorship resistance
without consensus, so it avoids the latency and throughput costs of blockchain
consensus. See [Why not a blockchain](./intro.md#why-not-a-blockchain).

## Who moderates content?

Moderation is per-server: each server decides what it serves and curates its
own discovery feeds, and you pick the servers whose moderation you trust. See
[Content moderation & removal](./guides/running-a-server.md#content-moderation--removal).

## Can I get a readable username?

Yes. An alias like `you@yourdomain.com` points a domain you control at your
Harbor identity, so people can find you by a memorable handle instead of a
long key. See [Setting Up an Alias](./guides/setting-up-an-alias.md).

## Can I run my own server?

Yes. Anyone can run a server and interoperate with the rest of the network.
See [Running a Server](./guides/running-a-server.md).

## Where do I get help?

See the [Support](./support.md) page for how to reach FUTO by chat or email.
