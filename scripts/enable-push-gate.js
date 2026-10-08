#!/usr/bin/env node
'use strict';
/**
 * enable-push-gate.js — put the real GitHub token behind a proxy, and give the agent a dummy.
 *
 * The model, in three lines:
 *   1. The real token lives ONLY in the proxy.
 *   2. The proxy applies the commit rules to every push.
 *   3. Every agent gets a DUMMY token — so the only way it can push is through the proxy, and the
 *      proxy always applies the rules. A direct push to GitHub fails, because the dummy is not real.
 *
 *   node scripts/enable-push-gate.js
 *
 * Requires the proxy running and holding your token. Without it, this says exactly what is missing
 * and exits 2 — it never pretends to have gated anything.
 *
 * NOTE: the proxy itself is launched by the commit-condom repo. On Linux/macOS it is usually run as
 * a background service; on Windows, run `node mcp/commit-condom/bin/cc-proxy.js` in its own terminal
 * (or as a Scheduled Task). This script wires the machine once that proxy is answering.
 */
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');

const KIT = path.resolve(__dirname, '..');
const PROXY = process.env.CC_PROXY || 'http://127.0.0.1:8877';
const DATA = process.env.CC_DATA || path.join(os.homedir(), '.commit-condom');
const PAT_ENV = process.env.CC_PAT_ENV || path.join(os.homedir(), '.config', 'commit-condom', 'pat.env');

const CC = path.join(KIT, 'mcp', 'commit-condom');
if (!fs.existsSync(path.join(CC, 'bin', 'cc-wire-machine.js'))) {
  console.error('enable-push-gate: commit-condom is not installed. Run scripts/install.js first.');
  process.exit(2);
}

async function proxyUp() {
  for (const url of [PROXY.replace(/\/$/, '') + '/', PROXY.replace(/\/$/, '') + '/health']) {
    const ctl = new AbortController();
    const t = setTimeout(() => ctl.abort(), 8000);
    try { await fetch(url, { signal: ctl.signal }); return true; } catch { /* try next */ }
    finally { clearTimeout(t); }
  }
  return false;
}

(async () => {
  if (!(await proxyUp())) {
    console.error(`enable-push-gate: no proxy answering at ${PROXY}`);
    console.error('  Start it (it holds your real token — never the agent):');
    console.error(`    node ${path.join(CC, 'bin', 'cc-proxy.js')} --port 8877 --data ${DATA}`);
    console.error(`  with CC_PAT_FILE=${PAT_ENV} in its environment. Until it is up, pushes are NOT gated.`);
    process.exit(2);
  }

  if (!fs.existsSync(PAT_ENV)) {
    console.error(`enable-push-gate: ${PAT_ENV} does not exist, so the proxy has no token to forward with.`);
    console.error('  Create it with a line:  CC_PAT=<your token>');
    process.exit(2);
  }

  console.log('wiring this machine through the proxy and giving the agent a dummy token');
  const inst = spawnSync(process.execPath, [path.join(CC, 'bin', 'cc-wire-machine.js'), 'install'], {
    stdio: 'inherit', env: { ...process.env, CC_DATA: DATA },
  });
  if (inst.status !== 0) process.exit(inst.status || 1);

  console.log('\nproving a dummy cannot push, even with --no-verify (hermetic, no network):');
  const wire = spawnSync(process.execPath, [path.join(CC, 'test', 'wire.test.js')], { encoding: 'utf8' });
  const inesc = spawnSync(process.execPath, [path.join(CC, 'test', 'inescapable.test.js')], { encoding: 'utf8' });
  const okWire = /0 failed/.test(wire.stdout || '');
  const okInesc = /0 failed/.test(inesc.stdout || '');
  if (okWire && okInesc) {
    console.log('  ok: a --no-verify monolith is refused and never reaches upstream');
  } else {
    console.error('  FAILED — the gate did not behave; do not rely on it.');
    console.error((wire.stdout || '') + (inesc.stdout || ''));
    process.exit(1);
  }

  console.log('\ndone. Status:  node ' + path.join(CC, 'bin', 'cc-wire-machine.js') + ' status');
  console.log('  REAL_PAT_in_credential_store must be false — that is the point.');
  console.log('\nHonest limit: the token file is readable by the same user the agent runs as. This removes');
  console.log('the --no-verify bypass and the local-hook hole, but a truly isolated gate needs the proxy');
  console.log('running as a different user (or on another machine) than the agent.');
})();
