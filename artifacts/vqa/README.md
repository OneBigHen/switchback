# Visual QA — PR #56 route advisor, run on b51653b

Captured against `next dev` with `GEMINI_MAPS_GROUNDING=0`, so no billed Maps
grounded searches were made. The advisor capability was genuinely enabled
(`GEMINI_API_KEY` present), and `GET /api/advisor` confirmed the flag works:
`sources` came back without `google-maps` and without the Maps attribution.

| File | Viewport | Theme | What it shows |
|---|---|---|---|
| `desktop-1440-dark.png` | 1440×900 | dark | Builder card in the desktop planner |
| `mobile-390-light.png` | 390×844 | light | Idle sheet, builder below the cap |
| `mobile-390-dark.png` | 390×844 | dark | Same, dark |
| `mobile-390-dark-scrolled.png` | 390×844 | dark | The fix: starters and the CTA scrolled into reach |
| `mobile-390-dark-copilot.png` | 390×844 | dark | Co-pilot panel, empty-builder state |
| `mobile-landscape-844-dark.png` | 844×390 | dark | Landscape planner |

Measured in the running app, not asserted:

- Idle sheet: deck computes `display: flex` / `column`, scroller `min-height: 0`,
  `scrollHeight` 484 vs `clientHeight` 254 — **230px of reachable scroll**.
  Before the fix that overflow was clipped and unreachable.
- Every control in the `Ride advisor` region is ≥44px; the icon buttons
  (Close, Send) are exactly 44×44. Nothing under the minimum.
- All six advisor tab stops are keyboard-reachable with a visible focus
  indicator.
- Zero console errors across the pass.

The desktop light capture is the first screenshot in the session log rather than
a file here; light coverage is kept at 390 where the layout changes actually are.
