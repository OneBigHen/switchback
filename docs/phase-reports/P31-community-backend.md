# P31 — Community backend

**Status:** implemented; automated G7 boundary green, authenticated release open

## Result

- Added bounded SQLite community storage for public routes, immutable route
  revisions, generated artifact paths, comments, reports, and explicit RIG
  contributions.
- Public route browsing is anonymous. Mutations require an authenticated
  signed Switchback session and an active pseudonymous identity.
- Titles, descriptions, comments, report reasons, and metadata are stored as
  bounded plain text; arbitrary HTML and caller-selected storage paths are not
  accepted.
- Community route data remains route-centered. There is no feed or AI-owned
  topology path.
- Added bounded API handlers for public route browsing, route revisions,
  artifacts, comments, reports, and RIG contributions. Mutation handlers use
  the signed pseudonymous session boundary and rate limits.

## Boundary

The repository is ready for a real WebAuthn verifier and operator moderation
workflow. No browser passkey ceremony, authenticated-browser proof, or
external-rider community release is claimed by the validation host automation.
