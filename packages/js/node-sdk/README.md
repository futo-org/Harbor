# @polycentric/node-sdk

The Polycentric SDK for Node.js. Wraps around `@polycentric/js-sdk`, providing the file system via
Node to the core, and passing a event store database from either `@polycentric/js-datastore-postgres`
or `@polycentric/js-datastore-sqlite` to the core.

Consumers include `services/verifier-bot` and the `e2e` test suite.

## Docs
See our docs for more info:

- [Examples](https://join.harbor.social/docs/developer/examples#creating-a-client), including a Node.js client
- [Development setup](https://join.harbor.social/docs/developer/setup): running a local server to point the client at
- [Project structure](https://join.harbor.social/docs/developer/project-structure)
