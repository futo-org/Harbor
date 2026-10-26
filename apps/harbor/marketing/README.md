# Store listings

Copy, screenshots and graphics for the App Store and Google Play. Everything is generated from `source/` and committed, so changes are reviewed in PRs. CI checks the generated files are current and pushes them.

```
source/listing.mjs      Text, URLs, categories, declarations
source/data.mjs         Fictional people, posts, slide headlines
source/screens.mjs      App screen mockups
source/render.mjs       Screenshots, feature graphic, icons
source/export.mjs       app-store/ and play-store/
app-store/              listing.json
play-store/             listing.json, data-safety.csv
screenshots/            iphone-6.9, ipad-13, android-phone, android-tablet-10, feature graphic, header, search
icons/                  App Store 1024, Play 512
```

## Workflow

```sh
node apps/harbor/marketing/source/export.mjs   # text, JSON, data safety CSV
node apps/harbor/marketing/source/render.mjs   # images (needs Chrome)
```

Commit the results. The PR workflow runs `export.mjs --check`. Merging to `develop` runs `deploy-store-listing.yml`, which can also be dispatched with `dry_run`.

## What is pushed

App Store Connect (`.forgejo/scripts/publish-app-store-listing.mjs`): name, subtitle, privacy policy URL, categories, content rights, age rating, price, availability, copyright, release type, description, keywords, promo text, URLs, What's New, review notes, screenshots, header and search images. Only the editable version is touched. Fields and images are diffed before writing.

Google Play (`.forgejo/scripts/publish-play-listing.mjs`): title, descriptions, screenshots, feature graphic, icon, contact details, data safety form.

Not available through either API, kept in `listing.mjs` and set in the consoles: Apple App Privacy labels; Play privacy policy URL, content rating, app access, ads, target audience, category and tags.

## Secrets

1Password items in `harbor_infra_tf`, published by harbor-infra (`futo-git/secrets`).

| Secret | Item |
| --- | --- |
| `ASC_KEY_ID`, `ASC_ISSUER_ID`, `ASC_PRIVATE_KEY` (.p8), `ASC_REVIEW_*` | `APPLE_ASC`, one field per secret |
| `PLAY_SERVICE_ACCOUNT_JSON` | `PLAY_SERVICE_ACCOUNT_JSON`, key of `play-console-service-account@futo-polycentric.iam.gserviceaccount.com` |

## Screenshots

HTML mockups rendered with Chrome using the app's palette, fonts and icons. All content is fictional. Photos are from picsum.photos (Unsplash license).
