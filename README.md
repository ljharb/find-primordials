# find-primordials

[![github actions][actions-image]][actions-url]
[![License][license-image]][license-url]

Find primordials in use in your JavaScript/TypeScript project, so you can make your package more robust.

## What are Primordials?

"Primordials" refer to the built-in JavaScript objects and their methods (like `Array.prototype.push`, `Object.keys`, `String.prototype.slice`) that can be modified by user code.
In security-sensitive or robust code, you may want to cache these methods at module load time to protect against prototype pollution attacks or unexpected modifications.

## Packages

This monorepo contains several packages:

| Package | Description |
|---------|-------------|
| [`find-primordials`](./packages/lib) | Core library for analyzing JavaScript/TypeScript files |
| [`find-primordials-cli`](./packages/cli) | Command-line interface for finding primordials |
| [`eslint-plugin-find-primordials`](./packages/eslint-plugin) | ESLint plugin with rules to detect primordial usage |

## Quick Start

### CLI Usage

```bash
npx find-primordials-cli ./src
```

Or install globally:

```bash
npm install -g find-primordials-cli
find-primordials ./src --globals --static
```

#### Analyzing Remote Repositories

You can pipe repository URLs via stdin to analyze remote repos without local clones:

```bash
echo "ljharb/tape" | find-primordials --globals --static
cat repos.txt | find-primordials --json
```

### ESLint Plugin

```bash
npm install --save-dev eslint-plugin-find-primordials
```

```js
// eslint.config.mjs
import findPrimordials from 'eslint-plugin-find-primordials';

export default [
    findPrimordials.configs.recommended,
];
```

### Library Usage

```js
import { analyzeFile, analyzeFiles } from 'find-primordials';

const result = await analyzeFile('./src/index.js', {
    includeGlobals: true,
    includeStatic: true,
});

console.log(result.findings);
```

## Why Use This?

JavaScript's prototype chain allows any code to modify built-in objects:

```js
// Malicious or accidental modification
Array.prototype.push = function() { /* ... */ };
```

Code that depends on `[].push()` will break. To write robust code, you can cache primordials:

```js
// At module load time (safe zone)
const ArrayPrototypePush = Array.prototype.push;

// Later in runtime code
ArrayPrototypePush.call(myArray, value);
```

This tool helps you find places where you're using primordials at runtime, so you can decide whether to cache them.

## License

MIT

[actions-image]: https://img.shields.io/endpoint?url=https://github-actions-badge-u3jn4tfpocch.runkit.sh/ljharb/find-primordials
[actions-url]: https://github.com/ljharb/find-primordials/actions
[license-image]: https://img.shields.io/npm/l/find-primordials.svg
[license-url]: LICENSE
