
import {
	isBeingCached,
	isModuleLevelScope,
	isRepeatable,
	isStaticMethodAccess,
} from '#/rules/utils';

/** @import { ASTNode, RuleContext, RuleFixer } from '#/rules/utils' */

/**
 * Get the autofix for a static-method call, if any.
 * @param {ASTNode} node - The MemberExpression node
 * @param {{ globalName: string, methodName: string }} staticAccess - The static access info
 * @param {RuleContext} context - The rule context
 * @returns {((fixer: RuleFixer) => object) | null} A fixer function, or null if not fixable
 */
function getStaticMethodFix(node, staticAccess, context) {
	const { parent } = node;

	// Number.isNaN(x) → (x !== x)
	if (staticAccess.globalName === 'Number' && staticAccess.methodName === 'isNaN') {
		if (parent?.type === 'CallExpression' && parent.callee === node && parent.arguments.length === 1) {
			const arg = parent.arguments[0];
			// the comparison names the argument twice
			if (!isRepeatable(arg)) {
				return null;
			}
			const { sourceCode } = context;
			const argText = sourceCode.getText(arg);
			/*
			 * The parens keep the comparison intact wherever the call sat: without them
			 * `!Number.isNaN(x)` would rewrite to `!x !== x`.
			 */
			return (fixer) => fixer.replaceText(parent, `(${argText} !== ${argText})`);
		}
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
			/** @param {ASTNode} node - The member expression */
			MemberExpression(node) {
				const staticAccess = isStaticMethodAccess(node);
				if (!staticAccess) {
					return;
				}

				// Check ignore config
				if (ignoreNames.has(staticAccess.methodName)) {
					return;
				}
				if (ignoreCategories.has(staticAccess.globalName)) {
					return;
				}

				const isModuleLevel = isModuleLevelScope(context, node);
				if (isModuleLevel && isBeingCached(node)) {
					return; // Safe - module level caching
				}

				// Check for autofix opportunity
				const fix = getStaticMethodFix(node, staticAccess, context);

				context.report({
					data: {
						global: staticAccess.globalName,
						method: staticAccess.methodName,
					},
					fix,
					messageId: staticAccess.isProperty ? 'staticProperty' : 'staticMethod',
					node,
				});
			},
		};
	},
	meta: {
		docs: {
			description: 'Disallow runtime usage of primordial static methods',
			recommended: true,
		},
		fixable: 'code',
		messages: {
			staticMethod: 'Runtime usage of primordial static method {{global}}.{{method}}()',
			staticProperty: 'Runtime usage of primordial static property {{global}}.{{method}}',
		},
		schema: [
			{
				additionalProperties: false,
				properties: {
					ignoreCategories: {
						description: 'Categories to ignore (e.g., ["Array", "Object"])',
						items: { type: 'string' },
						type: 'array',
					},
					ignoreNames: {
						description: 'Static method/property names to ignore (e.g., ["keys", "isArray"])',
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
