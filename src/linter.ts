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
// whitespace, with at least one dash and at least one pipe. The pipe is
// required because a bare dash run (`---`) right after a text line is
// ambiguous with a setext heading underline or a thematic break, and GFM
// itself resolves that ambiguity in favor of the heading/break, not a
// table, when there's no pipe to make the table syntax unambiguous.
function isSeparatorLine(line: string): boolean {
  const t = line.trim();
  if (t === '' || !t.includes('-') || !t.includes('|')) return false;
  return /^[\s|:-]+$/.test(t);
}

// Matches a fenced code block delimiter (``` or ~~~, at least three chars,
// up to 3 leading spaces of indentation per CommonMark).
const FENCE_RE = /^ {0,3}(`{3,}|~{3,})/;

export interface LintOptions {
  // Maps a rule name to false to suppress its findings. Rules absent from
  // this map, or set to anything other than false, stay enabled.
  rules?: Record<string, boolean>;
}

export function lintMarkdown(text: string, options: LintOptions = {}): Finding[] {
  const lines = text.split(/\r?\n/);
  const findings: Finding[] = [];
  let i = 0;
  let fence: { char: string; len: number } | null = null;
  while (i < lines.length) {
    const line = lines[i];
    const fenceMatch = line.match(FENCE_RE);
    if (fenceMatch) {
      const marker = fenceMatch[1];
      if (fence === null) {
        fence = { char: marker[0], len: marker.length };
      } else if (marker[0] === fence.char && marker.length >= fence.len) {
        fence = null;
      }
      i++;
      continue;
    }
    if (fence !== null) {
      i++;
      continue;
    }
    const next = lines[i + 1];
    if (line.includes('|') && next !== undefined && isSeparatorLine(next)) {
      i = lintTable(lines, i, findings);
    } else {
      i++;
    }
  }
  return findings.filter((f) => options.rules?.[f.rule] !== false);
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

interface RawTable {
  header: string[];
  sepCells: string[];
  dataRows: { cells: string[]; line: string }[];
}

// Gathers the raw rows of one table (without judging them) so fixMarkdown
// can rebuild it. Mirrors the scanning logic in lintTable.
function collectTable(lines: string[], start: number): { table: RawTable; consumed: number } {
  const header = splitTableRow(lines[start]);
  const sepCells = splitTableRow(lines[start + 1]);
  const dataRows: { cells: string[]; line: string }[] = [];
  let i = start + 2;
  while (i < lines.length) {
    const line = lines[i];
    if (line.trim() === '' || !line.includes('|')) break;
    dataRows.push({ cells: splitTableRow(line), line });
    i++;
  }
  return { table: { header, sepCells, dataRows }, consumed: i };
}

// Rebuilds a table with every column padded to the same width and the
// separator row's alignment colons preserved. A data row with more cells
// than the header can't be reflowed without guessing which cell is
// spurious, so it's left as-is and still surfaces as a finding.
function renderTable(table: RawTable): string[] {
  const targetCols = table.header.length;

  const align = Array.from({ length: targetCols }, (_, idx) => {
    const cell = table.sepCells[idx];
    if (cell !== undefined && isSeparatorCell(cell)) {
      return { left: cell.startsWith(':'), right: cell.endsWith(':') };
    }
    return { left: false, right: false };
  });

  const fixedRows: (string[] | null)[] = table.dataRows.map((row) => {
    if (row.cells.length > targetCols) return null;
    if (row.cells.length < targetCols) {
      return [...row.cells, ...Array(targetCols - row.cells.length).fill('')];
    }
    return row.cells;
  });

  const widths = Array.from({ length: targetCols }, (_, idx) => {
    let w = Math.max(3, table.header[idx].length);
    for (const row of fixedRows) {
      if (row) w = Math.max(w, row[idx].length);
    }
    return w;
  });

  const renderRow = (cells: string[]): string =>
    '| ' + cells.map((c, idx) => c.padEnd(widths[idx])).join(' | ') + ' |';

  const renderSep = (): string =>
    '| ' +
    align
      .map(({ left, right }, idx) => {
        const dashLen = widths[idx] - (left ? 1 : 0) - (right ? 1 : 0);
        return (left ? ':' : '') + '-'.repeat(Math.max(1, dashLen)) + (right ? ':' : '');
      })
      .join(' | ') +
    ' |';

  const lines = [renderRow(table.header), renderSep()];
  fixedRows.forEach((row, idx) => {
    lines.push(row ? renderRow(row) : table.dataRows[idx].line);
  });
  return lines;
}

// Rewrites every pipe table in `text`: pads rows to the header's column
// count, normalizes the separator row's dashes/colons, and aligns column
// widths. Rows with extra cells and non-table content are left untouched.
export function fixMarkdown(text: string): string {
  const usesCRLF = text.includes('\r\n');
  const lines = text.split(/\r?\n/);
  const out: string[] = [];
  let i = 0;
  let fence: { char: string; len: number } | null = null;
  while (i < lines.length) {
    const line = lines[i];
    const fenceMatch = line.match(FENCE_RE);
    if (fenceMatch) {
      const marker = fenceMatch[1];
      if (fence === null) {
        fence = { char: marker[0], len: marker.length };
      } else if (marker[0] === fence.char && marker.length >= fence.len) {
        fence = null;
      }
      out.push(line);
      i++;
      continue;
    }
    if (fence !== null) {
      out.push(line);
      i++;
      continue;
    }
    const next = lines[i + 1];
    if (line.includes('|') && next !== undefined && isSeparatorLine(next)) {
      const { table, consumed } = collectTable(lines, i);
      out.push(...renderTable(table));
      i = consumed;
    } else {
      out.push(line);
      i++;
    }
  }
  const joined = out.join('\n');
  return usesCRLF ? joined.replace(/\n/g, '\r\n') : joined;
}
