FROM rust:1.96-slim AS build

WORKDIR /app

COPY services/common/build-deps.sh build-deps.sh
RUN sh build-deps.sh

COPY Cargo.toml Cargo.toml
COPY Cargo.lock Cargo.lock
COPY protos protos
COPY packages packages
COPY services services
COPY tools tools

RUN cargo build --release \
    --package moderation-service \
    --package moderation-migration

FROM rust:1.96-slim
WORKDIR /app
COPY services/common/runtime-deps.sh runtime-deps.sh
RUN sh runtime-deps.sh
COPY --from=build /app/target/release/moderation-service /app/moderation-service
COPY --from=build /app/target/release/moderation-migration /app/moderation-migration
CMD ["/app/moderation-service"]
