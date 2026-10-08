# CLAUDE.md — operator instructions for Claude Code

When the user says the words **"set up"** do exactly this, in order, verifying each step before
moving to the next. You are setting up a self-hosted AI workspace (a "shop + Roblox agent kit") on
the user's machine. Do not skip steps. Do not claim a step succeeded until you have seen it succeed.

Work in the folder you were given (the unzipped kit, or its clone). Call it `$KIT` — resolve its
absolute path once and use that from then on. **The kit runs natively on Windows, macOS and Linux**,
so first detect the platform and use the right commands for it (`node`, not bash, wherever a script
must run — see step 2). On Windows use PowerShell or cmd, not WSL.

---

## 0. Say what you are about to do, then do it
Tell the user, in one or two lines: you will install the dependencies, wire the kit, ask for their
API keys, and start it. Then proceed without asking for permission for each step — the only thing
you ask for is the keys.

## 1. Check and install the dependencies
The kit needs **Node.js 20.12+**, **git**, **opencode**, and — because you are the agent reading
this — **Claude Code** itself, which the kit wires in as the main agent's deep-reasoning subagent.

```
node -v            # need v20.12 or higher
git --version
opencode --version
claude --version   # you are running this; the kit points the orchestrator at it
```

Install what is missing, using the platform's own method:
- **Node** — Windows/macOS: the installer at https://nodejs.org, then reopen the terminal.
  Debian/Ubuntu: `curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash - && sudo apt-get install -y nodejs`.
- **git** — Windows/macOS: https://git-scm.com/downloads. Debian/Ubuntu: `sudo apt-get install -y git`.
- **opencode** — `npm install -g opencode-ai` (works on all three), or the installer at
  https://opencode.ai/docs.
- **Claude Code** — `npm install -g @anthropic-ai/claude-code`, then run `claude` once to log in.
  This uses the owner's Claude **subscription** — there is no API key for it, and you should not ask
  for one.

On Windows these are plain commands; there is no `sudo`. If a step genuinely needs administrator
rights you cannot provide, tell the user the exact command and wait — do not guess a workaround.

Re-check all four and confirm the versions before continuing. **Do not proceed on an unverified
toolchain** — every later step assumes these.

> **Why Claude Code is a dependency, not just the installer:** the main agent runs opencode on a
> cheap model chain, and asks Claude for the hard parts — a bug whose cause is not obvious, a design
> decision, a careful review. That is wired through the kit's `claude-agy` MCP server
> (`mcp/claude-agy-mcp/`). Confirm it connects in step 6; if `claude` is not logged in, those tools
> report `found: false` and the main agent falls back to its local chain.

## 2. Install the kit
From the kit folder, in the platform's terminal:
```
node scripts/install.js
```
This clones the bundled tool servers, mirrors the skills into `.opencode/skills/`, and generates
`opencode.json` and `config/tcc.config.json` with the kit path substituted (forward slashes, so they
work on Windows too). Read its output and confirm it finished without error before moving on. It is
safe to re-run — it updates the clones and leaves existing keys alone.

## 3. Make `orchestrator` runnable from anywhere
So the user can start the agent by typing one word.
- **Windows:** add the kit's `bin` folder to the user `Path` variable, then reopen the terminal:
  `setx PATH "%PATH%;%KIT%\bin"` (or via Settings → Environment Variables). The launcher is
  `orchestrator.cmd`.
- **macOS/Linux:** add `bin` to PATH idempotently, e.g.
  `grep -q "$KIT/bin" ~/.bashrc || echo "export PATH=\"$KIT/bin:\$PATH\"" >> ~/.bashrc`
  (use the right rc file for the shell in `$SHELL`).

Verify it resolves: `where orchestrator` (Windows) or `command -v orchestrator` (macOS/Linux) must
print a path before you move on.

## 4. Ask for the API keys, then write them into the env file
This is the one place you stop and ask. Print this list (short, one line each) and let the user
answer in one go. They may skip any of the free ones; the kit falls back down the chain.

**Required:**
- **DeepSeek API key** — the main model. `https://platform.deepseek.com` → API keys. (Paid; a few
  dollars is plenty.)

**Free — collect all, they cost nothing:**
- **OrcaRouter** — `https://orcarouter.ai`, sign in with GitHub, no card. Key starts `sk-orca-`.
- **OpenRouter** — `https://openrouter.ai` → keys.
- **Dahl** — add if they have it.

