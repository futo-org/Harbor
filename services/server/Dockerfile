FROM rust:1.95-slim AS build

WORKDIR /app

COPY Cargo.toml Cargo.toml
COPY Cargo.lock Cargo.lock
COPY protos protos
COPY packages packages
COPY services services
COPY tools tools

RUN services/common/build-deps.sh

RUN cargo build --release --package server
RUN cargo build --release --package migration

FROM rust:1.95-slim
WORKDIR /app
COPY services/common/runtime-deps.sh runtime-deps.sh
RUN sh runtime-deps.sh
COPY --from=build /app/target/release/server /app/server
COPY --from=build /app/target/release/migration /app/migration
CMD ["/app/server"]
