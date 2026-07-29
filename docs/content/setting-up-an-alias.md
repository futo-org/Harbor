---
title: Setting Up an Alias
sidebar_label: Set Up an Alias
sidebar_position: 3
---

# Setting Up an Alias

An alias is a human-readable name like `you@yourdomain.com` that points at your
Harbor identity, so people can find you by a memorable handle instead of a
long key.

**Before you start, you need:**

- A **domain you control** and can serve a file from over HTTPS.
- Your **Harbor identity** — the long hex string that identifies your
  account. 

## 1. Publish the lookup file

On your domain's web server, serve a file at:

```
https://yourdomain.com/.well-known/polycentric.json
```

with this content — replace `you` with the name you want (the part before the
`@`) and the value with your identity:

```json
{
  "names": {
    "you": "0a2abecb223dbd57…your-full-identity…846c4722"
  }
}
```

Three requirements:

- The name key must be **lowercase** (`you`, not `You`).
- Serve it with the header **`Access-Control-Allow-Origin: *`** — the web client
  fetches it from the browser, which needs this to read it cross-origin.
- It must be reachable over **HTTPS**.

You can list several names in the same file if you host aliases for more than
one person. You can also use the name "*" to specify the identity that can use the bare domain alias (i.e. simply @domain.com instead of @user@domain.com).

## 2. Set the alias on your profile

In the app:

1. Open your profile and choose **Edit profile**.
2. In the **Alias** field, enter your full alias, e.g. `you@yourdomain.com`.
3. **Save**.

On save, the app fetches your domain's file and checks that it points back at
your identity. If it does, the alias is saved and shown on your profile. If not,
you'll see **"This alias isn't linked to your profile."** — re-check step 1.

## Troubleshooting

If saving fails or the alias doesn't appear:

- **File not reachable** — open the `…/.well-known/polycentric.json` URL in a
  browser; it must load over HTTPS.
- **CORS** — the response must include `Access-Control-Allow-Origin: *`.
- **Wrong identity** — the value must be your exact identity hex, copied in full.
- **Uppercase key** — the name under `names` must be lowercase and match the part
  before the `@`.

## Removing an alias

Open **Edit profile**, clear the **Alias** field, and save.
