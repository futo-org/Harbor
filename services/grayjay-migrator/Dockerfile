FROM rust:1.99-slim-bookworm@sha256:2c3a22f0a5533ea2dd5a16627bc841228151faa2d4de2644ac9987e4a2f1f2fa AS chef
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
# swaps them in for the builder stage, so bookworm here matches its ci/rust.
FROM debian:bookworm-slim@sha256:7c7b2c966bc9ee8cedfeef67e0e279108992c77681fa595db4a9d65c06ccc587
WORKDIR /app
COPY services/common/runtime-deps.sh runtime-deps.sh
RUN sh runtime-deps.sh
COPY --chmod=755 --from=builder /out/grayjay-migrator /app/grayjay-migrator
COPY --chmod=755 --from=builder /out/grayjay-migrate /app/grayjay-migrate
COPY --chmod=755 --from=builder /out/grayjay-migrator-migration /app/grayjay-migrator-migration
CMD ["/app/grayjay-migrator"]
