#!/usr/bin/env node
'use strict';
/**
 * install.js — put the local MCP servers in place and wire the config. Cross-platform.
 *
 * The kit used to install via a bash script, which is why it failed on Windows. Everything here is
 * Node, so `node scripts/install.js` works from cmd, PowerShell, Git Bash, macOS and Linux alike.
 *
 * It is idempotent: re-running updates the clones and leaves an existing keys file and opencode.json
 * alone.
 */
const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const KIT = path.resolve(__dirname, '..');
const isWin = process.platform === 'win32';
const log = (m) => console.log('  ' + m);
const err = (m) => console.error('  ' + m);

const TOOL_REPOS = [
  ['https://github.com/ronisaguey-ux/tool-call-compactor.git', 'tool-call-compactor'],
  ['https://github.com/ronisaguey-ux/free-ai.git', 'free-ai'],
  ['https://github.com/ronisaguey-ux/commit-condom.git', 'commit-condom'],
  ['https://github.com/ronisaguey-ux/claude-agy-mcp.git', 'claude-agy-mcp'],
];

function run(cmd, args, cwd) {
  return spawnSync(cmd, args, { cwd, stdio: ['ignore', 'pipe', 'pipe'], encoding: 'utf8' });
}

/** Clone or fast-forward, never discarding local work. */
function cloneOrPull(repo, name) {
  const dest = path.join(KIT, 'mcp', name);
  if (fs.existsSync(path.join(dest, '.git'))) {
    log(`updating mcp/${name}`);
    const r = run('git', ['-C', dest, 'pull', '--ff-only', '--quiet']);
    if (r.status !== 0) log(`(kept local changes in mcp/${name})`);
    return;
  }
  log(`installing mcp/${name}`);
  const r = run('git', ['clone', '--quiet', '--depth', '1', repo, dest]);
  if (r.status !== 0) {
    err(`could not clone ${repo}`);
    if (r.stderr) err(r.stderr.trim().split('\n')[0]);
    err('Is git installed and on PATH?');
  }
}

console.log(`shop agent kit: installing into ${KIT}`);
fs.mkdirSync(path.join(KIT, 'mcp'), { recursive: true });
fs.mkdirSync(path.join(KIT, 'config'), { recursive: true });

for (const [repo, name] of TOOL_REPOS) cloneOrPull(repo, name);

// The compactor is the one server with dependencies.
const compactorPkg = path.join(KIT, 'mcp', 'tool-call-compactor', 'package.json');
if (fs.existsSync(compactorPkg)) {
  const npm = isWin ? 'npm.cmd' : 'npm';
  const r = run(npm, ['install', '--silent', '--no-audit', '--no-fund'], path.join(KIT, 'mcp', 'tool-call-compactor'));
  if (r.status !== 0) log('(npm install failed for the compactor — run it by hand in mcp/tool-call-compactor)');
}

// ── skills ──────────────────────────────────────────────────────────────────────
// opencode discovers project skills under .opencode/skills/<name>/SKILL.md. The kit keeps the
// readable copies in skills/ and mirrors them here so they load without extra setup.
const skillSrc = path.join(KIT, 'skills');
const skillDst = path.join(KIT, '.opencode', 'skills');
fs.mkdirSync(skillDst, { recursive: true });
let mirrored = 0;
for (const name of fs.readdirSync(skillSrc)) {
  const src = path.join(skillSrc, name, 'SKILL.md');
  if (!fs.existsSync(src)) continue;
  const dir = path.join(skillDst, name);
  fs.mkdirSync(dir, { recursive: true });
  fs.copyFileSync(src, path.join(dir, 'SKILL.md'));
  mirrored++;
}
log(`skills installed to .opencode/skills/ (${mirrored})`);

// ── keys ────────────────────────────────────────────────────────────────────────
const keys = path.join(KIT, 'config', 'keys.env');
if (!fs.existsSync(keys)) {
  fs.copyFileSync(path.join(KIT, 'config', 'keys.env.example'), keys);
  try { fs.chmodSync(keys, 0o600); } catch { /* Windows has no POSIX mode; the file is still local */ }
  log('created config/keys.env — FILL IN YOUR KEYS (setup.md §2)');
}

// ── optional: api-anything (websites as callable APIs) ──────────────────────────
// Installed because it is genuinely useful (Amazon/YouTube/Instagram/X operations work logged out),
// but NEVER allowed to break the install: if it cannot be built, the server is left out of the
// config and the kit still runs. It needs Node >= 22.13 and a global npm install.
const API_REPO = 'https://github.com/goodnight000/api-anything.git';

