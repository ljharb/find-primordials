
import noGlobals from '#/rules/no-globals';
import noInstanceMethods from '#/rules/no-instance-methods';
import noSpreadSyntax from '#/rules/no-spread-syntax';
import noStaticMethods from '#/rules/no-static-methods';

/**
 * @type {{
 *   configs: Record<string, object>,
 *   meta: { name: string, version: string },
 *   rules: Record<string, object>,
 * }}
 */
const plugin = {
	configs: {},
	meta: {
		name: 'eslint-plugin-find-primordials',
		version: '0.0.0',
	},
	rules: {
		'no-globals': noGlobals,
		'no-instance-methods': noInstanceMethods,
		'no-spread-syntax': noSpreadSyntax,
		'no-static-methods': noStaticMethods,
	},
};

// Recommended config matches default CLI behavior (instance methods only)
plugin.configs.recommended = {
	plugins: {
		'find-primordials': plugin,
	},
	rules: {
		'find-primordials/no-instance-methods': 'error',
	},
};

// All rules enabled
plugin.configs.all = {
	plugins: {
		'find-primordials': plugin,
	},
	rules: {
		'find-primordials/no-globals': 'error',
		'find-primordials/no-instance-methods': 'error',
		'find-primordials/no-spread-syntax': 'error',
		'find-primordials/no-static-methods': 'error',
	},
};

export default plugin;