**Required for the agent to reach you:**
- **Telegram** bot token + chat id. The agent runs unattended and is told to report and ask over
  Telegram, never by hanging the terminal waiting for you. Create the bot with **@BotFather**
  (`/newbot`), then message it once and read `chat.id` from
  `https://api.telegram.org/bot<token>/getUpdates`. See `skills/telegram/SKILL.md`.

**Only if they use these:**
- **Shopify** admin token + shop domain (custom app in their Shopify admin).
- **Etsy** keystring + OAuth token + shop id (once their shop is approved).
- **Meta** ads access token + ad account id.
- **Roblox Open Cloud** API key + universe id + place id (Creator Hub → Credentials; see
  `skills/roblox-open-cloud/SKILL.md` for the scopes each tool needs).

Write them into `config/keys.env` — **never echo a key back to the user, never print the file, and
never commit it.** Fill in the values in place; leave no placeholder behind.

```sh
chmod 600 "$KIT/config/keys.env"
```

**Verify** the file is complete and private:
```
node -e "const {loadEnvFile}=require('$KIT/lib/env.js');const e=loadEnvFile('$KIT/config/keys.env');for(const k of Object.keys(e))console.log(k, e[k]?'set':'EMPTY')"
```
On macOS/Linux also tighten permissions once: `chmod 600 "$KIT/config/keys.env"`.

Report which keys are set and which are empty. An empty required key means the main model will not
run — say so plainly.

## 5. Write what you learned into the agent's long-term memory
The agent's memory is `AGENTS.md` at the kit root. It is loaded every turn, so it must stay terse.
Add a short block under `## Shop` and `## Verified recipes` with anything you actually confirmed:

- The absolute `$KIT` path.
- Which keys are configured (name them, never the values).
- The OS / shell, and whether the orchestrator command is on PATH.
- Anything you had to fix to get here (the exact command and why), so it is never rediscovered.

Keep it to a few lines. Do not paste secrets or long logs. The agent updates this file itself from
then on.

## 6. Start it and prove it works
From the kit folder, run the launcher (`bin/orchestrator.cmd` on Windows, `./bin/orchestrator`
elsewhere, or `node bin/orchestrator.js` on any platform):
```
node bin/orchestrator.js
```
The launcher prints its model chain, the enabled servers and the memory/rules files, then opens
opencode. If it exits with an error, read the message — it names the missing piece (a missing key
file, an old Node, a missing server) and fix that specific thing.

Confirm the local servers answer before declaring success (these are the same on every platform):
```
cd "$KIT"
node -e "const {spawnSync}=require('child_process');const r=spawnSync(process.execPath,['mcp/shop-tools/server.js'],{input:'{\"jsonrpc\":\"2.0\",\"id\":1,\"method\":\"initialize\",\"params\":{}}\\n{\"jsonrpc\":\"2.0\",\"id\":2,\"method\":\"tools/list\"}\\n',encoding:'utf8'});console.log('shop-tools:', (r.stdout.match(/listing_validate/)?'ok':'FAILED'))"
node mcp/roblox-open-cloud/server.js --help 2>/dev/null; echo "roblox launcher exists: $([ -f mcp/roblox-open-cloud/server.js ] && echo yes || echo no)"
# the Claude subagent bridge: it must find a claude binary, or the deep-reasoning escalation is dead
node mcp/claude-agy-mcp/bin/claude-agy-mcp.js --self-test
```
That last one prints `{ "claude": ... }` — if it is `null`, Claude Code is not on a path the server
checks. Fix that (`CLAUDE_BIN` in `config/keys.env` can name the binary explicitly) or say plainly
that the escalation is unavailable. Do not report success with a null there.

## 7. Report, then stop
Give the user a short report:
- what you installed and verified,
- which keys are set and which are missing,
- the exact command to start it (`orchestrator`),
- the one thing they should try first.

Then stop. Do not start inventing work for them. They will say what they want next.

---

## Rules for this setup session
- **Verify, never assume.** Every step above says how to check it; do the check.
- **Never print a secret**, never write one into anything but `config/keys.env` (mode 600), and
  never commit it. `.gitignore` already excludes it — confirm before any `git add`.
- **Do not skip a failing step.** If Node is too old, the rest will fail confusingly; fix it first.
- **Ask once.** Collect the keys in a single request, not one message per key.
- **Leave the kit's files as they are.** You are installing, not redesigning. If something is
  genuinely broken, say so; do not "improve" it.
