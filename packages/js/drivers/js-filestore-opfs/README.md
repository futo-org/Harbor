# @polycentric/js-filestore-opfs

`OpfsFileStoreDriver`: a browser blob store (`IFileStoreDriver` implementer) for
`@polycentric/js-sdk` backed by the Origin Private File System (OPFS).

The main consumer is `@polycentric/react-native-sdk`'s web build
(`src/create-polycentric-client.web.ts`), which pairs it with
`@polycentric/js-datastore-indexeddb` and passes both to
`PolycentricClient.create`.

## Usage

```ts
const filestoreDriver = await OpfsFileStoreDriver.create('polycentric-blobs');
```

## Docs
See our docs for more info:

- [Examples](https://join.harbor.social/docs/developer/examples#creating-a-client): building a browser client with these drivers
- [Project structure](https://join.harbor.social/docs/developer/project-structure)
