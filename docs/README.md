# Polycentric Docs
Polycentric setup guides, protocol details, and project information. The site is built with
[Docusaurus](https://docusaurus.io/). Use `pnpm` to install dependencies and build the static
content--see the `package.json` for more.

The gRPC API reference (`content/protocol/_grpc-reference.mdx`, imported by `grpc.mdx`) is
generated from the proto files in `../protos/polycentric/v2` by `plugins/grpc-api` on every
build, so document the API in the proto comments. Edits to the proto files reload the site in
`pnpm dev`.
