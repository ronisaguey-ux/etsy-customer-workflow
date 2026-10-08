---
name: telegram
description: Use for the PRO phone interface — setting up the owner's Telegram bot, sending and receiving messages, and deciding what is worth pushing to a phone. Covers bot creation, the token, and the discipline that keeps notifications useful instead of noise.
---

# The phone interface (Telegram)

This is what makes the kit something the owner can run from their pocket instead of a terminal.
The agent gets a bot; the owner messages it; the agent replies.

**This is the standing channel to the owner — see `AGENTS.md` → "Standing rules — communication".**
The agent runs unattended, so the terminal is not a place to hold a conversation. Reports, blockers
and questions go out over Telegram. And nothing here is ever a blocking prompt: a task that needs an
answer sends the question and keeps working on everything else, rather than hanging the session.

## Setup
1. In Telegram, message **@BotFather** → `/newbot` → follow the prompts.
2. BotFather returns a token like `123456789:AA...`. Put it in `config/keys.env`:
   ```sh
   TELEGRAM_BOT_TOKEN=...
   TELEGRAM_CHAT_ID=...     # the owner's chat, so the agent can push without being asked first
   ```
3. To find the chat id: message the bot once, then call
   `https://api.telegram.org/bot<token>/getUpdates` and read `result[0].message.chat.id`.
4. **Verify:** `https://api.telegram.org/bot<token>/getMe` must return `"ok": true`. If it does not,
   the token is wrong — do not proceed on an unverified token.

## Sending
```
POST https://api.telegram.org/bot<token>/sendMessage
  { chat_id, text, parse_mode: "Markdown" }
```
The API returns `{ ok: true }` on success. **Check `ok`, not just the HTTP status** — Telegram
returns HTTP 200 with `ok: false` for a rejected message (bad chat id, too long, malformed), and
treating that as delivered is the same class of bug as a push reported without checking the hook.

Messages over **4096 characters are split**, and pieces can arrive out of order. Keep a push under
~3000 characters; if you need more, send a summary and offer the detail.

## What is worth a push
Push to the phone only when the owner would want to know **now**:
- A difficulty the agent cannot resolve (a blocked job, an auth failure that stops work).
- A decision only they can make (a refund above the cap, a price change beyond the ceiling).
- A finished long job they asked for.
- A number that crossed a line they set.

Do **not** push: routine completions, every step, "still working", or anything already visible in
`AGENTS.md`. A phone that buzzes for everything gets muted, and then a real alert is missed. The
test: *would the owner act on this differently if they saw it in an hour?* If no, it is not a push.

## Receiving
Poll `getUpdates` (with an `offset` so you do not reprocess old messages), or run a small webhook.
Handle the owner's reply as a normal instruction — but the same rules apply: terse reports, act
rather than ask when the standing rules allow, and escalate the things that always escalate
(refunds, legal, platform notices).
