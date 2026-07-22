
import {
	allInstanceMethods,
	ambiguousInstanceMethods,
	getTypeFromServices,
	isArrayOrIteratorType,
	isBeingCached,
	isModuleLevelScope,
	isCalled,
	isPrototypeAccess,
	isReevaluable,
	isRepeatable,
	literalIndex,
} from '#/rules/utils';

/** @import { ASTNode, RuleContext, RuleFixer } from '#/rules/utils' */

const CERTAINTY_CERTAIN = 'certain';
const CERTAINTY_UNCERTAIN = 'uncertain';

/** @type {Set<string>} */
const SKIP_METHODS = new Set([
	'call',
	'apply',
	'bind',
]);

/**
 * Get the autofix for an instance-method call, if any.
 * @param {ASTNode} node - The MemberExpression node
 * @param {string} methodName - The method name
 * @param {string} certainty - The certainty level
 * @param {RuleContext} context - The rule context
 * @returns {((fixer: RuleFixer) => object) | null} A fixer function, or null if not fixable
 */
function getInstanceMethodFix(node, methodName, certainty, context) {
	if (certainty !== CERTAINTY_CERTAIN) {
		return null;
	}

	const { parent } = node;
	const grandparent = parent?.parent;
	const { sourceCode } = context;

	/*
	 * push(x) in ExpressionStatement → arr[arr.length] = x
	 * The assignment names the object twice, and resolves its target - length and all -
	 * before evaluating the argument, where push evaluates the argument first. So the
	 * object has to be safe to name twice, and the argument safe to reorder.
	 */
	if (methodName === 'push'
		&& parent?.type === 'CallExpression'
		&& parent.callee === node
		&& parent.arguments.length === 1
		&& isRepeatable(node.object)
		&& isReevaluable(parent.arguments[0])
		&& grandparent?.type === 'ExpressionStatement') {
		return (fixer) => {
			const objectText = sourceCode.getText(node.object);
			const argText = sourceCode.getText(parent.arguments[0]);
			return fixer.replaceText(parent, `${objectText}[${objectText}.length] = ${argText}`);
		};
	}

	// .at(literalIndex) → arr[index] or arr[arr.length - n]
	if (methodName === 'at'
		&& parent?.type === 'CallExpression'
		&& parent.callee === node
		&& parent.arguments.length === 1) {
		const indexValue = literalIndex(parent.arguments[0]);
		// counting back from the end evaluates the object a second time, to read its length
		if (indexValue !== null && (indexValue >= 0 || isReevaluable(node.object))) {
			return (fixer) => {
				const objectText = sourceCode.getText(node.object);
				if (indexValue >= 0) {
					return fixer.replaceText(parent, `${objectText}[${indexValue}]`);
				}
				return fixer.replaceText(parent, `${objectText}[${objectText}.length - ${-indexValue}]`);
			};
		}
	}

	return null;
}

/**
 * Report a prototype access, unless it is safe module-level caching.
 * @param {RuleContext} context - The rule context
 * @param {ASTNode} node - The MemberExpression node
 * @param {{ globalName: string, methodName: (string | null) }} protoAccess - The prototype access info
 * @returns {boolean}
 */
function handlePrototypeAccess(context, node, protoAccess) {
	const isModuleLevel = isModuleLevelScope(context, node);
	if (isModuleLevel && isBeingCached(node)) {
		return true; // Safe - module level caching
	}

	context.report({
		data: {
			global: protoAccess.globalName,
			method: protoAccess.methodName,
		},
		messageId: 'prototypeAccess',
		node,
	});
	return true;
}

/**
 * Determine the certainty and category for an instance-method access.
 * @param {RuleContext} context - The rule context
 * @param {ASTNode} node - The MemberExpression node
 * @param {string[]} categories - The categories the method name belongs to
 * @param {boolean} isAmbiguous - Whether the name maps to more than one category
 * @returns {{ certainty: string, detectedCategory: (string | null), skip: boolean, typed: boolean }}
 */
