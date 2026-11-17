FROM rust:1.100-slim-trixie@sha256:e9d95b74296f7126a83ae3d041aeaba1ff4c478f13abc5cc034fcf7c131c3d4a AS chef
WORKDIR /app
COPY services/common/build-deps.sh build-deps.sh
RUN sh build-deps.sh
RUN cargo install cargo-chef --locked

FROM chef AS planner
COPY Cargo.toml Cargo.lock ./
COPY packages packages
COPY services services
COPY tools tools
RUN cargo chef prepare --recipe-path recipe.json

FROM chef AS builder
COPY --from=planner /app/recipe.json recipe.json
COPY protos protos
RUN cargo chef cook --release --recipe-path recipe.json \
    --package server \
    --package server-migration
COPY Cargo.toml Cargo.lock ./
COPY packages packages
COPY services services
COPY tools tools
# Drop the build tree from this layer so the registry cache only carries the
# binaries; the cook layer above keeps the dependencies.
RUN cargo build --release \
    --package server \
    --package server-migration \
    && mkdir /out \
    && mv target/release/server target/release/server-migration /out/ \
    && rm -rf target

# CI builds the binaries outside Docker (.forgejo/actions/rust-binaries) and
# swaps them in for the builder stage, so trixie here matches its ci/rust.
FROM debian:trixie-slim@sha256:a72b4433de1cf7d6bae0c4cee74d0547f58601a643b3375f070c51600d63b6b2
WORKDIR /app
COPY services/common/runtime-deps.sh runtime-deps.sh
RUN sh runtime-deps.sh
COPY --chmod=755 --from=builder /out/server /app/server
COPY --chmod=755 --from=builder /out/server-migration /app/migration
CMD ["/app/server"]
