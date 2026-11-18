# @polycentric/js-node

The Polycentric SDK for Node.js. Wraps around `@polycentric/js-core`, providing the file system via
Node to the core, and passing a event store database from either `@polycentric/js-storage-postgres`
or `@polycentric/js-storage-sqlite` to the core.

Consumers include `services/verifier-bot` and the `e2e` test suite.
