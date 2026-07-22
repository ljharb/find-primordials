import path from 'path';
import test from 'tape';
import { fileURLToPath } from 'url';
import { Worker } from 'worker_threads';

import fs from 'fs';
import os from 'os';

import {
	allGlobals,
	allInstanceMethods,
	allStaticMethods,
	analyzeFile,
	analyzeFiles,
	analyzeFilesParallel,
	applyFixes,
	applyPushFixes,
	applyUndefinedFixes,
	defaultExtensions,
	filterFindings,
	getValidTypes,
	groupFindingsByCategory,
	isBinFile,
	isConfigFile,
	isPrivatePackage,
	isSafeFile,
	isTestFile,
	isUnpublishedFile,
	normalizeIgnoreConfig,
	primordials,
	shouldIgnoreFile,
	shouldIgnoreFinding,
} from 'find-primordials';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const fixturesDir = path.join(__dirname, 'fixtures');

test('primordials - exports primordials object', (t) => {
	t.ok(primordials, 'primordials is exported');
	t.equal(typeof primordials, 'object', 'primordials is an object');
	t.ok(primordials.Array, 'has Array');
	t.ok(primordials.Object, 'has Object');
	t.ok(primordials.String, 'has String');
	t.end();
});

test('primordials - allGlobals is a Set', (t) => {
	t.ok(allGlobals instanceof Set, 'allGlobals is a Set');
	t.ok(allGlobals.has('Array'), 'has Array');
	t.ok(allGlobals.has('Object'), 'has Object');
	t.ok(allGlobals.has('Map'), 'has Map');
	t.ok(allGlobals.has('Set'), 'has Set');
	t.end();
});

test('primordials - allInstanceMethods is a Map', (t) => {
	t.ok(allInstanceMethods instanceof Map, 'allInstanceMethods is a Map');
	t.ok(allInstanceMethods.has('push'), 'has push');
	t.ok(allInstanceMethods.has('map'), 'has map');
	t.ok(allInstanceMethods.has('slice'), 'has slice');
	t.end();
});

test('primordials - allStaticMethods is a Map', (t) => {
	t.ok(allStaticMethods instanceof Map, 'allStaticMethods is a Map');
	t.ok(allStaticMethods.has('keys'), 'has keys');
	t.ok(allStaticMethods.has('isArray'), 'has isArray');
	t.ok(allStaticMethods.has('assign'), 'has assign');
	t.end();
});

test('analyzeFile - analyzes safe file', (t) => {
	const safePath = path.join(fixturesDir, 'sample-project', 'safe.js');
	const result = analyzeFile(safePath);

	t.notOk(result.error, 'no error');
	t.ok(Array.isArray(result.findings), 'findings is an array');
	t.equal(result.findings.length, 0, 'no findings for safe file (instance methods only by default)'); // eslint-disable-line no-magic-numbers
	t.end();
});

test('analyzeFile - analyzes unsafe file', (t) => {
	const unsafePath = path.join(fixturesDir, 'sample-project', 'unsafe.js');
	const result = analyzeFile(unsafePath);

	t.notOk(result.error, 'no error');
	t.ok(result.findings.length > 0, 'has findings'); // eslint-disable-line no-magic-numbers

	// Check that we found instance methods
	function isInstanceMethod(f) {
		return f.type === 'instanceMethod';
	}
	const instanceMethods = result.findings.filter(isInstanceMethod);
	t.ok(instanceMethods.length > 0, 'found instance methods'); // eslint-disable-line no-magic-numbers

	// Check specific findings
	function isPush(f) {
		return f.name === 'push';
	}
	const pushFinding = result.findings.find(isPush);
	t.ok(pushFinding, 'found push usage');

	function isMap(f) {
		return f.name === 'map';
	}
	const mapFinding = result.findings.find(isMap);
	t.ok(mapFinding, 'found map usage');

	t.end();
});

test('analyzeFile - includes globals when option is set', (t) => {
	const unsafePath = path.join(fixturesDir, 'sample-project', 'unsafe.js');
	const result = analyzeFile(unsafePath, { includeGlobals: true });

	t.notOk(result.error, 'no error');

	function isGlobal(f) {
		return f.type === 'global';
	}
	const globals = result.findings.filter(isGlobal);
	t.ok(globals.length > 0, 'found global usages'); // eslint-disable-line no-magic-numbers

	function isArrayGlobal(f) {
		return f.name === 'Array';
	}
	const arrayGlobal = globals.find(isArrayGlobal);
	t.ok(arrayGlobal, 'found Array global usage');

	t.end();
});

test('analyzeFile - includes static methods when option is set', (t) => {
	const unsafePath = path.join(fixturesDir, 'sample-project', 'unsafe.js');
	const result = analyzeFile(unsafePath, { includeStatic: true });

	t.notOk(result.error, 'no error');

	function isStaticMethod(f) {
		return f.type === 'staticMethod';
	}
	const staticMethods = result.findings.filter(isStaticMethod);
	t.ok(staticMethods.length > 0, 'found static method usages'); // eslint-disable-line no-magic-numbers

	function isKeysMethod(f) {
		return f.name === 'Object.keys';
	}
	const keysFinding = staticMethods.find(isKeysMethod);
	t.ok(keysFinding, 'found Object.keys usage');

	t.end();
});

test('analyzeFile - reports through an array type alias', (t) => {
	const aliasPath = path.join(fixturesDir, 'ts-project', 'aliased-array.js');
	const result = analyzeFile(aliasPath, {});

	t.notOk(result.error, 'no error');
	function isPush(f) {
		return f.name === 'push';
	}
	t.ok(result.findings.find(isPush), 'finds push on a value whose type is named by an alias');
	t.end();
});

test('analyzeFile - a data property named after a method is not a method', (t) => {
	const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'primordials-reads-'));

	function findingsFor(name, code) {
		const testFile = path.join(tmpDir, name);
		fs.writeFileSync(testFile, code);
		return analyzeFile(testFile, {}).findings;
	}

	t.equal(findingsFor('read-test.js', 'function fn(row) { return typeof row.test === \'number\' ? row.test : null; }').length, 0, 'reading row.test is not RegExp#test'); // eslint-disable-line no-magic-numbers
	t.equal(findingsFor('read-at.js', 'function fn(row) { return row.at; }').length, 0, 'reading row.at is not Array#at'); // eslint-disable-line no-magic-numbers

	// a call reaches something callable, so the name is worth reporting even without a type
	t.equal(findingsFor('call-test.js', 'function fn(re, s) { return re.test(s); }').length, 1, 'calling re.test() is reported'); // eslint-disable-line no-magic-numbers
	t.equal(findingsFor('call-at.js', 'function fn(arr) { return arr.at(0); }').length, 1, 'calling arr.at() is reported'); // eslint-disable-line no-magic-numbers

	// the type says this one is an array, so reading the method really does reach the primordial
	t.equal(findingsFor('read-typed.js', 'function fn() { return [1, 2].at; }').length, 1, 'reading .at on an array literal is reported'); // eslint-disable-line no-magic-numbers

	// these reach the method too, just not by calling it directly
	function named(name, findings) {
		return findings.filter((f) => f.name === name);
	}
	t.equal(named('test', findingsFor('forwarded.js', 'function fn(re, s) { return re.test.call(re, s); }')).length, 1, 're.test.call() reaches the method'); // eslint-disable-line no-magic-numbers
	t.equal(named('at', findingsFor('constructed.js', 'function fn(o) { return new o.at(); }')).length, 1, 'new o.at() invokes it'); // eslint-disable-line no-magic-numbers

	fs.rmSync(tmpDir, { recursive: true });
	t.end();
});

test('analyzeFile - handles non-existent file', (t) => {
	const result = analyzeFile('/nonexistent/path/to/file.js');

	t.ok(result.error, 'has error');
	t.equal(result.findings.length, 0, 'no findings'); // eslint-disable-line no-magic-numbers
	t.end();
});

