import { Linter } from 'eslint';
import path from 'path';
import test from 'tape';
import { fileURLToPath } from 'url';

import plugin from 'eslint-plugin-find-primordials';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const { determineCertainty } = await import(path.join(__dirname, '..', 'eslint-plugin', 'rules', 'no-instance-methods.mjs'));

const linter = new Linter({ configType: 'flat' });

function lint(code, rules) {
	return linter.verify(code, [
		{
			plugins: {
				'find-primordials': plugin,
			},
			rules,
		},
	]);
}

function lintAndFix(code, rules) {
	return linter.verifyAndFix(code, [
		{
			plugins: {
				'find-primordials': plugin,
			},
			rules,
		},
	]);
}

test('eslint-plugin-find-primordials', (t) => {
	t.test('exports plugin object', (st) => {
		st.ok(plugin, 'plugin is exported');
		st.ok(plugin.rules, 'has rules');
		st.ok(plugin.configs, 'has configs');
		st.ok(plugin.meta, 'has meta');
		st.end();
	});

	t.test('has all rules', (st) => {
		st.ok(plugin.rules['no-instance-methods'], 'has no-instance-methods');
		st.ok(plugin.rules['no-globals'], 'has no-globals');
		st.ok(plugin.rules['no-static-methods'], 'has no-static-methods');
		st.ok(plugin.rules['no-spread-syntax'], 'has no-spread-syntax');
		st.end();
	});

	t.test('has configs', (st) => {
		st.ok(plugin.configs.recommended, 'has recommended config');
		st.ok(plugin.configs.all, 'has all config');
		st.end();
	});

	t.end();
});

test('no-instance-methods rule', (t) => {
	t.test('reports runtime instance method usage', (st) => {
		const code = 'function fn(arr) { arr.push(1); }';
		const messages = lint(code, { 'find-primordials/no-instance-methods': 'error' });

		st.equal(messages.length, 1, 'has one error');
		st.ok(messages[0].message.includes('push'), 'mentions push');
		st.end();
	});

	t.test('reports literal array method usage', (st) => {
		const code = 'function fn() { return [1, 2].map(function (x) { return x * 2; }); }';
		const messages = lint(code, { 'find-primordials/no-instance-methods': 'error' });

		st.equal(messages.length, 1, 'has one error');
		st.ok(messages[0].message.includes('map'), 'mentions map');
		st.end();
	});

	t.test('allows module-level caching', (st) => {
		const code = 'var $push = Array.prototype.push;';
		const messages = lint(code, { 'find-primordials/no-instance-methods': 'error' });

		st.equal(messages.length, 0, 'no errors');
		st.end();
	});

	t.test('reports prototype access at runtime', (st) => {
		const code = 'function fn() { return Array.prototype.push; }';
		const messages = lint(code, { 'find-primordials/no-instance-methods': 'error' });

		st.equal(messages.length, 1, 'has one error');
		st.ok(messages[0].message.includes('prototype'), 'mentions prototype');
		st.end();
	});

	t.end();
});

