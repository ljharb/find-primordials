#!/usr/bin/env node
/* eslint-disable max-lines -- the CLI entry inlines its help content (formerly help.txt) */

import fs from 'fs';
import path from 'path';

import {
	analyzeFiles,
	analyzeFilesParallel,
	applyFixes,
	categoryLabel,
	defaultExtensions,
	filterFindings,
	formatFindingAsTAP,
	isSafeFile,
	normalizeIgnoreConfig,
	shouldIgnoreFile,
} from 'find-primordials';
import ignore from 'ignore';
import pargs from 'pargs';

import { hasPipedData, processPipedRepos, removeDir } from '#/remote';

/** @import { AnalysisResult, AnalyzeOptions, Finding, FixKind, IgnoreConfig } from 'find-primordials' */

/**
 * Cache for ignore patterns by directory
 * @type {Map<string, ignore.Ignore>}
 */
const ignoreCache = new Map();

/**
 * Cache for project roots by directory
 * @type {Map<string, string>}
 */
const projectRootCache = new Map();

/**
 * Find the project root (directory containing package.json or .git)
 * @param {string} startDir
 */
function findProjectRoot(startDir) {
	if (projectRootCache.has(startDir)) {
		return /** @type {string} */ (projectRootCache.get(startDir));
	}

	let dir = startDir;
	const { root } = path.parse(dir);

	while (dir !== root) {
		// Check for package.json or .git
		const pkgPath = path.join(dir, 'package.json');
		const gitPath = path.join(dir, '.git');
		try {
			fs.accessSync(pkgPath);
			projectRootCache.set(startDir, dir);
			return dir;
		} catch {
			// Try .git
			try {
				fs.accessSync(gitPath);
				projectRootCache.set(startDir, dir);
				return dir;
			} catch {
				// Continue searching up
			}
		}
		dir = path.dirname(dir);
	}

	// No project root found, use the starting directory
	projectRootCache.set(startDir, startDir);
	return startDir;
}

/**
 * Load ignore patterns from a directory's .gitignore and .npmignore files (memoized)
 * @param {string} dir
 */
function loadDirIgnore(dir) {
	if (ignoreCache.has(dir)) {
		return /** @type {NonNullable<ReturnType<typeof ignoreCache.get>>} */ (ignoreCache.get(dir));
	}

	const ig = ignore();
	for (const ignoreFile of ['.gitignore', '.npmignore']) {
		const ignorePath = path.join(dir, ignoreFile);
		try {
			const content = fs.readFileSync(ignorePath, 'utf8');
			ig.add(content);
		} catch {
			// File doesn't exist or can't be read, skip
		}
	}

	ignoreCache.set(dir, ig);
	return ig;
}

/**
 * Check if a path is ignored by any .gitignore/.npmignore up the tree
 * @param {string} filePath
 * @param {string} stopAt
 */
function isIgnored(filePath, stopAt) {
	let dir = path.dirname(filePath);
	let relativePath = path.basename(filePath);

	while (dir.length >= stopAt.length && dir !== stopAt) {
		const ig = loadDirIgnore(dir);
		if (ig.ignores(relativePath)) {
			return true;
		}

		// Move up and extend the relative path
		relativePath = path.join(path.basename(dir), relativePath);
		dir = path.dirname(dir);
	}

	// Check the stopAt directory itself
	if (dir === stopAt) {
		const ig = loadDirIgnore(dir);
		if (ig.ignores(relativePath)) {
			return true;
		}
	}

	return false;
}

/**
 * @param {string[]} inputPaths
 * @param {string[]} extensions
 */
