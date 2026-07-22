import fs from 'fs';
import os from 'os';
import path from 'path';
import test from 'tape';
import { fileURLToPath } from 'url';
import { Worker } from 'worker_threads';

import {
	analyzeFile,
	analyzeFiles,
	analyzeFilesParallel,
	canRewriteUndefined,
	describeType,
	formatAsTAP,
	formatFindingAsTAP,
	isReevaluable,
	isRepeatable,
} from 'find-primordials';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const fixturesDir = path.join(__dirname, 'fixtures');
const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'analyzer-cov-'));

/**
 * Await a promise and report whether it rejected.
 * @param {Promise} promise - The promise to settle
 * @returns {Promise<boolean>}
 */
async function rejected(promise) {
	try {
		await promise;
		return false;
	} catch {
		return true;
	}
}
let counter = 0;

/**
 * Write source to a fresh temp file and analyze it.
 * @param {string} code - The source
 * @param {object} [options] - analyzeFile options
 * @param {string} [ext] - The file extension to use
 * @returns {Array} the findings
 */
function analyze(code, options, ext) {
	counter += 1;
	const file = path.join(tmpRoot, `f${counter}${ext || '.js'}`);
	fs.writeFileSync(file, code);
	return analyzeFile(file, options || {}).findings;
}

/** Whether any finding names the given global. */
function hasGlobal(findings, name) {
	return findings.some((f) => f.type === 'global' && f.name === name);
}

test('analyzeFile - early returns', (t) => {
	t.equal(analyze('var x = Array;', { includeGlobals: true, isSafe: true }).length, 0, 'safe files yield nothing'); // eslint-disable-line no-magic-numbers

	// a declaration file has no runtime code
	counter += 1;
	const dts = path.join(tmpRoot, `d${counter}.d.ts`);
	fs.writeFileSync(dts, 'export const x: number[];');
	t.equal(analyzeFile(dts, { includeGlobals: true }).findings.length, 0, 'declaration files yield nothing'); // eslint-disable-line no-magic-numbers

	t.ok(analyzeFile(path.join(tmpRoot, 'does-not-exist.js'), {}).error, 'unreadable file reports an error');
	t.ok(analyzeFile(path.join(tmpRoot, 'nope.d.mts'), { includeGlobals: true }).findings.length === 0, 'missing .d.mts yields nothing'); // eslint-disable-line no-magic-numbers

	fs.writeFileSync(path.join(tmpRoot, 'broken.js'), 'function ( {');
	t.ok(analyzeFile(path.join(tmpRoot, 'broken.js'), {}).error, 'a parse error is reported');

	t.end();
});

test('analyzeFile - global shadowing suppresses findings', (t) => {
	const opts = { includeGlobals: true };
	const cases = [
		['plain param', 'function fn(Array) { return Array; }'],
		['object-pattern param', 'function fn({ Array }) { return Array; }'],
		['array-pattern param', 'function fn([Array]) { return Array; }'],
		['object rest param', 'function fn({ ...Array }) { return Array; }'],
		['array rest param', 'function fn([...Array]) { return Array; }'],
		['default param', 'function fn(Array = 1) { return Array; }'],
		['rest param', 'function fn(...Array) { return Array; }'],
		['nested pattern', 'function fn({ a: [Array] }) { return Array; }'],
		['block var', 'function fn() { var Array = 1; return Array; }'],
		['block function', 'function fn() { function Array() {} return Array; }'],
		['block class', 'function fn() { class Array {} return Array; }'],
		['catch param', 'function fn() { try { fn(); } catch (Array) { return Array; } }'],
		['for-in var', 'function fn(o) { for (var Array in o) { return Array; } }'],
		['for-of var', 'function fn(o) { for (var Array of o) { return Array; } }'],
		['for var', 'function fn() { for (var Array = 0; Array < 1;) { return Array; } }'],
	];
	for (const [name, code] of cases) {
		t.notOk(hasGlobal(analyze(code, opts), 'Array'), `${name}: Array is shadowed, not reported`);
	}

	// an import binding shadows the global for the whole module
	t.notOk(hasGlobal(analyze('import { Array } from "x"; function fn() { return Array; }', opts, '.mjs'), 'Array'), 'import binding shadows');

	// a genuinely-unshadowed global is still reported, so the checks above mean something
	t.ok(hasGlobal(analyze('function fn() { return Array; }', opts), 'Array'), 'an unshadowed global is reported');

	t.end();
});

