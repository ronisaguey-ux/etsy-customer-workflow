---
name: roblox-studio
description: Use when editing a Roblox place live in Studio — reading or writing scripts, inspecting the game tree, running Luau in a running playtest, generating assets, or playtesting. Covers Studio's built-in MCP server and the community runtime-debugging server.
---

# Roblox Studio (live editing)

There are two ways to drive Studio from the agent, and they are for different jobs.

## 1. Studio's built-in MCP server (the current official path)

Roblox ships an MCP server **inside Studio** now. It is the recommended path; the old
`Roblox/studio-rust-mcp-server` is archived and kept only for reference.

**Enable it once, per machine:**
1. Open Roblox Studio and load the place you are working on.
2. Open **Assistant** (top right) → **⋯** → **Manage MCP Servers**.
3. Turn on **Enable Studio as MCP server**. A green dot appears when a client connects.
4. Quick-connect supports Claude Code, Codex, Cursor and others — add the connection it offers.

It speaks **stdio** and proxies into the running Studio session, so it only works while Studio is
open with the place loaded. If the agent cannot reach it, that is the reason — not a broken config.

**What it gives you, by category:**

| Category | Tools | Use for |
|---|---|---|
| Scripts | `script_read`, `multi_edit`, `script_search`, `script_grep` | read by dot-path (`game.ServerScriptService.MyScript`), batch-edit, or find a script by name/pattern |
| Luau | `execute_luau` | run Luau in Studio and get the result or the error |
| Data model | `search_game_tree`, `inspect_instance` | find an instance and read its properties |
| Assets | `generate_mesh`, `generate_material`, `generate_procedural_model`, `insert_asset`, `upload_image` | create and place content |
| Playtest | `start_stop_play`, `get_console_output`, `screen_capture` | run the game and read what happened |
| Input | `user_keyboard_input`, `user_mouse_input`, `character_navigation` | drive the character in a playtest |

**The rules that matter in practice:**
- `execute_luau` is **stateless** — every call starts fresh, so re-acquire any reference you need.
- Edit-context writes (`multi_edit`, an Edit `execute_luau`) touch the **saved place**; they never
  reach a running playtest. To test a change live you must start play and target the Server or
  Client VM.
- Keep individual Luau payloads bounded; a huge script can exceed the bridge's command limit.
  Split it and read back to confirm each part landed.
- **Verify by reading the result, not by assuming the write worked.** After `multi_edit`, read the
  script back; after `execute_luau`, check the returned value or error.

## 2. Community runtime-debugging server (`Chrrxs/robloxstudio-mcp`)

```sh
npx -y @chrrxs/robloxstudio-mcp@latest --auto-install-plugin
```
It installs a Studio plugin that polls a local bridge. Its advantage over the built-in server is
**running-code visibility**: `eval_server_runtime` / `eval_client_runtime` run Luau in the live
server or client VM using the same `require` cache as your game, so they can see mutated runtime
tables that the built-in `execute_luau` cannot. It also carries breakpoints, runtime logs per peer,
and the script/micro profilers.

Requires **Allow HTTP Requests** in Game Settings → Security, and a full Studio restart after the
plugin installs.

## Choosing

- Editing scripts and inspecting the place → the **built-in** server.
- "Why is this value wrong at runtime / why is it slow / reproduce with two players" → the
  **community** server.
- Neither is a substitute for reading the code. Read before you edit, and verify after.
