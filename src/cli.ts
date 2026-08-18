#!/usr/bin/env node
import { readFileSync } from 'node:fs';
import { lintMarkdown } from './linter';

function main(argv: string[]): number {
  const paths = argv.slice(2);
  if (paths.length === 0) {
    console.error('usage: md-table-lint <file.md> [file2.md ...]');
    return 1;
  }

  let hasError = false;
  for (const path of paths) {
    let text: string;
    try {
      text = readFileSync(path, 'utf8');
    } catch (err) {
      console.error(`${path}: cannot read file (${(err as Error).message})`);
      hasError = true;
      continue;
    }

    const findings = lintMarkdown(text);
    for (const f of findings) {
      console.log(`${path}:${f.line}: ${f.severity} [${f.rule}] ${f.message}`);
      if (f.severity === 'error') hasError = true;
    }
  }
  return hasError ? 1 : 0;
}

process.exit(main(process.argv));
