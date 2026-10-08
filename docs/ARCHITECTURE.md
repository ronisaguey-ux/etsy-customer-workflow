# How the kit fits together

```
you ── say "orchestrator" ──▶ opencode (the agent)
                                   │
        ┌──────────────────────────┼───────────────────────────┐
        │                          │                           │
   rules.md + AGENTS.md      MCP servers                  skills/
   (behaviour + memory,      (its hands)                  (its playbooks)
    loaded every turn)
```

## The pieces and why each exists

| Piece | What it is | Why |
|---|---|---|
| `rules.md` | standing behaviour | terse reports, never take a step backwards, spend only inside caps, escalate refunds/legal |
| `AGENTS.md` | the agent's memory | shop facts, the daily analytics line, fixes already paid for. It writes this itself. |
| `skills/` | task playbooks | read on demand: listing, research, support, ads, improvement, Roblox, more |
| `mcp/shop-tools/` | deterministic checks | a rule enforced by a function cannot be forgotten or argued away |
| `mcp/roblox-open-cloud/` | Roblox Open Cloud | DataStores, MessagingService, headless Luau |
| `mcp/commit-condom/` | git gate | no monolith commit, no credential in a diff |
| `mcp/tool-call-compactor/` | context compactor | one line per batch instead of every schema every turn |
| `mcp/free-ai/` | free-model subagents | research and bulk work at zero model cost |
| `mcp/claude-agy-mcp/` | Claude as a subagent | deep reasoning on the hard parts, on the owner's subscription |
| `bin/orchestrator` | the one command | loads the keys, checks the tools, opens the agent |

## Model routing

The main agent is opencode on a cheap chain. Most work here — research, drafting, listings, support —
does not need a frontier model, and paying for one on every turn is waste. Two kinds of work are
delegated:

```
task ──▶ main agent (cheap chain)
            │  can it answer from the code, the docs, one command?
            │  yes ──▶ answer it, done
            │  bulk/research ──▶ free-model subagent (free-ai)
            └─ hard reasoning ──▶ agent_spawn a Claude session with a tight brief
                                    └─▶ read the answer, verify it, act
```

`skills/claude-subagents/SKILL.md` is the playbook: escalate the reasoning, not the typing; give the
subagent the file and line and what was already tried; and test what comes back before acting on it.
Claude Code needs no API key — the subscription is the credential.

## The two ideas that make it cheap

**Compaction.** Every MCP you connect normally adds its full JSON schema to *every* request. Measured
on a real setup: 518 tools ≈ **122,476 tokens of schema per turn**, versus **≈3,971** through the
compactor — a ~98% cut in the static prefix, because it describes each *batch* in one line and only
fetches a schema when the agent opens it.

**Cache-friendly prompts.** Stable content (rules, tool index, shop taxonomy) sits at the front, so
every turn matches the model's prefix cache. On DeepSeek that is **$0.003/M input instead of
$0.15/M** — a 50× difference on the part of the prompt that never changes.

Together those are why the running cost is cents rather than dollars.

## The two ideas that make it honest

**Verify by driving the thing.** The agent runs the code, curls the route, reads the artifact — it
does not report a step it did not observe. The checkers exist so "I validated the listing" means a
function returned no violations, not that a model felt good about it.

**Revert what does not work.** The improvement loop changes one variable, measures it, and puts it
back if the number did not improve. A losing change is never left in place because reverting is work.

## Day one, and every day after
1. First run: the agent asks the facts it cannot look up and writes them into `AGENTS.md`.
2. Daily: `scripts/analytics-digest.js` appends one line of numbers; `scripts/check-updates.js`
   keeps the bundled tools current.
3. Whenever something feels stuck: `scripts/health-check.js`.

Everything above is plain files the owner can read. Nothing is a hosted service, and nothing holds
a key except `config/keys.env`.