test('analyzeFiles - analyzes multiple files', (t) => {
	const files = [
		path.join(fixturesDir, 'sample-project', 'safe.js'),
		path.join(fixturesDir, 'sample-project', 'unsafe.js'),
	];
	const result = analyzeFiles(files);

	t.ok(Array.isArray(result.findings), 'findings is an array');
	t.ok(Array.isArray(result.errors), 'errors is an array');
	t.equal(result.errors.length, 0, 'no errors'); // eslint-disable-line no-magic-numbers
	t.ok(result.findings.length > 0, 'has findings'); // eslint-disable-line no-magic-numbers
	t.end();
});

test('groupFindingsByCategory', (t) => {
	const findings = [
		{ category: 'Array', name: 'push' },
		{ category: 'Array', name: 'map' },
		{ category: 'Object', name: 'keys' },
		{ category: 'String', name: 'slice' },
	];

	const grouped = groupFindingsByCategory(findings);

	t.ok(grouped.Array, 'has Array category');
	t.equal(grouped.Array.length, 2, 'Array has 2 findings'); // eslint-disable-line no-magic-numbers
	t.ok(grouped.Object, 'has Object category');
	t.equal(grouped.Object.length, 1, 'Object has 1 finding'); // eslint-disable-line no-magic-numbers
	t.ok(grouped.String, 'has String category');
	t.equal(grouped.String.length, 1, 'String has 1 finding'); // eslint-disable-line no-magic-numbers

	t.end();
});

test('defaultExtensions - exports array of extensions', (t) => {
	t.ok(Array.isArray(defaultExtensions), 'defaultExtensions is an array');
	t.ok(defaultExtensions.includes('.js'), 'has .js');
	t.ok(defaultExtensions.includes('.mjs'), 'has .mjs');
	t.ok(defaultExtensions.includes('.cjs'), 'has .cjs');
	t.ok(defaultExtensions.includes('.ts'), 'has .ts');
	t.ok(defaultExtensions.includes('.tsx'), 'has .tsx');
	t.end();
});

test('isTestFile - identifies test files', (t) => {
	// Test directory patterns
	t.ok(isTestFile('/project/test/foo.js'), 'matches test/ directory');
	t.ok(isTestFile('/project/tests/foo.js'), 'matches tests/ directory');
	t.ok(isTestFile('/project/__tests__/foo.js'), 'matches __tests__/ directory');
	t.ok(isTestFile('/project/spec/foo.js'), 'matches spec/ directory');

	// Test file patterns
	t.ok(isTestFile('/project/foo.test.js'), 'matches .test.js');
	t.ok(isTestFile('/project/foo.spec.js'), 'matches .spec.js');
	t.ok(isTestFile('/project/foo_test.js'), 'matches _test.js');
	t.ok(isTestFile('/project/foo-test.js'), 'matches -test.js');
	t.ok(isTestFile('/project/foo.test.mjs'), 'matches .test.mjs');
	t.ok(isTestFile('/project/foo.test.ts'), 'matches .test.ts');
	t.ok(isTestFile('/project/foo.test.tsx'), 'matches .test.tsx');

	// Non-test files
	t.notOk(isTestFile('/project/src/foo.js'), 'does not match regular file');
	t.notOk(isTestFile('/project/testing.js'), 'does not match testing.js');

	t.end();
});

test('isConfigFile - identifies config files', (t) => {
	// ESLint configs
	t.ok(isConfigFile('/project/eslint.config.js'), 'matches eslint.config.js');
	t.ok(isConfigFile('/project/eslint.config.mjs'), 'matches eslint.config.mjs');
	t.ok(isConfigFile('/project/.eslintrc.js'), 'matches .eslintrc.js');

	// Prettier configs
	t.ok(isConfigFile('/project/prettier.config.js'), 'matches prettier.config.js');
	t.ok(isConfigFile('/project/.prettierrc.js'), 'matches .prettierrc.js');

	// Bundler configs
	t.ok(isConfigFile('/project/webpack.config.js'), 'matches webpack.config.js');
	t.ok(isConfigFile('/project/rollup.config.js'), 'matches rollup.config.js');
	t.ok(isConfigFile('/project/vite.config.js'), 'matches vite.config.js');
	t.ok(isConfigFile('/project/esbuild.config.js'), 'matches esbuild.config.js');

	// Task runners
	t.ok(isConfigFile('/project/gulpfile.js'), 'matches gulpfile.js');
	t.ok(isConfigFile('/project/Gruntfile.js'), 'matches Gruntfile.js');

	// Other configs
	t.ok(isConfigFile('/project/jest.config.js'), 'matches jest.config.js');
	t.ok(isConfigFile('/project/babel.config.js'), 'matches babel.config.js');
	t.ok(isConfigFile('/project/tsup.config.ts'), 'matches tsup.config.ts');

	// Non-config files
	t.notOk(isConfigFile('/project/src/foo.js'), 'does not match regular file');
	t.notOk(isConfigFile('/project/config.js'), 'does not match generic config.js');

	t.end();
});

test('isBinFile - identifies bin-only entry points', (t) => {
	const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'find-primordials-bin-'));

	// Test with the actual CLI package which has bin defined as object (no exports)
	const binPath = path.join(fixturesDir, '..', '..', 'cli', 'bin.mjs');
	t.ok(isBinFile(binPath), 'identifies bin-only file (object format, no exports)');

	// Test with non-bin file in same package
	const nonBinPath = path.join(fixturesDir, '..', '..', 'cli', 'remote.mjs');
	t.notOk(isBinFile(nonBinPath), 'does not match non-bin file');

	// Test with file that has no package.json above it
	t.notOk(isBinFile('/nonexistent/path/file.js'), 'returns false for nonexistent path');

	// Test with lib file (package has no bin)
	const libPath = path.join(fixturesDir, '..', '..', 'lib', 'index.mjs');
	t.notOk(isBinFile(libPath), 'returns false for package without bin');

	// Test with string bin format (no exports)
	const stringBinPath = path.join(fixturesDir, 'string-bin-package', 'bin.js');
	t.ok(isBinFile(stringBinPath), 'identifies bin-only file (string format)');

	// Test with non-bin file in string bin package
	const nonBinInStringPkg = path.join(fixturesDir, 'string-bin-package', 'other.js');
	t.notOk(isBinFile(nonBinInStringPkg), 'does not match non-bin file in string bin package');

	t.test('bin file also in exports is not bin-only', (st) => {
		const pkgDir = path.join(tmpDir, 'bin-and-exports');
		fs.mkdirSync(pkgDir, { recursive: true });
		fs.writeFileSync(path.join(pkgDir, 'package.json'), JSON.stringify({
			bin: { cmd: 'index.js' },
			exports: { '.': './index.js' },
			name: 'bin-exports-test',
			version: '1.0.0',
		}));
		fs.writeFileSync(path.join(pkgDir, 'index.js'), '');

		st.notOk(isBinFile(path.join(pkgDir, 'index.js')), 'file in both bin and exports is not bin-only');
		st.end();
	});

	t.test('bin file not in exports is bin-only', (st) => {
		const pkgDir = path.join(tmpDir, 'bin-not-exports');
		fs.mkdirSync(pkgDir, { recursive: true });
		fs.writeFileSync(path.join(pkgDir, 'package.json'), JSON.stringify({
			bin: { cmd: 'cli.js' },
			exports: { '.': './lib/index.js' },
			name: 'bin-not-exports-test',
			version: '1.0.0',
		}));
		fs.writeFileSync(path.join(pkgDir, 'cli.js'), '');

		st.ok(isBinFile(path.join(pkgDir, 'cli.js')), 'file in bin but not exports is bin-only');
		st.end();
	});

	t.test('cleanup', (st) => {
		fs.rmSync(tmpDir, { recursive: true });
		st.end();
	});

	t.end();
});

