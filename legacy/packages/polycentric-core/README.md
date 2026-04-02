# Legacy Polycentric Core

Shared client library used by:

- `legacy/services/verifiers-server` (backend that verifies platform claims)
- `legacy/packages/polycentric-web` and `legacy/packages/polycentric-react` (the legacy Polycentric web client and its React component layer)

## Tests

`npm test`

Integration tests default to `http://127.0.0.1:8787`. To use a different server, set the `TEST_SERVER` environment variable.

**WARNING:** These tests create tons of spam posts to your TEST_SERVER.
