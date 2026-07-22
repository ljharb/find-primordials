/* eslint max-lines: 'off' */

import { parse } from '@typescript-eslint/parser';
import fs from 'fs';
import os from 'os';
import path from 'path';
import ts from 'typescript';
import { fileURLToPath } from 'url';
import { Worker } from 'worker_threads';

import traverse from 'traverse';

import {
	allGlobals,
	allInstanceMethods,
	ambiguousInstanceMethods,
	globalToCategory,
	primordials,
} from '#/primordials';

/**
 * @import {
 * 	Node as TSNode,
 * 	Program,
 * 	SourceFile,
 * 	TypeChecker,
 * } from 'typescript'
 */

/**
 * A source position, as ESTree records it.
 * @typedef {object} SourceLocation
 * @property {{ line: number, column: number }} start
 * @property {{ line: number, column: number }} end
 */

/**
 * A parsed ESTree/TSESTree node. The analyzer walks across many node kinds and reads
 * whichever properties the kind at hand carries. Rather than narrow to a discriminated
 * union at every access, this is one permissive shape whose fields are treated as always
 * present - the analyzer only reads a field after establishing the node's `type` - and
 * whose leaves that mean different things by kind (`value`, `body`) are left loose.
 * A node that may be absent is typed {@link MaybeNode} instead.
 * @typedef {object} ASTNode
 * @property {string} type
 * @property {string} name
 * @property {string} operator
 * @property {string} kind
 * @property {boolean} computed
 * @property {boolean} shorthand
 * @property {ASTNode} object
 * @property {ASTNode} property
 * @property {ASTNode} callee
 * @property {ASTNode} left
 * @property {ASTNode} right
 * @property {ASTNode} test
 * @property {ASTNode} consequent
 * @property {ASTNode} alternate
 * @property {ASTNode} argument
 * @property {ASTNode} id
 * @property {ASTNode} init
 * @property {ASTNode} key
 * @property {ASTNode} local
 * @property {ASTNode} param
 * @property {ASTNode[]} arguments
 * @property {ASTNode[]} properties
 * @property {ASTNode[]} params
 * @property {ASTNode[]} expressions
 * @property {ASTNode[]} declarations
 * @property {ASTNode[]} specifiers
 * @property {(ASTNode | null)[]} elements
 * @property {ASTNode[]} comments
 * @property {unknown} value
 * @property {unknown} body
 * @property {[number, number]} range
 * @property {SourceLocation} loc
 */

/** @typedef {ASTNode | null | undefined} MaybeNode */

/**
 * A node as `traverse` exposes it on the callback `this`: the AST node and its parent link.
 * @typedef {{ node: ASTNode, parent?: TraverseNode }} TraverseNode
 */

/** @typedef {'at' | 'constructor' | 'isNaN' | 'push' | 'undefined'} FixKind */

/**
 * A primordial usage the analyzer reports.
 * @typedef {object} Finding
 * @property {string} type
 * @property {string} name
 * @property {string} certainty
 * @property {string} file
 * @property {number} [line]
 * @property {number} [column]
 * @property {string | null} [category]
 * @property {string[]} [possibleCategories]
 */

/**
 * A single source rewrite, as a half-open `[start, end)` range and its replacement.
 * @typedef {object} Fix
 * @property {number} start
 * @property {number} end
 * @property {FixKind} kind
 * @property {string} replacement
 */

/**
 * The result of rewriting a file.
 * @typedef {object} FixResult
 * @property {boolean} fixed
 * @property {string} output
 * @property {number} fixCount
 * @property {Record<FixKind, number>} fixCounts
 */

/**
 * A run of lines with an ESLint rule disabled. `end` is `Infinity` while the range is
 * still open, and `rules` is null when every rule is disabled.
 * @typedef {object} DisableRange
 * @property {number} start
 * @property {number} end
 * @property {Set<string> | null} rules
 */

/**
 * The disable directives parsed out of a file's comments.
 * @typedef {object} DisableState
 * @property {Map<number, Set<string> | null>} disabledLines
 * @property {DisableRange[]} disabledRanges
 */

/**
 * Options accepted by {@link analyzeFile} and the batch analyzers.
 * @typedef {object} AnalyzeOptions
 * @property {boolean} [includeGlobals]
 * @property {boolean} [includeSpread]
 * @property {boolean} [includeStatic]
 * @property {boolean} [includeUncertain]
 * @property {boolean} [isSafe]
 * @property {ParserServices | null} [parserServices]
 * @property {((filePath: string) => boolean) | null} [isSafeFile]
 * @property {number} [concurrency]
 * @property {string} [workerPath] - Overrides the worker module path (test seam)
 * @property {(filePath: string, sourceCode: string) => { sourceFile: (import('typescript').SourceFile | undefined), typeChecker: import('typescript').TypeChecker }} [typeProgramFactory] - Overrides standalone TypeScript program creation (test seam)
 */

/** @typedef {{ error: string, file: string }} AnalysisError */

/** @typedef {{ errors: AnalysisError[], findings: Finding[] }} AnalysisResult */

const CERTAINTY_CERTAIN = 'certain';
const CERTAINTY_UNCERTAIN = 'uncertain';

const CALL_APPLY_BIND = /** @type {Set<string>} */ (new Set([
	'call',
	'apply',
	'bind',
]));

/**
 * Whether a member expression is being invoked, rather than merely read.
 * `arr.at(0)` and `arr.at.call(arr, 0)` both reach the method; `row.at` on its own
 * only reads whatever `at` happens to be.
 * @param {ASTNode} node - The MemberExpression
 * @param {MaybeNode} parent - Its parent
 * @returns {boolean}
 */
export function isCalled(node, parent) {
	if (parent?.type === 'CallExpression' || parent?.type === 'NewExpression') {
		return parent.callee === node;
	}
	return parent?.type === 'MemberExpression'
		&& parent.object === node
		&& !parent.computed
		&& CALL_APPLY_BIND.has(parent.property?.name);
}

/**
 * Whether a node sits in module-level scope, outside any function.
 * @param {ASTNode[]} ancestors - The node's ancestors, nearest last
 * @returns {boolean}
 */
function isModuleLevelScope(ancestors) {
	for (const ancestor of ancestors) {
		const { type } = ancestor;
		if (
			type === 'FunctionDeclaration'
			|| type === 'FunctionExpression'
			|| type === 'ArrowFunctionExpression'
			|| type === 'ClassMethod'
			|| type === 'MethodDefinition'
		) {
			return false;
		}
	}
	return true;
}

/**
 * Whether the expression is being stored or cached rather than used at runtime.
 * @param {ASTNode} node - The node in question
 * @param {ASTNode} parent - Its parent
 * @returns {boolean}
 */
function isBeingCached(node, parent) {
	if (parent.type === 'VariableDeclarator' && parent.init === node) {
		return true;
	}
	if (parent.type === 'AssignmentExpression' && parent.right === node) {
		return true;
	}
	if (parent.type === 'CallExpression' && parent.arguments.includes(node)) {
		return true;
	}
	if (parent.type === 'ArrayExpression') {
		return true;
	}
	if (parent.type === 'Property' && parent.value === node) {
		return true;
	}
	return false;
}

/**
 * The slice of a TypeScript `Type` this module reads.
 * @typedef {{ flags: number }} TypeLike
 */

/**
 * Describe a type as a string the patterns below can read.
 *
 * `typeToString` names an alias rather than describing it, which loses exactly what
 * those patterns look for: `type Coverage = Array<T>` prints as `Coverage`, and so does
 * an alias that failed to resolve - even though the latter is `any`. Either way a name
 * alone reads as some concrete non-primordial type, so the checker is asked instead.
 *
 * The checker is described by the methods used rather than by `typescript`'s exported
 * types, which differ across installs; it is generic over the type so both a real checker
 * and the one ESLint's parser services expose satisfy it. `isArrayType`/`isTupleType`
 * are internal, so they are optional.
 * @template {TypeLike} T
 * @param {{ typeToString: (type: T) => string, isArrayType?: (type: T) => boolean, isTupleType?: (type: T) => boolean }} typeChecker - The TypeScript type checker
 * @param {T} type - The type to describe
 * @returns {string | null}
 */
export function describeType(typeChecker, type) {
	if (!type) {
		return null;
	}
	if (type.flags & (ts.TypeFlags.Any | ts.TypeFlags.Unknown)) {
		return /** @type {const} */ ('any');
	}
	// isArrayType/isTupleType are internal, so fall back to naming the type if they go away
	if (
		typeof typeChecker.isArrayType === 'function'
		&& typeof typeChecker.isTupleType === 'function'
		&& (typeChecker.isArrayType(type) || typeChecker.isTupleType(type))
	) {
		return /** @type {const} */ ('Array<unknown>');
	}
	return typeChecker.typeToString(type);
}

