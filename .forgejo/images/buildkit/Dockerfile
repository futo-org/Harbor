# Rootless BuildKit plus the deploy tools. Job steps run as root; the
# service-image action runs buildctl as `user` (rootlesskit refuses root).
FROM moby/buildkit:v0.35.0-rootless@sha256:5987568f92dafbfb679879de59c1cd8d26597f5f6635c314e166164e2615870c
USER root
RUN apk add --no-cache bash curl jq crane cosign helm nodejs
ENTRYPOINT []
