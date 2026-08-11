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

UI end-to-end flows live in `.maestro/` and run with
[Maestro](https://maestro.mobile.dev) against the dev app
(`org.futo.polycentric.dev`) on a connected emulator or device.

```bash
# One-time: install the Maestro CLI.
curl -fsSL "https://get.maestro.mobile.dev" | bash

# Build and install the dev app, then run all flows.
pnpm android
pnpm test:e2e

# Run a single flow.
maestro test .maestro/onboarding-create-identity.yaml
```

Flows launch with `clearState: true`, so they are repeatable and each run
starts from the onboarding welcome screen.
