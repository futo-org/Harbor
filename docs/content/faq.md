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
