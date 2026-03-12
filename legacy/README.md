## Legacy Web Client

npm workspace for the legacy Polycentric web client.

### Setup

```
npm install
```

Generate `protocol.ts` for `polycentric-core`:

```
cd packages/polycentric-core && npm run generate
```

### Build

Core and React must be built before running the web app.

```
cd packages/polycentric-core && npm run build
cd ../polycentric-react && npm run build
```

### Run

```
cd packages/polycentric-web
npm run dev
```

The web app will be at `http://localhost:3000`.

### Packages

`polycentric-core` is the shared client library (crypto, storage, synchronization, server API methods).

`polycentric-react` is the React component library and UI layer.

`polycentric-web` is the web client (currently at polycentric.io).

### Test

`polycentric-core` has integration tests that default to `http://127.0.0.1:8081`. To use a different server, set the `TEST_SERVER` environment variable.

**WARNING:** These tests create tons of spam posts to your TEST_SERVER.

```
cd packages/polycentric-core && npm test
```