test('isSafeFile - identifies safe files', (t) => {
	// Test file
	t.ok(isSafeFile('/project/foo.test.js'), 'test file is safe');

	// Config file
	t.ok(isSafeFile('/project/eslint.config.js'), 'config file is safe');

	// Bin file
	const binPath = path.join(fixturesDir, '..', '..', 'cli', 'bin.mjs');
	t.ok(isSafeFile(binPath), 'bin file is safe');

	// Regular file
	t.notOk(isSafeFile('/project/src/index.js'), 'regular file is not safe');

	// Private package file is safe
	const privatePath = path.join(fixturesDir, 'sample-project', 'unsafe.js');
	t.ok(isSafeFile(privatePath), 'file in private package is safe');

	// Unpublished file (not in files whitelist) is safe
	const unpublishedPath = path.join(fixturesDir, 'files-package', 'src', 'internal.js');
	t.ok(isSafeFile(unpublishedPath), 'unpublished file is safe');

	t.end();
});

test('isPrivatePackage - identifies private packages', (t) => {
	// Private package
	const privatePath = path.join(fixturesDir, 'sample-project', 'safe.js');
	t.ok(isPrivatePackage(privatePath), 'file in private package returns true');

	// Non-private package
	const publicPath = path.join(fixturesDir, 'string-bin-package', 'bin.js');
	t.notOk(isPrivatePackage(publicPath), 'file in non-private package returns false');

	// Nonexistent path (no package.json found)
	t.notOk(isPrivatePackage('/nonexistent/path/file.js'), 'returns false for nonexistent path');

	// Package with files field (not private)
	const filesPath = path.join(fixturesDir, 'files-package', 'lib', 'index.js');
	t.notOk(isPrivatePackage(filesPath), 'file in non-private files package returns false');

	t.end();
});

test('isUnpublishedFile - detects unpublished files', (t) => {
	// Private package - all files are unpublished
	const privatePath = path.join(fixturesDir, 'sample-project', 'safe.js');
	t.ok(isUnpublishedFile(privatePath), 'file in private package is unpublished');

	// Package with files field - file NOT in whitelist
	const unpublishedPath = path.join(fixturesDir, 'files-package', 'src', 'internal.js');
	t.ok(isUnpublishedFile(unpublishedPath), 'file not in files whitelist is unpublished');

	// Package with files field - file IN whitelist (directory match)
	const publishedPath = path.join(fixturesDir, 'files-package', 'lib', 'index.js');
	t.notOk(isUnpublishedFile(publishedPath), 'file in files whitelist is published');

	// Package with files field - main entry is always published
	const mainPath = path.join(fixturesDir, 'files-package', 'lib', 'index.js');
	t.notOk(isUnpublishedFile(mainPath), 'main entry is published');

	// Package without files field (can\'t determine)
	const noFilesPath = path.join(fixturesDir, 'string-bin-package', 'other.js');
	t.notOk(isUnpublishedFile(noFilesPath), 'returns false when no files field');

	// Nonexistent path (no package.json)
	t.notOk(isUnpublishedFile('/nonexistent/path/file.js'), 'returns false for nonexistent path');

	// Mandatory includes - README is always published
	const readmePath = path.join(fixturesDir, 'files-package', 'README.md');
	t.notOk(isUnpublishedFile(readmePath), 'README is always published');

	t.end();
});

test('isUnpublishedFile - handles various package.json fields', (t) => {
	const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'find-primordials-unpub-'));

	t.test('direct file pattern in files field', (st) => {
		const pkgDir = path.join(tmpDir, 'direct-pattern');
		fs.mkdirSync(pkgDir, { recursive: true });
		fs.writeFileSync(path.join(pkgDir, 'package.json'), JSON.stringify({
			files: ['index.js'],
			name: 'direct-pattern-test',
			version: '1.0.0',
		}));
		fs.writeFileSync(path.join(pkgDir, 'index.js'), '');
		fs.writeFileSync(path.join(pkgDir, 'other.js'), '');

		st.notOk(isUnpublishedFile(path.join(pkgDir, 'index.js')), 'file matching direct pattern is published');
		st.ok(isUnpublishedFile(path.join(pkgDir, 'other.js')), 'file not matching pattern is unpublished');
		st.end();
	});

	t.test('browser field is always published', (st) => {
		const pkgDir = path.join(tmpDir, 'browser-pkg');
		fs.mkdirSync(pkgDir, { recursive: true });
		fs.writeFileSync(path.join(pkgDir, 'package.json'), JSON.stringify({
			browser: 'browser.js',
			files: ['lib'],
			name: 'browser-test',
			version: '1.0.0',
		}));
		fs.writeFileSync(path.join(pkgDir, 'browser.js'), '');

		st.notOk(isUnpublishedFile(path.join(pkgDir, 'browser.js')), 'browser entry is published');
		st.end();
	});

	t.test('types field is always published', (st) => {
		const pkgDir = path.join(tmpDir, 'types-pkg');
		fs.mkdirSync(pkgDir, { recursive: true });
		fs.writeFileSync(path.join(pkgDir, 'package.json'), JSON.stringify({
			files: ['lib'],
			name: 'types-test',
			types: 'index.d.ts',
			version: '1.0.0',
		}));
		fs.writeFileSync(path.join(pkgDir, 'index.d.ts'), '');

		st.notOk(isUnpublishedFile(path.join(pkgDir, 'index.d.ts')), 'types entry is published');
		st.end();
	});

	t.test('typings field is always published', (st) => {
		const pkgDir = path.join(tmpDir, 'typings-pkg');
		fs.mkdirSync(pkgDir, { recursive: true });
		fs.writeFileSync(path.join(pkgDir, 'package.json'), JSON.stringify({
			files: ['lib'],
			name: 'typings-test',
			typings: 'index.d.ts',
			version: '1.0.0',
		}));
		fs.writeFileSync(path.join(pkgDir, 'index.d.ts'), '');

		st.notOk(isUnpublishedFile(path.join(pkgDir, 'index.d.ts')), 'typings entry is published');
		st.end();
	});

	t.test('bin-only entries are not treated as mandatory published', (st) => {
		const pkgDir = path.join(tmpDir, 'bin-str-pkg');
		fs.mkdirSync(pkgDir, { recursive: true });
		fs.writeFileSync(path.join(pkgDir, 'package.json'), JSON.stringify({
			bin: 'cli.js',
			files: ['lib'],
			name: 'bin-str-test',
			version: '1.0.0',
		}));
		fs.writeFileSync(path.join(pkgDir, 'cli.js'), '');

		st.ok(isUnpublishedFile(path.join(pkgDir, 'cli.js')), 'string bin entry not in files is unpublished');
		st.end();
	});

	t.test('bin entry in files whitelist is still published', (st) => {
		const pkgDir = path.join(tmpDir, 'bin-in-files-pkg');
		fs.mkdirSync(pkgDir, { recursive: true });
		fs.writeFileSync(path.join(pkgDir, 'package.json'), JSON.stringify({
			bin: { cmd: 'cli.js' },
			files: ['lib', 'cli.js'],
			name: 'bin-in-files-test',
			version: '1.0.0',
		}));
		fs.writeFileSync(path.join(pkgDir, 'cli.js'), '');

		st.notOk(isUnpublishedFile(path.join(pkgDir, 'cli.js')), 'bin entry in files whitelist is published');
		st.end();
	});

	t.test('exports field paths are always published', (st) => {
		const pkgDir = path.join(tmpDir, 'exports-pkg');
		fs.mkdirSync(pkgDir, { recursive: true });
		fs.writeFileSync(path.join(pkgDir, 'package.json'), JSON.stringify({
			exports: {
				'.': {
					import: './esm.mjs',
					require: './cjs.cjs',
				},
			},
			files: ['lib'],
			name: 'exports-test',
			version: '1.0.0',
		}));
		fs.writeFileSync(path.join(pkgDir, 'esm.mjs'), '');
		fs.writeFileSync(path.join(pkgDir, 'cjs.cjs'), '');

		st.notOk(isUnpublishedFile(path.join(pkgDir, 'esm.mjs')), 'exports import entry is published');
		st.notOk(isUnpublishedFile(path.join(pkgDir, 'cjs.cjs')), 'exports require entry is published');
		st.end();
	});

	t.test('exports with wildcard patterns are not treated as mandatory', (st) => {
		const pkgDir = path.join(tmpDir, 'exports-wild-pkg');
		fs.mkdirSync(pkgDir, { recursive: true });
		fs.writeFileSync(path.join(pkgDir, 'package.json'), JSON.stringify({
			exports: {
				'./*': './src/*.js',
			},
			files: ['lib'],
			name: 'exports-wild-test',
			version: '1.0.0',
		}));
		fs.mkdirSync(path.join(pkgDir, 'src'), { recursive: true });
		fs.writeFileSync(path.join(pkgDir, 'src', 'foo.js'), '');

		st.ok(isUnpublishedFile(path.join(pkgDir, 'src', 'foo.js')), 'wildcard export path is not mandatory');
		st.end();
	});

	t.test('exports field with array syntax', (st) => {
		const pkgDir = path.join(tmpDir, 'exports-arr-pkg');
		fs.mkdirSync(pkgDir, { recursive: true });
		fs.writeFileSync(path.join(pkgDir, 'package.json'), JSON.stringify({
			exports: {
				'.': [
					{ import: './esm.mjs' },
					'./cjs.cjs',
				],
			},
			files: ['lib'],
			name: 'exports-arr-test',
			version: '1.0.0',
		}));
		fs.writeFileSync(path.join(pkgDir, 'esm.mjs'), '');
		fs.writeFileSync(path.join(pkgDir, 'cjs.cjs'), '');

		st.notOk(isUnpublishedFile(path.join(pkgDir, 'esm.mjs')), 'array exports import entry is published');
		st.notOk(isUnpublishedFile(path.join(pkgDir, 'cjs.cjs')), 'array exports fallback entry is published');
		st.end();
	});

	t.test('file matched by directory pattern in files field', (st) => {
		const pkgDir = path.join(tmpDir, 'dir-match-pkg');
		fs.mkdirSync(path.join(pkgDir, 'lib'), { recursive: true });
		fs.writeFileSync(path.join(pkgDir, 'package.json'), JSON.stringify({
			files: ['lib'],
			name: 'dir-match-test',
			version: '1.0.0',
		}));
		fs.writeFileSync(path.join(pkgDir, 'lib', 'helper.js'), '');

		st.notOk(isUnpublishedFile(path.join(pkgDir, 'lib', 'helper.js')), 'file under directory in files is published');
		st.end();
	});

	t.test('mandatory publish patterns for root-level files', (st) => {
		const pkgDir = path.join(tmpDir, 'mandatory-pkg');
		fs.mkdirSync(pkgDir, { recursive: true });
		fs.writeFileSync(path.join(pkgDir, 'package.json'), JSON.stringify({
			files: ['lib'],
			name: 'mandatory-test',
			version: '1.0.0',
		}));
		fs.writeFileSync(path.join(pkgDir, 'LICENSE'), '');
		fs.writeFileSync(path.join(pkgDir, 'CHANGELOG.md'), '');
		fs.writeFileSync(path.join(pkgDir, 'CHANGES'), '');
		fs.writeFileSync(path.join(pkgDir, 'HISTORY.md'), '');

		st.notOk(isUnpublishedFile(path.join(pkgDir, 'LICENSE')), 'LICENSE is always published');
		st.notOk(isUnpublishedFile(path.join(pkgDir, 'CHANGELOG.md')), 'CHANGELOG is always published');
		st.notOk(isUnpublishedFile(path.join(pkgDir, 'CHANGES')), 'CHANGES is always published');
		st.notOk(isUnpublishedFile(path.join(pkgDir, 'HISTORY.md')), 'HISTORY is always published');
		st.end();
	});

	t.test('cleanup', (st) => {
		fs.rmSync(tmpDir, { recursive: true });
		st.end();
	});

	t.end();
});

