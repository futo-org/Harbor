# @polycentric/js-datastore-indexeddb

`IndexedDBStorageDriver`: a browser storage driver (`IStorageDriver` implementer) for
`@polycentric/js-sdk`, backed by IndexedDB.

The main consumer is `@polycentric/react-native-sdk`'s web build
(`src/create-polycentric-client.web.ts`), which pairs it with
`@polycentric/js-filestore-opfs` and passes both to `PolycentricClient.create`.

## Usage

```ts
const storageDriver = await IndexedDBStorageDriver.create('polycentric');
```

## Docs
See our docs for more info:

- [Examples](https://join.harbor.social/docs/developer/examples#creating-a-client): building a browser client with these drivers
- [Project structure](https://join.harbor.social/docs/developer/project-structure)
