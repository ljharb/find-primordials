import ljharbConfig from '@ljharb/eslint-config/flat/node/24';

export default [
	{
		ignores: [
			'coverage/',
			'packages/tests/fixtures/',
		],
	},
	...ljharbConfig,
	{
		rules: {
			complexity: ['error', { max: 30 }],
			'func-name-matching': 'off',
			'func-style': ['error', 'declaration'],
			'id-length': ['error', { max: 25, min: 1 }],
			'max-depth': ['error', { max: 5 }],
			'max-lines': ['error', { max: 600 }],
			'max-lines-per-function': 'off',
			'max-params': ['error', { max: 5 }],
			'max-statements': ['error', { max: 50 }],
			'no-extra-parens': 'off',
		},
	},
	{
		files: ['packages/tests/**'],
		rules: {
			'max-lines': 'off',
			'no-console': 'off',
		},
	},
	{
		files: ['packages/lib/primordials.mjs'],
		rules: {
			'max-lines': 'off',
		},
	},
	{
		files: ['release.mjs'],
		rules: {
			'array-bracket-newline': 'off',
		},
	},
];