test('analyzeFile - safe global usage', (t) => {
	const opts = { includeGlobals: true };
	t.notOk(hasGlobal(analyze('function fn() { return void undefined; }', opts), 'undefined'), 'void undefined is safe');
	t.notOk(hasGlobal(analyze('function fn() { return NaN + Infinity; }', opts), 'NaN'), 'NaN is safe');
	t.notOk(hasGlobal(analyze('function fn() { return NaN + Infinity; }', opts), 'Infinity'), 'Infinity is safe');
	t.end();
});

test('analyzeFile - module-level caching is allowed', (t) => {
	const opts = { includeGlobals: true, includeStatic: true };
	// each of these caches a global at module level and should not be reported
	t.notOk(hasGlobal(analyze('var A = Array;', opts), 'Array'), 'declarator cache');
	t.notOk(hasGlobal(analyze('var A; A = Array;', opts), 'Array'), 'assignment cache');
	t.notOk(hasGlobal(analyze('function use(x) {} use(Array);', opts), 'Array'), 'call-argument cache');
	t.notOk(hasGlobal(analyze('var a = [Array];', opts), 'Array'), 'array-element cache');
	t.notOk(hasGlobal(analyze('var o = { a: Array };', opts), 'Array'), 'object-value cache');
	t.end();
});

test('analyzeFile - ESLint disable directives', (t) => {
	const opts = { includeGlobals: true };

	t.notOk(hasGlobal(analyze('function fn() { return Array; } // eslint-disable-line find-primordials/no-globals', opts), 'Array'), 'disable-line by rule');
	t.notOk(hasGlobal(analyze('function fn() { return Array; } // eslint-disable-line', opts), 'Array'), 'disable-line all');
	t.notOk(hasGlobal(analyze('// eslint-disable-next-line find-primordials/no-globals\nfunction fn() { return Array; }', opts), 'Array'), 'disable-next-line');
	t.notOk(hasGlobal(analyze('/* eslint-disable find-primordials/no-globals */\nfunction fn() { return Array; }\n/* eslint-enable find-primordials/no-globals */', opts), 'Array'), 'disable/enable range by rule');
	t.notOk(hasGlobal(analyze('/* eslint-disable */\nfunction fn() { return Array; }', opts), 'Array'), 'disable-all to end of file');
	t.notOk(hasGlobal(analyze('/* eslint-disable */\nfunction fn() { return Array; }\n/* eslint-enable */', opts), 'Array'), 'disable-all then enable-all');
	t.notOk(hasGlobal(analyze('function fn() { return Array; } // eslint-disable-line no-globals', opts), 'Array'), 'bare rule name');
	t.notOk(hasGlobal(analyze('function fn() { return Array; } // eslint-disable-line find-primordials/no-globals, find-primordials/no-static-methods', opts), 'Array'), 'multiple rules on one line');

	// an unrelated rule name does not disable this one
	t.ok(hasGlobal(analyze('function fn() { return Array; } // eslint-disable-line find-primordials/no-static-methods', opts), 'Array'), 'unrelated rule leaves it reported');

	t.end();
});

