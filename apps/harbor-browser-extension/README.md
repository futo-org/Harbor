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

Builds package a static export of the Harbor web app into the extension. The
web app itself is rendered on request, so this is a separate export
(`HARBOR_WEB_OUTPUT=static`).

```sh
pnpm build:all     # web export, then dist/chrome-mv3, firefox-mv3, safari-mv3
pnpm build:app     # only the web export (apps/harbor/dist-static)
pnpm build:chrome  # only one browser, from the existing web export
pnpm zip           # store upload zips for Chrome and Firefox
```

## Reproduce a store build

For store reviewers: the extension packages the Harbor web app
(`apps/harbor`, bundled and minified by Expo's Metro) and its SDKs
(`packages`, with rs-core compiled from Rust to WebAssembly), so it is built
from the whole repository. `modules/harbor-app.ts` splits the app's bundle
into scripts under 4MB.

Needs Linux or macOS, the Node version in `.nvmrc`, the pnpm version in the
root `package.json` (`packageManager`), and Rust with the
`wasm32-unknown-unknown` target and `wasm-opt`.

```sh
pnpm install
pnpm --filter @polycentric/js-wasm build --profile wasm-release
wasm=packages/js/drivers/js-wasm/src/generated/wasm/polycentric_core.wasm
wasm-opt -Oz -g "$wasm" -o "$wasm"
pnpm --filter @polycentric/react-native-sdk generate
pnpm --filter './packages/js/js-sdk' --filter './packages/js/node-sdk' --filter './packages/js/drivers/js-datastore-*' --filter './packages/js/drivers/js-filestore-*' run build
pnpm --filter @polycentric/react-native-sdk build

cd apps/harbor
APP_VARIANT=production HARBOR_WEB_OUTPUT=static npx expo export --platform web --output-dir dist-static
cd ../harbor-browser-extension
APP_VARIANT=production EXTENSION_VERSION=<version> pnpm exec wxt zip -b firefox --mv3
```

`<version>` is the `version` in the submitted `manifest.json`. The services
the build talks to are the `EXPO_PUBLIC_*` values of the `build` job in
`.forgejo/workflows/deploy-browser-extension-production.yml`; set them for
both the export and the zip.

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
