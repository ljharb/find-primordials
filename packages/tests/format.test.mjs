import test from 'tape';

import { formatAsTAP, receiverLabel } from 'find-primordials';

test('formatAsTAP - names the receiver a method was reached through', (t) => {
	function line(finding) {
		return formatAsTAP([
			{
				certainty: 'certain',
				column: 1, // eslint-disable-line no-magic-numbers
				file: 'a.js',
				line: 1, // eslint-disable-line no-magic-numbers
				type: 'instanceMethod',
				...finding,
			},
		]);
	}

	/*
	 * `slice` alone does not say what it reached, so the receiver is what makes one
	 * finding tell you to reach for `ArrayPrototypeSlice` and another `StringPrototypeSlice`.
	 */
	t.ok(line({ category: 'Array', name: 'slice' }).includes('.slice() on Array'), 'an Array receiver');
	t.ok(line({ category: 'String', name: 'slice' }).includes('.slice() on String'), 'a String receiver');
	t.ok(line({ category: 'TypedArray', name: 'slice' }).includes('.slice() on TypedArray'), 'a typed array with no name of its own');

	// the specific typed array beats the family it belongs to
	t.ok(line({
		category: 'TypedArray', name: 'slice', receiver: 'Uint8Array',
	}).includes('.slice() on Uint8Array'), 'the typed array it actually is');
	t.ok(line({
		category: 'Error', name: 'toString', receiver: 'TypeError',
	}).includes('.toString() on TypeError'), 'the error subclass it actually is');

	// with no category at all there is nothing honest to name
	const uncertain = line({
		category: null, certainty: 'uncertain', name: 'slice', possibleCategories: ['Array', 'String'],
	});
	t.ok(uncertain.includes('.slice() [uncertain'), 'an unresolved receiver is left unnamed');
	t.ok(uncertain.includes('# Array/String'), 'and its candidates group the finding');

	t.end();
});

test('receiverLabel', (t) => {
	t.equal(receiverLabel({ category: 'TypedArray', receiver: 'Uint8Array' }), 'Uint8Array', 'prefers the specific global');
	t.equal(receiverLabel({ category: 'Array' }), 'Array', 'falls back to the category');
	t.equal(receiverLabel({ category: null }), '', 'and names nothing when there is no category');
	t.end();
});

test('formatAsTAP - formats empty findings', (t) => {
	const output = formatAsTAP([]);

	t.ok(output.includes('TAP version 14'), 'has TAP version');
	t.ok(output.includes('1..0'), 'has zero tests');
	t.ok(output.includes('No primordial usages found'), 'has no findings message');
	t.end();
});

test('formatAsTAP - formats findings', (t) => {
	const findings = [
		{
			category: 'Array',
			certainty: 'certain',
			column: 5, // eslint-disable-line no-magic-numbers
			file: 'test.js',
			line: 10, // eslint-disable-line no-magic-numbers
			name: 'push',
			type: 'instanceMethod',
		},
	];

	const output = formatAsTAP(findings);

	t.ok(output.includes('TAP version 14'), 'has TAP version');
	t.ok(output.includes('not ok 1'), 'has failing test');
	t.ok(output.includes('test.js:10:5'), 'has location');
	t.ok(output.includes('.push()'), 'has method name');
	t.ok(output.includes('1..1'), 'has test count');
	t.end();
});

test('formatAsTAP - groups by default', (t) => {
	const findings = [
		{
			category: 'Array',
			certainty: 'certain',
			column: 1, // eslint-disable-line no-magic-numbers
			file: 'a.js',
			line: 1, // eslint-disable-line no-magic-numbers
			name: 'push',
			type: 'instanceMethod',
		},
		{
			category: 'String',
			certainty: 'certain',
			column: 1, // eslint-disable-line no-magic-numbers
			file: 'b.js',
			line: 1, // eslint-disable-line no-magic-numbers
			name: 'slice',
			type: 'instanceMethod',
		},
	];

	const output = formatAsTAP(findings);

	t.ok(output.includes('# Array'), 'has Array category header');
	t.ok(output.includes('# String'), 'has String category header');
	t.end();
});

test('formatAsTAP - handles uncertain findings', (t) => {
	const findings = [
		{
			category: 'Array',
			certainty: 'certain',
			column: 5,
			file: 'test.js',
			line: 10,
			name: 'push',
			type: 'instanceMethod',
		},
		{
			category: 'Array',
			certainty: 'uncertain',
			column: 10,
			file: 'test.js',
			line: 20,
			name: 'map',
			type: 'instanceMethod',
		},
	];

	const output = formatAsTAP(findings);

	t.ok(output.includes('TAP version 14'), 'has TAP version');
	t.ok(output.includes('[uncertain'), 'shows uncertain marker');
	t.ok(output.includes('1 certain'), 'shows certain count');
	t.ok(output.includes('1 uncertain'), 'shows uncertain count');
	t.end();
});

test('formatAsTAP - handles findings grouped by category', (t) => {
	const findings = [
		{
			category: 'Array',
			certainty: 'certain',
			column: 1,
			file: 'a.js',
			line: 1,
			name: 'push',
			type: 'instanceMethod',
		},
		{
			category: 'String',
			certainty: 'certain',
			column: 1,
			file: 'b.js',
			line: 1,
			name: 'slice',
			type: 'instanceMethod',
		},
	];

	const output = formatAsTAP(findings);

	t.ok(output.includes('# Array'), 'has Array category header');
	t.ok(output.includes('# String'), 'has String category header');
	t.end();
});

test('formatAsTAP - formats static method findings', (t) => {
	const findings = [
		{
			category: 'Object',
			certainty: 'certain',
			column: 1,
			file: 'a.js',
			line: 1,
			name: 'keys',
			type: 'staticMethod',
		},
	];

	const output = formatAsTAP(findings);

	t.ok(output.includes('# Object'), 'has Object category header');
	t.ok(output.includes('keys()'), 'has keys() in output');
	t.end();
});

test('formatAsTAP - single finding has correct pluralization', (t) => {
	const findings = [
		{
			category: 'Array',
			certainty: 'certain',
			column: 1,
			file: 'a.js',
			line: 1,
			name: 'push',
			type: 'instanceMethod',
		},
	];

	const output = formatAsTAP(findings);

	t.ok(output.includes('1 primordial usage found'), 'singular usage');
	t.notOk(output.includes('usages'), 'no plural form');
	t.end();
});

test('formatAsTAP - multiple findings has correct pluralization', (t) => {
	const findings = [
		{
			category: 'Array',
			certainty: 'certain',
			column: 1,
			file: 'a.js',
			line: 1,
			name: 'push',
			type: 'instanceMethod',
		},
		{
			category: 'Array',
			certainty: 'certain',
			column: 1,
			file: 'b.js',
			line: 2,
			name: 'pop',
			type: 'instanceMethod',
		},
	];

	const output = formatAsTAP(findings);

	t.ok(output.includes('2 primordial usages found'), 'plural usages');
	t.end();
});
