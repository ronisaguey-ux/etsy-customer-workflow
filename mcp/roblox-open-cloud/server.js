#!/usr/bin/env node
'use strict';
/**
 * roblox-open-cloud — the Roblox half of the kit, over the official Open Cloud REST API.
 *
 * Roblox exposes two different surfaces, and it is worth keeping them apart:
 *
 *   - **Studio's built-in MCP server** drives a LIVE Studio session (edit scripts, run Luau in a
 *     running place, playtest). It only exists while Studio is open, so the kit cannot ship it —
 *     `skills/roblox-studio/SKILL.md` shows how to enable it and quick-connect.
 *   - **Open Cloud** is a REST API at https://apis.roblox.com, authenticated with an `x-api-key`,
 *     and it works whether or not Studio is running. That is what this server wraps, so the agent
 *     can read/write DataStores, publish MessagingService topics and run Luau tasks headlessly.
 *
 * Everything is one host and one header, so this stays zero-dependency. stdout is the JSON-RPC
 * wire; nothing here may print to it.
 *
 * API key scopes needed per tool are named in that tool's description, because Roblox scopes are
 * per-resource and a wrong scope returns 401 with a message that does not say which scope is
 * missing.
 */

const path = require('path');

// Load the kit's keys into the environment when this server is started directly, so the Roblox
// tools work whether opencode was launched by the kit's launcher or by hand. Real environment
// values win; a missing file is not an error.
try {
  const { kitEnv } = require(path.resolve(__dirname, '..', '..', 'lib', 'env.js'));
  const merged = kitEnv(path.resolve(__dirname, '..', '..', 'config', 'keys.env'));
  for (const [k, v] of Object.entries(merged)) if (process.env[k] === undefined) process.env[k] = v;
} catch { /* standalone: rely on the ambient environment */ }

const BASE = 'https://apis.roblox.com';
const TIMEOUT_MS = 30000;

function cfg(args = {}) {
  return {
    apiKey: process.env.ROBLOX_API_KEY || '',
    universeId: String(args.universe_id || process.env.ROBLOX_UNIVERSE_ID || ''),
    placeId: String(args.place_id || process.env.ROBLOX_PLACE_ID || ''),
  };
}

function missing(c, needs = {}) {
  const out = [];
  if (!c.apiKey) out.push('ROBLOX_API_KEY');
  if (needs.universe && !c.universeId) out.push('ROBLOX_UNIVERSE_ID (or pass universe_id)');
  if (needs.place && !c.placeId) out.push('ROBLOX_PLACE_ID (or pass place_id)');
  return out;
}

async function call(method, path, { body, key, raw } = {}) {
  const ctl = new AbortController();
  const t = setTimeout(() => ctl.abort(), TIMEOUT_MS);
  const headers = { 'x-api-key': key || cfg().apiKey, Accept: 'application/json' };
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  try {
    const res = await fetch(`${BASE}${path}`, {
      method, headers, body: body === undefined ? undefined : JSON.stringify(body), signal: ctl.signal,
    });
    const text = await res.text();
    let json = null; try { json = JSON.parse(text); } catch { /* not json */ }
    if (!res.ok) {
      // Roblox 401s do not name the missing scope, so surface the body verbatim and add the hint.
      const detail = (json && (json.message || json.error)) || text.slice(0, 300);
      const err = new Error(`HTTP ${res.status}: ${detail}`);
      err.status = res.status;
      if (res.status === 401 || res.status === 403) err.hint = 'Check the key is valid and that it has the scope named in this tool\'s description.';
      return { ok: false, error: err };
    }
    return { ok: true, data: raw ? text : (json !== null ? json : text) };
  } catch (e) {
    return { ok: false, error: new Error(/abort/i.test(e.message) ? `timed out after ${TIMEOUT_MS}ms` : e.message) };
  } finally { clearTimeout(t); }
}

const enc = (s) => encodeURIComponent(String(s));

const FAIL = (e) => ({ ok: false, error: e.message, ...(e.hint ? { hint: e.hint } : {}) });

// ── tools ───────────────────────────────────────────────────────────────────────
async function datastoreGet(a) {
  const c = cfg(a);
  const miss = missing(c, { universe: true }); if (miss.length) return { ok: false, error: `missing ${miss.join(', ')}` };
  if (!a.data_store || !a.entry_key) return { ok: false, error: 'data_store and entry_key are required' };
  const scope = a.scope || 'global';
  const r = await call('GET', `/cloud/v2/universes/${c.universeId}/data-stores/${enc(a.data_store)}/scopes/${enc(scope)}/entries/${enc(a.entry_key)}`);
  if (!r.ok) return FAIL(r.error);
  return { ok: true, entry: r.data };
}

