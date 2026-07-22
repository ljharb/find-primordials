import test from 'tape';

import { formatAsTAP } from 'find-primordials';

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
