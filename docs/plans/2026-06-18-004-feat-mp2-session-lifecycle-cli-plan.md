# feat: MP2 — Steel Session Lifecycle via printing-press CLI

**Date:** 2026-06-18
**Type:** feat
**Depth:** Standard
**Origin:** `docs/brainstorms/2026-06-18-steel-reliability-arcade-requirements.md`
**Index:** `docs/plans/2026-06-18-002-feat-arcade-miniprojects-index-plan.md`
**R-IDs:** R4, R10 · **Depends on:** none

---

## Summary

Own the Steel **session lifecycle** — create / list / get / release — through a **printing-press-generated
CLI** (printingpress.dev playbook) instead of hand-rolled `steel-sdk` calls. The CLI is the one cluster
built via the generated tool: it gives an agent-native surface (`--json`, local SQLite mirror of sessions,
compound queries) over the Steel Sessions API, and the app's lifecycle operations shell out to it. The
per-step agent *drive* (Playwright-over-CDP) is **not** routed through the CLI (MP3 calls Steel directly —
Netlify-timeout hot path).

---

## Problem Frame

Steel's raw Sessions API is fine for one-shot calls, but the demo wants an agent-native, inspectable
lifecycle surface — exactly what printingpress.dev generates: a Go CLI with a local SQLite mirror so
"list my sessions / which failed / get this session's viewer URL" answer locally in ~50ms instead of N
remote round trips. This MP generates that CLI and wires the app's lifecycle ops to it.

---

## Requirements

- **R4** — Sessions created/connected for a real Steel cloud browser (lifecycle half; drive is MP3).
- **R10** — `STEEL_API_KEY` in Netlify env vars; CLI reads key from env, never client-shipped.

---

## Key Technical Decisions

- **KTD1 — Generate the CLI via printing-press, don't hand-roll.** Honor the user-named resource. Install
  path per playbook (`npx -y @mvanhorn/printing-press-library install ...`); generator needs Go 1.26.3+,
  Claude Code, Node. The generated CLI is a Go binary with `--json` + local SQLite mirror.
- **KTD2 — Lifecycle only, not agent drive.** CLI verbs cover create/list/get/release + viewer-URL lookup.
  The CDP drive stays in app code (MP3) for latency + Netlify-timeout reasons.
- **KTD3 — Auth from env.** CLI reads `STEEL_API_KEY` from environment; the Netlify function passes it
  through its own env. No key on the client.

## Steel SDK surface (verified from quickstart)

`create()` (opts: `useProxy`, `solveCaptcha`, `timeout`, `inactivityTimeout`, `userAgent`, `dimensions`,
`stealthConfig`), `release(sessionId)`, `list()`, `get`/retrieve, plus `sessionViewerUrl` /
`browserWSEndpoint` on the session. *Exact event/log method names + list pagination → verify in SDK
(deferred, shared with MP6).*

---

## Implementation Units

### U1. Generate the Sessions-API CLI via printing-press
- **Goal:** A working agent-native CLI over Steel Sessions API.
- **Requirements:** R4
- **Files:** `cli/` (generated output tree — exact layout set by generator), `package.json` (add install
  script), `README.md` (CLI usage)
- **Approach:** Run the printing-press install/generate flow targeting the Steel Sessions API. Capture the
  generated Go binary + any Claude Code skill / MCP output it emits. Pin the install command in repo docs.
- **Execution note:** generator requires Go 1.26.3+, Claude Code, Node — verify toolchain present first;
  if Go absent in the Netlify build image, the binary must be prebuilt/committed or invoked locally only.
- **Patterns to follow:** printingpress.dev verb/noun command structure; `--json` agent output.
- **Test scenarios:**
  - Happy: `cli create` returns a session id + `sessionViewerUrl`; `cli list --json` returns it.
  - Edge: `cli get <id>` after create returns matching details from the local SQLite mirror.
  - Error: missing `STEEL_API_KEY` → clear non-zero exit + message, no partial state.
  - `Covers: R4 lifecycle surface.`
- **Verification:** create→list→get→release round-trips against Steel free tier; mirror reflects state.

### U2. Lifecycle wrapper module (app ↔ CLI)
- **Goal:** A thin app-side module the rest of the system calls for lifecycle ops.
- **Requirements:** R4, R10
- **Dependencies:** U1
- **Files:** `netlify/functions/lib/session-lifecycle.js`, `netlify/functions/lib/session-lifecycle.test.js`
- **Approach:** Wrap CLI invocation (or its `--json` output) behind `create/list/get/release` functions
  returning typed objects. Reads `STEEL_API_KEY` from `process.env`. Surfaces `sessionViewerUrl` +
  `browserWSEndpoint` for MP3/MP4.
- **Test scenarios:**
  - Happy: `create()` returns `{ sessionId, viewerUrl, wsEndpoint }`.
  - Error: CLI non-zero exit → wrapper throws a typed error (no silent empty object).
  - Edge: `release()` on an already-released id is idempotent / handled.
  - Integration: `create()` then `get()` reflects the same session (mirror consistency).
- **Verification:** wrapper unit tests pass; a real create→release works from a Netlify function locally.

### U3. Lifecycle CLI agent-native outputs (skill / MCP)
- **Goal:** Expose the generated skill/MCP output so an agent (or the user) can run lifecycle ops natively.
- **Requirements:** R4
- **Dependencies:** U1
- **Files:** generated skill/MCP artifacts under `cli/` (exact paths generator-defined), `README.md`
- **Approach:** Surface whichever of {Claude Code skill, MCP server} the generator emits; document invocation.
  This is the "agent-native CLI beats raw HTTP" payoff and a verbal-answer asset (MCP/agent-native).
- **Test scenarios:** `Test expectation: none — packaging/exposure of generated artifacts; covered by U1 behavior.`
- **Verification:** the skill/MCP entry lists + creates sessions when invoked.

---

## Open Questions

- Exact generated command shapes + install/output tree — deferred to impl (run generator, capture).
- Whether Go toolchain is available in the Netlify build image, or the binary is local-only / prebuilt.

## Scope Boundaries

**In:** generated lifecycle CLI + app wrapper + agent-native outputs.
**Out:** routing the per-step agent drive through the CLI (MP3 owns that, calls Steel directly).
