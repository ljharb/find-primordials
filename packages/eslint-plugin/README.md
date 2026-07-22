# eslint-plugin-find-primordials <sup>[![Version Badge][npm-version-svg]][package-url]</sup>

[![github actions][actions-image]][actions-url]
[![License][license-image]][license-url]
[![Downloads][downloads-image]][downloads-url]

[![npm badge][npm-badge-png]][package-url]

ESLint plugin to find and lint primordial usage in JavaScript/TypeScript code.

## Installation

```bash
npm install --save-dev eslint-plugin-find-primordials eslint
```

## Usage

### Flat Config (ESLint 9+)

```js
// eslint.config.mjs
import findPrimordials from 'eslint-plugin-find-primordials';

export default [
    // Use recommended config
    findPrimordials.configs.recommended,

    // Or use all rules
    findPrimordials.configs.all,

    // Or configure individually
    {
        plugins: {
            'find-primordials': findPrimordials,
        },
        rules: {
            'find-primordials/no-instance-methods': 'error',
            'find-primordials/no-globals': 'warn',
            'find-primordials/no-static-methods': 'error',
            'find-primordials/no-spread-syntax': 'error',
        },
    },
];
```

## Rules
<!-- begin auto-generated rules list -->

💼 Configurations enabled in.\
🌐 Set in the `all` configuration.\
✅ Set in the `recommended` configuration.\
🔧 Automatically fixable by the [`--fix` CLI option](https://eslint.org/docs/user-guide/command-line-interface#--fix).

| Name                                                     | Description                                           | 💼   | 🔧 |
| :------------------------------------------------------- | :---------------------------------------------------- | :--- | :- |
| [no-globals](docs/rules/no-globals.md)                   | Disallow runtime usage of primordial globals          | 🌐   | 🔧 |
| [no-instance-methods](docs/rules/no-instance-methods.md) | Disallow runtime usage of primordial instance methods | 🌐 ✅ | 🔧 |
| [no-spread-syntax](docs/rules/no-spread-syntax.md)       | Disallow runtime usage of spread syntax               | 🌐   |    |
| [no-static-methods](docs/rules/no-static-methods.md)     | Disallow runtime usage of primordial static methods   | 🌐   | 🔧 |

<!-- end auto-generated rules list -->

### `no-instance-methods`

Disallows runtime usage of instance methods on primordial types.

```js
// Bad - runtime instance method usage
function process(arr) {
    arr.push(1);        // Error: Instance method usage on Array
    arr.map(x => x);    // Error: Instance method usage on Array/Iterator
}

// Good - module-level caching
const ArrayPrototypePush = Array.prototype.push;
function process(arr) {
    ArrayPrototypePush.call(arr, 1);
}
```

**Options:**

```js
{
    'find-primordials/no-instance-methods': ['error', {
        // Categories to ignore
        ignoreCategories: ['RegExp'],
        // Specific method names to ignore
        ignoreNames: ['toString'],
    }]
}
```

### `no-globals`

Disallows runtime usage of global primordial constructors.

```js
// Bad - runtime global usage
function createArray() {
    return new Array(10);  // Error: Global primordial usage
}

// Good - module-level caching
const ArrayConstructor = Array;
function createArray() {
    return new ArrayConstructor(10);
}
```

**Options:**

```js
{
    'find-primordials/no-globals': ['error', {
        // Specific globals to ignore
        ignoreNames: ['Promise'],
    }]
}
```

### `no-static-methods`

Disallows runtime usage of static methods on primordial types.

```js
// Bad - runtime static method usage
function getKeys(obj) {
    return Object.keys(obj);  // Error: Static method usage
}

// Good - module-level caching
const ObjectKeys = Object.keys;
function getKeys(obj) {
    return ObjectKeys(obj);
}
```

**Options:**

```js
{
    'find-primordials/no-static-methods': ['error', {
        // Categories to ignore
        ignoreCategories: ['Math'],
        // Specific method names to ignore
        ignoreNames: ['isArray'],
    }]
}
```

### `no-spread-syntax`

Disallows runtime usage of spread syntax.

```js
// Bad - runtime spread usage
function merge(a, b) {
    return [...a, ...b];     // Error: Array spread
    return { ...a, ...b };   // Error: Object spread
}

// Good - module-level spread is allowed
const defaults = { ...baseConfig };
```

**Options:**

```js
{
    'find-primordials/no-spread-syntax': ['error', {
        // Ignore array spread syntax
        ignoreArraySpread: false,
        // Ignore object spread syntax
        ignoreObjectSpread: false,
    }]
}
```

## Configs

### `recommended`

Includes all rules with sensible defaults:

- `no-instance-methods`: error
- `no-globals`: off
- `no-static-methods`: off
- `no-spread-syntax`: off

### `all`

Enables all rules as errors.

## Why Module-Level vs Runtime?

The plugin distinguishes between module-level code (executed once when the module loads) and runtime code (executed during function calls).

Module-level code is considered "safe" because it executes before any user code can modify prototypes:

```js
// Safe - executed at module load time
const ArrayPrototypePush = Array.prototype.push;
const cached = [1, 2, 3].map(x => x * 2);

// Unsafe - executed at runtime, prototypes may be modified
function processData(data) {
    return data.map(x => x * 2);  // Array.prototype.map could be modified!
}
```

[package-url]: https://npmjs.org/package/eslint-plugin-find-primordials
[npm-version-svg]: https://versionbadg.es/ljharb/eslint-plugin-find-primordials.svg
[npm-badge-png]: https://nodei.co/npm/eslint-plugin-find-primordials.png?downloads=true&stars=true
[license-image]: https://img.shields.io/npm/l/eslint-plugin-find-primordials.svg
[license-url]: LICENSE
[downloads-image]: https://img.shields.io/npm/dm/eslint-plugin-find-primordials.svg
[downloads-url]: https://npm-stat.com/charts.html?package=eslint-plugin-find-primordials
[actions-image]: https://img.shields.io/endpoint?url=https://github-actions-badge-u3jn4tfpocch.runkit.sh/ljharb/find-primordials
[actions-url]: https://github.com/ljharb/find-primordials/actions
