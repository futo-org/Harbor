# Store listings

Screenshots for the Chrome Web Store and Edge Add-ons. They are generated from `source/` and committed, so changes are reviewed in PRs, as for the app (`apps/harbor/marketing`).

```
source/data.mjs         Fictional page, comments, slide headlines
source/screens.mjs      Browser window and side panel mockups
source/render.mjs       Screenshots
screenshots/web-store/  1280x800
```

## Workflow

```sh
node apps/harbor-browser-extension/marketing/source/render.mjs   # needs Chrome
```

Commit the results. They are uploaded to the stores by hand.

## Screenshots

HTML mockups rendered with Chrome. The posts, avatars, palette, fonts and icons are the app's mockups (`apps/harbor/marketing/source/screens.mjs`), and the people are the app's fictional ones. All content is fictional. The photo is from picsum.photos (Unsplash license).
