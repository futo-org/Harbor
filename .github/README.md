# GitHub Actions CI

GitHub Actions port of the GitLab pipeline (`.gitlab-ci.yml` + `.gitlab/ci/*`,
which remain in place during the transition). Images, Helm charts, and
environment tags target `ghcr.io/<owner>/<repo>` instead of the GitLab
Container Registry; npm/APK/crate publishing targets GitHub Packages, npmjs
and GitHub Release assets instead of the GitLab package registries.

The default branch is `develop`; releases are cut only from `v<major>.<minor>.<patch>`
tags (the per-component GitLab tags like `server-*`/`js-sdk-*` are gone).

## Workflows

- `ci.yml` — the build → deploy → release chain: SDK builds, service/app
  images, EAS builds, chart publishing, staging/production deploys, and the
  GitHub Release on `v*` tags. Job selection comes from the shared paths
  filter (`.github/filters.yml`); a `v` tag builds and publishes everything.
- `checks.yml` — leaf checks (rustfmt/clippy/unit tests, biome, typechecks,
  chart lint) nothing else depends on.
- `integration.yml` — server and moderation compose-stack integration tests.
- `scan.yml` — trivy, uploading SARIF to code scanning.
- `setup-images.yml` — builds the `rust` / `rust-dind` CI toolchain images
  from `.gitlab/images/` to `ghcr.io/<owner>/<repo>:rust[-dind]`.
- `docs.yml` — docs build, production deploy, and per-PR Cloudflare Pages
  review apps (`pr-<n>` instead of `mr-<n>`), torn down when the PR closes.
- `_service-image.yml`, `_deploy.yml`, `_eas-build.yml` — reusable pieces
  called from `ci.yml`.

## Bootstrap

1. Run **CI images** (`setup-images.yml`) once via *Run workflow* — the main
   CI jobs run in the images it pushes.
2. Create the deploy environments (`staging-<name>` and `production-<name>`,
   matching the `_deploy.yml` calls in `ci.yml`) and add required reviewers
   on the `production-*` ones — that approval gate replaces GitLab's
   `when: manual` production deploys.
3. Point helm-controller/flux at `oci://ghcr.io/<owner>/<repo>/charts` (it
   previously pulled from the GitLab registry).

## Secrets

- `EXPO_TOKEN` — EAS builds.
- `NPM_TOKEN` — public npm publish on release (skipped if unset).
- `CLOUDFLARE_API_TOKEN`, `CLOUDFLARE_ACCOUNT_ID` — docs Pages deploys.
- `VERIFIER_BOT_ENV_VARS` — base64-encoded `.env` for the verifier-bot test
  suite (the *content*, not a file path as on GitLab).

Repository **variables**: `EXPO_PUBLIC_POLYCENTRIC_SEED_SERVERS`,
`EXPO_PUBLIC_POLYCENTRIC_VERIFIER_SERVERS` (app web image build args).

Everything else authenticates with the ambient `GITHUB_TOKEN`.

## Behavioural differences from GitLab

- Manual EAS builds on merge requests are now `workflow_dispatch` runs of
  **CI** on the branch (GitHub has no per-job manual trigger in PRs).
- The `docs` redeploy tag is `workflow_dispatch` on **Docs**.
- Trivy results upload as SARIF to code scanning instead of a GitLab code
  quality report; JUnit reports upload as plain artifacts.
- Integration tests no longer need the `docker-compose-integration`
  resource group: each job has its own runner VM and Docker daemon.
- The rn-ios build runs directly on a GitHub-hosted macOS runner instead of
  the macscript/tart/cirrus indirection.
- Release npm publishes go to GitHub Packages + npmjs. Note GitHub Packages
  requires the package scope to match the repository owner — if this repo
  does not live in a `polycentric` org, the `@polycentric/*` GitHub Packages
  leg will be rejected and only the public npm leg is usable.
