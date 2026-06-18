# feat: MP1 — Target Site (broken-on-purpose game + failure modes)

**Date:** 2026-06-18
**Type:** feat
**Depth:** Standard
**Origin:** `docs/brainstorms/2026-06-18-steel-reliability-arcade-requirements.md`
**Index:** `docs/plans/2026-06-18-002-feat-arcade-miniprojects-index-plan.md`
**R-IDs:** R2, R5, R11, R12 · **Depends on:** none
**Live target:** **Math Arcade Wrecker** — already deployed at `matharcardewrecker.netlify.app` (our own site).

---

## Summary

The target game already exists and is deployed: **Math Arcade Wrecker** (`matharcardewrecker.netlify.app`),
our own site. MP1 is therefore **instrument-an-existing-site**, not greenfield: add the five staged,
*plausible-looking* failure modes (a–e) plus the gauntlet routes (provider widgets on test keys + vision
image-grid + simulated bot wall) onto the live game so the Steel agent has something real to fail at,
diagnose, and recover from. Ethics line: every CAPTCHA/login/wall here is **ours** — no third-party site is
automated.

**Adjust before building:** confirm where the deployed game's source lives (this repo's `public/`, or a
separate repo for `matharcardewrecker.netlify.app`). If separate, MP1's file paths below target that repo
(state it at top per planning rules) — the failure-mode knobs and routes get added there, and the Steel
demo app points at that URL. The `public/arcade/` tree below is the layout *if* the game source is brought
into this repo; if not, mirror these units onto the existing site's structure.

---

## Problem Frame

The demo's whole reliability arc needs failures that look like real-world flake, not obvious planted
`throw` statements. The target site must stage each failure mode so it reads as a genuine bug to a watching
CEO, while staying fully under our control (so recovery is honest and ethical).

---

## Requirements

- **R2** — Site reachable + drivable with no terminal; already live at `matharcardewrecker.netlify.app`.
- **R5** — Multi-route gauntlet host: mounts reCAPTCHA v2 + Turnstile (test keys) + our vision image-grid.
- **R11** — Ethics: own-site only; provider widgets use official always-pass TEST keys.
- **R12** — Hosts failure modes (d) bot wall and (e) mobile-only layout bug.

## Staged failure modes

- **(a) flaky / slow element** — a control that appears after a randomized delay.
- **(b) changed/unexpected selector** — element id/class differs from the "obvious" one.
- **(c) own CAPTCHA route** — provider widget on our page (test keys).
- **(d) bot wall** — a fake "Access Denied / automation detected" page gated on a fingerprint/header signal
  Steel changes under `stealthConfig`, so a stealthed relaunch *legitimately* passes (origin gotcha #2 —
  frame as **simulated** bot wall).
