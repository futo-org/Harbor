---
title: Supported platforms
sidebar_label: Supported platforms
sidebar_position: 2
---

# Supported platforms

The verifier bot ships with verifiers for the platforms below. Each uses one of
two methods:

- **Text** — reads the account's public bio/description (via the platform's API,
  or a headless browser where noted) and checks for the user's token.
- **OAuth** — the user signs in to the platform; the bot confirms the
  authenticated account matches the claim. OAuth platforms require credentials
  (see [Self-hosting](self-hosting#environment-variables)).

| Platform | Method | OAuth credentials required |
|---|---|---|
| Discord | OAuth | Yes |
| GitHub | Text | — |
| GitLab | Text | — |
| Hacker News | Text | — |
| Instagram | OAuth | Yes |
| Kick | Text (headless browser) | — |
| Nebula | Text | — |
| Odysee | Text | — |
| Patreon | OAuth | Yes |
| Rumble | Text | — |
| SoundCloud | Text | — |
| Spotify | OAuth | Yes |
| Spreadshop | Text | — |
| Substack | Text | — |
| Twitch | Text | — |
| Vimeo | Text | — |
| Website | Text | — |
| X | OAuth | Yes |
| YouTube | Text | — |

The authoritative list is the set of platforms registered in
`services/verifier-bot/src/platforms/platforms.ts`.
