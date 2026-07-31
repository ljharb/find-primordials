
/*
 * All ECMA-262 primordials organized by category
 * Each entry defines: globals, instanceMethods, staticMethods (in alphabetical order)
 */

/**
 * @typedef {object} PrimordialCategory
 * @property {string[]} globals
 * @property {string[]} instanceMethods
 * @property {string[]} staticMethods
 * @property {string[]} [instanceProperties]
 * @property {string[]} [staticProperties]
 * @property {string[]} [wellKnownSymbols]
 */

/** @type {Record<string, PrimordialCategory>} */
export const primordials = {
	AggregateError: {
		globals: ['AggregateError'],
		instanceMethods: [],
		staticMethods: [],
	},
	Array: {
		globals: ['Array'],
		instanceMethods: [
			'at',
			'concat',
			'copyWithin',
			'entries',
			'every',
			'fill',
			'filter',
			'find',
			'findIndex',
			'findLast',
			'findLastIndex',
			'flat',
			'flatMap',
			'forEach',
			'includes',
			'indexOf',
			'join',
			'keys',
			'lastIndexOf',
			'map',
			'pop',
			'push',
			'reduce',
			'reduceRight',
			'reverse',
			'shift',
			'slice',
			'some',
			'sort',
			'splice',
			'toLocaleString',
			'toReversed',
			'toSorted',
			'toSpliced',
			'toString',
			'unshift',
			'values',
			'with',
		],
		staticMethods: [
			'from',
			'fromAsync',
			'isArray',
			'of',
		],
	},
	ArrayBuffer: {
		globals: ['ArrayBuffer'],
		instanceMethods: [
			'resize',
			'slice',
			'transfer',
			'transferToFixedLength',
		],
		instanceProperties: [
			'byteLength',
			'detached',
			'maxByteLength',
			'resizable',
		],
		staticMethods: ['isView'],
	},
	AsyncDisposableStack: {
		globals: ['AsyncDisposableStack'],
		instanceMethods: [
			'adopt',
			'defer',
			'disposeAsync',
			'move',
			'use',
		],
		instanceProperties: ['disposed'],
		staticMethods: [],
	},
	AsyncGenerator: {
		globals: [],
		instanceMethods: [
			'next',
			'return',
			'throw',
		],
		staticMethods: [],
	},
	AsyncGeneratorFunction: {
		globals: ['AsyncGeneratorFunction'],
		instanceMethods: [],
		staticMethods: [],
	},
	AsyncIterator: {
		globals: ['AsyncIterator'],
		instanceMethods: [
			'drop',
			'every',
			'filter',
			'find',
			'flatMap',
			'forEach',
			'map',
			'reduce',
			'some',
			'take',
			'toArray',
		],
		staticMethods: ['from'],
	},
	Atomics: {
		globals: ['Atomics'],
		instanceMethods: [],
		staticMethods: [
			'add',
			'and',
			'compareExchange',
			'exchange',
			'isLockFree',
			'load',
			'notify',
			'or',
			'pause',
			'store',
			'sub',
			'wait',
			'waitAsync',
			'xor',
		],
	},
	BigInt: {
		globals: ['BigInt'],
		instanceMethods: [
			'toLocaleString',
			'toString',
			'valueOf',
		],
		staticMethods: [
			'asIntN',
			'asUintN',
		],
	},
	Boolean: {
		globals: ['Boolean'],
		instanceMethods: [
			'toString',
			'valueOf',
		],
		staticMethods: [],
	},
	DataView: {
		globals: ['DataView'],
		instanceMethods: [
			'getBigInt64',
			'getBigUint64',
			'getFloat16',
			'getFloat32',
			'getFloat64',
			'getInt8',
			'getInt16',
			'getInt32',
			'getUint8',
			'getUint16',
			'getUint32',
			'setBigInt64',
			'setBigUint64',
			'setFloat16',
			'setFloat32',
			'setFloat64',
			'setInt8',
			'setInt16',
			'setInt32',
			'setUint8',
			'setUint16',
			'setUint32',
		],
		instanceProperties: [
			'buffer',
			'byteLength',
			'byteOffset',
		],
		staticMethods: [],
	},
	Date: {
		globals: ['Date'],
		instanceMethods: [
			'getDate',
			'getDay',
			'getFullYear',
			'getHours',
			'getMilliseconds',
			'getMinutes',
			'getMonth',
			'getSeconds',
			'getTime',
			'getTimezoneOffset',
			'getUTCDate',
			'getUTCDay',
			'getUTCFullYear',
			'getUTCHours',
			'getUTCMilliseconds',
			'getUTCMinutes',
			'getUTCMonth',
			'getUTCSeconds',
			'getYear',
			'setDate',
			'setFullYear',
			'setHours',
			'setMilliseconds',
			'setMinutes',
			'setMonth',
			'setSeconds',
			'setTime',
			'setUTCDate',
			'setUTCFullYear',
			'setUTCHours',
			'setUTCMilliseconds',
			'setUTCMinutes',
			'setUTCMonth',
			'setUTCSeconds',
			'setYear',
			'toDateString',
			'toGMTString',
			'toISOString',
			'toJSON',
			'toLocaleDateString',
			'toLocaleString',
			'toLocaleTimeString',
			'toString',
			'toTimeString',
			'toUTCString',
			'valueOf',
		],
		staticMethods: [
			'now',
			'parse',
			'UTC',
		],
	},
	decodeURI: {
		globals: ['decodeURI'],
		instanceMethods: [],
		staticMethods: [],
	},
	decodeURIComponent: {
		globals: ['decodeURIComponent'],
		instanceMethods: [],
		staticMethods: [],
	},
	DisposableStack: {
		globals: ['DisposableStack'],
		instanceMethods: [
			'adopt',
			'defer',
			'dispose',
			'move',
			'use',
		],
		instanceProperties: ['disposed'],
		staticMethods: [],
	},
	encodeURI: {
		globals: ['encodeURI'],
		instanceMethods: [],
		staticMethods: [],
	},
	encodeURIComponent: {
		globals: ['encodeURIComponent'],
		instanceMethods: [],
		staticMethods: [],
	},
	Error: {
		globals: ['Error'],
		instanceMethods: ['toString'],
		staticMethods: [
			'captureStackTrace',
			'isError',
		],
	},
	escape: {
		globals: ['escape'],
		instanceMethods: [],
		staticMethods: [],
	},
	eval: {
		globals: ['eval'],
		instanceMethods: [],
		staticMethods: [],
	},
	EvalError: {
		globals: ['EvalError'],
		instanceMethods: [],
		staticMethods: [],
	},
	FinalizationRegistry: {
		globals: ['FinalizationRegistry'],
		instanceMethods: [
			'register',
			'unregister',
		],
		staticMethods: [],
	},
	Function: {
		globals: ['Function'],
		instanceMethods: [
			'apply',
			'bind',
			'call',
			'toString',
		],
		staticMethods: [],
	},
	Generator: {
		globals: [],
		instanceMethods: [
			'next',
			'return',
			'throw',
		],
		staticMethods: [],
	},
	GeneratorFunction: {
		globals: ['GeneratorFunction'],
		instanceMethods: [],
		staticMethods: [],
	},
	globalThis: {
		globals: ['globalThis'],
		instanceMethods: [],
		staticMethods: [],
	},
	Infinity: {
		globals: ['Infinity'],
		instanceMethods: [],
		staticMethods: [],
	},
	isFinite: {
		globals: ['isFinite'],
		instanceMethods: [],
		staticMethods: [],
	},
	isNaN: {
		globals: ['isNaN'],
		instanceMethods: [],
		staticMethods: [],
	},
	Iterator: {
		globals: ['Iterator'],
		instanceMethods: [
			'drop',
			'every',
			'filter',
			'find',
			'flatMap',
			'forEach',
			'map',
			'reduce',
			'some',
			'take',
			'toArray',
		],
		staticMethods: [
			'concat',
			'from',
			'zip',
			'zipKeyed',
		],
	},
	JSON: {
		globals: ['JSON'],
		instanceMethods: [],
		staticMethods: [
			'isRawJSON',
			'parse',
			'rawJSON',
			'stringify',
		],
	},
	Map: {
		globals: ['Map'],
		instanceMethods: [
			'clear',
			'delete',
			'entries',
			'forEach',
			'get',
			'getOrInsert',
			'getOrInsertComputed',
			'has',
			'keys',
			'set',
			'values',
		],
		instanceProperties: ['size'],
		staticMethods: ['groupBy'],
	},
	Math: {
		globals: ['Math'],
		instanceMethods: [],
		staticMethods: [
			'abs',
			'acos',
			'acosh',
			'asin',
			'asinh',
			'atan',
			'atan2',
			'atanh',
			'cbrt',
			'ceil',
			'clz32',
			'cos',
			'cosh',
			'exp',
			'expm1',
			'f16round',
			'floor',
			'fround',
			'hypot',
			'imul',
			'log',
			'log10',
			'log1p',
			'log2',
			'max',
			'min',
			'pow',
			'random',
			'round',
			'sign',
			'sin',
			'sinh',
			'sqrt',
			'sumPrecise',
			'tan',
			'tanh',
			'trunc',
		],
		staticProperties: [
			'E',
			'LN10',
			'LN2',
			'LOG10E',
			'LOG2E',
			'PI',
			'SQRT1_2',
			'SQRT2',
		],
	},
	NaN: {
		globals: ['NaN'],
		instanceMethods: [],
		staticMethods: [],
	},
	Number: {
		globals: ['Number'],
		instanceMethods: [
			'toExponential',
			'toFixed',
			'toLocaleString',
			'toPrecision',
			'toString',
			'valueOf',
		],
		staticMethods: [
			'isFinite',
			'isInteger',
			'isNaN',
			'isSafeInteger',
			'parseFloat',
			'parseInt',
		],
		staticProperties: [
			'EPSILON',
			'MAX_SAFE_INTEGER',
			'MAX_VALUE',
			'MIN_SAFE_INTEGER',
			'MIN_VALUE',
			'NaN',
			'NEGATIVE_INFINITY',
			'POSITIVE_INFINITY',
		],
	},
	Object: {
		globals: ['Object'],
		instanceMethods: [
			'__defineGetter__',
			'__defineSetter__',
			'__lookupGetter__',
			'__lookupSetter__',
			'hasOwnProperty',
			'isPrototypeOf',
			'propertyIsEnumerable',
			'toLocaleString',
			'toString',
			'valueOf',
		],
		instanceProperties: ['__proto__'],
		staticMethods: [
			'assign',
			'create',
			'defineProperties',
			'defineProperty',
			'entries',
			'freeze',
			'fromEntries',
			'getOwnPropertyDescriptor',
			'getOwnPropertyDescriptors',
			'getOwnPropertyNames',
			'getOwnPropertySymbols',
			'getPrototypeOf',
			'groupBy',
			'hasOwn',
			'is',
			'isExtensible',
			'isFrozen',
			'isSealed',
			'keys',
			'preventExtensions',
			'seal',
			'setPrototypeOf',
			'values',
		],
	},
	parseFloat: {
		globals: ['parseFloat'],
		instanceMethods: [],
		staticMethods: [],
	},
	parseInt: {
		globals: ['parseInt'],
		instanceMethods: [],
		staticMethods: [],
	},
	Promise: {
		globals: ['Promise'],
		instanceMethods: [
			'catch',
			'finally',
			'then',
		],
		staticMethods: [
			'all',
			'allSettled',
			'any',
			'race',
			'reject',
			'resolve',
			'try',
			'withResolvers',
		],
	},
	Proxy: {
		globals: ['Proxy'],
		instanceMethods: [],
		staticMethods: ['revocable'],
	},
	RangeError: {
		globals: ['RangeError'],
		instanceMethods: [],
		staticMethods: [],
	},
	ReferenceError: {
		globals: ['ReferenceError'],
		instanceMethods: [],
		staticMethods: [],
	},
	Reflect: {
		globals: ['Reflect'],
		instanceMethods: [],
		staticMethods: [
			'apply',
			'construct',
			'defineProperty',
			'deleteProperty',
			'get',
			'getOwnPropertyDescriptor',
			'getPrototypeOf',
			'has',
			'isExtensible',
			'ownKeys',
			'preventExtensions',
			'set',
			'setPrototypeOf',
		],
	},
	RegExp: {
		globals: ['RegExp'],
		instanceMethods: [
			'compile',
			'exec',
			'test',
			'toString',
		],
		instanceProperties: [
			'dotAll',
			'flags',
			'global',
			'hasIndices',
			'ignoreCase',
			'multiline',
			'source',
			'sticky',
			'unicode',
			'unicodeSets',
		],
		staticMethods: ['escape'],
	},
	Set: {
		globals: ['Set'],
		instanceMethods: [
			'add',
			'clear',
			'delete',
			'difference',
			'entries',
			'forEach',
			'has',
			'intersection',
			'isDisjointFrom',
			'isSubsetOf',
			'isSupersetOf',
			'keys',
			'symmetricDifference',
			'union',
			'values',
		],
		instanceProperties: ['size'],
		staticMethods: [],
	},
	SharedArrayBuffer: {
		globals: ['SharedArrayBuffer'],
		instanceMethods: [
			'grow',
			'slice',
		],
		instanceProperties: [
			'byteLength',
			'growable',
			'maxByteLength',
		],
		staticMethods: [],
	},
	String: {
		globals: ['String'],
		instanceMethods: [
			'anchor',
			'at',
			'big',
			'blink',
			'bold',
			'charAt',
			'charCodeAt',
			'codePointAt',
			'concat',
			'endsWith',
			'fixed',
			'fontcolor',
			'fontsize',
			'includes',
			'indexOf',
			'isWellFormed',
			'italics',
			'lastIndexOf',
			'link',
			'localeCompare',
			'match',
			'matchAll',
			'normalize',
			'padEnd',
			'padStart',
			'repeat',
			'replace',
			'replaceAll',
			'search',
			'slice',
			'small',
			'split',
			'startsWith',
			'strike',
			'sub',
			'substr',
			'substring',
			'sup',
			'toLocaleLowerCase',
			'toLocaleUpperCase',
			'toLowerCase',
			'toString',
			'toUpperCase',
			'toWellFormed',
			'trim',
			'trimEnd',
			'trimLeft',
			'trimRight',
			'trimStart',
			'valueOf',
		],
		staticMethods: [
			'fromCharCode',
			'fromCodePoint',
			'raw',
		],
	},
	SuppressedError: {
		globals: ['SuppressedError'],
		instanceMethods: [],
		staticMethods: [],
	},
	Symbol: {
		globals: ['Symbol'],
		instanceMethods: [
			'description',
			'toString',
			'valueOf',
		],
		staticMethods: [
			'for',
			'keyFor',
		],
		wellKnownSymbols: [
			'asyncDispose',
			'asyncIterator',
			'dispose',
			'hasInstance',
			'isConcatSpreadable',
			'iterator',
			'match',
			'matchAll',
			'replace',
			'search',
			'species',
			'split',
			'toPrimitive',
			'toStringTag',
			'unscopables',
		],
	},
	SyntaxError: {
		globals: ['SyntaxError'],
		instanceMethods: [],
		staticMethods: [],
	},
	TypedArray: {
		globals: [
			'BigInt64Array',
			'BigUint64Array',
			'Float16Array',
			'Float32Array',
			'Float64Array',
			'Int8Array',
			'Int16Array',
			'Int32Array',
			'Uint8Array',
			'Uint8ClampedArray',
			'Uint16Array',
			'Uint32Array',
		],
		instanceMethods: [
			'at',
			'copyWithin',
			'entries',
			'every',
			'fill',
			'filter',
			'find',
			'findIndex',
			'findLast',
			'findLastIndex',
			'forEach',
			'includes',
			'indexOf',
			'join',
			'keys',
			'lastIndexOf',
			'map',
			'reduce',
			'reduceRight',
			'reverse',
			'set',
			'slice',
			'some',
			'sort',
			'subarray',
			'toLocaleString',
			'toReversed',
			'toSorted',
			'toString',
			'values',
			'with',
		],
		instanceProperties: [
			'buffer',
			'byteLength',
			'byteOffset',
			'BYTES_PER_ELEMENT',
			'length',
		],
		staticMethods: [
			'from',
			'of',
		],
		staticProperties: ['BYTES_PER_ELEMENT'],
	},
	TypeError: {
		globals: ['TypeError'],
		instanceMethods: [],
		staticMethods: [],
	},
	/*
	 * `Uint8Array` carries the base64/hex API on its own, not on `%TypedArray%`, so it is
	 * a category of its own over the same global - `Int8Array.fromBase64` does not exist.
	 */
	Uint8Array: {
		globals: ['Uint8Array'],
		instanceMethods: [
			'setFromBase64',
			'setFromHex',
			'toBase64',
			'toHex',
		],
		staticMethods: [
			'fromBase64',
			'fromHex',
		],
	},
	undefined: {
		globals: ['undefined'],
		instanceMethods: [],
		staticMethods: [],
	},
	unescape: {
		globals: ['unescape'],
		instanceMethods: [],
		staticMethods: [],
	},
	URIError: {
		globals: ['URIError'],
		instanceMethods: [],
		staticMethods: [],
	},
	WeakMap: {
		globals: ['WeakMap'],
		instanceMethods: [
			'delete',
			'get',
			'getOrInsert',
			'getOrInsertComputed',
			'has',
			'set',
		],
		staticMethods: [],
	},
	WeakRef: {
		globals: ['WeakRef'],
		instanceMethods: ['deref'],
		staticMethods: [],
	},
	WeakSet: {
		globals: ['WeakSet'],
		instanceMethods: [
			'add',
			'delete',
			'has',
		],
		staticMethods: [],
	},
};

