BIN := bin/harbor-loadtest

.PHONY: build test run smoke protos clean

build:
	go build -o $(BIN) ./cmd/harbor-loadtest

test:
	go vet ./...
	go test ./...

run: build
	$(BIN) run -open

smoke: build
	$(BIN) smoke

# Regenerate internal/pb from the repo's protos/.
protos:
	scripts/generate-protos.sh

clean:
	rm -rf bin
