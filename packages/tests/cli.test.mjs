import { execFileSync, spawn } from 'child_process';
import fs from 'fs';
import os from 'os';
import path from 'path';
import test from 'tape';
import { fileURLToPath } from 'url';

import { cloneRepos, hasPipedData, parseRepoUrl, removeDir } from 'find-primordials-cli/remote.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const fixturesDir = path.join(__dirname, 'fixtures');
const binPath = path.join(__dirname, '..', 'cli', 'bin.mjs');

function runCLI(args, options = {}) {
	return new Promise((resolve, reject) => {
		let stdout = '';
		let stderr = '';

		const hasInput = typeof options.input === 'string';
		const proc = spawn(process.execPath, [binPath].concat(args), {
			cwd: options.cwd || __dirname,
			env: { ...process.env, ...options.env },
			stdio: [
				hasInput ? 'pipe' : 'ignore',
				'pipe',
				'pipe',
			],
		});

		proc.stdout.on('data', (data) => {
			stdout += data.toString();
		});

		proc.stderr.on('data', (data) => {
			stderr += data.toString();
		});

		proc.on('close', (code) => {
			resolve({
				code,
				stderr,
				stdout,
			});
		});

		proc.on('error', reject);

		if (hasInput) {
			proc.stdin.write(options.input);
			proc.stdin.end();
		}
	});
}

// Create a throwaway local git repo whose single commit holds `contents` in `fileName`.
function makeLocalRepo(contents, fileName = 'src.js') {
	const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'fp-remote-src-'));
	const gitOptions = {
		cwd: dir,
		env: {
			...process.env,
			GIT_AUTHOR_EMAIL: 'test@example.com',
			GIT_AUTHOR_NAME: 'Test',
			GIT_COMMITTER_EMAIL: 'test@example.com',
			GIT_COMMITTER_NAME: 'Test',
		},
		stdio: 'ignore',
	};
	execFileSync('git', ['init', '-q'], gitOptions);
	fs.writeFileSync(path.join(dir, fileName), contents);
	execFileSync('git', ['add', '-A'], gitOptions);
	execFileSync('git', [
		'commit', '-q', '-m', 'init',
	], gitOptions);
	return dir;
}

// Materialize a { relativePath: contents } map into a fresh temp directory.
function makeTree(files) {
	const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'fp-bin-'));
	for (const [rel, contents] of Object.entries(files)) {
		const full = path.join(dir, rel);
		fs.mkdirSync(path.dirname(full), { recursive: true });
		fs.writeFileSync(full, contents);
	}
	return dir;
}

