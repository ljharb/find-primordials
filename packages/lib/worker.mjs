
import { parentPort } from 'worker_threads';

import { analyzeFile } from '#/analyzer';

/**
 * Shape a thrown value into the same result envelope analyzeFile returns.
 * @param {string} filePath - The file being analyzed
 * @param {unknown} err - The thrown value
 * @returns {{ filePath: string, result: { error: string, findings: [] } }}
 */
export function toErrorResult(filePath, err) {
	return {
		filePath,
		result: {
			error: err instanceof Error ? err.message : String(err),
			findings: [],
		},
	};
}

// Worker receives file paths and options, analyzes them, and sends results back
if (parentPort) {
	const port = parentPort;
	port.on('message', (message) => {
		const { filePath, options } = message;
		try {
			const result = analyzeFile(filePath, options);
			port.postMessage({ filePath, result });
		} catch (err) {
			// Defensive: analyzeFile catches its own errors and returns them
			port.postMessage(toErrorResult(filePath, err));
		}
	});
}
