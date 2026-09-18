#!/usr/bin/env bash
#
# Publishes every @polycentric package to the Forgejo package registry and,
# when NPM_TOKEN is set, to public npm. Packages are published one at a time
# so a version that already exists is skipped instead of aborting the whole
# release (and blocking the packages ordered after it), keeping re-runs
# idempotent.
#
# Env:
#   CI_COMMIT_TAG      release tag, e.g. v2.0.2 (the leading "v" is stripped)
#   GITHUB_SERVER_URL  Forgejo instance URL for the package registry
#   GITHUB_REPOSITORY  owner/repo; the owner selects the Forgejo registry
#   HARBOR_CI_TOKEN    Forgejo registry token; Forgejo publish is skipped if unset
#   NPM_TOKEN          public npm auth token; public publish is skipped if unset
set -euo pipefail

cd "$(dirname "$0")/../.."

VERSION="${CI_COMMIT_TAG#v}"
echo "Publishing @polycentric packages at version ${VERSION}"

# Keep prereleases (e.g. 2.0.0-alpha.1) off the `latest` dist-tag.
DIST_TAG=latest
if echo "$VERSION" | grep -q '-'; then
  DIST_TAG=$(echo "$VERSION" | sed -E 's/.*-([a-zA-Z]+).*/\1/')
  [ "$DIST_TAG" = "$VERSION" ] && DIST_TAG=next
fi
echo "Using npm dist-tag: ${DIST_TAG}"

# Bump every @polycentric package to the release version.
pnpm -r --filter "@polycentric/*" exec npm version "${VERSION}" --no-git-tag-version --allow-same-version

# Topological order; pnpm rewrites workspace:* -> ${VERSION} on publish.
PACKAGES="@polycentric/rs-core-wasm @polycentric/js-storage-sqlite @polycentric/js-core @polycentric/js-browser @polycentric/js-node @polycentric/react-native"

publish_all() {
  registry_url="$1"
  registry_label="$2"
  echo "Publishing to ${registry_label} (${registry_url})"
  pnpm config set @polycentric:registry "${registry_url}"
  for pkg in $PACKAGES; do
    set +e
    output=$(pnpm -r --filter "$pkg" publish --no-git-checks --access public --tag "$DIST_TAG" 2>&1)
    status=$?
    set -e
    echo "$output"
    if [ "$status" -ne 0 ]; then
      if echo "$output" | grep -qiE 'cannot publish over|previously published|already been taken|EPUBLISHCONFLICT|already exists'; then
        echo "==> ${pkg} is already published at ${VERSION} on ${registry_label}; skipping."
      else
        echo "==> ${pkg} failed to publish to ${registry_label}." >&2
        exit "$status"
      fi
    fi
  done
}

if [ -n "${HARBOR_CI_TOKEN:-}" ]; then
  : "${GITHUB_SERVER_URL:?GITHUB_SERVER_URL is required for Forgejo publishing}"
  : "${GITHUB_REPOSITORY:?GITHUB_REPOSITORY is required for Forgejo publishing}"
  forgejo_registry="${GITHUB_SERVER_URL}/api/packages/${GITHUB_REPOSITORY%%/*}/npm/"
  forgejo_host=$(echo "${forgejo_registry}" | sed -E 's#https?://([^/]+).*#\1#')
  echo "//${forgejo_host}/:_authToken=${HARBOR_CI_TOKEN}" >> ~/.npmrc
  publish_all "${forgejo_registry}" "the Forgejo package registry"
else
  echo "HARBOR_CI_TOKEN is not set; skipping Forgejo publish" >&2
fi

if [ -n "${NPM_TOKEN:-}" ]; then
  publish_all "https://registry.npmjs.org/" "public npm"
else
  echo "NPM_TOKEN is not set; skipping public npm publish" >&2
fi