test('no-instance-methods autofix', (t) => {
	t.test('fixes single-argument push on array literal', (st) => {
		const result = lintAndFix('function fn() { var arr = []; arr.push(1); }', { 'find-primordials/no-instance-methods': 'error' });
		st.ok(result.fixed, 'code was fixed');
		st.ok(result.output.includes('arr[arr.length] = 1'), 'push converted to assignment');
		st.end();
	});

	t.test('fixes .at(0) on array literal to direct index', (st) => {
		const result = lintAndFix('function fn() { return [1, 2, 3].at(0); }', { 'find-primordials/no-instance-methods': 'error' });
		st.ok(result.fixed, 'code was fixed');
		st.ok(result.output.includes('[1, 2, 3][0]'), '.at(0) converted to arr[0]');
		st.end();
	});

	t.test('fixes .at(1) on array literal to direct index', (st) => {
		const result = lintAndFix('function fn() { return [1, 2, 3].at(1); }', { 'find-primordials/no-instance-methods': 'error' });
		st.ok(result.fixed, 'code was fixed');
		st.ok(result.output.includes('[1, 2, 3][1]'), '.at(1) converted to arr[1]');
		st.end();
	});

	t.test('fixes .at(-1) on array literal to arr.length - 1', (st) => {
		const result = lintAndFix('function fn() { return [1, 2, 3].at(-1); }', { 'find-primordials/no-instance-methods': 'error' });
		st.ok(result.fixed, 'code was fixed');
		st.ok(result.output.includes('[1, 2, 3][[1, 2, 3].length - 1]'), '.at(-1) converted to arr[arr.length - 1]');
		st.end();
	});

	t.test('fixes .at(-2) on array literal to arr.length - 2', (st) => {
		const result = lintAndFix('function fn() { return [1, 2, 3].at(-2); }', { 'find-primordials/no-instance-methods': 'error' });
		st.ok(result.fixed, 'code was fixed');
		st.ok(result.output.includes('[1, 2, 3][[1, 2, 3].length - 2]'), '.at(-2) converted to arr[arr.length - 2]');
		st.end();
	});

	t.test('does not fix .at() on uncertain variable', (st) => {
		const result = lintAndFix('function fn(arr) { return arr.at(0); }', { 'find-primordials/no-instance-methods': 'error' });
		st.notOk(result.fixed, 'code was not fixed');
		st.ok(result.output.includes('.at(0)'), '.at(0) not changed for uncertain types');
		st.end();
	});

	t.test('does not fix unfixable cases', (st) => {
		const cases = [
			[
				'return value used',
				'function fn() { var arr = []; var len = arr.push(1); }',
				'.push(',
			],
			[
				'multiple arguments',
				'function fn() { var arr = []; arr.push(1, 2); }',
				'.push(1, 2)',
			],
			[
				'spread argument',
				'function fn() { var arr = []; var items = [1]; arr.push(...items); }',
				'.push(...items)',
			],
			[
				'non-push method',
				'function fn() { var arr = []; arr.pop(); }',
				'.pop()',
			],
		];
		for (const [
			name,
			code,
			expected,
		] of cases) {
			const result = lintAndFix(code, { 'find-primordials/no-instance-methods': 'error' });
			st.notOk(result.fixed, `${name}: code was not fixed`);
			st.ok(result.output.includes(expected), `${name}: original call remains`);
		}
		st.end();
	});

	t.end();
});

test('no-instance-methods - a data property named after a method is not a method', (t) => {
	const RULES = { 'find-primordials/no-instance-methods': 'error' };

	t.equal(lint('function fn(row) { return typeof row.test === "number" ? row.test : null; }', RULES).length, 0, 'reading row.test is not RegExp#test'); // eslint-disable-line no-magic-numbers
	t.equal(lint('function fn(row) { return row.at; }', RULES).length, 0, 'reading row.at is not Array#at'); // eslint-disable-line no-magic-numbers

	// a call reaches something callable, so the name is worth reporting even without a type
	t.equal(lint('function fn(re, s) { return re.test(s); }', RULES).length, 1, 'calling re.test() is reported'); // eslint-disable-line no-magic-numbers
	t.equal(lint('function fn(arr) { return arr.at(0); }', RULES).length, 1, 'calling arr.at() is reported'); // eslint-disable-line no-magic-numbers

	// the type says this one is an array, so reading the method really does reach the primordial
	t.equal(lint('function fn() { return [1, 2].at; }', RULES).length, 1, 'reading .at on an array literal is reported'); // eslint-disable-line no-magic-numbers

	t.end();
});

