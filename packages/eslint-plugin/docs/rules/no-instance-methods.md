# find-primordials/no-instance-methods

📝 Disallow runtime usage of primordial instance methods.

💼 This rule is enabled in the following configs: 🌐 `all`, ✅ `recommended`.

🔧 This rule is automatically fixable by the [`--fix` CLI option](https://eslint.org/docs/latest/user-guide/command-line-interface#--fix).

<!-- end auto-generated rule header -->

## Options

<!-- begin auto-generated rule options list -->

| Name               | Description                                      | Type     | Default |
| :----------------- | :----------------------------------------------- | :------- | :------ |
| `allowUncertain`   |                                                  | Boolean  | `false` |
| `ignoreCategories` | Categories to ignore (e.g., ["Array", "RegExp"]) | String[] |         |
| `ignoreNames`      | Method names to ignore (e.g., ["test", "push"])  | String[] |         |

<!-- end auto-generated rule options list -->

## Type Resolution

A method name that more than one primordial owns - `join` is on both `Array` and `TypedArray`, `slice` on five - can only be pinned down by the receiver's type, which the rule reads from `@typescript-eslint/parser`'s type information where a type-aware config provides it.

Every primordial resolves this way: a `Map` receiver resolves `.has()` to `Map`, a `Date` resolves `.getTime()` to `Date`, a `string` resolves `.slice()` to `String`.
A receiver whose type owns no such method is not reported at all - a `CharSet` with its own `test` is not `RegExp.prototype.test`.
Where the type is more specific than the category, the message names it: `.join()` on a `Uint8Array` says `Uint8Array`, not `TypedArray`.
A literal receiver needs no type information - `'x'.slice()`, `/x/.test()`, and `[1].at()` each name their own type.

Without type information, only a name that one category owns outright is certain; anything else is reported as uncertain, which `allowUncertain` suppresses.

`ignoreCategories` is applied to the category a receiver resolved to, and - where nothing resolved - only once every category the name could belong to is ignored.
So ignoring `Array` does not silence a `Uint8Array`'s `.join()`, which is a `TypedArray` call that merely shares a name with one.
