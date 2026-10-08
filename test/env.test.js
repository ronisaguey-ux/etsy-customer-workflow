#!/usr/bin/env node
'use strict';
/**
 * Tests for the shared env reader. This is the bug that made the kit look "connected" with a URL
 * where a token should be: an inline comment in keys.env was being read as the value.
 */
const { parseEnv, parseValue, loadEnvFile, kitEnv } = require('../lib/env.js');
const fs = require('fs');
const os = require('os');
const path = require('path');

let pass = 0, fail = 0;
const t = (n, c) => { if (c) { pass++; console.log('  ok  ' + n); } else { fail++; console.log('FAIL  ' + n); } };

console.log('env parser');

t('an inline comment is stripped and the key is EMPTY, not a URL', parseEnv('KEY=   # https://x').KEY === '');
t('a plain value survives', parseEnv('KEY=value').KEY === 'value');
t('a trailing comment is stripped', parseEnv('KEY=value # note').KEY === 'value');
t('a quoted value keeps its #', parseEnv('KEY="a # b"').KEY === 'a # b');
t("single quotes work too", parseEnv("KEY='a # b'").KEY === 'a # b');
t('a # inside a token is kept (a password can contain one)', parseEnv('KEY=abc#def').KEY === 'abc#def');
t('an empty assignment is empty', parseEnv('KEY=').KEY === '');
t('a fully-commented line is skipped', parseEnv('# KEY=x').KEY === undefined);
t('the export form works', parseEnv('export KEY=x').KEY === 'x');
t('whitespace around = is tolerated', parseEnv('KEY   =   x').KEY === 'x');
t('a malformed line is skipped, not fatal', Object.keys(parseEnv('not a kv line')).length === 0);
t('CRLF line endings are handled', parseEnv('A=1\r\nB=2').B === '2');

t('parseValue: quoted empty is empty', parseValue('""') === '');
t('parseValue: unquoted trailing spaces trimmed', parseValue('  x  ') === 'x');

// A missing file is empty, never an error.
t('a missing file yields {}', Object.keys(loadEnvFile('/no/such/file.env')).length === 0);

// kitEnv: the file wins over the ambient environment (matches keys.env being the config).
const tmp = path.join(os.tmpdir(), `kit-env-test-${Date.now()}.env`);
fs.writeFileSync(tmp, 'PROBE=fromfile\n');
try {
  process.env.PROBE = 'fromenv';
  t('kitEnv: the file wins over the ambient env', kitEnv(tmp).PROBE === 'fromfile');
  delete process.env.PROBE;
  t('kitEnv: the file value is present when env has none', kitEnv(tmp).PROBE === 'fromfile');
} finally { fs.rmSync(tmp, { force: true }); delete process.env.PROBE; }

// The real template must parse to EMPTY values for the uncommented keys, or the bug is back.
const example = path.join(__dirname, '..', 'config', 'keys.env.example');
if (fs.existsSync(example)) {
  const parsed = loadEnvFile(example);
  t('the shipped template parses DEEPSEEK_API_KEY as empty', parsed.DEEPSEEK_API_KEY === '');
  t('the shipped template parses ORCAROUTER_API_KEY as empty, not a URL', parsed.ORCAROUTER_API_KEY === '');
  t('the shipped template parses SHOPIFY_SHOP as empty, not a comment', parsed.SHOPIFY_SHOP === '');
  t('the shipped template keeps a real default (DEEPSEEK_BASE_URL)', /^https:\/\//.test(parsed.DEEPSEEK_BASE_URL || ''));
  t('the shipped template keeps SHOPIFY_API_VERSION', parsed.SHOPIFY_API_VERSION === '2025-10');
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
