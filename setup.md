# setup.md — how to install this (read this first)

You are holding a folder, not a service. Nothing here runs until you follow these steps, and
nothing here does your work for you — it is the workspace your AI orchestrator runs inside.

**Prefer to have an agent do it?** Give the zip to Claude Code and say **`set up`**. It reads
`CLAUDE.md`, which walks it through the dependencies, the `orchestrator` command, your keys and the
memory file. The rest of this page is the same install, by hand.

Estimated time: **20–30 minutes**, most of it waiting on signups.

---

## 1. What you need first (the dependencies)

The kit runs natively on **Windows, macOS and Linux**. Everything it ships is Node.js, which is the
only runtime it needs. On Windows, use **PowerShell** or **cmd** — WSL is not required.

| Thing | Why | Where |
|---|---|---|
| **Node.js 20.12+** | runs the agent's helpers and the launcher | https://nodejs.org (Windows/macOS installer, then reopen your terminal) |
| **git** | clones the tool servers, versions your work | https://git-scm.com/downloads (Windows: the Git for Windows installer) |
| **opencode** | the agent itself | https://opencode.ai/docs — Windows: `npm install -g opencode-ai`, or see the site's installer |
| **Claude Code** | the deep-reasoning subagent the main agent calls | `npm install -g @anthropic-ai/claude-code`, then run `claude` once to log in with your subscription |

Verify — the same commands on every platform:
```
node -v        # must be v20.12 or higher
git --version
opencode --version
claude --version
```

> **Why Claude Code is here even though the main agent is opencode:** the orchestrator runs a cheap
> model chain, which is right for most work. For the hard parts — a bug whose cause is not obvious,
> a design decision, a careful review — it hands the problem to Claude as a subagent. That uses your
> existing Claude **subscription**; there is no API key, and you do not need to buy one.

> **Where to put the folder:** anywhere you can write. On Windows, a normal path like
> `C:\Users\you\etsy-agent-kit` is fine. Avoid a folder synced by OneDrive/Dropbox — the sync
> fighting the tool clones causes confusing failures.