async function datastoreSet(a) {
  const c = cfg(a);
  const miss = missing(c, { universe: true }); if (miss.length) return { ok: false, error: `missing ${miss.join(', ')}` };
  if (!a.data_store || !a.entry_key) return { ok: false, error: 'data_store and entry_key are required' };
  const scope = a.scope || 'global';
  if (a.value === undefined) return { ok: false, error: 'value is required (any JSON value)' };
  const body = { value: typeof a.value === 'string' ? a.value : JSON.stringify(a.value) };
  if (a.users) body.users = a.users;
  const exists = await call('GET', `/cloud/v2/universes/${c.universeId}/data-stores/${enc(a.data_store)}/scopes/${enc(scope)}/entries/${enc(a.entry_key)}`);
  if (exists.ok) {
    const r = await call('PATCH', `/cloud/v2/universes/${c.universeId}/data-stores/${enc(a.data_store)}/scopes/${enc(scope)}/entries/${enc(a.entry_key)}?allow_missing=false`, { body });
    if (!r.ok) return FAIL(r.error);
    return { ok: true, updated: true, entry: r.data };
  }
  const r = await call('POST', `/cloud/v2/universes/${c.universeId}/data-stores/${enc(a.data_store)}/entries?data_store_id=${enc(a.data_store)}`, {
    body: { ...body, entry_key: a.entry_key, scope },
  });
  if (!r.ok) return FAIL(r.error);
  return { ok: true, created: true, entry: r.data };
}

async function listDataStores(a) {
  const c = cfg(a);
  const miss = missing(c, { universe: true }); if (miss.length) return { ok: false, error: `missing ${miss.join(', ')}` };
  const r = await call('GET', `/cloud/v2/universes/${c.universeId}/data-stores?maxPageSize=${Number(a.limit) || 20}`);
  if (!r.ok) return FAIL(r.error);
  return { ok: true, data_stores: r.data };
}

async function publishMessage(a) {
  const c = cfg(a);
  const miss = missing(c, { universe: true }); if (miss.length) return { ok: false, error: `missing ${miss.join(', ')}` };
  if (!a.topic) return { ok: false, error: 'topic is required' };
  if (a.message === undefined) return { ok: false, error: 'message is required' };
  const r = await call('POST', `/messaging-service/v1/universes/${c.universeId}/topics/${enc(a.topic)}`, { body: { message: typeof a.message === 'string' ? a.message : JSON.stringify(a.message) } });
  if (!r.ok) return FAIL(r.error);
  return { ok: true, published: true, response: r.data };
}

async function runLuau(a) {
  const c = cfg(a);
  const miss = missing(c, { universe: true, place: true }); if (miss.length) return { ok: false, error: `missing ${miss.join(', ')}` };
  if (!a.script) return { ok: false, error: 'script is required (Luau source; the return value is captured)' };
  // A binary-ish task id is required in the path. Roblox accepts the string "-" so the server
  // allocates one; that is the pattern the docs use for a one-shot task.
  const path = `/cloud/v2/universes/${c.universeId}/places/${c.placeId}/luau-execution-session-tasks`;
  const r = await call('POST', path, { body: { script: a.script, timeout: a.timeout ? `${a.timeout}s` : '30s' } });
  if (!r.ok) return FAIL(r.error);
  return { ok: true, task: r.data, note: 'Poll roblox_task_logs with the returned task path to read output.' };
}

async function taskLogs(a) {
  const c = cfg(a);
  const miss = missing(c, { universe: true, place: true }); if (miss.length) return { ok: false, error: `missing ${miss.join(', ')}` };
  if (!a.task_id) return { ok: false, error: 'task_id is required (from roblox_run_luau)' };
  const id = String(a.task_id).includes('/') ? String(a.task_id).split('/').pop() : String(a.task_id);
  const r = await call('GET', `/cloud/v2/universes/${c.universeId}/places/${c.placeId}/luau-execution-session-tasks/${enc(id)}/logs?maxPageSize=${Number(a.limit) || 100}`);
  if (!r.ok) return FAIL(r.error);
  return { ok: true, logs: r.data };
}

async function universeInfo(a) {
  const c = cfg(a);
  const miss = missing(c, { universe: true }); if (miss.length) return { ok: false, error: `missing ${miss.join(', ')}` };
  const r = await call('GET', `/cloud/v2/universes/${c.universeId}`);
  if (!r.ok) return FAIL(r.error);
  return { ok: true, universe: r.data };
}

