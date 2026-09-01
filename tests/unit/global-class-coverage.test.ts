import { existsSync, readFileSync } from "node:fs";
import { dirname, join, normalize } from "node:path";
import { globSync } from "node:fs";
import { describe, expect, it } from "vitest";

/**
 * Every global class name a component renders must have a rule somewhere in
 * the live cascade.
 *
 * This exists because the V2 migration deleted three stylesheets whose names
 * implied they were dead — library-drawer.css, profile-panel.css and
 * switchback-v1.css — while they still carried the only rules for the ride
 * recording HUD, the Free Ride suggestion card, the diagnostics panel, the
 * record preflight panel and the region-downloads modal. Those surfaces
 * shipped completely unstyled, and no test noticed: the specs asserted that
 * headings were visible, which is true of an unstyled div too.
 *
 * A stylesheet is only safe to delete once nothing renders its classes.
 */

const root = process.cwd();

function tsxFiles(): string[] {
	return globSync("src/**/*.{ts,tsx}", { cwd: root }).map((f) => join(root, f));
}

function resolveImport(spec: string, fromDir: string): string | null {
	if (spec.startsWith("@/")) return join(root, "src", spec.slice(2));
	if (spec.startsWith(".")) return normalize(join(fromDir, spec));
	return null;
}

/** Stylesheets reachable from a component import, following @import chains. */
function liveStylesheets(): string[] {
	const sheets = new Set<string>();
	for (const file of tsxFiles()) {
		const source = readFileSync(file, "utf8");
		for (const [, spec] of source.matchAll(/import "([^"]+\.css)"/g)) {
			if (spec.includes(".module.")) continue;
			const path = resolveImport(spec, dirname(file));
			if (path && existsSync(path)) sheets.add(path);
		}
	}
	for (const sheet of [...sheets]) {
		for (const [, spec] of readFileSync(sheet, "utf8").matchAll(/@import "([^"]+\.css)"/g)) {
			const path = resolveImport(spec, dirname(sheet));
			if (path && existsSync(path)) sheets.add(path);
		}
	}
	return [...sheets];
}

function classesIn(css: string): Set<string> {
	return new Set([...css.matchAll(/\.(-?[A-Za-z_][\w-]*)/g)].map((m) => m[1]!));
}

/**
 * Rendered but styled nowhere, in every commit including the production
 * baseline — semantic hooks on text elements that inherit their parent's
 * styling. Pre-existing, not migration damage. Shrinking this list is welcome;
 * adding to it means a surface is shipping unstyled.
 */
const NEVER_STYLED_HOOKS = new Set([
	"app-navigation-settings", "app-shell", "atlas-poster-page",
	"community-publish-panel", "download-mode-corridor-option-input",
	"gps-retry-button", "layer-confidence", "layer-legend", "map-avoid-surface",
	"map-road-lock-experimental-note", "planner-stage-chip",
	"provider-health-notice-alert", "record-panel", "recording-pause",
	"recording-resume", "ride-continue-cue", "ride-reroute-error",
	"route-character-summary", "route-fact-list", "route-rating-bike",
	"route-selection-prompt",
]);

describe("global class coverage", () => {
	const defined = new Set<string>();
	for (const sheet of liveStylesheets()) {
		for (const name of classesIn(readFileSync(sheet, "utf8"))) defined.add(name);
	}
	for (const mod of globSync("src/**/*.module.css", { cwd: root })) {
		for (const name of classesIn(readFileSync(join(root, mod), "utf8"))) defined.add(name);
	}

	const rendered = new Map<string, string>();
	for (const file of tsxFiles()) {
		const source = readFileSync(file, "utf8");
		for (const match of source.matchAll(/className=(?:"([^"]*)"|\{`([^`]*)`\})/g)) {
			const raw = (match[1] ?? match[2] ?? "").replace(/\$\{[^}]*\}/g, " ");
			for (const cls of raw.split(/\s+/)) {
				// Template interpolation leaves prefix fragments like "gps-".
				if (!cls || cls.endsWith("-") || !/^-?[A-Za-z_][\w-]*$/.test(cls)) continue;
				if (!rendered.has(cls)) rendered.set(cls, file.slice(root.length + 1));
			}
		}
	}

	it("styles every global class a component renders", () => {
		const unstyled = [...rendered]
			.filter(([cls]) => !defined.has(cls) && !NEVER_STYLED_HOOKS.has(cls))
			.map(([cls, file]) => `.${cls} (${file})`);
		expect(unstyled).toEqual([]);
	});

	it("keeps the known-unstyled list honest", () => {
		const stale = [...NEVER_STYLED_HOOKS].filter(
			(cls) => defined.has(cls) || !rendered.has(cls),
		);
		expect(stale).toEqual([]);
	});
});
