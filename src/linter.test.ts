import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fixMarkdown, lintMarkdown, Finding } from './linter';

function rules(findings: Finding[]): string[] {
  return findings.map((f) => f.rule);
}

test('valid table produces no findings', () => {
  const md = ['| Name | Role |', '| --- | --- |', '| Ada | Engineer |'].join('\n');
  assert.deepStrictEqual(lintMarkdown(md), []);
});

test('separator with wrong column count is flagged with correct line', () => {
  const md = ['| Name | Role | Notes |', '| --- | --- |', '| Ada | Engineer | Q1 |'].join('\n');
  const findings = lintMarkdown(md);
  assert.deepStrictEqual(rules(findings), ['column-count-mismatch']);
  assert.strictEqual(findings[0].line, 2);
});

test('body row with wrong column count is flagged with correct line', () => {
  const md = ['| Name | Role |', '| --- | --- |', '| Ada | Engineer | Extra |'].join('\n');
  const findings = lintMarkdown(md);
  assert.deepStrictEqual(rules(findings), ['column-count-mismatch']);
  assert.strictEqual(findings[0].line, 3);
});

test('invalid separator syntax is flagged per column', () => {
  const md = ['| Name | Role |', '| --- | === |', '| Ada | Engineer |'].join('\n');
  const findings = lintMarkdown(md);
  assert.deepStrictEqual(rules(findings), ['invalid-separator']);
  assert.match(findings[0].message, /column 2/);
});

test('empty header cell is flagged', () => {
  const md = ['| Name |  |', '| --- | --- |', '| Ada | Engineer |'].join('\n');
  const findings = lintMarkdown(md);
  assert.deepStrictEqual(rules(findings), ['empty-header-cell']);
  assert.strictEqual(findings[0].line, 1);
});

test('escaped pipe inside a cell does not count as a column separator', () => {
  const md = [
    '| Name | Formula |',
    '| --- | --- |',
    '| Ada | a \\| b |',
  ].join('\n');
  assert.deepStrictEqual(lintMarkdown(md), []);
});

test('escaped pipe adjacent to real column boundary still splits correctly', () => {
  const md = [
    '| A | B | C |',
    '| --- | --- | --- |',
    '| x\\|y | z | \\|leading |',
  ].join('\n');
  assert.deepStrictEqual(lintMarkdown(md), []);
});

test('table with no data rows is still checked for header and separator', () => {
  const md = ['| A | B |', '| --- |'].join('\n');
  const findings = lintMarkdown(md);
  assert.deepStrictEqual(rules(findings), ['column-count-mismatch']);
});

test('two tables in one document keep independent, correct line numbers', () => {
  const md = [
    '| A | B |',
    '| --- | --- |',
    '| 1 | 2 |',
    '',
    'some text',
    '',
    '| X | Y |',
    '| --- |',
    '| 1 | 2 |',
  ].join('\n');
  const findings = lintMarkdown(md);
  assert.deepStrictEqual(rules(findings), ['column-count-mismatch', 'column-count-mismatch']);
  assert.strictEqual(findings[0].line, 8);
  assert.strictEqual(findings[1].line, 9);
});

test('a line with a pipe that is not followed by a separator line is not treated as a table', () => {
  const md = ['a | b', 'plain text after'].join('\n');
  assert.deepStrictEqual(lintMarkdown(md), []);
});

test('table row without leading/trailing pipes is parsed the same as one with them', () => {
  const md = ['A | B', '--- | ---', '1 | 2'].join('\n');
  assert.deepStrictEqual(lintMarkdown(md), []);
});

test('table detection ends at a blank line', () => {
  const md = ['| A | B |', '| --- | --- |', '| 1 | 2 |', '', '| 3 | 4 | 5 |'].join('\n');
  assert.deepStrictEqual(lintMarkdown(md), []);
});

test('a bare dash line after pipe-containing text is a setext heading, not a table', () => {
  const md = ['Some text | with a pipe in it', '---', 'more text'].join('\n');
  assert.deepStrictEqual(lintMarkdown(md), []);
});

test('a thematic break after pipe-containing text is not treated as a table', () => {
  const md = ['a paragraph with a | in it', '***', 'next paragraph'].join('\n');
  assert.deepStrictEqual(lintMarkdown(md), []);
});

test('a single-column table still needs a pipe on the separator row to be recognized', () => {
  const md = ['| Name |', '| --- |', '| Ada |'].join('\n');
  assert.deepStrictEqual(lintMarkdown(md), []);
});