test('CLI', (t) => {
	t.test('--help shows usage', async (st) => {
		const result = await runCLI(['--help']);

		st.equal(result.code, 0, 'exits with 0');
		st.ok(result.stdout.includes('Usage:'), 'shows usage');
		st.ok(result.stdout.includes('find-primordials'), 'mentions command name');
		st.ok(result.stdout.includes('--globals'), 'shows --globals option');
		st.ok(result.stdout.includes('--static'), 'shows --static option');
		st.end();
	});

	t.test('--version shows version', async (st) => {
		const result = await runCLI(['--version']);

		st.equal(result.code, 0, 'exits with 0');
		st.ok(result.stdout.trim().match(/^v\d+\.\d+\.\d+/), 'shows version number'); // pargs prefixes the version with `v`
		st.end();
	});

	t.test('no paths shows error', async (st) => {
		const result = await runCLI([]);

		st.equal(result.code, 2, 'exits with 2');
		st.ok(result.stderr.includes('No paths specified'), 'shows error message');
		st.end();
	});

	t.test('analyzes safe project with no findings', async (st) => {
		const safePath = path.join(fixturesDir, 'sample-project', 'safe.js');
		const result = await runCLI([safePath, '--include-safe']);

		st.equal(result.code, 0, 'exits with 0 (no findings)');
		st.ok(result.stdout.includes('TAP version 14'), 'outputs TAP format');
		st.ok(result.stdout.includes('1..0'), 'zero tests');
		st.end();
	});

	t.test('analyzes unsafe project with findings', async (st) => {
		const unsafePath = path.join(fixturesDir, 'sample-project', 'unsafe.js');
		const result = await runCLI([unsafePath, '--include-safe']);

		st.equal(result.code, 1, 'exits with 1 (has findings)');
		st.ok(result.stdout.includes('TAP version 14'), 'outputs TAP format');
		st.ok(result.stdout.includes('not ok'), 'has failing tests');
		st.end();
	});

	t.test('--globals includes global usage', async (st) => {
		const unsafePath = path.join(fixturesDir, 'sample-project', 'unsafe.js');
		const result = await runCLI([
			unsafePath,
			'--globals',
			'--include-safe',
		]);

		st.equal(result.code, 1, 'exits with 1');
		st.ok(result.stdout.includes('Array'), 'includes Array global');
		st.end();
	});

	t.test('--static includes static methods', async (st) => {
		const unsafePath = path.join(fixturesDir, 'sample-project', 'unsafe.js');
		const result = await runCLI([
			unsafePath,
			'--static',
			'--include-safe',
		]);

		st.equal(result.code, 1, 'exits with 1');
		st.ok(result.stdout.includes('Object.keys'), 'includes Object.keys');
		st.end();
	});

	t.test('--json outputs JSON', async (st) => {
		const unsafePath = path.join(fixturesDir, 'sample-project', 'unsafe.js');
		const result = await runCLI([
			unsafePath,
			'--json',
			'--include-safe',
		]);

		st.equal(result.code, 1, 'exits with 1');

		let parsed;
		try {
			parsed = JSON.parse(result.stdout);
		} catch (e) {
			st.fail(`stdout should be valid JSON: ${e.message}`);
			st.end();
			return;
		}

		st.ok(parsed.findings, 'has findings');
		st.ok(parsed.summary, 'has summary');
		st.ok(typeof parsed.summary.totalFindings === 'number', 'has totalFindings');
		st.end();
	});

	t.test('handles directory input', async (st) => {
		const projectPath = path.join(fixturesDir, 'sample-project');
		const result = await runCLI([projectPath, '--include-safe']);

		st.equal(result.code, 1, 'exits with 1 (has findings from unsafe.js)');
		st.ok(result.stdout.includes('TAP version 14'), 'outputs TAP format');
		st.end();
	});

	t.end();
});

test('parseRepoUrl', (t) => {
	t.test('handles full HTTPS URLs', (st) => {
		const url = 'https://github.com/user/repo.git';
		st.equal(parseRepoUrl(url), url, 'returns HTTPS URL unchanged');
		st.end();
	});

	t.test('handles git@ URLs', (st) => {
		const url = 'git@github.com:user/repo.git';
		st.equal(parseRepoUrl(url), url, 'returns git@ URL unchanged');
		st.end();
	});

	t.test('handles git:// URLs', (st) => {
		const url = 'git://github.com/user/repo.git';
		st.equal(parseRepoUrl(url), url, 'returns git:// URL unchanged');
		st.end();
	});

	t.test('handles file:// URLs', (st) => {
		const url = 'file:///tmp/local/repo';
		st.equal(parseRepoUrl(url), url, 'returns file:// URL unchanged');
		st.end();
	});

	t.test('converts GitHub shorthand', (st) => {
		st.equal(parseRepoUrl('user/repo'), 'https://github.com/user/repo.git', 'converts user/repo');
		st.equal(parseRepoUrl('user/repo.git'), 'https://github.com/user/repo.git', 'handles .git suffix');
		st.end();
	});

	t.test('handles non-standard shorthand', (st) => {
		st.equal(parseRepoUrl('something'), 'https://github.com/something.git', 'wraps in GitHub URL');
		st.end();
	});

	t.end();
});

test('removeDir', (t) => {
	t.test('removes directory', (st) => {
		const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'test-remove-'));
		fs.writeFileSync(path.join(tempDir, 'test.txt'), 'test');

		st.ok(fs.existsSync(tempDir), 'dir exists before remove');
		removeDir(tempDir);
		st.notOk(fs.existsSync(tempDir), 'dir removed');
		st.end();
	});

	t.test('handles non-existent directory', (st) => {
		// Should not throw
		function tryRemove() {
			removeDir('/nonexistent/path/xyz123');
		}
		st.doesNotThrow(tryRemove, 'does not throw for nonexistent dir');
		st.end();
	});

	t.end();
});

test('hasPipedData', (t) => {
	t.test('returns false in TTY mode', (st) => {
		/*
		 * When running tests, stdin is not a TTY and is set to ignore
		 * so hasPipedData will try to fstat and fail
		 */
		const result = hasPipedData();
		st.equal(typeof result, 'boolean', 'returns a boolean');
		st.end();
	});

	t.end();
});