/**
 * @typedef {object} ParserServices
 * @property {Program} [program]
 * @property {{ get: (node: ASTNode) => (TSNode | undefined) }} [esTreeNodeToTSNodeMap]
 */

/**
 * Get the type of a node from ESLint parser services. Only called once the caller has
 * established that `services.program` is present.
 * @param {ASTNode} node - The node to type
 * @param {ParserServices} services - ESLint parser services
 * @returns {string | null}
 */
function getTypeFromServices(node, services) {
	if (!services.esTreeNodeToTSNodeMap) {
		return null;
	}
	try {
		const tsNode = services.esTreeNodeToTSNodeMap.get(node);
		if (!tsNode) {
			return null;
		}
		const typeChecker = /** @type {Program} */ (services.program).getTypeChecker();
		return describeType(typeChecker, typeChecker.getTypeAtLocation(tsNode));
	} catch {
		return null;
	}
}

/** @type {Map<string, string[]>} Cache for type roots by directory */
const typeRootsCache = new Map();

/**
 * Find node_modules/@types directory by walking up from file (memoized).
 * @param {string} filePath - The file to resolve type roots for
 * @returns {string[]}
 */
function findTypeRoots(filePath) {
	const startDir = path.dirname(path.resolve(filePath));

	// Check cache first
	if (typeRootsCache.has(startDir)) {
		return /** @type {string[]} */ (typeRootsCache.get(startDir));
	}

	const roots = [];
	let dir = startDir;
	const { root } = path.parse(dir);

	while (dir !== root) {
		const typesDir = path.join(dir, 'node_modules', '@types');
		try {
			fs.accessSync(typesDir);
			roots[roots.length] = typesDir;
		} catch {
			// Directory doesn't exist
		}
		dir = path.dirname(dir);
	}

	typeRootsCache.set(startDir, roots);
	return roots;
}

/**
 * Create a TypeScript program for standalone type checking.
 * @param {string} filePath - The file to check
 * @param {string} sourceCode - Its source
 * @returns {{ sourceFile: SourceFile | undefined, typeChecker: TypeChecker }}
 */
function createTypeProgram(filePath, sourceCode) {
	const typeRoots = findTypeRoots(filePath);

	const compilerOptions = {
		allowJs: true,
		checkJs: true,
		esModuleInterop: true,
		lib: ['lib.esnext.full.d.ts'],
		module: ts.ModuleKind.ESNext,
		moduleResolution: ts.ModuleResolutionKind.NodeNext,
		noEmit: true,
		skipLibCheck: true,
		target: ts.ScriptTarget.ESNext,
		typeRoots: typeRoots.length > 0 ? typeRoots : void undefined,
	};

	const host = ts.createCompilerHost(compilerOptions);
	const originalReadFile = host.readFile.bind(host);
	host.readFile = (fileName) => {
		if (path.resolve(fileName) === path.resolve(filePath)) {
			return sourceCode;
		}
		return originalReadFile(fileName);
	};

	const program = ts.createProgram([filePath], compilerOptions, host);
	return {
		sourceFile: program.getSourceFile(filePath),
		typeChecker: program.getTypeChecker(),
	};
}

/**
 * Find the innermost TypeScript node at a source position.
 * @param {SourceFile} sourceFile - The source file
 * @param {number} pos - The character offset
 * @returns {TSNode | null}
 */
function findNodeAtPosition(sourceFile, pos) {
	/** @type {TSNode | null} */
	let found = null;
	/** @param {TSNode} node */
	function visit(node) {
		if (pos >= node.getStart() && pos < node.getEnd()) {
			found = node;
			ts.forEachChild(node, visit);
		}
	}
	visit(sourceFile);
	return found;
}

/**
 * Get the type at a source position from a standalone TypeScript program.
 * @param {TypeChecker | null} typeChecker - The type checker
 * @param {SourceFile | null} sourceFile - The source file
 * @param {number} pos - The character offset
 * @returns {string | null}
 */
function getTypeAtPosition(typeChecker, sourceFile, pos) {
	if (!typeChecker || !sourceFile) {
		return null;
	}
	try {
		const tsNode = findNodeAtPosition(sourceFile, pos);
		if (!tsNode) {
			return null;
		}
		return describeType(typeChecker, typeChecker.getTypeAtLocation(tsNode));
	} catch {
		return null;
	}
}

