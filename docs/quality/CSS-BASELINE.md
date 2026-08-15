# CSS and component baseline (TASK-0.3)

Measured 2026-08-15 on commit `4c228cc`, before any Phase 2+ work in
`docs/UX-OVERHAUL-PLAN.md`. Re-measure after each phase and append a new
dated row so the reduction is provable, not asserted.

## Commands

```bash
# Total CSS lines and file count
find src/app/styles -name "*.css" | xargs wc -l | tail -1
find src/app/styles -name "*.css" | wc -l

# responsive.css size
wc -l src/app/styles/responsive.css

# Distinct hex colors (values / occurrences)
grep -rhoE "#[0-9a-fA-F]{3,8}\b" src/app/styles/*.css | sort -u | wc -l
grep -rhoE "#[0-9a-fA-F]{3,8}\b" src/app/styles/*.css | wc -l

# !important count
grep -c "!important" src/app/styles/*.css | awk -F: '{sum+=$2} END {print sum}'

# @media block count (total, and inside responsive.css)
grep -rc "@media" src/app/styles/*.css | awk -F: '{sum+=$2} END {print sum}'
grep -c "@media" src/app/styles/responsive.css

# Component count and total lines
find src/components -name "*.tsx" | wc -l
find src/components -name "*.tsx" | xargs wc -l | tail -1
find src/components -name "*.tsx" | xargs wc -l | sort -rn | head -6
```

## 2026-08-15 baseline

### CSS

| Metric | Value |
| --- | --- |
| Total CSS | 11,512 lines across 20 files |
| `responsive.css` | 5,113 lines (44% of all CSS) |
| Distinct hex colors | 245 (542 occurrences) |
| `!important` | 39 |
| `@media` blocks | 54 (27 in `responsive.css`) |

### Components

| File | Lines |
| --- | --- |
| `PlannerShell.tsx` | 1,602 |
| `MapStage.tsx` | 1,560 |
| `PlannerDeck.tsx` | 880 |
| `RegionDownloadsPanel.tsx` | 735 |
| `LibraryDrawer.tsx` | 692 |
| Total | 41 components, 10,083 lines |

The component total (10,083) differs slightly from the plan document's
stated 9,902 — re-measured directly against the current tree rather than
copied from the plan, since a handful of lines have moved since the plan
was authored. The per-file god-component numbers match exactly.

## Phase 11 targets (from the plan)

- CSS under 7,000 lines
- Distinct hex under 30
- `!important` at 0
- Decorative eyebrows at 0
- Georgia/serif rules at 0
- Italic body/input rules at 0
- Impeccable detector findings at 0
