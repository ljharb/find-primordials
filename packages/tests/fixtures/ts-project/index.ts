// TypeScript file for testing type-aware detection

// Should be detected as Array (type is known)
function processNumbers(nums: number[]): number[] {
	return nums.map((x) => x * 2);
}

// Should be uncertain (type is unknown)
function processUnknown(obj: unknown): unknown {
	if (Array.isArray(obj)) {
		return obj.map((x) => x);
	}
	return obj;
}

// Should NOT be detected (not an array type)
interface CustomMapper {
	map(fn: (x: number) => number): number[];
}

function useCustomMapper(mapper: CustomMapper): number[] {
	return mapper.map((x) => x * 2);
}

export { processNumbers, processUnknown, useCustomMapper };
