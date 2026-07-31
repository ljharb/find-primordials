import path from 'path';
import test from 'tape';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Import utils directly from source
const {
	getTypeFromServices,
	isBeingCached,
	isModuleLevelScope,
	isPrototypeAccess,
	isStaticMethodAccess,
} = await import(path.join(__dirname, '..', 'eslint-plugin', 'rules', 'utils.mjs'));

test('utils.mjs - isPrototypeAccess', (t) => {
	t.test('returns null for non-MemberExpression', (st) => {
		const node = { name: 'foo', type: 'Identifier' };
		st.equal(isPrototypeAccess(node), null, 'returns null for Identifier');
		st.end();
	});

	t.test('returns null for non-prototype access', (st) => {
		const node = {
			object: { name: 'Array', type: 'Identifier' },
			property: { name: 'isArray', type: 'Identifier' },
			type: 'MemberExpression',
		};
		st.equal(isPrototypeAccess(node), null, 'returns null for static method');
		st.end();
	});

	t.test('reports a null methodName for a computed prototype property', (st) => {
		const node = {
			computed: true,
			object: {
				object: { name: 'Array', type: 'Identifier' },
				property: { name: 'prototype', type: 'Identifier' },
				type: 'MemberExpression',
			},
			property: { type: 'Literal', value: 'push' },
			type: 'MemberExpression',
		};
		st.deepEqual(
			isPrototypeAccess(node),
			{ globalName: 'Array', methodName: null },
			'globalName is found but methodName is null when the property is not an identifier',
		);
		st.end();
	});

	t.end();
});

test('utils.mjs - getTypeFromServices', (t) => {
	const node = { name: 'x', type: 'Identifier' };

	t.test('returns null when parser services are absent', (st) => {
		st.equal(getTypeFromServices({ sourceCode: {} }, node), null, 'no parserServices yields null');
		st.end();
	});

	t.test('returns null when the program is absent', (st) => {
		const context = {
			sourceCode: {
				parserServices: {
					esTreeNodeToTSNodeMap: {
						get() {
							return {};
						},
					},
				},
			},
		};
		st.equal(getTypeFromServices(context, node), null, 'no program yields null');
		st.end();
	});

	t.test('returns null when the node map is absent', (st) => {
		const context = {
			sourceCode: {
				parserServices: {
					program: {
						getTypeChecker() {
							return {};
						},
					},
				},
			},
		};
		st.equal(getTypeFromServices(context, node), null, 'no esTreeNodeToTSNodeMap yields null');
		st.end();
	});

	t.test('returns null when the node maps to no TS node', (st) => {
		const context = {
			sourceCode: {
				parserServices: {
					esTreeNodeToTSNodeMap: {
						get() {
							return undefined;
						},
					},
					program: {
						getTypeChecker() {
							return {
								typeToString() {
									return 'x';
								},
							};
						},
					},
				},
			},
		};
		st.equal(getTypeFromServices(context, node), null, 'a missing TS node yields null');
		st.end();
	});

	t.test('describes the type when the services resolve', (st) => {
		const checker = {
			getTypeAtLocation() { return { flags: 0 }; },
			isArrayType() { return true; },
			isTupleType() { return false; },
			typeToString() { return 'Array<number>'; },
		};
		const context = {
			sourceCode: {
				parserServices: {
					esTreeNodeToTSNodeMap: { get() { return {}; } },
					program: { getTypeChecker() { return checker; } },
				},
			},
		};
		st.equal(getTypeFromServices(context, node), 'Array<unknown>', 'returns the describeType output');
		st.end();
	});

	t.test('returns null when the checker throws', (st) => {
		const context = {
			sourceCode: {
				parserServices: {
					esTreeNodeToTSNodeMap: { get() { return {}; } },
					program: { getTypeChecker() { throw new Error('boom'); } },
				},
			},
		};
		st.equal(getTypeFromServices(context, node), null, 'a thrown checker error yields null');
		st.end();
	});

	t.end();
});

