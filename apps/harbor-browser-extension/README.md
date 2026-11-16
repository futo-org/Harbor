# Harbor Anywhere

Browser extension for Chrome, Brave, Firefox and Safari, built with
[WXT](https://wxt.dev).

Clicking the toolbar icon opens Harbor in the browser's sidebar. Safari has no
sidebar API for extensions, so there it opens as a popup.

The extension has no UI of its own. It frames the Harbor app's
`/anywhere/browser-extension/panel` route (`apps/harbor/src/features/anywhere/browser-extension`) and tells it which page the active
tab is on. It reads that page's canonical address, description and image
(`src/page.ts`), which is why it asks for access to every site.

## Develop

```sh
pnpm run:web       # in the repo root: the Harbor app on http://localhost:8081
pnpm dev:chrome    # builds dist/chrome-mv3-dev and rebuilds on change
pnpm dev:firefox   # builds dist/firefox-mv3-dev
```

Load the `-dev` folder once as described under "Install a local build". Dev
builds frame the Expo dev server, so app changes hot reload in the sidebar. Set
`WXT_HARBOR_DEV_URL` if it is not on `http://127.0.0.1:8081`.

The sidebar frames `127.0.0.1` while the Harbor tab is on `localhost`, so the
two keep separate identities, as an installed extension and harbor.social do.
Open the sidebar beside a signed-in `http://localhost:8081` tab to be asked to
sign the extension in.

## Build

Builds package the Harbor web export into the extension.

```sh
pnpm build:all     # web export, then dist/chrome-mv3, firefox-mv3, safari-mv3
pnpm build:app     # only the web export (apps/harbor/dist)
pnpm build:chrome  # only one browser, from the existing web export
pnpm zip           # store upload zips for Chrome and Firefox
```

## Install a local build

- **Chrome / Brave**: open `chrome://extensions` (`brave://extensions`), turn on
  Developer mode, choose "Load unpacked" and pick `dist/chrome-mv3`.
- **Firefox**: open `about:debugging#/runtime/this-firefox`, choose "Load
  Temporary Add-on" and pick `dist/firefox-mv3/manifest.json`.
- **Safari** (macOS with Xcode only): wrap the build in an app, then run it from
  Xcode and enable the extension in Safari's settings.

  ```sh
  xcrun safari-web-extension-converter dist/safari-mv3
  ```
