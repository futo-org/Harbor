ARG RUST_IMAGE

# Debian bookworm (the rust base) has no Compose v2 plugin in its repos, so
# we copy the binaries from the official docker image, pinned by tag.
FROM docker:29-cli@sha256:2357639ad1ea7d0194134bf3292622fd4e562483966ed674e5d7c945b5f3b28d AS docker
FROM ${RUST_IMAGE}

COPY --from=docker /usr/local/bin/docker /usr/local/bin/docker
COPY --from=docker /usr/local/libexec/docker/cli-plugins/docker-compose /usr/local/libexec/docker/cli-plugins/docker-compose

# Fail the build if the CLI can't find the compose plugin.
RUN docker compose version
