
import fs from 'fs';
import path from 'path';

import * as minimatchModule from 'minimatch';

import { resolveMinimatch } from '#/ignore';

/* Handle both minimatch v3 (CJS default) and v10+ (named export) */
const minimatch = resolveMinimatch(minimatchModule);

/** The loosely-typed AST node the predicates accept; re-exported for downstream typing. */
/** @typedef {import('#/analyzer').ASTNode} ASTNode */

export {
	analyzeFile,
	analyzeFiles,
	analyzeFilesParallel,
	applyFixes,
	applyPushFixes,
	applyUndefinedFixes,
	canBeArrayLiteral,
	canRewriteUndefined,
	categoryLabel,
	describeType,
	formatAsTAP,
	formatFindingAsTAP,
	groupFindingsByCategory,
	isCalled,
	isReevaluable,
	isRepeatable,
	literalIndex,
	startsAStatement,
	voidNeedsParens,
} from '#/analyzer';

/** @typedef {import('./analyzer.mjs').AnalysisResult} AnalysisResult */
/** @typedef {import('./analyzer.mjs').AnalyzeOptions} AnalyzeOptions */
/** @typedef {import('./analyzer.mjs').Finding} Finding */
/** @typedef {import('./analyzer.mjs').FixKind} FixKind */
/** @typedef {import('./ignore.mjs').IgnoreConfig} IgnoreConfig */
/** @typedef {import('./ignore.mjs').RawIgnoreConfig} RawIgnoreConfig */

export {
	allGlobals,
	allInstanceMethods,
	allStaticMethods,
	ambiguousInstanceMethods,
	globalToCategory,
	primordials,
	typedArrayGlobals,
} from '#/primordials';

export {
	filterFindings,
	getValidTypes,
	normalizeIgnoreConfig,
	shouldIgnoreFile,
	shouldIgnoreFinding,
} from '#/ignore';

export const defaultExtensions = [
	'.js',
	'.mjs',
	'.cjs',
	'.jsx',
	'.ts',
	'.mts',
	'.cts',
	'.tsx',
];

const TEST_PATTERNS = [
	/[/\\]tests?[/\\]/i,
	/[/\\]__tests__[/\\]/i,
	/[/\\]spec[/\\]/i,
	/\.test\.[mc]?[jt]sx?$/i,
	/\.spec\.[mc]?[jt]sx?$/i,
	/_test\.[mc]?[jt]sx?$/i,
	/-test\.[mc]?[jt]sx?$/i,
];

// Common config file patterns (eslint, prettier, jest, babel, webpack, rollup, vite, etc.)
const CONFIG_PATTERNS = [
	// eslint configs
	/[/\\]eslint\.config\.[mc]?[jt]s$/i,
	/[/\\]\.eslintrc\.[mc]?js$/i,
	// prettier configs
	/[/\\]prettier\.config\.[mc]?[jt]s$/i,
	/[/\\]\.prettierrc\.[mc]?js$/i,
	// jest configs
	/[/\\]jest\.config\.[mc]?[jt]s$/i,
	// babel configs
	/[/\\]babel\.config\.[mc]?[jt]s$/i,
	/[/\\]\.babelrc\.[mc]?js$/i,
	// bundler configs
	/[/\\]webpack\.config\.[mc]?[jt]s$/i,
	/[/\\]rollup\.config\.[mc]?[jt]s$/i,
	/[/\\]vite\.config\.[mc]?[jt]s$/i,
	/[/\\]esbuild\.config\.[mc]?[jt]s$/i,
	// task runners
	/[/\\]gulpfile\.[mc]?[jt]s$/i,
	/[/\\]gulpfile\.babel\.[mc]?js$/i,
	/[/\\]gulpfile\.esm\.[mc]?js$/i,
	/[/\\]Gruntfile\.[mc]?js$/i,
	// other common configs
	/[/\\]postcss\.config\.[mc]?[jt]s$/i,
	/[/\\]tailwind\.config\.[mc]?[jt]s$/i,
	/[/\\]next\.config\.[mc]?[jt]s$/i,
	/[/\\]nuxt\.config\.[mc]?[jt]s$/i,
	/[/\\]vitest\.config\.[mc]?[jt]s$/i,
	/[/\\]karma\.conf\.[mc]?js$/i,
	/[/\\]\.mocharc\.[mc]?js$/i,
	/[/\\]nyc\.config\.[mc]?js$/i,
	/[/\\]commitlint\.config\.[mc]?[jt]s$/i,
	/[/\\]lint-staged\.config\.[mc]?[jt]s$/i,
	/[/\\]\.lintstagedrc\.[mc]?js$/i,
	/[/\\]release\.config\.[mc]?[jt]s$/i,
	/[/\\]metro\.config\.[mc]?[jt]s$/i,
	/[/\\]tsup\.config\.[mc]?[jt]s$/i,
	/[/\\]ava\.config\.[mc]?[jt]s$/i,
	/[/\\]\.c8rc\.[mc]?js$/i,
];

