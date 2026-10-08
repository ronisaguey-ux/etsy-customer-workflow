#!/usr/bin/env node
'use strict';
/**
 * enable-commit-gate.js <repo-path> — put commit-condom's git hooks on a repository.
 *
 * The hooks refuse what an agent does under pressure: one giant commit, a mixed commit, a message
 * that says nothing, a credential pasted into the diff. They run on the CLIENT side here, which is
 * enough to keep an agent honest; the server-side pre-receive gate is the version a client cannot
 * skip and lives in the commit-condom repo.
 *
 *   node scripts/enable-commit-gate.js ../my-shop
 *
 * Idempotent: re-running replaces the policy and reinstalls the hooks.
 */
const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const KIT = path.resolve(__dirname, '..');
const repoArg = process.argv[2];
if (!repoArg) { console.error('usage: node scripts/enable-commit-gate.js <repo-path>'); process.exit(2); }
const REPO = path.resolve(repoArg);
if (!fs.existsSync(path.join(REPO, '.git'))) { console.error(`enable-commit-gate: ${REPO} is not a git repository.`); process.exit(2); }

const CC = path.join(KIT, 'mcp', 'commit-condom', 'bin', 'cc.js');
if (!fs.existsSync(CC)) { console.error('enable-commit-gate: commit-condom is not installed. Run scripts/install.js first.'); process.exit(2); }

const policy = path.join(KIT, 'config', 'condom.policy.json');
fs.copyFileSync(policy, path.join(REPO, '.condom.json'));
console.log(`  wrote ${path.join(REPO, '.condom.json')}`);

const inst = spawnSync(process.execPath, [CC, 'install-hooks', '--repo', REPO], { stdio: 'inherit' });
if (inst.status !== 0) { console.error('enable-commit-gate: installing the hooks failed.'); process.exit(inst.status || 1); }

// Prove it fires: a message with no conventional type must be REJECTED. If that passes, the hooks
// are not actually wired.
console.log('\nverifying the gate actually fires');
const probe = spawnSync('git', ['-C', REPO, 'commit', '--allow-empty', '-m', 'bad message with no conventional type'], { encoding: 'utf8' });
if (probe.status === 0) {
  console.error('  FAIL: the gate allowed a bad commit — hooks are not working.');
  process.exit(1);
}
console.log('  ok: a non-conventional message is rejected');

console.log(`\ndone. commit-condom is gating ${REPO}`);
console.log('\nNote: these are CLIENT-side hooks, so "git push --no-verify" can skip them. They are the');
console.log('right default for an agent\'s own work, but not a security boundary. For a gate that cannot');
console.log('be skipped, use the commit-condom proxy (see mcp/commit-condom/README.md).');
