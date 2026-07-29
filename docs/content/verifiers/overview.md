---
title: Verifiers
sidebar_label: Overview
sidebar_position: 1
---

# Verifiers

A **verifier** is an automated way to confirm that the owner of a Harbor
identity also controls an account on some external platform (X, GitHub,
YouTube, …). When a user makes a *claim* ("this Harbor identity owns the
GitHub account `futo-org`"), the verifier independently checks the platform and,
if the check passes, publishes a signed **verification** vouching for that
claim.

Verifiers run inside the **verifier bot** (`services/verifier-bot`), a small
Node HTTP service. The bot holds its own Harbor identity and publishes
verifications as that identity, syncing them to the configured Harbor
server(s).

## How a verification works

1. A user publishes a claim on their identity (e.g. a `Platform` claim naming
   their GitHub username).
2. The client asks the bot to verify the claim, referencing it by its
   `EventKey`.
3. The bot fetches the claim, runs the platform's verifier:
   - **Text** verifiers read the account's public bio/description and check it
     contains the user's expected token.
   - **OAuth** verifiers have the user sign in to the platform and confirm the
     authenticated username matches the claim.
4. If the check passes, the bot publishes a `VerificationVerify` event as its
   own identity and pushes it to the servers.

Every platform shares a single claim schema (`Platform`); the platform name is
used only for routing, not to select a schema.

## HTTP API

Routes are derived from each platform's slug (`slug(name)`, e.g. `GitHub` →
`github`, `Hacker News` → `hacker-news`) and its verifier type (`text` or
`oauth`):

| Method & path | Purpose |
|---|---|
| `GET /identity` | The bot's Harbor identity — `{ identity }` (the identity key it publishes verifications under). Clients use this to recognise and trust the bot's verifications. |
| `GET /platforms` | List platforms as `{ name, slug, verifiers }`. |
| `GET /platforms/:slug` | Platform detail: `{ verifierType, platform, slug }`. |
| `POST /platforms/:slug/:type/verify` | Verify the referenced claim and publish a verification. |
| `POST /platforms/:slug/:type/check` | Stateless pre-check (no claim needed): text takes `{ claimFields, token }`, OAuth takes `{ claimFields, challengeResponse }`. Clients run this before publishing a claim. |
| `GET /platforms/:slug/:type/health-check` | Run the verifier's self-test. |
| `GET /platforms/:slug/oauth/url` | (OAuth) Get the URL to send the user to. |
| `GET /platforms/:slug/oauth/callback` | (OAuth) Redirect target; bounces back to the web app. |
| `GET /platforms/:slug/oauth/token` | (OAuth) Exchange the OAuth code for a token. |
| `POST /platforms/:slug/text/get-claim-fields-by-url` | (Text) Derive claim fields from a profile URL. |

See [Supported platforms](platforms) for the full list, and
[Creating a verifier](creating-a-verifier) to add a new one.
