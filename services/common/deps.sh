#!/bin/sh
set -eu

apt-get update
apt-get install -y \
    protobuf-compiler \
    cmake \
    g++ \
    pkg-config \
    libssl-dev \
    libsasl2-dev
rm -rf /var/lib/apt/lists/*