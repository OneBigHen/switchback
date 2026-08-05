# Privacy and Sharing Specification

## Principle

A shared route must not reveal a protected start or finish through any serialized field.

## Redaction

For each zone:

1. Find exact geometry boundary intersections.
2. Remove protected geometry.
3. Insert boundary intersection as visible endpoint.
4. Remove protected waypoints.
5. Remove/rewrite protected instructions.
6. Remove identifying street names and maneuver text.
7. Rebase instruction intervals.
8. Recalculate visible distance and duration.
9. Remove evidence tied only to hidden sections.
10. Validate no discontinuity.

## Preview

Show redacted map, new endpoints, removed distance/directions, and recipient-visible metadata.

## Link size

Apply deterministic geometry simplification with maximum deviation. If still too large, offer GPX/local file sharing and explain that no server upload occurs.

## Validation

Use strict allowlists, token caps before decode, geometry/instruction count caps, interval bounds, sane numeric ranges, and a new imported identity.

## Tests

- No protected coordinate.
- No protected street name.
- No instruction into removed geometry.
- Recalculated distance.
- No straight jump across privacy zone.
- Simplification attempted before failure.
