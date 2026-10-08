---
name: roblox-open-cloud
description: Use when operating a Roblox experience from outside the engine — reading or writing DataStores, publishing MessagingService topics, running headless Luau, or calling any Open Cloud REST endpoint. Covers the API key, its scopes, and the tools the kit ships for it.
---

# Roblox Open Cloud (headless, no Studio)

Open Cloud is a REST API at **`https://apis.roblox.com`**, authenticated with an **`x-api-key`**
header. It works whether or not Studio is running, which is what makes it the right surface for an
agent that has to operate on its own.

## The key and its scopes
Create the key in **Creator Hub → Credentials**, scoped per resource. Roblox scopes are fine-grained,
and a missing scope returns **401 with a message that does not name the absent scope** — so the
tools in `mcp/roblox-open-cloud/` each state the scope they need:

| Tool | Scope |
|---|---|
| `roblox_datastore_get`, `roblox_list_datastores` | `universe-datastore:read` |
| `roblox_datastore_set` | `universe-datastore:read` **and** `universe-datastore:write` |
| `roblox_publish_message` | `universe.messaging-service:publish` |
| `roblox_run_luau`, `roblox_task_logs` | place Luau-execution scope for the universe/place |

Set in `config/keys.env`:
```sh
ROBLOX_API_KEY=...
ROBLOX_UNIVERSE_ID=...     # the experience id
ROBLOX_PLACE_ID=...        # the start place id
```
**Never commit that file, and never paste the key into a prompt.** The agent reads it from the
environment; if it needs to tell you something about the key, it names it, it does not print it.

## The three surfaces the kit uses

**DataStores (v2)** — `/cloud/v2/universes/{u}/data-stores/...`. Get, set, list. The v2 path is
what to use; the v1 paths stop sharing the experience's dynamic budget after **2026-07-29**. Note:
v2 calls **share the experience's DataStore request budget with in-engine `DataStoreService`** —
there is no separate unlimited pool for external callers, so space your writes.

**MessagingService** — `POST /messaging-service/v1/universes/{u}/topics/{topic}` publishes to every
running server, which receives it via `MessagingService:SubscribeAsync`. **Delivery is best effort,
not guaranteed.** The robust pattern is a *doorbell*: publish a version or hint (`{config_version: 42}`)
and have the server read authoritative state, rather than shipping the payload itself. That survives
drops, duplicates and reordering.

**Luau Execution** — `POST /cloud/v2/universes/{u}/places/{p}/luau-execution-session-tasks` runs
Luau headlessly. Use it to smoke-test a change, run a migration, or read engine state on demand.
Pin a **version** (the `.../versions/{v}/...` path) to run against a known saved build instead of
whatever is live — that is what makes it a reliable CI primitive. Read the result with
`roblox_task_logs`.

## Rules
- **One write at a time, and read it back.** After a DataStore set, read the entry. After a Luau
  task, read its logs. The API returning 200 is not proof the value changed.
- **Never run a destructive migration without a snapshot.** `SnapshotDataStores` exists; take one.
- **A 401 does not mean the key is wrong** — it usually means the scope is. Check the tool's scope
  against the key's scoped resources before rotating anything.
- **Do not poll.** Budget is shared; a retry loop against a throttled endpoint makes it worse. Back
  off and space calls.

## Full reference
The canonical OpenAPI document is generated into `Roblox/creator-docs`
(`content/en-us/reference/cloud/openapi.json`) and rendered at
`create.roblox.com/docs/cloud/reference`. When you need an endpoint this kit does not wrap, read the
spec rather than guessing a path — the versioned paths (`/cloud/v2/...`) are the current ones.
