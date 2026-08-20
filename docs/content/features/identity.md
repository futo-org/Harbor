---
title: Identity & Devices
sidebar_label: Identity & Devices
sidebar_position: 10
---

# Identity & Devices

Your Harbor identity is a set of cryptographic keys held on your devices,
not an account on a server. Everything you publish is signed with those
keys, which is why servers can't forge or edit your content.

## Adding a device

Use Settings, Pair Identity to add another device to your identity. Your
existing device shows a QR code and a short pairing code; the new device
scans or types it, and both sides confirm a matching emoji fingerprint
before the new device is approved.

There is currently no export or backup file for an identity, so pairing a
second device is the recommended way to make sure you don't lose access.

## Multiple identities

You can hold more than one identity on a device and switch between them
from the identity switcher, for example a personal and a project identity.

## Choosing your servers

Settings, Configure servers lists the servers your identity publishes to.
Add servers by URL, remove ones you no longer trust, and your content syncs
to whatever set you choose. Anyone can run one; see
[Host a Server](../guides/running-a-server.md).
