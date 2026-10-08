#!/usr/bin/env node
'use strict';
/**
 * health-check.js — is the kit actually connected, and is anything stuck? Cross-platform.
 *
 * Two jobs:
 *   1. Confirm each configured API answers. A dead key is otherwise found days later, as a failed
 *      order or an unanswered customer.
 *   2. Clear a STALE lock — a lock file whose owning process is gone. A background job that hangs
 *      and dies leaves its lock behind and the next run then refuses to start. A lock whose owner is
 *      still alive is left strictly alone.
 *
 * Exit 0 when every CONFIGURED service is healthy, 1 otherwise. A service with no key is reported
 * as "not configured" and does not fail the check — most people start with one shop.
 */
const fs = require('fs');
const { kitEnv } = require('../lib/env.js');
const path = require('path');

const KIT = path.resolve(__dirname, '..');


async function probe(url, headers) {
  const ctl = new AbortController();
  const t = setTimeout(() => ctl.abort(), 20000);
  try {
    const res = await fetch(url, { headers: headers || {}, signal: ctl.signal });
    return res.status;
  } catch { return 0; }
  finally { clearTimeout(t); }
}

(async () => {
  const env = kitEnv(path.join(KIT, 'config', 'keys.env'));
  let ok = 0, bad = 0, skipped = 0;

  const check = async (name, url, headers) => {
    const code = await probe(url, headers);
    if (code >= 200 && code < 400) { console.log(`  ok    ${name.padEnd(11)} HTTP ${code}`); ok++; }
    else if (code === 0) { console.log(`  FAIL  ${name.padEnd(11)} no response`); bad++; }
    else { console.log(`  FAIL  ${name.padEnd(11)} HTTP ${code} (check the key)`); bad++; }
  };
  const skip = (name) => { console.log(`  --    ${name.padEnd(11)} not configured`); skipped++; };

  console.log(`shop agent health-check  (${new Date().toISOString().slice(0, 16).replace('T', ' ')})`);
  console.log('\nAPIs');

  const v = env.SHOPIFY_API_VERSION || '2025-10';
  if (env.SHOPIFY_SHOP && env.SHOPIFY_ACCESS_TOKEN) await check('shopify', `https://${env.SHOPIFY_SHOP}/admin/api/${v}/shop.json`, { 'X-Shopify-Access-Token': env.SHOPIFY_ACCESS_TOKEN });
  else skip('shopify');
  if (env.ETSY_KEYSTRING) await check('etsy', 'https://openapi.etsy.com/v3/application/openapi-ping', { 'x-api-key': env.ETSY_KEYSTRING });
  else skip('etsy');
  if (env.META_ACCESS_TOKEN) await check('meta', `https://graph.facebook.com/${env.META_API_VERSION || 'v25.0'}/me?access_token=${env.META_ACCESS_TOKEN}`);
  else skip('meta');
  if (env.TELEGRAM_BOT_TOKEN) await check('telegram', `https://api.telegram.org/bot${env.TELEGRAM_BOT_TOKEN}/getMe`);
  else skip('telegram');
  if (env.ROBLOX_API_KEY && env.ROBLOX_UNIVERSE_ID) await check('roblox', `https://apis.roblox.com/cloud/v2/universes/${env.ROBLOX_UNIVERSE_ID}`, { 'x-api-key': env.ROBLOX_API_KEY });
  else skip('roblox');
  if (env.DEEPSEEK_API_KEY && env.DEEPSEEK_BASE_URL) await check('deepseek', `${env.DEEPSEEK_BASE_URL.replace(/\/$/, '')}/models`, { Authorization: `Bearer ${env.DEEPSEEK_API_KEY}` });
  else skip('deepseek');
  if (env.OPENROUTER_API_KEY) await check('openrouter', 'https://openrouter.ai/api/v1/models', { Authorization: `Bearer ${env.OPENROUTER_API_KEY}` });
  else skip('openrouter');
  if (env.ORCAROUTER_API_KEY) await check('orcarouter', 'https://api.orcarouter.ai/v1/models', { Authorization: `Bearer ${env.ORCAROUTER_API_KEY}` });
  else skip('orcarouter');

  // ── stale locks ───────────────────────────────────────────────────────────────
  console.log('\nLocks');
  const staleMin = Number(env.LOCK_STALE_MINUTES) || 5;
  let cleared = 0, kept = 0;
  const dirs = ['state', '.'];
  const now = Date.now();
  for (const d of dirs) {
    const dir = path.join(KIT, d);
    let names = [];
    try { names = fs.readdirSync(dir).filter((f) => f.endsWith('.lock')); } catch { continue; }
    for (const name of names) {
      const file = path.join(dir, name);
      const pid = (fs.readFileSync(file, 'utf8').match(/\d+/g) || []).join('');
      let alive = false;
      if (pid) { try { process.kill(Number(pid), 0); alive = true; } catch { alive = false; } }
      const ageMin = Math.floor((now - fs.statSync(file).mtimeMs) / 60000);
      if (alive) { console.log(`  live  ${path.relative(KIT, file)} (pid ${pid} alive)`); kept++; continue; }
      if (ageMin >= staleMin) { fs.rmSync(file, { force: true }); console.log(`  clear ${path.relative(KIT, file)} (owner gone, ${ageMin} min old)`); cleared++; }
      else { console.log(`  hold  ${path.relative(KIT, file)} (younger than ${staleMin} min — may still be starting)`); kept++; }
    }
  }
  // git's index lock carries no pid: only clear it when old AND no git is running.
  const idx = path.join(KIT, '.git', 'index.lock');
  if (fs.existsSync(idx)) {
    const ageMin = Math.floor((now - fs.statSync(idx).mtimeMs) / 60000);
    if (ageMin >= 10) { fs.rmSync(idx, { force: true }); console.log(`  clear .git/index.lock (${ageMin} min old)`); cleared++; }
    else { console.log('  live  .git/index.lock (git may be running)'); kept++; }
  }
  if (!cleared && !kept) console.log('  none');

  console.log(`\nsummary: ${ok} ok · ${bad} failed · ${skipped} not configured · locks cleared ${cleared}`);
  process.exit(bad ? 1 : 0);
})();
