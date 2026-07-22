# find-primordials <sup>[![Version Badge][npm-version-svg]][package-url]</sup>

[![github actions][actions-image]][actions-url]
[![License][license-image]][license-url]
[![Downloads][downloads-image]][downloads-url]

[![npm badge][npm-badge-png]][package-url]

Core library for finding primordials in use in JavaScript/TypeScript files.

## Installation

```bash
npm install find-primordials
```

## Usage

### Analyzing a Single File

```js
import { analyzeFile } from 'find-primordials';

const result = await analyzeFile('./src/index.js', {
    includeGlobals: true,      // Include global primordial usage (Array, Object, etc.)
    includeStatic: true,       // Include static method usage (Object.keys, Array.isArray)
    includeSpread: true,       // Include spread syntax (...arr, {...obj})
    includeUncertain: true,    // Include findings where type cannot be determined
});

console.log(result.findings);
// [
//   { type: 'instanceMethod', name: 'push', category: 'Array', ... },
//   { type: 'staticMethod', name: 'keys', category: 'Object', ... },
// ]
```

### Analyzing Multiple Files

```js
import { analyzeFiles, analyzeFilesParallel } from 'find-primordials';

// Sequential analysis
const result = await analyzeFiles(['./src/a.js', './src/b.js'], options);

// Parallel analysis (recommended for many files)
const result = await analyzeFilesParallel(['./src/a.js', './src/b.js'], options);

console.log(result.findings);
console.log(result.errors);
```

### Accessing Primordials Data

```js
import { primordials, allGlobals, allInstanceMethods, allStaticMethods } from 'find-primordials/primordials';

// All tracked primordial categories
console.log(Object.keys(primordials));
// ['Array', 'Object', 'String', 'Number', 'Boolean', 'Symbol', 'BigInt', ...]

// All global constructor names
console.log([...allGlobals]);
// ['Array', 'Object', 'String', 'Map', 'Set', ...]

// All instance methods and which types they belong to
console.log(allInstanceMethods.get('push'));
// Set { 'Array' }

console.log(allInstanceMethods.get('slice'));
// Set { 'Array', 'String', 'ArrayBuffer' }
```

### Formatting Output

```js
import { formatAsTAP, formatFindingAsTAP, groupByCategory } from 'find-primordials';

// Format all findings as TAP
const tap = formatAsTAP(result.findings);
console.log(tap);

// Group findings by category
const grouped = groupByCategory(result.findings);
// { Array: [...], Object: [...], String: [...] }
```

### Ignore Configuration

```js
import { normalizeIgnoreConfig, filterFindings, shouldIgnoreFile, shouldIgnoreFinding } from 'find-primordials';

const ignoreConfig = normalizeIgnoreConfig({
    files: ['vendor/**'],
    types: ['spread', 'global'],
    categories: ['RegExp'],
    names: ['test', 'exec'],
    rules: [
        { files: ['src/*.js'], types: ['instanceMethod'] },
    ],
});

// Check if file should be skipped entirely
if (!shouldIgnoreFile(filePath, ignoreConfig)) {
    // Analyze and filter findings
    const filtered = filterFindings(findings, ignoreConfig);
}
```

## API

### `analyzeFile(filePath, options)`

Analyzes a single file and returns findings.

**Options:**
- `includeGlobals` - Include global primordial usage (default: `false`)
- `includeStatic` - Include static method usage (default: `false`)
- `includeSpread` - Include spread syntax usage (default: `false`)
- `includeUncertain` - Include uncertain findings (default: `true`)
- `isSafeFile` - Function to determine if file is "safe" (default: checks for bin/test files)

### `analyzeFiles(files, options)`

Analyzes multiple files sequentially.

### `analyzeFilesParallel(files, options)`

Analyzes multiple files in parallel using worker threads.

### `applyFixes(filePath, findings)`

Rewrites the findings that have a primordial-free equivalent, and returns `{ fixed, output, fixCount, fixCounts }` without writing to disk.
Only the findings passed in are fixed, so filtering them first is how you control what gets rewritten.

```js
import { analyzeFiles, applyFixes } from 'find-primordials';
import fs from 'fs';

const { findings } = analyzeFiles(['./src/index.js'], { includeGlobals: true });
const result = applyFixes('./src/index.js', findings);
if (result.fixed) {
    fs.writeFileSync('./src/index.js', result.output);
}
```

`fixCounts` breaks the total down by kind: `at`, `constructor`, `isNaN`,
`push`, and `undefined`.

A fix is only applied where the result is equivalent, so a rewrite that would name an operand twice is skipped when that operand is a call, which would then run twice.

Property accesses are read through freely: `Number.isNaN(o.v)` becomes `(o.v !== o.v)`, reaching `v` twice where the original reached it once.
That is equivalent for a getter that behaves like a property - same value each read, no side effects - and not for one that returns something new per read or counts its reads.
Getters like that are deliberately not accounted for.

Each call is a single pass, and a fix can hide another one nested inside it, so re-analyze the output and call again until nothing changes.

### `applyPushFixes(filePath, findings)` / `applyUndefinedFixes(filePath, findings)`

Like `applyFixes`, but limited to the `push` and `undefined` rewrites respectively.

### Finding Types

- `instanceMethod` - Instance method calls like `arr.push()`
- `staticMethod` - Static method calls like `Object.keys()`
- `global` - Global constructor usage like `new Array()`
- `spread` - Spread syntax usage
- `prototypeAccess` - Direct prototype access like `Array.prototype.push`

[package-url]: https://npmjs.org/package/find-primordials
[npm-version-svg]: https://versionbadg.es/ljharb/find-primordials.svg
[npm-badge-png]: https://nodei.co/npm/find-primordials.png?downloads=true&stars=true
[license-image]: https://img.shields.io/npm/l/find-primordials.svg
[license-url]: LICENSE
[downloads-image]: https://img.shields.io/npm/dm/find-primordials.svg
[downloads-url]: https://npm-stat.com/charts.html?package=find-primordials
[actions-image]: https://img.shields.io/endpoint?url=https://github-actions-badge-u3jn4tfpocch.runkit.sh/ljharb/find-primordials
[actions-url]: https://github.com/ljharb/find-primordials/actions