const TOOLS = [
  { name: 'roblox_datastore_get', description: 'Read one entry from a Roblox DataStore by key, via Open Cloud v2. Scope: universe-datastore:read. Returns the entry including its value and version.', inputSchema: { type: 'object', properties: { data_store: { type: 'string' }, entry_key: { type: 'string' }, scope: { type: 'string', description: 'defaults to "global"' }, universe_id: { type: 'string' } }, required: ['data_store', 'entry_key'] } },
  { name: 'roblox_datastore_set', description: 'Create or update one DataStore entry (upsert: reads first, then PATCHes or POSTs). Scopes: universe-datastore:read and universe-datastore:write. value may be any JSON; it is stringified for storage.', inputSchema: { type: 'object', properties: { data_store: { type: 'string' }, entry_key: { type: 'string' }, value: {}, scope: { type: 'string' }, universe_id: { type: 'string' } }, required: ['data_store', 'entry_key', 'value'] } },
  { name: 'roblox_list_datastores', description: 'List the DataStores in a universe. Scope: universe-datastore:read. Use it to discover names before reading entries.', inputSchema: { type: 'object', properties: { limit: { type: 'number' }, universe_id: { type: 'string' } } } },
  { name: 'roblox_publish_message', description: 'Publish a MessagingService topic to every running server of the universe (LiveOps broadcasts, config-version doorbells). Scope: universe.messaging-service:publish. Delivery is best effort — publish a version/hint and let the server read authoritative state.', inputSchema: { type: 'object', properties: { topic: { type: 'string' }, message: {}, universe_id: { type: 'string' } }, required: ['topic', 'message'] } },
  { name: 'roblox_run_luau', description: 'Run a Luau snippet against a place, headlessly, via the Open Cloud Luau Execution API — no Studio needed. Scope: universe.place:write plus luau execution. Returns a task; read its output with roblox_task_logs.', inputSchema: { type: 'object', properties: { script: { type: 'string' }, timeout: { type: 'string', description: 'e.g. "30s"' }, universe_id: { type: 'string' }, place_id: { type: 'string' } }, required: ['script'] } },
  { name: 'roblox_task_logs', description: 'Fetch the logs of a Luau execution task, to read what the script printed or returned. Scope: universe.place:write.', inputSchema: { type: 'object', properties: { task_id: { type: 'string' }, limit: { type: 'number' }, universe_id: { type: 'string' }, place_id: { type: 'string' } }, required: ['task_id'] } },
  { name: 'roblox_universe_info', description: 'Read a universe\'s metadata (name, owner, visibility) to confirm the ID you configured is the right one.', inputSchema: { type: 'object', properties: { universe_id: { type: 'string' } } } },
];

const HANDLERS = {
  roblox_datastore_get: datastoreGet,
  roblox_datastore_set: datastoreSet,
  roblox_list_datastores: listDataStores,
  roblox_publish_message: publishMessage,
  roblox_run_luau: runLuau,
  roblox_task_logs: taskLogs,
  roblox_universe_info: universeInfo,
};

// ── MCP plumbing ────────────────────────────────────────────────────────────────
let buffer = '';
const send = (m) => process.stdout.write(JSON.stringify(m) + '\n');
const ok = (id, result) => send({ jsonrpc: '2.0', id, result });
const fail = (id, code, message) => send({ jsonrpc: '2.0', id, error: { code, message: String(message) } });

async function handle(msg) {
  const { id, method, params } = msg || {};
  if (method === 'initialize') return ok(id, { protocolVersion: '2024-11-05', capabilities: { tools: {} }, serverInfo: { name: 'roblox-open-cloud', version: '0.1.0' } });
  if (method === 'notifications/initialized') return;
  if (method === 'tools/list') return ok(id, { tools: TOOLS });
  if (method === 'tools/call') {
    const fn = HANDLERS[params && params.name];
    if (!fn) return fail(id, -32602, `unknown tool ${params && params.name}`);
    try { return ok(id, { content: [{ type: 'text', text: JSON.stringify(await fn((params && params.arguments) || {}), null, 2) }] }); }
    catch (e) { return ok(id, { content: [{ type: 'text', text: JSON.stringify({ ok: false, error: String(e.message || e) }) }], isError: true }); }
  }
  if (id !== undefined) fail(id, -32601, `method not found: ${method}`);
}

if (require.main === module) {
  for (const lvl of ['log', 'info', 'warn', 'error', 'debug', 'trace']) {
    console[lvl] = (...a) => { try { process.stderr.write(a.map((x) => (typeof x === 'string' ? x : JSON.stringify(x))).join(' ') + '\n'); } catch { /* gone */ } };
  }
  process.stdin.on('data', (c) => {
    buffer += c.toString('utf8');
    let nl;
    while ((nl = buffer.indexOf('\n')) !== -1) {
      const line = buffer.slice(0, nl).trim(); buffer = buffer.slice(nl + 1);
      if (!line) continue;
      let m; try { m = JSON.parse(line); } catch { continue; }
      handle(m).catch((e) => { if (m.id !== undefined) fail(m.id, -32603, e.message); });
    }
  });
  process.stdin.on('end', () => process.exit(0));
}

module.exports = { TOOLS, handle, datastoreGet, datastoreSet, publishMessage, runLuau, taskLogs, call };
