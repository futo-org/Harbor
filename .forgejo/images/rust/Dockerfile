FROM rust:slim-bookworm@sha256:a24e292b4af7bdee351a31d3a6379972a5652f0ea22a1b6d6883324ac4f5097c

RUN apt-get update && apt-get install -y --no-install-recommends \
    git \
    curl \
    unzip \
    zstd \
    pkg-config \
    libssl-dev \
    libsasl2-dev \
    cmake \
    make \
    g++ \
    protobuf-compiler \
    && rm -rf /var/lib/apt/lists/*

# Rust deps
RUN rustup component add clippy rustfmt && rustup target add wasm32-unknown-unknown
# wasm-bindgen-cli must match the `wasm-bindgen` pin in packages/rs-core/Cargo.toml.
RUN cargo install just wasm-bindgen-cli@0.2.125 && rm -rf /usr/local/cargo/registry

# sccache
RUN curl -L "https://github.com/mozilla/sccache/releases/download/v0.10.0/sccache-v0.10.0-x86_64-unknown-linux-musl.tar.gz" \
    | tar xz --strip-components=1 -C /usr/local/bin --wildcards "*/sccache" \
    && chmod +x /usr/local/bin/sccache

# cargo-nextest
RUN curl -L "https://get.nexte.st/0.9.140/linux" \
    | tar xz -C /usr/local/bin

# Nodejs
RUN curl -fsSL https://deb.nodesource.com/setup_24.x | bash - \
    && apt-get install -y nodejs \
    && rm -rf /var/lib/apt/lists/*

# PNPM
RUN npm install -g pnpm@10.19.0
