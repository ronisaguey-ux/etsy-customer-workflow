#!/usr/bin/env node
'use strict';
/**
 * check-updates.js — is anything in the kit stale? Cross-platform.
 *
 * The kit clones several tool repos it does not vendor. If one drifts behind its GitHub, the agent
 * silently keeps running older behaviour. This reports every clone that is behind, and with
 * `--update` fast-forwards the ones that can be.
 *
 *   node scripts/check-updates.js            report only
 *   node scripts/check-updates.js --update   fast-forward anything behind (never a merge)
 *   node scripts/check-updates.js --quiet    print only what is stale (for a scheduled job)
 *
 * A clone with local changes, or one that has diverged, is reported and left alone — this never
 * merges and never discards work. Exit 0 when everything is current, 1 when something is stale.
 */
const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const KIT = path.resolve(__dirname, '..');
const UPDATE = process.argv.includes('--update');
const QUIET = process.argv.includes('--quiet');
const say = (m) => { if (!QUIET) console.log(m); };

function git(cwd, args) {
  const r = spawnSync('git', ['-C', cwd, ...args], { encoding: 'utf8' });
  return { ok: r.status === 0, out: (r.stdout || '').trim(), err: (r.stderr || '').trim() };
}

let stale = 0, found = 0;

function checkRepo(dir, name) {
  if (!fs.existsSync(path.join(dir, '.git'))) return;
  found++;
  const origin = git(dir, ['remote', 'get-url', 'origin']);
  if (!origin.ok) { say(`  ?     ${name} — no origin, cannot check`); return; }
  const fetch = git(dir, ['fetch', '--quiet']);
  if (!fetch.ok) { say(`  ?     ${name} — could not reach the remote (offline?)`); return; }
  const up = git(dir, ['rev-parse', '--abbrev-ref', '--symbolic-full-name', '@{u}']);
  if (!up.ok) { say(`  ?     ${name} — no upstream branch`); return; }
  const behind = Number(git(dir, ['rev-list', '--count', `HEAD..${up.out}`]).out) || 0;
  const ahead = Number(git(dir, ['rev-list', '--count', `${up.out}..HEAD`]).out) || 0;
  const dirty = (git(dir, ['status', '--porcelain']).out || '').split('\n').filter(Boolean).length;

  if (!behind && !ahead) { say(`  ok    ${name} — current`); return; }

  stale++;
  let note = `${name} — ${behind} behind, ${ahead} ahead`;
  if (dirty) note += `, ${dirty} uncommitted file(s)`;

  if (ahead) { say(`  LOCAL ${note} — diverged; left alone (this never merges)`); return; }
  if (dirty) { say(`  HOLD  ${note} — local changes; left alone`); return; }
  if (UPDATE) {
    const pull = git(dir, ['pull', '--ff-only', '--quiet']);
    if (pull.ok) { say(`  UP    ${name} — fast-forwarded ${behind} commit(s)`); stale--; }
    else say(`  FAIL  ${name} — pull failed; update it by hand`);
  } else {
    say(`  STALE ${note} — run with --update (or: git -C ${dir} pull --ff-only)`);
  }
}

say(`checking for stale clones under ${KIT}`);
checkRepo(KIT, '(this kit)');
const mcp = path.join(KIT, 'mcp');
if (fs.existsSync(mcp)) {
  for (const d of fs.readdirSync(mcp)) {
    if (fs.existsSync(path.join(mcp, d, '.git'))) checkRepo(path.join(mcp, d), `mcp/${d}`);
  }
}

say('\nruntime');
const [maj, min] = process.versions.node.split('.').map(Number);
if (maj > 20 || (maj === 20 && min >= 12)) say(`  ok    node ${process.version}`);
else { say(`  STALE node ${process.version} — 20.12+ required`); stale++; }
for (const cmd of ['git', 'opencode']) {
  const r = spawnSync(cmd, ['--version'], { encoding: 'utf8' });
  if (r.status === 0) say(`  ok    ${cmd} present`);
  else { say(`  MISSING ${cmd}`); stale++; }
}

if (!found) say('\nnothing to check yet — run scripts/install.js first');
console.log('');
if (stale) { console.log(`${stale} item(s) need attention`); process.exit(1); }
console.log('all current');
process.exit(0);