test('normalizeIgnoreConfig - normalizes config', (t) => {
	// Null config
	t.equal(normalizeIgnoreConfig(null), null, 'returns null for null');
	t.equal(normalizeIgnoreConfig(undefined), null, 'returns null for undefined');

	// Empty config
	const emptyResult = normalizeIgnoreConfig({});
	t.ok(emptyResult.categories instanceof Set, 'categories is a Set');
	t.ok(Array.isArray(emptyResult.files), 'files is an array');
	t.ok(emptyResult.names instanceof Set, 'names is a Set');
	t.ok(Array.isArray(emptyResult.rules), 'rules is an array');
	t.ok(emptyResult.types instanceof Set, 'types is a Set');

	// Full config
	const fullConfig = {
		categories: ['Array', 'Object'],
		files: ['vendor/**'],
		names: ['push', 'pop'],
		rules: [
			{ files: ['src/*.js'], types: ['instanceMethod'] },
			{ categories: ['String'], names: ['slice'] },
		],
		types: ['global', 'spread'],
	};
	const fullResult = normalizeIgnoreConfig(fullConfig);
	t.ok(fullResult.categories.has('Array'), 'has Array category');
	t.ok(fullResult.categories.has('Object'), 'has Object category');
	t.deepEqual(fullResult.files, ['vendor/**'], 'has files');
	t.ok(fullResult.names.has('push'), 'has push name');
	t.ok(fullResult.types.has('global'), 'has global type');
	t.equal(fullResult.rules.length, 2, 'has 2 rules'); // eslint-disable-line no-magic-numbers

	t.end();
});

test('shouldIgnoreFile - checks file ignore', (t) => {
	const config = normalizeIgnoreConfig({
		files: ['vendor/**', 'dist/**'],
	});

	t.ok(shouldIgnoreFile('vendor/lib.js', config), 'ignores vendor file');
	t.ok(shouldIgnoreFile('dist/bundle.js', config), 'ignores dist file');
	t.notOk(shouldIgnoreFile('src/index.js', config), 'does not ignore src file');

	// Null config
	t.notOk(shouldIgnoreFile('vendor/lib.js', null), 'returns false for null config');

	// Empty files array
	const emptyConfig = normalizeIgnoreConfig({ files: [] });
	t.notOk(shouldIgnoreFile('vendor/lib.js', emptyConfig), 'returns false for empty files');

	t.end();
});

test('shouldIgnoreFinding - checks finding ignore', (t) => {
	const baseFinding = {
		category: 'Array',
		file: 'src/index.js',
		name: 'push',
		type: 'instanceMethod',
	};

	// Null config
	t.notOk(shouldIgnoreFinding(baseFinding, null), 'returns false for null config');

	// Type filter
	const typeConfig = normalizeIgnoreConfig({ types: ['instanceMethod'] });
	t.ok(shouldIgnoreFinding(baseFinding, typeConfig), 'ignores by type');

	// Category filter
	const categoryConfig = normalizeIgnoreConfig({ categories: ['Array'] });
	t.ok(shouldIgnoreFinding(baseFinding, categoryConfig), 'ignores by category');

	// Name filter
	const nameConfig = normalizeIgnoreConfig({ names: ['push'] });
	t.ok(shouldIgnoreFinding(baseFinding, nameConfig), 'ignores by name');

	// Rule with file pattern
	const ruleConfig = normalizeIgnoreConfig({
		rules: [{ files: ['src/*.js'], types: ['instanceMethod'] }],
	});
	t.ok(shouldIgnoreFinding(baseFinding, ruleConfig), 'ignores by rule with file pattern');

	// Rule with file pattern - category match
	const ruleCategoryConfig = normalizeIgnoreConfig({
		rules: [{ categories: ['Array'], files: ['src/*.js'] }],
	});
	t.ok(shouldIgnoreFinding(baseFinding, ruleCategoryConfig), 'ignores by rule category');

	// Rule with file pattern - name match
	const ruleNameConfig = normalizeIgnoreConfig({
		rules: [{ files: ['src/*.js'], names: ['push'] }],
	});
	t.ok(shouldIgnoreFinding(baseFinding, ruleNameConfig), 'ignores by rule name');

	// Non-matching rule
	const nonMatchingConfig = normalizeIgnoreConfig({
		rules: [{ files: ['other/*.js'], types: ['instanceMethod'] }],
	});
	t.notOk(shouldIgnoreFinding(baseFinding, nonMatchingConfig), 'does not ignore non-matching rule');

	t.end();
});

