
import * as minimatchModule from 'minimatch';

/**
 * Resolve the minimatch callable across module shapes (v3 CJS default vs v10+ named export).
 * @param {Record<string, unknown>} mod - The imported minimatch module namespace
 * @returns {(target: string, pattern: string, options?: object) => boolean}
 */
export function resolveMinimatch(mod) {
	// @ts-expect-error - interop across minimatch major versions is not statically typed
	return mod.minimatch || mod.default || mod;
}

/* Handle both minimatch v3 (CJS default) and v10+ (named export) */
const minimatch = resolveMinimatch(minimatchModule);

/*
 * Ignore configuration format:
 * {
 *   files: ['vendor/**'],              // Glob patterns - ignore entire files
 *   types: ['spread', 'global'],       // Finding types to ignore
 *   categories: ['RegExp'],            // Categories to ignore
 *   names: ['test', 'exec'],           // Method/property names to ignore
 *   rules: [                           // Fine-grained rules
 *     { files: ['src/*.js'], types: ['instanceMethod'] },
 *     { files: ['helpers/**'], names: ['push'] },
 *   ]
 * }
 */

/** @import { Finding } from '#/analyzer' */

const VALID_TYPES = new Set(/** @type {const} */ ([
	'global',
	'instanceMethod',
	'prototypeAccess',
	'spread',
	'staticMethod',
	'staticProperty',
]));

/** @typedef {{ categories?: string[], files?: string[], names?: string[], rules?: unknown, types?: string[] }} RawIgnoreConfig */
/** @typedef {{ categories: Set<string>, files: string[], names: Set<string>, rules: { categories: Set<string>, files: string[], names: Set<string>, types: Set<string> }[], types: Set<string> }} IgnoreConfig */

/**
 * Normalize ignore config to a consistent format
 * @param {RawIgnoreConfig | IgnoreConfig} config
 * @returns {null | IgnoreConfig}
 */
export function normalizeIgnoreConfig(config) {
	if (!config) {
		return null;
	}

	return {
		categories: Array.isArray(config.categories) ? new Set(config.categories) : new Set(),
		files: Array.isArray(config.files) ? config.files : [],
		names: Array.isArray(config.names) ? new Set(config.names) : new Set(),
		rules: Array.isArray(config.rules) ? config.rules.map((rule) => ({
			categories: Array.isArray(rule.categories) ? new Set(rule.categories) : new Set(),
			files: Array.isArray(rule.files) ? rule.files : [],
			names: Array.isArray(rule.names) ? new Set(rule.names) : new Set(),
			types: Array.isArray(rule.types) ? new Set(rule.types) : new Set(),
		})) : [],
		types: Array.isArray(config.types) ? new Set(config.types) : new Set(),
	};
}

/**
 * Check if a file path matches any of the glob patterns
 * @param {string} filePath
 * @param {string[]} patterns
 */
function matchesAnyPattern(filePath, patterns) {
	for (const pattern of patterns) {
		if (minimatch(filePath, pattern, { dot: true, matchBase: true })) {
			return true;
		}
	}
	return false;
}

/**
 * Check if a file should be ignored entirely
 * @param {string} filePath
 * @param {IgnoreConfig} [ignoreConfig]
 */
export function shouldIgnoreFile(filePath, ignoreConfig) {
	if (!ignoreConfig || ignoreConfig.files.length === 0) {
		return false;
	}
	return matchesAnyPattern(filePath, ignoreConfig.files);
}

/**
 * Check if a finding should be ignored
 * @param {Finding} finding
 * @param {IgnoreConfig} [ignoreConfig]
 */
export function shouldIgnoreFinding(finding, ignoreConfig) {
	if (!ignoreConfig) {
		return false;
	}

	// Check global type filter
	if (ignoreConfig.types.has(finding.type)) {
		return true;
	}

	// Check global category filter
	if (finding.category && ignoreConfig.categories.has(finding.category)) {
		return true;
	}

	// Check global name filter
	if (finding.name && ignoreConfig.names.has(finding.name)) {
		return true;
	}

	// Check fine-grained rules
	for (const rule of ignoreConfig.rules) {
		// Rule must match file pattern (if specified) and have at least one filter
		const fileMatches = rule.files.length === 0 || matchesAnyPattern(finding.file, rule.files);
		const hasFilters = rule.types.size > 0 || rule.categories.size > 0 || rule.names.size > 0;

		if (fileMatches && hasFilters && rule.files.length > 0) {
			// For file-specific rules, ANY matching filter causes ignore
			if (rule.types.has(finding.type)) {
				return true;
			}
			if (finding.category && rule.categories.has(finding.category)) {
				return true;
			}
			if (finding.name && rule.names.has(finding.name)) {
				return true;
			}
		}
	}

	return false;
}

/**
 * Filter an array of findings based on ignore config
 * @param {Finding[]} findings
 * @param {IgnoreConfig | null} [ignoreConfig]
 */
export function filterFindings(findings, ignoreConfig) {
	if (!ignoreConfig) {
		return findings;
	}
	return findings.filter((finding) => !shouldIgnoreFinding(finding, ignoreConfig));
}

/**
 * Get valid finding types for documentation/validation
 * @returns {(typeof VALID_TYPES extends Set<infer R> ? R : never)[]}
 */
export function getValidTypes() {
	return [...VALID_TYPES];
}
