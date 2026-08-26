# Polycentric Mobile

## temporary notes

Android.sys.req.tested

- jvm 25
- jdk 17

must have path to sdk defined, easiest to create android/local.properties after prebuild
`sdk.dir = /path/to/sdk`

node.sys.req.tested

- node v22.4.1
- npm or yarn package managers enforced

### getting node

use nvm: https://github.com/nvm-sh/nvm

### getting yarn

just use npm, if opposed you can use yarn.

after node installation and setup

```bash
corepack enable
corepack prepare yarn@latest --activate
```

## E2E tests (Maestro)

UI end-to-end flows live in `e2e/` at the repo root and run with
[Maestro](https://maestro.mobile.dev) against a build that carries its own
JavaScript bundle, on a connected device or emulator.

```bash
# One-time: install the Maestro CLI and the JDK it runs on.
curl -fsSL "https://get.maestro.mobile.dev" | bash
brew install openjdk
export PATH="$PATH:$HOME/.maestro/bin"

# Build, install, then run all flows.
pnpm ios:e2e
pnpm -w test:e2e:ios
```

Flows launch with `clearState: true`, so they are repeatable and each run
starts from the onboarding welcome screen.

Full instructions, including Android and CI, are in the
[End-to-End Testing](../../docs/content/developer/e2e-testing.md) docs.
