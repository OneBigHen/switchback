# Deployment gate evidence

- Candidate: `c91858479c176119ba633580cfc0902c6863ba8c`
- Root verification: raw public HTML contained
  `data-dpl-id="c91858479c176119ba633580cfc0902c6863ba8c"`.
- Browser verification: loaded Next script URLs included
  `?dpl=c91858479c176119ba633580cfc0902c6863ba8c` and returned HTTP 200.
- Live DOM caveat: hydration removed `data-dpl-id`, producing `[]` in the
  original session. That result is retained as a hydration observation, not a
  failed deployment identity.