test('analyzeFile - prototype and static access', (t) => {
	const opts = { includeGlobals: true, includeStatic: true };

	const proto = analyze('function fn(a) { return Array.prototype.push.apply(a); }', opts);
	t.ok(proto.some((f) => f.type === 'prototypeAccess'), 'reports prototype access');

	// a computed prototype member has no static method name
	const computed = analyze('function fn(k) { return Array.prototype[k]; }', opts);
	t.ok(computed.some((f) => f.type === 'prototypeAccess'), 'computed prototype access still reports');

	// a static property (not a method) is reported when includeStatic is on
	const staticProp = analyze('function fn() { return Number.MAX_SAFE_INTEGER; }', opts);
	t.ok(staticProp.some((f) => f.type === 'staticProperty' || f.type === 'staticMethod'), 'reports static property');

	t.end();
});

test('analyzeFile - type inference via the standalone TypeScript program', (t) => {
	// an ambiguous method on a value typed as an array resolves to Array with certainty
	const arr = analyze('/** @type {number[]} */\nvar a = [];\nfunction fn() { return a.includes(1); }', {});
	t.ok(arr.some((f) => f.name === 'includes' && f.certainty === 'certain'), 'typed array -> certain');

	// an ambiguous method on a value typed as a non-array/iterator is dropped
	const other = analyze('/** @type {string} */\nvar s = "";\nfunction fn() { return s.includes("x"); }', {});
	t.notOk(other.some((f) => f.name === 'includes'), 'typed string -> not an Array finding');

	// a non-ambiguous method on a value known not to be its primordial is dropped
	const notPrim = analyze('/** @type {{ test: (x: number) => boolean }} */\nvar o = { test() { return true; } };\nfunction fn() { return o.test(1); }', {});
	t.notOk(notPrim.some((f) => f.name === 'test'), 'non-RegExp .test() is dropped');

	t.end();
});

test('analyzeFilesParallel - worker pool drains many files', async (t) => {
	const files = [];
	for (let i = 0; i < 5; i += 1) { // eslint-disable-line no-magic-numbers
		counter += 1;
		const file = path.join(tmpRoot, `par${counter}.js`);
		fs.writeFileSync(file, 'function fn(a) { return a.map(function (x) { return x; }); }');
		files[files.length] = file;
	}
	// concurrency below the file count forces the worker-pool path
	const result = await analyzeFilesParallel(files, { concurrency: 2 });
	t.ok(result.findings.length > 0, 'finds usages across workers');
	t.equal(result.errors.length, 0, 'no errors'); // eslint-disable-line no-magic-numbers

	// a safe-file predicate is threaded through to the workers
	const safe = await analyzeFilesParallel(files, { concurrency: 2, isSafeFile: () => true });
	t.equal(safe.findings.length, 0, 'isSafeFile suppresses everything'); // eslint-disable-line no-magic-numbers

	t.end();
});

test('analyzeFiles - sequential with a safe-file predicate', (t) => {
	counter += 1;
	const file = path.join(tmpRoot, `seq${counter}.js`);
	fs.writeFileSync(file, 'function fn(a) { return a.map(function (x) { return x; }); }');
	const result = analyzeFiles([file], { isSafeFile: (p) => p === file });
	t.equal(result.findings.length, 0, 'the predicate marks the file safe'); // eslint-disable-line no-magic-numbers
	t.end();
});

test('describeType', (t) => {
	const ANY = 1; // ts.TypeFlags.Any
	const plainChecker = { typeToString: () => 'Widget' };
	const arrayChecker = {
		isArrayType: () => true,
		isTupleType: () => false,
		typeToString: () => 'Widget',
	};
	const notArrayChecker = {
		isArrayType: () => false,
		isTupleType: () => false,
		typeToString: () => 'Widget',
	};

	t.equal(describeType(plainChecker, null), null, 'a missing type is null');
	t.equal(describeType(plainChecker, { flags: ANY }), 'any', 'an `any` type reads as any');
	t.equal(describeType(arrayChecker, { flags: 0 }), 'Array<unknown>', 'the checker naming an array wins over the alias'); // eslint-disable-line no-magic-numbers
	t.equal(describeType(notArrayChecker, { flags: 0 }), 'Widget', 'a non-array falls back to the type name'); // eslint-disable-line no-magic-numbers
	t.equal(describeType(plainChecker, { flags: 0 }), 'Widget', 'without the internal checks it just names the type'); // eslint-disable-line no-magic-numbers
	t.end();
});

