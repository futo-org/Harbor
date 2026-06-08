---
title: Introduction
sidebar_label: Introduction
slug: /
sidebar_position: 1
---

# Polycentric

Polycentric is an open-source, distributed social network. Content is published to
multiple servers at once. If one server stops serving a user's content, clients
fetch it from another server that holds a copy.

The [web client and app](https://polycentric.io) and the
[source code](https://gitlab.futo.org/polycentric/polycentric) are public.

## Model

- **Distributed.** No single server owns the network. A user picks which servers
  store their data, and clients read from whichever servers have it. The servers a
  user publishes to can be entirely disjoint from the servers used by the people
  they follow.

- **Self-sovereign identities.** An identity is a set of cryptographic keys, not a
  server account. Every event is signed by a key the user controls. Servers cannot
  forge or alter a user's events, and a user's data survives as long as one server
  still hosts it.

- **Server-provided discovery.** Search and recommendation feeds are computed by
  servers, because they are impractical to do on the client alone. Clients query
  several servers, deduplicate the results, and attribute each result to the server
  that returned it. This limits how much any single server can manipulate what a
  user sees.

## Compared to federated networks

Polycentric shares goals with federated networks like
[Mastodon](https://joinmastodon.org/) (built on ActivityPub): no single company owns
the network, anyone can run a server, and users can follow each other across servers.

The main difference is where identity and content live.

- **Identity.** On a federated network your account belongs to your home server
  (`@user@server`); losing or leaving that server means migrating, and your old
  address breaks. On Polycentric your identity is a set of keys you hold, independent
  of any server.
- **Content location.** Federated servers each store their own copy and push updates
  to each other. On Polycentric a user publishes to several servers at once, and
  clients read from whichever server has the data — so one server going down or
  refusing to serve content does not take a user offline.
- **Trust.** Federation is server-to-server: you trust your home server, and servers
  trust each other to relay accurately. On Polycentric every event is signed by the
  user, so a server cannot forge or alter content, and clients verify it directly.
- **Moderation.** Federated moderation is per-server, including defederating whole
  servers. Polycentric servers curate their own discovery feeds, but content stays
  reachable from other servers regardless of any one server's choices.

## Cryptography

Each event is signed with a key held only by the user's device. Servers never hold
private keys. An identity can authorize multiple keys (for multiple devices) and
revoke them, so a user can move between devices without handing control to a server.

## Why not a blockchain

Polycentric provides distributed synchronization and censorship resistance without
consensus. There is no global ordering requirement and no proof-of-work, so the
network avoids the latency and throughput costs of blockchain consensus.
