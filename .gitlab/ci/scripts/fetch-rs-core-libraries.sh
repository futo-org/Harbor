#!/bin/sh
# Fetches any rs-core library this pipeline didn't build from the default
# branch's latest pipeline (rs-core-libraries, or the build job itself before
# that exists).
set -eu

tmp=$(mktemp -d)
trap 'rm -rf "$tmp"' EXIT

download() {
  url="${CI_API_V4_URL}/projects/${CI_PROJECT_ID}/jobs/artifacts/${CI_DEFAULT_BRANCH}/download?job=$1"
  status=$(curl -sSL -o "$2" -w '%{http_code}' --header "JOB-TOKEN: ${CI_JOB_TOKEN}" "$url")
  # A job token from an unprotected ref can't read a protected ref's
  # artifacts; the project is public, so fetch them without one.
  if [ "$status" != 200 ]; then
    echo "$url: $status with job token, retrying anonymously" >&2
    status=$(curl -sSL -o "$2" -w '%{http_code}' "$url")
  fi
  if [ "$status" != 200 ]; then
    echo "$url: $status" >&2
    rm -f "$2"
    return 1
  fi
}

# restore JOB PATH...
restore() {
  job=$1
  shift
  if [ -e "$1" ]; then
    echo "$job: built by this pipeline"
    return
  fi
  if [ ! -e "$tmp/libraries.zip" ]; then
    download rs-core-libraries "$tmp/libraries.zip" || : > "$tmp/libraries.zip"
  fi
  if [ -s "$tmp/libraries.zip" ]; then
    echo "$job: from ${CI_DEFAULT_BRANCH} rs-core-libraries"
    for path in "$@"; do
      unzip -oq "$tmp/libraries.zip" "$path/*"
    done
    return
  fi
  echo "$job: from ${CI_DEFAULT_BRANCH} $job"
  download "$job" "$tmp/$job.zip"
  unzip -oq "$tmp/$job.zip"
}

restore rs-core-wasm-build \
  packages/rs-core-wasm/src/generated/wasm \
  packages/rs-core-wasm/dist
restore rn-android-build \
  packages/react-native/android/src/main/jniLibs
restore rn-ios-build \
  packages/react-native/ios \
  packages/react-native/PolycentricReactNativeFramework.xcframework