test('CLI - output formats', (t) => {
	t.test('--eslint outputs ESLint format', async (st) => {
		const unsafePath = path.join(fixturesDir, 'sample-project', 'unsafe.js');
		const result = await runCLI([
			unsafePath,
			'--eslint',
			'--include-safe',
		]);

		st.equal(result.code, 1, 'exits with 1');
		st.ok(result.stdout.includes('error') || result.stdout.includes('warning'), 'has error/warning output');
		st.ok(result.stdout.includes('problem'), 'has problem count');
		st.end();
	});

	t.test('--group-by type groups by category', async (st) => {
		const unsafePath = path.join(fixturesDir, 'sample-project', 'unsafe.js');
		const result = await runCLI([
			unsafePath,
			'--group-by',
			'type',
			'--include-safe',
		]);

		st.equal(result.code, 1, 'exits with 1');
		st.ok(result.stdout.includes('TAP version 14'), 'outputs TAP format');
		st.end();
	});

	t.end();
});

test('CLI - ignore options', (t) => {
	t.test('--ignore-names filters by method name', async (st) => {
		const unsafePath = path.join(fixturesDir, 'sample-project', 'unsafe.js');
		const result = await runCLI([
			unsafePath,
			'--ignore-names',
			'push,map,filter,forEach,includes',
			'--include-safe',
		]);

		// May or may not have findings depending on what's filtered
		st.ok([0, 1].includes(result.code), 'exits with 0 or 1');
		st.end();
	});

	t.test('--ignore-categories filters by category', async (st) => {
		const unsafePath = path.join(fixturesDir, 'sample-project', 'unsafe.js');
		const result = await runCLI([
			unsafePath,
			'--ignore-categories',
			'Array',
			'--include-safe',
		]);

		st.ok([0, 1].includes(result.code), 'exits with 0 or 1');
		st.end();
	});

	t.test('--ignore-types filters by type', async (st) => {
		const unsafePath = path.join(fixturesDir, 'sample-project', 'unsafe.js');
		const result = await runCLI([
			unsafePath,
			'--ignore-types',
			'instanceMethod',
			'--include-safe',
		]);

		// May still have findings of other types (static methods, globals, etc.)
		st.ok([0, 1].includes(result.code), 'exits with 0 or 1 based on remaining findings');
		st.end();
	});

	t.end();
});

test('cloneRepos', (t) => {
	t.test('handles invalid repo gracefully', async (st) => {
		const result = await cloneRepos(['nonexistent-user-xyz/nonexistent-repo-xyz']);

		st.equal(result.clonedPaths.length, 0, 'no successful clones');
		st.ok(result.tempDirs.length > 0, 'temp dir was created');

		// Clean up
		for (const dir of result.tempDirs) {
			removeDir(dir);
		}

		st.end();
	});

	t.end();
});

