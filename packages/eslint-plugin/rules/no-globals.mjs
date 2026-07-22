
import {
	allGlobals,
	canBeArrayLiteral,
	canRewriteUndefined,
	globalToCategory,
	isBeingCached,
	isModuleLevelScope,
	startsAStatement,
	voidNeedsParens,
} from '#/rules/utils';

/** @typedef {import('#/rules/utils').ASTNode} ASTNode */
/** @typedef {ASTNode | undefined} MaybeNode */
/** @typedef {import('#/rules/utils').RuleContext} RuleContext */
/** @typedef {import('#/rules/utils').RuleFixer} RuleFixer */

/**
 * @param {ASTNode} node - The identifier
 * @param {MaybeNode} parent - Its parent
 * @returns {boolean}
 */
function isPropertyAccess(node, parent) {
	return parent?.type === 'MemberExpression' && parent.property === node && !parent.computed;
}

/**
 * @param {ASTNode} node - The identifier
 * @param {MaybeNode} parent - Its parent
 * @returns {boolean}
 */
function isPropertyKey(node, parent) {
	return parent?.type === 'Property' && parent.key === node && !parent.computed;
}

/**
 * @param {ASTNode} node - The identifier
 * @param {MaybeNode} parent - Its parent
 * @returns {boolean}
 */
function isDeclarationName(node, parent) {
	return (parent?.type === 'FunctionDeclaration' || parent?.type === 'VariableDeclarator') && parent.id === node;
}

/**
 * @param {ASTNode} node - The identifier
 * @param {MaybeNode} parent - Its parent
 * @returns {boolean}
 */
function isParameter(node, parent) {
	const isFunctionParent = parent?.type === 'FunctionDeclaration'
		|| parent?.type === 'FunctionExpression'
		|| parent?.type === 'ArrowFunctionExpression';
	return isFunctionParent && parent.params?.includes(node);
}

/**
 * @param {MaybeNode} parent - The parent
 * @returns {boolean}
 */
function isImportSpecifier(parent) {
	return parent?.type === 'ImportSpecifier'
		|| parent?.type === 'ImportDefaultSpecifier'
		|| parent?.type === 'ImportNamespaceSpecifier';
}

/**
 * @param {ASTNode} node - The identifier
 * @param {MaybeNode} parent - Its parent
 * @returns {boolean}
 */
function isClassDeclarationName(node, parent) {
	return parent?.type === 'ClassDeclaration' && parent.id === node;
}

/**
 * @param {ASTNode} node - The identifier
 * @param {MaybeNode} parent - Its parent
 * @returns {boolean}
 */
function isVoidUndefined(node, parent) {
	return node.name === 'undefined'
		&& parent?.type === 'UnaryExpression'
		&& parent.operator === 'void';
}

/**
 * @param {ASTNode} node - The identifier
 * @param {MaybeNode} parent - Its parent
 * @returns {boolean}
 */
function shouldSkipIdentifier(node, parent) {
	return isPropertyAccess(node, parent)
		|| isPropertyKey(node, parent)
		|| isDeclarationName(node, parent)
		|| isParameter(node, parent)
		|| isImportSpecifier(parent)
		|| isClassDeclarationName(node, parent)
		|| isVoidUndefined(node, parent);
}

/**
 * Get the autofix for a global usage, if any.
 * @param {ASTNode} node - The Identifier node
 * @param {MaybeNode} parent - The parent node
 * @param {RuleContext} context - The rule context
 * @returns {((fixer: RuleFixer) => object) | null} A fixer function, or null if not fixable
 */
function getGlobalFix(node, parent, context) {
	// undefined → void undefined
	if (node.name === 'undefined') {
		if (!canRewriteUndefined(parent)) {
			return null;
		}
		// `void undefined ** n` is a syntax error
		const text = voidNeedsParens(node, parent) ? '(void undefined)' : 'void undefined';
		return (fixer) => fixer.replaceText(node, text);
	}

	const isNew = parent?.type === 'NewExpression' && parent.callee === node;
	const isCall = parent?.type === 'CallExpression' && parent.callee === node;

	if (!parent || (!isNew && !isCall)) {
		return null;
	}

	const { arguments: args } = parent;
	const { sourceCode } = context;

	if (node.name === 'Array') {
		// new Array() or Array() with no args → []
		if (args.length === 0) {
			return (fixer) => fixer.replaceText(parent, '[]');
		}
		if (canBeArrayLiteral(args)) {
			const argsText = args.map((arg) => sourceCode.getText(arg)).join(', ');
			return (fixer) => fixer.replaceText(parent, `[${argsText}]`);
		}
		// a lone argument sets the length, and a spread can stand for any number of them
		return null;
	}

	if (node.name === 'Object') {
		// new Object() or Object() with no args → {}
		if (args.length === 0) {
			// where a statement could begin, a bare `{}` would parse as an empty block
			const text = startsAStatement(parent, parent.parent) ? '({})' : '{}';
			return (fixer) => fixer.replaceText(parent, text);
		}
		// With args - not fixable (Object(x) has special semantics)
		return null;
	}

	return null;
}

export default {
	/**
	 * @param {RuleContext} context - The rule context
	 * @returns {object}
	 */
	create(context) {
		/** @type {Record<string, unknown>} */
		const options = context.options[0] || {}; // eslint-disable-line no-magic-numbers
		const ignoreNames = new Set(Array.isArray(options.ignoreNames) ? options.ignoreNames : []);
		const ignoreCategories = new Set(Array.isArray(options.ignoreCategories) ? options.ignoreCategories : []);

		return {
			/** @param {ASTNode} node - The identifier */
			Identifier(node) {
				const { parent } = node;

				if (shouldSkipIdentifier(node, parent)) {
					return;
				}

				if (!allGlobals.has(node.name)) {
					return;
				}

				// Check ignore config
				if (ignoreNames.has(node.name)) {
					return;
				}

				const category = globalToCategory.get(node.name);
				if (category && ignoreCategories.has(category)) {
					return;
				}

				// Check if it's module-level caching
				const isModuleLevel = isModuleLevelScope(context, node);
				if (isModuleLevel && isBeingCached(node)) {
					return; // Safe - module level caching
				}

				// Check for autofix opportunity
				const fix = getGlobalFix(node, parent, context);

				context.report({
					data: {
						category,
						name: node.name,
					},
					fix,
					messageId: 'global',
					node,
				});
			},
		};
	},
	meta: {
		docs: {
			description: 'Disallow runtime usage of primordial globals',
			recommended: true,
		},
		fixable: 'code',
		messages: {
			global: 'Runtime usage of primordial global {{name}} ({{category}})',
		},
		schema: [
			{
				additionalProperties: false,
				properties: {
					ignoreCategories: {
						description: 'Categories to ignore (e.g., ["Array", "RegExp"])',
						items: { type: 'string' },
						type: 'array',
					},
					ignoreNames: {
						description: 'Global names to ignore (e.g., ["Array", "Object"])',
						items: { type: 'string' },
						type: 'array',
					},
				},
				type: 'object',
			},
		],
		type: 'problem',
	},
};