/**
 * Check if a file path matches common test file patterns
 * @param {string} filePath
 */
export function isTestFile(filePath) {
	for (let i = 0; i < TEST_PATTERNS.length; i += 1) {
		if (TEST_PATTERNS[i].test(filePath)) {
			return true;
		}
	}
	return false;
}

/**
 * Check if a file path matches common config file patterns
 * @param {string} filePath
 */
export function isConfigFile(filePath) {
	for (let i = 0; i < CONFIG_PATTERNS.length; i += 1) {
		if (CONFIG_PATTERNS[i].test(filePath)) {
			return true;
		}
	}
	return false;
}

/** @typedef {Record<string, unknown>} PackageJSON */
/** @typedef {{ dir: string, pkg: PackageJSON }} PackageJSONCacheValue */

/**
 * Cache for findPackageJson results
 * @type {Map<string, PackageJSONCacheValue | null>}
 */
const packageJsonCache = new Map();

/**
 * Find the nearest package.json for a file (cached)
 * @param {string} filePath
 */
function findPackageJson(filePath) {
	const startDir = path.dirname(path.resolve(filePath));

	if (packageJsonCache.has(startDir)) {
		return packageJsonCache.get(startDir);
	}

	const { root } = path.parse(startDir);
	let dir = startDir;
	const visited = [];

	while (dir !== root) {
		if (packageJsonCache.has(dir)) {
			const result = /** @type {PackageJSONCacheValue} */ (packageJsonCache.get(dir));
			for (const v of visited) {
				packageJsonCache.set(v, result);
			}
			return result;
		}
		visited[visited.length] = dir;
		const pkgPath = path.join(dir, 'package.json');
		try {
			const content = fs.readFileSync(pkgPath, 'utf8');
			const result = { dir, pkg: JSON.parse(content) };
			for (const v of visited) {
				packageJsonCache.set(v, result);
			}
			return result;
		} catch {
			// Continue searching
		}
		dir = path.dirname(dir);
	}

	for (const v of visited) {
		packageJsonCache.set(v, null);
	}
	return null;
}

/**
 * Extract all file paths referenced in a package.json exports field
 * @param {string | { [k: string]: string }} exportsValue
 */
function getExportsFiles(exportsValue) {
	/** @type {string[]} */
	const files = [];
	if (typeof exportsValue === 'string') {
		files[files.length] = exportsValue;
	} else if (Array.isArray(exportsValue)) {
		for (const item of exportsValue) {
			const nested = getExportsFiles(item);
			for (const f of nested) {
				files[files.length] = f;
			}
		}
	} else if (typeof exportsValue === 'object' && exportsValue !== null) {
		for (const value of Object.values(exportsValue)) {
			const nested = getExportsFiles(value);
			for (const f of nested) {
				files[files.length] = f;
			}
		}
	}
	return files;
}

/**
 * Check if a file is a bin-only entry point (not also accessible via exports)
 * @param {string} filePath
 */
