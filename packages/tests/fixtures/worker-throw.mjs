import { parentPort } from 'worker_threads';

// a worker that throws uncaught on its first task, to exercise the pool's error handler
if (parentPort) {
	parentPort.on('message', () => {
		throw new Error('worker boom');
	});
}