const ARRAY_PATTERNS = [
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

const ITERATOR_PATTERNS = [
	/^Iterator</,
	/^IterableIterator</,
	/^Generator</,
	/^AsyncIterator</,
	/^AsyncGenerator</,
];

// Types that are too generic to determine primordial usage
const UNKNOWN_TYPE_PATTERNS = /** @type {const} */ ([
	/^any$/,
	/^unknown$/,
	/^never$/,
	/^void$/,
	/^undefined$/,
	/^null$/,
	/^object$/i,
	/^\{\s*\}$/, // empty object type
]);

/**
 * Whether a type string is too generic to determine primordial usage.
 * @param {string | null | undefined} typeStr - The type's string form
 * @returns {boolean}
 */
function isUnknownType(typeStr) {
	if (!typeStr) {
		return true;
	}
	for (const pattern of UNKNOWN_TYPE_PATTERNS) {
		if (pattern.test(typeStr)) {
			return true;
		}
	}
	return false;
}

/**
 * Determine whether a type string indicates an array, iterator, or something else.
 * @param {string | null | undefined} typeStr - The type's string form
 * @returns {'array' | 'iterator' | 'other' | null} null when the type is unknown/any
 */
function isArrayOrIterType(typeStr) {
	if (isUnknownType(typeStr)) {
		return null;
	}
	const str = /** @type {string} */ (typeStr);
	for (const pattern of ARRAY_PATTERNS) {
		if (pattern.test(str)) {
			return 'array';
		}
	}
	for (const pattern of ITERATOR_PATTERNS) {
		if (pattern.test(str)) {
			return 'iterator';
		}
	}
	// If we have a concrete type that's not array/iterator, it's something else - don't flag it
	return 'other';
}

/**
 * Whether a type string names a known primordial type (arrays, iterators, typed arrays).
 * @param {string | null | undefined} typeStr - The type's string form
 * @returns {'Array' | 'Iterator' | false | null} null when unknown, false when known but not primordial
 */
function isKnownPrimordialType(typeStr) {
	if (isUnknownType(typeStr)) {
		return null; // Can't determine
	}

	const str = /** @type {string} */ (typeStr);
	// Check for Array types
	for (const pattern of ARRAY_PATTERNS) {
		if (pattern.test(str)) {
			return 'Array';
		}
	}

	// Check for Iterator types
	for (const pattern of ITERATOR_PATTERNS) {
		if (pattern.test(str)) {
			return 'Iterator';
		}
	}

	// We have a concrete type that's not a known primordial - it's something else
	return false;
}

/**
 * Whether a member expression accesses a primordial prototype, e.g. `Array.prototype.push`.
 * Only ever called on a MemberExpression.
 * @param {ASTNode} node - The MemberExpression
 * @returns {{ globalName: string, methodName: (string | null), type: 'prototype' } | null}
 */
function isProtoAccess(node) {
	if (
		node.object.type === 'MemberExpression'
		&& node.object.property.type === 'Identifier'
		&& node.object.property.name === 'prototype'
		&& node.object.object.type === 'Identifier'
		&& allGlobals.has(node.object.object.name)
	) {
		const globalName = node.object.object.name;
		const methodName = node.property.type === 'Identifier' ? node.property.name : null;
		return {
			globalName,
			methodName,
			type: 'prototype',
		};
	}
	return null;
}

/**
 * Whether a member expression is a primordial static method or property access,
 * e.g. `Object.keys`. Only ever called on a MemberExpression.
 * @param {ASTNode} node - The MemberExpression
 * @returns {{ category: string, globalName: string, methodName: string, type: ('static' | 'staticProperty') } | null}
 */
function isStaticAccess(node) {
	if (
		node.object.type === 'Identifier'
		&& allGlobals.has(node.object.name)
		&& node.property.type === 'Identifier'
	) {
		const globalName = node.object.name;
		const methodName = node.property.name;
		const category = globalToCategory.get(globalName);
		const prim = category && /** @type {{ staticMethods: string[], staticProperties?: string[] } | undefined} */ (
			primordials[/** @type {keyof typeof primordials} */ (category)]
		);
		if (category && prim) {
			if (prim.staticMethods.includes(methodName)) {
				return {
					category,
					globalName,
					methodName,
					type: 'static',
				};
			}
			if (prim.staticProperties?.includes(methodName)) {
				return {
					category,
					globalName,
					methodName,
					type: 'staticProperty',
				};
			}
		}
	}
	return null;
}

const JSX_EXTS = new Set([
	'.jsx',
	'.tsx',
]);

// Globals that are constant values and safe to use directly
const SAFE_GLOBALS = new Set(['NaN', 'Infinity']);

/**
 * Whether an identifier is in a non-reference position (a declaration, a property key, etc.).
 * @param {ASTNode} node - The identifier
 * @param {MaybeNode} parent - Its parent
 * @returns {boolean}
 */
function isNonReferencePosition(node, parent) {
	if (parent?.type === 'MemberExpression' && parent.property === node && !parent.computed) {
		return true;
	}
	if (parent?.type === 'Property' && parent.key === node && !parent.computed) {
		return true;
	}
	// Function declaration/expression names and variable declarator ids are declarations
	const isNameDecl = parent?.type === 'FunctionDeclaration'
		|| parent?.type === 'FunctionExpression'
		|| parent?.type === 'VariableDeclarator'
		|| parent?.type === 'ClassDeclaration'
		|| parent?.type === 'ClassExpression';
	if (isNameDecl && parent.id === node) {
		return true;
	}
	const isFnParent = parent?.type === 'FunctionDeclaration'
		|| parent?.type === 'FunctionExpression'
		|| parent?.type === 'ArrowFunctionExpression';
	if (isFnParent && parent.params?.includes(node)) {
		return true;
	}
	return false;
}

/**
 * Whether a global identifier is safe to use directly.
 * @param {ASTNode} node - The global identifier
 * @param {MaybeNode} parent - Its parent
 * @returns {boolean}
 */
function isSafeGlobalUsage(node, parent) {
	// `void undefined` is safe - void always returns undefined regardless of its argument
	if (node.name === 'undefined' && parent?.type === 'UnaryExpression' && parent.operator === 'void') {
		return true;
	}
	// NaN and Infinity are constant values that can't be meaningfully modified
	if (SAFE_GLOBALS.has(node.name)) {
		return true;
	}
	return false;
}

/**
 * Collect the names a binding pattern declares (handles destructuring).
 * @param {ASTNode} pattern - The pattern node
 * @param {Set<string>} names - Accumulator the found names are added to
 * @returns {void}
 */
function getNamesFromPattern(pattern, names) {
	if (pattern.type === 'Identifier') {
		names.add(pattern.name);
	} else if (pattern.type === 'ObjectPattern') {
		for (const prop of pattern.properties) {
			if (prop.type === 'RestElement') {
				getNamesFromPattern(prop.argument, names);
			} else {
				getNamesFromPattern(/** @type {ASTNode} */ (prop.value), names);
			}
		}
	} else if (pattern.type === 'ArrayPattern') {
		for (const elem of pattern.elements) {
			if (elem) {
				if (elem.type === 'RestElement') {
					getNamesFromPattern(elem.argument, names);
				} else {
					getNamesFromPattern(elem, names);
				}
			}
		}
	} else if (pattern.type === 'AssignmentPattern') {
		getNamesFromPattern(pattern.left, names);
	} else if (pattern.type === 'RestElement') {
		getNamesFromPattern(pattern.argument, names);
	}
}

/**
 * Whether a variable declaration list declares a name.
 * @param {ASTNode[]} declarations - The declarators
 * @param {string} name - The name to look for
 * @returns {boolean}
 */
function varDeclListDeclaresName(declarations, name) {
	for (const decl of declarations) {
		/** @type {Set<string>} */
		const declNames = new Set();
		getNamesFromPattern(decl.id, declNames);
		if (declNames.has(name)) {
			return true;
		}
	}
	return false;
}

/**
 * Whether a function's parameters include a name.
 * @param {ASTNode[]} params - The parameter patterns
 * @param {string} name - The name to look for
 * @returns {boolean}
 */
function functionParamDeclaresName(params, name) {
	/** @type {Set<string>} */
	const paramNames = new Set();
	for (const param of params) {
		getNamesFromPattern(param, paramNames);
	}
	return paramNames.has(name);
}

/**
 * Whether a statement declares a name (variable, function, class, or import).
 * @param {ASTNode} stmt - The statement
 * @param {string} name - The name to look for
 * @returns {boolean}
 */
function statementDeclaresName(stmt, name) {
	if (stmt.type === 'VariableDeclaration') {
		return varDeclListDeclaresName(stmt.declarations, name);
	}
	if (stmt.type === 'FunctionDeclaration' && stmt.id?.name === name) {
		return true;
	}
	if (stmt.type === 'ClassDeclaration' && stmt.id?.name === name) {
		return true;
	}
	if (stmt.type === 'ImportDeclaration') {
		for (const spec of stmt.specifiers) {
			if (spec.local?.name === name) {
				return true;
			}
		}
	}
	return false;
}

/**
 * Whether a block or program body declares a name.
 * @param {ASTNode[]} body - The statement list
 * @param {string} name - The name to look for
 * @returns {boolean}
 */
function blockDeclaresName(body, name) {
	for (const stmt of body) {
		if (statementDeclaresName(stmt, name)) {
			return true;
		}
	}
	return false;
}

/**
 * Whether a name is shadowed by any declaration in the scope chain.
 * @param {string} name - The name to look for
 * @param {ASTNode[]} ancestors - The node's ancestors, nearest last
 * @returns {boolean}
 */
function isShadowedInScope(name, ancestors) {
	// Walk through ancestors looking for declarations that shadow this name
	for (const ancestor of ancestors) {
		const { type } = ancestor;

		// Check function parameters
		const isFnType = type === 'FunctionDeclaration'
			|| type === 'FunctionExpression'
			|| type === 'ArrowFunctionExpression';
		if (isFnType && functionParamDeclaresName(ancestor.params, name)) {
			return true;
		}

		// Check variable declarations in block/program body
		if ((type === 'BlockStatement' || type === 'Program') && blockDeclaresName(/** @type {ASTNode[]} */ (ancestor.body), name)) {
			return true;
		}

		// Check catch clause parameter
		if (type === 'CatchClause' && ancestor.param) {
			/** @type {Set<string>} */
			const catchNames = new Set();
			getNamesFromPattern(ancestor.param, catchNames);
			if (catchNames.has(name)) {
				return true;
			}
		}

		// Check for-in/for-of variable
		const isForEach = type === 'ForInStatement' || type === 'ForOfStatement';
		if (isForEach && ancestor.left?.type === 'VariableDeclaration') {
			if (varDeclListDeclaresName(ancestor.left.declarations, name)) {
				return true;
			}
		}

		// Check for loop variable
		if (type === 'ForStatement' && ancestor.init?.type === 'VariableDeclaration') {
			if (varDeclListDeclaresName(ancestor.init.declarations, name)) {
				return true;
			}
		}
	}

	return false;
}

const PLUGIN_PREFIX = 'find-primordials/';
const ALL_RULES = new Set([
	'no-globals',
	'no-instance-methods',
	'no-spread-syntax',
	'no-static-methods',
]);

const FINDING_TYPE_TO_RULE = {
	global: 'no-globals',
	instanceMethod: 'no-instance-methods',
	prototypeAccess: 'no-instance-methods',
	spread: 'no-spread-syntax',
	staticMethod: 'no-static-methods',
	staticProperty: 'no-static-methods',
};

// eslint-disable-next-line prefer-named-capture-group
const DISABLE_NEXT_LINE_REGEX = (/^eslint-disable-next-line(?:\s+(.*))?$/);
// eslint-disable-next-line prefer-named-capture-group
const DISABLE_LINE_REGEX = (/^eslint-disable-line(?:\s+(.*))?$/);
// eslint-disable-next-line prefer-named-capture-group
const DISABLE_REGEX = (/^eslint-disable(?:\s+(.*))?$/);
// eslint-disable-next-line prefer-named-capture-group
const ENABLE_REGEX = (/^eslint-enable(?:\s+(.*))?$/);

/**
 * Parse rule names from an ESLint directive.
 * @param {string | undefined} rulesStr - Comma-separated rule names
 * @returns {Set<string> | null} The named rules, or null to mean all rules
 */
function parseDirectiveRules(rulesStr) {
	if (!rulesStr || rulesStr.trim() === '') {
		return null; // Disable all
	}
	/** @type {Set<string>} */
	const rules = new Set();
	for (const rule of rulesStr.split(',')) {
		const trimmed = rule.trim();
		if (trimmed.startsWith(PLUGIN_PREFIX)) {
			rules.add(trimmed.slice(PLUGIN_PREFIX.length));
		} else if (ALL_RULES.has(trimmed)) {
			rules.add(trimmed);
		}
	}
	return rules.size > 0 ? rules : null;
}

/**
 * Record a line-specific disable.
 * @param {Map<number, Set<string> | null>} map - Line number to its disabled rules (null means all)
 * @param {number} line - The line to disable on
 * @param {Set<string> | null} rules - The rules to disable, or null for all
 * @returns {void}
 */
function addLineDisable(map, line, rules) {
	if (!map.has(line)) {
		map.set(line, rules);
	} else if (rules === null) {
		map.set(line, null); // Disable all overrides specific rules
	} else {
		const existing = map.get(line);
		if (existing) {
			for (const r of rules) {
				existing.add(r);
			}
		}
	}
}

/**
 * Close open disable ranges that an `eslint-enable` for specific rules matches.
 * @param {Set<string>} rules - The rules being re-enabled
 * @param {number} endLine - The line the enable sits on
 * @param {DisableRange[]} disabledRanges - The open ranges, mutated in place
 * @returns {void}
 */
function closeMatchingRanges(rules, endLine, disabledRanges) {
	for (const range of disabledRanges) {
		if (range.end === Infinity && range.rules !== null) {
			let allMatch = true;
			for (const r of rules) {
				if (!range.rules.has(r)) {
					allMatch = false;
				}
			}
			if (allMatch) {
				range.end = endLine;
			}
		}
	}
}

/**
 * Fold a single ESLint disable/enable comment into the running disable state.
 * @param {ASTNode} comment - The comment node
 * @param {Map<number, Set<string> | null>} disabledLines - Line-specific disables, mutated
 * @param {DisableRange[]} disabledRanges - Open/closed ranges, mutated
 * @param {number | null} disableAllStart - Start line of an open disable-all, or null
 * @returns {number | null} The updated disable-all start line
 */
function processDisableComment(comment, disabledLines, disabledRanges, disableAllStart) {
	const text = /** @type {string} */ (comment.value).trim();

	const nextLineMatch = DISABLE_NEXT_LINE_REGEX.exec(text);
	if (nextLineMatch) {
		const rules = parseDirectiveRules(nextLineMatch[1]);
		const targetLine = comment.loc.end.line + 1; // eslint-disable-line no-magic-numbers
		addLineDisable(disabledLines, targetLine, rules);
		return disableAllStart;
	}

	const sameLineMatch = DISABLE_LINE_REGEX.exec(text);
	if (sameLineMatch) {
		const rules = parseDirectiveRules(sameLineMatch[1]);
		addLineDisable(disabledLines, comment.loc.start.line, rules);
		return disableAllStart;
	}

	const disableMatch = DISABLE_REGEX.exec(text);
	if (disableMatch) {
		const rules = parseDirectiveRules(disableMatch[1]);
		if (rules === null) {
			return comment.loc.end.line;
		}
		// eslint-disable-next-line no-param-reassign -- appending to the accumulator is the point; `push` is what this repo avoids
		disabledRanges[disabledRanges.length] = {
			end: Infinity,
			rules,
			start: comment.loc.end.line,
		};
		return disableAllStart;
	}

	const enableMatch = ENABLE_REGEX.exec(text);
	if (enableMatch) {
		const rules = parseDirectiveRules(enableMatch[1]);
		if (rules === null && disableAllStart !== null) {
			// eslint-disable-next-line no-param-reassign -- appending to the accumulator is the point; `push` is what this repo avoids
			disabledRanges[disabledRanges.length] = {
				end: comment.loc.start.line,
				rules: null,
				start: disableAllStart,
			};
			return null;
		}
		if (rules !== null) {
			closeMatchingRanges(rules, comment.loc.start.line, disabledRanges);
		}
	}

	return disableAllStart;
}

/**
 * Parse all ESLint disable directives out of a file's comments.
 * @param {ASTNode[]} comments - The comment nodes from the AST
 * @returns {DisableState}
 */
function parseDisableDirectives(comments) {
	/** @type {Map<number, Set<string> | null>} */
	const disabledLines = new Map();
	/** @type {number | null} */
	let disableAllStart = null;
	/** @type {DisableRange[]} */
	const disabledRanges = [];

	for (const comment of comments) {
		disableAllStart = processDisableComment(comment, disabledLines, disabledRanges, disableAllStart);
	}

	// If disable-all is still open, extend to end of file
	if (disableAllStart !== null) {
		disabledRanges[disabledRanges.length] = {
			end: Infinity,
			rules: null,
			start: disableAllStart,
		};
	}

	return { disabledLines, disabledRanges };
}

/**
 * Whether a finding's rule is disabled at a given line.
 * @param {DisableState} state - The parsed disable state
 * @param {number} line - The line to check
 * @param {string} ruleType - The finding type (global, instanceMethod, etc.)
 * @returns {boolean}
 */
function isLineDisabled(state, line, ruleType) {
	const { disabledLines, disabledRanges } = state;
	const ruleName = FINDING_TYPE_TO_RULE[/** @type {keyof typeof FINDING_TYPE_TO_RULE} */ (ruleType)];

	// Check line-specific disables
	if (disabledLines.has(line)) {
		const rules = disabledLines.get(line);
		if (rules === null) {
			return true;
		} // All rules disabled
		if (ruleName && rules?.has(ruleName)) {
			return true;
		}
	}
	// Check range disables
	for (const range of disabledRanges) {
		if (line >= range.start && line <= range.end) {
			if (range.rules === null) {
				return true;
			}
			if (ruleName && range.rules.has(ruleName)) {
				return true;
			}
		}
	}
	return false;
}

/**
 * Analyze a single file for primordial usage.
 * @param {string} filePath - The file to analyze
 * @param {AnalyzeOptions} [options] - What to include and how to resolve types
 * @returns {{ error: (string | null), findings: Finding[] }}
 */
export function analyzeFile(filePath, options = {}) {
	const {
		includeGlobals = false,
		includeSpread = false,
		includeStatic = false,
		includeUncertain = true,
		isSafe = false,
		parserServices = null,
		typeProgramFactory = createTypeProgram,
	} = options;

	/** @type {Finding[]} */
	const findings = [];

	// Safe files (bin entry points, test files) have no findings
	if (isSafe) {
		return { error: null, findings };
	}

	// Skip TypeScript declaration files - they're just type definitions with no runtime code
	const lowerPath = filePath.toLowerCase();
	if (lowerPath.endsWith('.d.ts') || lowerPath.endsWith('.d.mts') || lowerPath.endsWith('.d.cts')) {
		return { error: null, findings };
	}

	const ext = path.extname(filePath).toLowerCase();
	const isJSX = JSX_EXTS.has(ext);

	/** @type {string} */
	let sourceCode;
	try {
		sourceCode = fs.readFileSync(filePath, 'utf8');
	} catch {
		return { error: `Could not read file: ${filePath}`, findings };
	}

	/** @type {ASTNode} */
	let ast;
	try {
		ast = /** @type {ASTNode} */ (/** @type {unknown} */ (parse(sourceCode, {
			comment: true,
			ecmaFeatures: { jsx: isJSX },
			ecmaVersion: 'latest',
			loc: true,
			range: true,
			sourceType: 'module',
		})));
	} catch (parseError) {
		// the parser always throws an Error
		return { error: `Parse error: ${/** @type {Error} */ (parseError).message}`, findings };
	}

	// Parse ESLint disable directives from comments
	const disableState = parseDisableDirectives(ast.comments);

	/**
	 * Whether a finding's rule is disabled at a line.
	 * @param {number} line - The line
	 * @param {string} ruleType - The finding type
	 * @returns {boolean}
	 */
	function isRuleDisabled(line, ruleType) {
		return isLineDisabled(disableState, line, ruleType);
	}

	// Lazy TypeScript initialization - only create when actually needed for type checking
	/** @type {TypeChecker | null} */
	let tsTypeChecker = null;
	/** @type {SourceFile | null} */
	let tsSourceFile = null;
	let tsInitialized = false;

	/**
	 * Initialize the TypeScript type checker lazily.
	 * @returns {void}
	 */
	function initTypeChecker() {
		if (tsInitialized) {
			return;
		}
		tsInitialized = true;

		if (parserServices?.program) {
			// Use ESLint parser services if available
			tsTypeChecker = /** @type {TypeChecker} */ (/** @type {unknown} */ (parserServices));
		} else {
			// Create standalone TypeScript program for type inference (including JSDoc)
			try {
				const tsProgram = typeProgramFactory(filePath, sourceCode);
				tsTypeChecker = tsProgram.typeChecker;
				tsSourceFile = tsProgram.sourceFile ?? null;
			} catch {
				// Type checking not available
			}
		}
	}

	/**
	 * Get the type of a node, initializing TypeScript lazily.
	 * @param {ASTNode} node - The node to type
	 * @returns {string | null}
	 */
	function getNodeType(node) {
		initTypeChecker();
		if (parserServices?.program) {
			return getTypeFromServices(node, parserServices);
		}
		return getTypeAtPosition(tsTypeChecker, tsSourceFile, node.range[0]);
	}

	/**
	 * Record a finding, honoring ESLint disable directives. Uncertain findings are already
	 * filtered upstream when `includeUncertain` is false, so they never reach here.
	 * @param {Omit<Finding, 'file'> & { line: number }} info - The finding, without its `file`
	 * @returns {void}
	 */
	function addFinding(info) {
		if (isRuleDisabled(info.line, info.type)) {
			return;
		}
		findings[findings.length] = { file: filePath, ...info };
	}

	/**
	 * Handle an identifier node, reporting global primordial usage.
	 * @param {ASTNode} node - The identifier
	 * @param {ASTNode[]} ancestors - Its ancestors, nearest last
	 * @returns {void}
	 */
	function handleIdentifier(node, ancestors) {
		if (!includeGlobals) {
			return;
		}
		const parent = ancestors[ancestors.length - 1]; // eslint-disable-line no-magic-numbers
		if (isNonReferencePosition(node, parent)) {
			return;
		}
		if (isSafeGlobalUsage(node, parent)) {
			return;
		}
		if (!allGlobals.has(node.name)) {
			return;
		}
		// Skip if the name is shadowed by a local declaration
		if (isShadowedInScope(node.name, ancestors)) {
			return;
		}
		const isModuleLevel = isModuleLevelScope(ancestors);
		if (isModuleLevel && isBeingCached(node, parent)) {
			return;
		}
		addFinding({
			category: globalToCategory.get(node.name),
			certainty: CERTAINTY_CERTAIN,
			column: node.loc.start.column + 1, // eslint-disable-line no-magic-numbers
			line: node.loc.start.line,
			name: node.name,
			type: 'global',
		});
	}

	/**
	 * Determine the certainty and category for an instance-method access.
	 * @param {ASTNode} node - The MemberExpression
	 * @param {string[]} categories - The primordial categories the method name belongs to
	 * @param {boolean} isAmbiguous - Whether the name maps to more than one category
	 * @returns {{ category: (string | null), certainty: string, typed: boolean } | null}
	 */
	function getInstanceMethodInfo(node, categories, isAmbiguous) {
		const detectedCategory = categories.length === 1 ? categories[0] : null; // eslint-disable-line no-magic-numbers

		// Fast path: array literals are always certain
		if (node.object.type === 'ArrayExpression') {
			return {
				category: 'Array',
				certainty: CERTAINTY_CERTAIN,
				typed: true,
			};
		}

		if (isAmbiguous && includeUncertain) {
			// Only do expensive type checking for ambiguous methods when we need uncertain results
			const typeStr = getNodeType(node.object);
			const typeKind = typeStr ? isArrayOrIterType(typeStr) : null;
			if (typeKind === 'array' && categories.includes('Array')) {
				return {
					category: 'Array',
					certainty: CERTAINTY_CERTAIN,
					typed: true,
				};
			}
			// every ambiguous iterator method also belongs to Iterator, so that is the category
			if (typeKind === 'iterator' && categories.includes('Iterator')) {
				return {
					category: 'Iterator',
					certainty: CERTAINTY_CERTAIN,
					typed: true,
				};
			}
			if (typeKind === 'other') {
				return null; // Skip - not a primordial type
			}
			// Type unknown, keep as uncertain
			return {
				category: detectedCategory,
				certainty: CERTAINTY_UNCERTAIN,
				typed: false,
			};
		} else if (isAmbiguous) {
			// Skip ambiguous methods when --no-uncertain is set
			return null;
		}

		/*
		 * Non-ambiguous method - only one possible primordial category.
		 * Check if type is a known non-primordial.
		 */
		const typeStr = getNodeType(node.object);
		const primordialType = isKnownPrimordialType(typeStr);
		if (primordialType === false) {
			// Type is known and not a primordial - skip (e.g., CharSet.test() is not RegExp.test())
			return null;
		}
		/*
		 * Only one category can own this name, so a call to it is a call to that primordial.
		 * That is a claim about the name, not about the object, which is why `typed` says
		 * where the certainty came from.
		 */
		return {
			category: detectedCategory,
			certainty: CERTAINTY_CERTAIN,
			typed: !!primordialType,
		};
	}

	/**
	 * Handle a member expression, reporting prototype access, static methods, and
	 * instance methods.
	 * @param {ASTNode} node - The MemberExpression
	 * @param {ASTNode[]} ancestors - Its ancestors, nearest last
	 * @returns {void}
	 */
	function handleMemberExpr(node, ancestors) {
		const parent = ancestors[ancestors.length - 1]; // eslint-disable-line no-magic-numbers

		// Skip if this is the left side of an assignment (property being set, not read)
		if (parent?.type === 'AssignmentExpression' && parent.left === node) {
			return;
		}

		const isModuleLevel = isModuleLevelScope(ancestors);

		const protoAccess = isProtoAccess(node);
		if (protoAccess) {
			if (isShadowedInScope(protoAccess.globalName, ancestors)) {
				return;
			}
			if (isModuleLevel && isBeingCached(node, parent)) {
				return;
			}
			addFinding({
				category: globalToCategory.get(protoAccess.globalName),
				certainty: CERTAINTY_CERTAIN,
				column: node.loc.start.column + 1, // eslint-disable-line no-magic-numbers
				line: node.loc.start.line,
				name: `${protoAccess.globalName}.prototype.${protoAccess.methodName}`,
				type: 'prototypeAccess',
			});
			return;
		}

		if (includeStatic) {
			const staticAcc = isStaticAccess(node);
			if (staticAcc) {
				if (isShadowedInScope(staticAcc.globalName, ancestors)) {
					return;
				}
				if (isModuleLevel && isBeingCached(node, parent)) {
					return;
				}
				addFinding({
					category: staticAcc.category,
					certainty: CERTAINTY_CERTAIN,
					column: node.loc.start.column + 1, // eslint-disable-line no-magic-numbers
					line: node.loc.start.line,
					name: `${staticAcc.globalName}.${staticAcc.methodName}`,
					type: staticAcc.type === 'staticProperty' ? 'staticProperty' : 'staticMethod',
				});
				return;
			}
		}

		if (node.property.type !== 'Identifier') {
			return;
		}
		const methodName = node.property.name;
		if (!allInstanceMethods.has(methodName)) {
			return;
		}
		if (CALL_APPLY_BIND.has(methodName) && !isModuleLevel && node.object.type === 'Identifier') {
			return;
		}
		const categories = /** @type {string[]} */ (allInstanceMethods.get(methodName));
		const isAmbiguous = ambiguousInstanceMethods.has(methodName);
		const methodInfo = getInstanceMethodInfo(node, categories, isAmbiguous);
		if (!methodInfo) {
			return;
		}

		/*
		 * Reading `row.test` without calling it says nothing on its own: plenty of objects
		 * carry a data property that happens to be named after a method. A call at least
		 * reaches something callable, but a bare read needs the object's type to say it is
		 * a primordial - the name alone cannot.
		 */
		if (!isCalled(node, parent) && !methodInfo.typed) {
			return;
		}

		if (isModuleLevel) {
			return;
		}

		addFinding({
			category: methodInfo.category,
			certainty: methodInfo.certainty,
			column: node.loc.start.column + 1, // eslint-disable-line no-magic-numbers
			line: node.loc.start.line,
			name: methodName,
			possibleCategories: isAmbiguous ? categories : void undefined,
			type: 'instanceMethod',
		});
	}

	/**
	 * Handle a spread element, reporting spread syntax.
	 * @param {ASTNode} node - The SpreadElement
	 * @param {ASTNode[]} ancestors - Its ancestors, nearest last
	 * @returns {void}
	 */
	function handleSpread(node, ancestors) {
		if (!includeSpread) {
			return;
		}
		if (isModuleLevelScope(ancestors)) {
			return;
		}
		addFinding({
			category: 'syntax',
			certainty: CERTAINTY_CERTAIN,
			column: node.loc.start.column + 1, // eslint-disable-line no-magic-numbers
			line: node.loc.start.line,
			name: 'spread',
			type: 'spread',
		});
	}

	/** @type {Record<string, (node: ASTNode, ancestors: ASTNode[]) => void>} */
	const visitors = {
		Identifier: handleIdentifier,
		MemberExpression: handleMemberExpr,
		SpreadElement: handleSpread,
	};

	traverse(ast).forEach(/** @this {{ parents: TraverseNode[] }} @param {unknown} value */ function (value) {
		if (value && typeof value === 'object' && /** @type {ASTNode} */ (value).type) {
			const node = /** @type {ASTNode} */ (value);
			const handler = visitors[node.type];
			if (handler) {
				// Filter parents to only include AST nodes (objects with 'type' property)
				const ancestors = this.parents.filter((p) => p && typeof p === 'object' && p.node && p.node.type).map((p) => p.node);
				handler(node, ancestors);
			}
		}
	});

	return { error: null, findings };
}

/**
 * Analyze many files sequentially.
 * @param {string[]} filePaths - The files to analyze
 * @param {AnalyzeOptions} [options] - What to include and how to resolve types
 * @returns {AnalysisResult}
 */
export function analyzeFiles(filePaths, options = {}) {
	const { isSafeFile: checkSafe, ...fileOptions } = options;
	/** @type {Finding[]} */
	const allFindings = [];
	/** @type {AnalysisError[]} */
	const errors = [];
	for (const filePath of filePaths) {
		const isSafe = typeof checkSafe === 'function' ? checkSafe(filePath) : false;
		const result = analyzeFile(filePath, { ...fileOptions, isSafe });
		if (result.error) {
			errors[errors.length] = { error: result.error, file: filePath };
		}
		allFindings.push(...result.findings);
	}
	return { errors, findings: allFindings };
}

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const WORKER_PATH = path.join(__dirname, 'worker.mjs');

/**
 * Analyze many files in parallel using a pool of worker threads, falling back to
 * sequential analysis for small batches.
 * @param {string[]} filePaths - The files to analyze
 * @param {AnalyzeOptions} [options] - What to include and how to resolve types
 * @returns {Promise<AnalysisResult>}
 */
export async function analyzeFilesParallel(filePaths, options = {}) {
	const {
		concurrency = os.cpus().length,
		isSafeFile: checkSafe,
		workerPath = WORKER_PATH,
		...fileOptions
	} = options;

	// For small number of files, use sequential processing
	if (filePaths.length <= concurrency) {
		return analyzeFiles(filePaths, options);
	}

	/** @type {Finding[]} */
	const allFindings = [];
	/** @type {AnalysisError[]} */
	const errors = [];
	let fileIndex = 0;

	/**
	 * Fold a worker's result into the running totals.
	 * @param {string} filePath - The analyzed file
	 * @param {{ error: (string | null), findings: Finding[] }} result - Its result
	 * @returns {void}
	 */
	function handleResult(filePath, result) {
		if (result.error) {
			errors[errors.length] = { error: result.error, file: filePath };
		}
		allFindings.push(...result.findings);
	}

	/**
	 * Create a worker that drains the shared file queue.
	 * @returns {Promise<void>}
	 */
	function createWorker() {
		return /** @type {Promise<void>} */ (new Promise((resolve, reject) => {
			const worker = new Worker(workerPath);
			let tasksCompleted = 0;
			let tasksSent = 0;

			/** @returns {void} */
			function sendNextTask() {
				if (fileIndex >= filePaths.length) {
					if (tasksCompleted === tasksSent) {
						worker.terminate();
						resolve();
					}
					return;
				}

				const filePath = filePaths[fileIndex];
				fileIndex += 1;
				tasksSent += 1;

				const isSafe = typeof checkSafe === 'function' ? checkSafe(filePath) : false;
				worker.postMessage({
					filePath,
					options: { ...fileOptions, isSafe },
				});
			}

			worker.on('message', (message) => {
				const { filePath, result } = message;
				handleResult(filePath, result);
				tasksCompleted += 1;
				sendNextTask();
			});

			worker.on('error', (err) => {
				worker.terminate();
				reject(err);
			});

			worker.on('exit', (code) => {
				if (code !== 0 && tasksCompleted !== tasksSent) {
					reject(new Error(`Worker exited with code ${code}`));
				}
			});

			// Start the worker with first task
			sendNextTask();
		}));
	}

	// Create worker pool
	const numWorkers = Math.min(concurrency, filePaths.length);
	const workers = [];
	for (let i = 0; i < numWorkers; i += 1) {
		workers[workers.length] = createWorker();
	}

	await Promise.all(workers);

	return { errors, findings: allFindings };
}

/**
 * The display label for a finding's category: its category, its joined possible categories,
 * or "unknown" when neither is present.
 * @param {Finding} finding - The finding
 * @returns {string}
 */
export function categoryLabel(finding) {
	return finding.category || (finding.possibleCategories ? finding.possibleCategories.join('/') : 'unknown');
}

/**
 * Group findings by their category.
 * @param {Finding[]} findings - The findings to group
 * @returns {Record<string, Finding[]>}
 */
export function groupByCategory(findings) {
	/** @type {Record<string, Finding[]>} */
	const grouped = {};
	for (const finding of findings) {
		const category = categoryLabel(finding);
		if (!grouped[category]) {
			grouped[category] = [];
		}
		grouped[category][grouped[category].length] = finding;
	}
	return grouped;
}

/** @type {Record<string, (f: Finding) => string>} */
const FINDING_DESCRIPTIONS = {
	global: (f) => `${f.name}`,
	instanceMethod: (f) => `.${f.name}()`,
	prototypeAccess: (f) => `${f.name}`,
	spread: () => 'spread syntax (...)',
	staticMethod: (f) => `${f.name}()`,
	staticProperty: (f) => `${f.name}`,
};

/**
 * Format a single finding as a TAP test line.
 * @param {Finding} finding - The finding
 * @param {number} testNum - Its 1-based test number
 * @returns {string}
 */
export function formatFindingAsTAP(finding, testNum) {
	const certaintyNote = finding.certainty === CERTAINTY_UNCERTAIN
		? ' [uncertain - could not determine type]'
		: '';
	const location = `${finding.file}:${finding.line}:${finding.column}`;
	const descFn = FINDING_DESCRIPTIONS[finding.type] || ((f) => f.name);
	const description = descFn(finding);
	return `not ok ${testNum} - ${location} - ${description}${certaintyNote}`;
}

/**
 * Format findings as a complete TAP report.
 * @param {Finding[]} findings - The findings
 * @param {{ showUncertain?: boolean }} [options] - Whether to include uncertain findings
 * @returns {string}
 */
export function formatAsTAP(findings, options = {}) {
	const { showUncertain = true } = options;
	const filtered = showUncertain
		? findings
		: findings.filter((f) => f.certainty !== CERTAINTY_UNCERTAIN);

	if (filtered.length === 0) {
		return 'TAP version 14\n1..0\n# No primordial usages found\n';
	}

	const grouped = groupByCategory(filtered);
	const lines = ['TAP version 14'];
	let testNum = 0;
	let certainCount = 0;
	let uncertainCount = 0;

	for (const [category, categoryFindings] of Object.entries(grouped).sort()) {
		lines[lines.length] = `# ${category}`;
		for (const finding of categoryFindings) {
			testNum += 1; // eslint-disable-line no-magic-numbers
			if (finding.certainty === CERTAINTY_CERTAIN) {
				certainCount += 1; // eslint-disable-line no-magic-numbers
			} else {
				uncertainCount += 1; // eslint-disable-line no-magic-numbers
			}
			const certaintyNote = finding.certainty === CERTAINTY_UNCERTAIN
				? ' [uncertain - could not determine type]'
				: '';
			const location = `${finding.file}:${finding.line}:${finding.column}`;
			const descFn = FINDING_DESCRIPTIONS[finding.type] || ((f) => f.name);
			const description = descFn(finding);
			lines[lines.length] = `not ok ${testNum} - ${location} - ${description}${certaintyNote}`;
		}
	}

	lines[lines.length] = '';
	lines[lines.length] = `1..${testNum}`;
	lines.push(`# ${testNum} primordial usage${testNum === 1 ? '' : 's'} found`); // eslint-disable-line no-magic-numbers
	if (uncertainCount > 0) {
		lines[lines.length] = `# (${certainCount} certain, ${uncertainCount} uncertain)`;
	}

	return `${lines.join('\n')}\n`;
}

// Re-export for backwards compatibility
export const groupFindingsByCategory = groupByCategory;

/** The kinds of fix this module knows how to apply */
const FIX_KINDS = /** @type {const} */ ([
	'at',
	'constructor',
	'isNaN',
	'push',
	'undefined',
]);

/**
 * A fresh per-kind fix tally, all zero.
 * @returns {Record<FixKind, number>}
 */
function emptyFixCounts() {
	const counts = /** @type {Record<FixKind, number>} */ ({});
	for (const kind of FIX_KINDS) {
		counts[kind] = 0;
	}
	return counts;
}

/**
 * The `line:column` key a node is matched by. Findings record a 1-based column, so node
 * positions are shifted to match.
 * @param {ASTNode} node - The node
 * @returns {string}
 */
function nodeKey(node) {
	return `${node.loc.start.line}:${node.loc.start.column + 1}`; // eslint-disable-line no-magic-numbers
}

/**
 * The source text a node spans.
 * @param {string} content - The file's source
 * @param {ASTNode} node - The node
 * @returns {string}
 */
function sourceText(content, node) {
	return content.slice(node.range[0], node.range[1]); // eslint-disable-line no-magic-numbers
}

/**
 * Whether naming an expression twice yields the same value both times: a variable,
 * `this`, a literal, or a fixed property path off one. A call does not qualify - it
 * would simply run a second time.
 *
 * A property read is taken at face value. Reaching it twice means reaching a getter
 * twice, and a getter that answers differently each time, or counts its reads, will
 * not survive the rewrite - but a getter like that breaks its own contract.
 * @param {MaybeNode} node - The node that would be named twice
 * @returns {boolean}
 */
export function isRepeatable(node) {
	if (!node) {
		return false;
	}
	if (node.type === 'Identifier' || node.type === 'ThisExpression' || node.type === 'Literal') {
		return true;
	}
	// a computed key is an expression of its own, and could be anything
	return node.type === 'MemberExpression' && !node.computed && isRepeatable(node.object);
}

/**
 * Whether evaluating an expression has nothing to observe beyond a well-behaved read.
 * Weaker than `isRepeatable`, which also demands the very same value: a literal built
 * only from such parts qualifies here but not there, since each evaluation builds a new
 * one.
 *
 * This is what a rewrite needs when it evaluates an expression a second time only to
 * read through it (`arr.at(-1)` reads its `length`), or when it keeps the expression
 * but moves when it runs.
 * @param {MaybeNode} node - The node being evaluated
 * @returns {boolean}
 */
export function isReevaluable(node) {
	if (isRepeatable(node)) {
		return true;
	}
	switch (node?.type) {
		case 'MemberExpression':
			return isReevaluable(node.object) && (!node.computed || isReevaluable(node.property));
		case 'ArrayExpression':
			// a spread reads through something arbitrary
			return node.elements.every((el) => el === null || (el.type !== 'SpreadElement' && isReevaluable(el)));
		case 'ObjectExpression':
			// an accessor is a call in waiting, and a spread reads through something arbitrary
			return node.properties.every((p) => p.type === 'Property' && p.kind === 'init' && (!p.computed || isReevaluable(p.key)) && isReevaluable(/** @type {ASTNode} */ (p.value)));
		case 'BinaryExpression':
		case 'LogicalExpression':
			return isReevaluable(node.left) && isReevaluable(node.right);
		case 'ConditionalExpression':
			return isReevaluable(node.test) && isReevaluable(node.consequent) && isReevaluable(node.alternate);
		case 'UnaryExpression':
			// `delete` is the one unary operator that changes something
			return node.operator !== 'delete' && isReevaluable(node.argument);
		case 'TemplateLiteral':
			return node.expressions.every(isReevaluable);
		case 'SequenceExpression':
			return node.expressions.every(isReevaluable);
		default:
			return false;
	}
}

/**
 * The integer an `.at()` argument resolves to, or null if it isn't a plain integer literal.
 * @param {ASTNode} arg - The argument node
 * @returns {number | null}
 */
export function literalIndex(arg) {
	/** @type {unknown} */
	let index = null;
	if (arg.type === 'Literal') {
		index = arg.value;
	} else if (arg.type === 'UnaryExpression' && arg.operator === '-' && arg.argument?.type === 'Literal') {
		index = -(/** @type {number} */ (arg.argument.value));
	}
	// `.at()` truncates toward zero, so only integers survive the rewrite unchanged
	return typeof index === 'number' && Number.isInteger(index) ? index : null;
}

/**
 * Whether `{` in this position would open a block rather than an object literal.
 * @param {ASTNode} node - The node being replaced
 * @param {MaybeNode} parent - Its parent
 * @returns {boolean}
 */
export function startsAStatement(node, parent) {
	if (parent?.type === 'ExpressionStatement') {
		return true;
	}
	return parent?.type === 'ArrowFunctionExpression' && parent.body === node;
}

/**
 * Whether `Array(...args)` has an equivalent array literal. A lone argument sets the
 * length rather than the contents, and a spread can stand for any number of arguments -
 * including that one.
 * @param {ASTNode[]} args - The call's arguments
 * @returns {boolean}
 */
export function canBeArrayLiteral(args) {
	return args.length > 1 && !args.some((arg) => arg.type === 'SpreadElement'); // eslint-disable-line no-magic-numbers
}

/**
 * Whether replacing `node` with `void undefined` needs parens to stay valid.
 * `void undefined ** n` is a syntax error.
 * @param {ASTNode} node - The `undefined` node
 * @param {MaybeNode} parent - Its parent
 * @returns {boolean}
 */
export function voidNeedsParens(node, parent) {
	return parent?.type === 'BinaryExpression' && parent.operator === '**' && parent.left === node;
}

/**
 * Whether an `undefined` in this position can be rewritten at all.
 * `{ undefined }` names the value through the key, so the value has nowhere to be rewritten.
 * @param {MaybeNode} parent - The parent of the `undefined` node
 * @returns {boolean}
 */
export function canRewriteUndefined(parent) {
	if (parent?.type === 'UnaryExpression' && parent.operator === 'void') {
		return false;
	}
	return !(parent?.type === 'Property' && parent.shorthand);
}

/**
 * The fix for a global finding: `undefined` -> `void undefined`, and argument-less
 * `Array`/`Object` construction -> a literal.
 * @param {ASTNode} node - The global identifier
 * @param {MaybeNode} parent - Its parent
 * @param {MaybeNode} grandparent - Its grandparent
 * @param {string} content - The file's source
 * @returns {Fix | null}
 */
function getGlobalFix(node, parent, grandparent, content) {
	if (node.name === 'undefined') {
		if (!canRewriteUndefined(parent)) {
			return null;
		}
		return {
			end: node.range[1], // eslint-disable-line no-magic-numbers
			kind: 'undefined',
			replacement: voidNeedsParens(node, parent) ? '(void undefined)' : 'void undefined',
			start: node.range[0],
		};
	}

	const constructs = (parent?.type === 'NewExpression' || parent?.type === 'CallExpression') && parent.callee === node;
	if (!constructs) {
		return null;
	}

	const args = parent.arguments;
	const range = {
		end: parent.range[1], // eslint-disable-line no-magic-numbers
		kind: /** @type {FixKind} */ ('constructor'),
		start: parent.range[0],
	};

	if (node.name === 'Array') {
		if (args.length === 0) {
			return { ...range, replacement: '[]' };
		}
		if (canBeArrayLiteral(args)) {
			return { ...range, replacement: `[${args.map((arg) => sourceText(content, arg)).join(', ')}]` };
		}
		return null;
	}

	// Object(x) coerces its argument, so only the argument-less form is a plain object literal
	if (node.name === 'Object' && args.length === 0) {
		// where a statement could begin, a bare `{}` would parse as an empty block
		return { ...range, replacement: startsAStatement(parent, grandparent) ? '({})' : '{}' };
	}
	return null;
}

/**
 * The fix for an instance-method finding: `arr.push(x)` -> an index assignment, and
 * `arr.at(i)` -> an index access.
 * @param {ASTNode} node - The MemberExpression
 * @param {Finding} finding - The finding being fixed
 * @param {MaybeNode} parent - The node's parent
 * @param {MaybeNode} grandparent - The node's grandparent
 * @param {string} content - The file's source
 * @returns {Fix | null}
 */
function getInstanceMethodFix(node, finding, parent, grandparent, content) {
	if (finding.certainty !== CERTAINTY_CERTAIN) {
		return null;
	}
	if (parent?.type !== 'CallExpression' || parent.callee !== node) {
		return null;
	}

	const args = parent.arguments;
	const range = {
		end: parent.range[1], // eslint-disable-line no-magic-numbers
		start: parent.range[0],
	};

	if (finding.name === 'push') {
		if (args.length !== 1 || args[0].type === 'SpreadElement') { // eslint-disable-line no-magic-numbers
			return null;
		}
		// a used return value is the new length, which the assignment form does not produce
		if (grandparent?.type !== 'ExpressionStatement') {
			return null;
		}
		// the assignment names the object twice
		if (!isRepeatable(node.object)) {
			return null;
		}
		/*
		 * push evaluates its argument before reading the length, while the assignment
		 * resolves its target - length and all - first. Only an argument with nothing
		 * to observe survives that reordering.
		 */
		if (!isReevaluable(args[0])) {
			return null;
		}
		const objectText = sourceText(content, node.object);
		return {
			...range,
			kind: 'push',
			replacement: `${objectText}[${objectText}.length] = ${sourceText(content, args[0])}`,
		};
	}

	if (finding.name === 'at') {
		if (args.length !== 1) { // eslint-disable-line no-magic-numbers
			return null;
		}
		const index = literalIndex(args[0]);
		if (index === null) {
			return null;
		}
		const objectText = sourceText(content, node.object);
		if (index >= 0) {
			return {
				...range, kind: 'at', replacement: `${objectText}[${index}]`,
			};
		}
		// counting back from the end evaluates the object a second time, to read its length
		if (!isReevaluable(node.object)) {
			return null;
		}
		return {
			...range, kind: 'at', replacement: `${objectText}[${objectText}.length - ${-index}]`,
		};
	}

	return null;
}

/**
 * The fix for a static-method finding: `Number.isNaN(x)` -> `(x !== x)`.
 * @param {ASTNode} node - The MemberExpression
 * @param {Finding} finding - The finding being fixed
 * @param {MaybeNode} parent - The node's parent
 * @param {string} content - The file's source
 * @returns {Fix | null}
 */
function getStaticMethodFix(node, finding, parent, content) {
	if (finding.name !== 'Number.isNaN') {
		return null;
	}
	if (parent?.type !== 'CallExpression' || parent.callee !== node || parent.arguments.length !== 1) { // eslint-disable-line no-magic-numbers
		return null;
	}
	// the comparison names the argument twice
	const arg = parent.arguments[0];
	if (!isRepeatable(arg)) {
		return null;
	}
	const argText = sourceText(content, arg);
	/*
	 * The parens keep the comparison intact wherever the call sat: without them
	 * `!Number.isNaN(x)` would rewrite to `!x !== x`.
	 */
	return {
		end: parent.range[1], // eslint-disable-line no-magic-numbers
		kind: 'isNaN',
		replacement: `(${argText} !== ${argText})`,
		start: parent.range[0],
	};
}

/**
 * The name a static access reads as, so `Number.isNaN.call` cannot pass for `Number.isNaN`.
 * @param {ASTNode} node - The MemberExpression
 * @returns {string | null}
 */
function staticName(node) {
	return node.object?.type === 'Identifier' && node.property?.type === 'Identifier'
		? `${node.object.name}.${node.property.name}`
		: null;
}

/**
 * @typedef {object} FixContext
 * @property {string} content - The file's source
 * @property {MaybeNode} parent - The current node's parent
 * @property {MaybeNode} grandparent - The current node's grandparent
 * @property {Set<string>} kinds - The fix kinds to apply
 */

/**
 * The fix a single finding calls for at this node, if the node is the one it describes.
 * @param {ASTNode} node - The node under consideration
 * @param {Finding} finding - The candidate finding
 * @param {FixContext} ctx - The surrounding context
 * @returns {Fix | null}
 */
function getFixFor(node, finding, ctx) {
	if (finding.type === 'global' && node.type === 'Identifier' && node.name === finding.name) {
		return getGlobalFix(node, ctx.parent, ctx.grandparent, ctx.content);
	}
	if (finding.type === 'instanceMethod' && node.type === 'MemberExpression' && node.property?.name === finding.name) {
		return getInstanceMethodFix(node, finding, ctx.parent, ctx.grandparent, ctx.content);
	}
	if (finding.type === 'staticMethod' && node.type === 'MemberExpression' && staticName(node) === finding.name) {
		return getStaticMethodFix(node, finding, ctx.parent, ctx.content);
	}
	return null;
}

/**
 * The fix called for by the first finding at this position that asks for one.
 * @param {ASTNode} node - The node under consideration
 * @param {Finding[]} candidates - The findings recorded at this position
 * @param {FixContext} ctx - The surrounding context
 * @returns {Fix | null}
 */
function firstFix(node, candidates, ctx) {
	for (const finding of candidates) {
		const fix = getFixFor(node, finding, ctx);
		if (fix && ctx.kinds.has(fix.kind)) {
			return fix;
		}
	}
	return null;
}

/**
 * Collect every fix available for the reported findings.
 * @param {string} content - The file's source
 * @param {ASTNode} ast - The parsed AST
 * @param {Finding[]} findings - The findings to fix
 * @param {Set<string>} kinds - The fix kinds to apply
 * @returns {Fix[]}
 */
function collectFixes(content, ast, findings, kinds) {
	/*
	 * `Number.isNaN` and its `Number` both start where the finding says, so a
	 * position can name several findings and each node has to pick out its own.
	 */
	/** @type {Map<string, Finding[]>} */
	const findingMap = new Map();
	for (const f of findings) {
		const key = `${f.line}:${f.column}`;
		if (!findingMap.has(key)) {
			findingMap.set(key, []);
		}
		findingMap.get(key)?.push(f);
	}

	/** @type {Fix[]} */
	const fixes = [];
	traverse(ast).forEach(/** @this {{ parent?: TraverseNode }} @param {unknown} value */ function (value) {
		if (!value || typeof value !== 'object') {
			return;
		}
		const node = /** @type {ASTNode} */ (value);
		if (typeof node.type !== 'string' || !node.loc) {
			return;
		}

		const candidates = findingMap.get(nodeKey(node));
		if (!candidates) {
			return;
		}

		const fix = firstFix(node, candidates, {
			content,
			grandparent: this.parent?.parent?.node,
			kinds,
			parent: this.parent?.node,
		});
		if (fix) {
			fixes[fixes.length] = fix;
		}
	});
	return fixes;
}

/**
 * Apply the fixes that don't overlap, preferring the outermost of any that do.
 * @param {string} content - The file's source
 * @param {Fix[]} fixes - The candidate fixes
 * @returns {FixResult}
 */
function applyFixList(content, fixes) {
	const ordered = [...fixes].sort((a, b) => a.start - b.start || b.end - a.end);

	const counts = emptyFixCounts();
	/** @type {Fix[]} */
	const kept = [];
	let lastEnd = 0;
	for (const fix of ordered) {
		// an inner fix is dropped here; re-analyzing the output surfaces it again
		if (fix.start >= lastEnd) {
			kept[kept.length] = fix;
			counts[fix.kind] += 1;
			lastEnd = fix.end;
		}
	}

	let output = content;
	for (let i = kept.length - 1; i >= 0; i -= 1) { // eslint-disable-line no-magic-numbers
		output = output.slice(0, kept[i].start) + kept[i].replacement + output.slice(kept[i].end);
	}

	return {
		fixCount: kept.length,
		fixCounts: counts,
		fixed: true,
		output,
	};
}

/**
 * Parse source into an AST, or null if it doesn't parse.
 * @param {string} content - The source to parse
 * @returns {ASTNode | null}
 */
function tryParse(content) {
	try {
		return /** @type {ASTNode} */ (/** @type {unknown} */ (parse(content, {
			ecmaFeatures: { jsx: true },
			ecmaVersion: 'latest',
			loc: true,
			range: true,
			sourceType: 'module',
		})));
	} catch {
		return null;
	}
}

/**
 * Rewrite a file, applying only the requested kinds of fix. Refuses to return a rewrite
 * that no longer parses.
 * @param {string} filePath - The file to rewrite
 * @param {Finding[]} findings - The findings to fix
 * @param {Set<string>} kinds - The fix kinds to apply
 * @returns {FixResult}
 */
function runFixes(filePath, findings, kinds) {
	const content = fs.readFileSync(filePath, 'utf8');
	const unchanged = {
		fixCount: 0,
		fixCounts: emptyFixCounts(),
		fixed: false,
		output: content,
	};

	const fileFindings = findings.filter((f) => f.file === filePath);
	if (fileFindings.length === 0) {
		return unchanged;
	}

	const ast = tryParse(content);
	if (!ast) {
		return unchanged;
	}

	const fixes = collectFixes(content, ast, fileFindings, kinds);
	if (fixes.length === 0) {
		return unchanged;
	}

	const result = applyFixList(content, fixes);
	/*
	 * Every rewrite above is meant to be equivalent, so this should never catch anything.
	 * It is here because the alternative to catching it is writing a broken file.
	 */
	return tryParse(result.output) ? result : unchanged;
}

/**
 * Apply push-to-assignment fixes to a file.
 * @param {string} filePath - Path to the file to fix
 * @param {Finding[]} findings - Findings to fix (filtered to fixable push findings)
 * @returns {FixResult}
 */
export function applyPushFixes(filePath, findings) {
	return runFixes(filePath, findings, new Set(['push']));
}

/**
 * Apply undefined-to-void fixes to a file.
 * @param {string} filePath - Path to the file to fix
 * @param {Finding[]} findings - Findings to fix (filtered to fixable undefined findings)
 * @returns {FixResult}
 */
export function applyUndefinedFixes(filePath, findings) {
	return runFixes(filePath, findings, new Set(['undefined']));
}

/**
 * Apply every available fix to a file, in a single pass.
 * Fixes move the positions the findings recorded, so callers that want the fixes
 * this pass had to drop should re-analyze the output and call again.
 * @param {string} filePath - Path to the file to fix
 * @param {Finding[]} findings - Findings to fix (only reported findings are fixed)
 * @returns {FixResult}
 */
export function applyFixes(filePath, findings) {
	return runFixes(filePath, findings, new Set(FIX_KINDS));
}
