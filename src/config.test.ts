import { test } from 'node:test';
import assert from 'node:assert/strict';
import { defaultConfig, mergeConfig } from './config';

test('default config has every rule enabled', () => {
  const config = defaultConfig();
  assert.deepStrictEqual(config.rules, {
    'column-count-mismatch': true,
    'invalid-separator': true,
    'empty-header-cell': true,
  });
});

test('mergeConfig disables a rule set to false', () => {
  const { config, unknownRules } = mergeConfig({ rules: { 'empty-header-cell': false } });
  assert.strictEqual(config.rules['empty-header-cell'], false);
  assert.strictEqual(config.rules['column-count-mismatch'], true);
  assert.deepStrictEqual(unknownRules, []);
});

test('mergeConfig treats any non-false value as enabled', () => {
  const { config } = mergeConfig({ rules: { 'invalid-separator': true } });
  assert.strictEqual(config.rules['invalid-separator'], true);
});

test('mergeConfig reports unknown rule names without touching known ones', () => {
  const { config, unknownRules } = mergeConfig({ rules: { 'not-a-real-rule': false } });
  assert.deepStrictEqual(unknownRules, ['not-a-real-rule']);
  assert.deepStrictEqual(config.rules, defaultConfig().rules);
});

test('mergeConfig falls back to defaults for missing or malformed input', () => {
  assert.deepStrictEqual(mergeConfig({}).config.rules, defaultConfig().rules);
  assert.deepStrictEqual(mergeConfig(null).config.rules, defaultConfig().rules);
  assert.deepStrictEqual(mergeConfig({ rules: null }).config.rules, defaultConfig().rules);
  assert.deepStrictEqual(mergeConfig('not an object').config.rules, defaultConfig().rules);
});
