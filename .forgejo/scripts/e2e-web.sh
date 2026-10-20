#!/usr/bin/env bash
#
# CI only: runs the web e2e flows against a server started with Compose from
# HARBOR_SERVER_IMAGE. The job container joins the stack network and reaches
# the server as http://server:3000, the URL the web service and seed.mjs are
# given.
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
cd "$REPO_ROOT"

export COMPOSE_PROJECT_NAME=harbor
NETWORK="${COMPOSE_PROJECT_NAME}_default"
SERVER_URL=http://server:3000

# The job's own container ID (see integration-moderation.sh).
self_container() {
  local id
  id=$(grep -oE 'containers/[0-9a-f]{64}' /proc/self/mountinfo | head -1 | cut -d/ -f2)
  echo "${id:-$(cat /etc/hostname)}"
}

cleanup() {
  docker network disconnect "$NETWORK" "$(self_container)" >/dev/null 2>&1 || true
  docker compose down -v >/dev/null 2>&1 || true
}
trap cleanup EXIT

# Clear a stack left behind by a hard-killed job.
docker compose down -v >/dev/null 2>&1 || true

echo "==> Starting PostgreSQL, RustFS, Kafka, and Valkey…"
docker compose up -d --wait postgres rustfs kafka valkey

echo "==> Joining job container to the stack network ($NETWORK)…"
docker network connect "$NETWORK" "$(self_container)"

echo "==> Applying migrations…"
docker compose run --no-deps -T server /app/migration up

echo "==> Starting server…"
# The app's auth tokens name the server URL it uses as their audience.
export HARBOR_ALLOW_HOSTS="$SERVER_URL"
# --no-deps: the scraper can't start in CI (see integration-server.sh).
docker compose up -d --no-deps --no-build --wait server

# Docker's embedded DNS is flaky for a container joined with `docker network
# connect` (see integration-server.sh), so pin the name the browser resolves.
SERVER_IP=$(docker inspect -f '{{(index .NetworkSettings.Networks "'${NETWORK}'").IPAddress}}' "${COMPOSE_PROJECT_NAME}-server-1")
echo "$SERVER_IP server" >> /etc/hosts

echo "    waiting for server ($SERVER_IP:3000)…"
for i in $(seq 1 60); do
  if (exec 3<>"/dev/tcp/${SERVER_IP}/3000") 2>/dev/null; then
    exec 3>&- 3<&-
    echo "    server ready (after ${i}s)"
    break
  fi
  if [ "$i" -eq 60 ]; then
    echo "ERROR: server did not start within 60 seconds"
    exit 1
  fi
  sleep 1
done

echo "==> Running web e2e…"
if ! pnpm --filter harbor-e2e test:web; then
  docker compose logs server
  exit 1
fi
