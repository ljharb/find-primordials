
import {
	allInstanceMethods,
	ambiguousInstanceMethods,
	getTypeFromServices,
	isBeingCached,
	isModuleLevelScope,
	isCalled,
	isPrototypeAccess,
	isReevaluable,
	isRepeatable,
	literalCategories,
	literalIndex,
	resolveCategory,
	typeCategories,
	typeGlobalName,
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
 * @returns {{ certainty: string, detectedCategory: (string | null), receiver: (string | null), skip: boolean, typed: boolean }}
 */
export function determineCertainty(context, node, categories, isAmbiguous) {
	const detectedCategory = categories.length === 1 ? categories[0] : null; // eslint-disable-line no-magic-numbers

	// a literal receiver names its own type, with no checker needed
	let typeCats = literalCategories(node.object);
	let named = null;

	if (!typeCats) {
		const typeStr = getTypeFromServices(context, node.object);
		typeCats = typeCategories(typeStr);
		named = typeGlobalName(typeStr);
	}

	if (typeCats) {
		const resolved = resolveCategory(typeCats, categories);
		if (!resolved) {
			/*
			 * The receiver's type is known, and no primordial of that type owns this name:
			 * `CharSet.test()` is not `RegExp.prototype.test`, and an iterator has no `push`.
			 */
			return {
				certainty: CERTAINTY_UNCERTAIN,
				detectedCategory,
				receiver: null,
				skip: true,
				typed: false,
			};
		}
		return {
			certainty: CERTAINTY_CERTAIN,
			detectedCategory: resolved,
			// only worth recording where it says more than the category does
			receiver: named === resolved ? null : named,
			skip: false,
			typed: true,
		};
	}

	/*
	 * With no type to go on, only a name that one category owns outright is certain. That
	 * is a claim about the name, not about the object, which is why `typed` stays false.
	 */
	return {
		certainty: isAmbiguous ? CERTAINTY_UNCERTAIN : CERTAINTY_CERTAIN,
		detectedCategory,
		receiver: null,
		skip: false,
		typed: false,
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

				const result = determineCertainty(context, node, categories, isAmbiguous);
				if (result.skip) {
					return;
				}

				/*
				 * Ignore by the category the receiver resolved to, and - where nothing
				 * resolved - only once every category the name could belong to is ignored.
				 * Ignoring `Array` should not silence the `TypedArray` call that merely
				 * shares a method name with it.
				 */
				const ignored = result.detectedCategory
					? ignoreCategories.has(result.detectedCategory)
					: categories.every((cat) => ignoreCategories.has(cat));
				if (ignored) {
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
						// the type it actually is, where that says more than the category
						category: result.receiver || result.detectedCategory || categories.join('/'),
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
