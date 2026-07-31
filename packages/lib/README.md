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

### What Counts as a Primordial

The dataset covers ECMA-262 through ES2026, including Annex B, plus what the working draft has added since - `Atomics.pause`, `Iterator.zip`/`zipKeyed`, `Map`/`WeakMap`'s `getOrInsert`, and the `DisposableStack`/`AsyncDisposableStack`/`SuppressedError` that come with `using`.
It is checked against the spec's own clause list, not against a runtime, so a method a given engine has not shipped is still covered and an engine extension like `Error.prepareStackTrace` is not.

`Uint8Array` answers for two categories: it is a `TypedArray`, and it alone owns the base64/hex API, so `Uint8Array.fromBase64` is a `Uint8Array` finding while `Uint8Array.from` is a `TypedArray` one, and `Int8Array.fromBase64` is nothing at all.
`globalToCategory` gives the family a global is named by; `globalCategories` gives every category it answers for.

Annex B is included because those methods are as patchable as any other, but the names are ones ordinary objects use too: an untyped receiver calling `.compile()`, `.link()`, `.small()`, `.sub()`, or `.fixed()` reads as a `RegExp` or `String` primordial, since nothing else can say otherwise.
Type information resolves those correctly; without it, `names` in an ignore config (or the rule's `ignoreNames`) is the way to quiet them.

`constructor` is deliberately absent from every category, as are `message` and `name` on the error prototypes, and the `next`/`return` that each built-in iterator prototype defines for itself rather than inheriting from `%IteratorPrototype%`.

### Reaching a Cached Primordial

Caching a method does not make reaching `.call` on it safe: `$push.call(arr, x)` reaches `Function.prototype.call` every time it runs, so `call`, `apply`, and `bind` are reported like any other `Function` method.
A call-bound function carries no properties of its own - it is invoked as `cached(a, b)`, never `cached.call(a, b)` - so bind at module level and invoke the result directly, and no call site reaches a primordial.

### Type Resolution

A method name that more than one primordial owns - `join` is on both `Array` and `TypedArray`, `slice` on five - can only be pinned down by the receiver's type, so that is where a finding's certainty comes from.

Every primordial resolves this way, not just arrays and iterators: a `Map` receiver resolves `.has()` to `Map`, a `Date` resolves `.getTime()` to `Date`, a `string` resolves `.slice()` to `String`.
A receiver whose type owns no such method is not reported at all - a `CharSet` with its own `test` is not `RegExp.prototype.test`, and an iterator has no `push`.
Where a type is more specific than its category, the finding records it: a `Uint8Array` receiver has `category: 'TypedArray'` and `receiver: 'Uint8Array'`, and a `TypeError` has `category: 'Error'` and `receiver: 'TypeError'`.
A literal receiver needs no checker at all - `'x'.slice()`, `` `x`.slice() ``, `/x/.test()`, `(1).toFixed()`, and `[1].at()` each name their own type.

Types come from the file's own project: the nearest `tsconfig.json` at or above it, with the compiler options that config sets and alongside every other file it covers.
That is the same view an editor has, which matters because some types are reachable no other way - node's builtins are ambient `declare module`s inside `@types/node`, and a package like that only reaches a program by being named in `types`, or by a `/// <reference types>` somewhere else in the project.
A file typed on its own sees `path` as `any`, and every `path.join()` becomes an uncertain finding.

A project is read once and its program built once, however many of its files are analyzed.

A file with no `tsconfig.json` above it, or one its project does not cover, is typed on its own instead, against the `@types` directories found by walking up from it.
Resolving those types costs real time, so analyzing a project that has no `tsconfig.json` is slower than one that does - and less accurate, since nothing outside the file itself can inform it.

When `parserServices` is passed - as the ESLint plugin does - those are used instead, and no program is built.

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

### `typeCategories(typeStr)` / `typeGlobalName(typeStr)` / `resolveCategory(typeCats, categories)`

The pieces type resolution is built from, exported so a consumer can classify a type the same way.

`typeCategories` maps a type's printed form to the primordial categories it answers for, most specific first: `null` when the type names nothing in particular (`any`, `unknown`, `object`), and empty when it names something concrete that is no primordial at all.
A union answers only for what every one of its members answers for, so `string | undefined` is a `String` while `string | number` is left unresolved.

`typeGlobalName` picks out the specific global where that says more than the category - `Uint8Array` rather than `TypedArray`.

`resolveCategory` picks the most specific of a type's categories that owns a given method name, which is how a `Generator` receiver resolves `.map()` to `Iterator` and `.next()` to `Generator`.

```js
import { allInstanceMethods, resolveCategory, typeCategories } from 'find-primordials';

typeCategories('Uint8Array<ArrayBufferLike>'); // ['TypedArray']
typeCategories('Generator<number>');           // ['Generator', 'Iterator']
typeCategories('Widget');                      // []

resolveCategory(typeCategories('string'), allInstanceMethods.get('slice')); // 'String'
```

### `receiverLabel(finding)`

What a finding says the receiver is: its `receiver` when set, its `category` otherwise, and the empty string when the type could not be determined.

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
