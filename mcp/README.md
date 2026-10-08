# mcp/ — the local tool servers

Seven servers make up the agent's toolset. Two live in this repository; four are cloned by
`scripts/install.js` into `mcp/` and are not committed, so each install stays current. The seventh,
`api-anything`, is optional: the installer builds it from source into a global npm prefix and wires
it in only if it succeeds.

| Server | Source | What it exposes |
|---|---|---|
| `shop-tools` | this repo | `listing_validate`, `support_triage`, `research_rank`, `dispute_guard` |
| `roblox-open-cloud` | this repo | DataStore get/set/list, MessagingService publish, Luau execution + logs, universe info |
| `commit-condom` | `ronisaguey-ux/commit-condom` | `cc_plan`, `cc_commit`, `cc_check`, `cc_status`, `cc_audit` |
| `tool-call-compactor` | `ronisaguey-ux/tool-call-compactor` | the batch index that keeps tool schemas out of the per-turn prompt |
| `free-ai` | `ronisaguey-ux/free-ai` | free-model subagents, swarms, file reads, batch LLM tasks |
| `claude-agy` | `ronisaguey-ux/claude-agy-mcp` | spawn/drive Claude Code and agy sessions as subagents |
| `api-anything` | `goodnight000/api-anything` (global npm) | `list_sites`, `list_operations`, `call_operation`, `login` — call websites as JSON |

`shop-tools` and `roblox-open-cloud` are zero-dependency and need no setup. The four clones are wired
in `opencode.json` (at the kit root) and `config/tcc.config.json`; `scripts/install.js` clones them
and substitutes the kit path (`__KIT_DIR__`). Do not edit those paths by hand — re-run `install.js`.

`api-anything` is wired in `config/tcc.config.json` only (never `opencode.json`), under the
`api_anything` group. If it is not installed — an offline build, or Node below 22.13 — `install.js`
removes the upstream **and** its group so nothing tries to start a missing command, and the kit runs
unchanged. To add it later, re-run `install.js` on Node ≥ 22.13, or install it yourself and re-run.

`roblox-studio` is also present in `opencode.json` but `enabled: false`: it is the community
Studio bridge (`npx @chrrxs/robloxstudio-mcp`), which only makes sense while Studio is open. Enable it
when doing live runtime debugging.

## Wiring a server into the agent

1. Add it to `mcp` in `config/tcc.config.json` (as an upstream).
2. Add it to a `groups` entry — a group is what the agent sees as one batch in the index.
3. Restart the orchestrator. The group description is what the agent reads to decide whether to open
   the batch; write it as 20–100 words naming the capabilities it could not guess from the title.

A server added directly to `opencode.json` instead of the compactor will cost its full schema on
every turn. Add it to the compactor unless it is used on essentially every request.

## Adding a remote platform server

`mcp/servers.md` lists the Etsy, Shopify, IMAP, Meta and research servers worth connecting, with the
scopes and the approval notes for each.
