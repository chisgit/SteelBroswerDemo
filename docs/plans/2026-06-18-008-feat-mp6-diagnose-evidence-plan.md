# feat: MP6 — Diagnose-from-Evidence

**Date:** 2026-06-18
**Type:** feat
**Depth:** Standard
**Origin:** `docs/brainstorms/2026-06-18-steel-reliability-arcade-requirements.md`
**Index:** `docs/plans/2026-06-18-002-feat-arcade-miniprojects-index-plan.md`
**R-IDs:** R8, R14 · **Depends on:** MP3, MP4

---

## Summary

On a route failure, the agent inspects **session evidence** — DOM state at failure, agent action log, the
screenshot/recording frame — and produces a human-readable explanation of *why* it failed. This mirrors
Steel's `steel-session-debugging` skill ("explain a failed run from evidence") and is the demo's substance
beat: the agent doesn't just retry blindly, it *understands* the failure first.

---

## Problem Frame

Hussien's current bet is observability/debugging of agent runs. A retry loop that silently re-attempts looks
naive; an agent that captures evidence and states a specific cause ("element `#start` never appeared within
4s — slow-load flake" / "blocked as bot — access-denied page detected") is the reliability story. The
diagnosis must be grounded in real captured evidence, not a canned string.

---

## Requirements

- **R8** — On failure, capture structured evidence + produce a why-explanation; precursor to recover (MP7).
- **R14** — Self-explaining: the diagnosis is shown legibly so a watcher understands the failure.

---

## Key Technical Decisions

- **KTD1 — Evidence bundle = DOM snapshot + action history + screenshot frame + failed selector/state.**
  Captured at the failure point by the executor (MP3 U3 already records pre/post state).
- **KTD2 — Diagnosis via Gemini over the evidence bundle**, constrained to map to a known failure-mode
  taxonomy (flaky / selector-drift / captcha / bot-wall / mobile) so the explanation is specific and the
  *recover strategy* (MP7) is selectable from it.
- **KTD3 — DOM + screenshot for diagnose** (vs DOM-only steps) — vision strengthens "explain from evidence";
  this is a worth-it screenshot per MP3 KTD3.

---

## Implementation Units

### U1. Evidence capture on failure
- **Model tier:** 🟡 Capable — bundle DOM/screenshot/history; built via `evidence.mjs` `card()`. Verify Steel log method names (deferred).
- **Goal:** Bundle the evidence available at the failure frame.
- **Requirements:** R8
- **Dependencies:** MP3 U3 (action/state history), MP4 (recording/frame)
- **Files:** `netlify/functions/lib/evidence.js`, `netlify/functions/lib/evidence.test.js`
- **Approach:** On a failed action, collect: failed selector/verb, DOM snapshot, last screenshot, action
  history tail, session id + failure timestamp (for MP4 freeze-frame seek). Verify Steel event/log method
  names in SDK for logs (deferred-to-impl shared with MP2).
- **Test scenarios:**
  - Happy: a forced selector failure yields a bundle with all fields populated.
  - Edge: screenshot unavailable → bundle still valid (degrades, no throw).
  - Error: session already gone → bundle from cached history, flagged partial.
- **Verification:** each staged failure mode produces a populated bundle.

### U2. Diagnosis generation
- **Model tier:** 🟡 Capable — Gemini over evidence → cause + taxonomy enum; prompt tuning so cause cites concrete evidence. Partially built (inline diagnosis strings in `agent-step.js`).
- **Goal:** Turn the evidence bundle into a specific human-readable cause + a taxonomy tag.
- **Requirements:** R8, R14
- **Dependencies:** U1
- **Files:** `netlify/functions/lib/diagnose.js`, `netlify/functions/lib/diagnose.test.js`
- **Approach:** Gemini (DOM+screenshot) over the bundle → `{ cause: string, mode: enum, confidence }`. Mode
  enum drives MP7 recover selection. Tight prompt so the cause cites concrete evidence (the selector, the
  denied page, the timeout).
- **Test scenarios:**
  - Happy (mode a): timeout bundle → cause names slow-load + `mode: flaky`.
  - Happy (mode d): access-denied DOM → cause names bot-wall + `mode: bot-wall`.
  - Happy (mode b): selector-miss bundle → `mode: selector-drift`.
  - Error: ambiguous bundle → low confidence + `mode: unknown` (MP7 falls back to generic retry).
  - `Covers: R8 diagnose, R14 legibility.`
- **Verification:** each staged mode diagnoses to the correct taxonomy tag.

### U3. Diagnosis surfacing in UI
- **Model tier:** 🟢 Less-capable — render diagnosis payload + hand frame marker to MP4. Light.
- **Goal:** Show the diagnosis legibly beside the (freeze-framed) replay.
- **Requirements:** R14
- **Dependencies:** U2, MP4 U2
- **Files:** `public/arcade/run.js`, `public/arcade/index.html`
- **Approach:** Render the cause text + mode tag; hand the failure timestamp to MP4 for replay seek.
- **Test scenarios:**
  - Happy: failed run shows cause + mode next to the replay.
  - `Test expectation: light — render of diagnosis payload.`
- **Verification:** on stage, a failure shows a specific, evidence-grounded explanation.

---

## Open Questions

- Exact Steel event/log SDK method names for richer evidence — deferred to impl (verify in SDK; shared
  with MP2). DOM+screenshot+history is sufficient even if logs API is thin.

## Scope Boundaries

**In:** evidence capture + diagnosis + UI surfacing.
**Out:** the actual recovery action (MP7); replay rendering (MP4 owns, MP6 supplies the frame marker).
