---
name: web-as-api
description: Call a website as JSON instead of driving a browser — for product and competitor research, market data, or any repeated web lookup with no official API. Use when the task is "get X from site Y" and the site is one of the shipped operations (Amazon, YouTube, Airbnb, Google Flights, Goodreads, Hacker News, Instagram/X, LinkedIn) or one you teach. Not for a one-off page read — use fetch/markdown for that.
---

# Websites as callable APIs

`api-anything` turns a website into callable JSON. You show it a page once, it records the request
that page made, and afterwards you call it as plain HTTP. No browser, no HTML parsing, and a fraction
of the tokens a browser round-trip costs.

## Use it when

- The same lookup repeats — many products, many pages, a daily check.
- The data is behind a normal website with no official API (competitor listings, prices, reviews).
- A browser would work but is slow and expensive per call.

Do **not** use it for a single page you just need to read — use the web fetch tool for that.

## The four tools

- `list_sites` — every site, and whether each needs a login.
- `list_operations` — the operations for one site, with their parameter names.
- `call_operation` — run one. Pass only the parameters `list_operations` named; a wrong name is an
  error, not a guess.
- `login` — import the cookies from the owner's everyday browser so calls run as a signed-in user.

## The rule that saves time

**A `blocked` or CSRF result is not a failed tool — it is the site asking for a session.** Do not retry
the same call and do not fall back to a browser first. Run `login <site>`, then call again. A logged-in
session is what makes Etsy, competitor shops, and most marketplaces work.

## Worked example

```
list_operations  { site: "amazon" }        → search takes k
call_operation   { site: "amazon", operation: "search", params: { k: "walnut nameplate" } }
                                            → [{ asin, title, price }, ...]
```

## Boundaries

- Teaching a NEW site needs Chrome and a human-ish pace; only the shipped operations are callable
  headlessly out of the box.
- Keep call volume human. A site will serve a challenge at volume; back off rather than hammer it.
- It replays a site's own internal requests, outside its interface. That is the same category as any
  scraper — use it on sites the owner is entitled to read, and prefer official APIs when one exists.
