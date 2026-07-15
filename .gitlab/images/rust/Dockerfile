FROM rust:slim-bookworm

RUN apt-get update && apt-get install -y \
    git \
    curl \
    unzip \
    pkg-config \
    libssl-dev \
    libsasl2-dev \
    cmake \
    g++ \
    protobuf-compiler \
    && rm -rf /var/lib/apt/lists/*

# Rust deps
RUN rustup set profile default && rustup component add clippy rustfmt
RUN cargo install just cargo-ndk && rm -rf /usr/local/cargo/registry

# sccache
RUN curl -L "https://github.com/mozilla/sccache/releases/download/v0.10.0/sccache-v0.10.0-x86_64-unknown-linux-musl.tar.gz" \
    | tar xz --strip-components=1 -C /usr/local/bin --wildcards "*/sccache" \
    && chmod +x /usr/local/bin/sccache

# Android NDK
RUN curl -L -o /tmp/ndk.zip "https://dl.google.com/android/repository/android-ndk-r27c-linux.zip" \
    && unzip -q /tmp/ndk.zip -d /opt \
    && mv /opt/android-ndk-* /opt/android-ndk \
    && rm /tmp/ndk.zip

# Nodejs
RUN curl -fsSL https://deb.nodesource.com/setup_22.x | bash - \
    && apt-get install -y nodejs \
    && rm -rf /var/lib/apt/lists/*

# PNPM
RUN npm install -g pnpm@10.19.0

ENV ANDROID_NDK_HOME=/opt/android-ndk
ENV PATH="/opt/android-ndk/toolchains/llvm/prebuilt/linux-x86_64/bin:${PATH}"
