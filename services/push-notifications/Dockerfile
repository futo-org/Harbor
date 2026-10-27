FROM rust:1.99-slim-bookworm@sha256:a24e292b4af7bdee351a31d3a6379972a5652f0ea22a1b6d6883324ac4f5097c AS chef
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
    --package push-notifications-service \
    --package push-notifications-migration
COPY Cargo.toml Cargo.lock ./
COPY packages packages
COPY services services
COPY tools tools
# Drop the build tree from this layer so the registry cache only carries the
# binaries; the cook layer above keeps the dependencies.
RUN cargo build --release \
    --package push-notifications-service \
    --package push-notifications-migration \
    && mkdir /out \
    && mv target/release/push-notifications-service target/release/push-notifications-migration /out/ \
    && rm -rf target

# CI builds the binaries outside Docker (.forgejo/actions/rust-binaries) and
# swaps them in for the builder stage, so bookworm here matches its ci/rust.
FROM debian:bookworm-slim@sha256:7ff6ba31527b9e336162fa061746c366c4b2032f4d2cff2078bea43f78efe3f8
WORKDIR /app
COPY services/common/runtime-deps.sh runtime-deps.sh
RUN sh runtime-deps.sh
COPY --chmod=755 --from=builder /out/push-notifications-service /app/push-notifications-service
COPY --chmod=755 --from=builder /out/push-notifications-migration /app/push-notifications-migration
CMD ["/app/push-notifications-service"]
