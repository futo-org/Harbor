# Production image. Build context is the repo root. CI builds the binary
# outside Docker (.forgejo/actions/rust-binaries) and swaps it in for the
# builder stage, so only the runtime stage builds there.
FROM rust:1.99-slim-bookworm@sha256:24707e70a4f1e23d9a7b25202ec43126d28a52294b96aad5c670df1fd1f1d400 AS chef
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
RUN cargo chef cook --release --recipe-path recipe.json --package verifier-bot
COPY Cargo.toml Cargo.lock ./
COPY packages packages
COPY services services
COPY tools tools
# Drop the build tree from this layer so the registry cache only carries the
# binary; the cook layer above keeps the dependencies.
RUN cargo build --release --package verifier-bot \
    && mkdir /out \
    && mv target/release/verifier-bot /out/ \
    && rm -rf target

# bookworm matches CI's ci/rust image the binary is built in.
FROM debian:bookworm-slim@sha256:99c0b25c46d0214d5a2091092e7908907dcaecd6a962cde0ac700acee222b6f3
WORKDIR /app
COPY services/common/runtime-deps.sh runtime-deps.sh
RUN sh runtime-deps.sh
# Chromium for the headless-browser verifiers (Kick, Rumble).
RUN apt-get update \
    && apt-get install -y --no-install-recommends chromium fonts-liberation \
    && rm -rf /var/lib/apt/lists/*
ENV HARBOR_VERIFIER_BOT_CHROME_EXECUTABLE_PATH=/usr/bin/chromium
# The identity database lives in ./state; mount a volume there.
RUN useradd --system --uid 10001 --create-home --home-dir /home/verifier verifier \
    && install -d -o verifier -g verifier /app/state
COPY --chmod=755 --from=builder /out/verifier-bot /app/verifier-bot
USER verifier
EXPOSE 3002
CMD ["/app/verifier-bot"]
