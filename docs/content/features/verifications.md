---
title: Verifications
sidebar_label: Verifications
sidebar_position: 8
---

# Verifications

Verifications let you prove things about yourself in a way anyone can
check. You publish a **claim**, and either an automated verifier or a
person you choose confirms it by publishing a signed **verification**.
Verified claims appear on your profile.

## Platform claims

A platform claim proves you own an account somewhere else, such as X,
YouTube, GitHub, Discord, Hacker News, Rumble, Twitch, or your own website.
There are two ways a platform claim gets verified:

- **Link in your bio.** The app gives you a link containing your identity
  key. Paste it into the platform's bio, channel description, or About
  section, then press Verify. The verifier reads the public page, finds
  your link, and publishes the verification. If you later remove the link,
  the verification can be revoked.
- **Sign in.** For platforms like X and Discord, you sign in to the
  platform instead. The verifier confirms the account you signed in with
  matches the claim.

## Claims vouched by people

Other claim types, such as Occupation, Skill, Education, or Freeform, are
verified by people instead of bots. Create the claim, pick a person, and
they get a request in their Verifications inbox. If they vouch for it,
their verification appears with your claim, and on their profile under
Verifications Vouched.

## Where verifications live

Your Verifications tab has an **Outbox** with the claims you've made and an
**Inbox** with claims others have asked you to vouch for. On any profile,
the Verifications Claimed and Verifications Vouched tabs show both sides.

Like everything on Harbor, claims and verifications are signed events, so a
verification can't be forged and doesn't depend on any one server staying
online.

:::info[For developers]
Platform verifications are published by a verifier bot. See
[Verifiers](../protocol/verifiers.md) for how verification events, the
claim schema, and the bot's HTTP API work,
[Host a Verifier Bot](../guides/self-hosting-a-verifier.md) to run your
own, and [Add a Platform Verifier](../guides/add-a-platform-verifier.md)
to support a new platform.
:::
