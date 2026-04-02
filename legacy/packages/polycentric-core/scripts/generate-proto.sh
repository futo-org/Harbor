#!/usr/bin/env bash
set -euo pipefail

DIR="$(cd "$(dirname "$0")/.." && pwd)"
PROTO_DIR="$DIR/../../../legacy/protos"

protoc \
  --ts_proto_opt=esModuleInterop=true \
  --ts_proto_opt=forceLong=long \
  --ts_proto_out="$DIR/src" \
  --experimental_allow_proto3_optional \
  -I"$PROTO_DIR" \
  "$PROTO_DIR/legacy-polycentric.proto"

mv "$DIR/src/legacy-polycentric.ts" "$DIR/src/protocol.ts"
