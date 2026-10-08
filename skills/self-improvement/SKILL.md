---
name: self-improvement
description: Use for the PRO improvement loop — acting on the daily analytics digest, changing one thing, measuring it, and automatically reverting anything that hurts. Also use before any change to a live ad, listing or price.
---

# The improvement loop

This is the PRO difference: the agent does not just report, it changes one thing, watches the
number, and **puts it back if the number got worse**. Nothing here is decided by feel.

## The loop
1. **Read the trend, not the day.** `AGENTS.md` → `## Analytics log`, written daily by
   `scripts/analytics-digest.js`. One bad day is noise; a week of drift is a signal.
2. **Name the single variable.** One listing's title, one ad's creative, one price. If you cannot
   name the variable in one line, the change is too big to learn from.
3. **Record the baseline before touching anything.** The number you expect to move, its current
   value, and the window you will judge it over (from `config/limits.json`).
4. **Change exactly that.** Take a copy of what you replaced — every change must be revertible.
5. **Wait the window.** Do not judge on day one. Pausing early on thin data wastes the change.
6. **Decide by the number:**
   - Improved beyond the noise band → keep it, log the win.
   - Flat → revert it. A change with no measurable effect is cost with no benefit.
   - Worse → revert it **immediately** and record what you learned.
7. **Write it down.** One line into `AGENTS.md`: the variable, the baseline, the outcome. Next time
   the same idea comes up, the answer is already there.

## Hard rules
- **Never leave a losing change in place because reverting is work.** The revert is the mechanism;
  skipping it turns self-improvement into self-harm.
- **One variable at a time.** Change three things and you have learned nothing about which mattered.
- **Never change a price or a live ad outside `config/limits.json`.** If a plan needs more than the
  cap, stop and ask the owner.
- **A metric that did not move is a revert**, not a "no harm, keep it". Surface area is cost.
- If a change cannot be measured with the data you actually have, do not make it — say why instead.

## What to improve, in order
1. Whatever the digest shows is trending down.
2. The weakest of the tracked numbers (views → clicks → sales).
3. Ad creative that is below the `pause_roas_below` line.
4. Nothing, if nothing is clearly wrong. Restraint is a valid outcome — churn without evidence is
   how a good shop gets worse.