- **(e) mobile-only layout bug** — a responsive selector that genuinely differs mobile vs desktop (origin
  gotcha #3 — must be a plausible responsive break, not `if(mobile) throw`).

---

## Output Structure

```
public/
  arcade/
    index.html         # game shell + level routing
    levels/
      flaky.html       # mode (a)
      selector.html    # mode (b)
      captcha.html     # mode (c) — recaptcha v2 + turnstile test keys
      vision-grid.html # vision climax target (tiles w/ stable DOM ids)
      bot-wall.html    # mode (d) — gated access-denied page
    arcade.css         # responsive; intentional mobile-only break for (e)
    arcade.js          # game logic, delay/selector knobs, fingerprint gate
```

---

## Implementation Units

### U1. Game shell + level routing
- **Goal:** A self-contained arcade site with a "win" condition the agent can pursue.
- **Requirements:** R2, R5
- **Files:** `public/arcade/index.html`, `public/arcade/arcade.css`, `public/arcade/arcade.js`
- **Approach:** Single-page shell routing to level pages by hash/path. Define explicit "winning" =
  reaching a success element with a stable id (e.g. `#level-complete`). No backend.
- **Patterns to follow:** existing static-asset shape under `public/`.
- **Test scenarios:**
  - Happy path: loading `index.html` renders shell + a startable game; reaching the goal exposes
    `#level-complete`.
  - Edge: deep-link directly to a level page renders standalone (agent may navigate straight in).
  - `Test expectation: DOM-level smoke only (static site, no backend logic).`
- **Verification:** opening the site in a browser shows the game; success element appears on win.

### U2. Failure modes (a) flaky + (b) selector drift
- **Goal:** Two in-page recoverable failures with tunable knobs.
- **Requirements:** R12 (arc support)
- **Dependencies:** U1
- **Files:** `public/arcade/levels/flaky.html`, `public/arcade/levels/selector.html`, `public/arcade/arcade.js`
- **Approach:** (a) gate a control behind a randomized `setTimeout` (e.g. 0.5–4s). (b) render the action
  control under a non-obvious id, with a discoverable-but-different selector. Both controlled by query-param
  knobs so the agent loop / fleet can force a specific mode.
- **Test scenarios:**
  - Happy: with delay knob low, control appears and is clickable.
  - Edge: delay knob high → control absent until timeout fires (drives agent retry).
  - Edge: selector page → "obvious" selector misses, real selector resolves.
- **Verification:** query params reproducibly trigger each failure.

### U3. Mode (c) CAPTCHA route — provider widgets, test keys
- **Goal:** A page mounting reCAPTCHA v2 + Turnstile using official always-pass TEST keys.
- **Requirements:** R5, R11
- **Dependencies:** U1
- **Files:** `public/arcade/levels/captcha.html`
- **Approach:** Embed both widgets with their documented test sitekeys (always-pass). Form gates "win" on
  widget token present. No real third-party verification.
- **Test scenarios:**
  - Happy: test-key widget yields a token; submit reveals success.
  - Error: submit with no token blocked.
  - `Covers AE: a CAPTCHA route the agent walks via solveCaptcha (MP5).`
- **Verification:** both widgets render and accept the always-pass flow.

### U4. Mode (d) simulated bot wall (stealth-gated)
- **Goal:** An "Access Denied" page that lets a stealthed session through.
- **Requirements:** R12
- **Dependencies:** U1
- **Files:** `public/arcade/levels/bot-wall.html`, `public/arcade/arcade.js`
- **Approach:** Gate content on a fingerprint/header signal that Steel's `stealthConfig` changes (e.g.
  `navigator.webdriver`, a UA/header marker). Non-stealth → show denied page; stealthed → show content.
  Label visibly as a **simulated** wall (honest framing, gotcha #2).
- **Execution note:** verify the chosen gate signal actually flips under Steel `stealthConfig` before
  committing the recover beat (cross-check with MP7).
- **Test scenarios:**
  - Happy: request with the stealth signal present → content renders.
  - Error: request without it → access-denied page renders with the "simulated" label.
  - Edge: gate signal must be one Steel demonstrably changes (else MP7 recover is a no-op — see gotcha #2).
- **Verification:** toggling the signal flips denied ↔ content; "simulated" label visible.

### U5. Mode (e) mobile-only layout break
- **Goal:** A responsive bug that breaks the agent's selector path only at mobile dimensions.
- **Requirements:** R12
- **Dependencies:** U1
- **Files:** `public/arcade/arcade.css`, `public/arcade/levels/selector.html`
- **Approach:** At a mobile breakpoint, the action control reflows under a different DOM container / becomes
  off-screen / changes selector — a *plausible* responsive defect, not an explicit throw (gotcha #3).
- **Test scenarios:**
  - Happy (desktop viewport): control reachable.
  - Failure (mobile `dimensions`): control unreachable via the desktop selector path.
  - Edge: break is responsive-realistic (reviewable as a real bug).
- **Verification:** resizing across the breakpoint reproducibly breaks/fixes the path.

### U6. Vision-grid target page
- **Goal:** The image-grid the Gemini-vision climax (MP5) solves per tile.
- **Requirements:** R5
- **Dependencies:** U1
- **Files:** `public/arcade/levels/vision-grid.html`
- **Approach:** A fixed NxN grid of category tiles (bikes/trains/traffic-lights/dogs) each with a **stable
  DOM id** and a known on-screen position. Pin layout so `computer({action})` coords map deterministically
  (gotcha #7 mitigation lives in MP5, but the page must keep tiles position-stable).
- **Test scenarios:**
  - Happy: selecting the correct tile set reveals success.
  - Edge: tiles keep stable ids + positions across loads (no shuffle that defeats coord mapping).
  - Error: wrong tile selection blocks success.
- **Verification:** grid renders with stable ids; correct-set selection wins.

---

## Open Questions

- Concrete "game" identity (what winning looks like beyond reaching `#level-complete`) — owned here,
  resolve at impl; keep it watchable in ~2 min.

## Scope Boundaries

**In:** static arcade site + 5 staged failure modes + vision-grid target.
**Out:** any real third-party CAPTCHA/site; backend game state.
