import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { main } from './cli';

// main() writes to console.log/console.error; these helpers capture that
// output for the duration of one call so tests can assert on it without
// leaking a mock into other tests.
function withCapturedOutput(fn: () => number): { code: number; out: string[]; err: string[] } {
  const out: string[] = [];
  const err: string[] = [];
  const originalLog = console.log;
  const originalError = console.error;
  console.log = (...args: unknown[]) => out.push(args.join(' '));
  console.error = (...args: unknown[]) => err.push(args.join(' '));
  try {
    const code = fn();
    return { code, out, err };
  } finally {
    console.log = originalLog;
    console.error = originalError;
  }
}

function makeTmpDir(): string {
  return mkdtempSync(join(tmpdir(), 'md-table-lint-cli-'));
}

test('prints usage and returns 1 when no file paths are given', () => {
  const { code, err } = withCapturedOutput(() => main(['node', 'cli.js']));
  assert.strictEqual(code, 1);
  assert.match(err[0], /usage: md-table-lint/);
});

test('prints usage and returns 1 when only flags are given', () => {
  const { code, err } = withCapturedOutput(() => main(['node', 'cli.js', '--fix']));
  assert.strictEqual(code, 1);
  assert.match(err[0], /usage: md-table-lint/);
});

test('returns 0 for a valid file and reports nothing', () => {
  const dir = makeTmpDir();
  try {
    const file = join(dir, 'good.md');
    writeFileSync(file, '| A | B |\n| --- | --- |\n| 1 | 2 |\n');
    const { code, out } = withCapturedOutput(() => main(['node', 'cli.js', file]));
    assert.strictEqual(code, 0);
    assert.deepStrictEqual(out, []);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('returns 1 and reports the line for a file with an error-level finding', () => {
  const dir = makeTmpDir();
  try {
    const file = join(dir, 'bad.md');
    writeFileSync(file, '| A | B |\n| --- |\n| 1 | 2 |\n');
    const { code, out } = withCapturedOutput(() => main(['node', 'cli.js', file]));
    assert.strictEqual(code, 1);
    assert.strictEqual(out.length, 1);
    assert.match(out[0], /bad\.md:2: error \[column-count-mismatch\]/);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('returns 1 and reports an unreadable file without touching later ones', () => {
  const dir = makeTmpDir();
  try {
    const missing = join(dir, 'missing.md');
    const good = join(dir, 'good.md');
    writeFileSync(good, '| A | B |\n| --- | --- |\n| 1 | 2 |\n');
    const { code, err, out } = withCapturedOutput(() => main(['node', 'cli.js', missing, good]));
    assert.strictEqual(code, 1);
    assert.match(err[0], /missing\.md: cannot read file/);
    assert.deepStrictEqual(out, []);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('--config points at an explicit rc file and disables the named rule', () => {
  const dir = makeTmpDir();
  try {
    const file = join(dir, 'doc.md');
    writeFileSync(file, '| A |  |\n| --- | --- |\n| 1 | 2 |\n');
    const rc = join(dir, 'custom.json');
    writeFileSync(rc, JSON.stringify({ rules: { 'empty-header-cell': false } }));
    const { code, out } = withCapturedOutput(() => main(['node', 'cli.js', '--config', rc, file]));
    assert.strictEqual(code, 0);
    assert.deepStrictEqual(out, []);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('an invalid --config file is reported and stops the run', () => {
  const dir = makeTmpDir();
  try {
    const file = join(dir, 'doc.md');
    writeFileSync(file, '| A | B |\n| --- | --- |\n| 1 | 2 |\n');
    const rc = join(dir, 'broken.json');
    writeFileSync(rc, '{ not json');
    const { code, err } = withCapturedOutput(() => main(['node', 'cli.js', '--config', rc, file]));
    assert.strictEqual(code, 1);
    assert.match(err[0], /invalid config/);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('an unknown rule name in --config warns but still runs the lint', () => {
  const dir = makeTmpDir();
  try {
    const file = join(dir, 'doc.md');
    writeFileSync(file, '| A | B |\n| --- | --- |\n| 1 | 2 |\n');
    const rc = join(dir, 'custom.json');
    writeFileSync(rc, JSON.stringify({ rules: { 'not-a-real-rule': false } }));
    const { code, err, out } = withCapturedOutput(() => main(['node', 'cli.js', '--config', rc, file]));
    assert.strictEqual(code, 0);
    assert.match(err[0], /unknown rule "not-a-real-rule"/);
    assert.deepStrictEqual(out, []);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('--fix rewrites the file in place and re-lints the fixed version', () => {
  const dir = makeTmpDir();
  try {
    const file = join(dir, 'doc.md');
    writeFileSync(file, '| Name | Role |\n| --- | --- |\n| Grace |\n');
    const { code, out } = withCapturedOutput(() => main(['node', 'cli.js', '--fix', file]));
    assert.strictEqual(code, 0);
    assert.match(out[0], /doc\.md: fixed/);
    const rewritten = readFileSync(file, 'utf8');
    assert.match(rewritten, /Grace\s*\|\s*\|/);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('--fix does not rewrite or report a file that is already clean', () => {
  const dir = makeTmpDir();
  try {
    const file = join(dir, 'doc.md');
    writeFileSync(file, '| A | B |\n| --- | --- |\n| 1  | 2  |\n');
    withCapturedOutput(() => main(['node', 'cli.js', '--fix', file]));
    const alreadyFixed = readFileSync(file, 'utf8');

    const { code, out } = withCapturedOutput(() => main(['node', 'cli.js', '--fix', file]));
    assert.strictEqual(code, 0);
    assert.deepStrictEqual(out, []);
    assert.strictEqual(readFileSync(file, 'utf8'), alreadyFixed);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('--fix and --config combine regardless of order', () => {
  const dir = makeTmpDir();
  try {
    const file = join(dir, 'doc.md');
    writeFileSync(file, '| A |  |\n| --- | --- |\n| 1 | 2 |\n');
    const rc = join(dir, 'custom.json');
    writeFileSync(rc, JSON.stringify({ rules: { 'empty-header-cell': false } }));
    const { code: codeA } = withCapturedOutput(() =>
      main(['node', 'cli.js', '--fix', '--config', rc, file])
    );
    assert.strictEqual(codeA, 0);

    writeFileSync(file, '| A |  |\n| --- | --- |\n| 1 | 2 |\n');
    const { code: codeB } = withCapturedOutput(() =>
      main(['node', 'cli.js', '--config', rc, '--fix', file])
    );
    assert.strictEqual(codeB, 0);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