export function determineCertainty(context, node, categories, isAmbiguous) {
	const typeStr = getTypeFromServices(context, node.object);
	let certainty = CERTAINTY_UNCERTAIN;
	let detectedCategory = categories.length === 1 ? categories[0] : null; // eslint-disable-line no-magic-numbers

	if (typeStr) {
		const typeKind = isArrayOrIteratorType(typeStr);
		if (typeKind === 'array' && categories.includes('Array')) {
			return {
				certainty: CERTAINTY_CERTAIN,
				detectedCategory: 'Array',
				skip: false,
				typed: true,
			};
		}
		if (typeKind === 'iterator' && (categories.includes('Iterator') || categories.includes('AsyncIterator'))) {
			const cat = categories.includes('Iterator') ? 'Iterator' : 'AsyncIterator';
			return {
				certainty: CERTAINTY_CERTAIN,
				detectedCategory: cat,
				skip: false,
				typed: true,
			};
		}
		if (typeKind === 'other') {
			return {
				certainty,
				detectedCategory,
				skip: true,
				typed: false,
			}; // Not a primordial type
		}
	} else if (!isAmbiguous) {
		/*
		 * Only one category can own this name, so a call to it is a call to that
		 * primordial. That is a claim about the name, not about the object, which is why
		 * `typed` stays false.
		 */
		certainty = CERTAINTY_CERTAIN;
	}

	// Literal arrays are certain
	let typed = false;
	if (node.object.type === 'ArrayExpression') {
		certainty = CERTAINTY_CERTAIN;
		detectedCategory = 'Array';
		typed = true;
	}

	return {
		certainty,
		detectedCategory,
		skip: false,
		typed,
	};
}

export default {
	/**
	 * @param {RuleContext} context - The rule context
	 * @returns {object}
	 */
	create(context) {
		/** @type {Record<string, unknown>} */
		const options = context.options[0] || {}; // eslint-disable-line no-magic-numbers
		const allowUncertain = options.allowUncertain || false;
		const ignoreNames = new Set(Array.isArray(options.ignoreNames) ? options.ignoreNames : []);
		const ignoreCategories = new Set(Array.isArray(options.ignoreCategories) ? options.ignoreCategories : []);

		return {
			/** @param {ASTNode} node - The member expression */
			MemberExpression(node) {
				// Check for prototype access: Array.prototype.push
				const protoAccess = isPrototypeAccess(node);
				if (protoAccess) {
					// Check ignore config for prototype access
					if (ignoreNames.has(protoAccess.methodName)) {
						return;
					}
					if (ignoreCategories.has(protoAccess.globalName)) {
						return;
					}
					handlePrototypeAccess(context, node, protoAccess);
					return;
				}

				// Check for instance method access
				if (node.property.type !== 'Identifier') {
					return;
				}

				const methodName = node.property.name;

				// Check if method name is ignored
				if (ignoreNames.has(methodName)) {
					return;
				}

				// Skip .call/.apply/.bind - could be on cached functions
				if (SKIP_METHODS.has(methodName)) {
					return;
				}

				const categories = allInstanceMethods.get(methodName);
				if (!categories) {
					return;
				}

				const isAmbiguous = ambiguousInstanceMethods.has(methodName);

				// Check if any category is ignored
				if (categories.some((cat) => ignoreCategories.has(cat))) {
					return;
				}

				const result = determineCertainty(context, node, categories, isAmbiguous);
				if (result.skip) {
					return;
				}

				// Check if detected category is ignored
				if (result.detectedCategory && ignoreCategories.has(result.detectedCategory)) {
					return;
				}

				/*
				 * Reading `row.test` without calling it says nothing on its own: plenty of
				 * objects carry a data property that happens to be named after a method.
				 * A call at least reaches something callable, but a bare read needs the
				 * object's type to say it is a primordial - the name alone cannot.
				 */
				if (!isCalled(node, node.parent) && !result.typed) {
					return;
				}

				// Check if at module level and being cached
				const isModuleLevel = isModuleLevelScope(context, node);
				if (isModuleLevel && isBeingCached(node)) {
					return; // Safe - module level caching
				}

				if (result.certainty === CERTAINTY_UNCERTAIN && allowUncertain) {
					return;
				}

				const fix = getInstanceMethodFix(node, methodName, result.certainty, context);

				context.report({
					data: {
						category: result.detectedCategory || categories.join('/'),
						method: methodName,
					},
					fix,
					messageId: result.certainty === CERTAINTY_CERTAIN ? 'instanceMethod' : 'instanceMethodUncertain',
					node,
				});
			},
		};
	},
	meta: {
		docs: {
			description: 'Disallow runtime usage of primordial instance methods',
			recommended: true,
		},
		fixable: 'code',
		messages: {
			instanceMethod: 'Runtime usage of primordial instance method .{{method}}() on {{category}}',
			instanceMethodUncertain: 'Possible runtime usage of primordial instance method .{{method}}() (type uncertain)',
			prototypeAccess: 'Runtime access to {{global}}.prototype.{{method}}',
		},
		schema: [
			{
				additionalProperties: false,
				properties: {
					allowUncertain: {
						default: false,
						type: 'boolean',
					},
					ignoreCategories: {
						description: 'Categories to ignore (e.g., ["Array", "RegExp"])',
						items: { type: 'string' },
						type: 'array',
					},
					ignoreNames: {
						description: 'Method names to ignore (e.g., ["test", "push"])',
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