// Build lookup maps for efficient querying
/** @type {Set<string>} */
export const allGlobals = new Set();
/** @type {Map<string, string[]>} methodName -> [categoryNames] */
export const allStaticMethods = new Map();
/** @type {Map<string, string[]>} methodName -> [categoryNames] */
export const allInstanceMethods = new Map();
/** @type {Map<string, string>} globalName -> categoryName */
export const globalToCategory = new Map();
/**
 * @type {Map<string, string[]>} globalName -> [categoryNames]
 * A global can answer for more than one category: `Uint8Array` is a `TypedArray` and also
 * carries the base64/hex API that no other typed array has.
 */
export const globalCategories = new Map();

/**
 * Record which category owns a method name.
 * @param {Map<string, string[]>} into - The map to add to
 * @param {string[]} methods - The method names
 * @param {string} category - The category that owns them
 * @returns {void}
 */
function claimMethods(into, methods, category) {
	for (let i = 0; i < methods.length; i += 1) {
		const method = methods[i];
		if (!into.has(method)) {
			into.set(method, []);
		}
		into.get(method)?.push(category);
	}
}

const categoryEntries = Object.entries(primordials);
for (let c = 0; c < categoryEntries.length; c += 1) {
	const category = categoryEntries[c][0];
	const info = categoryEntries[c][1];

	for (let g = 0; g < info.globals.length; g += 1) {
		const global = info.globals[g];
		allGlobals.add(global);
		// the first category to claim a global is the family it is named by
		if (!globalToCategory.has(global)) {
			globalToCategory.set(global, category);
		}
		if (!globalCategories.has(global)) {
			globalCategories.set(global, []);
		}
		globalCategories.get(global)?.push(category);
	}

	claimMethods(allStaticMethods, info.staticMethods, category);
	claimMethods(allInstanceMethods, info.instanceMethods, category);
}

