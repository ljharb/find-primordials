
import {
	allGlobals,
	allInstanceMethods,
	allStaticMethods,
	ambiguousInstanceMethods,
	canBeArrayLiteral,
	canRewriteUndefined,
	describeType,
	globalToCategory,
	isCalled,
	isReevaluable,
	isRepeatable,
	literalIndex,
	primordials,
	startsAStatement,
	voidNeedsParens,
} from 'find-primordials';

/*
 * The rewrites here and the ones the CLI applies have to agree on what is safe,
 * so both decide with the same predicates rather than their own copies.
 */
export {
	allGlobals,
	allInstanceMethods,
	allStaticMethods,
	ambiguousInstanceMethods,
	canBeArrayLiteral,
	canRewriteUndefined,
	describeType,
	globalToCategory,
	isCalled,
	isReevaluable,
	isRepeatable,
	literalIndex,
	primordials,
	startsAStatement,
	voidNeedsParens,
};

/**
 * An ESLint (ESTree) AST node: the loose node shape the `find-primordials` predicates
 * accept, plus the `parent` link ESLint threads onto every node. Sharing that base makes
 * a node here assignable to those predicates without narrowing.
 * @typedef {import('find-primordials').ASTNode & { parent?: ASTNode }} ASTNode
 */

/** @typedef {{ flags: number }} TSType */

/**
 * The slice of the TypeScript checker used here, described structurally so it need not
 * name `typescript` (whose type exports vary by install).
 * @typedef {object} TSChecker
 * @property {(type: TSType) => string} typeToString
 * @property {(type: TSType) => boolean} [isArrayType]
 * @property {(type: TSType) => boolean} [isTupleType]
 * @property {(node: object) => TSType} getTypeAtLocation
 */

/**
 * @typedef {object} ParserServices
 * @property {{ getTypeChecker: () => TSChecker }} [program]
 * @property {{ get: (node: ASTNode) => (object | undefined) }} [esTreeNodeToTSNodeMap]
 */

/**
 * @typedef {object} SourceCode
 * @property {ParserServices} [parserServices]
 * @property {(node: ASTNode) => string} getText
 */

/**
 * The slice of the ESLint rule context the rules use.
 * @typedef {object} RuleContext
 * @property {SourceCode} sourceCode
 * @property {() => SourceCode} getSourceCode
 * @property {(descriptor: object) => void} report
 * @property {Record<string, unknown>[]} options
 */

/**
 * The slice of the ESLint fixer the rules use.
 * @typedef {object} RuleFixer
 * @property {(target: ASTNode, text: string) => object} replaceText
 */

/**
 * Whether a node is in module-level scope, outside any function.
 * @param {RuleContext} _context - The rule context (unused)
 * @param {ASTNode} node - The node
 * @returns {boolean}
 */
export function isModuleLevelScope(_context, node) {
	/** @type {ASTNode | undefined} */
	let current = node;
	while (current) {
		if (
			current.type === 'FunctionDeclaration'
			|| current.type === 'FunctionExpression'
			|| current.type === 'ArrowFunctionExpression'
			|| current.type === 'ClassMethod'
			|| current.type === 'MethodDefinition'
		) {
			return false;
		}
		current = current.parent;
	}
	return true;
}

/**
 * Whether the expression is being stored or cached rather than used at runtime.
 * @param {ASTNode} node - The node
 * @returns {boolean}
 */
export function isBeingCached(node) {
	const { parent } = node;
	if (!parent) {
		return false;
	}

	// Being assigned to a variable
	if (parent.type === 'VariableDeclarator' && parent.init === node) {
		return true;
	}

	// Being assigned via assignment expression
	if (parent.type === 'AssignmentExpression' && parent.right === node) {
		return true;
	}

	// Being passed as an argument to a function call
	if (parent.type === 'CallExpression' && parent.arguments.includes(node)) {
		return true;
	}

	// Part of an array
	if (parent.type === 'ArrayExpression') {
		return true;
	}

	// Property value in object
	if (parent.type === 'Property' && parent.value === node) {
		return true;
	}

	return false;
}

