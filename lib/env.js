'use strict';
/**
 * A single, correct reader for `config/keys.env`, shared by every script.
 *
 * Two things it must get right, because the template relies on both:
 *   - an INLINE COMMENT is not part of the value. `KEY=   # https://where-to-get-it` means the key is
 *     empty, not the string "   # https://...". Getting this wrong makes every keyed service look
 *     configured (with a URL where a token should be) and every health check fail confusingly.
 *   - a QUOTED value keeps whatever is inside the quotes, including a `#`.
 *
 * Precedence is the usual one: the real environment wins over the file, so a value exported in the
 * shell is not silently overridden by a stale file.
 */
const fs = require('fs');

/** Parse a KEY=VALUE file into an object. Bad lines are skipped, never fatal. */
function parseEnv(text) {
  const out = {};
  for (const raw of String(text).split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith('#')) continue;
    const m = line.match(/^(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/);
    if (!m) continue;
    out[m[1]] = parseValue(m[2]);
  }
  return out;
}

/** The value on the right of `=`, with quotes honoured and an inline comment stripped. */
function parseValue(rest) {
  let v = rest.trim();
  if (v.startsWith('"') || v.startsWith("'")) {
    const quote = v[0];
    const end = v.indexOf(quote, 1);
    return end === -1 ? v.slice(1).trim() : v.slice(1, end);
  }
  // Unquoted: a `#` that begins a word starts a comment. A `#` inside a token (a password) does not.
  const hash = v.search(/(^|\s)#/);
  if (hash !== -1) v = v.slice(0, hash);
  return v.trim();
}

/** Read a file into an object; a missing or unreadable file is an empty object, not an error. */
function loadEnvFile(file) {
  try { return parseEnv(fs.readFileSync(file, 'utf8')); } catch { return {}; }
}

/**
 * The environment the kit should run with: `process.env` underneath, the file's values on top.
 * The file wins, matching the original `set -a; . config/keys.env` behaviour — keys.env IS the
 * kit's configuration, so a stray exported variable must not silently override it.
 */
function kitEnv(file) {
  return { ...process.env, ...loadEnvFile(file) };
}

module.exports = { parseEnv, parseValue, loadEnvFile, kitEnv };
