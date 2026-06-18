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

## Key Technical Decisions

- **KTD1 — Table-stakes routes use Steel `solveCaptcha` on always-pass TEST keys only** (gotcha #5). Never a
  real third-party widget — TOS + flake.
- **KTD2 — Vision grid solved by our agent, not Steel.** Per-tile: screenshot → Gemini-vision classify each
  tile against the category → click matching tiles by **stable DOM id** (MP1 U6) and/or `computer({action})`
  coords.
- **KTD3 — Coordinate-drift mitigation (gotcha #7).** Pin viewport `dimensions` to the screenshot basis; map
  Gemini tile coords carefully. Provide a deterministic fallback: click by the page's known stable tile ids
  if coord mapping is uncertain. Climax never hard-fails.

---

## Implementation Units

### U1. solveCaptcha table-stakes routes
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

### U2. Vision-grid classify + act (climax)
- **Goal:** Gemini-vision solves the image grid per tile and clicks matching tiles.
- **Requirements:** R6
- **Dependencies:** MP1 U6 (grid page), MP3 (loop), U1
- **Files:** `netlify/functions/lib/vision-grid.js`, `netlify/functions/lib/vision-grid.test.js`
- **Approach:** Screenshot grid → for each tile, Gemini-vision classifies vs the target category → collect
  matching tile ids → click via stable id (primary) or `computer({action})` coords (showcase). Pin
  `dimensions`.
- **Execution note:** pin viewport to screenshot basis before mapping coords (gotcha #7).
- **Test scenarios:**
  - Happy: grid with known correct tiles → agent selects exactly the matching set → success.
  - Error: vision misclassifies a tile → fallback to stable-id deterministic path keeps the climax passing.
  - Edge: viewport/devicePixelRatio mismatch → coord mapping guarded; id fallback engaged.
  - Integration: full screenshot→classify→click→win over a real Steel session.
- **Verification:** climax solves the grid live; fallback proven by forcing a misclassify.

### U3. Route title banners
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

- Click vision-grid tiles by DOM id vs `computer({action})` coords as the *primary* path — default id
  (robust), use coords as the visible showcase with id fallback.

## Scope Boundaries

**In:** solveCaptcha routes + vision-grid climax + title banners.
**Out:** diagnose/recover wrapping (MP6/MP7); fleet (MP8). Real third-party widgets (ethics).
