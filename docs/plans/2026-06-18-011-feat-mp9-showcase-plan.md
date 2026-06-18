# feat: MP9 — Self-Explaining Technical Showcase UI (R14)

**Date:** 2026-06-18
**Type:** feat
**Depth:** Standard
**Origin:** `docs/brainstorms/2026-06-18-steel-reliability-arcade-requirements.md`
**Master:** `docs/plans/2026-06-18-001-feat-steel-captcha-gauntlet-plan.md` (U9)
**Index:** `docs/plans/2026-06-18-002-feat-arcade-miniprojects-index-plan.md`
**R-IDs:** R14 (surfaces R4, R13) · **Depends on:** MP4, MP5

---

## Summary

**The one unbuilt feature.** Make the site legible to a developer audience (Steel's own customers): what it
is, the architecture, and — per active flow — the **real Steel integration snippet** it is running, with a
docs link. Backend data already exists (`flows.mjs` carries `apiSnippet`, `docsUrl`, `proves` for every
route); this MP builds the **UI layer** that renders it. Matches master plan 001 U9, which is not yet
committed (in-progress uncommitted edits to `public/app.js` + `public/index.html`).

---

## Problem Frame

The audience is a deeply technical CEO + Steel team. A demo that looks like a generic agent wrapper reads
junior; one that shows the actual `sessions.create({...})` / CDP connect / `stealthConfig` calls per flow,
with the stack stated up front, reads as "I built a real product on the Sessions API." R14 is that legibility
layer. The data plumbing is done — the gap is purely presentational.

---

## Requirements

- **R14** — Cold developer grasps, without narration: what the site is, which Steel capability each flow
  exercises, and how it's integrated (real API snippets + stack + docs links). Technical, not marketing.

---

## Current State (2026-06-18 — COMPLETED)

✅ **U1 — Header/legend** (commit `88dfd27`)
- Header + tagline + architecture line (Netlify UI → Functions → Steel CDP → Gemini)
- Legend renders flow→Steel feature map from FLOWS catalog
- No hardcoding, no drift risk

✅ **U2 — Per-flow snippet panel** (commit `88dfd27`)
- Panel shows real `sessions.create(...)` / `stealthConfig` / `useProxy` calls per route
- `apiSnippet` + `proves` + docs link sourced from `flows.mjs`
- Updates on route/phase transition (including bot-wall → stealth relaunch)
- Cold dev grasps purpose + stack + integration within ~30s ✓

**Backend data (pre-existing):**
- `flows.mjs` exposes `apiSnippet` / `docsUrl` / `proves` / `feature` / `title` per route
- `flows.js` function serves catalog to client
- Banner (R13) already reads it

---

## Implementation Units

### U1. Header / intro + architecture line
- **Model tier:** 🟢 Less-capable — static content + catalog-driven legend; exact copy can be specified.
- **Goal:** One-screen explainer on first paint: what the site is + the stack.
- **Requirements:** R14
- **Files:** `public/index.html`, `public/styles.css`
- **Approach:** Header states "a live tour of the Steel Sessions API" + architecture line
  (Netlify static UI + Functions → Steel cloud browser via CDP → Gemini Flash agent) + a legend mapping
  flows → Steel features (sourced from the `flows` catalog, not hardcoded).
- **Test scenarios:**
  - Happy: first paint shows what-it-is + architecture + flow→feature legend.
  - Accuracy: legend entries match `FLOWS` feature names (no drift).
  - `Test expectation: light — static content + catalog-driven legend.`
- **Verification:** a cold visitor states purpose + stack within ~30s.

### U2. Per-flow live API-snippet panel
- **Model tier:** 🟡 Capable — must infer existing `app.js` step-handling patterns + wire panel to active-flow events; catalog data exists in `flows.mjs`.
- **Goal:** Beside the live iframe + banner, show the active flow's real integration snippet + docs link.
- **Requirements:** R14 (surfaces R4, R13)
- **Dependencies:** U1, MP4 (iframe), MP5 (route advancement emits active flow)
- **Files:** `public/app.js`, `public/index.html`, `public/styles.css`
- **Approach:** On each step's `{ flowTitle, feature }` (and the route key), look up the flow in the client
  catalog and render `apiSnippet` + `proves` + `docsUrl`. Updates on route/phase transition — including
  bot-wall → stealth relaunch (snippet switches to the `release`+`create({stealthConfig,useProxy})` form).
- **Test scenarios:**
  - Happy: switching flows updates the panel to the matching `apiSnippet` + `docsUrl`.
  - Edge: bot-wall recover transition swaps the snippet to the relaunch form.
  - Accuracy: snippets use real Steel SDK method/param names (cross-check `product-background/steel-api-reference.md`).
  - Integration: panel snippet matches the route the engine is actually running (banner + panel agree).
  - `Covers: R14.`
- **Verification:** developer reads the exact Steel call each flow runs, in sync with the live view.

---

## Open Questions

- Show `apiSnippet` from the served catalog (client fetch of `/flows`) vs inline — prefer served catalog so
  there's one source of truth (`flows.mjs`), no client duplication.

## Scope Boundaries

**In:** header/architecture/legend + per-flow snippet panel, catalog-driven.
**Out:** the flow data itself (done in `flows.mjs`); diagnosis legibility (MP6); the banner (R13, done in MP5/U5).