test('CLI - additional options', (t) => {
	t.test('--spread includes spread findings', async (st) => {
		const unsafePath = path.join(fixturesDir, 'sample-project', 'unsafe.js');
		const result = await runCLI([
			unsafePath,
			'--spread',
			'--include-safe',
		]);

		st.equal(result.code, 1, 'exits with 1');
		st.end();
	});

	t.test('--no-uncertain excludes uncertain findings', async (st) => {
		const unsafePath = path.join(fixturesDir, 'sample-project', 'unsafe.js');
		const result = await runCLI([
			unsafePath,
			'--no-uncertain',
			'--include-safe',
		]);

		st.ok([0, 1].includes(result.code), 'exits with 0 or 1');
		st.end();
	});

	t.test('handles non-existent path', async (st) => {
		const result = await runCLI(['/nonexistent/path/foo.js']);

		st.equal(result.code, 2, 'exits with 2');
		st.ok(result.stderr.includes('not found') || result.stderr.includes('No matching'), 'shows error');
		st.end();
	});

	t.test('--ignore skips a single file', async (st) => {
		const unsafePath = path.join(fixturesDir, 'sample-project', 'unsafe.js');
		const result = await runCLI([
			unsafePath,
			'--ignore',
			unsafePath,
			'--include-safe',
		]);

		st.equal(result.code, 2, 'exits with 2 (no files match)');
		st.end();
	});

	t.test('--ignore skips a directory', async (st) => {
		const projectPath = path.join(fixturesDir, 'sample-project');
		const result = await runCLI([
			projectPath,
			'--ignore',
			projectPath,
			'--include-safe',
		]);

		st.equal(result.code, 2, 'exits with 2 (no files match)');
		st.end();
	});

	t.test('--ignore can be repeated', async (st) => {
		const safePath = path.join(fixturesDir, 'sample-project', 'safe.js');
		const unsafePath = path.join(fixturesDir, 'sample-project', 'unsafe.js');
		const result = await runCLI([
			safePath,
			unsafePath,
			'--ignore',
			safePath,
			'--ignore',
			unsafePath,
			'--include-safe',
		]);

		st.equal(result.code, 2, 'exits with 2 (no files match)');
		st.end();
	});

	t.test('handles ignored file via --ignore-files', async (st) => {
		const unsafePath = path.join(fixturesDir, 'sample-project', 'unsafe.js');
		const result = await runCLI([
			unsafePath,
			'--ignore-files',
			'**/*.js',
			'--include-safe',
		]);

		st.equal(result.code, 2, 'exits with 2 (no files match)');
		st.end();
	});

	t.test('--ext option filters by extension', async (st) => {
		const projectPath = path.join(fixturesDir, 'sample-project');
		const result = await runCLI([
			projectPath,
			'--ext',
			'.ts',
			'--include-safe',
		]);

		st.equal(result.code, 2, 'exits with 2 (no .ts files)');
		st.end();
	});

	t.test('handles files with parse errors', async (st) => {
		const parseErrorPath = path.join(fixturesDir, 'sample-project', 'parse-error.js');
		const result = await runCLI([parseErrorPath, '--include-safe']);

		// Should still complete but report warning about parse error
		st.ok(result.stderr.includes('Warning') || result.code === 0, 'reports warning or completes');
		st.end();
	});

	t.test('--eslint and --group-by are mutually exclusive', async (st) => {
		const safePath = path.join(fixturesDir, 'sample-project', 'safe.js');
		const result = await runCLI([
			safePath,
			'--eslint',
			'--group-by',
			'type',
			'--include-safe',
		]);

		st.equal(result.code, 2, 'exits with 2');
		st.ok(result.stderr.includes('mutually exclusive'), 'shows error');
		st.end();
	});

	t.test('--eslint with no findings', async (st) => {
		const safePath = path.join(fixturesDir, 'sample-project', 'safe.js');
		const result = await runCLI([
			safePath,
			'--eslint',
			'--include-safe',
		]);

		st.equal(result.code, 0, 'exits with 0');
		st.ok(result.stdout.includes('No primordial usages'), 'shows no findings');
		st.end();
	});

	t.test('--eslint with --spread shows spread syntax', async (st) => {
		const spreadPath = path.join(fixturesDir, 'sample-project', 'with-spread.js');
		const result = await runCLI([
			spreadPath,
			'--eslint',
			'--spread',
			'--include-safe',
		]);

		st.equal(result.code, 1, 'exits with 1');
		st.ok(result.stdout.includes('spread syntax'), 'shows spread syntax description');
		st.end();
	});

	t.test('--eslint with --globals shows global name', async (st) => {
		const unsafePath = path.join(fixturesDir, 'sample-project', 'unsafe.js');
		const result = await runCLI([
			unsafePath,
			'--eslint',
			'--globals',
			'--include-safe',
		]);

		st.equal(result.code, 1, 'exits with 1');
		st.ok(result.stdout.includes('Array') || result.stdout.includes('Object'), 'shows global name');
		st.end();
	});

	t.end();
});

