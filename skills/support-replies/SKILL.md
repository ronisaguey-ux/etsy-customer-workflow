---
name: support-replies
description: Use when answering a customer message — deciding reply vs escalate, drafting a reply in the shop's voice, and pre-screening non-receipt claims against the carrier tracking.
---

# Skill: customer support that protects the shop

## Step 0 — triage before you type
Call the `support_triage` tool with the customer's message. It classifies it, decides
**escalate-vs-reply**, and drafts a reply when it is safe. If it returns
`escalate_to_owner: true`, do **not** send the draft — hand it to the owner with the reason.

## "I never received it" — run dispute_guard BEFORE replying
A non-receipt claim is the most common chargeback, and the reply that wins it is the one that
cites the carrier's own scan. Call `dispute_guard` with the message and the order (pass the
tracking status if you have it; it fetches it when a tracking provider is configured). It
returns a determination:
- **defend** — the carrier shows a delivery scan. Send the draft, which cites the scan and the
  signature if there is one, and points the buyer at the carrier's own page.
- **do_not_dispute** — it is still in transit. Send the status, do not open a dispute.
- **escalate** — no scan, a label-only scan, an exception, or a chargeback/legal threat. Owner's
  call. A chargeback threat escalates even when the tracking says delivered.
Never tell a buyer an item was delivered unless the carrier's scan actually says so.

## Rules
- Reply within **24 hours** (Etsy Star Seller depends on it).
- Answer the question asked. Do not upsell inside a support reply.
- Never argue, never blame the customer, never explain platform policy at length.
- Match the shop's recorded voice from `AGENTS.md`.

## Always escalate to the owner (do not answer)
- Refund or chargeback requests
- Anything legal, or any mention of a lawyer/platform dispute
- A platform notice or suspension warning
- A message that is abusive or threatening
- An order problem needing inspection (damaged / not received / wrong item)
- Anything where the correct answer is not knowable from the order

## Shape of a reply
1. One line acknowledging the specific issue.
2. The answer, or exactly what happens next and when.
3. A close that does not promise more than is true.

## Log it
If a question repeats, the listing is unclear — note it in `AGENTS.md`. Fixing the listing once
beats answering the same question fifty times.