test('analyzeFile - parser services path', (t) => {
	counter += 1;
	const file = path.join(tmpRoot, `svc${counter}.js`);
	fs.writeFileSync(file, 'function fn(a) { return a.includes(1); }');

	function servicesReturning(typeString) {
		return {
			esTreeNodeToTSNodeMap: { get: () => ({}) },
			program: {
				getTypeChecker: () => ({
					getTypeAtLocation: () => ({ flags: 0 }),
					typeToString: () => typeString,
				}),
			},
		};
	}

	// the parser services resolve the receiver's type to an array, making the finding certain
	const arr = analyzeFile(file, { parserServices: servicesReturning('number[]') }).findings;
	t.ok(arr.some((f) => f.name === 'includes' && f.certainty === 'certain'), 'services typed as array -> certain');

	// resolved to a non-array/iterator type, the ambiguous call is dropped
	const other = analyzeFile(file, { parserServices: servicesReturning('Widget') }).findings;
	t.notOk(other.some((f) => f.name === 'includes'), 'services typed as other -> dropped');

	// when the node maps to no TS node, type resolution yields nothing and the call stays uncertain
	const noNode = analyzeFile(file, {
		parserServices: {
			esTreeNodeToTSNodeMap: { get: () => void undefined },
			program: { getTypeChecker: () => ({ getTypeAtLocation: () => ({ flags: 0 }), typeToString() { return ''; } }) },
		},
	}).findings;
	t.ok(noNode.some((f) => f.name === 'includes' && f.certainty === 'uncertain'), 'no ts node -> uncertain');

	// a checker that throws is swallowed, leaving the call uncertain
	const throws = analyzeFile(file, {
		parserServices: {
			esTreeNodeToTSNodeMap: { get: () => ({}) },
			program: {
				getTypeChecker() {
					throw new Error('boom');
				},
			},
		},
	}).findings;
	t.ok(throws.some((f) => f.name === 'includes' && f.certainty === 'uncertain'), 'checker error -> uncertain');

	t.end();
});

test('analyzeFile - non-ambiguous method on a typed receiver', (t) => {
	// flatMap is Array-only; on a value typed as an array the type confirms the category
	const arr = analyze('/** @type {number[]} */\nvar a = [];\nfunction fn() { return a.flatMap(function (x) { return x; }); }', {});
	t.ok(arr.some((f) => f.name === 'flatMap'), 'flatMap on a typed array is reported');
	t.end();
});

test('analyzeFile - more disable directive shapes', (t) => {
	const opts = { includeGlobals: true };

	// an import of an unrelated name does not shadow the global under test
	t.ok(hasGlobal(analyze('import { foo } from "x"; function fn() { return Array; }', opts, '.mjs'), 'Array'), 'unrelated import does not shadow');

	// two disable-line block comments on one line: a rule-specific one then a disable-all
	t.notOk(hasGlobal(analyze('function fn() { return Array; } /* eslint-disable-line find-primordials/no-static-methods */ /* eslint-disable-line */', opts), 'Array'), 'disable-all overrides earlier specific on same line');

	// two rule-specific disable-line comments on one line accumulate
	t.notOk(hasGlobal(analyze('function fn() { return Array; } /* eslint-disable-line find-primordials/no-static-methods */ /* eslint-disable-line find-primordials/no-globals */', opts), 'Array'), 'same-line rules accumulate');

	// an eslint-enable for a different rule leaves the open range in place
	t.notOk(hasGlobal(analyze('/* eslint-disable find-primordials/no-globals */\nfunction fn() { return Array; }\n/* eslint-enable find-primordials/no-static-methods */', opts), 'Array'), 'enable of a different rule does not close the range');

	t.end();
});