test('CLI - --fix option', (t) => {
	const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'cli-fix-test-'));

	t.test('--fix converts push to assignment', async (st) => {
		const testFile = path.join(tmpDir, 'fix-push.js');
		const code = 'function fn() { var arr = []; arr.push(1); }';
		fs.writeFileSync(testFile, code);

		const result = await runCLI([testFile, '--fix']);

		st.equal(result.code, 0, 'exits with 0 (no remaining findings)'); // eslint-disable-line no-magic-numbers
		st.ok(result.stdout.includes('Fixed 1 push-to-assignment issue'), 'shows fix message');

		const fixed = fs.readFileSync(testFile, 'utf8');
		st.ok(fixed.includes('arr[arr.length] = 1'), 'file was modified');
		st.notOk(fixed.includes('.push('), 'push call removed');
		st.end();
	});

	t.test('--fix does not modify unfixable code', async (st) => {
		const testFile = path.join(tmpDir, 'no-fix.js');
		const code = 'function fn() { var arr = []; var len = arr.push(1); }';
		fs.writeFileSync(testFile, code);

		const result = await runCLI([testFile, '--fix']);

		st.equal(result.code, 1, 'exits with 1 (has findings)'); // eslint-disable-line no-magic-numbers
		st.notOk(result.stdout.includes('Fixed'), 'no fix message');

		const unchanged = fs.readFileSync(testFile, 'utf8');
		st.equal(unchanged, code, 'file was not modified');
		st.end();
	});

	t.test('--fix handles multiple push calls', async (st) => {
		const testFile = path.join(tmpDir, 'multi-push.js');
		const code = 'function fn() { var arr = []; arr.push(1); arr.push(2); }';
		fs.writeFileSync(testFile, code);

		const result = await runCLI([testFile, '--fix']);

		st.equal(result.code, 0, 'exits with 0'); // eslint-disable-line no-magic-numbers
		st.ok(result.stdout.includes('Fixed 2 push-to-assignment issues'), 'shows plural fix message');

		const fixed = fs.readFileSync(testFile, 'utf8');
		st.ok(fixed.includes('arr[arr.length] = 1'), 'first push fixed');
		st.ok(fixed.includes('arr[arr.length] = 2'), 'second push fixed');
		st.end();
	});

	t.test('--fix converts undefined to void undefined', async (st) => {
		const testFile = path.join(tmpDir, 'undefined-fix.js');
		const code = 'function fn() { return undefined; }';
		fs.writeFileSync(testFile, code);

		const result = await runCLI([
			testFile,
			'--fix',
			'--globals',
		]);

		st.equal(result.code, 0, 'exits with 0'); // eslint-disable-line no-magic-numbers
		st.ok(result.stdout.includes('Fixed 1 undefined-to-void issue'), 'shows singular fix message');

		const fixed = fs.readFileSync(testFile, 'utf8');
		st.ok(fixed.includes('return void undefined'), 'undefined converted to void undefined');
		st.end();
	});

	t.test('--fix handles multiple undefined occurrences', async (st) => {
		const testFile = path.join(tmpDir, 'multi-undefined.js');
		const code = 'function fn(x) { if (x === undefined) { return undefined; } }';
		fs.writeFileSync(testFile, code);

		const result = await runCLI([
			testFile,
			'--fix',
			'--globals',
		]);

		st.equal(result.code, 0, 'exits with 0'); // eslint-disable-line no-magic-numbers
		st.ok(result.stdout.includes('Fixed 2 undefined-to-void issues'), 'shows plural fix message');

		const fixed = fs.readFileSync(testFile, 'utf8');
		st.ok(fixed.includes('x === void undefined'), 'first undefined fixed');
		st.ok(fixed.includes('return void undefined'), 'second undefined fixed');
		st.end();
	});

	t.test('--fix skips void undefined (already safe)', async (st) => {
		const testFile = path.join(tmpDir, 'void-undefined.js');
		const code = 'function fn() { return void undefined; }';
		fs.writeFileSync(testFile, code);

		const result = await runCLI([
			testFile,
			'--fix',
			'--globals',
		]);

		st.equal(result.code, 0, 'exits with 0'); // eslint-disable-line no-magic-numbers
		st.notOk(result.stdout.includes('Fixed'), 'no fixes applied');

		const unchanged = fs.readFileSync(testFile, 'utf8');
		st.equal(unchanged, code, 'file was not modified');
		st.end();
	});

	t.test('--fix rewrites Array and Object construction', async (st) => {
		const testFile = path.join(tmpDir, 'fix-constructors.js');
		fs.writeFileSync(testFile, 'function fn() { var a = new Array(); var b = new Object(); return [a, b]; }');

		const result = await runCLI([
			testFile,
			'--fix',
			'--globals',
		]);

		st.equal(result.code, 0, 'exits with 0'); // eslint-disable-line no-magic-numbers
		st.ok(result.stdout.includes('Fixed 2 constructor-to-literal issues'), 'shows the constructor fix message');

		const fixed = fs.readFileSync(testFile, 'utf8');
		st.ok(fixed.includes('var a = []'), 'new Array() became []');
		st.ok(fixed.includes('var b = {}'), 'new Object() became {}');
		st.end();
	});

	t.test('--fix rewrites Number.isNaN', async (st) => {
		const testFile = path.join(tmpDir, 'fix-isnan.js');
		fs.writeFileSync(testFile, 'function fn(x) { return Number.isNaN(x); }');

		const result = await runCLI([
			testFile,
			'--fix',
			'--static',
		]);

		st.equal(result.code, 0, 'exits with 0'); // eslint-disable-line no-magic-numbers
		st.ok(result.stdout.includes('Fixed 1 isNaN-to-comparison issue'), 'shows the isNaN fix message');

		const fixed = fs.readFileSync(testFile, 'utf8');
		st.ok(fixed.includes('(x !== x)'), 'isNaN became a self-comparison');
		st.end();
	});

	t.test('--fix rewrites .at() with a literal index', async (st) => {
		const testFile = path.join(tmpDir, 'fix-at.js');
		fs.writeFileSync(testFile, 'function fn() { return [1, 2, 3].at(0); }');

		const result = await runCLI([testFile, '--fix']);

		st.equal(result.code, 0, 'exits with 0'); // eslint-disable-line no-magic-numbers
		st.ok(result.stdout.includes('Fixed 1 at-to-index issue'), 'shows the at fix message');

		const fixed = fs.readFileSync(testFile, 'utf8');
		st.ok(fixed.includes('[1, 2, 3][0]'), 'at(0) became an index access');
		st.end();
	});

	t.test('--fix applies fixes of different kinds on the same line', async (st) => {
		const testFile = path.join(tmpDir, 'fix-same-line.js');
		fs.writeFileSync(testFile, 'function fn() { var arr = []; arr.push(1); return undefined; }');

		const result = await runCLI([
			testFile,
			'--fix',
			'--globals',
		]);

		st.equal(result.code, 0, 'exits with 0'); // eslint-disable-line no-magic-numbers

		const fixed = fs.readFileSync(testFile, 'utf8');
		st.ok(fixed.includes('arr[arr.length] = 1'), 'push became an assignment');
		st.ok(fixed.includes('return void undefined'), 'the undefined after it was fixed too');
		st.end();
	});

	t.test('--fix still reports what it could not fix', async (st) => {
		const testFile = path.join(tmpDir, 'fix-partial.js');
		// the first push is fixable; the second has its return value used
		fs.writeFileSync(testFile, 'function fn() { var arr = []; arr.push(1); var len = arr.push(2); return len; }');

		const result = await runCLI([testFile, '--fix']);

		st.equal(result.code, 1, 'exits with 1 (a finding remains)'); // eslint-disable-line no-magic-numbers
		st.ok(result.stdout.includes('Fixed 1 push-to-assignment issue'), 'reports the fix it made');
		st.ok(result.stdout.includes('not ok'), 'still reports the push it could not fix');

		const fixed = fs.readFileSync(testFile, 'utf8');
		st.ok(fixed.includes('arr[arr.length] = 1'), 'the fixable push was fixed');
		st.ok(fixed.includes('var len = arr.push(2)'), 'the unfixable push was left alone');
		st.end();
	});

	t.test('cleanup', (st) => {
		fs.rmSync(tmpDir, { recursive: true });
		st.end();
	});

	t.end();
});

