ARG RUST_IMAGE

# Debian bookworm (the rust base) has no Compose v2 plugin in its repos, so
# we copy the binaries from the official docker image, pinned by tag.
FROM docker:29-cli@sha256:34507eb5069d8be82c95dd3b6987d4250fd5fee49b82e2509b7d7a7030740d6d AS docker
FROM ${RUST_IMAGE}

COPY --from=docker /usr/local/bin/docker /usr/local/bin/docker
COPY --from=docker /usr/local/libexec/docker/cli-plugins/docker-compose /usr/local/libexec/docker/cli-plugins/docker-compose

# Fail the build if the CLI can't find the compose plugin.
RUN docker compose version
