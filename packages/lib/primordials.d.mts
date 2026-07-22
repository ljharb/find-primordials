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

/** Global name to its category name. */
export const globalToCategory: Map<string, string>;

/** The typed-array global names (`Int8Array`, `Uint8Array`, ...). */
export const typedArrayGlobals: Set<string>;

/** Instance method names owned by more than one category. */
export const ambiguousInstanceMethods: Set<string>;
