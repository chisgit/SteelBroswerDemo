---
title: "feat: Persistent Cloud Session — Math Arcade Resume Demo"
date: 2026-06-18
sequence: "012"
type: feat
status: draft
---

# feat: Persistent Cloud Session — Math Arcade Resume Demo

**Problem:** Current demos show Steel as a CAPTCHA-solving tool. The deeper value proposition — the browser lives in the cloud and its state survives agent disconnects — is completely absent. This demo fills that gap.

**What it proves:** A Steel session keeps its full JavaScript heap (game state, DOM, timers) alive after the agent disconnects. Re-attaching via the same `sessionId` resumes the browser exactly where it left off. No local Puppeteer/Playwright setup can do this.

---

## Requirements

| ID | Requirement |
|----|-------------|
| R1 | Agent creates one Steel session, navigates to matharcadewrecker.netlify.app, and starts the Math Match game by calling `app.loadGame('match')` via `page.evaluate()` |
| R2 | Agent plays ~4 cards (2 matches), reads `matchGame.score` via `page.evaluate()` — score confirmed non-zero |
| R3 | Agent **disconnects** (CDP browser.close()) but does **not** call `sessions.release()` — session stays alive in Steel cloud |
| R4 | Agent performs "other work" in a separate step (fetches a public URL, e.g. quotes API or Wikipedia) — visible as a distinct evidence card + API log entry |
| R5 | Agent re-attaches to the **same sessionId** via `chromium.connectOverCDP` |
| R6 | Agent reads `matchGame.score` again — value matches the pre-disconnect score, proving JS heap survived |
| R7 | Agent completes the remaining cards and finishes the game |
| R8 | Live API console shows the full sequence: `sessions.create` → `connectOverCDP` → `browser.close (no release)` → `connectOverCDP (resume)` → `sessions.release` |
| R9 | Evidence cards show: start screenshot, mid-game screenshot, score-verified card, resume screenshot, finished screenshot |
| R10 | `sessionViewerUrl` embedded in the side panel so watcher can see the live tab during demo |

---

## Key Technical Decisions

| ID | Decision | Rationale |
|----|----------|-----------|
| KTD1 | **Multi-phase route** — `start` → `play` → `detach` → `other-work` → `resume` → `finish` | Matches existing phase pattern in `agent-step.mjs`. Front-end loops until `done:true`. Each phase is one atomic ≤10s serverless call. |
| KTD2 | **`page.evaluate()` for game state** — use `() => matchGame.score` and `() => matchGame.matched` | `matchGame` is a global on the page. No DOM scraping needed. Survives disconnect because JS heap is in Steel's cloud Chrome, not our server. |
| KTD3 | **Card clicking via `page.evaluate()`** — call `document.querySelectorAll('#match-grid .card:not(.matched)')` then `card.click()` in pairs | Avoids needing to understand card layout geometry. First two un-matched cards form pair 1; next two form pair 2. Sufficient for "played partway" demo shape. |
| KTD4 | **"Other work" = fetch quotes.rest public API** — `page.goto('https://quotes.rest/qod')` on a temporary second page in the same session | Keeps the Math Match tab alive (no navigate away), shows a real second action in API log, and the URL is always up. Alternative: open a new page context. |
| KTD5 | **Disconnect = `browser.close()` without `release()`** | `browser.close()` only disconnects the CDP websocket. Steel's session remains alive server-side. This is the core proof. Must be explicit in evidence card and API log. |
| KTD6 | **New Netlify function `session-resume.mjs`** — thin wrapper that takes `{sessionId}` and returns the existing session's `websocketUrl` for reconnect | Avoids changing `session-create.mjs`. `sessions.get(sessionId)` or reconstruct websocket URL from sessionId + key. |
| KTD7 | **New route key `"math-arcade"`** in `flows.mjs` | Follows existing FLOWS map pattern. Gives the UI chip + banner + snippet panel for free. |
| KTD8 | **Score comparison done server-side** — read score before disconnect, pass it as `savedScore` field in step response; re-read on resume, compare in serverless handler | Avoids client-side state management. Clean evidence: "score before: 200 / score after: 200 → heap intact". |

---

## High-Level Technical Design

```
Phase sequence (all server-side, front-end loops):

  [start]
    sessions.create({}) → sessionId, websocketUrl
    page.evaluate: app.loadGame('match')
    page.evaluate: click 4 cards (2 pairs)
    score = page.evaluate(() => matchGame.score)
    screenshot → evidence card "game started, score=N"
    return { done:false, phase:"detach", savedScore: score }

  [detach]
    browser.close()  ← CDP disconnect only, NO sessions.release
    log entry: "browser.close — session still alive in Steel cloud"
    return { done:false, phase:"other-work" }

  [other-work]
    sessions-resume: connectOverCDP(sessionId) → new page context
    open second page → fetch https://quotes.rest/qod
    screenshot quote page → evidence card "agent did other work"
    browser.close()  ← disconnect again
    return { done:false, phase:"resume", savedScore: savedScore }

  [resume]
    connectOverCDP(sessionId)  ← same sessionId, third connect
    resumeScore = page.evaluate(() => matchGame.score)
    assert resumeScore === savedScore
    screenshot Math Match tab → evidence card "resumed — score intact"
    return { done:false, phase:"finish", savedScore: savedScore }

  [finish]
    click remaining cards until matchGame.matched === 8
    screenshot win screen → evidence card "game complete"
    sessions.release(sessionId)
    return { done:true, outcome:"pass" }
```

