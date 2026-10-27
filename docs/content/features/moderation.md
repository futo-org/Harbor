---
title: Content Moderation
sidebar_label: Content Moderation
sidebar_position: 9
---

# Content Moderation

Moderation on Harbor is something you configure, not something configured
for you. No single company decides what you see.

## Content labels

Posts can carry labels applied by a moderation service: Hate, Self-Harm,
Sexually Suggestive, Sexually Explicit, and Violence. In Settings, Content
Moderation, you choose per label whether to **Hide** matching posts, **Warn**
(the default, which covers the post until you reveal it), or **Show** them.
The warning names the labels and who applied them.

## Reporting

Report any post from its "…" menu, with a category such as spam, hate,
violence, child safety, or copyright. Reports go to the moderation service
trusted by your servers.

## Moderators

Moderators of a server get a Moderation section in Settings:

- **Reports** lists the reports on every server they moderate, oldest
  first, with the post inline and the server it was filed on, under Open,
  Resolved, Dismissed and All tabs. An open report is handled by **Delete
  post**, which removes that post from that server, or **Ban user**, which
  removes everything the author published there. Either resolves the
  report on that server; the same post reported on another server is
  handled there. **Dismiss** records that no action was needed and **Mark
  as resolved** covers action taken elsewhere. Resolved and dismissed
  reports can be reopened.
- **Ban list** per server.

## Your servers, your rules

Each server sets its own policy for what it hosts and recommends, and you
pick the servers whose moderation you trust. Because content is published
to several servers, one server's removal decision doesn't silence a user
for people on other servers. See
[Content moderation & removal](../guides/running-a-server.md#content-moderation--removal)
for how this works on the server side.
