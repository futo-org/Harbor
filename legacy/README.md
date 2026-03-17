## Legacy Web Client

npm workspace for the legacy Polycentric web client.

From this directory, use the justfile:

- `just run-web` — install deps, generate protocol, build core + react, then run web dev server (app at `http://localhost:3000`)
- `just test-core` — run `polycentric-core` tests
- `just` — list all recipes

### Packages

`polycentric-core` is the shared client library (crypto, storage, synchronization, server API methods).

`polycentric-react` is the React component library and UI layer.

`polycentric-web` is the web client (currently at polycentric.io).

Integration tests default to `http://127.0.0.1:8787`. Set `TEST_SERVER` to use a different server. **WARNING:** These tests create tons of spam posts to your TEST_SERVER.
