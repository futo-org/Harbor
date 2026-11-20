# @polycentric/js-node

The Polycentric SDK for Node.js. Wraps around `@polycentric/js-core`, providing the file system via
Node to the core, and passing a event store database from either `@polycentric/js-storage-postgres`
or `@polycentric/js-storage-sqlite` to the core.

Consumers include `services/verifier-bot` and the `e2e` test suite.

## Docs
See our docs for more info:

- [Examples](https://join.harbor.social/docs/developer/examples#creating-a-client), including a Node.js client
- [Development setup](https://join.harbor.social/docs/developer/setup): running a local server to point the client at
- [Project structure](https://join.harbor.social/docs/developer/project-structure)
