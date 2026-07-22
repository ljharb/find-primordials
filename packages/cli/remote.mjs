import { spawn } from 'child_process';
import fs from 'fs';
import os from 'os';
import path from 'path';
import readline from 'readline';

/** Check if stdin has piped data available */
export function hasPipedData() {
	// stdin must not be a TTY
	if (process.stdin.isTTY) {
		return false;
	}
	/*
	 * Check if stdin is a pipe (FIFO) or has data.
	 * For pipes created by shell, stat will indicate pipe type.
	 */
	try {
		const stat = fs.fstatSync(process.stdin.fd);
		return stat.isFIFO() || stat.isSocket() || stat.size > 0;
	} catch {
		// If we can't stat stdin, assume no piped data
		return false;
	}
}

/** Read lines from stdin */
export function readStdin() {
	return new Promise((resolve) => {
		/** @type {string[]} */
		const lines = [];
		const rl = readline.createInterface({
			crlfDelay: Infinity,
			input: process.stdin,
		});
		rl.on('line', (line) => {
			const trimmed = line.trim();
			if (trimmed && !trimmed.startsWith('#')) {
				lines[lines.length] = trimmed;
			}
		});
		rl.on('close', () => {
			resolve(lines);
		});
	});
}

/**
 * Parse a repo identifier into a clone URL
 * @param {string} repo
 */
export function parseRepoUrl(repo) {
	// Already a full URL (file:// supports cloning a local repo without a remote)
	if ((/^https:\/\/|git(?:@|:\/\/)|file:\/\//).test(repo)) {
		return repo;
	}
	// GitHub shorthand: user/repo or user/repo.git
	if (repo.match(/^[^/]+\/[^/]+$/)) {
		const cleanRepo = repo.replace(/\.git$/, '');
		return `https://github.com/${cleanRepo}.git`;
	}
	// Assume it's a GitHub shorthand without validation
	return `https://github.com/${repo}.git`;
}

/**
 * Clone a repo to a temp directory
 * @param {string} repoURL
 * @param {string} tempDir
 */
function cloneRepo(repoURL, tempDir) {
	return new Promise((resolve, reject) => {
		const proc = spawn('git', [
			'clone',
			'--depth',
			'1',
			'--single-branch',
			repoURL,
			tempDir,
		], {
			env: {
				...process.env,
				GIT_TERMINAL_PROMPT: '0',
			},
			stdio: [
				'ignore',
				'pipe',
				'pipe',
			],
		});

		let stderr = '';
		proc.stderr.on('data', (data) => {
			stderr += `${data}`;
		});

		proc.on('close', (code) => {
			if (code === 0) {
				resolve(tempDir);
			} else {
				reject(new Error(`Failed to clone ${repoURL}: ${stderr.trim()}`));
			}
		});

		proc.on('error', (err) => {
			reject(new Error(`Failed to clone ${repoURL}: ${err.message}`));
		});
	});
}

/**
 * Remove a directory recursively
 * @param {string} dir
 */
export function removeDir(dir) {
	try {
		fs.rmSync(dir, { force: true, recursive: true });
	} catch {
		// Ignore cleanup errors
	}
}

/**
 * Clone multiple repos and return paths and temp dirs
 * @param {string[]} repos
 */
export async function cloneRepos(repos) {
	/** @type {string[]} */
	const tempDirs = [];
	/** @type {string[]} */
	const clonedPaths = [];
	const baseTemp = path.join(os.tmpdir(), 'find-primordials-');

	/** @param {string} repo */
	async function cloneOne(repo) {
		const repoUrl = parseRepoUrl(repo);
		const repoName = repo.replace(/[^a-zA-Z0-9-]/g, '-').replace(/-+/g, '-');
		const tempDir = fs.mkdtempSync(`${baseTemp}${repoName}-`);
		tempDirs[tempDirs.length] = tempDir;

		try {
			console.error(`Cloning ${repo}...`);
			await cloneRepo(repoUrl, tempDir);
			clonedPaths[clonedPaths.length] = tempDir;
		} catch (err) {
			const error = /** @type {Error} */ (err);
			console.error(`Warning: ${error.message}`);
			removeDir(tempDir);
		}
	}

	await Promise.all(repos.map(cloneOne));

	return { clonedPaths, tempDirs };
}

/** Process piped repos from stdin */
export async function processPipedRepos() {
	/** @type {string[]} */
	const repos = await readStdin();
	if (repos.length === 0) {
		console.error('Error: No repos provided on stdin');
		process.exit(2); // eslint-disable-line no-magic-numbers
	}
	const result = await cloneRepos(repos);
	if (result.clonedPaths.length === 0) {
		console.error('Error: Failed to clone any repos');
		process.exit(2); // eslint-disable-line no-magic-numbers
	}
	return result;
}
