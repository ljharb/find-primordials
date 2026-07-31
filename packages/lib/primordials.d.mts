// Type declarations for `find-primordials/primordials`.

/** A primordial category: the globals, methods, and properties one intrinsic family owns. */
export type PrimordialCategory = {
	globals: string[];
	instanceMethods: string[];
	staticMethods: string[];
	instanceProperties?: string[];
	staticProperties?: string[];
	wellKnownSymbols?: string[];
};

/** Every primordial category, keyed by name (e.g. `Array`, `Object`, `RegExp`). */
export const primordials: Record<string, PrimordialCategory>;

/** Every primordial global name. */
export const allGlobals: Set<string>;

/** Static method name to the category names that own it. */
export const allStaticMethods: Map<string, string[]>;

/** Instance method name to the category names that own it. */
export const allInstanceMethods: Map<string, string[]>;

/** Global name to its category name: the family it is named by, where it has more than one. */
export const globalToCategory: Map<string, string>;

/**
 * Global name to every category name it answers for. `Uint8Array` is a `TypedArray` and
 * also owns the base64/hex API that no other typed array has.
 */
export const globalCategories: Map<string, string[]>;

/** The typed-array global names (`Int8Array`, `Uint8Array`, ...). */
export const typedArrayGlobals: Set<string>;

/** Instance method names owned by more than one category. */
export const ambiguousInstanceMethods: Set<string>;

/**
 * The primordial categories a type answers for, most specific first: `null` when the type
 * names nothing in particular, and empty when it names something concrete that is not a
 * primordial.
 */
export function typeCategories(typeStr: string | null | undefined): string[] | null;

/**
 * The primordial global a type names, where that is more specific than the category it
 * belongs to: `Uint8Array` rather than the `TypedArray` family, `TypeError` rather than
 * plain `Error`. `null` when the type names no primordial global.
 */
export function typeGlobalName(typeStr: string | null | undefined): string | null;

/**
 * The category a receiver's type resolves a method name to: the most specific of the
 * type's categories that owns the name, or `null` when the type owns no such method.
 */
export function resolveCategory(typeCats: string[], categories: string[]): string | null;
