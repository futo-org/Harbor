#!/bin/sh
set -eu

# Runtime shared libraries the release binaries link against: rdkafka pulls
# in SASL (libsasl2.so.2) and SSL (libssl.so.3); ca-certificates is needed
# for outbound TLS. These are the runtime counterparts of build-deps.sh.
apt-get update
apt-get install -y --no-install-recommends \
    libsasl2-2 \
    libssl3 \
    ca-certificates
rm -rf /var/lib/apt/lists/*