# Roblox development

Two surfaces, for two different jobs. Keeping them apart is the whole trick.

## 1. Live editing — Studio's built-in MCP server
Roblox now ships an MCP server **inside Studio**, and it is the current official path (the older
`Roblox/studio-rust-mcp-server` is archived). It speaks stdio and proxies into the running Studio
session, so it only exists while Studio is open with a place loaded.

Enable it: Studio → **Assistant** → **⋯** → **Manage MCP Servers** → **Enable Studio as MCP server**.
Quick-connect supports Claude Code, Codex, Cursor and others.

It gives the agent `script_read` / `multi_edit` / `script_search` / `script_grep`, `execute_luau`,
`search_game_tree` / `inspect_instance`, asset generation, and playtest control
(`start_stop_play`, `get_console_output`, input simulation). Full detail, and the behavioural
gotchas that matter, are in `skills/roblox-studio/SKILL.md`.

## 2. Headless operations — Open Cloud
`https://apis.roblox.com`, authenticated with an `x-api-key`. Works whether or not Studio is
running. This is what the kit ships, as **`mcp/roblox-open-cloud/`** — seven tools:

| Tool | Does | Scope |
|---|---|---|
| `roblox_datastore_get` | read one entry | `universe-datastore:read` |
| `roblox_datastore_set` | upsert one entry (reads, then PATCH/POST) | read + `universe-datastore:write` |
| `roblox_list_datastores` | discover store names | `universe-datastore:read` |
| `roblox_publish_message` | publish a MessagingService topic | `universe.messaging-service:publish` |
| `roblox_run_luau` | run Luau headlessly against a place | place Luau-execution scope |
| `roblox_task_logs` | read a Luau task's output | place Luau-execution scope |
| `roblox_universe_info` | confirm the universe id | — |

Configure in `config/keys.env`: `ROBLOX_API_KEY`, `ROBLOX_UNIVERSE_ID`, `ROBLOX_PLACE_ID`. The key
is created in **Creator Hub → Credentials** and scoped per resource. A missing scope returns 401
with a message that does not name the scope — each tool's description names the one it needs.

The bigger Open Cloud notes (DataStore budget shared with the engine, MessagingService best-effort
delivery and the doorbell pattern, version-pinned Luau execution for a reliable smoke test) are in
`skills/roblox-open-cloud/SKILL.md`.

## Runtime debugging
`skills/roblox-studio/SKILL.md` also covers the community server
(`npx -y @chrrxs/robloxstudio-mcp@latest --auto-install-plugin`), which runs Luau in the **live
server or client VM** using the same `require` cache as the game, and carries breakpoints and
profilers. Use it for "why is this value wrong at runtime", not for editing scripts.

## The loop
Read before editing; make the smallest change; **run it and read the output**; read the script back
after a batch edit. A write that did not error is not a change that works. `skills/roblox-luau/`
has the conventions — server owns state, validate every remote input, wrap every DataStore call.
