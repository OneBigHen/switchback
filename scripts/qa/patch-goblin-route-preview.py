from pathlib import Path

p = Path("src/components/planner/v2/RideAdvisor.tsx")
s = p.read_text()


def once(old: str, new: str, label: str) -> None:
    global s
    count = s.count(old)
    if count != 1:
        raise SystemExit(f"{label}: expected one anchor, found {count}")
    s = s.replace(old, new, 1)


once(
    'import type { PlannedRoute } from "@/lib/routing/types"\n',
    'import type { PlannedRoute } from "@/lib/routing/types"\nimport { setRoutePreviewId } from "../route-comparison-preview"\n',
    "preview import",
)

once(
    '''            <button
              type="button"
              className={opinionStyles.action}
              aria-label={`Show ${opinionRoute.name} route`}
              onClick={() => onSelectRoute(opinionRoute.id)}
            >''',
    '''            <button
              type="button"
              className={opinionStyles.action}
              aria-label={`Show ${opinionRoute.name} route`}
              onMouseEnter={() => setRoutePreviewId(opinionRoute.id)}
              onMouseLeave={() => setRoutePreviewId(null)}
              onFocus={() => setRoutePreviewId(opinionRoute.id)}
              onBlur={() => setRoutePreviewId(null)}
              onClick={() => {
                setRoutePreviewId(null)
                onSelectRoute(opinionRoute.id)
              }}
            >''',
    "opinion action",
)

p.write_text(s)
