ARG RUST_IMAGE
FROM ${RUST_IMAGE}

RUN apt-get update && apt-get install -y --no-install-recommends \
    docker.io \
    docker-compose-v2 \
    && rm -rf /var/lib/apt/lists/*
