FROM rust:1.95-slim AS build

WORKDIR /app

COPY Cargo.toml Cargo.toml
COPY Cargo.lock Cargo.lock
COPY protos protos
COPY packages packages
COPY services services
COPY tools tools

RUN services/common/build-deps.sh

RUN cargo build --release --package notifications-service

FROM rust:1.95-slim
WORKDIR /app
COPY services/common/runtime-deps.sh runtime-deps.sh
RUN sh runtime-deps.sh
COPY --from=build /app/target/release/notifications-service /app/notifications-service
CMD ["/app/notifications-service"]
