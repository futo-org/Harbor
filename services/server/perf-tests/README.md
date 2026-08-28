# Performance Tests

Generating data:

```
cargo run --bin gen-data [address] --amount [amount of events] --clients [# concurrent clients] [event kind]

# For example creating 10,000 posts with 100 concurrent clients.
cargo run --bin gen-data http://127.0.0.1:3000 --amount 10000 --clients 100 post
```
