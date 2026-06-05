# polycentric-identity

A small tool to create and manage a Polycentric identity locally, as a real
chain of signed events in the IDENTITY collection.

An identity is defined by its **genesis** event — sequence 1, signed by a
primary rotation key. The identity string is the lowercase hex SHA256 of that
event's `Identity` document (the same hash `polycentric-core` uses). Every
change appends a new signed event whose content is the updated document:

- **rotation keys** — control the identity and can issue further keys
- **signing keys** — may sign events but cannot change the identity
- **revocation** — drops a key from the document and records a `RevocationBound`

All events are signed by the genesis (primary) rotation key, so the chain is a
simple linear sequence. Keys are Ed25519. Everything is stored as plain files
(no database):

```text
~/.polycentric/identity              # the identity string (genesis hash)
~/.polycentric/keys/<pubhex>.private  # raw 32-byte Ed25519 private key
~/.polycentric/events/000001.event    # SignedEvent protobuf bytes
~/.polycentric/events/000001.content  # Content protobuf bytes (the identity doc)
```

On Unix the directory and files are created with owner-only permissions
(`0700` / `0600`). Private keys are stored unencrypted — protect the directory
accordingly.

The generated events are verified to validate against the real
`polycentric-core` validator (see `tests/validate.rs`).

## Usage

```sh
# Create a new identity (generates the genesis identity event + primary key)
polycentric-identity create

# Add keys (each appends a signed identity event)
polycentric-identity add-rotation-key
polycentric-identity add-signing-key

# Revoke a key by its public-key hex (appends a revocation event)
polycentric-identity revoke <public-key-hex>

# Show the identity, current key set, and event chain
polycentric-identity show

# Print a private key as hex (defaults to the genesis/primary key)
polycentric-identity private-key
polycentric-identity private-key <public-key-hex>

# Publish the event chain to a Polycentric server
polycentric-identity publish https://srv1.polycentric.io

# Use a custom storage directory
polycentric-identity --dir /path/to/store create
```

## As a library

```rust
use polycentric_identity::{default_dir, IdentityStore, KeyKind};

let mut store = IdentityStore::open(&default_dir()?)?;
let identity = store.create_identity()?;     // genesis event + primary rotation key
let signing = store.add_key(KeyKind::Signing)?;  // append an event adding a signing key
store.revoke_key(&signing.public_hex())?;     // append a revocation event
let doc = store.current_doc()?;               // current Identity document
store.publish("https://srv1.polycentric.io")?; // push the chain to a server
```
