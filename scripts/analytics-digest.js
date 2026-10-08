#!/usr/bin/env node
'use strict';
/**
 * analytics-digest — append one dated line of today's shop numbers to AGENTS.md.
 *
 * The point is a trend line the agent can read without being asked. It pulls only metrics the
 * platforms actually expose over their APIs, and says so when a metric is not exposed rather
 * than writing a zero that would read as "no traffic".
 *
 *   node scripts/analytics-digest.js            append/replace today's line in AGENTS.md
 *   node scripts/analytics-digest.js --dry-run  print the line, write nothing
 *   node scripts/analytics-digest.js --json     print the raw numbers as JSON
 *
 * Sources (all real endpoints):
 *   Shopify — GraphQL Admin `shopifyqlQuery` (2025-10+), dataset `sales`   [read_reports]
 *   Etsy    — REST `getShopReceipts` /shops/{id}/receipts                  [transactions_r]
 *   Meta    — Marketing API `act_{id}/insights` (v25.0)
 *
 * Etsy exposes NO impressions/traffic endpoint, and neither does the ShopifyQL `sales` dataset
 * for sessions unless you ask for it. Anything not fetched is reported as "not exposed".
 */

const fs = require('fs');
const { kitEnv } = require('../lib/env.js');
const path = require('path');

const KIT = path.resolve(__dirname, '..');
const AGENTS = path.join(KIT, 'AGENTS.md');
const args = process.argv.slice(2);
const DRY = args.includes('--dry-run');
const AS_JSON = args.includes('--json');


async function get(url, headers, timeoutMs = 20000) {
  const ctl = new AbortController();
  const t = setTimeout(() => ctl.abort(), timeoutMs);
  try {
    const res = await fetch(url, { headers: headers || {}, signal: ctl.signal });
    const text = await res.text();
    let json = null; try { json = JSON.parse(text); } catch { /* xml or plain */ }
    return { status: res.status, text, json };
  } catch (e) {
    return { status: 0, text: String(e.message || e), json: null, error: true };
  } finally { clearTimeout(t); }
}

const money = (n) => (Math.round(n * 100) / 100).toFixed(2);
const startOfTodayUTC = () => Math.floor(new Date().setUTCHours(0, 0, 0, 0) / 1000);

// ── sources ─────────────────────────────────────────────────────────────────────
async function shopify(env) {
  if (!env.SHOPIFY_SHOP || !env.SHOPIFY_ACCESS_TOKEN) return { status: 'not_configured' };
  const v = env.SHOPIFY_API_VERSION || '2025-10';
  const q = '{ shop { currencyCode } shopifyqlQuery(query: "FROM sales SHOW total_sales, orders TIMESERIES day SINCE -1d") { parseErrors tableData { columns { name } rows } } }';
  const ctl = new AbortController(); const t = setTimeout(() => ctl.abort(), 25000);
  let res;
  try {
    res = await fetch(`https://${env.SHOPIFY_SHOP}/admin/api/${v}/graphql.json`, {
      method: 'POST', headers: { 'X-Shopify-Access-Token': env.SHOPIFY_ACCESS_TOKEN, 'Content-Type': 'application/json' },
      body: JSON.stringify({ query: q }), signal: ctl.signal,
    });
  } catch (e) { clearTimeout(t); return { status: 'error', error: String(e.message || e) }; }
  clearTimeout(t);
  const text = await res.text();
  let j = null; try { j = JSON.parse(text); } catch { /* */ }
  if (res.status >= 400 || !j || !j.data || !j.data.shopifyqlQuery) {
    return { status: 'error', error: (j && (j.errors && JSON.stringify(j.errors).slice(0, 120))) || `HTTP ${res.status}` };
  }
  const qr = j.data.shopifyqlQuery;
  if (qr.parseErrors && qr.parseErrors.length) return { status: 'error', error: JSON.stringify(qr.parseErrors).slice(0, 160) };
  const rows = (qr.tableData && qr.tableData.rows) || [];
  let orders = 0, revenue = 0;
  for (const row of rows) { orders += Number(row.orders) || 0; revenue += Number(row.total_sales) || 0; }
  return { status: 'ok', orders, revenue, currency: (j.data.shop && j.data.shop.currencyCode) || '' };
}

async function etsy(env) {
  if (!env.ETSY_KEYSTRING || !env.ETSY_ACCESS_TOKEN || !env.ETSY_SHOP_ID) return { status: 'not_configured' };
  const url = `https://openapi.etsy.com/v3/application/shops/${env.ETSY_SHOP_ID}/receipts?limit=100&was_paid=true&min_created=${startOfTodayUTC()}`;
  const r = await get(url, { 'x-api-key': env.ETSY_KEYSTRING, Authorization: `Bearer ${env.ETSY_ACCESS_TOKEN}` });
  if (r.status === 0) return { status: 'error', error: 'no response' };
  if (r.status >= 400) return { status: 'error', error: `HTTP ${r.status}` };
  const results = (r.json && r.json.results) || [];
  let revenue = 0, currency = '';
  for (const rc of results) {
    const g = rc.grandtotal || rc.total_price;
    if (g && g.amount != null) { revenue += g.amount / (g.divisor || 100); currency = currency || g.currency_code; }
  }
  return { status: 'ok', orders: results.length, revenue, currency, traffic: 'not_exposed' };
}

