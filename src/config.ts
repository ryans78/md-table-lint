export type RuleName = 'column-count-mismatch' | 'invalid-separator' | 'empty-header-cell';

export const RULE_NAMES: RuleName[] = [
  'column-count-mismatch',
  'invalid-separator',
  'empty-header-cell',
];

export interface Config {
  rules: Record<RuleName, boolean>;
}

export function defaultConfig(): Config {
  return {
    rules: {
      'column-count-mismatch': true,
      'invalid-separator': true,
      'empty-header-cell': true,
    },
  };
}

export interface MergeResult {
  config: Config;
  unknownRules: string[];
}

// Merges a config object (as parsed from JSON) over the defaults. A rule is
// disabled only if its value is exactly `false`; anything else (including
// omission) leaves it enabled, so a config file only needs to list the
// rules it wants to turn off.
export function mergeConfig(raw: unknown): MergeResult {
  const config = defaultConfig();
  const unknownRules: string[] = [];

  if (raw === null || typeof raw !== 'object') {
    return { config, unknownRules };
  }

  const rawRules = (raw as { rules?: unknown }).rules;
  if (rawRules === null || typeof rawRules !== 'object') {
    return { config, unknownRules };
  }

  for (const [name, value] of Object.entries(rawRules as Record<string, unknown>)) {
    if (!RULE_NAMES.includes(name as RuleName)) {
      unknownRules.push(name);
      continue;
    }
    config.rules[name as RuleName] = value !== false;
  }

  return { config, unknownRules };
}