test('no-globals autofix', (t) => {
	t.test('leaves the { undefined } shorthand alone', (st) => {
		const result = lintAndFix('function fn() { return { undefined }; }', { 'find-primordials/no-globals': 'error' });
		st.notOk(result.fixed, 'code was not fixed');
		st.ok(result.output.includes('{ undefined }'), 'rewriting the shorthand value would not parse');
		st.end();
	});

	t.test('parenthesizes void undefined where it would not parse', (st) => {
		const result = lintAndFix('function fn() { return undefined ** 2; }', { 'find-primordials/no-globals': 'error' });
		st.ok(result.fixed, 'code was fixed');
		st.ok(result.output.includes('(void undefined) ** 2'), 'void undefined ** 2 is a syntax error');
		st.end();
	});

	t.test('parenthesizes an object literal where a statement could begin', (st) => {
		const result = lintAndFix('var make = () => Object();', { 'find-primordials/no-globals': 'error' });
		st.ok(result.fixed, 'code was fixed');
		st.ok(result.output.includes('=> ({})'), 'a bare {} would be an empty block, returning undefined');
		st.end();
	});

	t.test('fixes new Array() with no args', (st) => {
		const result = lintAndFix('function fn() { return new Array(); }', { 'find-primordials/no-globals': 'error' });
		st.ok(result.fixed, 'code was fixed');
		st.ok(result.output.includes('return []'), 'new Array() converted to []');
		st.end();
	});

	t.test('fixes Array() call with no args', (st) => {
		const result = lintAndFix('function fn() { return Array(); }', { 'find-primordials/no-globals': 'error' });
		st.ok(result.fixed, 'code was fixed');
		st.ok(result.output.includes('return []'), 'Array() converted to []');
		st.end();
	});

	t.test('fixes Array(a, b, c) with multiple args', (st) => {
		const result = lintAndFix('function fn() { return Array(1, 2, 3); }', { 'find-primordials/no-globals': 'error' });
		st.ok(result.fixed, 'code was fixed');
		st.ok(result.output.includes('return [1, 2, 3]'), 'Array(a,b,c) converted to [a,b,c]');
		st.end();
	});

	t.test('fixes new Array(a, b) with multiple args', (st) => {
		const result = lintAndFix('function fn() { return new Array(1, 2); }', { 'find-primordials/no-globals': 'error' });
		st.ok(result.fixed, 'code was fixed');
		st.ok(result.output.includes('return [1, 2]'), 'new Array(a,b) converted to [a,b]');
		st.end();
	});

	t.test('does not fix Array(n) with single arg', (st) => {
		const result = lintAndFix('function fn() { return Array(5); }', { 'find-primordials/no-globals': 'error' });
		st.notOk(result.fixed, 'code was not fixed');
		st.ok(result.output.includes('Array(5)'), 'Array(n) not changed');
		st.end();
	});

	t.test('fixes new Object() with no args', (st) => {
		const result = lintAndFix('function fn() { return new Object(); }', { 'find-primordials/no-globals': 'error' });
		st.ok(result.fixed, 'code was fixed');
		st.ok(result.output.includes('return {}'), 'new Object() converted to {}');
		st.end();
	});

	t.test('fixes Object() call with no args', (st) => {
		const result = lintAndFix('function fn() { return Object(); }', { 'find-primordials/no-globals': 'error' });
		st.ok(result.fixed, 'code was fixed');
		st.ok(result.output.includes('return {}'), 'Object() converted to {}');
		st.end();
	});

	t.test('does not fix Object(x) with arg', (st) => {
		const result = lintAndFix('function fn(x) { return Object(x); }', { 'find-primordials/no-globals': 'error' });
		st.notOk(result.fixed, 'code was not fixed');
		st.ok(result.output.includes('Object(x)'), 'Object(x) not changed');
		st.end();
	});

	t.test('does not fix bare Array reference', (st) => {
		const result = lintAndFix('function fn() { return Array; }', { 'find-primordials/no-globals': 'error' });
		st.notOk(result.fixed, 'code was not fixed');
		st.end();
	});

	t.test('fixes undefined to void undefined', (st) => {
		const result = lintAndFix('function fn() { return undefined; }', { 'find-primordials/no-globals': 'error' });
		st.ok(result.fixed, 'code was fixed');
		st.ok(result.output.includes('return void undefined'), 'undefined converted to void undefined');
		st.end();
	});

	t.test('does not report void undefined', (st) => {
		const code = 'function fn() { return void undefined; }';
		const messages = lint(code, { 'find-primordials/no-globals': 'error' });
		st.equal(messages.length, 0, 'void undefined is not reported');
		st.end();
	});

	t.end();
});

test('no-globals rule', (t) => {
	t.test('reports runtime global usage', (st) => {
		const code = 'function fn() { return new Array(5); }';
		const messages = lint(code, { 'find-primordials/no-globals': 'error' });

		st.equal(messages.length, 1, 'has one error');
		st.ok(messages[0].message.includes('Array'), 'mentions Array');
		st.end();
	});

	t.test('allows module-level caching', (st) => {
		const code = 'var $Array = Array;';
		const messages = lint(code, { 'find-primordials/no-globals': 'error' });

		st.equal(messages.length, 0, 'no errors');
		st.end();
	});

	t.test('does not report property access', (st) => {
		const code = 'var obj = { Array: 1 }; console.log(obj.Array);';
		const messages = lint(code, { 'find-primordials/no-globals': 'error' });

		st.equal(messages.length, 0, 'no errors for property access');
		st.end();
	});

	t.end();
});

