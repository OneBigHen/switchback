# Prepare viewport regression — 2026-09-02

The restored Mobile Core gate exposed a real mobile Prepare regression: after route details or turn-by-turn directions changed the scroll owner's height, the selected-route identity could remain above the visible planner scroll viewport.

Root cause: `RouteComparison` used synchronous `scrollIntoView()` inside a layout effect. Touch focus/layout settling could then move the nested planner scroll owner again. The fix defers alignment one animation frame and scrolls the `.planner-scroll` owner explicitly, keeping document scrolling untouched.

The existing `expectPrepareContracts()` browser assertion remains the rendered integration gate. Component and source-contract tests now verify that selected-route alignment targets the nested `.planner-scroll` owner with `scrollTo()` instead of the document-level `scrollIntoView()` behavior.