> **Optional — websites as APIs (Node 22.13+):** `install.js` will also build
> [`api-anything`](https://github.com/goodnight000/api-anything), which lets the agent call a website
> as JSON instead of driving a browser (Amazon product search, YouTube, Airbnb, Google Flights and
> more work logged out). It is optional and never blocks the install: on older Node, or if the build
> fails, the installer skips it and continues. To use it after a skip, upgrade to Node 22.13+ and
> re-run `node scripts/install.js`. See `skills/web-as-api/SKILL.md`.

## 2. Get your API keys

The orchestrator is only as good as the models behind it. You need **one paid key** and you
should collect the **free ones** too; the kit falls back down the chain automatically.

**Paid (needed):**
- **DeepSeek** — https://platform.deepseek.com — the orchestrator's main model. Add $5–10.
  `deepseek-flash` is cheap; with the kit's cache-friendly prompt the cost per turn is tiny.

**Free (collect all three, they cost nothing):**
- **OrcaRouter** — https://orcarouter.ai — sign in with GitHub, **no card**. Key looks like
  `sk-orca-…`. Free models end in `-free`; the kit uses the unified `orcarouter/free` entry.
- **OpenRouter** — https://openrouter.ai — free models, used as overflow.
- **Dahl** — as you specified; add its key when you have it.

**Roblox (only if you do Roblox work):**
- **Roblox Open Cloud** — Creator Hub → **Credentials** → create an API key scoped to your universe.
  Put the key, universe id and place id in `config/keys.env`. `skills/roblox-open-cloud/SKILL.md`
  lists which scope each tool needs. Studio's own MCP server needs no key (see `docs/ROBLOX.md`).

The exact variable names are in `config/keys.env.example` — they are the names the kit's scripts
read, so fill them in as written rather than renaming them.

Put them in `config/keys.env` (created in step 4). **Never commit that file, never paste a key
into a chat, and never give a key to the agent to read back to you.**

## 3. Install the orchestrator

Open a terminal **in the folder** (Windows: right-click the folder → "Open in Terminal"; or
`cd` to it in PowerShell/cmd):

```
node scripts/install.js
```

That installs the local MCP servers the kit ships with and wires them into `opencode.json`:

- **shop-tools** — the checkers (listing, support triage, dispute guard, product rank).
- **roblox-open-cloud** — DataStores, MessagingService and headless Luau.
- **commit-condom** — stops the agent making one giant mixed commit.
- **tool-call-compactor** — keeps the agent's context cheap.
- **free-ai** — free-model subagents for research and bulk work.
- **claude-agy** — calls Claude Code as a subagent for deep reasoning (uses your subscription).

It also mirrors the skills into `.opencode/skills/` so they load without extra setup.

## 4. Add your keys

`scripts/install.js` already created the file for you. Open it in any editor and fill in the values
from step 2. The template explains what each one is and where to get it.

```
config/keys.env
```

On Windows the file permissions are yours by default; on macOS/Linux, tighten it once:

```
chmod 600 config/keys.env
```

## 5. Start it

From the kit folder:

```
bin\orchestrator.cmd        Windows (cmd or PowerShell)
./bin/orchestrator          macOS / Linux
```

That is the whole interface. It opens the agent in this folder with the rules, the memory file, the
MCPs and the compactor already loaded. It also checks the toolchain and the local servers first, and
names the exact fix if something is missing.

To run it by name from anywhere, add `bin` to your PATH:
- **Windows:** Settings → "Edit the system environment variables" → Environment Variables → add the
  kit's `bin` folder to `Path`, then reopen your terminal.
- **macOS/Linux:** `echo 'export PATH="$PWD/bin:$PATH"' >> ~/.bashrc && source ~/.bashrc`

## 6. First run — let it learn your shop

On the first start the agent will introduce itself and ask for the facts it cannot look up:
shop name, what you sell, digital or physical, your tone of voice. It writes them into
`AGENTS.md` (its memory) and will not ask twice.

Then try one of these:

- `research what sticker packs sold 1000+ times in the last year`
- `draft 5 listings for these designs` (attach or describe them)
- `check my email and draft replies`

## 7. What to connect when you have it

| Service | When | How |
|---|---|---|
| **Telegram** | now — this is how the agent reaches you | the agent helps you create the bot; then it reports and asks over Telegram instead of hanging a terminal waiting for you |
| **Shopify** | now — it does not wait on approval | create a custom app in your Shopify admin, copy the Admin API token into `config/keys.env` |
| **Etsy** | when your shop is approved | the agent walks you through the OAuth consent in the browser; the token refreshes itself |
| **Meta / Facebook** | when you want ads | the agent guides the app + business setup; ads stay off until a token exists |

## 8. The three helpers worth scheduling

**Stay current.** The kit does not vendor the tool servers it clones, so they can drift behind
GitHub. Check daily, and fast-forward when behind:

```
node scripts/check-updates.js            # report only, exits 1 if anything is stale
node scripts/check-updates.js --update   # fast-forward anything behind (never merges)
```

Schedule it — 7am daily:
- **Windows** (Task Scheduler): create a Basic Task, daily, action = Start a program,
  program `node`, arguments `scripts\check-updates.js --update`, start-in = the kit folder.
- **macOS/Linux** (cron): `(crontab -l 2>/dev/null; echo "0 7 * * * cd \$HOME/etsy-agent-kit && node scripts/check-updates.js --update") | crontab -`

A clone with local changes, or one that has diverged, is reported and left alone — this never
merges and never discards work.

**Daily numbers into the agent's memory.** One line a day, so the agent can see a trend instead
of judging a single day:

```
node scripts/analytics-digest.js          # append today's orders / revenue / spend to AGENTS.md
```
Schedule it the same way (Task Scheduler on Windows, cron elsewhere) — 8am daily.
It is idempotent per day (re-running replaces today's line, it does not duplicate), it only uses
metrics the platforms actually expose, and it says so when one is not exposed rather than writing
a zero. Etsy exposes no traffic/impressions endpoint.

**Health check when something feels stuck.** Confirms each configured API answers, and clears a
lock file whose owning process is dead (a hang leaves one behind and the next run refuses to
start). A lock with a live owner is left strictly alone:

```
node scripts/health-check.js
```
Exit 0 means every *configured* service is healthy; a service with no key is reported as "not
configured" and does not fail the check, so a fresh install passes.

## 9. Gating the agent's git work (optional)

Two levels, and they are worth understanding apart.

```
node scripts/enable-commit-gate.js path/to/your/shop   # client hooks: good default, skippable
node scripts/enable-push-gate.js                        # proxy + dummy token: --no-verify cannot skip it
```

The first refuses one giant commit, a mixed commit, a vague message, or a credential in the diff.
It runs on your machine, so `git push --no-verify` skips it — a strong default, not a boundary.

The second is the real gate. It puts your GitHub token **only** in a local proxy, points every
push through it, and hands the agent a **dummy** token. Then:

- pushing through the proxy works, and the proxy applies the rules to every push;
- pushing straight to GitHub fails, because the dummy is not a real token.

So the agent cannot take the `--no-verify` shortcut, and it cannot step around the proxy either.
It needs the proxy running with your token first; the script says exactly what is missing if it is
not, and proves the mechanism before claiming success.

## 10. Keeping it running (optional)

If you want it working while your laptop is shut: rent a small Linux VPS (~$5/mo), follow
steps 1–5 there instead, and use Telegram as the interface. `scripts/install.js` is the same.

---

## Troubleshooting

| Symptom | Cause | Fix |
|---|---|---|
| `orchestrator: command not found` | PATH not updated | re-run the `echo 'export PATH=…'` line, then `source ~/.bashrc` |
| Agent answers but no tools run | MCP not loaded | `opencode` → check the compactor batch list; run `node scripts/install.js` again |
| `401` from a model | key missing/wrong in `keys.env` | re-check step 4; keys are read at start, so restart `orchestrator` |
| Everything is slow | working under `/mnt/c/` | move the folder into the Linux home (`~/`) |
| Out of credits mid-task | only a paid key can run the main model | top up DeepSeek, or the free chain will be used automatically |
| A background job hangs | a stale lock from a dead process | `node scripts/health-check.js` clears it if the owner is gone |
| `analytics-digest: nothing configured` | no keys yet | fill `config/keys.env`, then re-run |
| A push is refused as "too many files" | the commit gate working as intended | split the commit; the error names the exact `git` commands |

## What this kit is not
- It is not a hosted service. **You run it.** Your keys, your machine (or your $5 VPS).
- It does not include API credits. Model and tool costs are yours and are small if you leave the
  cache settings alone.
- It cannot create your Etsy shop or approve your Meta account. Those are platform queues —
  the kit does not wait for them; Shopify starts now.
