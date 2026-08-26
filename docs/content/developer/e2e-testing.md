---
title: End-to-End Testing
sidebar_label: End-to-End Testing
sidebar_position: 4
---

# End-to-End Testing

[Maestro](https://maestro.dev) flows live in `e2e/` at the repo root, split
into `native/` for the app on a device or emulator and `web/` for the browser.
Native flows launch the app named by `MAESTRO_APP_ID`, so the same flows run
against any variant:

```bash
pnpm test:e2e:ios
pnpm test:e2e:android
MAESTRO_APP_ID=org.futo.polycentric.staging pnpm test:e2e:android
```

Flows run against builds that carry their own JavaScript bundle, never a
development build. A development build pulls its bundle from Metro over the
local network, which iOS gates behind a permission prompt that resets on every
install and cannot be tapped by a test runner.

Targets are picked automatically, preferring a plugged-in phone over a booted
simulator or emulator. `pnpm --filter harbor-e2e devices` lists what this
machine can see, and `MAESTRO_DEVICE` overrides the choice:

```bash
MAESTRO_DEVICE=<id> pnpm test:e2e:ios
```

Maestro is a JVM CLI rather than an npm package, so it and a JDK are installed
once, outside pnpm. `spawn ENOENT` from these scripts means the CLI is missing;
"Unable to locate a Java Runtime" means the JDK is.

```bash
curl -fsSL "https://get.maestro.mobile.dev" | bash
brew install openjdk
export PATH="$PATH:$HOME/.maestro/bin"
```

Homebrew keeps its JDK out of the system paths; the test scripts find it, so
only Maestro itself needs to be on your PATH.

## Android

`staging-apk` and `production-apk` builds install as they are. Take the APK
from the pipeline's `app-android-apk-*` job, or build one:

```bash
cd apps/harbor
npx eas-cli build --platform android --profile staging-apk
```

```bash
adb install -r harbor.apk
MAESTRO_APP_ID=org.futo.polycentric.staging pnpm test:e2e:android
```

Use `org.futo.polycentric` for the production APK. Play builds (`staging` and
`production`) carry a `.store` package suffix, so they can sit alongside a
sideloaded build without conflicting.

## iOS

### Local build

```bash
pnpm -C apps/harbor ios:e2e
pnpm test:e2e:ios
```

`ios:e2e` builds Harbor Dev in Release configuration and installs it on an
attached device, signed with the team profile Xcode manages, so no certificate
or profile setup is involved. Rebuild after changing app code, since the bundle
is baked in. First compile is a full one; later ones are incremental.

Seed servers come from EAS rather than the repo, so the build runs under
`eas env:exec staging` and you need to be logged in (`eas login`) or have
`EXPO_TOKEN` set. Without them the app falls back to `http://localhost:3000`,
which on a phone means the phone itself, and creating an identity fails while
onboarding stays put.

Creating an identity registers for push, which prompts once per install. Flows
accept it themselves, so no one has to watch the screen.

Start here. Everything below is only for testing the archive that goes to the
App Store.

### Store build, on a device

A store archive is signed for the App Store, and that signature lists no
devices, so it installs only through TestFlight. Re-signing it against an
ad-hoc profile replaces the signature, the embedded profile and the
entitlements, and nothing else. The executable and JS bundle stay as built, so
what you test is the binary you ship, in its release configuration: not
debuggable, production push environment.

Set this up once.

**Register the device.** `xcrun devicectl list devices` prints the identifier
of an attached device; add it in the
[Apple Developer portal](https://developer.apple.com/account/resources) under
**Devices → +**.

**Create the ad-hoc profile.** In the portal under **Profiles → + → Ad Hoc**,
choose the App ID you are testing (`org.futo.polycentric.staging` for staging,
`org.futo.polycentric` for production), select the team's distribution
certificate, tick the device, and **Generate**. Download it, then:

```bash
export IOS_ADHOC_PROFILE=~/Downloads/<the-name-you-gave-it>.mobileprovision
```

**Get that certificate into your keychain**, if it is not there already.
`security find-identity -v -p codesigning` lists an `Apple Distribution` or
`iPhone Distribution` line when it is. The private key lives in EAS:

```bash
cd apps/harbor
npx eas-cli credentials --platform ios
```

Choose the build profile you are testing, then **Credentials.json:
Upload/Download credentials between EAS servers and your local json**, then
**Download credentials from EAS to credentials.json**. That leaves a
certificate and its password in `apps/harbor`, both gitignored and both
secrets. The re-signing tool imports them for you on its first run.

Then, per build:

```bash
cd apps/harbor
npx eas-cli build:list --platform ios --limit 5   # find the build id
node ../../tools/expo/resign-build.js <build-id> --output /tmp/harbor-adhoc.ipa
```

```bash
MAESTRO_APP_ID=org.futo.polycentric.staging \
MAESTRO_APP_FILE=/tmp/harbor-adhoc.ipa \
pnpm test:e2e:ios
```

`MAESTRO_APP_FILE` is what gets installed before the flows run, and what
`clearState` reinstalls from.

`resign-build.js` waits for the build if it is still running, downloads its
archive, and re-signs it. Point it at a different profile with `--profile`, or
a different certificate with `--identity`.

## Web

Web flows name a `url` instead of an `appId`, so they need no device and
Maestro drives its own Chromium.

```bash
pnpm run:web        # serves on localhost:8081
pnpm test:e2e:web
```

Point them at a deployed environment with `MAESTRO_WEB_URL`:

```bash
MAESTRO_WEB_URL=https://harbor.social pnpm test:e2e:web
```

These run through `maestro-runner` like the native flows. Maestro's own web
support is in beta and leaves its browser open once a flow ends, so the command
never returns.

## In CI

`app-web-e2e` runs the web flows on every pipeline that builds the web image,
against that very image, started as a job service. It drives a headless
Chromium on the shared runners, so it needs no device and no setup, and it
gates the pipeline like any other test job.

`app-ios-e2e-staging` and `app-ios-e2e-production` re-sign and drive the build
their pipeline produced. Both are manual and neither blocks a pipeline, since
both run on a self-hosted macOS runner tagged `ios-device` with a phone
attached.

EAS credentials cannot be downloaded non-interactively, so that runner is set
up once, by hand, rather than through CI variables: Maestro and a JDK
installed as above, the distribution certificate in its login keychain, and the
ad-hoc profile on disk.
`EXPO_TOKEN`, already set for the build jobs, is what lets the job download the
archive. The runner then needs only:

| Variable | |
| --- | --- |
| `IOS_ADHOC_PROFILE` | path to the ad-hoc `.mobileprovision` on the runner |
| `APPLE_TEAM_ID` | `2W7AC6T8T5`, for signing the on-device test runner |
| `MAESTRO_DEVICE` | only if more than one device is attached |

## If an iOS build will not install

A profile vouches only for the certificate it was issued against, and only for
the devices it lists. Get either wrong and the device reports
`ApplicationVerificationFailed`, blaming a missing profile rather than the
signature. `resign-ipa.sh` checks both pairings and refuses to produce an
archive that cannot install, so trust its message over the device's.

What it cannot check is a profile created before you registered the device: it
is valid, it simply does not list that device. Add the device, download the
profile again, and re-run.

An ad-hoc archive is not debuggable, the same as the store build. If Maestro
cannot attach to one, pass a development profile as `--profile` instead. The
app is identical; only the signature differs.

`clearState` resets the app between flows. If state survives on a physical
device, uninstall it first:

```bash
xcrun devicectl device uninstall app --device <device-udid> org.futo.polycentric.dev
```
