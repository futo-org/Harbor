# Rootless BuildKit plus the deploy tools. Job steps run as root; the
# service-image action runs buildctl as `user` (rootlesskit refuses root).
FROM moby/buildkit:v0.34.0-rootless@sha256:65eca3c01cd1180c8f64565c4e3c5983af5145818b0e6fa863385d099eb73855
USER root
RUN apk add --no-cache bash curl jq crane cosign helm nodejs
ENTRYPOINT []
