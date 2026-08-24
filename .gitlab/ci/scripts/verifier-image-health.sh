#!/usr/bin/env sh
#
# Start this commit's verifier-bot image and make it run its own health
# checks, so a pipeline judges the artifact it just built rather than
# whatever happens to be deployed.
#
# Usage: verifier-image-health.sh <image>
set -eu

IMAGE="$1"
NAME="verifier-bot-health-${CI_JOB_ID:-local}"
HEALTH_SCRIPT="$(dirname "$0")/verifier-health.mjs"

cleanup() {
  echo "==> Bot log (tail)"
  docker logs "$NAME" 2>&1 | tail -40 || true
  docker rm -f "$NAME" >/dev/null 2>&1 || true
}
trap cleanup EXIT

docker rm -f "$NAME" >/dev/null 2>&1 || true
docker run -d --name "$NAME" "$IMAGE" >/dev/null

echo "==> Waiting for the bot to listen"
attempt=0
until docker exec "$NAME" node -e \
  'fetch("http://localhost:3002/platforms").then(r => process.exit(r.ok ? 0 : 1)).catch(() => process.exit(1))' \
  >/dev/null 2>&1; do
  attempt=$((attempt + 1))
  if [ "$attempt" -ge 45 ]; then
    echo "The bot never served /platforms."
    exit 1
  fi
  sleep 2
done

# The image carries node but not this script, so feed it in on stdin.
docker exec -e VERIFIER_BOT_HEALTH_URL=http://localhost:3002 -i "$NAME" \
  node --input-type=module -e "$(cat "$HEALTH_SCRIPT")"