**API console sequence visible to demo audience:**
```
sessions.create        {}                    → ok  (42ms)
chromium.connectOverCDP  {sessionId: "abc…"} → connected
browser.close (no release)                   → session alive
chromium.connectOverCDP  {sessionId: "abc…"} → reconnected  ← THE PROOF
sessions.release       {sessionId: "abc…"}   → ok
```

---

## Scope Boundaries

**In scope:**
- New Netlify function `session-resume.mjs`
- New route `"math-arcade"` in `flows.mjs`
- New case `"math-arcade"` in `agent-step.mjs`
- Front-end: new recipe `"persistent-session"` in `DEMO_RECIPES`

**Deferred to Follow-Up Work:**
- Error recovery if `matchGame` is undefined (game not loaded in time) — add timeout/retry in follow-up
- Support for multiple Math Match rounds
- Fleet variant (N sessions each at different game states)

**Out of scope:**
- Changes to matharcadewrecker.netlify.app (we drive it as a third-party site)
- Modifying existing gauntlet routes

---

## Implementation Units

### U1. `session-resume.mjs` — reconnect to existing session

**Goal:** Return the websocket URL for an existing session so the agent can re-attach.

**Requirements:** R5, R8, KTD6

**Dependencies:** none

**Files:**
- `netlify/functions/session-resume.mjs` (new)

**Approach:**
- Accept `{ sessionId }` in POST body
- Reconstruct websocket URL: `wss://connect.steel.dev?apiKey=${STEEL_API_KEY}&sessionId=${sessionId}`
- Return `{ websocketUrl }` — no Steel API call needed (URL is deterministic)
- Log as `chromium.connectOverCDP (resume)` so it appears in API console

**Test scenarios:**
- POST with valid sessionId → returns websocket URL with correct format
- POST with missing sessionId → returns 400
- Missing STEEL_API_KEY → returns 500

**Verification:** Call the function locally; confirm websocket URL contains the sessionId.

---

### U2. `flows.mjs` — add `math-arcade` route

**Goal:** Register the new route so UI chips, banners, and snippet panel work automatically.

**Requirements:** R7 (UI), KTD7

**Dependencies:** none

**Files:**
- `netlify/functions/lib/flows.mjs`

**Approach:**
- Add to `FLOWS`:
  ```
  "math-arcade": {
    title: "Math Arcade — persistent cloud session",
    feature: "session persistence",
    proves: "Steel keeps JS heap alive after agent disconnects — re-attach resumes exactly where you left off.",
    apiSnippet: `// disconnect without releasing\nawait browser.close();\n// ... other work ...\n// reconnect same session\nawait chromium.connectOverCDP(websocketUrl);`,
    docsUrl: "https://docs.steel.dev/overview/sessions-api/overview",
    path: null,  // external site — no base URL path
  }
  ```
- Add recipe `"persistent-session"` to `DEMO_RECIPES`
- Add `"math-arcade"` to `ROUTES` export (or leave out of default — recipe-only route is fine)

**Test scenarios:**
- `flowMeta("math-arcade")` returns the correct object
- `recipeMeta("persistent-session")` includes `"math-arcade"` in routes

**Verification:** `/api/flows` endpoint returns the new entry in `flows` and `recipes`.

---

### U3. `agent-step.mjs` — `mathArcadeStep` phase handler

**Goal:** Drive the Math Match game through the 5-phase lifecycle: start → detach → other-work → resume → finish.

**Requirements:** R1–R9, KTD1–KTD5, KTD8

**Dependencies:** U1 (session-resume), U2 (flows entry)

**Files:**
- `netlify/functions/agent-step.mjs`
- `netlify/functions/lib/steel.mjs` (may need `disconnect()` helper)

**Approach:**

Add to `runStep` switch: `case "math-arcade": return mathArcadeStep(page, phase, sessionId, meta);`

Phase logic (directional — exact selector names subject to DOM inspection):

- **start:** `page.evaluate(() => app.loadGame('match'))` → wait for `#match-grid .card` to appear → click cards 0+1 (pair), cards 2+3 (pair) via `page.evaluate` → read `matchGame.score` → screenshot → return `{ done:false, phase:"detach", savedScore }`

- **detach:** `browser.close()` on the current connection (only; no `sessions.release`) → log `"browser.close — session kept alive"` → return `{ done:false, phase:"other-work", savedScore }`
  - Note: `browser` is `conn.browser` from the caller; need to expose it or handle the close inside this step before returning.

