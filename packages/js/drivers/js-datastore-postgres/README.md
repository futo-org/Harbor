# @polycentric/js-datastore-postgres

A Postgres implementation of `@polycentric/js-sdk`'s `IStorageDriver`, built on Drizzle ORM's
`node-postgres` driver. It mirrors `@polycentric/js-datastore-sqlite`.

## Exports

- `DrizzlePgStorageDriver`: the `IStorageDriver`; hands out event and login
  repositories and stores the active login.
- `migrate(db)`: brings the schema up to date. Run it before constructing
  the driver.
- `PgDb`: the Drizzle `node-postgres` database type.

## Usage

```ts
const db = drizzle(new pg.Pool({ connectionString })) as PgDb;
await migrate(db);
const storageDriver = new DrizzlePgStorageDriver(db);
```

## Docs
See our docs for more info:

- [Examples](https://join.harbor.social/docs/developer/examples)
- [Project structure](https://join.harbor.social/docs/developer/project-structure)
