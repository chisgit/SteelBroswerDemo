# feat: MP5 — CAPTCHA Gauntlet (solveCaptcha routes + vision-grid climax)

**Date:** 2026-06-18
**Type:** feat
**Depth:** Standard
**Origin:** `docs/brainstorms/2026-06-18-steel-reliability-arcade-requirements.md`
**Index:** `docs/plans/2026-06-18-002-feat-arcade-miniprojects-index-plan.md`
**R-IDs:** R5, R6, R13 · **Depends on:** MP1, MP3

---

## Summary

The centerpiece. Two tiers: **table-stakes routes** where Steel's `solveCaptcha` walks the agent through
reCAPTCHA v2 + Turnstile (own-site, official always-pass test keys), and the **climax** — our own vision
image-grid solved per-tile by a **Gemini-vision agent** classifying tiles and clicking the matching ones via
`sessions.computer({action})`. This is the "my agent can see and act" flex Steel does NOT auto-do. Each
route shows an on-screen title banner naming the Steel feature in play (R13).

---

## Problem Frame

`solveCaptcha` alone reads as "found the docs." The honest differentiator is agent vision: classifying grid
tiles and acting on coordinates. That climax is also the most fragile beat (coordinate drift, gotcha #7), so
it needs a deterministic fallback so the finale never hard-fails on stage.

---

## Requirements

- **R5** — Multi-route gauntlet (reCAPTCHA v2 + Turnstile + own vision grid).
- **R6** — `solveCaptcha: true` handles token/checkbox routes; the **vision grid is solved by our agent**.
- **R13** — Each flow shows a title banner naming the exact Steel feature in play.

---

> **State:** vision grid is **already built** in `netlify/functions/agent-step.js` (`visionGridStep`) +
> `lib/gemini.mjs` (`classifyTiles`). It clicks tiles **by DOM id** (`#tile-N`). This MP is now a
> harden/verify reference, not a build order.

## Key Technical Decisions

- **KTD1 — Table-stakes routes use Steel `solveCaptcha` on always-pass TEST keys only** (gotcha #5). Never a
  real third-party widget — TOS + flake. *(Built: `tokenRoute` in `agent-step.js`.)*
- **KTD2 — Vision grid solved by our agent, clicked by stable DOM id — NOT coordinates** (master 001 KTD4).
  Per-tile: screenshot each tile → Gemini-vision classify vs the category → click matching tiles by
  `#tile-N` selector. *(Built: `agent-step.js:117–155`.)* `sessions.computer({action})` coordinate clicking
  is **explicitly Deferred** (001 Deferred to Follow-Up) — DOM-id clicks avoid coordinate drift and give
  clean per-tile evidence. **Correction:** an earlier draft of this doc made coords the primary path; that
  was wrong and contradicted the decided design + shipped code.
- **KTD3 — Coordinate drift is avoided, not mitigated** (supersedes the old coord-mapping plan). Because
  clicks are by DOM id, gotcha #7's coordinate-drift risk does not apply to the built path. The grid page
  (MP1 U6) keeps stable tile ids; that is the whole mitigation. If a future showcase wants visible
  `computer({action})` coords, that is deferred work with its own viewport-pinning plan.

---

## Implementation Units

### U1. solveCaptcha table-stakes routes
- **Model tier:** 🟢 Less-capable — built (`tokenRoute`); navigate + poll `#solved`. **✅ FIXED (2026-06-18)**.
- **Goal:** Agent walks reCAPTCHA v2 + Turnstile routes via Steel `solveCaptcha`.
- **Requirements:** R5, R6
- **Dependencies:** MP1 U3 (captcha page), MP3 (agent loop)
- **Files:** `netlify/functions/lib/captcha-routes.js`, `netlify/functions/lib/captcha-routes.test.js`
- **Approach:** Create/connect a session with `solveCaptcha: true`; agent navigates the captcha level, lets
  Steel resolve the widget token, submits, reaches success.
- **Test scenarios:**
  - Happy: test-key reCAPTCHA route → token resolved → success.
  - Happy: Turnstile route → success.
  - Error: `solveCaptcha` no-op/flake → route reports failure cleanly (feeds diagnose, not a crash).
  - `Covers AE: agent walks a CAPTCHA route via solveCaptcha.`
- **Verification:** both test-key routes pass via the agent + Steel.
- **Session fix:** Hobby tier doesn't support `solveCaptcha: true`. Changed default to `solveCaptcha: Boolean(body.solveCaptcha)` so caller can opt-in. Session creation now succeeds on free tier.

### U2. Vision-grid classify + act (climax)
- **Model tier:** 🟡 Capable — built (`visionGridStep` + `classifyTiles`); hardening is per-tile vision prompt + re-classify reliability. Design decided (DOM-id clicks).
- **Goal:** Gemini-vision solves the image grid per tile and clicks matching tiles.
- **Requirements:** R6
- **Dependencies:** MP1 U6 (grid page), MP3 (loop), U1
- **Files:** `netlify/functions/lib/vision-grid.js`, `netlify/functions/lib/vision-grid.test.js`
- **Approach:** Screenshot each tile → Gemini-vision classifies vs the target category → collect matching
  tile ids → click each via `#tile-N` selector → submit. No coordinates. *(Built: `visionGridStep`.)*
- **Test scenarios:**
  - Happy: grid with known correct tiles → agent selects exactly the matching set → success.
  - Error: vision misclassifies → re-classify on retry (phase=continue) → `recovered` (already coded).
  - Edge: tiles keep stable ids across loads (MP1 U6) so selector clicks always resolve.
  - Integration: full screenshot→classify→click→win over a real Steel session.
- **Verification:** climax solves the grid live; re-classify recovery proven by forcing a misclassify.

### U3. Route title banners
- **Model tier:** 🟢 Less-capable — UI string driven by `{flowTitle,feature}` from `flows.mjs`. Built in U5; verify.
- **Goal:** On-screen banner names the Steel feature per active route.
- **Requirements:** R13
- **Dependencies:** U1, U2
- **Files:** `public/arcade/run.js`, `public/arcade/index.html`
- **Approach:** As the agent advances, update a banner: `▶ reCAPTCHA v2 — Steel solveCaptcha`,
  `▶ Vision grid — Gemini vision + sessions.computer`, etc.
- **Test scenarios:**
  - Happy: banner text updates as route changes.
  - `Test expectation: light — UI string driven by route state.`
- **Verification:** banner tracks the live route on stage.

---

## Open Questions

- **Resolved:** tiles are clicked by DOM id (001 KTD4, shipped). `computer({action})` coords = Deferred.

## Scope Boundaries

**In:** solveCaptcha routes + vision-grid climax + title banners.
**Out:** diagnose/recover wrapping (MP6/MP7); fleet (MP8). Real third-party widgets (ethics).