test('no-static-methods autofix', (t) => {
	t.test('fixes Number.isNaN(x) to x !== x', (st) => {
		const result = lintAndFix('function fn(x) { return Number.isNaN(x); }', { 'find-primordials/no-static-methods': 'error' });
		st.ok(result.fixed, 'code was fixed');
		st.ok(result.output.includes('x !== x'), 'Number.isNaN(x) converted to x !== x');
		st.end();
	});

	t.test('leaves an assignment argument alone', (st) => {
		const result = lintAndFix('function fn(x) { return Number.isNaN(x = 1); }', { 'find-primordials/no-static-methods': 'error' });
		st.notOk(result.fixed, 'code was not fixed');
		st.ok(result.output.includes('Number.isNaN(x = 1)'), 'the comparison would assign twice, so the call remains');
		st.end();
	});

	t.test('does not fix Number.isNaN with no args', (st) => {
		const result = lintAndFix('function fn() { return Number.isNaN(); }', { 'find-primordials/no-static-methods': 'error' });
		st.notOk(result.fixed, 'code was not fixed');
		st.end();
	});

	t.test('does not fix Number.isNaN with multiple args', (st) => {
		const result = lintAndFix('function fn(x, y) { return Number.isNaN(x, y); }', { 'find-primordials/no-static-methods': 'error' });
		st.notOk(result.fixed, 'code was not fixed');
		st.end();
	});

	t.test('does not fix non-isNaN static methods', (st) => {
		const result = lintAndFix('function fn(obj) { return Object.keys(obj); }', { 'find-primordials/no-static-methods': 'error' });
		st.notOk(result.fixed, 'code was not fixed');
		st.end();
	});

	t.end();
});

test('no-static-methods rule', (t) => {
	t.test('reports runtime static method usage', (st) => {
		const code = 'function fn(obj) { return Object.keys(obj); }';
		const messages = lint(code, { 'find-primordials/no-static-methods': 'error' });

		st.equal(messages.length, 1, 'has one error');
		st.ok(messages[0].message.includes('Object.keys'), 'mentions Object.keys');
		st.end();
	});

	t.test('allows module-level caching', (st) => {
		const code = 'var $keys = Object.keys;';
		const messages = lint(code, { 'find-primordials/no-static-methods': 'error' });

		st.equal(messages.length, 0, 'no errors');
		st.end();
	});

	t.test('reports Array.isArray at runtime', (st) => {
		const code = 'function fn(x) { return Array.isArray(x); }';
		const messages = lint(code, { 'find-primordials/no-static-methods': 'error' });

		st.equal(messages.length, 1, 'has one error');
		st.ok(messages[0].message.includes('Array.isArray'), 'mentions Array.isArray');
		st.end();
	});

	t.end();
});

test('no-spread-syntax rule', (t) => {
	t.test('reports runtime array spread', (st) => {
		const code = 'function fn(arr) { return [...arr]; }';
		const messages = lint(code, { 'find-primordials/no-spread-syntax': 'error' });

		st.equal(messages.length, 1, 'has one error');
		st.ok(messages[0].message.includes('spread'), 'mentions spread');
		st.end();
	});

	t.test('reports runtime object spread', (st) => {
		const code = 'function fn(obj) { return { ...obj }; }';
		const messages = lint(code, { 'find-primordials/no-spread-syntax': 'error' });

		st.equal(messages.length, 1, 'has one error');
		st.ok(messages[0].message.includes('spread'), 'mentions spread');
		st.end();
	});

	t.test('allows module-level spread', (st) => {
		const code = 'var arr = [1, 2, 3]; var copy = [...arr];';
		const messages = lint(code, { 'find-primordials/no-spread-syntax': 'error' });

		st.equal(messages.length, 0, 'no errors for module-level spread');
		st.end();
	});

	t.test('reports spread in arrow function', (st) => {
		const code = 'var fn = function (arr) { return [...arr]; };';
		const messages = lint(code, { 'find-primordials/no-spread-syntax': 'error' });

		st.equal(messages.length, 1, 'has one error for FunctionExpression');
		st.end();
	});

	t.test('reports spread in class method', (st) => {
		const code = 'class Foo { method(arr) { return [...arr]; } }';
		const messages = lint(code, { 'find-primordials/no-spread-syntax': 'error' });

		st.equal(messages.length, 1, 'has one error for class method');
		st.end();
	});

	t.end();
});

