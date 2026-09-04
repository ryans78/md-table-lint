#!/usr/bin/env node
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { defaultConfig, mergeConfig, Config } from './config';
import { fixMarkdown, lintMarkdown } from './linter';

const DEFAULT_CONFIG_NAME = '.md-table-lintrc.json';

// Looks for the default config file in the current directory unless an
// explicit path was passed with --config. Returns undefined when there's
// nothing to load, so the caller falls back to every rule enabled.
function findConfigPath(explicitPath: string | undefined): string | undefined {
  if (explicitPath) return explicitPath;
  const candidate = join(process.cwd(), DEFAULT_CONFIG_NAME);
  return existsSync(candidate) ? candidate : undefined;
}

function loadConfig(explicitPath: string | undefined): Config | undefined {
  const path = findConfigPath(explicitPath);
  if (!path) return defaultConfig();

  let raw: unknown;
  try {
    raw = JSON.parse(readFileSync(path, 'utf8'));
  } catch (err) {
    console.error(`${path}: invalid config (${(err as Error).message})`);
    return undefined;
  }

  const { config, unknownRules } = mergeConfig(raw);
  for (const name of unknownRules) {
    console.error(`${path}: warning: unknown rule "${name}" ignored`);
  }
  return config;
}

function main(argv: string[]): number {
  const args = argv.slice(2);
  const fix = args.includes('--fix');
  const configFlagIndex = args.indexOf('--config');
  const explicitConfigPath = configFlagIndex === -1 ? undefined : args[configFlagIndex + 1];
  const paths = args.filter((a, idx) => {
    if (a === '--fix') return false;
    if (a === '--config') return false;
    if (idx === configFlagIndex + 1 && explicitConfigPath !== undefined) return false;
    return true;
  });
  if (paths.length === 0) {
    console.error('usage: md-table-lint [--fix] [--config <path>] <file.md> [file2.md ...]');
    return 1;
  }

  const config = loadConfig(explicitConfigPath);
  if (config === undefined) return 1;

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

    if (fix) {
      const fixed = fixMarkdown(text);
      if (fixed !== text) {
        writeFileSync(path, fixed);
        console.log(`${path}: fixed`);
        text = fixed;
      }
    }

    const findings = lintMarkdown(text, { rules: config.rules });
    for (const f of findings) {
      console.log(`${path}:${f.line}: ${f.severity} [${f.rule}] ${f.message}`);
      if (f.severity === 'error') hasError = true;
    }
  }
  return hasError ? 1 : 0;
}

process.exit(main(process.argv));
