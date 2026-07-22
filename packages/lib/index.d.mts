// Type declarations for `find-primordials`.

/** A source position, as ESTree records it. */
export type SourceLocation = {
	start: { line: number; column: number };
	end: { line: number; column: number };
};

/**
 * A parsed ESTree/TSESTree node: one permissive shape whose fields the predicates read
 * after checking `type`. A node that may be absent is {@link MaybeNode}.
 */
export type ASTNode = {
	type: string;
	name: string;
	operator: string;
	kind: string;
	computed: boolean;
	shorthand: boolean;
	object: ASTNode;
	property: ASTNode;
	callee: ASTNode;
	left: ASTNode;
	right: ASTNode;
	test: ASTNode;
	consequent: ASTNode;
	alternate: ASTNode;
	argument: ASTNode;
	id: ASTNode;
	init: ASTNode;
	key: ASTNode;
	local: ASTNode;
	param: ASTNode;
	arguments: ASTNode[];
	properties: ASTNode[];
	params: ASTNode[];
	expressions: ASTNode[];
	declarations: ASTNode[];
	specifiers: ASTNode[];
	elements: (ASTNode | null)[];
	comments: ASTNode[];
	value: unknown;
	body: unknown;
	range: [number, number];
	loc: SourceLocation;
};

/** An {@link ASTNode} that may be absent. */
export type MaybeNode = ASTNode | null | undefined;

/** The finding kinds that have an autofix. */
export type FixKind = 'at' | 'constructor' | 'isNaN' | 'push' | 'undefined';

/** A finding type accepted in ignore configuration. */
export type FindingType = 'global' | 'instanceMethod' | 'prototypeAccess' | 'spread' | 'staticMethod' | 'staticProperty';

/** A primordial usage the analyzer reports. */
export type Finding = {
	type: string;
	name: string;
	certainty: string;
	file: string;
	line?: number;
	column?: number;
	category?: string | null;
	possibleCategories?: string[];
};

/** A parse/read error encountered while analyzing a file. */
export type AnalysisError = {
	error: string;
	file: string;
};

/** The findings and errors from analyzing one or more files. */
export type AnalysisResult = {
	errors: AnalysisError[];
	findings: Finding[];
};

/** Options accepted by the analyzers. */
export type AnalyzeOptions = {
	includeGlobals?: boolean;
	includeSpread?: boolean;
	includeStatic?: boolean;
	includeUncertain?: boolean;
	isSafe?: boolean;
	isSafeFile?: ((filePath: string) => boolean) | null;
	concurrency?: number;
};

/** The result of rewriting a file. */
export type FixResult = {
	fixed: boolean;
	output: string;
	fixCount: number;
	fixCounts: Record<FixKind, number>;
};

/** Raw ignore configuration, as authored in a config file. */
export type RawIgnoreConfig = {
	categories?: string[];
	files?: string[];
	names?: string[];
	rules?: unknown;
	types?: string[];
};

/** A fine-grained ignore rule within a normalized {@link IgnoreConfig}. */
export type IgnoreRule = {
	categories: Set<string>;
	files: string[];
	names: Set<string>;
	types: Set<string>;
};

/** Normalized ignore configuration. */
export type IgnoreConfig = {
	categories: Set<string>;
	files: string[];
	names: Set<string>;
	rules: IgnoreRule[];
	types: Set<string>;
};

/** The slice of a TypeScript `Type` that {@link describeType} reads. */
export type TypeLike = { flags: number };

/** The slice of a TypeScript type checker that {@link describeType} reads. */
export type TypeCheckerLike<T extends TypeLike> = {
	typeToString: (type: T) => string;
	isArrayType?: (type: T) => boolean;
	isTupleType?: (type: T) => boolean;
};

// ---- analysis ----

export function analyzeFile(filePath: string, options?: AnalyzeOptions): { error: string | null; findings: Finding[] };
export function analyzeFiles(filePaths: string[], options?: AnalyzeOptions): AnalysisResult;
export function analyzeFilesParallel(filePaths: string[], options?: AnalyzeOptions): Promise<AnalysisResult>;

// ---- fixes ----

export function applyFixes(filePath: string, findings: Finding[]): FixResult;
export function applyPushFixes(filePath: string, findings: Finding[]): FixResult;
export function applyUndefinedFixes(filePath: string, findings: Finding[]): FixResult;

// ---- fix predicates (shared with the ESLint plugin's rewrites) ----

export function isCalled(node: ASTNode, parent: MaybeNode): boolean;
export function isRepeatable(node: MaybeNode): boolean;
export function isReevaluable(node: MaybeNode): boolean;
export function literalIndex(arg: ASTNode): number | null;
export function startsAStatement(node: ASTNode, parent: MaybeNode): boolean;
export function canBeArrayLiteral(args: ASTNode[]): boolean;
export function voidNeedsParens(node: ASTNode, parent: MaybeNode): boolean;
export function canRewriteUndefined(parent: MaybeNode): boolean;

// ---- type description ----

export function describeType<T extends TypeLike>(typeChecker: TypeCheckerLike<T>, type: T): string | null;

// ---- formatting / grouping ----

export function categoryLabel(finding: Finding): string;
export function groupFindingsByCategory(findings: Finding[]): Record<string, Finding[]>;
export function formatFindingAsTAP(finding: Finding, testNum: number): string;
export function formatAsTAP(findings: Finding[], options?: { showUncertain?: boolean }): string;

// ---- ignore configuration ----

export function normalizeIgnoreConfig(config: RawIgnoreConfig | IgnoreConfig): IgnoreConfig | null;
export function shouldIgnoreFile(filePath: string, ignoreConfig?: IgnoreConfig): boolean;
export function shouldIgnoreFinding(finding: Finding, ignoreConfig?: IgnoreConfig): boolean;
export function filterFindings(findings: Finding[], ignoreConfig?: IgnoreConfig | null): Finding[];
export function getValidTypes(): FindingType[];

// ---- file classification ----

export function isTestFile(filePath: string): boolean;
export function isConfigFile(filePath: string): boolean;
export function isBinFile(filePath: string): boolean;
export function isPrivatePackage(filePath: string): boolean;
export function isUnpublishedFile(filePath: string): boolean;
export function isSafeFile(filePath: string): boolean;

/** The default file extensions the analyzers scan. */
export const defaultExtensions: string[];

// ---- primordial data (also available at `find-primordials/primordials`) ----

export {
	allGlobals,
	allInstanceMethods,
	allStaticMethods,
	ambiguousInstanceMethods,
	globalToCategory,
	primordials,
	typedArrayGlobals,
} from './primordials.mjs';
export type { PrimordialCategory } from './primordials.mjs';
