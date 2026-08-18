export type Severity = 'error' | 'warning';

export interface Finding {
  line: number;
  rule: string;
  severity: Severity;
  message: string;
}

// Splits a table row on unescaped pipes and drops the empty cells produced
// by a leading/trailing pipe (`| a | b |` -> ["a", "b"], not ["", "a", "b", ""]).
function splitTableRow(line: string): string[] {
  const trimmed = line.trim();
  const cells: string[] = [];
  let current = '';
  for (let i = 0; i < trimmed.length; i++) {
    const ch = trimmed[i];
    if (ch === '\\' && trimmed[i + 1] === '|') {
      current += '|';
      i++;
      continue;
    }
    if (ch === '|') {
      cells.push(current);
      current = '';
      continue;
    }
    current += ch;
  }
  cells.push(current);
  if (trimmed.startsWith('|')) cells.shift();
  if (trimmed.endsWith('|')) cells.pop();
  return cells.map((c) => c.trim());
}

function isSeparatorCell(cell: string): boolean {
  return /^:?-+:?$/.test(cell.trim());
}

// A candidate delimiter row: only made of pipes, dashes, colons and
// whitespace, with at least one dash. This is a heuristic, not a full GFM
// parser, so it can misfire on a thematic break line right after a
// paragraph that happens to contain a pipe.
function isSeparatorLine(line: string): boolean {
  const t = line.trim();
  if (t === '' || !t.includes('-')) return false;
  return /^[\s|:-]+$/.test(t);
}

export function lintMarkdown(text: string): Finding[] {
  const lines = text.split(/\r?\n/);
  const findings: Finding[] = [];
  let i = 0;
  while (i < lines.length) {
    const line = lines[i];
    const next = lines[i + 1];
    if (line.includes('|') && next !== undefined && isSeparatorLine(next)) {
      i = lintTable(lines, i, findings);
    } else {
      i++;
    }
  }
  return findings;
}

// Lints one table starting at `start` (the header line) and returns the
// index of the first line after it, so the caller can keep scanning.
function lintTable(lines: string[], start: number, findings: Finding[]): number {
  const headerLineNo = start + 1;
  const header = splitTableRow(lines[start]);
  const sepLineNo = start + 2;
  const sepCells = splitTableRow(lines[start + 1]);

  header.forEach((cell, idx) => {
    if (cell === '') {
      findings.push({
        line: headerLineNo,
        rule: 'empty-header-cell',
        severity: 'warning',
        message: `column ${idx + 1} has an empty header`,
      });
    }
  });

  if (sepCells.length !== header.length) {
    findings.push({
      line: sepLineNo,
      rule: 'column-count-mismatch',
      severity: 'error',
      message: `separator row has ${sepCells.length} column(s), header has ${header.length}`,
    });
  }

  sepCells.forEach((cell, idx) => {
    if (!isSeparatorCell(cell)) {
      findings.push({
        line: sepLineNo,
        rule: 'invalid-separator',
        severity: 'error',
        message: `column ${idx + 1} separator "${cell}" is not valid (use -, :-, -:, or :-:)`,
      });
    }
  });

  let i = start + 2;
  while (i < lines.length) {
    const line = lines[i];
    if (line.trim() === '' || !line.includes('|')) break;
    const row = splitTableRow(line);
    if (row.length !== header.length) {
      findings.push({
        line: i + 1,
        rule: 'column-count-mismatch',
        severity: 'error',
        message: `row has ${row.length} column(s), header has ${header.length}`,
      });
    }
    i++;
  }
  return i;
}
