# The remote MCP servers to connect (per platform)

These are not vendored — they install from their own repos. Add each to
`config/tcc.config.json` following `mcp/README.md`, then restart.

| Platform | Server | Repo | Notes |
|---|---|---|---|
| Etsy | Etsy Open API v3 | `aserper/etsy-mcp` · `georgejeffers/etsy-mcp-server` | OAuth2 PKCE. Scopes needed: `listings_r`/`listings_w`/`shops_r`/`transactions_r`. Register the app as **personal** — a commercial app triggers a review queue. Access tokens last 1h; the refresh token does not. |
| Shopify | Shopify Admin API | `GeLi2001/shopify-mcp` | Works **now** — does not wait on Etsy approval. Create a custom app in the Shopify admin and use its Admin API token. |
| Email (support) | IMAP/SMTP | `Wh1isper/mcp-email-server` (★349) | Drafting + sending replies, and reading the inbox. Use a **dedicated support address**, not the owner's personal mail. |
| Meta Ads | Meta Marketing API | `pipeboard-co/meta-ads-mcp` (★1294) | `ads_read` first; `ads_management` only once the business is verified. |
| Telegram | Bot API | local bridge in this kit | Lets the owner message the agent from a phone. |
| Research | EverBee / Sale Samurai | their MCP endpoints | The only route to sales estimates — **Etsy's API exposes no sales data at all**. Estimates are ~80% accurate; rank with them, never quote one as fact. |

## Scope discipline
Request the minimum scope that does the job. Every extra scope slows approval and widens what a
mistake can reach. Write the granted scopes into `AGENTS.md` so they are never re-derived.