function nodeAtLeast(maj, min) {
  const [M, m] = process.versions.node.split('.').map(Number);
  return M > maj || (M === maj && m >= min);
}
function npmRoot() {
  const r = run(isWin ? 'npm.cmd' : 'npm', ['root', '-g']);
  return r.status === 0 ? r.stdout.trim() : '';
}
function apiAnythingEntry() {
  const root = npmRoot();
  if (!root) return null;
  const entry = path.join(root, 'api-anything', 'dist', 'cli.js');
  return fs.existsSync(entry) ? entry.split(path.sep).join('/') : null;
}

let apiEntry = apiAnythingEntry();
if (!apiEntry) {
  if (!nodeAtLeast(22, 13)) {
    log(`api-anything skipped: needs Node 22.13+ (you have ${process.versions.node}). The kit still works without it.`);
  } else {
    log('installing api-anything (websites as callable APIs)…');
    const tmp = fs.mkdtempSync(path.join(require('os').tmpdir(), 'api-anything-'));
    try {
      const clone = run('git', ['clone', '-q', '--depth', '1', API_REPO, tmp]);
      if (clone.status !== 0) throw new Error('clone failed');
      const ci = run(isWin ? 'npm.cmd' : 'npm', ['ci', '--no-audit', '--no-fund'], tmp);
      if (ci.status !== 0) throw new Error('npm ci failed');
      const pack = run(isWin ? 'npm.cmd' : 'npm', ['pack', '--silent'], tmp);
      if (pack.status !== 0) throw new Error('npm pack failed');
      const tarball = path.join(tmp, pack.stdout.trim().split('\n').pop());
      const g = run(isWin ? 'npm.cmd' : 'npm', ['install', '-g', tarball]);
      if (g.status !== 0) throw new Error('global install failed');
      apiEntry = apiAnythingEntry();
      log(apiEntry ? 'api-anything installed' : 'api-anything: installed but entry not found');
    } catch (e) {
      log(`api-anything not installed (${e.message}) — the kit works without it; see setup.md to add it later.`);
    } finally {
      fs.rmSync(tmp, { recursive: true, force: true });
    }
  }
}

// ── configs ─────────────────────────────────────────────────────────────────────
// Paths are written with forward slashes: Node accepts them on every platform, and they avoid the
// backslash-escaping mess that made the old installer write a path Windows could not read.
const kitPath = KIT.split(path.sep).join('/');
function writeTemplate(template, out, { onlyIfAbsent }) {
  if (onlyIfAbsent && fs.existsSync(out)) { log(`${path.relative(KIT, out)} already exists — left alone`); return; }
  let text;
  try { text = fs.readFileSync(template, 'utf8'); } catch { err(`missing template ${path.relative(KIT, template)}`); return; }

  if (out.endsWith('tcc.config.json') && !apiEntry) {
    // Drop the api-anything upstream AND its group, so nothing tries to start a command that is not
    // there — an upstream that cannot start reads as a broken server, not a disabled one.
    try {
      const cfg = JSON.parse(text.replace(/__KIT_DIR__/g, kitPath));
      delete cfg.mcp['api-anything'];
      // The compactor names a group after the server, so the kit's group key is `api_anything`.
      if (cfg.groups && cfg.groups.api_anything) delete cfg.groups.api_anything;
      fs.writeFileSync(out, JSON.stringify(cfg, null, 2) + '\n');
      log(`wrote ${path.relative(KIT, out)} (api-anything omitted — not installed)`);
      return;
    } catch { /* fall through to the plain substitution */ }
  }

  // Accept either placeholder so an older template still installs.
  text = text.replace(/__KIT_DIR__/g, kitPath).replace(/\{env:KIT_DIR\}/g, kitPath);
  if (out.endsWith('tcc.config.json') && apiEntry) text = text.replace(/__APIANYTHING_ENTRY__/g, apiEntry);
  fs.writeFileSync(out, text);
  log(`wrote ${path.relative(KIT, out)}`);
}

writeTemplate(path.join(KIT, 'config', 'opencode.json.template'), path.join(KIT, 'opencode.json'), { onlyIfAbsent: true });
writeTemplate(path.join(KIT, 'config', 'tcc.config.json.template'), path.join(KIT, 'config', 'tcc.config.json'), { onlyIfAbsent: false });

console.log('');
if (isWin) console.log('done. next: edit config\\keys.env, then run  bin\\orchestrator.cmd');
else console.log('done. next: edit config/keys.env, then run  ./bin/orchestrator');