test('filterFindings - filters findings', (t) => {
	const findings = [
		{
			category: 'Array', file: 'src/a.js', name: 'push', type: 'instanceMethod',
		},
		{
			category: 'Array', file: 'src/b.js', name: 'map', type: 'instanceMethod',
		},
		{
			category: 'Object', file: 'src/c.js', name: 'keys', type: 'staticMethod',
		},
	];

	// Null config - returns all
	t.equal(filterFindings(findings, null).length, 3, 'returns all for null config'); // eslint-disable-line no-magic-numbers

	// Filter by name
	const nameConfig = normalizeIgnoreConfig({ names: ['push'] });
	const filtered = filterFindings(findings, nameConfig);
	t.equal(filtered.length, 2, 'filters out push'); // eslint-disable-line no-magic-numbers
	function hasPush(f) {
		return f.name === 'push';
	}
	t.notOk(filtered.find(hasPush), 'push is filtered');

	t.end();
});

test('getValidTypes - returns valid types', (t) => {
	const types = getValidTypes();
	t.ok(Array.isArray(types), 'returns an array');
	t.ok(types.includes('global'), 'includes global');
	t.ok(types.includes('instanceMethod'), 'includes instanceMethod');
	t.ok(types.includes('staticMethod'), 'includes staticMethod');
	t.ok(types.includes('spread'), 'includes spread');
	t.ok(types.includes('prototypeAccess'), 'includes prototypeAccess');
	t.ok(types.includes('staticProperty'), 'includes staticProperty');
	t.end();
});

test('worker - analyzes files via worker thread', async (t) => {
	const workerPath = path.join(fixturesDir, '..', '..', 'lib', 'worker.mjs');
	const testFilePath = path.join(fixturesDir, 'sample-project', 'unsafe.js');

	const worker = new Worker(workerPath);

	const result = await new Promise((resolve, reject) => {
		worker.on('message', (msg) => {
			resolve(msg);
		});
		worker.on('error', reject);
		worker.postMessage({ filePath: testFilePath, options: {} });
	});

	t.equal(result.filePath, testFilePath, 'returns correct filePath');
	t.ok(result.result, 'has result');
	t.ok(Array.isArray(result.result.findings), 'result has findings array');
	t.ok(result.result.findings.length > 0, 'has findings'); // eslint-disable-line no-magic-numbers

	await worker.terminate();
	t.end();
});

test('worker - handles errors', async (t) => {
	const workerPath = path.join(fixturesDir, '..', '..', 'lib', 'worker.mjs');

	const worker = new Worker(workerPath);

	const result = await new Promise((resolve, reject) => {
		worker.on('message', (msg) => {
			resolve(msg);
		});
		worker.on('error', reject);
		worker.postMessage({ filePath: '/nonexistent/file.js', options: {} });
	});

	t.equal(result.filePath, '/nonexistent/file.js', 'returns correct filePath');
	t.ok(result.result, 'has result');
	t.ok(result.result.error, 'has error message');
	t.ok(Array.isArray(result.result.findings), 'has empty findings array');
	t.equal(result.result.findings.length, 0, 'findings is empty'); // eslint-disable-line no-magic-numbers

	await worker.terminate();
	t.end();
});

test('analyzeFilesParallel - analyzes files in parallel', async (t) => {
	const files = [
		path.join(fixturesDir, 'sample-project', 'safe.js'),
		path.join(fixturesDir, 'sample-project', 'unsafe.js'),
	];
	const result = await analyzeFilesParallel(files, { concurrency: 1 });

	t.ok(Array.isArray(result.findings), 'findings is an array');
	t.ok(Array.isArray(result.errors), 'errors is an array');
	t.end();
});

test('analyzeFile - detects spread syntax inside functions', (t) => {
	const spreadPath = path.join(fixturesDir, 'sample-project', 'with-spread.js');
	const result = analyzeFile(spreadPath, { includeSpread: true });

	const spreadFindings = result.findings.filter((f) => f.type === 'spread');
	t.ok(spreadFindings.length > 0, 'detects spread syntax');
	t.equal(spreadFindings[0].category, 'syntax', 'category is syntax');
	t.end();
});

test('analyzeFile - module level instance methods are safe', (t) => {
	const safePath = path.join(fixturesDir, 'sample-project', 'safe.js');
	const result = analyzeFile(safePath, {});

	// safe.js has module-level caching which should be allowed
	t.ok(Array.isArray(result.findings), 'findings is an array');
	t.equal(result.findings.length, 0, 'no findings for safe module patterns'); // eslint-disable-line no-magic-numbers
	t.end();
});

test('applyPushFixes', (t) => {
	const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'fix-test-'));

	t.test('fixes single-argument push', (st) => {
		const testFile = path.join(tmpDir, 'fix-push.js');
		const code = 'function fn() { var arr = []; arr.push(1); }';
		fs.writeFileSync(testFile, code);
		const { findings } = analyzeFile(testFile, {});
		const result = applyPushFixes(testFile, findings);
		st.ok(result.fixed, 'code was fixed');
		st.ok(result.output.includes('arr[arr.length] = 1'), 'push converted to assignment');
		st.end();
	});

	t.test('returns unchanged for no push findings', (st) => {
		const testFile = path.join(tmpDir, 'no-push.js');
		const code = 'function fn() { var arr = []; arr.pop(); }';
		fs.writeFileSync(testFile, code);
		const result = applyPushFixes(testFile, []);
		st.notOk(result.fixed, 'code was not fixed');
		st.equal(result.output, code, 'output is unchanged');
		st.end();
	});

	t.test('skips unfixable push cases', (st) => {
		// Return value used
		const testFile1 = path.join(tmpDir, 'push-return.js');
		fs.writeFileSync(testFile1, 'function fn() { var arr = []; var len = arr.push(1); }');
		const r1 = applyPushFixes(testFile1, analyzeFile(testFile1, {}).findings);
		st.notOk(r1.fixed, 'return value used: not fixed');

		// Multiple arguments
		const testFile2 = path.join(tmpDir, 'push-multi.js');
		fs.writeFileSync(testFile2, 'function fn() { var arr = []; arr.push(1, 2); }');
		const r2 = applyPushFixes(testFile2, analyzeFile(testFile2, {}).findings);
		st.notOk(r2.fixed, 'multiple args: not fixed');

		// Spread argument
		const testFile3 = path.join(tmpDir, 'push-spread.js');
		fs.writeFileSync(testFile3, 'function fn() { var arr = []; var items = [1]; arr.push(...items); }');
		const r3 = applyPushFixes(testFile3, analyzeFile(testFile3, {}).findings);
		st.notOk(r3.fixed, 'spread arg: not fixed');

		st.end();
	});

	t.test('handles parse errors gracefully', (st) => {
		const testFile = path.join(tmpDir, 'bad-syntax.js');
		const code = 'function fn( { broken';
		fs.writeFileSync(testFile, code);
		const findings = [
			{
				certainty: 'certain',
				column: 1,
				file: testFile,
				line: 1,
				name: 'push',
				type: 'instanceMethod',
			},
		];
		const result = applyPushFixes(testFile, findings);
		st.notOk(result.fixed, 'code was not fixed');
		st.equal(result.output, code, 'output is unchanged');
		st.end();
	});

	t.test('cleanup', (st) => {
		fs.rmSync(tmpDir, { recursive: true });
		st.end();
	});

	t.end();
});