test('analyzeFile - non-ambiguous method reported sequentially', (t) => {
	// map is Array-only; called on an untyped receiver inside a function it is still reported
	const found = analyze('function fn(a) { return a.map(function (x) { return x; }); }', {});
	t.ok(found.some((f) => f.name === 'map'), 'map on an untyped receiver is reported');
	t.end();
});

test('analyzeFile - shadowing and caching around prototype/static access', (t) => {
	const opts = { includeGlobals: true, includeStatic: true };

	// the global that owns the prototype is shadowed, so the access is not a primordial
	t.notOk(analyze('function fn(Array) { return Array.prototype.push; }', opts).some((f) => f.type === 'prototypeAccess'), 'shadowed prototype owner suppresses');

	// the global that owns the static method is shadowed
	t.notOk(analyze('function fn(Object) { return Object.keys(Object); }', opts).some((f) => f.type === 'staticMethod'), 'shadowed static owner suppresses');

	// a static method cached at module level is allowed
	t.notOk(analyze('var k = Object.keys;', opts).some((f) => f.type === 'staticMethod'), 'module-level static cache is allowed');

	// a prototype method cached at module level is allowed
	t.notOk(analyze('var p = Array.prototype.push;', opts).some((f) => f.type === 'prototypeAccess'), 'module-level prototype cache is allowed');

	t.end();
});

test('analyzeFile - runtime call/apply/bind on a prototype method', (t) => {
	const opts = { includeGlobals: true };
	// used at runtime through .call, the prototype access is a real usage even though it is a member of a call
	const found = analyze('function fn(a) { return Array.prototype.slice.call(a); }', opts);
	t.ok(found.some((f) => f.type === 'prototypeAccess'), 'runtime .call on a prototype method is reported');
	t.end();
});

test('analyzeFile - module-level usages are skipped after classification', (t) => {
	// a non-ambiguous method called at module level is classified, then skipped as safe
	t.notOk(analyze('var a = [];\na.push(1);', {}).some((f) => f.name === 'push'), 'module-level push is safe');
	// module-level spread is likewise safe
	t.notOk(analyze('var b = [1];\nvar c = [...b];', { includeSpread: true }).some((f) => f.type === 'spread'), 'module-level spread is safe');
	t.end();
});

test('analyzeFile - parser services resolving to iterator and empty types', (t) => {
	counter += 1;
	const file = path.join(tmpRoot, `svc2-${counter}.js`);
	fs.writeFileSync(file, 'function fn(a) { return a.includes(1); }');

	counter += 1;
	const pushFile = path.join(tmpRoot, `svc3-${counter}.js`);
	fs.writeFileSync(pushFile, 'function fn(a) { return a.push(1); }');

	function servicesReturning(typeString) {
		return {
			esTreeNodeToTSNodeMap: { get: () => ({}) },
			program: {
				getTypeChecker: () => ({
					getTypeAtLocation: () => ({ flags: 0 }),
					typeToString: () => typeString,
				}),
			},
		};
	}

	// an ambiguous method whose receiver resolves to an iterator is certain, category Iterator
	counter += 1;
	const mapFile = path.join(tmpRoot, `svc-map-${counter}.js`);
	fs.writeFileSync(mapFile, 'function fn(a) { return a.map(function (x) { return x; }); }');
	const iter = analyzeFile(mapFile, { parserServices: servicesReturning('Iterator<number>') }).findings;
	t.ok(iter.some((f) => f.name === 'map' && f.certainty === 'certain'), 'iterator receiver -> certain Iterator');

	// services without a node map resolve no type
	analyzeFile(mapFile, { parserServices: { program: { getTypeChecker: () => ({}) } } });

	// an iterator type exercises the iterator branch of the type-string classifier
	analyzeFile(file, { parserServices: servicesReturning('Iterator<number>') });
	// a non-ambiguous method whose receiver resolves to an iterator type
	analyzeFile(pushFile, { parserServices: servicesReturning('Iterator<number>') });
	// an empty type string is treated as unknown
	analyzeFile(pushFile, { parserServices: servicesReturning('') });
	t.pass('iterator and empty type strings are classified without error');
	t.end();
});