function collectFiles(inputPaths, extensions) {
	const files = [];

	/**
	 * @param {string} dir
	 * @param {string} stopAt
	 */
	function walkDir(dir, stopAt) {
		let entries;
		try {
			entries = fs.readdirSync(dir, { withFileTypes: true });
		} catch {
			return;
		}

		for (const entry of entries) {
			const fullPath = path.join(dir, entry.name);

			// Check if this path is ignored
			if (!isIgnored(fullPath, stopAt)) {
				if (entry.isDirectory()) {
					// Skip node_modules (always, even if not in ignore file)
					if (entry.name !== 'node_modules') {
						walkDir(fullPath, stopAt);
					}
				} else if (entry.isFile()) {
					const ext = path.extname(entry.name).toLowerCase();
					if (extensions.includes(ext)) {
						files.push(fullPath);
					}
				}
			}
		}
	}

	for (let i = 0; i < inputPaths.length; i += 1) {
		const inputPath = inputPaths[i];
		const resolved = path.resolve(inputPath);
		let stat;
		try {
			stat = fs.statSync(resolved);
		} catch {
			console.error(`Error: Path not found: ${inputPath}`);
			stat = null;
		}

		if (stat && stat.isDirectory()) {
			// Use project root as stopAt so we check .npmignore/.gitignore from root
			const projectRoot = findProjectRoot(resolved);
			walkDir(resolved, projectRoot);
		} else if (stat && stat.isFile()) {
			const projectRoot = findProjectRoot(path.dirname(resolved));
			if (!isIgnored(resolved, projectRoot)) {
				files.push(resolved);
			}
		}
	}

	return files;
}

/**
 * Format finding description for display
 * @param {Finding} finding
 */
function describeFinding(finding) {
	if (finding.type === 'spread') {
		return 'spread syntax (...)';
	}
	if (finding.type === 'instanceMethod') {
		return `.${finding.name}()`;
	}
	if (finding.type === 'staticMethod' || finding.type === 'prototypeAccess') {
		return `${finding.name}()`;
	}
	return finding.name;
}

/**
 * Output findings in ESLint stylish format
 * @param {Finding[]} findings
 */
function outputEslintFormat(findings) {
	if (findings.length === 0) {
		console.log('');
		console.log('\u2714 No primordial usages found');
		return;
	}

	/** @type {{ [k: string]: Finding[] }} */
	const byFile = {};
	for (const finding of findings) {
		if (!byFile[finding.file]) {
			byFile[finding.file] = [];
		}
		byFile[finding.file].push(finding);
	}

	let certainCount = 0;
	let uncertainCount = 0;

	for (const [filePath, fileFindings] of Object.entries(byFile).sort()) {
		console.log('');
		console.log(filePath);
		for (const finding of fileFindings) {
			const line = String(finding.line).padStart(4); // eslint-disable-line no-magic-numbers
			const col = String(finding.column).padEnd(4); // eslint-disable-line no-magic-numbers
			const severity = finding.certainty === 'uncertain' ? 'warning' : 'error';
			const desc = describeFinding(finding);
			const category = categoryLabel(finding);
			console.log(`  ${line}:${col}  ${severity.padEnd(7)}  ${desc.padEnd(30)}  ${category}`); // eslint-disable-line no-magic-numbers

			if (finding.certainty === 'certain') {
				certainCount += 1;
			} else {
				uncertainCount += 1;
			}
		}
	}

	console.log('');
	const total = certainCount + uncertainCount;

	const problems = total === 1 ? 'problem' : 'problems'; // eslint-disable-line no-magic-numbers
	const errorsWord = certainCount === 1 ? 'error' : 'errors'; // eslint-disable-line no-magic-numbers
	const warnings = uncertainCount === 1 ? 'warning' : 'warnings'; // eslint-disable-line no-magic-numbers
	console.log(`\u2716 ${total} ${problems} (${certainCount} ${errorsWord}, ${uncertainCount} ${warnings})`);
}

/**
 * Output findings in TAP format, grouped by file or type
 * @param {Finding[]} findings
 * @param {string} groupBy
 */