test('applyUndefinedFixes', (t) => {
	const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'primordials-undefined-test-'));

	t.test('fixes undefined to void undefined', (st) => {
		const testFile = path.join(tmpDir, 'undefined-test.js');
		const code = 'function fn() { return undefined; }';
		fs.writeFileSync(testFile, code);

		const { findings } = analyzeFile(testFile, { includeGlobals: true });
		const result = applyUndefinedFixes(testFile, findings);
		st.ok(result.fixed, 'code was fixed');
		st.equal(result.fixCount, 1, 'one fix applied'); // eslint-disable-line no-magic-numbers
		st.ok(result.output.includes('void undefined'), 'undefined converted to void undefined');
		st.end();
	});

	t.test('returns unchanged when no undefined findings', (st) => {
		const testFile = path.join(tmpDir, 'no-undefined.js');
		const code = 'function fn() { return 42; }';
		fs.writeFileSync(testFile, code);

		const result = applyUndefinedFixes(testFile, []);
		st.notOk(result.fixed, 'code was not fixed');
		st.equal(result.output, code, 'output is unchanged');
		st.end();
	});

	t.test('handles multiple undefined occurrences', (st) => {
		const testFile = path.join(tmpDir, 'multi-undefined.js');
		const code = 'function fn(x) { if (x === undefined) { return undefined; } }';
		fs.writeFileSync(testFile, code);

		const { findings } = analyzeFile(testFile, { includeGlobals: true });
		const result = applyUndefinedFixes(testFile, findings);
		st.ok(result.fixed, 'code was fixed');
		st.equal(result.fixCount, 2, 'two fixes applied'); // eslint-disable-line no-magic-numbers
		st.ok(result.output.includes('x === void undefined'), 'first undefined fixed');
		st.ok(result.output.includes('return void undefined'), 'second undefined fixed');
		st.end();
	});

	t.test('skips undefined inside void expressions', (st) => {
		const testFile = path.join(tmpDir, 'void-undefined.js');
		const code = 'function fn() { return void undefined; }';
		fs.writeFileSync(testFile, code);

		// void undefined should not be reported as a finding
		const { findings } = analyzeFile(testFile, { includeGlobals: true });
		const result = applyUndefinedFixes(testFile, findings);
		st.notOk(result.fixed, 'code was not fixed');
		st.equal(result.output, code, 'output is unchanged');
		st.end();
	});

	t.test('handles parse errors gracefully', (st) => {
		const testFile = path.join(tmpDir, 'parse-error.js');
		const code = 'function fn( { syntax error';
		fs.writeFileSync(testFile, code);

		const findings = [
			{
				column: 1,
				file: testFile,
				line: 1,
				name: 'undefined',
				type: 'global',
			},
		];
		const result = applyUndefinedFixes(testFile, findings);
		st.notOk(result.fixed, 'code was not fixed');
		st.equal(result.output, code, 'output is unchanged');
		st.end();
	});

	t.test('cleanup', (st) => {
		fs.rmSync(tmpDir, { recursive: true });
		st.end();
	});

	t.end();
});

