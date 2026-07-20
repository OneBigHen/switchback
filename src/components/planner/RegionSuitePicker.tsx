"use client"

import { Check, X } from "@phosphor-icons/react"
import { formatRegionBytes } from "@/lib/offline/region-catalog"
import {
  HOME_TERRITORY_SUITE_ID,
  REGION_SUITES,
  type RegionSuite
} from "@/lib/offline/region-suites"

export interface RegionSuitePickerProps {
  selectedSuiteId: string | null
  onSelectSuite(suite: RegionSuite | null): void
  /** Bytes already installed in the suite (used only for the rollout summary). */
  installedBytesByRegion?: Record<string, number>
}

export function RegionSuitePicker({
  selectedSuiteId,
  onSelectSuite,
  installedBytesByRegion = {}
}: RegionSuitePickerProps) {
  const handlePick = (suite: RegionSuite) => {
    onSelectSuite(suite.id === selectedSuiteId ? null : suite)
  }

  const handleClear = () => {
    onSelectSuite(null)
  }

  const selectedSuite = REGION_SUITES.find((s) => s.id === selectedSuiteId) ?? null

  return (
    <div className="region-suite-picker" role="group" aria-label="Region suite presets">
      <span className="region-suite-picker-label">Suite presets</span>
      <div className="region-suite-list" role="radiogroup" aria-label="Region suite preset">
        {REGION_SUITES.map((suite) => {
          const selected = suite.id === selectedSuiteId
          const recommended = suite.id === HOME_TERRITORY_SUITE_ID
          const installedBytes = suite.regionCodes.reduce((sum, code) => {
            const value = installedBytesByRegion[code]
            return sum + (typeof value === "number" ? value : 0)
          }, 0)
          return (
            <button
              key={suite.id}
              type="button"
              className="region-suite-option"
              data-selected={selected ? "true" : "false"}
              data-recommended={recommended ? "true" : "false"}
              role="radio"
              aria-checked={selected}
              aria-label={`${suite.label} suite, ${suite.regionCodes.length} regions${recommended ? ", default recommendation" : ""}`}
              onClick={() => handlePick(suite)}
            >
              <span className="region-suite-option-mark" aria-hidden="true">
                <Check weight="bold" />
              </span>
              <span className="region-suite-option-text">
                <span className="region-suite-option-title" data-recommended={recommended ? "true" : "false"}>
                  {suite.label}
                </span>
                <span className="region-suite-option-description">{suite.description}</span>
                {installedBytes > 0 && (
                  <span className="region-suite-summary">
                    <strong>{formatRegionBytes(installedBytes)}</strong> already installed in this suite
                  </span>
                )}
              </span>
              <span className="region-suite-option-codes" aria-hidden="true">
                {suite.regionCodes.length}
              </span>
            </button>
          )
        })}
      </div>
      <div className="region-suite-footer">
        <span className="region-suite-summary">
          {selectedSuite
            ? (
              <>
                <strong>{selectedSuite.regionCodes.length}</strong> regions selected — each remains independently removable.
              </>
            )
            : (
              <>No suite selected. Choose a preset or download individual regions below.</>
            )}
        </span>
        <button
          type="button"
          className="region-suite-clear"
          onClick={handleClear}
          disabled={!selectedSuite}
          aria-label="Clear the active region suite selection"
        >
          <X aria-hidden="true" weight="bold" />
          Clear suite
        </button>
      </div>
    </div>
  )
}