test('analyzeFilesParallel - a worker reports a file error', async (t) => {
	const files = [];
	for (let i = 0; i < 4; i += 1) { // eslint-disable-line no-magic-numbers
		counter += 1;
		const file = path.join(tmpRoot, `perr${counter}.js`);
		fs.writeFileSync(file, 'function fn(a) { return a.map(function (x) { return x; }); }');
		files[files.length] = file;
	}
	// a file that cannot parse makes its worker return an error, exercising the error path
	counter += 1;
	const broken = path.join(tmpRoot, `perr-broken${counter}.js`);
	fs.writeFileSync(broken, 'function ( {');
	files[files.length] = broken;

	const result = await analyzeFilesParallel(files, { concurrency: 2 });
	t.ok(result.errors.length >= 1, 'the broken file surfaces as an error'); // eslint-disable-line no-magic-numbers
	t.end();
});

test('fix predicates - defensive and negative cases', (t) => {
	t.notOk(isRepeatable(null), 'a missing node is not repeatable');
	t.notOk(isReevaluable(null), 'a missing node is not re-evaluable');
	t.notOk(isReevaluable({ type: 'CallExpression' }), 'a call is not re-evaluable');
	t.notOk(canRewriteUndefined({ operator: 'void', type: 'UnaryExpression' }), 'undefined under void is not rewritten');
	t.notOk(canRewriteUndefined({ shorthand: true, type: 'Property' }), 'a shorthand undefined is not rewritten');
	t.ok(canRewriteUndefined({ type: 'ReturnStatement' }), 'undefined elsewhere is rewritable');
	t.end();
});

test('analyzeFilesParallel - a worker that crashes rejects', async (t) => {
	// the worker path is a test seam; these workers crash rather than analyze
	const files = ['/nowhere/a.js', '/nowhere/b.js'];
	t.ok(await rejected(analyzeFilesParallel(files, { concurrency: 1, workerPath: path.join(fixturesDir, 'worker-throw.mjs') })), 'a throwing worker rejects');
	t.ok(await rejected(analyzeFilesParallel(files, { concurrency: 1, workerPath: path.join(fixturesDir, 'worker-exit.mjs') })), 'an exiting worker rejects');
	t.end();
});

test('worker.mjs - reports an error when analyzeFile throws', (t) => {
	const workerPath = path.join(__dirname, '..', 'lib', 'worker.mjs');
	const worker = new Worker(workerPath);
	worker.once('message', async (message) => {
		t.equal(message.filePath, 'unused.js', 'echoes back the file path');
		t.ok(message.result.error, 'surfaces the thrown error');
		t.deepEqual(message.result.findings, [], 'yields no findings');
		await worker.terminate();
		t.end();
	});
	// a null options object makes analyzeFile throw before its own try/catch
	worker.postMessage({ filePath: 'unused.js', options: null });
});

test('worker.mjs - toErrorResult shapes thrown values', async (t) => {
	const { toErrorResult } = await import(path.join(__dirname, '..', 'lib', 'worker.mjs'));

	const fromError = toErrorResult('a.js', new Error('boom'));
	t.equal(fromError.result.error, 'boom', 'uses an Error message directly');
	t.deepEqual(fromError.result.findings, [], 'has no findings');

	const fromString = toErrorResult('b.js', 'plain string');
	t.equal(fromString.result.error, 'plain string', 'stringifies a non-Error throw');
	t.equal(fromString.filePath, 'b.js', 'echoes the file path');
	t.end();
});