export function isBinFile(filePath) {
	const result = findPackageJson(filePath);
	if (!result) {
		return false;
	}

	const { dir, pkg } = result;
	const { bin } = pkg;
	if (!bin) {
		return false;
	}

	const resolved = path.resolve(filePath);
	const relativePath = path.relative(dir, resolved);
	const normalizedRelPath = path.normalize(relativePath);

	/** @param {string} binValue */
	function matchesBin(binValue) {
		return relativePath === binValue || normalizedRelPath === path.normalize(binValue);
	}

	let isBin = false;
	if (typeof bin === 'string') {
		isBin = matchesBin(bin);
	} else if (typeof bin === 'object') {
		isBin = Object.values(bin).some(matchesBin);
	}

	if (!isBin) {
		return false;
	}

	// If the file is also accessible via exports, it should be linted
	if (pkg.exports) {
		for (const f of getExportsFiles(pkg.exports)) {
			if (!f.includes('*') && path.normalize(f) === normalizedRelPath) {
				return false;
			}
		}
	}

	return true;
}

/**
 * Check if a file is in a private package
 * @param {string} filePath
 */
export function isPrivatePackage(filePath) {
	const result = findPackageJson(filePath);
	return result !== null && typeof result !== 'undefined' && result.pkg.private === true;
}

/** Patterns for files npm always includes in published packages */
const ALWAYS_PUBLISHED_PATTERNS = [
	/^package\.json$/i,
	/^readme[^/\\]*$/i,
	/^licen[sc]e[^/\\]*$/i,
	/^changelog[^/\\]*$/i,
	/^changes[^/\\]*$/i,
	/^history[^/\\]*$/i,
];

/**
 * Check if a file would not be included in the published npm package
 * @param {string} filePath
 */
export function isUnpublishedFile(filePath) {
	const result = findPackageJson(filePath);
	if (!result) {
		return false;
	}

	const { dir, pkg } = result;

	// Private packages are never published
	if (pkg.private === true) {
		return true;
	}

	// If no files field, can't determine from package.json alone
	if (!Array.isArray(pkg.files)) {
		return false;
	}

	const resolved = path.resolve(filePath);
	const relativePath = path.relative(dir, resolved);

	// Check mandatory includes (root-level files only)
	if (!relativePath.includes(path.sep)) {
		for (const pattern of ALWAYS_PUBLISHED_PATTERNS) {
			if (pattern.test(relativePath)) {
				return false;
			}
		}
	}

	// Check files referenced by main, browser, exports, types (not bin - bin-only files are safe)
	/** @type {Set<string>} */
	const mandatoryFiles = new Set();
	if (typeof pkg.main === 'string') {
		mandatoryFiles.add(path.normalize(pkg.main));
	}
	if (typeof pkg.browser === 'string') {
		mandatoryFiles.add(path.normalize(pkg.browser));
	}
	if (pkg.exports) {
		for (const f of getExportsFiles(pkg.exports)) {
			if (!f.includes('*')) {
				mandatoryFiles.add(path.normalize(f));
			}
		}
	}
	if (typeof pkg.types === 'string') {
		mandatoryFiles.add(path.normalize(pkg.types));
	}
	if (typeof pkg.typings === 'string') {
		mandatoryFiles.add(path.normalize(pkg.typings));
	}

	if (mandatoryFiles.has(path.normalize(relativePath))) {
		return false;
	}

	// Check against files whitelist patterns
	for (const rawPattern of pkg.files) {
		const pattern = rawPattern.replace(/^\.\//, '').replace(/\/+$/, '');

		if (minimatch(relativePath, pattern, { dot: true })) {
			return false;
		}
		// Also match as directory contents (e.g., "lib" matches "lib/foo.js")
		if (minimatch(relativePath, `${pattern}/**`, { dot: true })) {
			return false;
		}
	}

	return true;
}

/**
 * Check if a file is safe (unpublished, bin entry, test file, or config file)
 * @param {string} filePath
 */
export function isSafeFile(filePath) {
	return isUnpublishedFile(filePath) || isTestFile(filePath) || isBinFile(filePath) || isConfigFile(filePath);
}
