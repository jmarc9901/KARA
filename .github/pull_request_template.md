## What changes

Brief description of the change.

## Why

Context / problem it solves (link the issue if any).

## Verification

- [ ] `npm test` green (compiler + runtime)
- [ ] `cargo test --manifest-path parser/Cargo.toml` green (if touching `parser/`)
- [ ] If the AST format changed: JS↔Rust parity verified
- [ ] The UI builds (`npm --prefix ui run build`)
