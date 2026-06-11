#!/usr/bin/env bash
#
# Runs a local server stack with Docker, then runs the moderation service
# end-to-end CSAM test using cargo.
#
# Env:
#   KEEP_STACK=1   leave the Docker stack running on exit (default: tear down)
set -euo pipefail

cd "$(dirname "$0")/../../.."

cleanup() {
  if [[ "${KEEP_STACK:-0}" != "1" ]]; then
    docker compose down -v >/dev/null 2>&1 || true
  fi
}
trap cleanup EXIT

echo "==> Bringing up the server stack…"
docker compose up -d --build --wait postgres rustfs kafka server

echo "==> Waiting for the server gRPC port (localhost:3000)…"
for _ in $(seq 1 60); do
  if (exec 3<>/dev/tcp/localhost/3000) 2>/dev/null; then
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
