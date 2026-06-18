# feat: MP4 — Live + Recorded Session Viewer

**Date:** 2026-06-18
**Type:** feat
**Depth:** Lightweight
**Origin:** `docs/brainstorms/2026-06-18-steel-reliability-arcade-requirements.md`
**Index:** `docs/plans/2026-06-18-002-feat-arcade-miniprojects-index-plan.md`
**R-IDs:** R7 · **Depends on:** MP2

---

## Summary

Surface the Steel session visually: embed the **live `debugUrl`** in an iframe so the CEO watches the real
cloud browser work in real time, and link/embed the **recorded `sessionViewerUrl`** for replay —
freeze-framed on the failure frame to back the diagnose beat (MP6). This is the "at least one moment shows a
real Steel cloud browser" success criterion.

---

## Problem Frame

A demo claim ("agent drove a real Steel browser") is only believable if the viewer *sees* it. The live
viewer is the proof surface; the recorded replay is the evidence surface for diagnose-from-evidence.

---

## Requirements

- **R7** — Live Steel session embedded via `debugUrl` iframe; recorded `sessionViewerUrl` for replay.

---

## Implementation Units

### U1. Live viewer iframe
- **Goal:** Embed the live session so it streams in the UI.
- **Requirements:** R7
- **Dependencies:** MP2 (session provides viewer/debug URL)
- **Files:** `public/arcade/viewer.js`, `public/arcade/index.html`
- **Approach:** On session create, mount an iframe pointed at the session's live `debugUrl`/`sessionViewerUrl`.
  Handle not-yet-ready (poll/retry) and session-ended states.
- **Test scenarios:**
  - Happy: after create, iframe loads the live view.
  - Edge: URL not ready → retry/placeholder, no broken iframe.
  - Error: session released → viewer shows ended state.
  - `Covers: R7 + the "shows a real Steel browser" success criterion.`
- **Verification:** during a live run, the iframe shows the browser acting.

### U2. Recorded replay + freeze-frame
- **Goal:** Show the recorded session, paused on the failure frame.
- **Requirements:** R7
- **Dependencies:** U1, MP6 (failure frame marker)
- **Files:** `public/arcade/viewer.js`
- **Approach:** After a run, surface `sessionViewerUrl` replay; if MP6 supplies a failure timestamp/frame,
  deep-link/seek to it so "explain from evidence" has a visual anchor.
- **Test scenarios:**
  - Happy: replay link opens the recorded session post-run.
  - Edge: no failure frame (clean run) → replay opens at start.
  - `Test expectation: light — URL surfacing + optional seek; behavior is Steel-provided.`
- **Verification:** a failed run's replay opens on/near the failure frame.

---

## Open Questions

- Whether `debugUrl` embeds cross-origin cleanly in an iframe on Netlify — verify at impl; fallback to a
  prominent "open live viewer" link if framing is blocked.

## Scope Boundaries

**In:** live iframe + recorded replay surfacing.
**Out:** evidence extraction / diagnosis text (MP6); the failure-frame *detection* (MP6 supplies marker).
