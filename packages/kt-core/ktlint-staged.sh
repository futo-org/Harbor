#!/bin/sh
# lint-staged helper: format only the staged kt-core Kotlin files.
set -e

[ $# -gt 0 ] || exit 0

root="$(cd "$(dirname "$0")/../.." && pwd)"

files=
for f in "$@"; do
    case "$f" in
        /*) abs="$f" ;;
        *) abs="$root/$f" ;;
    esac
    files="${files:+$files,}$abs"
done

cd "$root/packages/kt-core"
exec ./gradlew --console=plain -PktlintStagedFiles="$files" :core:ktlintFormat
