---
name: meta-ads
description: Use when running paid ads — launching, capping spend, judging a creative, or pausing and scaling by ROAS. Covers the one-variable rule and the spend caps.
---

# Skill: running Meta ads without burning money

## Non-negotiable
- `config/limits.json` holds the spend cap. It is enforced **at the API call**. Do not reason your
  way past it; if a plan needs more, stop and ask the owner.
- Never launch a campaign, ad set or creative without a spend cap set on it.

## The loop
1. **One variable at a time.** A campaign tests one creative concept, one audience, one price
   point. Changing three things teaches nothing.
2. **Let it gather enough data before judging** — the observation window in `limits.json`.
   Pausing on day one on thin data is how money is wasted twice.
3. **Pause below `pause_roas_below`; scale above `scale_roas_above`.** Both values live in the
   limits file, not in your head.
4. **Report the number that matters** — spend, revenue, ROAS — not impressions.

## Creative
- The image is the ad. Lead with the product, not a logo.
- Match the winning Etsy listing's hero angle; it is already a proven image.
- Test one new concept at a time against the current best.

## Never
- Never edit a live ad set's budget by more than the configured step.
- Never run an ad for a listing with no stock or an unapproved shop.
- Never report an estimated figure as a measured one.
