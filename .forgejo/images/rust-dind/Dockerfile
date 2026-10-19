ARG RUST_IMAGE

# Debian bookworm (the rust base) has no Compose v2 plugin in its repos, so
# we copy the binaries from the official docker image, pinned by tag.
FROM docker:29-cli@sha256:1a4c7cb63513f349bdad01fcc6e0f3f2f67d37b9da86f14dc0d4a0942eecda00 AS docker
FROM ${RUST_IMAGE}

COPY --from=docker /usr/local/bin/docker /usr/local/bin/docker
COPY --from=docker /usr/local/libexec/docker/cli-plugins/docker-compose /usr/local/libexec/docker/cli-plugins/docker-compose

# Fail the build if the CLI can't find the compose plugin.
RUN docker compose version
