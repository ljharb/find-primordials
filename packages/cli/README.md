# find-primordials-cli <sup>[![Version Badge][npm-version-svg]][package-url]</sup>

[![github actions][actions-image]][actions-url]
[![License][license-image]][license-url]
[![Downloads][downloads-image]][downloads-url]

[![npm badge][npm-badge-png]][package-url]

Command-line interface for finding primordials in use in JavaScript/TypeScript projects.

## Installation

```bash
npm install -g find-primordials-cli
```

Or use directly with npx:

```bash
npx find-primordials-cli ./src
```

## Usage

```bash
find-primordials [options] <paths...>
```

### Basic Examples

```bash
# Analyze a directory
find-primordials ./src

# Analyze with globals and static methods
find-primordials ./src --globals --static

# Analyze multiple paths
find-primordials ./lib ./test --no-uncertain

# Output as JSON
find-primordials ./src --json

# Output in ESLint style format
find-primordials ./src --eslint

# Group by type instead of file
find-primordials ./src --group-by type
```

### Analyzing Remote Repositories

Pipe repository URLs via stdin to analyze remote repos without local clones:

```bash
# Single repo
echo "ljharb/tape" | find-primordials --globals --static

# Multiple repos from a file
cat repos.txt | find-primordials --json

# Multiple repos inline
echo -e "user/repo1\nuser/repo2" | find-primordials
```

Supported repo formats:
- `user/repo` - GitHub shorthand (converts to `https://github.com/user/repo.git`)
- `https://github.com/...` - Full HTTPS URL
- `git@github.com:...` - SSH URL
- `git://...` - git protocol URL
- `file:///path/to/repo` - local repository (cloned, not analyzed in place)

## Options

### Analysis Options

| Option | Short | Description |
|--------|-------|-------------|
| `--globals` | `-g` | Include global primordial usage (Array, Object, etc.) |
| `--static` | `-s` | Include static method usage (Object.keys, Array.isArray, etc.) |
| `--spread` | | Include spread syntax (...arr, {...obj}) |
| `--no-uncertain` | | Suppress uncertain findings (where type cannot be determined) |
| `--include-safe` | | Include findings in safe files (bin entries, test files) |
| `--include-cached` | | Include the module-level caching that is otherwise treated as the fix |
| `--ext <extensions>` | | Comma-separated list of extensions to scan (default: .js,.mjs,.cjs,.jsx,.ts,.mts,.cts,.tsx) |
| `--ignore <pattern>` | | Path or glob pattern to skip; can be repeated |
| `--fix` | | Rewrite the findings that have a primordial-free equivalent (see below) |

### Other Options

| Option | Description |
|--------|-------------|
| `--help` | Show the help text |
| `--version` | Show the version number |

### Output Options

| Option | Short | Description |
|--------|-------|-------------|
| `--json` | `-j` | Output as JSON instead of TAP |
| `--eslint` | `-e` | Output in ESLint-style format |
| `--group-by <mode>` | | Group output by 'file' (default) or 'type' |

### Ignore Options

| Option | Description |
|--------|-------------|
| `--ignore-config <file>` | Path to JSON file with ignore configuration |
| `--ignore-files <globs>` | Comma-separated glob patterns of files to ignore |
| `--ignore-types <types>` | Comma-separated finding types to ignore |
| `--ignore-categories <cats>` | Comma-separated categories to ignore (Array, Object, etc.) |
| `--ignore-names <names>` | Comma-separated method/property names to ignore |

### Ignore Config File Format

Create a JSON file with ignore rules:

```json
{
    "files": ["vendor/**"],
    "types": ["spread", "global"],
    "categories": ["RegExp"],
    "names": ["test", "exec"],
    "rules": [
        { "files": ["src/*.js"], "types": ["instanceMethod"] },
        { "files": ["helpers/**"], "names": ["push"] }
    ]
}
```

Use with:

```bash
find-primordials ./src --ignore-config .primordials-ignore.json
```

## Module-Level Caching

Reaching a primordial at module load gets the pristine one, so module level is not a finding at all - not the global, the static, the prototype access, the instance method, or the spread. `var $push = Array.prototype.push` is silent, and so is `Object.keys({})` beside it, whatever shape the reach takes.

`--include-cached` reports it anyway, which is what a package whose product *is* the caching needs to audit itself - `call-bind-apply-helpers` is nothing but module-level `Function.prototype.call` and `.apply`, and without the flag it reports nothing at all.

## Uncertain Findings

A method name that more than one primordial owns - `join` is on both `Array` and `TypedArray`, `slice` on five - can only be pinned down by the receiver's type.
A finding is uncertain when that type could not be determined, and `--no-uncertain` drops those.

Every primordial resolves this way, not just arrays: a `Map` receiver resolves `.has()` to `Map`, a `Date` resolves `.getTime()` to `Date`, a `string` resolves `.slice()` to `String`.
A receiver whose type owns no such method is not reported at all - a `CharSet` with its own `test` is not `RegExp.prototype.test`.

Annex B counts too, and its method names are ones ordinary objects use: without type information, an untyped `.compile()` or `.link()` reads as `RegExp.prototype.compile` or `String.prototype.link`.
Use `names` in an ignore config to quiet those.

Types come from the file's own project: the nearest `tsconfig.json` at or above it, with the compiler options that config sets and alongside every other file it covers - the same view an editor has.
So a project whose `tsconfig.json` covers the files being analyzed reports far fewer uncertain findings than one where it does not, since a file typed on its own cannot reach a type that only the project provides.

