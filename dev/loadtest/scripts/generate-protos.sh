#!/usr/bin/env bash
# Regenerate internal/pb from the repo's Polycentric v2 protos.
set -euo pipefail
cd "$(dirname "$0")/../../.."
GOBIN="$(go env GOPATH)/bin"
GOBIN="$GOBIN" go install google.golang.org/protobuf/cmd/protoc-gen-go@v1.36.12
PATH="$GOBIN:$PATH" go run github.com/bufbuild/buf/cmd/buf@v1.57.2 generate --template dev/loadtest/buf.gen.yaml
cd dev/loadtest && go build ./...