test('remote - hasPipedData branches', (t) => {
	t.test('returns false when stdin is a TTY', (st) => {
		const original = Object.getOwnPropertyDescriptor(process.stdin, 'isTTY');
		Object.defineProperty(process.stdin, 'isTTY', { configurable: true, value: true });
		try {
			st.equal(hasPipedData(), false, 'a TTY has no piped data');
		} finally {
			if (original) {
				Object.defineProperty(process.stdin, 'isTTY', original);
			} else {
				delete process.stdin.isTTY;
			}
		}
		st.end();
	});

	t.test('returns false when stdin cannot be inspected', (st) => {
		const ttyDescriptor = Object.getOwnPropertyDescriptor(process.stdin, 'isTTY');
		Object.defineProperty(process.stdin, 'isTTY', { configurable: true, value: false });
		const originalFstat = fs.fstatSync;
		fs.fstatSync = () => {
			throw new Error('cannot stat');
		};
		try {
			st.equal(hasPipedData(), false, 'a failed fstat means no piped data');
		} finally {
			fs.fstatSync = originalFstat;
			if (ttyDescriptor) {
				Object.defineProperty(process.stdin, 'isTTY', ttyDescriptor);
			} else {
				delete process.stdin.isTTY;
			}
		}
		st.end();
	});

	t.end();
});

