#!/usr/bin/env node
'use strict';
/**
 * orchestrator — start the kit's agent. Works the same on Windows, macOS and Linux.
 *
 * The kit used to ship this as a bash script, which is why it failed on Windows: bash is not a
 * given there, and a path written for a Unix shell is unreadable to Windows. Node is already a
 * requirement for every other part of the kit, so the launcher is Node too, and the shell scripts
 * are thin wrappers around it.
 *
 *   node bin/orchestrator.js [opencode args...]
 *
 * It loads the keys, checks the toolchain and the local servers, then starts opencode in the kit
 * folder. If something is missing it names the exact fix instead of failing three screens later.
 */
const fs = require('fs');
const path = require('path');
const { spawn, spawnSync } = require('child_process');
const { kitEnv } = require('../lib/env.js');
const KIT = path.resolve(__dirname, '..');
process.chdir(KIT);

const isWin = process.platform === 'win32';
const err = (m) => process.stderr.write(m + '\n');

/** Is a command runnable? Uses the platform's own resolution (PATHEXT on Windows). */
function have(cmd) {
  const probe = spawnSync(isWin ? 'where' : 'command', isWin ? [cmd] : ['-v', cmd], {
    stdio: 'ignore', shell: !isWin,
  });
  return probe.status === 0;
}

function nodeVersionOk() {
  const [maj, min] = process.versions.node.split('.').map(Number);
  return maj > 20 || (maj === 20 && min >= 12);
}

// ── keys ────────────────────────────────────────────────────────────────────────
const keysFile = path.join(KIT, 'config', 'keys.env');
if (!fs.existsSync(keysFile)) {
  err('orchestrator: config/keys.env is missing.');
  if (isWin) err('  copy config\\keys.env.example config\\keys.env   then fill in your keys');
  else err('  cp config/keys.env.example config/keys.env   # then fill in your keys');
  process.exit(2);
}
const env = kitEnv(keysFile);

// ── toolchain ───────────────────────────────────────────────────────────────────
const missing = [];
if (!nodeVersionOk()) missing.push(`Node ${process.versions.node} is too old — 20.12+ is required.`);
for (const [cmd, how] of [
  ['git', 'Install git, or use GitHub Desktop\'s bundled git.'],
  ['opencode', 'Install it: https://opencode.ai/docs (or: npm i -g opencode-ai)'],
]) {
  if (!have(cmd)) missing.push(`'${cmd}' is not installed. ${how}`);
}
if (missing.length) {
  for (const m of missing) err('orchestrator: ' + m);
  process.exit(2);
}

// ── local servers ───────────────────────────────────────────────────────────────
const SERVERS = ['shop-tools', 'roblox-open-cloud', 'tool-call-compactor', 'free-ai', 'commit-condom', 'claude-agy-mcp'];
const absent = SERVERS.filter((d) => !fs.existsSync(path.join(KIT, 'mcp', d)));
if (absent.length) {
  err(`orchestrator: local server(s) missing: ${absent.join(', ')} — running the installer.`);
  const inst = spawnSync(process.execPath, [path.join(KIT, 'scripts', 'install.js')], { stdio: 'inherit', cwd: KIT });
  if (inst.status !== 0) { err('orchestrator: install failed; fix the error above and re-run.'); process.exit(inst.status || 1); }
}

// ── launch ──────────────────────────────────────────────────────────────────────
console.log(`orchestrator: starting in ${KIT}`);
console.log('  model chain: DeepSeek (paid) -> OrcaRouter/OpenRouter (free)');
console.log('  checks:      shop-tools (listing/support/research/dispute) · commit-condom · compactor');
console.log('  roblox:      roblox-open-cloud (headless) · roblox-studio (when Studio is open)');
console.log('  subagents:   free-ai (free models) · claude-agy (Claude, deep reasoning)');

// api-anything is a global npm package, not a directory under mcp/, so it is reported, not required.
let webApi = false;
try {
  const root = spawnSync(isWin ? 'npm.cmd' : 'npm', ['root', '-g'], { encoding: 'utf8' });
  webApi = root.status === 0 && fs.existsSync(path.join(root.stdout.trim(), 'api-anything', 'dist', 'cli.js'));
} catch { /* npm absent: simply not available */ }
console.log(`  web as api:  ${webApi ? 'api-anything (call sites as JSON)' : 'not installed (optional — Node 22.13+)'}`);
console.log('  memory:      AGENTS.md    rules: rules.md');
console.log('');

// Windows resolves `opencode` to opencode.cmd only through the shell, so spawn via the shell there.
const child = spawn('opencode', process.argv.slice(2), { stdio: 'inherit', cwd: KIT, env, shell: isWin });
child.on('exit', (code, signal) => process.exit(signal ? 1 : (code ?? 0)));
child.on('error', (e) => {
  err(`orchestrator: could not start opencode (${e.message}).`);
  err(isWin ? '  Check it is on PATH:  where opencode' : '  Check it is on PATH:  which opencode');
  process.exit(2);
});
