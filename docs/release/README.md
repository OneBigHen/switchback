# Switchback release preflight

Before a host restart or live promotion:

1. update the checkout to the exact intended `main` SHA;
2. install the locked dependencies (`npm ci` when dependencies changed or the checkout is fresh);
3. run `npm run build` — on data hosts this refreshes and verifies the generated route Atlas before Next.js builds;
4. restart the existing Switchback service using its current host/service definition;
5. run the live smoke/validation checks and confirm the served app is healthy.

See [ATLAS-INTEGRITY.md](./ATLAS-INTEGRITY.md) for the generated route-data contract.

This document intentionally does not replace the host's existing systemd/tunnel/routing-service architecture.