test('a broken-looking table inside a fenced code block is not linted', () => {
  const md = [
    '```',
    '| A | B | C |',
    '| --- |',
    '| 1 | 2 |',
    '```',
  ].join('\n');
  assert.deepStrictEqual(lintMarkdown(md), []);
});

test('a real table after a closed fence is still linted', () => {
  const md = [
    '```',
    '| A | B |',
    '| --- |',
    '```',
    '',
    '| X | Y |',
    '| --- |',
    '| 1 | 2 |',
  ].join('\n');
  const findings = lintMarkdown(md);
  assert.deepStrictEqual(rules(findings), ['column-count-mismatch']);
  assert.strictEqual(findings[0].line, 7);
});

test('tilde fences are also treated as code blocks', () => {
  const md = ['~~~', '| A | B | C |', '| --- |', '~~~'].join('\n');
  assert.deepStrictEqual(lintMarkdown(md), []);
});

test('a fence closer shorter than its opener does not close the block', () => {
  const md = ['````', '``', '| A | B | C |', '| --- |', '````'].join('\n');
  assert.deepStrictEqual(lintMarkdown(md), []);
});

function pipeOffsets(line: string): number[] {
  const offsets: number[] = [];
  for (let i = 0; i < line.length; i++) {
    if (line[i] === '|') offsets.push(i);
  }
  return offsets;
}

function cellsOf(line: string): string[] {
  return line.slice(1, -1).split('|').map((c) => c.trim());
}

test('fix pads a short row and aligns every column to the widest cell', () => {
  const md = ['| Name | Role |', '| --- | --- |', '| Ada | Engineer |', '| Grace |'].join('\n');
  const fixed = fixMarkdown(md);
  const lines = fixed.split('\n');
  assert.strictEqual(lines.length, 4);
  for (const line of lines.slice(1)) {
    assert.deepStrictEqual(pipeOffsets(line), pipeOffsets(lines[0]));
  }
  assert.deepStrictEqual(cellsOf(lines[0]), ['Name', 'Role']);
  assert.deepStrictEqual(cellsOf(lines[2]), ['Ada', 'Engineer']);
  assert.deepStrictEqual(cellsOf(lines[3]), ['Grace', '']);
  assert.match(cellsOf(lines[1])[0], /^-+$/);
  assert.match(cellsOf(lines[1])[1], /^-+$/);
  assert.deepStrictEqual(lintMarkdown(fixed), []);
});

test('fix normalizes an invalid separator cell while preserving valid alignment colons', () => {
  const md = ['| A | B | C |', '| :-- | -:- | --: |', '| 1 | 2 | 3 |'].join('\n');
  const fixed = fixMarkdown(md);
  const sepCells = cellsOf(fixed.split('\n')[1]);
  assert.strictEqual(sepCells[0][0], ':');
  assert.strictEqual(sepCells[1], '---');
  assert.strictEqual(sepCells[2].slice(-1), ':');
  assert.deepStrictEqual(lintMarkdown(fixed), []);
});

test('fix leaves a row with too many cells untouched but still fixes the rest of the table', () => {
  const md = ['| A | B |', '| --- | --- |', '| 1 | 2 | 3 |'].join('\n');
  const fixed = fixMarkdown(md);
  const lines = fixed.split('\n');
  assert.strictEqual(lines[2], '| 1 | 2 | 3 |');
  const findings = lintMarkdown(fixed);
  assert.deepStrictEqual(rules(findings), ['column-count-mismatch']);
  assert.strictEqual(findings[0].line, 3);
});

test('fix does not touch tables inside fenced code blocks', () => {
  const md = ['```', '| A | B | C |', '| --- |', '```'].join('\n');
  assert.strictEqual(fixMarkdown(md), md);
});

test('fix is idempotent', () => {
  const md = ['| Name | Role |', '| --- | --- |', '| Ada | Engineer |', '| Grace |'].join('\n');
  const once = fixMarkdown(md);
  assert.strictEqual(fixMarkdown(once), once);
});

test('disabling a rule via options suppresses its findings but not others', () => {
  const md = ['| Name |  |', '| --- | === |', '| Ada | Engineer |'].join('\n');
  const all = lintMarkdown(md);
  assert.deepStrictEqual(rules(all).sort(), ['empty-header-cell', 'invalid-separator']);

  const filtered = lintMarkdown(md, { rules: { 'empty-header-cell': false } });
  assert.deepStrictEqual(rules(filtered), ['invalid-separator']);
});

test('fix preserves CRLF line endings', () => {
  const md = ['| A | B |', '| --- | --- |', '| 1 | 2 |'].join('\r\n');
  const fixed = fixMarkdown(md);
  assert.strictEqual(/(?<!\r)\n/.test(fixed), false);
});