test('no-instance-methods rule - edge cases', (t) => {
	t.test('reports method in ArrowFunctionExpression', (st) => {
		const code = 'var fn = (arr) => arr.push(1);';
		const messages = lint(code, { 'find-primordials/no-instance-methods': 'error' });

		st.equal(messages.length, 1, 'has one error');
		st.end();
	});

	t.test('reports method in MethodDefinition', (st) => {
		const code = 'class Foo { bar(arr) { arr.push(1); } }';
		const messages = lint(code, { 'find-primordials/no-instance-methods': 'error' });

		st.equal(messages.length, 1, 'has one error');
		st.end();
	});

	t.test('allows caching in AssignmentExpression', (st) => {
		const code = 'var $push; $push = Array.prototype.push;';
		const messages = lint(code, { 'find-primordials/no-instance-methods': 'error' });

		st.equal(messages.length, 0, 'no errors for assignment caching');
		st.end();
	});

	t.test('allows passing as function argument', (st) => {
		const code = 'fn(Array.prototype.push);';
		const messages = lint(code, { 'find-primordials/no-instance-methods': 'error' });

		st.equal(messages.length, 0, 'no errors for function argument');
		st.end();
	});

	t.test('allows storing in array', (st) => {
		const code = 'var methods = [Array.prototype.push, Array.prototype.pop];';
		const messages = lint(code, { 'find-primordials/no-instance-methods': 'error' });

		st.equal(messages.length, 0, 'no errors for array storage');
		st.end();
	});

	t.test('allows storing as object property', (st) => {
		const code = 'var obj = { push: Array.prototype.push };';
		const messages = lint(code, { 'find-primordials/no-instance-methods': 'error' });

		st.equal(messages.length, 0, 'no errors for object property');
		st.end();
	});

	t.test('reports string instance methods', (st) => {
		const code = 'function fn(s) { return s.trim(); }';
		const messages = lint(code, { 'find-primordials/no-instance-methods': 'error' });

		st.equal(messages.length, 1, 'has one error for string trim');
		st.end();
	});

	t.test('reports object instance methods', (st) => {
		const code = 'function fn(o) { return o.hasOwnProperty("x"); }';
		const messages = lint(code, { 'find-primordials/no-instance-methods': 'error' });

		st.equal(messages.length, 1, 'has one error for hasOwnProperty');
		st.end();
	});

	t.test('reports literal string method usage', (st) => {
		const code = 'function fn() { return "hello".toUpperCase(); }';
		const messages = lint(code, { 'find-primordials/no-instance-methods': 'error' });

		st.equal(messages.length, 1, 'has one error for literal string method');
		st.end();
	});

	t.end();
});

test('no-globals rule - edge cases', (t) => {
	t.test('reports runtime Object usage', (st) => {
		const code = 'function fn() { return Object; }';
		const messages = lint(code, { 'find-primordials/no-globals': 'error' });

		st.equal(messages.length, 1, 'has one error');
		st.end();
	});

	t.test('reports runtime Map usage', (st) => {
		const code = 'function fn() { return new Map(); }';
		const messages = lint(code, { 'find-primordials/no-globals': 'error' });

		st.equal(messages.length, 1, 'has one error for Map');
		st.end();
	});

	t.test('reports runtime Set usage', (st) => {
		const code = 'function fn() { return new Set(); }';
		const messages = lint(code, { 'find-primordials/no-globals': 'error' });

		st.equal(messages.length, 1, 'has one error for Set');
		st.end();
	});

	t.test('skips parameter named like global', (st) => {
		// The rule currently reports parameter usage since it doesn't track shadowing
		const code = 'function fn(Array) { return Array; }';
		const messages = lint(code, { 'find-primordials/no-globals': 'error' });

		// Note: rule reports usage of "Array" identifier, even if it's a parameter
		st.equal(messages.length, 1, 'reports Array identifier usage');
		st.end();
	});

	t.test('skips a class declaration name', (st) => {
		const code = 'class Array {}';
		const messages = lint(code, { 'find-primordials/no-globals': 'error' });

		st.equal(messages.length, 0, 'the class name shadows the global and is not reported');
		st.end();
	});

	t.test('skips local var declaration but reports usage', (st) => {
		// The rule skips the declaration but reports usage of the identifier
		const code = 'function fn() { var Array = 1; return Array; }';
		const messages = lint(code, { 'find-primordials/no-globals': 'error' });

		// The usage of Array in return statement is reported
		st.equal(messages.length, 1, 'reports Array identifier usage');
		st.end();
	});

	t.end();
});