async function meta(env) {
  if (!env.META_ACCESS_TOKEN || !env.META_AD_ACCOUNT_ID) return { status: 'not_configured' };
  const v = env.META_API_VERSION || 'v25.0';
  const act = String(env.META_AD_ACCOUNT_ID).startsWith('act_') ? env.META_AD_ACCOUNT_ID : `act_${env.META_AD_ACCOUNT_ID}`;
  const fields = 'spend,impressions,clicks,purchase_roas,actions,action_values';
  const url = `https://graph.facebook.com/${v}/${act}/insights?fields=${fields}&date_preset=today&access_token=${encodeURIComponent(env.META_ACCESS_TOKEN)}`;
  const r = await get(url);
  if (r.status === 0) return { status: 'error', error: 'no response' };
  if (r.status >= 400) return { status: 'error', error: (r.json && r.json.error && r.json.error.message) || `HTTP ${r.status}` };
  const d = (r.json && r.json.data && r.json.data[0]) || {};
  let roas = null;
  if (Array.isArray(d.purchase_roas) && d.purchase_roas[0]) roas = Number(d.purchase_roas[0].value);
  else if (Array.isArray(d.action_values)) {
    const rev = d.action_values.find((a) => a.action_type === 'omni_purchase') || d.action_values.find((a) => a.action_type === 'purchase');
    if (rev && Number(d.spend)) roas = Number(rev.value) / Number(d.spend);
  }
  return {
    status: 'ok',
    spend: d.spend != null ? Number(d.spend) : 0,
    impressions: Number(d.impressions) || 0,
    clicks: Number(d.clicks) || 0,
    roas: roas != null && Number.isFinite(roas) ? Math.round(roas * 100) / 100 : null,
  };
}

// ── compose ─────────────────────────────────────────────────────────────────────
function lineFor(date, s, e, m) {
  const parts = [];
  parts.push(s.status === 'ok' ? `Shopify ${s.orders} orders / ${money(s.revenue)} ${s.currency}`.trim() : s.status === 'not_configured' ? 'Shopify not configured' : `Shopify error (${s.error})`);
  parts.push(e.status === 'ok' ? `Etsy ${e.orders} orders / ${money(e.revenue)} ${e.currency}`.trim() : e.status === 'not_configured' ? 'Etsy not configured' : `Etsy error (${e.error})`);
  if (m.status === 'ok') parts.push(`Meta spend ${m.spend} / ${m.impressions} impressions${m.roas != null ? ` / ROAS ${m.roas}` : ''}`);
  else if (m.status === 'not_configured') parts.push('Meta not configured');
  else parts.push(`Meta error (${m.error})`);
  if (s.status === 'ok' || e.status === 'ok') parts.push('(Etsy traffic/impressions: not exposed by the API)');
  return `- ${date} · ${parts.join(' · ')}`;
}

function writeDigest(line, date) {
  const HEAD = '## Analytics log';
  let text = '';
  try { text = fs.readFileSync(AGENTS, 'utf8'); } catch { text = '# AGENTS.md\n'; }
  const marker = `- ${date} ·`;
  if (text.includes(marker)) {
    // Idempotent: replace today's line rather than piling up duplicates.
    const updated = text.split('\n').map((l) => (l.startsWith(marker) ? line : l)).join('\n');
    if (!DRY) fs.writeFileSync(AGENTS, updated);
    return 'replaced';
  }
  if (!text.includes(HEAD)) {
    if (!DRY) fs.appendFileSync(AGENTS, `\n${HEAD}\n\n${line}\n`);
    return 'appended (new section)';
  }
  if (!DRY) fs.appendFileSync(AGENTS, `${line}\n`);
  return 'appended';
}

async function main() {
  const env = kitEnv(path.join(KIT, 'config', 'keys.env'));
  const date = new Date().toISOString().slice(0, 10);
  const [s, e, m] = await Promise.all([shopify(env), etsy(env), meta(env)]);
  const line = lineFor(date, s, e, m);

  if (AS_JSON) { console.log(JSON.stringify({ date, shopify: s, etsy: e, meta: m }, null, 2)); return; }

  const allUnconfigured = [s, e, m].every((x) => x.status === 'not_configured');
  if (allUnconfigured) {
    console.error('analytics-digest: nothing configured. Fill config/keys.env (see setup.md).');
    process.exitCode = 2;
    return;
  }

  const how = writeDigest(line, date);
  console.log(DRY ? `[dry-run] ${line}` : `${how}: ${line}`);
  if (!DRY) console.log(`written to ${path.relative(KIT, AGENTS)}`);
}

if (require.main === module) main();

module.exports = { shopify, etsy, meta, lineFor, writeDigest };
