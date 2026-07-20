export interface A11yTouchTargetTokens {
  readonly min: number
  readonly recommended: number
  readonly spacingGap: number
}

export interface A11yFocusTokens {
  readonly outlineWidthPx: number
  readonly outlineStyle: "solid" | "dashed"
  readonly outlineColorRgb: string
  readonly outlineOffsetPx: number
  readonly focusVisibleOnly: true
}

export interface A11yReducedMotionTokens {
  readonly mediaQuery: string
  readonly fallbackDurationMs: number
  readonly disableParallax: true
  readonly disableAutoplay: true
}

export interface A11yContrastTokens {
  readonly normalTextAA: number
  readonly normalTextAAA: number
  readonly largeTextAA: number
  readonly largeTextAAA: number
  readonly uiComponentAA: number
}

export interface A11yLandscapeTokens {
  readonly minViewportWidthPx: number
  readonly minViewportHeightPx: number
  readonly stickyHeaderHeightPx: number
  readonly stickyFooterHeightPx: number
  readonly safeAreaInsetVarNames: readonly ["--sbs-safe-top", "--sbs-safe-bottom", "--sbs-safe-left", "--sbs-safe-right"]
}

export interface A11yTokens {
  readonly touchTarget: A11yTouchTargetTokens
  readonly focus: A11yFocusTokens
  readonly reducedMotion: A11yReducedMotionTokens
  readonly contrast: A11yContrastTokens
  readonly landscape: A11yLandscapeTokens
}

export const A11Y_TOKENS: A11yTokens = Object.freeze({
  touchTarget: Object.freeze({ min: 44, recommended: 48, spacingGap: 8 }),
  focus: Object.freeze({
    outlineWidthPx: 2,
    outlineStyle: "solid",
    outlineColorRgb: "59, 130, 246",
    outlineOffsetPx: 2,
    focusVisibleOnly: true
  }),
  reducedMotion: Object.freeze({
    mediaQuery: "(prefers-reduced-motion: reduce)",
    fallbackDurationMs: 150,
    disableParallax: true,
    disableAutoplay: true
  }),
  contrast: Object.freeze({
    normalTextAA: 4.5,
    normalTextAAA: 7,
    largeTextAA: 3,
    largeTextAAA: 4.5,
    uiComponentAA: 3
  }),
  landscape: Object.freeze({
    minViewportWidthPx: 568,
    minViewportHeightPx: 320,
    stickyHeaderHeightPx: 56,
    stickyFooterHeightPx: 48,
    safeAreaInsetVarNames: Object.freeze([
      "--sbs-safe-top",
      "--sbs-safe-bottom",
      "--sbs-safe-left",
      "--sbs-safe-right"
    ] as const)
  })
})
