import { test } from 'node:test';
import assert from 'node:assert/strict';
import { lintMarkdown, Finding } from './linter';

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