test('utils.mjs - isStaticMethodAccess', (t) => {
	t.test('returns null for non-MemberExpression', (st) => {
		const node = { name: 'foo', type: 'Identifier' };
		st.equal(isStaticMethodAccess(node), null, 'returns null for Identifier');
		st.end();
	});

	t.test('returns null for non-global object', (st) => {
		const node = {
			object: { name: 'myObj', type: 'Identifier' },
			property: { name: 'keys', type: 'Identifier' },
			type: 'MemberExpression',
		};
		st.equal(isStaticMethodAccess(node), null, 'returns null for non-global');
		st.end();
	});

	t.test('returns null when no category the global answers for owns the name', (st) => {
		const node = {
			object: { name: 'Object', type: 'Identifier' },
			property: { name: 'notAStaticMethod', type: 'Identifier' },
			type: 'MemberExpression',
		};
		st.equal(isStaticMethodAccess(node), null, 'a global with an unowned name is not a static access');
		st.end();
	});

	t.test('picks the category that owns the name, of the several a global answers for', (st) => {
		function accessOf(globalName, methodName) {
			return isStaticMethodAccess({
				object: { name: globalName, type: 'Identifier' },
				property: { name: methodName, type: 'Identifier' },
				type: 'MemberExpression',
			});
		}
		st.equal(accessOf('Uint8Array', 'from')?.category, 'TypedArray', 'a %TypedArray% static is TypedArray');
		st.equal(accessOf('Uint8Array', 'fromBase64')?.category, 'Uint8Array', 'a Uint8Array-only static is Uint8Array');
		st.equal(accessOf('Int8Array', 'fromBase64'), null, 'and no other typed array has it');
		st.end();
	});

	t.end();
});

test('utils.mjs - isModuleLevelScope', (t) => {
	t.test('returns true for module level', (st) => {
		const node = { type: 'Program' };
		const result = isModuleLevelScope({}, node);
		st.equal(result, true, 'returns true for Program');
		st.end();
	});

	t.end();
});

test('utils.mjs - isBeingCached', (t) => {
	t.test('returns false for node with no parent', (st) => {
		const node = { type: 'Identifier' };
		st.equal(isBeingCached(node), false, 'returns false for no parent');
		st.end();
	});

	t.test('returns true for VariableDeclarator init', (st) => {
		const node = { type: 'CallExpression' };
		const parent = { init: node, type: 'VariableDeclarator' };
		node.parent = parent;
		st.equal(isBeingCached(node), true, 'returns true for variable init');
		st.end();
	});

	t.test('returns true for AssignmentExpression right', (st) => {
		const node = { type: 'CallExpression' };
		const parent = { right: node, type: 'AssignmentExpression' };
		node.parent = parent;
		st.equal(isBeingCached(node), true, 'returns true for assignment right');
		st.end();
	});

	t.test('returns true for CallExpression argument', (st) => {
		const node = { type: 'CallExpression' };
		const parent = { arguments: [node], type: 'CallExpression' };
		node.parent = parent;
		st.equal(isBeingCached(node), true, 'returns true for call argument');
		st.end();
	});

	t.test('returns true for ArrayExpression element', (st) => {
		const node = { type: 'CallExpression' };
		const parent = { type: 'ArrayExpression' };
		node.parent = parent;
		st.equal(isBeingCached(node), true, 'returns true for array element');
		st.end();
	});

	t.test('returns true for Property value', (st) => {
		const node = { type: 'CallExpression' };
		const parent = { type: 'Property', value: node };
		node.parent = parent;
		st.equal(isBeingCached(node), true, 'returns true for property value');
		st.end();
	});

	t.test('returns false for unrelated parent types', (st) => {
		const node = { type: 'CallExpression' };
		const parent = { type: 'ExpressionStatement' };
		node.parent = parent;
		st.equal(isBeingCached(node), false, 'returns false for ExpressionStatement');
		st.end();
	});

	t.test('returns false for Property key (not value)', (st) => {
		const node = { type: 'Identifier' };
		const parent = {
			key: node,
			type: 'Property',
			value: { type: 'Literal' },
		};
		node.parent = parent;
		st.equal(isBeingCached(node), false, 'returns false for property key');
		st.end();
	});

	t.end();
});
