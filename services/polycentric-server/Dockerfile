FROM rust:1.83

WORKDIR /app
COPY . .

RUN cargo build --release --manifest-path services/polycentric-server/Cargo.toml

CMD ["./services/polycentric-server/target/release/server"]
