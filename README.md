# shop-agent-kit

A self-hosted AI workspace for an Etsy + Shopify seller that also does Roblox development. It runs
under [opencode](https://opencode.ai) on the owner's own machine. All state is plain files; the only
secret store is `config/keys.env`.

The agent researches what sells, writes listings, answers customer mail, runs ad campaigns,
supports Roblox development, and keeps a trend line of the shop's numbers. It enforces its own
rules through deterministic local tools rather than trusting the model to remember them.

## Install

Works on **Windows, macOS and Linux** — every helper is Node.js, which is the only runtime the kit
needs. Windows users: run the commands below from **PowerShell** or **cmd** (not WSL, unless you want
to; the kit runs natively either way).

```sh
git clone https://github.com/ronisaguey-ux/etsy-customer-workflow
cd etsy-customer-workflow
node scripts/install.js     # clones the local servers, mirrors skills, writes config
```

Then either fill in `config/keys.env` and run `bin/orchestrator.cmd` (Windows) or `./bin/orchestrator`
(macOS/Linux), or hand the folder to Claude Code and say `set up`.

```sh
$EDITOR config/keys.env     # fill in the keys (setup.md §2 lists every one)
bin\orchestrator.cmd        # Windows
./bin/orchestrator          # macOS / Linux
```

The installer needs **Node.js 20.12+**, **git**, and **opencode** — nothing else, on any platform.
On Windows, `bin\orchestrator.cmd` is the launcher; on macOS/Linux, `./bin/orchestrator`.

## Layout

```
rules.md                  agent behaviour: reporting shape, spend caps, escalation rules
AGENTS.md                 agent memory: shop facts, verified recipes, the daily analytics log
CLAUDE.md                 install instructions an agent follows for "set up"
setup.md                  manual install: dependencies, keys, install, first run
docs/ARCHITECTURE.md      how the pieces fit and why
docs/ROBLOX.md            the two Roblox surfaces and what each is for
bin/orchestrator          launcher (+ orchestrator.cmd)
config/                   keys template, spend limits, commit policy, MCP wiring
skills/                   task playbooks (see below)
mcp/shop-tools/           listing / support / research / dispute checks (zero deps)
mcp/roblox-open-cloud/    DataStores, MessagingService, headless Luau (zero deps)
lib/env.js                the one keys.env reader every script shares
scripts/                  install.js · health-check.js · check-updates.js · analytics-digest.js · enable-*.js
test/                     test suites for the local servers
```

## Capabilities

| Task | Entry point |
|---|---|
| Validate a listing before publishing | `listing_validate` |
| Decide reply vs escalate on a customer message | `support_triage` |
| Pre-screen a non-receipt claim against carrier tracking | `dispute_guard` |
| Rank candidate products by evidence | `research_rank` |
| Call a website as JSON (Amazon, YouTube, Airbnb, more) | `call_operation` (see `skills/web-as-api/`) |
| Read/write a Roblox DataStore | `roblox_datastore_get` / `roblox_datastore_set` |
| Publish a MessagingService topic | `roblox_publish_message` |
| Run Luau headlessly and read its output | `roblox_run_luau` / `roblox_task_logs` |
| Append the day's orders/revenue/spend to `AGENTS.md` | `node scripts/analytics-digest.js` |
| Check configured APIs, clear a dead lock | `node scripts/health-check.js` |
| Update the bundled tool servers | `node scripts/check-updates.js --update` |
| Gate git commits | `node scripts/enable-commit-gate.js <repo>` |
| Put the token behind a proxy, hand the agent a dummy | `node scripts/enable-push-gate.js` |

Skills (read on demand): `etsy-listing`, `product-research`, `support-replies`, `meta-ads`,
`self-improvement`, `telegram`, `roblox-studio`, `roblox-luau`, `roblox-open-cloud`,
`claude-subagents`, `web-as-api`. Each is a `SKILL.md` under `skills/`.

## Model routing

The main agent runs a cheap model chain (DeepSeek, with free routers as fallback). Two kinds of work
are delegated:

- **Bulk and research** go to free-model subagents (`mcp/free-ai/`), so they cost nothing.
- **Hard reasoning** — an unexplained bug, a design decision with trade-offs, a review of something
  that must be correct — goes to **Claude Code as a subagent** (`mcp/claude-agy-mcp/`), using the
  owner's Claude subscription. No API key: log in once with `claude`. See
  `skills/claude-subagents/SKILL.md` for when to escalate and when not to.

## Deterministic checks

`mcp/shop-tools/` is a zero-dependency local server the agent calls before risky actions:

- `listing_validate` — Etsy's published limits (140-char title and its character rules, 13 tags of
  20 chars, unique and valid tags, non-empty description, required taxonomy) and returns every fix.
  Quality advice is returned separately from violations, so an opinion is never presented as a
  platform rule.
- `support_triage` — reply vs escalate. Refunds, chargebacks, legal, platform notices and order
  problems always escalate.
- `research_rank` — ranks candidates by observable evidence. Sales inputs are estimates; it ranks,
  it does not forecast.
- `dispute_guard` — reads the carrier scan and returns defend / do_not_dispute / escalate, with a
  reply that cites only what the carrier reported.

The rules are functions rather than prompt text: the same input gives the same verdict, and the
behaviour is covered by tests (`npm test`).

## Context and cost

Two mechanisms keep the per-turn cost low:

1. **Tool-call compactor** (`mcp/tool-call-compactor/`). Connecting MCP servers directly adds every
   tool schema to every request — measured at 518 tools ≈ 122,476 tokens per turn. Through the
   compactor the index costs ≈3,971 tokens and a batch's schemas are fetched only when opened.
2. **Cache-friendly prompts.** Stable content (rules, tool index, shop taxonomy) is kept at the front
   of the prompt so each turn matches the model's prefix cache. On DeepSeek that is $0.003/M input
   against $0.15/M — a 50× difference on the invariant part of the prompt.

## What it does not do

- It does not include API credits. Keys and usage are the owner's.
- It cannot create the Etsy shop or verify a Meta business; those are platform queues. Shopify works
  immediately.
- It does not forecast revenue. Every sales figure from a research tool is an estimate (~80%
  accurate); it is used to rank, never quoted as fact.
- Roblox Studio's built-in MCP server exists only while Studio is open with a place loaded. The
  Open Cloud server is the part that runs without Studio.

MIT.
