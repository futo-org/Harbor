# Command to run in `dev` target, e.g. `make RUN=check dev`.
RUN?=test

# Development loop, runs make $RUN whenever a source file changes.
# Usage:
# $ make dev           # To run `cargo run`.
# $ make dev RUN=check # To run `cargo check`.
dev:
	find src/ Makefile Cargo.toml | entr -d -cc -r $(MAKE) $(RUN)

# Run the integration tests
test:
	cargo test

.PHONY: dev test
