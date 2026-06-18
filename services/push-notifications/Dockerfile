FROM rust:1.96-slim AS chef
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
RUN cargo chef cook --release --recipe-path recipe.json
COPY Cargo.toml Cargo.lock ./
COPY packages packages
COPY services services
COPY tools tools
RUN cargo build --release \
    --package push-notifications-service \
    --package push-notifications-migration

FROM rust:1.96-slim
WORKDIR /app
COPY services/common/runtime-deps.sh runtime-deps.sh
RUN sh runtime-deps.sh
COPY --from=builder /app/target/release/push-notifications-service /app/push-notifications-service
COPY --from=builder /app/target/release/push-notifications-migration /app/push-notifications-migration
CMD ["/app/push-notifications-service"]
