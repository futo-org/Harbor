FROM rust:1.96-slim AS build

WORKDIR /app

COPY Cargo.toml Cargo.toml
COPY Cargo.lock Cargo.lock
COPY protos protos
COPY packages packages
COPY services services
COPY tools tools

RUN services/common/build-deps.sh

RUN cargo build --release --package push-notifications-service
RUN cargo build --release --package push-notifications-migration

FROM rust:1.96-slim
WORKDIR /app
COPY services/common/runtime-deps.sh runtime-deps.sh
RUN sh runtime-deps.sh
COPY --from=build /app/target/release/push-notifications-service /app/push-notifications-service
COPY --from=build /app/target/release/push-notifications-migration /app/push-notifications-migration
CMD ["/app/push-notifications-service"]
