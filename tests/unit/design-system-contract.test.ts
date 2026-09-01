import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

// V2 layering: the bundled typography, spacing, and touch contracts live in
// the canonical token layer; design-system.css keeps only the structural
// rules of the map workspace (see design/DESIGN-CONTRACT.md v2.0).
const tokens = readFileSync(
	resolve(process.cwd(), "src/app/styles/tokens.css"),
	"utf8",
);
const designSystem = readFileSync(
	resolve(process.cwd(), "src/app/styles/design-system.css"),
	"utf8",
);

describe("map workspace design system", () => {
	it("keeps the bundled typography, spacing, and touch contracts in the token layer", () => {
		expect(tokens).toContain('--font-display: "Oswald Variable"');
		expect(tokens).toContain('--font-body: "Inter Variable"');
		expect(tokens).toContain("--sb-space-1: 4px");
		expect(tokens).toContain("--sb-space-2: 8px");
		expect(tokens).toContain("--sb-touch-target: 44px");
	});

	it("keeps the map workspace structural contract in the design-system layer", () => {
		expect(designSystem).toContain(".sb-map-shell");
		expect(designSystem).toContain(".sb-bottom-sheet");
	});

	it("does not reintroduce the banned generic font layer", () => {
		// Inter Variable and Oswald Variable are the bundled V2 brand fonts
		// (DESIGN-CONTRACT v2.0 §4); only unbundled generic stacks stay banned.
		expect(`${tokens}\n${designSystem}`).not.toMatch(
			/Space Grotesk|Roboto|Arial|system-ui/,
		);
	});
});
