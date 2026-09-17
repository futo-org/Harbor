#!/usr/bin/env bash
#
# Creates a fresh moderation service identity for local development, publishes
# its event chain to the local server, and writes the identity and signing key
# into the repository root .env that compose reads.
#
# The server must already be running (`docker compose up -d --build server`),
# and should be restarted after running this script.
#
# Env:
#   MODERATION_SERVER   server to publish to (default: http://localhost:3000)
set -euo pipefail

cd "$(dirname "$0")/../.."

SERVER="${MODERATION_SERVER:-http://localhost:3000}"

# Holds the private keys, so it is discarded once the two values we need are
# in .env.
DIR=$(mktemp -d)
trap 'rm -rf "$DIR"' EXIT

identity_tool() {
  cargo run -q -p polycentric-identity -- --dir "$DIR" "$@"
}

upsert_env() {
  local key="$1" value="$2"
  touch .env
  if grep -q "^${key}=" .env; then
    sed -i.bak "s|^${key}=.*|${key}=${value}|" .env && rm -f .env.bak
  else
    printf '%s=%s\n' "$key" "$value" >>.env
  fi
}

echo "==> Creating an identity"
identity_tool create
identity_tool add-signing-key

echo "==> Publishing the identity chain to $SERVER"
identity_tool publish "$SERVER"

SUMMARY=$(identity_tool show)
IDENTITY=$(awk '/^Identity: /{print $2; exit}' <<<"$SUMMARY")
SIGNING_PUBLIC=$(awk '/^Signing keys/{found=1; next} found && NF==1 {print $1; exit}' <<<"$SUMMARY")

if [ -z "$IDENTITY" ] || [ -z "$SIGNING_PUBLIC" ]; then
  echo "ERROR: could not read the identity or signing key from:" >&2
  echo "$SUMMARY" >&2
  exit 1
fi

SIGNING_SEED=$(identity_tool private-key "$SIGNING_PUBLIC")

upsert_env POLYCENTRIC_MODERATION_IDENTITY "$IDENTITY"
upsert_env POLYCENTRIC_MODERATION_SIGNING_KEY "$SIGNING_SEED"

echo "==> Wrote POLYCENTRIC_MODERATION_IDENTITY and POLYCENTRIC_MODERATION_SIGNING_KEY to .env"
echo "    identity: $IDENTITY"
echo
echo "Restart the server so it picks up the identity it should trust labels from,"
echo "then start the moderation service:"
echo
echo "    docker compose up -d --build server"
echo "    docker compose --profile moderation up -d --build moderation"
