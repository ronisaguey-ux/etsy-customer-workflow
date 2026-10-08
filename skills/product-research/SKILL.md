---
name: product-research
description: Use when finding what actually sells before creating anything — ranking niches by observable evidence such as sales velocity inside the first year. Covers what Etsy's API does and does not expose.
---

# Skill: finding what actually sells

The goal is not "a product idea". It is **evidence** that a specific kind of item sells, so the
shop can copy the pattern instead of guessing.

## The signal to look for
- **>1,000 sales in under 12 months** on the listing, if the source shows a date range.
- Steady reviews (recent ones matter more than the total).
- Many sellers winning in the same narrow niche — that is a market, not luck.
- Formats that repeat: same joke, same character style, same bundle size across sellers.

## Where the data comes from
Etsy's own API **does not expose sales counts or keyword volume** — no endpoint exists. So:
- **Research tools** (EverBee, Sale Samurai, eRank) estimate sales and revenue. Use them to
  **rank niches against each other**.
- **Etsy search + sold counts** on the listing page are the ground truth you can see yourself.
- Their estimates are roughly 80% accurate and self-reported. **Never quote one as fact**; say
  "estimated" and give the rank, not the number.

## Step 0 — rank with the tool, not with a feeling
Once you have candidate niches with their observed figures, call `research_rank` with
`[{name, sales, age_months, reviews, price, competing_sellers}]`. It scores sales velocity
inside a short life, review depth, price band and crowding, and returns a ranked list plus the
reminder that the inputs are estimates. Use the **rank**, never the raw number, in the report.

## Procedure
1. Pick 3–5 candidate niches in the shop's category.
2. For each, collect the top listings: title pattern, price, format, review velocity.
3. Score: is there a repeated pattern? Is there room (not one giant seller)? Does the shop's
   existing style fit?
4. Return a short ranked list: niche · evidence (listing or tool) · price band · suggested
   format · why it fits this shop.
5. Write the winner into `AGENTS.md` so the finding is not lost.

## Then, and only then, create the listing.
Use `skills/etsy-listing/SKILL.md`. Do not invent a design trend with no evidence behind it.
