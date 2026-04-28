FROM rust:1.95-slim AS build

WORKDIR /app

RUN apt-get update && apt-get install -y protobuf-compiler

COPY Cargo.toml Cargo.toml
COPY Cargo.lock Cargo.lock
COPY protos protos
COPY packages packages
COPY services services

RUN cargo build --release --package server

FROM rust:1.95-slim
WORKDIR /app
COPY --from=build /app/target/release/server /app/server
CMD ["/app/server"]