- **other-work:** Re-connect via `connect(websocketUrl, sessionId)` → open new page via `browser.newPage()` → `newPage.goto('https://quotes.rest/qod.json')` → screenshot → `browser.close()` → return `{ done:false, phase:"resume", savedScore }`

- **resume:** `connect(websocketUrl, sessionId)` → on first page (Math Match tab), `page.evaluate(() => matchGame.score)` → compare to `savedScore` → screenshot → return `{ done:false, phase:"finish", savedScore, scoreConfirmed: resumeScore === savedScore }`

- **finish:** Click remaining unmatched cards until `matchGame.matched === 8` → screenshot win screen → `sessions.release(sessionId)` → return `{ done:true, outcome:"pass" }`

**savedScore persistence:** Front-end must pass `savedScore` back on every step (alongside `phase`). Add to `app.js` `runRoute()` to carry extra params from step response into next step request.

**Execution note:** The `detach` phase calls `browser.close()` before the `finally` block in `handler` also calls it. Add a guard: `if (!conn._closed) await conn.browser.close()` — set `conn._closed = true` after explicit close in this step.

**Test scenarios:**
- start phase: `#match-grid .card` elements clickable; `matchGame.score` readable after 2 pairs clicked; returns `savedScore > 0`
- detach phase: browser.close() called once; `sessions.release` NOT called; step returns `done:false, phase:"other-work"`
- other-work phase: connectOverCDP succeeds with same sessionId; second page navigates to quotes URL; Math Match tab still open
- resume phase: `matchGame.score` on resume equals `savedScore` from start phase (heap survived)
- finish phase: all 8 pairs matched; `sessions.release` called; returns `done:true, outcome:"pass"`
- Error: `app.loadGame` throws (game not available) → evidence card with diagnosis, `done:true, outcome:"fail"`

**Verification:** Run demo end-to-end in browser; confirm API log shows two `connectOverCDP` entries for the same sessionId.

---

### U4. `app.js` — carry `savedScore` + `phase` across steps; add recipe chip

**Goal:** Pass `savedScore` and next `phase` from each step response back into the subsequent step request.

**Requirements:** R8, KTD8

**Dependencies:** U3

**Files:**
- `public/app.js`

**Approach:**
- In `runRoute()`, accumulate extra carry-forward params from step response:
  ```js
  const extra = {};
  if (res.savedScore !== undefined) extra.savedScore = res.savedScore;
  // pass extra into next api("agent-step", { ...base, ...extra })
  ```
- Add `"persistent-session"` to recipe picker so user can select it from the UI

**Test scenarios:**
- `savedScore` present in step response → included in next step request body
- `savedScore` absent from step response → not included (no undefined keys sent)

**Verification:** Check DevTools Network tab; confirm `savedScore` appears in request body of `other-work` and later phases.

---

## Open Questions

| # | Question | Status |
|---|----------|--------|
| Q1 | Does `quotes.rest/qod.json` require CORS or auth? If blocked, substitute with `https://httpbin.org/json` | Defer to implementation — test during U3 |
| Q2 | Does `app.loadGame('match')` work reliably within the 8s page-load window, or does it need a `waitForFunction`? | Defer to implementation |
| Q3 | Steel's `sessions.get(id)` — does it return `websocketUrl`? If yes, `session-resume.mjs` can validate session is still alive before reconnect | Defer — reconstructed URL works as fallback |

---

## Risks & Dependencies

| Risk | Mitigation |
|------|------------|
| Netlify 10s sync cap — `other-work` phase navigates external URL which may be slow | Use `https://httpbin.org/json` (fast, always up) as fallback; cap `page.goto` timeout to 6s |
| `matchGame` global not defined if game not loaded yet | `waitForFunction(() => typeof matchGame !== 'undefined', { timeout: 5000 })` before evaluate |
| Double `browser.close()` in detach phase + handler finally block | Guard with `conn._closed` flag (see U3 execution note) |
| `matharcadewrecker.netlify.app` CSP/frame restrictions | Site confirmed fully open static Netlify — no restrictions |

---

## Sources & Research

- Math Match game state: `matchGame.score`, `matchGame.matched`, `matchGame.cards` — confirmed in-memory only, no localStorage (WebFetch analysis of game HTML + match.js)
- Steel CDP reconnect pattern: `chromium.connectOverCDP(wss://connect.steel.dev?apiKey=…&sessionId=…)` — existing pattern in `netlify/functions/lib/steel.mjs:56-68`
- Existing phase pattern: `hcaptchaStep`, `botWallStep` in `agent-step.mjs` — same `phase` param, same `done:false` + phase carry-forward shape
- Evidence card schema: `netlify/functions/lib/evidence.mjs` — `card({ action, targetSelector, verdict, outcome, screenshotThumb, diagnosis, recovery })`
