FROM rust:1.100-slim-trixie@sha256:86993c97389ebb5487eb09e88168e2a00b0de29aa08dff9ae896049b9be96ed9 AS chef
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
    --package grayjay-migrator \
    --package grayjay-migrator-migration
COPY Cargo.toml Cargo.lock ./
COPY packages packages
COPY services services
COPY tools tools
# Drop the build tree from this layer so the registry cache only carries the
# binaries; the cook layer above keeps the dependencies.
RUN cargo build --release \
    --package grayjay-migrator \
    --package grayjay-migrator-migration \
    && mkdir /out \
    && mv target/release/grayjay-migrator target/release/grayjay-migrate target/release/grayjay-migrator-migration /out/ \
    && rm -rf target

# CI builds the binaries outside Docker (.forgejo/actions/rust-binaries) and
# swaps them in for the builder stage, so trixie here matches its ci/rust.
FROM debian:trixie-slim@sha256:8aa5a7bf5a1955bddbe7d74fcdd0b91ab30e74362a8b73af672b0481b35b44a0
WORKDIR /app
COPY services/common/runtime-deps.sh runtime-deps.sh
RUN sh runtime-deps.sh
COPY --chmod=755 --from=builder /out/grayjay-migrator /app/grayjay-migrator
COPY --chmod=755 --from=builder /out/grayjay-migrate /app/grayjay-migrate
COPY --chmod=755 --from=builder /out/grayjay-migrator-migration /app/grayjay-migrator-migration
CMD ["/app/grayjay-migrator"]
