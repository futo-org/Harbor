FROM rust:1.100-slim-trixie@sha256:86993c97389ebb5487eb09e88168e2a00b0de29aa08dff9ae896049b9be96ed9

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
# renovate: datasource=crate depName=wasm-bindgen-cli
ARG WASM_BINDGEN_CLI_VERSION=0.2.130
RUN cargo install just wasm-bindgen-cli@${WASM_BINDGEN_CLI_VERSION} && rm -rf /usr/local/cargo/registry

# binaryen's wasm-opt, for .forgejo/actions/wasm-build (statically linked).
RUN curl -fsSL -o binaryen.tar.gz "https://github.com/WebAssembly/binaryen/releases/download/version_133/binaryen-version_133-x86_64-linux.tar.gz" \
    && echo "2dc9c7813f5375db93d96ead4b78222fcc3e2677bbb832297af4797782a37489  binaryen.tar.gz" | sha256sum -c \
    && tar xzf binaryen.tar.gz --strip-components=2 -C /usr/local/bin binaryen-version_133/bin/wasm-opt \
    && rm binaryen.tar.gz

# sccache
RUN curl -L "https://github.com/mozilla/sccache/releases/download/v0.10.0/sccache-v0.10.0-x86_64-unknown-linux-musl.tar.gz" \
    | tar xz --strip-components=1 -C /usr/local/bin --wildcards "*/sccache" \
    && chmod +x /usr/local/bin/sccache

# cargo-nextest
RUN curl -L "https://get.nexte.st/0.9.140/linux" \
    | tar xz -C /usr/local/bin

# Nodejs
RUN curl -fsSL https://deb.nodesource.com/setup_26.x | bash - \
    && apt-get install -y nodejs \
    && rm -rf /var/lib/apt/lists/*