test('no-static-methods rule - edge cases', (t) => {
	t.test('reports Object.assign at runtime', (st) => {
		const code = 'function fn(a, b) { return Object.assign(a, b); }';
		const messages = lint(code, { 'find-primordials/no-static-methods': 'error' });

		st.equal(messages.length, 1, 'has one error');
		st.end();
	});

	t.test('reports Number.isNaN at runtime', (st) => {
		const code = 'function fn(x) { return Number.isNaN(x); }';
		const messages = lint(code, { 'find-primordials/no-static-methods': 'error' });

		st.equal(messages.length, 1, 'has one error for Number.isNaN');
		st.end();
	});

	t.test('allows caching in function argument', (st) => {
		const code = 'doSomething(Object.keys);';
		const messages = lint(code, { 'find-primordials/no-static-methods': 'error' });

		st.equal(messages.length, 0, 'no errors for function argument caching');
		st.end();
	});

	t.test('does not report non-primordial static method', (st) => {
		const code = 'function fn() { return console.log("hi"); }';
		const messages = lint(code, { 'find-primordials/no-static-methods': 'error' });

		st.equal(messages.length, 0, 'no errors for console.log');
		st.end();
	});

	t.test('reports static property access', (st) => {
		const code = 'function fn() { return Number.MAX_VALUE; }';
		const messages = lint(code, { 'find-primordials/no-static-methods': 'error' });

		st.equal(messages.length, 1, 'has one error for static property');
		st.end();
	});

	t.test('ignoreNames option skips specified methods', (st) => {
		const code = 'function fn(obj) { return Object.keys(obj); }';
		const messages = lint(code, {
			'find-primordials/no-static-methods': ['error', { ignoreNames: ['keys'] }],
		});

		st.equal(messages.length, 0, 'no errors when method is ignored');
		st.end();
	});

	t.test('ignoreCategories option skips specified categories', (st) => {
		const code = 'function fn(obj) { return Object.keys(obj); }';
		const messages = lint(code, {
			'find-primordials/no-static-methods': ['error', { ignoreCategories: ['Object'] }],
		});

		st.equal(messages.length, 0, 'no errors when category is ignored');
		st.end();
	});

	t.end();
});

test('no-globals rule - options', (t) => {
	t.test('ignoreNames option skips specified globals', (st) => {
		const code = 'function fn() { return new Array(5); }';
		const messages = lint(code, {
			'find-primordials/no-globals': ['error', { ignoreNames: ['Array'] }],
		});

		st.equal(messages.length, 0, 'no errors when global is ignored');
		st.end();
	});

	t.test('ignoreCategories option skips specified categories', (st) => {
		const code = 'function fn() { return new Array(5); }';
		const messages = lint(code, {
			'find-primordials/no-globals': ['error', { ignoreCategories: ['Array'] }],
		});

		st.equal(messages.length, 0, 'no errors when category is ignored');
		st.end();
	});

	t.end();
});

test('no-spread-syntax rule - options', (t) => {
	t.test('ignoreObjectSpread option skips object spread', (st) => {
		const code = 'function fn(obj) { return { ...obj }; }';
		const messages = lint(code, {
			'find-primordials/no-spread-syntax': ['error', { ignoreObjectSpread: true }],
		});

		st.equal(messages.length, 0, 'no errors when object spread is ignored');
		st.end();
	});

	t.test('ignoreArraySpread option skips array spread', (st) => {
		const code = 'function fn(arr) { return [...arr]; }';
		const messages = lint(code, {
			'find-primordials/no-spread-syntax': ['error', { ignoreArraySpread: true }],
		});

		st.equal(messages.length, 0, 'no errors when array spread is ignored');
		st.end();
	});

	t.end();
});

