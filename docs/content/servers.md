---
title: Servers
sidebar_label: Servers
sidebar_position: 4
---

import ServerList from '@site/src/components/ServerList';

# Servers

Harbor publishes your content to the servers you choose, and clients ship
with the servers below as suggested defaults. You can change which servers
your identity uses at any time in Settings, Configure servers; see
[Identity & Devices](./features/identity.md#choosing-your-servers).

<ServerList />

Status is checked live from your browser against each server's `/status`
endpoint when you open this page.

## Add your server to this list

Anyone can run a server; see [Host a Server](./guides/running-a-server.md).
To have yours listed here:

1. Make sure it's reachable over HTTPS and that
   `https://your.server/status` responds with `OK.`
2. Open a merge request adding it to
   [`docs/src/data/servers.json`](https://gitlab.futo.org/polycentric/polycentric/-/blob/develop/docs/src/data/servers.json),
   with the URL, who operates it, and a one-line description.

If you'd rather not open a merge request, file a
[work item](https://gitlab.futo.org/polycentric/polycentric/-/work_items)
with the same details instead.