test('remote - removeDir swallows failures', (t) => {
	function removeBadArgument() {
		// a non-string argument makes fs.rmSync throw, which removeDir must swallow
		removeDir({});
	}
	t.doesNotThrow(removeBadArgument, 'a bad argument is ignored rather than thrown');
	t.end();
});

test('remote - cloneRepos', (t) => {
	t.test('clones a local repo over file://', async (st) => {
		const repoDir = makeLocalRepo('function fn(arr) { arr.push(1); }\n');
		let result;
		try {
			result = await cloneRepos([`file://${repoDir}`]);
			st.equal(result.clonedPaths.length, 1, 'clones the one repo');
			st.equal(result.tempDirs.length, 1, 'tracks one temp dir');
		} finally {
			if (result) {
				result.tempDirs.forEach(removeDir);
			}
			removeDir(repoDir);
		}
		st.end();
	});

	t.test('reports a warning when git is unavailable', async (st) => {
		const repoDir = makeLocalRepo('var x = 1;\n');
		const originalPath = process.env.PATH;
		process.env.PATH = path.join(os.tmpdir(), 'find-primordials-no-git-here');
		let result;
		try {
			result = await cloneRepos([`file://${repoDir}`]);
			st.equal(result.clonedPaths.length, 0, 'nothing clones without git');
			st.equal(result.tempDirs.length, 1, 'the attempted temp dir is still tracked');
		} finally {
			process.env.PATH = originalPath;
			if (result) {
				result.tempDirs.forEach(removeDir);
			}
			removeDir(repoDir);
		}
		st.end();
	});

	t.end();
});

test('remote - piped repos via the CLI', (t) => {
	t.test('analyzes a repo piped on stdin', async (st) => {
		const repoDir = makeLocalRepo('function fn(arr) { arr.push(1); }\n');
		try {
			const result = await runCLI([], { input: `file://${repoDir}\n# a comment is skipped\n\n` });
			st.ok(result.stderr.includes('Cloning'), 'reports cloning progress');
			st.ok(result.stdout.includes('push') || result.stderr.includes('push'), 'reports the piped repo findings');
		} finally {
			removeDir(repoDir);
		}
		st.end();
	});

	t.test('errors when stdin has no repos', async (st) => {
		const result = await runCLI([], { input: '\n   \n# only a comment\n' });
		st.equal(result.code, 2, 'exits with 2');
		st.ok(result.stderr.includes('No repos provided'), 'reports the empty input');
		st.end();
	});

	t.test('errors when every repo fails to clone', async (st) => {
		const result = await runCLI([], { input: 'file:///find-primordials/no/such/repo\n' });
		st.equal(result.code, 2, 'exits with 2');
		st.ok(result.stderr.includes('Failed to clone any repos'), 'reports the total failure');
		st.end();
	});

	t.end();
});

test('CLI - ignore file walking', (t) => {
	t.test('excludes gitignored files and survives unreadable directories', async (st) => {
		const dir = makeTree({
			'.gitignore': 'secret.js\n',
			'keep.js': 'function f(arr) { arr.push(1); }\n',
			'package.json': '{}\n',
			'secret.js': 'function f(arr) { arr.push(9); }\n',
			'sub/.gitignore': 'nested.js\n',
			'sub/keep2.js': 'function f(arr) { arr.push(2); }\n',
			'sub/nested.js': 'function f(arr) { arr.push(9); }\n',
		});
		const locked = path.join(dir, 'locked');
		fs.mkdirSync(locked);
		fs.chmodSync(locked, 0o000);
		try {
			const result = await runCLI([dir, '--include-safe']);
			st.notOk(result.stdout.includes('secret.js'), 'a root-gitignored file is excluded');
			st.notOk(result.stdout.includes('nested.js'), 'a nested-gitignored file is excluded');
			st.ok(result.stdout.includes('keep.js'), 'a kept file is still analyzed');
		} finally {
			fs.chmodSync(locked, 0o755);
			fs.rmSync(dir, { force: true, recursive: true });
		}
		st.end();
	});

	t.test('accepts extensions given without a leading dot', async (st) => {
		const dir = makeTree({ 'code.js': 'function f(arr) { arr.push(1); }\n' });
		try {
			const result = await runCLI([
				dir,
				'--include-safe',
				'--ext',
				'js',
			]);
			st.ok(result.stdout.includes('code.js'), 'analyzes .js when ext is given without a dot');
		} finally {
			fs.rmSync(dir, { force: true, recursive: true });
		}
		st.end();
	});

	t.end();
});