test('no-instance-methods rule - options', (t) => {
	t.test('ignoreNames option for prototype access', (st) => {
		const code = 'function fn() { return Array.prototype.push; }';
		const messages = lint(code, {
			'find-primordials/no-instance-methods': ['error', { ignoreNames: ['push'] }],
		});

		st.equal(messages.length, 0, 'no errors when prototype method is ignored');
		st.end();
	});

	t.test('ignoreCategories option for prototype access', (st) => {
		const code = 'function fn() { return Array.prototype.push; }';
		const messages = lint(code, {
			'find-primordials/no-instance-methods': ['error', { ignoreCategories: ['Array'] }],
		});

		st.equal(messages.length, 0, 'no errors when prototype category is ignored');
		st.end();
	});

	t.test('ignoreNames option for instance method', (st) => {
		const code = 'function fn(arr) { arr.push(1); }';
		const messages = lint(code, {
			'find-primordials/no-instance-methods': ['error', { ignoreNames: ['push'] }],
		});

		st.equal(messages.length, 0, 'no errors when method name is ignored');
		st.end();
	});

	t.test('ignoreCategories option for instance method', (st) => {
		const code = 'function fn(arr) { arr.push(1); }';
		const messages = lint(code, {
			'find-primordials/no-instance-methods': ['error', { ignoreCategories: ['Array'] }],
		});

		st.equal(messages.length, 0, 'no errors when category is ignored');
		st.end();
	});

	t.test('allowUncertain option allows uncertain methods', (st) => {
		const code = 'function fn(x) { return x.toString(); }';
		const messages = lint(code, {
			'find-primordials/no-instance-methods': ['error', { allowUncertain: true }],
		});

		st.equal(messages.length, 0, 'no errors when uncertain is allowed');
		st.end();
	});

	t.test('skips call/apply/bind methods', (st) => {
		const code = 'function fn(f) { return f.call(null); }';
		const messages = lint(code, { 'find-primordials/no-instance-methods': 'error' });

		st.equal(messages.length, 0, 'no errors for .call()');
		st.end();
	});

	t.test('skips computed property access', (st) => {
		const code = 'function fn(arr, m) { arr[m](); }';
		const messages = lint(code, { 'find-primordials/no-instance-methods': 'error' });

		st.equal(messages.length, 0, 'no errors for computed property');
		st.end();
	});

	t.test('skips non-primordial methods', (st) => {
		const code = 'function fn(x) { return x.customMethod(); }';
		const messages = lint(code, { 'find-primordials/no-instance-methods': 'error' });

		st.equal(messages.length, 0, 'no errors for custom methods');
		st.end();
	});

	t.test('ignores prototype access with ignoreCategories', (st) => {
		const code = 'const push = Array.prototype.push;';
		const messages = lint(code, {
			'find-primordials/no-instance-methods': ['error', { ignoreCategories: ['Array'] }],
		});

		st.equal(messages.length, 0, 'no errors for ignored category on prototype');
		st.end();
	});

	t.test('reports prototype access when not cached', (st) => {
		const code = 'function fn() { return Array.prototype.push; }';
		const messages = lint(code, { 'find-primordials/no-instance-methods': 'error' });

		st.equal(messages.length, 1, 'reports error for uncached prototype access');
		st.end();
	});

	t.test('allows module-level caching of instance methods', (st) => {
		const cases = {
			'const cached = [].push;': 'variable declaration',
			'const methods = [[].push];': 'array literal',
			'const methods = { push: [].push };': 'object literal',
			'let cached; cached = [].push;': 'assignment',
		};
		for (const [code, desc] of Object.entries(cases)) {
			const messages = lint(code, { 'find-primordials/no-instance-methods': 'error' });
			st.equal(messages.length, 0, `no errors for cached via ${desc}`);
		}
		st.end();
	});

	t.end();
});

// Build a `obj.method(1)` MemberExpression whose call parent marks it as invoked.
function makeMemberCall(objectName, methodName) {
	const object = { name: objectName, type: 'Identifier' };
	const node = {
		object,
		property: { name: methodName, type: 'Identifier' },
		type: 'MemberExpression',
	};
	node.parent = {
		arguments: [{ type: 'Literal', value: 1 }],
		callee: node,
		type: 'CallExpression',
	};
	return node;
}

/*
 * Drive the rule directly with a stubbed TypeScript checker so the type-aware branches
 * run without a real @typescript-eslint program. `typeString` is what the checker reports
 * for the receiver's type; omit it to simulate no parser services.
 */
