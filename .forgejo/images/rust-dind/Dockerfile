ARG RUST_IMAGE

# Debian bookworm (the rust base) has no Compose v2 plugin in its repos, so
# we copy the binaries from the official docker image, pinned by tag.
FROM docker:29-cli@sha256:5e6baf67325a79f64ed3bed6863954d5e05d0f3d4e57cbdb14809346814bbfdb AS docker
FROM ${RUST_IMAGE}

COPY --from=docker /usr/local/bin/docker /usr/local/bin/docker
COPY --from=docker /usr/local/libexec/docker/cli-plugins/docker-compose /usr/local/libexec/docker/cli-plugins/docker-compose

# Fail the build if the CLI can't find the compose plugin.
RUN docker compose version
