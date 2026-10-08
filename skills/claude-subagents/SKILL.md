---
name: claude-subagents
description: Use when a task needs deeper reasoning than the local model can give — a bug whose cause is not obvious, a design decision with real trade-offs, a careful review, or a second opinion on something that must not be wrong. Spawns and drives Claude Code sessions as subagents using the owner's own Claude subscription.
---

# Calling Claude as a subagent

The main agent here is opencode on a cheap local chain. That is the right default: most work is
research, drafting, listing and support, and paying frontier prices for it is waste. But some
problems are worth a stronger model, and the owner already pays for one. This is how you use it.

**The rule: escalate the thinking, not the typing.** Send Claude the hard part and bring the answer
back. Do not hand it the whole job.

## When to reach for this
- A bug you have reproduced but cannot explain — you have the symptom, you need the cause.
- A design decision with trade-offs you genuinely cannot resolve from the code and the docs.
- A review of something that must be correct: a migration, a payment path, a data-loss risk.
- A piece of reasoning you have already tried twice and got wrong.

**When not to:** routine file edits, listing copy, research, anything you can verify yourself in one
command, anything the free subagents already handle. Every call spends the owner's subscription quota,
so a call that did not need a frontier model is a cost with no benefit.

## The shape of a good delegation
A weak brief wastes the strong model. Give it:
1. **The exact question** — not "look at this", but "why does `parse()` return null for a key that
   contains a slash?".
2. **The file and line** — `src/policy.js:61`. A frontier model with no target will read the whole
   repo and answer less precisely than one with a pointer.
3. **What you already tried and what happened** — so it does not repeat your dead ends.
4. **The output you want** — a diagnosis, a patch, a yes/no with reasoning. Name the shape.
5. **The constraint** — "do not change the public API", "this runs on Windows too".

## How to drive it
Use the `claude_agy` batch (`see_tools_claude_agy` to see the tools). The core flow:

1. `agent_inventory` — confirm Claude is installed and which binary will be driven.
2. `agent_spawn` with the brief — background mode for Claude Code, which returns a real session id.
3. `agent_send` — sends and, by default, **waits for the answer**. Read it.
4. `agent_read` / `agent_wait_idle` — pull recent output if you need it in pieces.
5. `agent_stop` when done. Do not leave sessions running; they hold quota and memory.

Several independent hard questions can go at once with `agent_spawn_many`, but keep it to what you
actually need — a fan-out of five sessions to answer one question is noise.

## Verify what comes back
A subagent's answer is a claim, not a result. **Test it before you act on it.** If Claude proposes a
patch, apply it and run the check that should now pass. If it names a cause, change that one thing and
watch whether the symptom actually goes away. A confident wrong answer from a strong model is more
expensive than a hedge from a weak one, because it is harder to doubt.

## If Claude is not installed
The tools report `found: false` rather than failing silently. Claude Code needs to be installed and
logged in with the owner's subscription (`claude` → log in). No API key is involved — the subscription
is the credential. If it is missing, say so and fall back to the local chain; do not pretend the
escalation happened.
