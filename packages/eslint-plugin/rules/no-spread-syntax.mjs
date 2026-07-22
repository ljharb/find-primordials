
import { isModuleLevelScope } from '#/rules/utils';

/** @import { ASTNode, RuleContext } from '#/rules/utils' */

export default {
	/**
	 * @param {RuleContext} context - The rule context
	 * @returns {object}
	 */
	create(context) {
		/** @type {Record<string, unknown>} */
		const options = context.options[0] || {}; // eslint-disable-line no-magic-numbers
		const ignoreArraySpread = options.ignoreArraySpread || false;
		const ignoreObjectSpread = options.ignoreObjectSpread || false;

		return {
			/** @param {ASTNode} node - The spread element */
			SpreadElement(node) {
				const isModuleLevel = isModuleLevelScope(context, node);
				if (isModuleLevel) {
					return; // Module level spread is safe
				}

				const { parent } = node;
				const isObjectSpread = parent?.type === 'ObjectExpression';

				// Check ignore config
				if (isObjectSpread && ignoreObjectSpread) {
					return;
				}
				if (!isObjectSpread && ignoreArraySpread) {
					return;
				}

				context.report({
					messageId: isObjectSpread ? 'spreadObject' : 'spreadArray',
					node,
				});
			},
		};
	},
	meta: {
		docs: {
			description: 'Disallow runtime usage of spread syntax',
			recommended: false,
		},
		messages: {
			spreadArray: 'Runtime usage of array spread syntax (...)',
			spreadObject: 'Runtime usage of object spread syntax (...)',
		},
		schema: [
			{
				additionalProperties: false,
				properties: {
					ignoreArraySpread: {
						default: false,
						description: 'Ignore array spread syntax ([...arr])',
						type: 'boolean',
					},
					ignoreObjectSpread: {
						default: false,
						description: 'Ignore object spread syntax ({...obj})',
						type: 'boolean',
					},
				},
				type: 'object',
			},
		],
		type: 'problem',
	},
};