test('applyFixes', (t) => {
	const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'primordials-fixes-test-'));

	/** `.at()` on anything but an array literal needs type information to be certain */
	function asCertain(findings) {
		return findings.map((f) => ({ ...f, certainty: 'certain' }));
	}

	function fixture(name, code, options) {
		const testFile = path.join(tmpDir, name);
		fs.writeFileSync(testFile, code);
		return { findings: analyzeFile(testFile, options || {}).findings, testFile };
	}

	t.test('rewrites .at() with a non-negative literal index', (st) => {
		const { findings, testFile } = fixture('at-index.js', 'function fn() { return [1, 2, 3].at(0); }');
		const result = applyFixes(testFile, findings);
		st.ok(result.fixed, 'code was fixed');
		st.equal(result.fixCounts.at, 1, 'one at fix applied'); // eslint-disable-line no-magic-numbers
		st.ok(result.output.includes('[1, 2, 3][0]'), 'at(0) became an index access');
		st.end();
	});

	t.test('rewrites .at() with a negative index by counting back from the end', (st) => {
		const { findings, testFile } = fixture('at-negative.js', 'function fn(arr) { return arr.at(-1); }');
		const result = applyFixes(testFile, asCertain(findings));
		st.ok(result.fixed, 'code was fixed');
		st.ok(result.output.includes('arr[arr.length - 1]'), 'at(-1) counts back from the end');
		st.end();
	});

	t.test('leaves .at() alone when repeating the object could be observed', (st) => {
		const { findings, testFile } = fixture('at-side-effect.js', 'function fn(get) { return get().at(-1); }');
		const result = applyFixes(testFile, asCertain(findings));
		st.notOk(result.fixed, 'a call is not repeated');
		st.end();
	});

	t.test('leaves .at() alone when the index is not an integer', (st) => {
		const { findings, testFile } = fixture('at-fractional.js', 'function fn() { return [1, 2, 3].at(1.5); }');
		const result = applyFixes(testFile, findings);
		st.notOk(result.fixed, 'at() truncates, so a fractional index has no index form');
		st.end();
	});

	t.test('leaves .at() alone when the index is not a literal', (st) => {
		const { findings, testFile } = fixture('at-dynamic.js', 'function fn(i) { return [1, 2, 3].at(i); }');
		const result = applyFixes(testFile, findings);
		st.notOk(result.fixed, 'a computed index has no literal form');
		st.end();
	});

	t.test('rewrites argument-less Array and Object construction', (st) => {
		const code = 'function fn() { var a = new Array(); var b = Array(1, 2); var c = new Object(); return [a, b, c]; }';
		const { findings, testFile } = fixture('constructors.js', code, { includeGlobals: true });
		const result = applyFixes(testFile, findings);
		st.equal(result.fixCounts.constructor, 3, 'three constructions fixed'); // eslint-disable-line no-magic-numbers
		st.ok(result.output.includes('var a = []'), 'new Array() became []');
		st.ok(result.output.includes('var b = [1, 2]'), 'Array(1, 2) became a literal');
		st.ok(result.output.includes('var c = {}'), 'new Object() became {}');
		st.end();
	});

	t.test('leaves single-argument Array construction alone', (st) => {
		const { findings, testFile } = fixture('array-length.js', 'function fn() { return new Array(5); }', { includeGlobals: true });
		const result = applyFixes(testFile, findings);
		st.notOk(result.fixed, 'Array(5) sets the length, so [5] is not equivalent');
		st.end();
	});

	t.test('leaves Object construction with an argument alone', (st) => {
		const { findings, testFile } = fixture('object-coerce.js', 'function fn(x) { return new Object(x); }', { includeGlobals: true });
		const result = applyFixes(testFile, findings);
		st.notOk(result.fixed, 'Object(x) coerces, so {} is not equivalent');
		st.end();
	});

	t.test('rewrites Number.isNaN to a self-comparison', (st) => {
		const { findings, testFile } = fixture('isnan.js', 'function fn(x) { return !Number.isNaN(x); }', { includeStatic: true });
		const result = applyFixes(testFile, findings);
		st.ok(result.fixed, 'code was fixed');
		st.equal(result.fixCounts.isNaN, 1, 'one isNaN fix applied'); // eslint-disable-line no-magic-numbers
		st.ok(result.output.includes('!(x !== x)'), 'parens keep the comparison intact under !');
		st.end();
	});

	t.test('leaves Number.isNaN alone when the argument could be observed twice', (st) => {
		const { findings, testFile } = fixture('isnan-call.js', 'function fn(get) { return Number.isNaN(get()); }', { includeStatic: true });
		const result = applyFixes(testFile, findings);
		st.notOk(result.fixed, 'a call is not repeated');
		st.end();
	});

	t.test('applies fixes of different kinds on the same line', (st) => {
		const code = 'function fn() { var arr = []; arr.push(1); return undefined; }';
		const { findings, testFile } = fixture('same-line.js', code, { includeGlobals: true });
		const result = applyFixes(testFile, findings);
		st.equal(result.fixCounts.push, 1, 'the push was fixed'); // eslint-disable-line no-magic-numbers
		st.equal(result.fixCounts.undefined, 1, 'the undefined was fixed too'); // eslint-disable-line no-magic-numbers
		st.ok(result.output.includes('arr[arr.length] = 1'), 'push became an assignment');
		st.ok(result.output.includes('return void undefined'), 'undefined became void undefined');
		st.end();
	});

	t.test('returns unchanged when there are no findings', (st) => {
		const code = 'function fn() { return 42; }';
		const { testFile } = fixture('no-findings.js', code);
		const result = applyFixes(testFile, []);
		st.notOk(result.fixed, 'code was not fixed');
		st.equal(result.output, code, 'output is unchanged');
		st.end();
	});

	t.test('rewrites through a property read, taking the getter at its word', (st) => {
		const { findings, testFile } = fixture('isnan-member.js', 'function fn(a) { return Number.isNaN(a.b); }', { includeStatic: true });
		const result = applyFixes(testFile, findings);
		st.ok(result.fixed, 'code was fixed');
		st.ok(result.output.includes('(a.b !== a.b)'), 'a property path names the same value twice');
		st.end();
	});

	t.test('rewrites push onto a property read', (st) => {
		const { findings, testFile } = fixture('push-member.js', 'function fn(run, x) { run.asserts.push(x); }');
		const result = applyFixes(testFile, findings);
		st.ok(result.fixed, 'code was fixed');
		st.ok(result.output.includes('run.asserts[run.asserts.length] = x'), 'a property path reaches the same array twice');
		st.end();
	});

	t.test('leaves a static method reached through .call() alone', (st) => {
		const { findings, testFile } = fixture('isnan-call.js', 'function fn(x) { return Number.isNaN.call(x); }', { includeStatic: true });
		const result = applyFixes(testFile, findings);
		st.notOk(result.fixed, 'Number.isNaN.call(x) does not pass x to isNaN');
		st.end();
	});

	t.test('leaves Array construction with a spread alone', (st) => {
		const { findings, testFile } = fixture('array-spread.js', 'function fn(xs) { return Array(...xs, 3); }', { includeGlobals: true });
		const result = applyFixes(testFile, findings);
		st.notOk(result.fixed, 'a spread can stand for any number of arguments, including one');
		st.end();
	});

	t.test('parenthesizes an object literal where a statement could begin', (st) => {
		const { findings, testFile } = fixture('object-arrow.js', 'var make = () => Object();\n', { includeGlobals: true });
		const result = applyFixes(testFile, findings);
		st.ok(result.fixed, 'code was fixed');
		st.ok(result.output.includes('=> ({})'), 'a bare {} would be an empty block, returning undefined');
		st.end();
	});

	t.test('parenthesizes an object literal at the start of a statement', (st) => {
		const { findings, testFile } = fixture('object-statement.js', 'function fn() { Object(); }', { includeGlobals: true });
		const result = applyFixes(testFile, findings);
		st.ok(result.fixed, 'code was fixed');
		st.ok(result.output.includes('({});'), 'a bare {} would be an empty block');
		st.end();
	});

	t.test('prefers the wider of two fixes starting at the same place, and never writes what will not parse', (st) => {
		/*
		 * Pathological, but it is the one shape where two fixes start together: the push
		 * rewrite and the `undefined` it is called on. The wider push fix wins, and the
		 * pass that would then rewrite `undefined` produces `void undefined[...] = x`,
		 * which is not valid, so it is refused rather than written.
		 */
		const { findings, testFile } = fixture('same-start.js', 'function fn(x) { undefined.push(x); }', { includeGlobals: true });
		const first = applyFixes(testFile, findings);
		st.equal(first.fixCounts.push, 1, 'the wider push fix is the one applied'); // eslint-disable-line no-magic-numbers
		st.equal(first.fixCounts.undefined, 0, 'the undefined it starts on is left for the next pass');
		st.ok(first.output.includes('undefined[undefined.length] = x'), 'the push became an assignment');

		fs.writeFileSync(testFile, first.output);
		const next = analyzeFile(testFile, { includeGlobals: true }).findings;
		const second = applyFixes(testFile, next);
		st.notOk(second.fixed, 'the rewrite that would not parse is refused');
		st.equal(second.output, first.output, 'the file is left as it was');
		st.end();
	});

	t.test('rewrites push whose argument only reads', (st) => {
		// eslint-disable-next-line no-template-curly-in-string -- the template is the code under test, not this string
		const arg = '{ a: row.a, b: typeof row.b === \'string\' ? row.b : null, c: \'c\' in row, d: !!row.d, e: xs[i], f: `${row.a}`, g: [row.a, 1], h: row.a || 1, i: (row.a, row.b) }';
		const { findings, testFile } = fixture('push-readonly-arg.js', `function fn(arr, row, xs, i) { arr.push(${arg}); }`);
		const result = applyFixes(testFile, findings);
		st.ok(result.fixed, 'code was fixed');
		st.ok(result.output.includes('arr[arr.length] ='), 'nothing in the argument can reach the array');
		st.end();
	});

	t.test('leaves push alone when its argument does more than read', (st) => {
		const cases = [
			['spread', '{ ...row }'],
			['accessor', '{ get x() { return 1; } }'],
			['computed key', '{ [f()]: 1 }'],
			['delete', 'delete row.a'],
			['assignment', '(row.a = 1)'],
			['spread element', '[...row]'],
		];
		for (const [name, arg] of cases) {
			const { findings, testFile } = fixture(`push-effect-${name.replace(/ /g, '-')}.js`, `function fn(arr, row, f) { arr.push(${arg}); }`);
			st.notOk(applyFixes(testFile, findings).fixed, `${name}: not rewritten`);
		}
		st.end();
	});

	t.test('leaves push alone when the object would be evaluated twice', (st) => {
		const { findings, testFile } = fixture('push-call-object.js', 'function fn(get, x) { get().push(x); }');
		const result = applyFixes(testFile, findings);
		st.notOk(result.fixed, 'the assignment would call get() twice');
		st.end();
	});

	t.test('leaves push alone when the argument would run before the length is read', (st) => {
		// push evaluates its argument first; the assignment reads the length first
		const { findings, testFile } = fixture('push-call-arg.js', 'function fn(arr, f) { arr.push(f()); }');
		const result = applyFixes(testFile, findings);
		st.notOk(result.fixed, 'f() could change the length the assignment already read');
		st.end();
	});

	t.test('parenthesizes void undefined where it would not parse', (st) => {
		const { findings, testFile } = fixture('undefined-exponent.js', 'function fn() { return undefined ** 2; }', { includeGlobals: true });
		const result = applyFixes(testFile, findings);
		st.ok(result.fixed, 'code was fixed');
		st.ok(result.output.includes('(void undefined) ** 2'), 'void undefined ** 2 is a syntax error');
		st.end();
	});

	t.test('leaves the { undefined } shorthand alone', (st) => {
		const { findings, testFile } = fixture('undefined-shorthand.js', 'function fn() { return { undefined }; }', { includeGlobals: true });
		const result = applyFixes(testFile, findings);
		st.notOk(result.fixed, 'rewriting the shorthand value would not parse');
		st.end();
	});

	t.test('leaves an uncertain finding alone', (st) => {
		const { findings, testFile } = fixture('at-uncertain.js', 'function fn(arr) { return arr.at(0); }');
		st.equal(findings[0].certainty, 'uncertain', 'the finding is uncertain without type information');
		const result = applyFixes(testFile, findings);
		st.notOk(result.fixed, 'an uncertain finding is not rewritten');
		st.end();
	});

	t.test('leaves a method that is not called alone', (st) => {
		// the array literal is what makes this a reported finding at all: `arr.push` alone is just a read
		const { findings, testFile } = fixture('push-uncalled.js', 'function fn() { var f = [1, 2].push; return f; }');
		st.equal(findings.length, 1, 'the read is reported'); // eslint-disable-line no-magic-numbers
		const result = applyFixes(testFile, findings);
		st.notOk(result.fixed, 'a method reference has no call to rewrite');
		st.end();
	});

	t.test('leaves .at() with no argument alone', (st) => {
		const { findings, testFile } = fixture('at-noargs.js', 'function fn() { return [1, 2, 3].at(); }');
		const result = applyFixes(testFile, findings);
		st.notOk(result.fixed, 'there is no index to rewrite to');
		st.end();
	});

	t.test('leaves a method with no fix alone', (st) => {
		const { findings, testFile } = fixture('map.js', 'function fn(cb) { return [1, 2].map(cb); }');
		const result = applyFixes(testFile, findings);
		st.notOk(result.fixed, 'map has no primordial-free rewrite');
		st.end();
	});

	t.test('leaves a static method with no fix alone', (st) => {
		const { findings, testFile } = fixture('object-keys.js', 'function fn(o) { return Object.keys(o); }', { includeStatic: true });
		const result = applyFixes(testFile, findings);
		st.notOk(result.fixed, 'Object.keys has no primordial-free rewrite');
		st.end();
	});

	t.test('leaves Number.isNaN alone when it is not called', (st) => {
		const { findings, testFile } = fixture('isnan-ref.js', 'function fn() { var f = Number.isNaN; return f; }', { includeStatic: true });
		const result = applyFixes(testFile, findings);
		st.notOk(result.fixed, 'a reference has no call to rewrite');
		st.end();
	});

	t.test('leaves a global that is not constructed alone', (st) => {
		const { findings, testFile } = fixture('array-ref.js', 'function fn() { return Array; }', { includeGlobals: true });
		const result = applyFixes(testFile, findings);
		st.notOk(result.fixed, 'a bare global reference has no literal form');
		st.end();
	});

	t.test('applies the outer of two overlapping fixes and leaves the inner for the next pass', (st) => {
		// the `undefined`s sit inside the construction that the other fix rewrites
		const { findings, testFile } = fixture('overlap.js', 'function fn() { return new Array(undefined, undefined); }', { includeGlobals: true });
		const result = applyFixes(testFile, findings);
		st.equal(result.fixCounts.constructor, 1, 'the outer construction is rewritten'); // eslint-disable-line no-magic-numbers
		st.equal(result.fixCounts.undefined, 0, 'the undefineds it contains are not rewritten in the same pass');
		st.ok(result.output.includes('[undefined, undefined]'), 'the construction became a literal');

		// a second pass reaches what the first one had to drop
		const second = applyFixes(testFile, findings);
		st.equal(second.fixCounts.constructor, 1, 'the second pass still sees the original file on disk'); // eslint-disable-line no-magic-numbers
		st.end();
	});

	t.test('cleanup', (st) => {
		fs.rmSync(tmpDir, { recursive: true });
		st.end();
	});

	t.end();
});

