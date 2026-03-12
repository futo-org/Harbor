#!/usr/bin/env bash
set -euo pipefail

DIR="$(cd "$(dirname "$0")/.." && pwd)"
PROTO_DIR="$DIR/../../../protos"

protoc \
  --ts_proto_opt=esModuleInterop=true \
  --ts_proto_opt=forceLong=long \
  --ts_proto_out="$DIR/src" \
  --experimental_allow_proto3_optional \
  -I"$PROTO_DIR" \
  "$PROTO_DIR/server-polycentric.proto"

mv "$DIR/src/server-polycentric.ts" "$DIR/src/protocol.ts"
