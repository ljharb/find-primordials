import process from 'process';
import { parentPort } from 'worker_threads';

// a worker that exits non-zero before finishing its task, to exercise the pool's exit handler
if (parentPort) {
	parentPort.on('message', () => {
		process.exit(1);
	});
}