test('CLI - ignore config file', (t) => {
	t.test('applies an ignore config file', async (st) => {
		const dir = makeTree({
			'code.js': 'function f(arr) { arr.push(1); }\n',
			'ignore.json': '{ "names": ["push"] }\n',
		});
		try {
			const result = await runCLI([
				path.join(dir, 'code.js'),
				'--include-safe',
				'--ignore-config',
				path.join(dir, 'ignore.json'),
			]);
			st.equal(result.code, 0, 'the ignored name leaves no findings');
		} finally {
			fs.rmSync(dir, { force: true, recursive: true });
		}
		st.end();
	});

	t.test('errors on an unreadable ignore config', async (st) => {
		const result = await runCLI([
			'placeholder.js',
			'--ignore-config',
			'/find-primordials/no/such/ignore-config.json',
		]);
		st.equal(result.code, 2, 'exits with 2');
		st.ok(result.stderr.includes('Error reading ignore config'), 'reports the config error');
		st.end();
	});

	t.end();
});

test('CLI - output format branches', (t) => {
	t.test('--eslint uses singular wording for a single certain finding', async (st) => {
		const dir = makeTree({ 'one.js': 'function g() { return [1].push(2); }\n' });
		try {
			const result = await runCLI([
				path.join(dir, 'one.js'),
				'--include-safe',
				'--eslint',
			]);
			st.ok(result.stdout.includes('1 problem (1 error, 0 warnings)'), 'uses singular problem and error');
		} finally {
			fs.rmSync(dir, { force: true, recursive: true });
		}
		st.end();
	});

	t.test('--eslint joins the possible categories of an ambiguous finding', async (st) => {
		const dir = makeTree({ 'amb.js': 'function f(x) { return x.includes(1); }\n' });
		try {
			const result = await runCLI([
				path.join(dir, 'amb.js'),
				'--include-safe',
				'--eslint',
			]);
			st.ok(result.stdout.includes('Array/String/TypedArray'), 'lists the joined categories');
			st.ok(result.stdout.includes('1 problem (0 errors, 1 warning)'), 'uses plural errors, singular warning');
		} finally {
			fs.rmSync(dir, { force: true, recursive: true });
		}
		st.end();
	});

	t.test('TAP output classifies an ambiguous finding', async (st) => {
		const dir = makeTree({ 'amb.js': 'function f(x) { return x.includes(1); }\n' });
		try {
			const result = await runCLI([path.join(dir, 'amb.js'), '--include-safe']);
			st.ok(result.stdout.includes('.includes()'), 'reports the method');
			st.ok(result.stdout.includes('uncertain'), 'marks it uncertain');
		} finally {
			fs.rmSync(dir, { force: true, recursive: true });
		}
		st.end();
	});

	t.end();
});

test('CLI - failure paths', (t) => {
	t.test('exits when a piped repo has no matching files', async (st) => {
		const repoDir = makeLocalRepo('just some notes\n', 'notes.txt');
		try {
			const result = await runCLI([], { input: `file://${repoDir}\n` });
			st.equal(result.code, 2, 'exits with 2');
			st.ok(result.stderr.includes('No matching files found'), 'reports there were no files');
		} finally {
			removeDir(repoDir);
		}
		st.end();
	});

	t.test('surfaces a write failure while fixing', async (st) => {
		const dir = makeTree({ 'ro.js': 'function fn() { var arr = []; arr.push(1); }\n' });
		const file = path.join(dir, 'ro.js');
		fs.chmodSync(file, 0o444);
		try {
			const result = await runCLI([file, '--fix']);
			st.equal(result.code, 2, 'exits with 2 when the rewrite cannot be written');
			st.ok(result.stderr.includes('Error:'), 'reports the write error');
		} finally {
			fs.chmodSync(file, 0o644);
			fs.rmSync(dir, { force: true, recursive: true });
		}
		st.end();
	});

	t.end();
});
