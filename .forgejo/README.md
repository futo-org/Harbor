# CI

Forgejo Actions. Images and charts go to `registry.futo.org/harbor`, JS
packages to npm, releases to Forgejo releases. Workflows, actions, scripts
and the CI toolchain images (`images/`) all live here.

## Workflows

| Workflow | Runs on | Does |
|---|---|---|
| `pr.yml` | pull requests | lint, package, image and docs builds, unit, integration and e2e tests, docs preview |
| `pr-app.yml` | `PR / Build App` label on a PR, or `PR / Build App / Android APK`, `PR / Build App / Android AAB`, `PR / Build App / iOS` for one target | staging EAS builds |
| `pr-docs-cleanup.yml` | PR closed | remove the docs preview |
| `deploy-<component>-staging.yml` | push to `develop` touching the component, manual run | staging deploy |
| `deploy-<component>-production.yml` | manual | production deploy |
| `release.yml` | `v*` and `app-*` tags | packages, images, production apps, the release |

Shared steps are composite actions in `.forgejo/actions`; a job is a
container, a checkout and an action. `pr.yml` starts with `changes.mjs` (the
plan: which jobs run, from the changed paths) and builds missing CI images.

Rules:

- A `pr.yml` job runs when its paths changed, or the workflow (or an action
  or script it uses) changed. Tags build everything.
- Images are pushed as `<image>:<sha>`; every run builds the ones it needs
  and BuildKit's registry cache decides what that costs.
- The rs-core libraries (wasm, Android, iOS) are pushed as
  `ci/rs-core-<name>:<key>`, the key a hash of the sources that produce that
  library (`rs-core-libraries.sh`). A job takes the copy for its sources and
  builds the library only when there is none, so a squash commit shares its
  PR's copy and a copy for other sources is never used. Web and the verifier
  bot need only wasm, the app only Android and iOS.
- `pr.yml`'s last job, `Complete`, fails if any job in the run did. It is the
  required status check on `develop` (`PR / Complete (pull_request)`, set in
  harbor-infra `futo-git/org`), so a PR that ran nothing still reports.

## Deploys

Components: `server`, `moderation`, `push-notifications`, `grayjay-migrator`,
`scraper`, `verifier-bot`, `web`, `app`, `docs`.

`deploy-<component>-staging.yml` runs on a push to `develop` that touches the
component's paths (or the workflow and the actions it uses), and manually. A
service deploy builds the commit's image (the Rust services build their
binaries in a job of their own first; `web` and `verifier-bot`
first build the SDKs, and wasm when its copy is missing), packages and pushes
the component's chart as
`<next patch>-<ref>.g<sha>` with the commit as `appVersion`, then moves the
image and chart `staging` tags. helm-controller watches the chart tag. `web`
also uploads its bundle to the static bucket. `app` builds the staging apps on
EAS and submits them; `ios_e2e` runs the iOS suite on the store build. `docs`
deploys to Cloudflare Pages.

`deploy-<component>-production.yml` moves the `staging` image and chart tags
to `production`, so production gets what staging runs. `sha` deploys that
commit instead; its image and chart must exist, and a commit has a chart only
for the components deployed at it. `deploy-app-production.yml` builds the
production apps from `develop`'s head and submits them.

`node .forgejo/scripts/deployed.mjs` prints the commit each chart's `staging`
and `production` tag pins, no login needed.

## Runners

Repository variables with defaults: `CI_RUNNER` (`docker`), `CI_RUNNER_MACOS`
(`macos`), `CI_RUNNER_IOS_DEVICE` (`ios-device`), `CI_NODE_IMAGE`
(`node:24-bookworm`), `CI_TOOLS_IMAGE` (`node:24-alpine`), `CI_REGISTRY`.

The docker runner must mount the docker socket into job containers (compose
integration tests, service containers, the CI image builds). The mac
runners are the Tart VM (`ios-build`) and the device mac with the ad-hoc
profile and Maestro (`ios-e2e`).

## Secrets and variables

Provisioned by harbor-infra (`futo-git/ci_values`, `ci_variables`).

- `REGISTRY_USER` (variable), `REGISTRY_TOKEN`: zot API key of the CI user.
- `EXPO_TOKEN`, `OPEN_ROUTER_API_TOKEN`, `CLOUDFLARE_API_TOKEN`,
  `CLOUDFLARE_ACCOUNT_ID`,
  `MATTERMOST_RELEASES_WEBHOOK`, `VERIFIER_BOT_ENV_VARS` (base64 `.env`).
- `STATIC_S3_ENDPOINT`, `STATIC_S3_ACCESS_KEY_ID`,
  `STATIC_S3_SECRET_ACCESS_KEY`; variables `STATIC_S3_BUCKET`,
  `STATIC_PUBLIC_BASE_URL`.
- `SCCACHE_R2_ENDPOINT`, `SCCACHE_R2_ACCESS_KEY_ID`,
  `SCCACHE_R2_SECRET_ACCESS_KEY`; variable `SCCACHE_R2_BUCKET`.
- Variables `EXPO_PUBLIC_HARBOR_SEED_SERVERS`,
  `EXPO_PUBLIC_HARBOR_VERIFIER_SERVERS`.

## Caching

Runners are ephemeral, so `actions/cache` is useless. `r2-cache` keeps
tarballs in the R2 bucket: each Rust job's cargo registry and `target/`
(keyed by rustc version and Cargo files), plus Gradle. sccache covers the
crates that still compile.

Image builds run rootless BuildKit inside the job container (`ci/buildkit`,
`buildctl-daemonless.sh`), no docker daemon involved, so nothing survives the
job. Layers are pushed zstd-compressed. No image compiles or installs in
BuildKit: a job in the language's image builds what the Dockerfile's build
stage would, `rust-binaries` in `ci/rust` (the `r2-cache` target and
sccache, with a `--timings` report kept as an artifact) and `js-build` in the
node image (`pnpm deploy` plus the build output), and uploads it as one
tarball (`stage-artifact`). `service-image`'s `stage-artifact` input puts that
in place of the `stage` (`builder` for Rust, `build` for web, scraper and
verifier bot) as a named context, so only the runtime stage runs. Its layers (apt installs such as Chromium) are reused through
cache metadata inlined in the `:staging` image, with no separate cache
upload. Local builds still run every stage. Rootless BuildKit needs the
runner to start job containers with seccomp and AppArmor unconfined
(harbor-ops runner config).

## Release notes

`release-notes.mjs` has Claude (via OpenRouter) write user-facing notes from
the subjects of the commits since the last `v*` tag, dropping purely
technical changes. A `Changelog: <category>` line in the squash commit (from
the PR template, carried over by `default_merge_message/SQUASH_TEMPLATE.md`)
is passed along as a hint. The same notes serve a release (the Forgejo
release and the Mattermost announcement) and every staging and production
app build between releases (`apk-deploy` jobs, into the `latest.json` the
app shows in its update sheet), so a build's notes grow through the cycle
and restart at each release. If they cannot be written, the build still
publishes with the commit title.

## Forgejo notes

- Artifacts need `forgejo/upload-artifact@v4` and
  `forgejo/download-artifact@v4`, and stay inside one workflow run.
- A job's `if` is evaluated by the runner, so a skipped job on a label with
  no online runner waits forever.
- An empty matrix creates no job and blocks anything that `needs` it.
- No `workflow_run` event, so a deploy cannot follow a CI run; it checks the
  registry for the commit's image instead.
