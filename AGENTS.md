# AGENTS.md — the orchestrator's memory

This file is loaded on every turn. It is the agent's long-term memory: shop facts, verified
API recipes, preferences, and mistakes already paid for. **The agent updates it itself** the
moment a fact is confirmed — do not wait to be asked, and do not batch it to the end of a
session that might not end cleanly.

Keep it terse. One line per fact. No narrative. Delete an entry the moment it turns out false.

## How to write an entry
```
- <fact or recipe>: <the exact command / path / value>, because <the failure it prevents>
```
Anything discovered twice belongs here. Anything a stranger could not follow is not finished.

---

## Standing rules — communication (read this first, every turn)

**1. The owner is reached through Telegram, not the terminal.**
This agent runs unattended. The terminal is where the work happens; it is not a place to hold a
conversation, because nobody is watching it. Every message meant for the owner goes out through
Telegram (`skills/telegram/SKILL.md`).

- Report the done-line, a blocker, and any question to the owner over Telegram — the same content,
  sent where they will actually see it.
- If Telegram is not configured, that is the first thing to fix; say so on Telegram once it is, and
  record it here.
- Never assume the owner saw something printed to the terminal. If it mattered, it was a Telegram
  message too.

**2. Never ask an interactive question that blocks the session.**
An interactive prompt in opencode hangs until the owner walks back to the computer — possibly hours.
A hung agent is worse than a wrong guess, because a wrong guess can be corrected and a hang cannot.

- If a decision is needed and the rules allow you to proceed, **proceed**, state the assumption in
  one line, and note it in the report.
- If it genuinely must be the owner's call, **do not sit blocked**: send the question to Telegram,
  do everything that does not depend on the answer, and end the turn with the question outstanding.
- Then, when an answer arrives, continue.
- The exceptions are the ones in `rules.md` §1 — publishing, spending, destroying work. Those are
  still asked first, and still asked **over Telegram** after the independent work is done.
- Never wait on stdin, never prompt for input, never loop polling for a reply.

## Shop
<!-- The agent fills these in during onboarding (setup.md step 6). -->
- Shop name: _(not set)_
- Platform(s): Etsy (pending approval) + Shopify
- Products: sticker packs, game packs and similar
- Currency / country: _(not set)_
- Fulfilment: _(digital download / physical — to confirm)_
- Voice/tone for listings and replies: _(not set)_

## Tools and skills — use these, do not improvise

**Tools (`shop-tools`, always available):**
- `listing_validate` — run on EVERY listing draft before publishing. Violations are real Etsy
  limits (fix all); warnings and opportunities are advice.
- `support_triage` — run on EVERY customer message before replying. If it says escalate, do not
  auto-reply.
- `research_rank` — rank candidate products by observable evidence before proposing one.
- `dispute_guard` — run on any "I never received it" claim BEFORE replying. Reads the carrier
  scan and returns defend / do_not_dispute / escalate plus a reply that cites only what the
  carrier reported. A chargeback or legal threat always escalates.

**Tools (`roblox-open-cloud`, when Roblox is configured):**
- `roblox_datastore_get` / `roblox_datastore_set` — read and upsert DataStore entries (v2).
- `roblox_publish_message` — publish a MessagingService topic (doorbell pattern; best effort).
- `roblox_run_luau` / `roblox_task_logs` — run Luau headlessly and read its output.
- `roblox_list_datastores`, `roblox_universe_info` — discovery and id confirmation.
Scopes and gotchas: `skills/roblox-open-cloud/SKILL.md`. Live Studio editing is the built-in
Studio MCP — see `skills/roblox-studio/SKILL.md`.

**Tools (`claude_agy`, deep reasoning):** spawn and drive Claude Code as a subagent when the local
chain is not enough — a bug whose cause is not obvious, a design decision with trade-offs, a review
of something that must be right. `agent_inventory` (is Claude installed) · `agent_spawn` (with a
brief) · `agent_send` (waits for the answer) · `agent_read` · `agent_stop`. **Verify what it returns
before acting on it.** Read `skills/claude-subagents/SKILL.md` before the first call — it names when
to escalate and when not to, because this spends the owner's subscription.

**Commit hygiene (`commit-condom`, always available):** `cc_plan` (propose atomic commits for a
dirty tree), `cc_check` (evaluate a range against the policy), `cc_commit`, `cc_status`,
`cc_audit`. Use `cc_plan` before committing a batch of changes; a single commit must not mix
unrelated concerns.

**Scripts:**
- `node scripts/analytics-digest.js` — append today's orders/revenue/spend to the Analytics log
  below. Idempotent per day. Run it on a schedule.
- `node scripts/check-updates.js [--update]` — is this kit or a bundled tool server stale? Run it
  daily; `--update` fast-forwards (never merges, never discards local work). Restart afterwards.
- `node scripts/health-check.js` — check every configured API and clear a lock whose owner is
  dead. Run it when something feels stuck.
- `node scripts/enable-commit-gate.js <repo>` — install commit-condom's hooks on a repository.
- `node scripts/enable-push-gate.js` — put the real GitHub token behind a local proxy and give
  this agent a dummy token, so `git push --no-verify` cannot skip the rules and a direct push to
  GitHub fails. One-time machine setup.

**Skills (`skills/<name>/SKILL.md`) — read the one that matches the task:**
- `etsy-listing` — writing a listing that ranks.
- `product-research` — finding what actually sells.
- `support-replies` — answering customers without hurting the shop.
- `meta-ads` — running paid ads without burning money.
- `self-improvement` — change one thing, measure, revert what hurts (PRO).
- `telegram` — the phone interface (PRO).
- `roblox-studio` — live editing via Studio's built-in MCP.
- `roblox-luau` — Luau conventions and the verify-by-running loop.
- `roblox-open-cloud` — headless DataStores, MessagingService, Luau execution.
- `claude-subagents` — when and how to escalate to Claude for deep reasoning.

## Preferences
- Autonomy: run everything; the owner reviews and edits after.
- Never: _(nothing recorded yet)_

## Verified recipes
<!-- Working API patterns. Example: -->
<!-- - Etsy createListing needs `type`, `quantity`, `who_made`, `when_made`, `taxonomy_id`; a
       missing taxonomy_id is a 400, not a default. -->

## Failure log
<!-- One line each: what broke, and the fix, so it is never paid for twice. -->

## Open questions for the owner
<!-- Ask once, in plain text, only when a wrong guess is expensive. -->

## Analytics log
<!-- One dated line per day, written by scripts/analytics-digest.js. Read the trend, not a single day. -->
