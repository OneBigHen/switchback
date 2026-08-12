# P33 — Encrypted sync

**Status:** implemented; automated boundary green, recovery drill open

## Result

- Added WebCrypto AES-256-GCM envelopes with a random 256-bit root, HKDF-SHA256
  per-object keys, fresh nonces, and authenticated schema/namespace/
  collection/object/revision metadata.
- Added strict size/base64/envelope validation and an opaque SQLite repository;
  the server stores nonce/ciphertext and never decrypts object content.
- Route conflicts become bounded conflict copies. Settings use bounded
  last-write-wins; tombstones remain explicit envelope metadata.

## Boundary

The Megaplex unit/build gates are green. Recovery-kit UX, passkey-synced device
pairing, and a real multi-device restore drill are not proven.
