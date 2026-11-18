# @polycentric/js-browser

Browser implementations of the `@polycentric/js-core` platform interfaces:

- `IndexedDBStorageDriver`: an `IStorageDriver` backed by IndexedDB.
- `OpfsFileStoreDriver`: an `IFileStoreDriver` backed by the Origin Private
  File System (OPFS).
- `IndexedDBDatabase`: used by the storage driver to manage the DB connection.

The main consumer is `@polycentric/react-native`'s web build
(`src/create-polycentric-client.web.ts`), which passes both drivers to
`PolycentricClient.create`.

## Usage

```ts
const storageDriver = await IndexedDBStorageDriver.create('polycentric');
const filestoreDriver = await OpfsFileStoreDriver.create('polycentric-blobs');
```
