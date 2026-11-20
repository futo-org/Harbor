# Polycentric Docs
Polycentric setup guides, protocol details, and project information. The site is built with
[Docusaurus](https://docusaurus.io/). Use `pnpm` to install dependencies and build the static
content--see the `package.json` for more.

The gRPC API reference (`content/protocol/_grpc-reference.mdx`, imported by `grpc.mdx`) is
generated from the proto files in `../protos/polycentric/v2` by `plugins/grpc-api` on every
build, so document the API in the proto comments. Edits to the proto files reload the site in
`pnpm dev`.

Many code snippets (such as on `content/developer/examples.md`) are not written in the Markdown.
Each block names a region of a compiled source file and `plugins/code-region` fills it in when
building the docs. Typescript code lives in the `docs/examples/` package, and is type-checked in CI
by the `docs-examples` job; while Kotlin lives in `packages/kt-core/core/src/test/kotlin/examples/`,
and is compiled by the `kt-core` job. Protobuf blocks can also be inserted, but are inserted by
definition rather than marking code regions.
