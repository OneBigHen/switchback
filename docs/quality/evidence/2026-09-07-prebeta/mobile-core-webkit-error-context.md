# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: mobile-qa/core/ride.core.spec.ts >> Level A mobile ride scenarios >> recording starts, updates with two bounded GPS samples, and stops
- Location: tests/e2e/mobile-qa/core/ride.core.spec.ts:96:3

# Error details

```
Test timeout of 120000ms exceeded.
```

# Page snapshot

```yaml
- generic [active] [ref=e1]:
  - main [ref=e2]:
    - region "Map workspace" [ref=e3]:
      - generic "Interactive route map" [ref=e5]:
        - generic [ref=e6]:
          - region "Map" [ref=e7]
          - generic:
            - generic [ref=e8]: 500 ft
            - generic:
              - button "Find my location" [ref=e10] [cursor=pointer]
              - generic [ref=e12]:
                - button "Zoom in" [ref=e13] [cursor=pointer]
                - button "Zoom out" [ref=e15] [cursor=pointer]
        - button "Open map layers" [ref=e19] [cursor=pointer]:
          - img [ref=e20]
      - navigation "Primary" [ref=e24]:
        - group "Primary destinations" [ref=e25]:
          - button "Plan" [ref=e26] [cursor=pointer]:
            - img [ref=e27]
            - generic [ref=e29]: Plan
          - button "Rides" [ref=e30] [cursor=pointer]:
            - img [ref=e31]
            - generic [ref=e33]: Rides
          - button "Discover" [ref=e34] [cursor=pointer]:
            - img [ref=e35]
            - generic [ref=e37]: Discover
          - button "Settings" [ref=e38] [cursor=pointer]:
            - img [ref=e39]
            - generic [ref=e41]: Settings
        - button "Record" [ref=e43] [cursor=pointer]:
          - img [ref=e44]
          - generic [ref=e46]: Record
      - complementary "Motorcycle route planner" [ref=e48]:
        - button "Expand planner sheet" [expanded] [ref=e49]
        - generic [ref=e54]:
          - form "Ride request" [ref=e55]:
            - button "Change start" [ref=e56] [cursor=pointer]:
              - img [ref=e57]
            - combobox "Ride request" [ref=e60]
            - button "Start voice input" [ref=e61] [cursor=pointer]:
              - img [ref=e62]
            - button "Find ride options" [disabled] [ref=e64]:
              - img [ref=e65]
          - generic [ref=e67]:
            - group "Trip shape" [ref=e68]:
              - button "Destination" [pressed] [ref=e69] [cursor=pointer]
              - button "Loop" [ref=e70] [cursor=pointer]
            - button "Draw" [ref=e71] [cursor=pointer]:
              - img [ref=e72]
              - generic [ref=e74]: Draw route
            - button "Free Ride" [ref=e75] [cursor=pointer]:
              - img [ref=e76]
              - generic [ref=e78]: Free Ride
            - button "Ride options" [ref=e79] [cursor=pointer]:
              - generic [ref=e80]: Ride options
              - img [ref=e81]
            - button "Minimize planner" [ref=e83] [cursor=pointer]:
              - img [ref=e84]
    - status [ref=e86]:
      - img [ref=e87]
      - generic [ref=e89]: Recorded ride · 6/15/2026 saved to Library rides.
      - button "Dismiss message" [ref=e90] [cursor=pointer]: ×
  - alert [ref=e91]
```