function runInstanceRule(node, typeString, options) {
	const messages = [];
	const parserServices = typeof typeString === 'undefined' ? undefined : {
		esTreeNodeToTSNodeMap: { get() { return {}; } },
		program: {
			getTypeChecker() {
				return {
					getTypeAtLocation() { return { flags: 0 }; },
					isArrayType() { return false; },
					isTupleType() { return false; },
					typeToString() { return typeString; },
				};
			},
		},
	};
	const context = {
		options: options ? [options] : [],
		report(descriptor) { messages[messages.length] = descriptor; },
		sourceCode: {
			getText() { return ''; },
			parserServices,
		},
	};
	const listeners = plugin.rules['no-instance-methods'].create(context);
	const visitMember = listeners.MemberExpression;
	visitMember(node);
	return messages;
}

test('no-instance-methods - type-aware detection', (t) => {
	t.test('an array type makes an instance method certain', (st) => {
		const messages = runInstanceRule(makeMemberCall('arr', 'push'), 'Array<number>');
		st.equal(messages.length, 1, 'reports once');
		st.equal(messages[0].messageId, 'instanceMethod', 'reports the certain message');
		st.equal(messages[0].data.category, 'Array', 'detects the Array category');
		st.end();
	});

	t.test('an iterator type resolves to the Iterator category', (st) => {
		const messages = runInstanceRule(makeMemberCall('it', 'flatMap'), 'Iterator<number>');
		st.equal(messages.length, 1, 'reports once');
		st.equal(messages[0].messageId, 'instanceMethod', 'reports the certain message');
		st.equal(messages[0].data.category, 'Iterator', 'detects the Iterator category');
		st.end();
	});

	t.test('a non-primordial type is skipped', (st) => {
		const messages = runInstanceRule(makeMemberCall('m', 'push'), 'Map<string, number>');
		st.equal(messages.length, 0, 'a Map receiver is not a primordial array');
		st.end();
	});

	t.test('an unrecognized type falls back to uncertain', (st) => {
		const messages = runInstanceRule(makeMemberCall('s', 'push'), 'string');
		st.equal(messages.length, 1, 'still reports');
		st.equal(messages[0].messageId, 'instanceMethodUncertain', 'is uncertain when the type is unrecognized');
		st.end();
	});

	t.end();
});

test('no-instance-methods - additional branches', (t) => {
	t.test('ignores computed member access', (st) => {
		const messages = lint('function f(o) { return o[0]; }', { 'find-primordials/no-instance-methods': 'error' });
		st.equal(messages.length, 0, 'a computed property is not a named method');
		st.end();
	});

	t.test('honors ignoreCategories for a type-detected category', (st) => {
		// charAt is a String method, but on an array literal the detected category becomes Array
		const messages = lint('[1, 2].charAt(0);', {
			'find-primordials/no-instance-methods': ['error', { ignoreCategories: ['Array'] }],
		});
		st.equal(messages.length, 0, 'the Array detected-category is ignored');
		st.end();
	});

	t.test('reports an ambiguous method as uncertain', (st) => {
		const messages = lint('function f(x) { return x.includes(1); }', { 'find-primordials/no-instance-methods': 'error' });
		st.equal(messages.length, 1, 'reports once');
		st.equal(messages[0].messageId, 'instanceMethodUncertain', 'an ambiguous name is uncertain');
		st.ok(messages[0].message.includes('includes'), 'mentions the method name');
		st.end();
	});

	t.test('an async-iterator type resolves to the AsyncIterator category', (st) => {
		/*
		 * No primordial method is AsyncIterator-only, so drive determineCertainty with a
		 * synthetic category to exercise the async branch of the iterator classification.
		 */
		const context = {
			sourceCode: {
				parserServices: {
					esTreeNodeToTSNodeMap: { get() { return {}; } },
					program: {
						getTypeChecker() {
							return {
								getTypeAtLocation() { return { flags: 0 }; },
								isArrayType() { return false; },
								isTupleType() { return false; },
								typeToString() { return 'AsyncIterator<number>'; },
							};
						},
					},
				},
			},
		};
		const node = {
			object: { name: 'g', type: 'Identifier' },
			property: { name: 'someHelper', type: 'Identifier' },
			type: 'MemberExpression',
		};
		const result = determineCertainty(context, node, ['AsyncIterator'], false);
		st.equal(result.certainty, 'certain', 'an async iterator type is certain');
		st.equal(result.detectedCategory, 'AsyncIterator', 'detects the AsyncIterator category');
		st.end();
	});

	t.end();
});