// TypedArray globals for type checking
export const typedArrayGlobals = new Set(primordials.TypedArray.globals);

// Methods that exist on multiple types and need type disambiguation
/** @type {Set<string>} */
export const ambiguousInstanceMethods = new Set();
allInstanceMethods.forEach((categories, method) => {
	if (categories.length > 1) {
		ambiguousInstanceMethods.add(method);
	}
});

/*
 * Type strings that name nothing in particular. A receiver typed like this is no better
 * described than an untyped one.
 */
const UNKNOWN_TYPES = [
	/^any$/,
	/^unknown$/,
	/^never$/,
	/^void$/,
	/^object$/i,
	/^\{\s*\}$/,
];

/*
 * How TypeScript prints each primordial, paired with the categories that answers for -
 * most specific first, since a `Generator` reaches `Iterator`'s methods through its own
 * prototype chain and either name could be the one that owns the method at hand.
 *
 * Order matters: a string literal type is checked before the array patterns, so that a
 * type like `"a[]"` is a string rather than an array.
 */
const TYPE_CATEGORIES = /** @type {[RegExp, string[]][]} */ ([
	// primitives, their wrappers, and their literal types
	[/^(?:string|String)$/, ['String']],
	[/^["'`]/, ['String']],
	[/^(?:number|Number)$/, ['Number']],
	[/^-?(?:\d[\d_]*(?:\.\d[\d_]*)?(?:e[-+]?\d+)?|0[box][\da-f_]+)$/i, ['Number']],
	[/^(?:boolean|Boolean|true|false)$/, ['Boolean']],
	[/^(?:bigint|BigInt)$/, ['BigInt']],
	[/^-?\d[\d_]*n$/, ['BigInt']],
	[/^(?:symbol|Symbol|unique symbol)$/, ['Symbol']],

	// arrays and tuples, however they are spelled
	[/^(?:Readonly)?Array(?:<|$)/, ['Array']],
	[/\[\]$/, ['Array']],
	[/^(?:readonly )?\[/, ['Array']],

	// the buffer family; `Uint8Array` owns the base64/hex API no other typed array has
	[/^Uint8Array(?:<|$)/, ['Uint8Array', 'TypedArray']],
	[/^(?:BigInt64|BigUint64|Float16|Float32|Float64|Int8|Int16|Int32|Uint8Clamped|Uint16|Uint32)Array(?:<|$)/, ['TypedArray']],
	[/^ArrayBuffer(?:<|$)/, ['ArrayBuffer']],
	[/^SharedArrayBuffer(?:<|$)/, ['SharedArrayBuffer']],
	[/^DataView(?:<|$)/, ['DataView']],

	// the keyed collections
	[/^(?:Readonly)?Map(?:<|$)/, ['Map']],
	[/^(?:Readonly)?Set(?:<|$)/, ['Set']],
	[/^WeakMap(?:<|$)/, ['WeakMap']],
	[/^WeakSet(?:<|$)/, ['WeakSet']],
	[/^WeakRef(?:<|$)/, ['WeakRef']],
	[/^FinalizationRegistry(?:<|$)/, ['FinalizationRegistry']],

	// iterators, and the generators that inherit their helpers
	[/^AsyncGenerator(?:<|$)/, ['AsyncGenerator', 'AsyncIterator']],
	[/^Generator(?:<|$)/, ['Generator', 'Iterator']],
	[/^Async(?:Iterator|IterableIterator|IteratorObject)(?:<|$)/, ['AsyncIterator']],
	[/^(?:Iterator|IterableIterator|IteratorObject|ArrayIterator|MapIterator|SetIterator|StringIterator|RegExpStringIterator)(?:<|$)/, ['Iterator']],

	// the disposables, whose stacks carry their own methods
	[/^DisposableStack$/, ['DisposableStack']],
	[/^AsyncDisposableStack$/, ['AsyncDisposableStack']],

	// the rest, including every built-in that inherits `Error.prototype`
	[/^Promise(?:<|$)/, ['Promise']],
	[/^RegExp$/, ['RegExp']],
	[/^Date$/, ['Date']],
	[/^(?:Aggregate|Eval|Range|Reference|Suppressed|Syntax|Type|URI)?Error$/, ['Error']],
	[/^Function$/, ['Function']],
	[/^(?:new )?[(<][\s\S]*=>/, ['Function']],
]);

/**
 * Split a type string on its top-level unions, leaving the `|` inside a type argument,
 * a parameter list, or a string literal where it is.
 * @param {string} typeStr - The type's string form
 * @returns {string[]}
 */
function splitUnion(typeStr) {
	const parts = [];
	let depth = 0;
	let quote = '';
	let start = 0;

	for (let i = 0; i < typeStr.length; i += 1) {
		const char = typeStr[i];
		if (quote) {
			if (char === quote) {
				quote = '';
			}
		} else if (char === '"' || char === '\'' || char === '`') {
			quote = char;
		} else if (char === '<' || char === '(' || char === '[' || char === '{') {
			depth += 1;
		} else if (char === '>' || char === ')' || char === ']' || char === '}') {
			depth -= 1;
		} else if (char === '|' && depth === 0) {
			parts[parts.length] = typeStr.slice(start, i).trim();
			start = i + 1;
		}
	}
	parts[parts.length] = typeStr.slice(start).trim();

	return parts;
}

/**
 * The primordial categories a single, non-union type string answers for.
 * @param {string} typeStr - The type's string form
 * @returns {string[] | null} null when the type names nothing in particular
 */
function categoriesForOne(typeStr) {
	for (let i = 0; i < UNKNOWN_TYPES.length; i += 1) {
		if (UNKNOWN_TYPES[i].test(typeStr)) {
			return null;
		}
	}

	for (let i = 0; i < TYPE_CATEGORIES.length; i += 1) {
		if (TYPE_CATEGORIES[i][0].test(typeStr)) {
			return TYPE_CATEGORIES[i][1]; // eslint-disable-line no-magic-numbers
		}
	}

	// a concrete type, and not one of ours
	return [];
}

/**
 * A type's union members, less the ones with no methods to reach.
 * @param {string} typeStr - The type's string form
 * @returns {string[]}
 */
function unionParts(typeStr) {
	return splitUnion(typeStr).filter((part) => !(/^(?:undefined|null)$/).test(part));
}

/**
 * The primordial global a type names, where that is more specific than the category it
 * belongs to: `Uint8Array` rather than the `TypedArray` family, `TypeError` rather than
 * plain `Error`.
 * @param {string | null | undefined} typeStr - The type's string form
 * @returns {string | null} null when the type names no primordial global
 */
export function typeGlobalName(typeStr) {
	if (!typeStr) {
		return null;
	}

	const parts = unionParts(typeStr);
	if (parts.length === 0) {
		return null;
	}

	const named = (/^(?<global>[A-Za-z_$][\w$]*)/).exec(parts[0]);
	const global = named?.groups?.global;
	return global && allGlobals.has(global) ? global : null;
}

/**
 * The primordial categories a type answers for, most specific first.
 *
 * A union answers only for what every one of its members answers for - `string | undefined`
 * is a string, since `undefined` has no methods to reach, while `string | number` is left
 * unresolved because either could be the one whose method is being called.
 * @param {string | null | undefined} typeStr - The type's string form
 * @returns {string[] | null} null when the type names nothing in particular; empty when it names something concrete that is not a primordial
 */
export function typeCategories(typeStr) {
	if (!typeStr) {
		return null;
	}

	const parts = unionParts(typeStr);
	if (parts.length === 0) {
		return null;
	}

	const first = categoriesForOne(parts[0]);
	for (let i = 1; i < parts.length; i += 1) {
		const next = categoriesForOne(parts[i]);
		if (!first || !next || first[0] !== next[0]) {
			return null;
		}
	}

	return first;
}

/**
 * The category a receiver's type resolves a method name to: the most specific of the
 * type's categories that owns the name.
 * @param {string[]} typeCats - The categories the receiver's type answers for
 * @param {string[]} categories - The categories the method name belongs to
 * @returns {string | null} null when the type owns no such method
 */
export function resolveCategory(typeCats, categories) {
	for (let i = 0; i < typeCats.length; i += 1) {
		if (categories.includes(typeCats[i])) {
			return typeCats[i];
		}
	}
	return null;
}