test('analyzeFile - respects ESLint disable directives', (t) => {
	const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'find-primordials-eslint-'));

	t.test('eslint-disable-next-line disables findings on next line', (st) => {
		const testFile = path.join(tmpDir, 'disable-next.js');
		const code = `// eslint-disable-next-line find-primordials/no-globals
function fn() { return undefined; }`;
		fs.writeFileSync(testFile, code);
		const result = analyzeFile(testFile, { includeGlobals: true });
		st.deepEqual(result.findings, [], 'no findings when disabled');
		st.end();
	});

	t.test('eslint-disable-line disables findings on same line', (st) => {
		const testFile = path.join(tmpDir, 'disable-line.js');
		const code = 'function fn() { return undefined; } // eslint-disable-line find-primordials/no-globals';
		fs.writeFileSync(testFile, code);
		const result = analyzeFile(testFile, { includeGlobals: true });
		st.deepEqual(result.findings, [], 'no findings when disabled');
		st.end();
	});

	t.test('eslint-disable block disables findings in range', (st) => {
		const testFile = path.join(tmpDir, 'disable-block.js');
		const code = `/* eslint-disable find-primordials/no-globals */
function fn() { return undefined; }
/* eslint-enable find-primordials/no-globals */
function other() { return undefined; }`;
		fs.writeFileSync(testFile, code);
		const result = analyzeFile(testFile, { includeGlobals: true });
		st.equal(result.findings.length, 1, 'only one finding after enable');
		st.equal(result.findings[0].line, 4, 'finding is on line after enable'); // eslint-disable-line no-magic-numbers
		st.end();
	});

	t.test('eslint-disable without rule name disables all rules', (st) => {
		const testFile = path.join(tmpDir, 'disable-all.js');
		const code = `// eslint-disable-next-line
function fn() { return undefined; }
function other() { return undefined; }`;
		fs.writeFileSync(testFile, code);
		const result = analyzeFile(testFile, { includeGlobals: true });
		st.equal(result.findings.length, 1, 'only one finding');
		st.equal(result.findings[0].line, 3, 'finding is on non-disabled line'); // eslint-disable-line no-magic-numbers
		st.end();
	});

	t.test('findings are reported without disable comments', (st) => {
		const testFile = path.join(tmpDir, 'no-disable.js');
		const code = 'function fn() { return undefined; }';
		fs.writeFileSync(testFile, code);
		const result = analyzeFile(testFile, { includeGlobals: true });
		st.equal(result.findings.length, 1, 'finding is reported');
		st.equal(result.findings[0].name, 'undefined', 'found undefined');
		st.end();
	});

	t.test('eslint-disable block without rule disables all until enable', (st) => {
		const testFile = path.join(tmpDir, 'disable-all-block.js');
		const code = `/* eslint-disable */
function fn() { return undefined; }
/* eslint-enable */
function other() { return undefined; }`;
		fs.writeFileSync(testFile, code);
		const result = analyzeFile(testFile, { includeGlobals: true });
		st.equal(result.findings.length, 1, 'only one finding after enable');
		st.equal(result.findings[0].line, 4, 'finding is on line after enable'); // eslint-disable-line no-magic-numbers
		st.end();
	});

	t.test('eslint-disable without enable disables to end of file', (st) => {
		const testFile = path.join(tmpDir, 'disable-no-enable.js');
		const code = `/* eslint-disable */
function fn() { return undefined; }
function other() { return undefined; }`;
		fs.writeFileSync(testFile, code);
		const result = analyzeFile(testFile, { includeGlobals: true });
		st.equal(result.findings.length, 0, 'no findings when disabled to EOF'); // eslint-disable-line no-magic-numbers
		st.end();
	});

	t.test('cleanup', (st) => {
		fs.rmSync(tmpDir, { recursive: true });
		st.end();
	});

	t.end();
});

test('ignore - resolveMinimatch interop', async (t) => {
	const { resolveMinimatch } = await import(path.join(__dirname, '..', 'lib', 'ignore.mjs'));

	function named() {
		return true;
	}
	function fallback() {
		return true;
	}
	function bare() {
		return true;
	}

	t.equal(resolveMinimatch({ minimatch: named }), named, 'prefers the v10+ named export');
	t.equal(resolveMinimatch({ default: fallback }), fallback, 'falls back to a CJS default export');
	t.equal(resolveMinimatch(bare), bare, 'falls back to the module itself when it is the callable');
	t.end();
});
