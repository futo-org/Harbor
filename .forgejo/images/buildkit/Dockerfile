# Rootless BuildKit plus the deploy tools. Job steps run as root; the
# service-image action runs buildctl as `user` (rootlesskit refuses root).
FROM moby/buildkit:v0.34.1-rootless@sha256:f68752a5a94acfcdad2d07867b7075601a421638e17fc5f28efc1c814d0c4f89
USER root
RUN apk add --no-cache bash curl jq crane cosign helm nodejs
ENTRYPOINT []