test('analyzeFile - TypeScript program failures degrade gracefully', (t) => {
	counter += 1;
	const file = path.join(tmpRoot, `tserr${counter}.js`);
	// an ambiguous method on an untyped receiver drives the standalone type checker
	fs.writeFileSync(file, 'function fn(a) { return a.includes(1); }');
	function isUncertainIncludes(findings) {
		return findings.some((f) => f.name === 'includes' && f.certainty === 'uncertain');
	}
	function analyzeWith(typeProgramFactory) {
		return analyzeFile(file, { typeProgramFactory }).findings;
	}

	// program creation throwing is caught, and the type checker stays unavailable
	t.ok(isUncertainIncludes(analyzeWith(() => {
		throw new Error('ts boom');
	})), 'a thrown program is swallowed');

	// a program with no source file yields no type
	t.ok(isUncertainIncludes(analyzeWith(() => ({
		sourceFile: undefined,
		typeChecker: {},
	}))), 'a missing source file yields no type');

	// a source file whose positions match no node yields no type
	t.ok(isUncertainIncludes(analyzeWith(() => ({
		sourceFile: { getEnd: () => 1000000, getStart: () => 999999 },
		typeChecker: {},
	}))), 'an unfound node yields no type');

	// a checker whose type lookup throws is caught
	t.ok(isUncertainIncludes(analyzeWith(() => ({
		sourceFile: { getEnd: () => 100, getStart: () => 0 },
		typeChecker: {
			getTypeAtLocation() {
				throw new Error('lookup boom');
			},
		},
	}))), 'a throwing type lookup is swallowed');

	t.end();
});

/**
 * Build a finding for formatter tests.
 * @param {string} type - The finding type
 * @param {string} name - The finding name
 * @param {object} [extra] - Extra fields to merge in
 * @returns {object}
 */
function finding(type, name, extra) {
	return {
		certainty: 'certain',
		column: 1,
		file: 'f.js',
		line: 1,
		name,
		type,
		...extra,
	};
}

test('TAP formatting - every description shape', (t) => {
	// each finding type routes through its own description function
	t.ok(formatFindingAsTAP(finding('spread', 'spread'), 1).includes('spread syntax'), 'spread description');
	t.ok(formatFindingAsTAP(finding('staticProperty', 'Number.EPSILON'), 1).includes('Number.EPSILON'), 'staticProperty description');
	// an unknown finding type falls back to its bare name
	t.ok(formatFindingAsTAP(finding('somethingElse', 'mystery'), 1).includes('mystery'), 'unknown type falls back to name');

	/*
	 * a full report exercises grouping and the same description paths, including findings
	 * with no category (grouped by possible categories, or under "unknown")
	 */
	const report = formatAsTAP([
		finding('instanceMethod', 'push', { category: 'Array' }),
		finding('instanceMethod', 'at', { possibleCategories: ['Array', 'String'] }),
		finding('spread', 'spread'),
		finding('staticProperty', 'Number.EPSILON'),
		finding('somethingElse', 'mystery'),
	]);
	t.ok(report.includes('# Array/String'), 'a finding with only possible categories groups by them');
	t.ok(report.includes('# unknown'), 'a finding with no category groups under unknown');

	// showUncertain: false filters out uncertain findings
	const uncertain = finding('instanceMethod', 'at', { certainty: 'uncertain', line: 2 });
	const filtered = formatAsTAP([finding('instanceMethod', 'push', { category: 'Array' }), uncertain], { showUncertain: false });
	t.notOk(filtered.includes('2:1'), 'the uncertain finding is dropped');

	t.end();
});

test('analyzeFile - remaining classification branches', (t) => {
	const opts = { includeGlobals: true, includeStatic: true };

	// a computed prototype member with a non-identifier key has no method name
	t.ok(analyze('function fn() { return Array.prototype[0]; }', opts).some((f) => f.type === 'prototypeAccess'), 'computed prototype member is still reported');

	// a disable directive naming only an unknown rule disables everything on that line
	t.notOk(hasGlobal(analyze('function fn() { return Array; } // eslint-disable-line no-console', opts), 'Array'), 'an unknown rule name disables the whole line');

	t.end();
});

test.onFinish(() => {
	fs.rmSync(tmpRoot, { force: true, recursive: true });
});
