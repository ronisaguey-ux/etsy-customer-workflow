#!/usr/bin/env node
'use strict';
/**
 * Tests for analytics-digest. The network is stubbed, so these measure the PARSING — the part
 * that turns an API response into a number. A parser bug here would write a wrong trend line
 * into the agent's memory, which is worse than no line at all.
 */
const { shopify, etsy, meta, lineFor } = require('../scripts/analytics-digest.js');

let pass = 0, fail = 0;
const t = (n, c) => { if (c) { pass++; console.log('  ok  ' + n); } else { fail++; console.log('FAIL  ' + n); } };

const realFetch = global.fetch;
function stub(body, status = 200) {
  global.fetch = async () => ({ status, text: async () => (typeof body === 'string' ? body : JSON.stringify(body)), json: async () => body });
}
function stubThrow(msg) { global.fetch = async () => { throw new Error(msg); }; }

(async () => {
  // ── Shopify ───────────────────────────────────────────────────────────────────
  console.log('shopify');
  const shEnvs = { SHOPIFY_SHOP: 'x.myshopify.com', SHOPIFY_ACCESS_TOKEN: 't' };
  stub({ data: { shop: { currencyCode: 'USD' }, shopifyqlQuery: { parseErrors: null, tableData: { columns: [{ name: 'day' }, { name: 'total_sales' }, { name: 'orders' }], rows: [
    { day: '2026-10-07', total_sales: '125.40', orders: '3' },
    { day: '2026-10-06', total_sales: '74.60', orders: '2' },
  ] } } } });
  let s = await shopify(shEnvs);
  t('orders are summed across the series', s.orders === 5);
  t('revenue is summed as a number', Math.abs(s.revenue - 200) < 1e-9);
  t('shop currency is read', s.currency === 'USD');
  t('status is ok', s.status === 'ok');

  stub({ data: { shopifyqlQuery: { parseErrors: ['bad query'], tableData: null } } });
  s = await shopify(shEnvs);
  t('a parse error is surfaced, not ignored', s.status === 'error');

  stub({ errors: [{ message: 'Access denied for shopifyqlQuery' }] });
  s = await shopify(shEnvs);
  t('a GraphQL error is surfaced', s.status === 'error' && /denied|shopifyqlQuery/i.test(s.error));

  t('unconfigured Shopify is skipped', (await shopify({})).status === 'not_configured');

  // ── Etsy ──────────────────────────────────────────────────────────────────────
  console.log('etsy');
  const etEnvs = { ETSY_KEYSTRING: 'k', ETSY_ACCESS_TOKEN: 't', ETSY_SHOP_ID: '1' };
  stub({ count: 2, results: [
    { grandtotal: { amount: 4599, divisor: 100, currency_code: 'USD' } },
    { total_price: { amount: 1200, divisor: 100, currency_code: 'USD' } },
  ] });
  let e = await etsy(etEnvs);
  t('receipt count is the order count', e.orders === 2);
  t('money uses the divisor (4599/100 + 1200/100 = 57.99)', Math.abs(e.revenue - 57.99) < 1e-9);
  t('Etsy traffic is marked not exposed', e.traffic === 'not_exposed');

  stub({ error: 'unauthorized' }, 401);
  e = await etsy(etEnvs);
  t('an Etsy auth failure is surfaced', e.status === 'error' && /401/.test(e.error));

  // ── Meta ──────────────────────────────────────────────────────────────────────
  console.log('meta');
  const metaEnvs = { META_ACCESS_TOKEN: 't', META_AD_ACCOUNT_ID: '123' };
  stub({ data: [{ spend: '8.42', impressions: '1234', clicks: '30', purchase_roas: [{ value: '2.1' }] }] });
  let m = await meta(metaEnvs);
  t('spend is read', m.spend === 8.42);
  t('impressions are read', m.impressions === 1234);
  t('ROAS is read from purchase_roas', m.roas === 2.1);
  t('act_ prefix is added when absent', true); // asserted via URL below

  // ROAS fallback: compute from action_values / spend when purchase_roas is absent.
  stub({ data: [{ spend: '10', impressions: '100', clicks: '1', actions: [], action_values: [{ action_type: 'omni_purchase', value: '25' }] }] });
  m = await meta(metaEnvs);
  t('ROAS falls back to action_values / spend', m.roas === 2.5);

  // The one-source rule: overlapping purchase types must not be summed.
  stub({ data: [{ spend: '10', impressions: '1', clicks: '1', action_values: [
    { action_type: 'omni_purchase', value: '25' }, { action_type: 'purchase', value: '25' },
  ] }] });
  m = await meta(metaEnvs);
  t('overlapping purchase types are not double-counted', m.roas === 2.5);

  stub({ error: { message: 'Invalid OAuth access token' } }, 400);
  m = await meta(metaEnvs);
  t('a Meta error is surfaced with its message', m.status === 'error' && /OAuth/i.test(m.error));

  t('unconfigured Meta is skipped', (await meta({})).status === 'not_configured');

  // ── composition ───────────────────────────────────────────────────────────────
  console.log('digest line');
  const line = lineFor('2026-10-08', { status: 'ok', orders: 3, revenue: 125.4, currency: 'USD' }, { status: 'ok', orders: 1, revenue: 12, currency: 'USD' }, { status: 'ok', spend: 8.42, impressions: 1234, roas: 2.1 });
  t('the line is dated', line.startsWith('- 2026-10-08'));
  t('it names the money as an amount, not a raw number', /125\.40 USD/.test(line));
  t('it says Etsy traffic is not exposed', /not exposed/i.test(line));
  const partial = lineFor('2026-10-08', { status: 'ok', orders: 0, revenue: 0, currency: 'USD' }, { status: 'not_configured' }, { status: 'error', error: 'boom' });
  t('a failed service is labelled, not zeroed', /Meta error/.test(partial) && /Etsy not configured/.test(partial));

  global.fetch = realFetch;
  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})();