function outputTapFormat(findings, groupBy) {
	console.log('TAP version 14');

	if (findings.length === 0) {
		console.log('1..0');
		console.log('# No primordial usages found');
		return;
	}

	let testNum = 0;
	let certainCount = 0;
	let uncertainCount = 0;
	let currentGroup = null;

	/** @type {Record<string, Finding[]>} */
	const grouped = {};
	for (const finding of findings) {
		const category = categoryLabel(finding);
		const key = groupBy === 'type' ? category : finding.file;
		if (!grouped[key]) {
			grouped[key] = [];
		}
		grouped[key].push(finding);
	}

	for (const [groupKey, groupFindings] of Object.entries(grouped).sort()) {
		if (groupKey !== currentGroup) {
			console.log(`# ${groupKey}`);
			currentGroup = groupKey;
		}
		for (const finding of groupFindings) {
			testNum += 1;
			if (finding.certainty === 'certain') {
				certainCount += 1;
			} else {
				uncertainCount += 1;
			}
			console.log(formatFindingAsTAP(finding, testNum));
		}
	}

	// Output TAP plan and summary
	console.log(`1..${testNum}`);
	console.log(`# ${testNum} primordial usage${testNum === 1 ? '' : 's'} found`); // eslint-disable-line no-magic-numbers
	if (uncertainCount > 0) {
		console.log(`# (${certainCount} certain, ${uncertainCount} uncertain)`);
	}
}

/**
 * @typedef {{
 *  	ext: string;
 *		'group-by': "type" | "file";
 *  	uncertain: boolean;
 *	} & {
 *  	eslint?: boolean | undefined;
 *  	fix?: boolean | undefined;
 *  	globals?: boolean | undefined;
 *  	ignore?: string[] | undefined;
 *  	'ignore-categories'?: string | undefined;
 *  	'ignore-config'?: string | undefined;
 *  	'ignore-files'?: string | undefined;
 *  	'ignore-names'?: string | undefined;
 *  	'ignore-types'?: string | undefined;
 *  	'include-safe'?: boolean | undefined;
 *  	json?: boolean | undefined;
 *  	spread?: boolean | undefined;
 *  	static?: boolean | undefined;
 *	} & {
 *  	help: boolean;
 *  	version: boolean;
 *	}} PargsValues
 */

/**
 * Output findings in the requested format
 * @param {Finding[]} filtered
 * @param {AnalysisResult} result
 * @param {string[]} files
 * @param {PargsValues} values
 */
function outputResults(filtered, result, files, values) {
	if (values.json) {
		console.log(JSON.stringify({
			errors: result.errors,
			findings: filtered,
			summary: {
				certainFindings: filtered.filter((f) => f.certainty === 'certain').length,
				filesScanned: files.length,
				filesWithErrors: result.errors.length,
				totalFindings: filtered.length,
				uncertainFindings: filtered.filter((f) => f.certainty === 'uncertain').length,
			},
		}, null, 2)); // eslint-disable-line no-magic-numbers
	} else if (values.eslint) {
		outputEslintFormat(filtered);
	} else {
		outputTapFormat(filtered, values['group-by']);
	}
}

/** @import { RawIgnoreConfig } from 'find-primordials' */

/**
 * Build ignore config from CLI options and/or config file
 * @param {PargsValues} values
 */
function buildIgnoreConfig(values) {
	/** @type {RawIgnoreConfig} */
	let ignoreConfigData = {};

	if (values['ignore-config']) {
		try {
			const configContent = fs.readFileSync(values['ignore-config'], 'utf8');
			ignoreConfigData = JSON.parse(configContent);
		} catch (err) {
			const error = /** @type {Error} */ (err);
			console.error(`Error reading ignore config: ${error.message}`);
			process.exit(2); // eslint-disable-line no-magic-numbers
		}
	}

	// Merge CLI ignore options with config file
	if (values['ignore-files']) {
		ignoreConfigData.files = (ignoreConfigData.files || []).concat(values['ignore-files'].split(','));
	}
	if (values['ignore-types']) {
		ignoreConfigData.types = (ignoreConfigData.types || []).concat(values['ignore-types'].split(','));
	}
	if (values['ignore-categories']) {
		ignoreConfigData.categories = (ignoreConfigData.categories || []).concat(values['ignore-categories'].split(','));
	}
	if (values['ignore-names']) {
		ignoreConfigData.names = (ignoreConfigData.names || []).concat(values['ignore-names'].split(','));
	}

	return normalizeIgnoreConfig(ignoreConfigData);
}

