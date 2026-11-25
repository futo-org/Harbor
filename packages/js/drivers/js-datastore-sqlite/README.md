# @polycentric/js-datastore-sqlite

A SQLite implementation of `@polycentric/js-sdk`'s `IStorageDriver`, written
against Drizzle ORM so it works with any Drizzle SQLite backend. It is shared by:

- `@polycentric/node-sdk`, using better-sqlite3.
- `@polycentric/react-native-sdk`, using expo-sqlite (native builds).

## Exports

- `DrizzleStorageDriver`: the `IStorageDriver`; hands out event and login
  repositories and stores the active login.
- `migrate(db)`: brings the schema up to date. Run it before constructing
  the driver.
- `SqliteDb`: the Drizzle database type both backends are cast to.

## Usage

```ts
const db = drizzle(new Database(path)) as unknown as SqliteDb;
await migrate(db);
const storageDriver = new DrizzleStorageDriver(db);
```

## Docs
See our docs for more info:

- [Examples](https://join.harbor.social/docs/developer/examples)
- [Project structure](https://join.harbor.social/docs/developer/project-structure)