/**
 * Whether a member expression accesses a primordial prototype, e.g. `Array.prototype.push`.
 * @param {ASTNode} node - The node
 * @returns {{ globalName: string, methodName: (string | null) } | null}
 */
export function isPrototypeAccess(node) {
	if (node.type !== 'MemberExpression') {
		return null;
	}

	if (
		node.object.type === 'MemberExpression'
		&& node.object.property.type === 'Identifier'
		&& node.object.property.name === 'prototype'
		&& node.object.object.type === 'Identifier'
		&& allGlobals.has(node.object.object.name)
	) {
		const globalName = node.object.object.name;
		const methodName = node.property.type === 'Identifier' ? node.property.name : null;
		return { globalName, methodName };
	}

	return null;
}

/**
 * Whether a member expression is a primordial static method or property access,
 * e.g. `Object.keys`.
 * @param {ASTNode} node - The node
 * @returns {{ category: string, globalName: string, isProperty: (boolean | undefined), methodName: string } | null}
 */
export function isStaticMethodAccess(node) {
	if (node.type !== 'MemberExpression') {
		return null;
	}

	if (
		node.object.type === 'Identifier'
		&& allGlobals.has(node.object.name)
		&& node.property.type === 'Identifier'
	) {
		const globalName = node.object.name;
		const methodName = node.property.name;
		const category = globalToCategory.get(globalName);

		if (category && primordials[category]) {
			const isStatic = primordials[category].staticMethods.includes(methodName);
			const isStaticProp = primordials[category].staticProperties?.includes(methodName);

			if (isStatic || isStaticProp) {
				return {
					category,
					globalName,
					isProperty: isStaticProp,
					methodName,
				};
			}
		}
	}

	return null;
}

/**
 * Get a node's type string from ESLint's TypeScript parser services, if available.
 * @param {RuleContext} context - The rule context
 * @param {ASTNode} node - The node
 * @returns {string | null}
 */
export function getTypeFromServices(context, node) {
	const { sourceCode } = context;
	const { parserServices } = sourceCode;

	if (!parserServices?.program || !parserServices?.esTreeNodeToTSNodeMap) {
		return null;
	}
	try {
		const checker = parserServices.program.getTypeChecker();
		const tsNode = parserServices.esTreeNodeToTSNodeMap.get(node);
		if (!tsNode) {
			return null;
		}
		return describeType(checker, checker.getTypeAtLocation(tsNode));
	} catch {
		return null;
	}
}

/** @param {string} typeStr */
// Determine if a type string indicates an array or iterator
export function isArrayOrIteratorType(typeStr) {
	if (!typeStr) {
		return null;
	}

	const arrayPatterns = [
		/^Array</,
		/\[\]$/,
		/^readonly\s+\w+\[\]$/,
		/^Int8Array$/,
		/^Uint8Array$/,
		/^Uint8ClampedArray$/,
		/^Int16Array$/,
		/^Uint16Array$/,
		/^Int32Array$/,
		/^Uint32Array$/,
		/^BigInt64Array$/,
		/^BigUint64Array$/,
		/^Float16Array$/,
		/^Float32Array$/,
		/^Float64Array$/,
	];

	const iteratorPatterns = [
		/^Iterator</,
		/^IterableIterator</,
		/^Generator</,
		/^AsyncIterator</,
		/^AsyncGenerator</,
	];

	for (let i = 0; i < arrayPatterns.length; i += 1) {
		if (arrayPatterns[i].test(typeStr)) {
			return 'array';
		}
	}

	for (let i = 0; i < iteratorPatterns.length; i += 1) {
		if (iteratorPatterns[i].test(typeStr)) {
			return 'iterator';
		}
	}

	const nonArrayPatterns = [
		/^Map</,
		/^Set</,
		/^WeakMap</,
		/^WeakSet</,
		/^Promise</,
		/^Object$/,
		/^Record</,
		/^\{/,
	];

	for (let i = 0; i < nonArrayPatterns.length; i += 1) {
		if (nonArrayPatterns[i].test(typeStr)) {
			return 'other';
		}
	}

	return null;
}