/**
 * How each kind of fix is described in the summary.
 * @type {Record<FixKind, string>}
 */
const FIX_LABELS = {
	at: 'at-to-index',
	constructor: 'constructor-to-literal',
	isNaN: 'isNaN-to-comparison',
	push: 'push-to-assignment',
	undefined: 'undefined-to-void',
};

/** @type {FixKind[]} */
const FIX_KINDS = [
	'at',
	'constructor',
	'isNaN',
	'push',
	'undefined',
];

/**
 * A fix can expose another one nested inside it, and each pass rewrites at most
 * one of any overlapping pair, so files are re-analyzed until they settle.
 */
const MAX_FIX_PASSES = 10;

/**
 * Narrow a fresh analysis the same way the initial run was narrowed.
 * @param {Finding[]} findings - The findings to narrow
 * @param {PargsValues} values - The parsed CLI options
 * @param {IgnoreConfig | null} ignoreConfig - The normalized ignore config
 * @returns {Finding[]}
 */
function selectFindings(findings, values, ignoreConfig) {
	const certain = values.uncertain ? findings : findings.filter((f) => f.certainty === 'certain');
	return filterFindings(certain, ignoreConfig);
}

/**
 * Rewrite every file with fixable findings, and report the findings left over.
 * @param {Finding[]} filtered - Filtered findings to potentially fix
 * @param {{ analyzeOptions: AnalyzeOptions, ignoreConfig: (IgnoreConfig | null), values: PargsValues }} options - `analyzeOptions`, `ignoreConfig`, and parsed `values`
 * @returns {Finding[]} The findings that remain once fixing has settled
 */
function applyFixesToFindings(filtered, options) {
	const {
		analyzeOptions,
		ignoreConfig,
		values,
	} = options;

	/** @type {Map<string, Finding[]>} */
	const findingsByFile = new Map();
	for (const f of filtered) {
		if (f.file) {
			if (!findingsByFile.has(f.file)) {
				findingsByFile.set(f.file, []);
			}
			findingsByFile.get(f.file)?.push(f);
		}
	}

	// every key is seeded, so that `constructor` counts a fix rather than inheriting one
	/** @type {Record<string, number>} */
	const totals = {};
	for (const kind of FIX_KINDS) {
		totals[kind] = 0;
	}

	/** @type {Finding[]} */
	const remaining = [];
	for (const [filePath, fileFindings] of findingsByFile) {
		let current = fileFindings;
		let fixing = true;
		for (let pass = 0; fixing && pass < MAX_FIX_PASSES; pass += 1) { // eslint-disable-line no-magic-numbers
			const result = applyFixes(filePath, current);
			fixing = result.fixed;
			if (fixing) {
				fs.writeFileSync(filePath, result.output);
				for (const kind of FIX_KINDS) {
					totals[kind] += result.fixCounts[kind];
				}
				// the rewrite moved every position recorded below it, so re-derive them
				current = selectFindings(analyzeFiles([filePath], analyzeOptions).findings, values, ignoreConfig);
			}
		}
		remaining.push(...current);
	}

	for (const kind of FIX_KINDS) {
		const count = totals[kind];
		if (count > 0) {
			console.log(`Fixed ${count} ${FIX_LABELS[kind]} issue${count === 1 ? '' : 's'}`); // eslint-disable-line no-magic-numbers
		}
	}

	return remaining;
}

/**
 * Filter out files matching --ignore patterns (supports globs)
 * @param {string[]} files
 * @param {string[] | undefined} ignoredPaths
 */
function filterIgnoredPaths(files, ignoredPaths) {
	if (!ignoredPaths || ignoredPaths.length === 0) {
		return files;
	}
	return files.filter((f) => !ignoredPaths.some((pattern) => {
		const resolved = path.resolve(pattern);
		// Exact file or directory prefix match
		if (f === resolved || f.startsWith(`${resolved}${path.sep}`)) {
			return true;
		}
		// Glob match against absolute path
		return path.matchesGlob(f, pattern) || path.matchesGlob(f, path.resolve(pattern));
	}));
}

