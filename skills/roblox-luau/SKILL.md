---
name: roblox-luau
description: Use when writing or reviewing Luau for a Roblox game — gameplay systems, services, remotes, DataStores, or performance work. Covers the conventions that keep a game reviewable and the loop that proves a change works instead of assuming it does.
---

# Roblox / Luau development

## The loop, every change
1. **Read the code that exists.** Use `script_read` / `script_search` / `script_grep` (Studio MCP)
   before editing. Match the file's existing style, naming and module layout.
2. **Make the smallest change** that does the job — `multi_edit` for a batch, one edit for one fix.
3. **Verify by running it.** `execute_luau` at edit time for a pure function; `start_stop_play` +
   `get_console_output` for anything that touches the runtime. Read the output. A write that did
   not error is not a change that works.
4. **Read the script back** after a batch edit to confirm what landed.

## Structure that survives
- **Server owns state; the client owns presentation.** Never trust a number the client sent —
  validate it on the server. A remote is an untrusted input.
- **One module, one concern.** A ModuleScript that both holds data and drives UI will be split
  later under pressure; split it now.
- **Remotes:** one `RemoteEvent`/`RemoteFunction` per action, named for the action. Validate the
  argument types and ranges at the handler before using them.
- **DataStores:** wrap every call and handle failure — `pcall`, retry with backoff, and a session
  lock if two servers could write the same key. A save that silently fails loses a player's progress.
  Budget: v2 Open Cloud calls share the experience's DataStore budget, so do not poll in a loop.
- **`task.wait`, not `wait`; `task.spawn`, not `spawn`.** The old globals are deprecated and less
  predictable.

## Luau specifics worth knowing
- Type annotations are real: `local function f(x: number): string`. Add them on module boundaries;
  they catch the bug before a playtest does.
- `table.freeze` on config/data tables makes accidental mutation an error instead of a mystery.
- Prefer `for _, v in ipairs(t)` / `pairs` as appropriate; `#t` on a table with holes is undefined.
- Strings: `..` concatenates; for many joins use `table.concat`.
- Errors: `error({ code = "X", message = "..." })` at a boundary, caught with `pcall` and turned
  into a clean client message. Never surface a raw stack trace to a player.

## Performance
- Do not `wait()` in a loop to poll. Use events, and debounce.
- `RunService.Heartbeat` work must be cheap; anything per-frame allocates per-frame.
- Profile before optimising: the community Studio MCP (`capture_script_profiler`,
  `get_memory_breakdown`) or Studio's own MicroProfiler. A guess about the bottleneck is usually
  wrong.

## Before you call it done
- [ ] The change is the smallest that works, and matches the file's existing style.
- [ ] It was **run**, and the output read — not just written.
- [ ] Every remote validates its input; every DataStore call handles failure.
- [ ] No deprecated globals added.
