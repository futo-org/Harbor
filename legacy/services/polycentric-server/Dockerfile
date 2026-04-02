FROM rust:1.83

WORKDIR /app
COPY legacy/protos legacy/protos
COPY legacy/services/polycentric-server legacy/services/polycentric-server
WORKDIR /app/legacy/services/polycentric-server
RUN cargo build --release

CMD ["./target/release/server"]