A file with no `tsconfig.json` above it is typed on its own instead, against the `@types` directories found by walking up from it.
That is both slower and less accurate than typing it in its project.

## Output Formats

### TAP (Default)

```
TAP version 14
# src/index.js
not ok 1 - src/index.js:10:5 - .push() on Array
not ok 2 - src/index.js:15:10 - .slice() on String
not ok 3 - src/index.js:22:7 - .join() on Uint8Array
not ok 4 - src/index.js:31:3 - .slice() [uncertain - could not determine type]
1..4
# 4 primordial usages found
# (3 certain, 1 uncertain)
```

Each finding names the type the method was reached through, since the name alone rarely does: `slice` belongs to `Array`, `ArrayBuffer`, `SharedArrayBuffer`, `String`, and `TypedArray`, and which one you hit decides whether you reach for `ArrayPrototypeSlice` or `StringPrototypeSlice`.
Where the type is more specific than the category - the typed array it actually is, the `Error` subclass it actually is - that is what gets named.
A finding whose receiver could not be typed names nothing, and says so.

### JSON

```json
{
    "findings": [...],
    "errors": [],
    "summary": {
        "totalFindings": 2,
        "certainFindings": 1,
        "uncertainFindings": 1,
        "filesScanned": 5,
        "filesWithErrors": 0
    }
}
```

### ESLint Style

```
src/index.js
   10:5   error    .push() on Array                Array
   22:7   error    .join() on Uint8Array           TypedArray
   15:10  warning  .map()                          Array/Iterator

X 3 problems (2 errors, 1 warning)
```

The last column is the category the finding is grouped under, which is the family rather than the specific type: a `Uint8Array` finding groups with every other `TypedArray`.

## Auto-fix

The `--fix` option rewrites the findings that have a primordial-free equivalent:

| Pattern | Replacement |
|---------|-------------|
| `arr.push(x)` | `arr[arr.length] = x` |
| `arr.at(0)` | `arr[0]` |
| `arr.at(-1)` | `arr[arr.length - 1]` |
| `new Array()` / `Array()` | `[]` |
| `Array(a, b)` | `[a, b]` |
| `new Object()` / `Object()` | `{}` |
| `Number.isNaN(x)` | `(x !== x)` |
| `undefined` | `void undefined` |

Only findings that are reported get fixed, so a rewrite only happens when the
matching option is on: `Array`/`Object`/`undefined` need `--globals`, and
`Number.isNaN` needs `--static`.

A fix is only applied where the result is equivalent:

- Only `certain` findings are rewritten; an uncertain one is left alone.
- `push` only applies to single-argument calls whose return value is not used.
- `.at()` only applies to an integer literal index, since `.at()` truncates.
- `Array(n)` sets the length rather than the contents, and `Object(x)` coerces, so neither has a literal form. `Array(...xs, y)` is left alone too, since a spread can stand for any number of arguments - including the one that sets the length.
- A rewrite that names an operand twice (`arr.at(-1)`, `Number.isNaN(x)`) is skipped when that operand is a call, which would then run twice. `Number.isNaN(f())` and `get().at(-1)` are left alone.
- `push` also leaves its argument alone if evaluating it could run code, because `arr[arr.length] = x` reads the length *before* evaluating `x`, where `push` evaluates `x` first. So `arr.push(f())` is not rewritten.
- Where a statement could begin, `Object()` becomes `({})`, because a bare `{}` there would be an empty block.

Anything that cannot be fixed is still reported, so the exit code and output reflect whatever is left.

### Caveat: getters are taken at their word

Rewrites read through property accesses freely. `run.asserts.push(x)` becomes
`run.asserts[run.asserts.length] = x`, and `Number.isNaN(o.v)` becomes `(o.v !== o.v)`
- each reaching `asserts` and `v` twice where the original reached it once.

That is equivalent for a getter that behaves like a property: same value each read, no side effects.
It is **not** equivalent for a getter that hands back something new on every read, counts its reads, or mutates as it goes:

```js
var o = { get v() { return {}; } }; // a fresh object per read

Number.isNaN(o.v); // false
(o.v !== o.v);     // true  <- the rewrite disagrees
```

Getters like that are deliberately not accounted for.
They break the contract a property access implies, and `--fix` assumes that contract holds.

```bash
find-primordials ./src --fix

# rewrites need the option that reports them
find-primordials ./src --fix --globals --static
```

## Exit Codes

- `0` - No primordial usages found
- `1` - Primordial usages found
- `2` - Usage error (invalid arguments, no paths specified, etc.)

[package-url]: https://npmjs.org/package/find-primordials-cli
[npm-version-svg]: https://versionbadg.es/ljharb/find-primordials-cli.svg
[npm-badge-png]: https://nodei.co/npm/find-primordials-cli.png?downloads=true&stars=true
[license-image]: https://img.shields.io/npm/l/find-primordials-cli.svg
[license-url]: LICENSE
[downloads-image]: https://img.shields.io/npm/dm/find-primordials-cli.svg
[downloads-url]: https://npm-stat.com/charts.html?package=find-primordials-cli
[actions-image]: https://img.shields.io/endpoint?url=https://github-actions-badge-u3jn4tfpocch.runkit.sh/ljharb/find-primordials
[actions-url]: https://github.com/ljharb/find-primordials/actions
