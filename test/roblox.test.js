#!/usr/bin/env node
'use strict';
/**
 * Tests for the Roblox Open Cloud server. The network is stubbed, so these measure the request
 * shape and the response handling — the parts that turn an API answer into a result. A wrong path,
 * a missing upsert branch or a swallowed 401 would look like "Roblox rejected us" in production.
 */
const assert = require('assert');
const fs = require('fs');
const path = require('path');

let pass = 0, fail = 0;
const t = (n, c) => { if (c) { pass++; console.log('  ok  ' + n); } else { fail++; console.log('FAIL  ' + n); } };

const realFetch = global.fetch;
const calls = [];
function stub(responder) {
  global.fetch = async (url, opts) => {
    calls.push({ url, opts });
    const r = typeof responder === 'function' ? responder(url, opts, calls.length) : responder;
    return { ok: r.status === undefined || (r.status >= 200 && r.status < 300), status: r.status || 200, text: async () => (typeof r.body === 'string' ? r.body : JSON.stringify(r.body ?? {})) };
  };
}

const S = require('../mcp/roblox-open-cloud/server.js');
const ENV = { ROBLOX_API_KEY: 'k', ROBLOX_UNIVERSE_ID: '123', ROBLOX_PLACE_ID: '456' };
const withEnv = (fn) => { const s = { ...process.env }; Object.assign(process.env, ENV); return Promise.resolve(fn()).finally(() => { process.env = s; }); };

(async () => {
  // ── auth + shape ──────────────────────────────────────────────────────────────
  console.log('open cloud');
  calls.length = 0;
  stub({ body: { path: 'x', value: 'v' } });
  await withEnv(() => S.datastoreGet({ data_store: 'DS', entry_key: 'k1' }));
  t('sends the api key header', calls[0].opts.headers['x-api-key'] === 'k');
  t('hits the v2 scoped entry path', /\/cloud\/v2\/universes\/123\/data-stores\/DS\/scopes\/global\/entries\/k1$/.test(calls[0].url));
  t('defaults scope to global', calls[0].url.includes('/scopes/global/'));
  calls.length = 0;
  await withEnv(() => S.datastoreGet({ data_store: 'DS', entry_key: 'a/b c' }));
  t('URL-encodes a key with a slash', calls[0].url.includes('a%2Fb%20c'));

  // ── upsert: PATCH when it exists ──────────────────────────────────────────────
  calls.length = 0;
  stub((url, opts, n) => (n === 1 ? { body: { value: 'old' } } : { body: { value: 'new' } }));
  let r = await withEnv(() => S.datastoreSet({ data_store: 'DS', entry_key: 'k1', value: { a: 1 } }));
  t('datastore_set reads first, then uses PATCH for an existing entry', r.updated === true && calls[1].opts.method === 'PATCH');
  t('a JSON value is stringified for storage', JSON.parse(calls[1].opts.body).value === '{"a":1}');

  // ── upsert: POST when it does not exist ───────────────────────────────────────
  calls.length = 0;
  stub((url, opts, n) => (n === 1 ? { status: 404, body: { message: 'not found' } } : { body: { created: true } }));
  r = await withEnv(() => S.datastoreSet({ data_store: 'DS', entry_key: 'k9', value: 'hello' }));
  t('datastore_set POSTs to create when the entry is missing', r.created === true && calls[1].opts.method === 'POST');
  t('a plain string value is stored as-is', JSON.parse(calls[1].opts.body).value === 'hello');
  t('the create path carries entry_key and scope', (() => { const b = JSON.parse(calls[1].opts.body); return b.entry_key === 'k9' && b.scope === 'global'; })());

  // ── messaging ─────────────────────────────────────────────────────────────────
  calls.length = 0;
  stub({ body: {} });
  r = await withEnv(() => S.publishMessage({ topic: 'liveops', message: { config_version: 42 } }));
  t('publishes to the messaging-service topic path', /\/messaging-service\/v1\/universes\/123\/topics\/liveops$/.test(calls[0].url));
  t('the doorbell pattern serialises the payload', JSON.parse(calls[0].opts.body).message === '{"config_version":42}');

  // ── luau execution ────────────────────────────────────────────────────────────
  calls.length = 0;
  stub({ body: { path: 'u/1/p/2/t/3', state: 'PROCESSING' } });
  r = await withEnv(() => S.runLuau({ script: 'return 1+1' }));
  t('runs Luau via the place task endpoint', /\/cloud\/v2\/universes\/123\/places\/456\/luau-execution-session-tasks$/.test(calls[0].url));
  t('the script is in the body', JSON.parse(calls[0].opts.body).script === 'return 1+1');
  t('a timeout is passed through as a duration string', JSON.parse(calls[0].opts.body).timeout === '30s');

  calls.length = 0;
  r = await withEnv(() => S.taskLogs({ task_id: 'universes/1/places/2/versions/3/luau-execution-sessions/a/tasks/b' }));
  t('task_logs uses only the final id segment', /\/luau-execution-session-tasks\/b\/logs/.test(calls[0].url));

  // ── errors ────────────────────────────────────────────────────────────────────
  stub({ status: 401, body: { message: 'Unauthorized' } });
  r = await withEnv(() => S.datastoreGet({ data_store: 'DS', entry_key: 'k1' }));
  t('a 401 is surfaced, not swallowed', r.ok === false && /401/.test(r.error));
  t('a 401 carries the scope hint', typeof r.hint === 'string' && /scope/i.test(r.hint));

  stub({ status: 429, body: { message: 'Too Many Requests' } });
  r = await withEnv(() => S.datastoreGet({ data_store: 'DS', entry_key: 'k1' }));
  t('a 429 is surfaced as an error', r.ok === false && /429/.test(r.error));

  stub(() => { throw new Error('fetch failed'); });
  r = await withEnv(() => S.datastoreGet({ data_store: 'DS', entry_key: 'k1' }));
  t('a network failure is reported, not thrown', r.ok === false && /fetch failed/.test(r.error));

  // ── missing config ────────────────────────────────────────────────────────────
  const saved = { ...process.env }; delete process.env.ROBLOX_API_KEY;
  r = await S.datastoreGet({ data_store: 'DS', entry_key: 'k1' });
  t('a missing key is named instead of firing a doomed request', r.ok === false && /ROBLOX_API_KEY/.test(r.error));
  delete process.env.ROBLOX_UNIVERSE_ID;
  r = await S.datastoreGet({ data_store: 'DS', entry_key: 'k1' });
  t('a missing universe id is named', r.ok === false && /ROBLOX_UNIVERSE_ID/.test(r.error));
  process.env = saved;

  // ── schema non-vacuity ────────────────────────────────────────────────────────
  console.log('schema');
  t('exposes the expected tools', S.TOOLS.map((x) => x.name).sort().join(',') === ['roblox_datastore_get', 'roblox_datastore_set', 'roblox_list_datastores', 'roblox_publish_message', 'roblox_run_luau', 'roblox_task_logs', 'roblox_universe_info'].sort().join(','));
  t('every tool declares an object input schema', S.TOOLS.every((x) => x.inputSchema && x.inputSchema.type === 'object'));
  const req = (n) => (S.TOOLS.find((x) => x.name === n).inputSchema.required || []);
  t('tools that need input declare it required', ['roblox_datastore_get', 'roblox_datastore_set', 'roblox_publish_message', 'roblox_run_luau', 'roblox_task_logs'].every((n) => req(n).length > 0));
  t('tools that need no input declare none', req('roblox_list_datastores').length === 0 && req('roblox_universe_info').length === 0);

  global.fetch = realFetch;
  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})();
