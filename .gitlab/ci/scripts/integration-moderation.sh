#!/usr/bin/env bash
#
# Runs the server stack with Docker, then runs the moderation service
# end-to-end CSAM test using cargo.
#
# Env:
#   KEEP_STACK=1   leave the Docker stack running on exit (default: tear down)
set -euo pipefail

cd "$(dirname "$0")/../../.."

# A fixed project name keeps the network name (<project>_default) independent
# of the checkout directory, for both the connect below and teardown.
export COMPOSE_PROJECT_NAME=polycentric
NETWORK="${COMPOSE_PROJECT_NAME}_default"

# Host:port the readiness probe waits on (and, locally, the test connects to).
SERVER_HOST=localhost
SERVER_PORT=3000

# The job's own container ID. GitLab sets the build container's hostname to a
# short predefined name (runner-…-concurrent-N) that the daemon does not know
# it by, so `docker network connect <hostname>` fails. Recover the real 64-hex
# ID from the bind mounts Docker sets up for /etc/hostname, /etc/hosts, etc.
# (sourced from /var/lib/docker/containers/<id>/…), falling back to hostname.
self_container() {
  local id
  id=$(grep -oE 'containers/[0-9a-f]{64}' /proc/self/mountinfo | head -1 | cut -d/ -f2)
  echo "${id:-$(cat /etc/hostname)}"
}

cleanup() {
  if [[ "${CI:-}" == "true" ]]; then
    docker network disconnect "$NETWORK" "$(self_container)" >/dev/null 2>&1 || true
  fi
  if [[ "${KEEP_STACK:-0}" != "1" ]]; then
    docker compose down -v >/dev/null 2>&1 || true
  fi
}
trap cleanup EXIT

echo "==> Bringing up the server stack…"
docker compose up -d --build --wait postgres rustfs kafka server

if [[ "${CI:-}" == "true" ]]; then
  echo "==> Joining the job container to the stack network ($NETWORK)…"
  docker network connect "$NETWORK" "$(self_container)"
  # Reach the services by their in-network names instead of localhost. Kafka
  # is reached on its INTERNAL listener, which advertises kafka:19092 on this
  # network (the EXTERNAL listener advertises localhost:9092, for local use).
  SERVER_HOST=server
  export POLYCENTRIC_TEST_SERVER="http://server:3000"
  export POLYCENTRIC_TEST_DATABASE_URL="postgres://postgres:testing@postgres:5432"
  export POLYCENTRIC_TEST_OS_ENDPOINT="http://rustfs:9000"
  export POLYCENTRIC_TEST_KAFKA_BROKERS="kafka:19092"
fi

echo "==> Waiting for the server gRPC port ($SERVER_HOST:$SERVER_PORT)…"
for _ in $(seq 1 60); do
  if (exec 3<>"/dev/tcp/$SERVER_HOST/$SERVER_PORT") 2>/dev/null; then
    exec 3>&- 3<&-
    echo "    server is accepting connections"
    break
  fi
  sleep 1
done

echo "==> Applying server database migrations…"
docker compose exec -T server /app/migration up

echo "==> Running the moderation CSAM pipeline test…"
cargo test -p moderation-service --test csam_pipeline -- --ignored --nocapture
