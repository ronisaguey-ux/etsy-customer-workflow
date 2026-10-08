---
name: etsy-listing
description: Use when writing, checking or improving an Etsy listing — titles, tags, description, attributes, or images. Covers Etsy's published limits and the validator that enforces them.
---

# Skill: writing an Etsy listing that ranks

Etsy's title/tag advice is widely repeated wrong. Two things worth stating up front because
they are seller myths, not Etsy rules: a title does **not** have to be under 15 words, and your
tags do **not** have to repeat your title. This skill uses Etsy's published limits plus our own
advice, clearly separated.

## Step 0 — always run the checker
Call the `listing_validate` tool with the draft `{title, tags, description, attributes}`.
It returns:
- **violations** — real Etsy limits. Fix every one; publishing is blocked until you do.
- **warnings** — our quality advice (fluff words, plural tags, generic tags).
- **opportunities** — where a point is being left on the table.
Never publish a draft that has a violation.

## Title
**Hard Etsy limits** (the validator enforces these):
- 140 characters maximum; must begin with a letter or number.
- `%` `:` `&` — each may appear at most once. `$` `^` `` ` `` `°` are not allowed at all.
- No more than three fully-capitalised words.

**How to win the click** (Etsy guidance + ours):
- State what the item **is**, once, then its decisive traits (material, colour, size).
- Front-load the phrase a buyer would actually search — only the first ~60 characters are
  visible in search, and early words carry more weight.
- No pipe/comma keyword chains and no subjective fluff ("beautiful", "unique"); fluff buys no
  search match and reads as spam.
- Gift/occasion/recipient wording belongs in tags, not the title.

## Tags — use all 13, every time
- 13 tags maximum, 20 characters each, unique. Allowed characters: letters, numbers, hyphens,
  apostrophes, spaces, underscores.
- **Tags are matched as their own field.** A tag works even if it never appears in your title —
  do not burn slots echoing the title. Use tags for the queries the title cannot hold: synonyms,
  occasions, recipients, materials, style, regional spellings.
- **Long-tail beats generic.** "walnut desk sign" wins; "sign" competes with everything.
- Don't waste slots on plurals (Etsy matches root words) or on your own brand name.
- Slot plan: 3 core descriptive · 3 occasion/audience · 3 style · 2 material/technique ·
  2 seasonal/rotating.
- **Relevancy bonus:** a phrase that appears in *both* the title and a tag ranks above one in
  either alone. Echo your single best phrase in both — not all thirteen.

## Description
- Etsy requires a non-empty description (up to ~102k characters). Say what is included, the
  format/size, and how it is delivered — in sentences, not a keyword list.
- Put the phrases people search inside natural sentences.

## Images
- The hero image is the single largest lever after price. One clear product shot, filled frame,
  no clutter, no text smaller than readable at thumbnail size.
- Listings with video convert meaningfully better — add one if the format allows.

## Attributes
- Fill every attribute Etsy offers. They feed search filters and act like extra tags.
- `taxonomy_id` is required by the API; a missing one is a 400, not a default.

## Before publishing, check
- [ ] `listing_validate` returns **zero violations**
- [ ] Warnings reviewed and addressed where they make sense
- [ ] Hero image reads at thumbnail size; video added if possible
- [ ] All attributes filled, taxonomy_id set
- [ ] Price sanity-checked against the price band for that niche