async function main() {
	const {
		errors,
		help,
		positionals,
		values,
	} = await pargs(import.meta.filename, /** @type {const} */ ({
		allowPositionals: true,
		description: {
			examples: [
				'find-primordials ./src',
				'find-primordials ./src --globals --static',
				'find-primordials ./lib ./test --no-uncertain',
				'find-primordials ./src --ext .js,.ts --json',
				'find-primordials ./src --eslint',
				'find-primordials ./src --group-by type',
				'find-primordials ./src --ignore-names test,exec',
				'find-primordials ./src --ignore-config .primordials-ignore.json',
				'echo "ljharb/tape" | find-primordials --globals --static',
				'cat repos.txt | find-primordials --json',
			],
			sections: [
				{
					body: 'arr.push(x)      -> arr[arr.length] = x\narr.at(0)        -> arr[0]\narr.at(-1)       -> arr[arr.length - 1]\nnew Array()      -> []\nArray(a, b)      -> [a, b]\nnew Object()     -> {}\nNumber.isNaN(x)  -> (x !== x)\nundefined        -> void undefined\n\nOnly certain findings are rewritten, and only where the result is equivalent: a\nrewrite that would name an operand twice is skipped when that operand is a call.\nProperty accesses are read through freely, so a getter that does not behave like a\nproperty is not accounted for. Anything left unfixed is still reported.',
					title: 'Fixes applied by --fix',
				},
				{
					body: '{\n  "files": ["vendor/**"],\n  "types": ["spread", "global"],\n  "categories": ["RegExp"],\n  "names": ["test", "exec"],\n  "rules": [\n    { "files": ["src/*.js"], "types": ["instanceMethod"] },\n    { "files": ["helpers/**"], "names": ["push"] }\n  ]\n}',
					title: 'Ignore Config File Format (JSON)',
				},
				{
					body: 'user/repo              -> https://github.com/user/repo.git\nhttps://github.com/... -> used as-is\ngit@github.com:...     -> used as-is',
					title: 'Supported repo formats',
				},
			],
			summary: 'Find primordials in use in JavaScript/TypeScript files.\n\nPaths can be local directories/files, or pipe GitHub repo URLs via stdin.\nWhen piping, repos are cloned to temp directories, analyzed, then cleaned up.',
		},
		options: {
			eslint: {
				description: 'Output in ESLint-style format (mutually exclusive with --group-by)',
				short: 'e',
				type: 'boolean',
			},
			ext: {
				default: defaultExtensions.join(','),
				description: 'Comma-separated list of extensions to scan',
				placeholder: 'extensions',
				type: 'string',
			},
			fix: {
				description: 'Rewrite the findings that have a primordial-free equivalent (see "Fixes applied by --fix")',
				type: 'boolean',
			},
			globals: {
				description: 'Include global primordial usage (Array, Object, etc.)',
				short: 'g',
				type: 'boolean',
			},
			'group-by': {
				choices: ['file', 'type'],
				default: 'file',
				description: "Group output by 'file' or 'type' (mutually exclusive with --eslint)",
				placeholder: 'mode',
				type: 'enum',
			},
			ignore: {
				description: 'Path or glob pattern to skip; can be repeated',
				multiple: true,
				placeholder: 'pattern',
				type: 'string',
			},
			'ignore-categories': {
				description: 'Comma-separated categories to ignore (Array, Object, etc.)',
				group: 'Ignore Options',
				placeholder: 'cats',
				type: 'string',
			},
			'ignore-config': {
				description: 'Path to JSON file with ignore configuration',
				group: 'Ignore Options',
				placeholder: 'file',
				type: 'string',
			},
			'ignore-files': {
				description: 'Comma-separated glob patterns of files to ignore',
				group: 'Ignore Options',
				placeholder: 'globs',
				type: 'string',
			},
			'ignore-names': {
				description: 'Comma-separated method/property names to ignore',
				group: 'Ignore Options',
				placeholder: 'names',
				type: 'string',
			},
			'ignore-types': {
				description: 'Comma-separated finding types to ignore (global, instanceMethod, prototypeAccess, spread, staticMethod, staticProperty)',
				group: 'Ignore Options',
				placeholder: 'types',
				type: 'string',
			},
			'include-safe': {
				description: 'Include findings in safe files (bin entries, test files)',
				type: 'boolean',
			},
			json: {
				description: 'Output as JSON instead of TAP',
				short: 'j',
				type: 'boolean',
			},
			spread: {
				description: 'Include spread syntax (...arr, {...obj})',
				type: 'boolean',
			},
			static: {
				description: 'Include static method usage (Object.keys, Array.isArray, etc.)',
				short: 's',
				type: 'boolean',
			},
			uncertain: {
				default: true,
				description: 'Include uncertain findings (where the type cannot be determined); use --no-uncertain to suppress',
				type: 'boolean',
			},
		},
		positionals: [
			{
				description: 'local directories/files to scan (or pipe GitHub repo URLs via stdin)', name: 'paths', rest: true,
			},
		],
	}));

	// Custom validation: eslint and group-by are mutually exclusive
	if (values.eslint && values['group-by'] !== 'file') {
		errors.push('--eslint and --group-by are mutually exclusive');
	}

	// Check if stdin has piped data (not a TTY)
	const hasPipedInput = hasPipedData();

	// Validate positionals after pargs so --help and --version work without paths
	if (positionals.length === 0 && !values.help && !values.version && !hasPipedInput) {
		errors.push('No paths specified (or pipe repo URLs via stdin)');
	}

	/*
	 * pargs derives an exit code from how many errors there are; presetting one
	 * takes precedence, keeping every usage error on the documented code of 2.
	 */
	if (errors.length > 0) {
		process.exitCode = 2; // eslint-disable-line no-magic-numbers
	}

	await help();

	const ignoreConfig = buildIgnoreConfig(values);

	const extensions = values.ext.split(',').map((e) => (e.startsWith('.') ? e : `.${e}`));

	// Handle remote repos from stdin
	/** @type {string[]} */
	let tempDirs = [];
	const inputPaths = [...positionals];

	if (hasPipedInput && positionals.length === 0) {
		const { clonedPaths, tempDirs: newTempDirs } = await processPipedRepos();
		tempDirs = newTempDirs;
		inputPaths.push(...clonedPaths);
	}

	let files = filterIgnoredPaths(
		collectFiles(inputPaths, extensions),
		values.ignore,
	);

	// Filter out ignored files
	if (ignoreConfig) {
		files = files.filter((f) => !shouldIgnoreFile(f, ignoreConfig));
	}

	if (files.length === 0) {
		// Clean up temp dirs before exiting
		for (const dir of tempDirs) {
			removeDir(dir);
		}

		console.error('Error: No matching files found');
		process.exit(2);
	}

	const analyzeOptions = {
		includeGlobals: values.globals,
		includeSpread: values.spread,
		includeStatic: values.static,
		includeUncertain: values.uncertain,
		isSafeFile: values['include-safe'] ? null : isSafeFile,
	};

	// Use parallel processing for batch operations
	const result = await analyzeFilesParallel(files, analyzeOptions);

	// Report any parse errors
	for (const error of result.errors) {
		console.error(`Warning: ${error.file}: ${error.error}`);
	}

	// Filter findings based on includeUncertain option and ignore config
	let filtered = selectFindings(result.findings, values, ignoreConfig);

	// Apply fixes if requested
	if (values.fix) {
		filtered = applyFixesToFindings(filtered, {
			analyzeOptions,
			ignoreConfig,
			values,
		});
	}

	outputResults(filtered, result, files, values);

	// Clean up temp directories from remote repos
	for (const dir of tempDirs) {
		removeDir(dir);
	}

	// Set exit code for non-zero if any findings (don't call exit() to allow stdout to flush)
	if (filtered.length > 0) {
		process.exitCode = 1;
	}
}

main().catch((err) => {
	console.error('Error:', err.message);
	process.exit(2);
});
