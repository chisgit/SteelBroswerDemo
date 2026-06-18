# feat: Steel CAPTCHA Gauntlet — interview demo

**Date:** 2026-06-18
**Type:** feat
**Depth:** Standard
**Origin:** `docs/brainstorms/2026-06-18-steel-reliability-arcade-requirements.md` (see Pivot note)
**Reference intel:** `product-background/` — `steel-api-reference.md`, `steel-differentiators-and-captcha.md`, `demo-design-review.md`, `steel-ceo-research.md`, `founder-journeys.md`

---

## Summary

A single, fully-autonomous, UI-driven web app deployed on Netlify (free tier) that demonstrates building a
*product* on Steel.dev. A user clicks **Run**; a Gemini-Flash agent drives a real Steel cloud browser
(Playwright over CDP) through a **multi-route CAPTCHA Gauntlet** we own, while the live Steel session streams
in an embedded iframe. Real provider widgets (reCAPTCHA v2, Cloudflare Turnstile — official test keys) are
walked via Steel's `solveCaptcha`; the climax is **our own vision image-grid** (bikes / trains / traffic-lights
/ dogs) that a **Gemini-vision agent solves per-tile** — the honest capability Steel does not auto-do. A
diagnose-from-evidence + recover arc wraps each route, and an honest parallel-fleet variance dashboard closes.

---

## Problem Frame

The interview goal is to prove "I can build a real product on Steel," to a deeply technical CEO (Hussien
Hussien) whose current bet is observability/debugging of agent runs ("explain a failed run from evidence")
and "embarrassingly reliable" agents at fleet scale. A plain Playwright test suite reads as junior; a CAPTCHA
auto-solve reads as "I found the docs." The demo must therefore showcase **agent intelligence on top of
Steel** (vision-grid solve), Steel's **proof/observability** surfaces (live viewer, evidence), and **honest
scale** (fleet variance) — all within hard constraints: Netlify, fully free, no self-hosting, autonomous via UI.

---

## Requirements

- **R1** — One Netlify deployment: static UI + serverless functions; no separate server, no self-hosting.
- **R2** — Fully autonomous via UI: user clicks **Run**, watches; no terminal, no manual steps.
- **R3** — Free end-to-end: Netlify free tier, Steel free tier (100 browser hrs), Gemini Flash free tier.
- **R4** — Agent (Gemini Flash + vision) drives a real Steel cloud browser via Playwright-over-CDP, server-side.
- **R5** — Multi-route gauntlet we own: reCAPTCHA v2 + Turnstile (real widgets, official test keys) +
  our own vision image-grid. hCaptcha optional "attempt" route.
- **R6** — Steel `solveCaptcha: true` handles the token/checkbox routes; the **vision-grid is solved by our
  agent** (per-tile Gemini-vision classify → click matching tiles by DOM id).
- **R7** — Live Steel session embedded in the UI via `debugUrl` iframe; recorded `sessionViewerUrl` for replay.
- **R8** — Diagnose-from-evidence + recover: on a route failure the agent captures structured evidence
  (screenshot thumbnail, failed selector/state, recovery action) and retries with an adjusted strategy.
- **R9** — Honest parallel-fleet finale: N concurrent sessions, **each hitting a different route/failure**,
  feeding a variance dashboard (per-route pass / fail / recovered).
- **R10** — Secrets (`STEEL_API_KEY`, `GEMINI_API_KEY`) live in Netlify env vars; never shipped to client.
- **R11** — Ethics: only our own site is automated; provider widgets use our/test keys; no third-party bypass.
- **R12** — Two added failure modes (from origin): **(d) bot-detection wall** — our site shows a fake
  "Access Denied / automation detected" page; agent diagnoses "blocked as bot" → recovers by relaunching the
  session with `stealthConfig` + `useProxy`. **(e) mobile-only layout bug** — one fleet agent runs a mobile
  `dimensions` viewport and hits a selector that only breaks on mobile (makes fleet variance honest).
- **R13 — Flow titles.** Each executing flow shows a clear on-screen **title banner** naming the exact Steel
  feature in play, so a watcher always knows what capability is being demonstrated right now — e.g.
  `▶ reCAPTCHA v2 — Steel solveCaptcha`, `▶ Vision grid — Gemini vision + sessions.computer`,
  `▶ Bot wall — recover via stealthConfig + useProxy`, `▶ Mobile bug — dimensions viewport`,
  `▶ Fleet — parallel sessions`. Title updates as the agent advances.
- **R14 — Self-explaining technical showcase.** The site is a *legible demo of the Steel Sessions API for a
  developer audience* (Steel's own customers). A dev landing cold must grasp, without narration: **what the
  site is**, **which Steel capability each flow exercises**, and **how it's integrated** — the actual Steel
  Sessions API calls + the stack. Each flow shows the real `sessions.create(...)` / connect / action snippet it
  is running, the architecture (Netlify static UI + functions → Steel cloud browser → Gemini) is stated up
  front, and feature names map explicitly to Steel API surface. Technical, not marketing fluff.

**Success criteria:** From a fresh browser, open the Netlify URL → click Run → watch the agent clear the
gauntlet (token routes + vision-grid climax), see live session + evidence on failures, end on a fleet variance
dashboard — no terminal, all free tiers. A viewer with no context grasps within ~2 min that *the agent saw the
images and acted*, that *Steel handled the standard captchas*, and that *it scaled across concurrent sessions*.

---

## Key Technical Decisions

- **KTD1 — Front-end-driven agent loop, one atomic step per function call.** Netlify free-tier sync functions
  hard-cap at **10s** (26s and 15-min background functions are paid — verified). A full agent task exceeds
  that. So the browser UI orchestrates the loop: each `POST /agent-step` does exactly one
  observe→decide→act cycle (≤10s) and returns state; the UI loops until the route completes. This is the only
  free-tier-viable design — not an open choice.
- **KTD2 — CDP connection is server-side only.** Playwright connects to Steel via
  `wss://connect.steel.dev?apiKey=…&sessionId=…` inside the function. Never from the browser client (key leak +
  CDP needs a server). The client only ever sees the `debugUrl` iframe + JSON state.
- **KTD3 — Pre-warm the Steel session.** Create the session on page load (or on first Run intent), before the
  user-perceived loop, so cold-start (session init + function spin-up) doesn't eat the 10s budget. Keep gauntlet
  pages **static** (no SSR cold start).
- **KTD4 — Vision-grid solved per-tile, clicked by DOM id (not coordinates).** Each grid tile is its own
  `<img id="tile-N">`. Gemini-Flash vision classifies each tile against the prompt ("is this a dog?"); the agent
  clicks matching tiles by selector. Avoids flaky coordinate math; yields clean per-tile evidence.
- **KTD5 — Evidence is structured data, not chat narration.** Each step returns `{ screenshotThumb, action,
  targetSelector, verdict, outcome }`. The UI renders evidence cards, not a Gemini monologue (avoids GPT-wrapper smell).
- **KTD6 — Official always-pass TEST keys** for reCAPTCHA v2 + Turnstile. Zero signup, deterministic render;
  the demo point is Steel navigating/solving the flow, not fraud scoring.
- **KTD7 — Honest fleet variance.** Parallel agents each target a *different* route so the dashboard shows real
  per-route variance — the truthful Steel Wire story, not N copies of one task.
- **KTD8 — Bundled local image set** for the vision-grid (curated royalty-free bikes/trains/lights/dogs).
  Offline, fast, deterministic; no runtime image API latency or wrong-category risk.
- **KTD9 — Flow titles are server-driven, UI-rendered (R13).** The step engine owns the canonical flow
  label + the Steel feature(s) in play and returns it on every step as `{ flowTitle, feature }`; the UI renders
  it as a persistent banner above the live iframe. Server-driven (not hardcoded in the UI) so the label always
  matches what the engine is actually doing — including mid-route transitions like bot-wall → stealth relaunch.
- **KTD10 — Stealth recovery = session relaunch, not in-session retry.** Failure mode (d) recovers by
  **releasing** the current session and **creating a new one** with `stealthConfig` + `useProxy`, then resuming
  the route. Fingerprint/proxy are session-creation options, so they cannot be toggled mid-session — the recover
  beat is honestly a relaunch, and the flow title reflects that transition.

---

## High-Level Technical Design

```mermaid
sequenceDiagram
    participant UI as Browser UI (static)
    participant Fn as Netlify Function (≤10s)
    participant Steel as Steel Cloud Browser
    participant Gem as Gemini Flash (vision)
    participant Site as Gauntlet routes (own, static)

    UI->>Fn: POST /session/create (pre-warm)
    Fn->>Steel: sessions.create({ solveCaptcha:true, stealth })
    Steel-->>Fn: { id, debugUrl, sessionViewerUrl, websocketUrl }
    Fn-->>UI: { sessionId, debugUrl }
    UI->>UI: embed debugUrl iframe (live view)
    loop one atomic step per call (until route done)
        UI->>Fn: POST /agent-step { sessionId, route, state }
        Fn->>Steel: connectOverCDP(ws) → screenshot / DOM
        Steel->>Site: navigate / observe
        Fn->>Gem: classify tile(s) / decide next action
        Gem-->>Fn: verdict + action
        Fn->>Steel: click(targetSelector) / wait
        Fn-->>UI: { evidence, outcome, done? }
        UI->>UI: render evidence card; loop or advance route
    end
    UI->>Fn: POST /fleet/run (N routes in parallel)
    Fn->>Steel: N sessions, one route each
    Fn-->>UI: per-route pass/fail/recovered → variance dashboard
```

Diagram is authoritative for the control/data flow; prose in the units governs specifics.

---

## Output Structure

```
steel-captcha-gauntlet/
├─ netlify.toml                 # functions dir + redirects
├─ public/
│  ├─ index.html                # control UI: intro+architecture (R14), Run, flow banner (R13),
│  │                            #   live iframe, per-flow API snippet panel, evidence feed, dashboard
│  ├─ app.js                    # front-end loop orchestrator (KTD1); banner + snippet binding
│  ├─ styles.css
│  └─ gauntlet/                 # the OWN target site (static routes)
│     ├─ recaptcha.html         # real reCAPTCHA v2 widget (test key)
│     ├─ turnstile.html         # real Turnstile widget (test key)
│     ├─ hcaptcha.html          # optional "attempt" route
│     ├─ vision-grid.html       # own image-grid challenge (tiles = <img id>)
│     ├─ bot-wall.html          # fake "automation detected" wall (R12d)
│     ├─ mobile-bug.html        # mobile-only layout/selector bug (R12e)
│     └─ images/                # bundled bikes/trains/lights/dogs set
└─ netlify/functions/
   ├─ session-create.js         # pre-warm Steel session (KTD3)
   ├─ agent-step.js             # one observe→decide→act cycle (KTD1, KTD2)
   ├─ fleet-run.js              # parallel sessions, one route each (KTD7)
   └─ lib/
      ├─ steel.js               # session create/connect/release helpers (+ stealth relaunch, KTD10)
      ├─ gemini.js              # vision classify + decide
      ├─ flows.js               # (route,phase) → { flowTitle, feature, apiSnippet, docsUrl } (KTD9, R14)
      └─ evidence.js            # structured evidence builder (KTD5)
```

Per-unit `**Files:**` are authoritative; the implementer may adjust layout.

---

## Implementation Units

### U1. Scaffold Netlify app + config

**Goal:** Deployable skeleton: static `public/`, functions dir, env wiring, deploys green to Netlify free tier.
**Requirements:** R1, R3, R10.
**Dependencies:** none.
**Files:** `netlify.toml`, `public/index.html` (placeholder), `package.json`, `.env.example`, `netlify/functions/health.js`.
**Approach:** `netlify.toml` sets `functions = "netlify/functions"` + SPA redirect. `health.js` returns 200 (proves functions run). Document `STEEL_API_KEY`, `GEMINI_API_KEY` in `.env.example`; real values set in Netlify UI env (KTD10/R10). No secrets in repo.
**Patterns to follow:** standard Netlify Functions layout.
**Test scenarios:**
- Happy: `netlify dev` serves `index.html`; `GET /.netlify/functions/health` → 200.
- Config: deploy succeeds; env vars referenced via `process.env`, absent from client bundle.
- `Test expectation: light` — smoke only; this is demoware scaffolding.
**Verification:** local dev serves site + health function; a Netlify deploy is reachable at a public URL.

### U2. Build the gauntlet target site (own routes)

**Goal:** Static, self-owned challenge pages: reCAPTCHA v2, Turnstile, (optional) hCaptcha, the own vision-grid,
plus the bot-wall and mobile-bug routes (R12).
**Requirements:** R5, R6, R11, R12, plus R8 failure realism.
**Dependencies:** U1.
**Files:** `public/gauntlet/recaptcha.html`, `turnstile.html`, `hcaptcha.html`, `vision-grid.html`, `bot-wall.html`, `mobile-bug.html`, `public/gauntlet/images/*`, shared `public/gauntlet/gauntlet.js`.
**Approach:** Provider pages embed real widgets with **official test keys** (KTD6) + a tiny client-side "success" state the agent can detect (e.g. a `#solved` element shown on token callback). Vision-grid renders a prompt ("Select all DOGS") + a 3×3 grid of `<img id="tile-0..8">` from the bundled set (KTD4, KTD8), with Submit + `#grid-result`; correct-tile set known via a small manifest. **bot-wall.html**: renders a fake "Access Denied — automation detected" page UNLESS the request carries stealth markers — i.e. the page shows the wall by default and a `#content` success node only when reached by a stealth/proxy session (simulated via a query flag the stealth-relaunch sets, since we own the page); honest because it's our own page modeling the real prevention-first story (R12d). **mobile-bug.html**: a selector/layout that only breaks at mobile viewport widths (e.g. the target button is `display:none` under a mobile media query, with an alternate path that works) (R12e). Inject **realistic** difficulty (3s delayed render on one route, a renamed CSS class on another) — never 404/throw (demo-design-review).
**Patterns to follow:** Google reCAPTCHA + Cloudflare Turnstile test-key docs.
**Test scenarios:**
- Happy: each route renders its widget/grid; success node appears when solved manually.
- Vision-grid: correct-tile manifest matches the rendered images; selecting the right tiles → `#grid-result=pass`.
- Edge: delayed-render route shows its element only after ~3s; renamed-class route still solvable by a robust selector.
- Bot-wall: default load shows the wall; the stealth-flagged load reveals `#content` (R12d).
- Mobile-bug: desktop viewport solvable normally; mobile viewport hides the primary control (R12e).
- `Covers R11.` No third-party site is contacted for automation; only our own pages + provider widgets we configured.
**Verification:** all routes load statically and reach a detectable success state when solved by hand at the appropriate viewport/flag.

### U3. Steel session lib + pre-warm function

**Goal:** Server-side helpers to create/connect/release Steel sessions, and a pre-warm endpoint.
**Requirements:** R4, R7, R10, KTD2, KTD3.
**Dependencies:** U1.
**Files:** `netlify/functions/lib/steel.js`, `netlify/functions/session-create.js`.
**Approach:** `steel.js` wraps `steel-sdk`: `createSession()` → `sessions.create({ solveCaptcha:true, stealthConfig })`, returns `{ id, debugUrl, sessionViewerUrl, websocketUrl }`; `connect(ws)` → `chromium.connectOverCDP`; `release(id)`. `session-create.js` is the pre-warm endpoint the UI calls on load (KTD3); returns only `{ sessionId, debugUrl }` to the client (never the ws/key, KTD2).
**Patterns to follow:** `product-background/steel-api-reference.md` connect snippet.
**Test scenarios:**
- Happy: create returns a session id + debugUrl; connectOverCDP yields a usable page; release tears down.
- Error: missing/invalid `STEEL_API_KEY` → 500 with a clear message, no key echoed.
- Integration: `solveCaptcha:true` flows through to `sessions.create`.
- `Covers R10.` Response body to client excludes `websocketUrl` and any key.
**Verification:** calling the pre-warm endpoint yields an embeddable `debugUrl` and a live session in the Steel dashboard.

### U4. Agent step engine (observe→decide→act, one cycle ≤10s)

**Goal:** The `POST /agent-step` function: one atomic agent cycle, returning structured evidence + outcome.
**Requirements:** R2, R4, R6, R8, R13, KTD1, KTD2, KTD5, KTD9.
**Dependencies:** U2, U3.
**Files:** `netlify/functions/agent-step.js`, `netlify/functions/lib/gemini.js`, `netlify/functions/lib/evidence.js`, `netlify/functions/lib/flows.js`.
**Approach:** Input `{ sessionId, route, state }`. Connect CDP (KTD2), take a screenshot + read relevant DOM, then **route-dispatch**: token routes (reCAPTCHA/Turnstile/hCaptcha) → wait for Steel's `solveCaptcha` to clear + detect the `#solved` node; **vision-grid route** → call `gemini.js` to classify each tile image vs the prompt, return the matching tile selectors, click them, submit (KTD4). `flows.js` maps `(route, phase)` → `{ flowTitle, feature }` (KTD9, R13) and every step returns it. `evidence.js` builds `{ screenshotThumb, action, targetSelector, verdict, outcome }` (KTD5). Each call does exactly one logical step and returns `{ flowTitle, feature, evidence, outcome, done }` so the UI loop (U5) advances and re-titles. Keep within 10s: one screenshot + one Gemini call + one action per invocation.
**Patterns to follow:** structured-output prompting for Gemini (per-tile boolean verdicts).
**Test scenarios:**
- Happy (vision-grid): given a known grid, Gemini verdicts select the correct tiles; clicks land; `done:true` on submit pass.
- Happy (token route): after solveCaptcha clears, `#solved` detected → `done:true`.
- Edge: a single step never exceeds the 10s budget (one screenshot + one model call + one action).
- Error/recovery: failed selector or wrong-tile verdict → evidence flags it, `done:false`, recovery action proposed (feeds U6).
- Integration: CDP screenshot → Gemini classify → DOM click is exercised end-to-end against a live session.
- Flow title: every step response includes a `{ flowTitle, feature }` matching the route/phase (R13).
- `Covers R6.` Vision-grid is solved by our agent, not Steel auto-solve.
**Verification:** repeated calls drive one route to a detectable success, each call returning one evidence card + its flow title.

### U5. Control UI + front-end loop orchestrator

**Goal:** The watchable UI: Run button, **flow-title banner**, live `debugUrl` iframe, evidence feed, route progress — drives the loop.
**Requirements:** R1, R2, R7, R13, KTD1, KTD5, KTD9.
**Dependencies:** U3, U4.
**Files:** `public/index.html`, `public/app.js`, `public/styles.css`.
**Approach:** On load, call `session-create` (pre-warm, KTD3) and embed `<iframe src="${debugUrl}?interactive=true&showControls=true">`. A prominent **flow-title banner** sits above the iframe and updates from each step's `{ flowTitle, feature }` (R13, KTD9) — e.g. `▶ Vision grid — Gemini vision + sessions.computer`. **Run** starts the orchestrator: for each route, repeatedly `POST /agent-step`, update the banner, and render each returned evidence card until `done`, then advance. Render structured evidence (thumbnail + selector + verdict + outcome) — not chat (KTD5). Show per-route status chips. Frontend owns the loop because functions can't (KTD1).
**Patterns to follow:** Steel embed snippet in `steel-api-reference.md`.
**Test scenarios:**
- Happy: clicking Run walks all routes autonomously; evidence cards stream; live iframe shows the browser acting.
- Edge: a `done:false` step loops without double-submitting; advancing routes resets per-route state.
- Integration: iframe `debugUrl` renders the same actions the evidence feed describes.
- Flow banner: banner text changes per route/phase and matches the engine's `{ flowTitle, feature }` (R13).
- `Covers R2.` No terminal or manual step between Run and completion.
**Verification:** from a fresh load, Run autonomously completes the gauntlet with live view + evidence + flow banner, no console errors.

### U6. Diagnose-from-evidence + recover arc

**Goal:** On a route failure, surface structured diagnosis and have the agent retry with an adjusted strategy.
**Requirements:** R8, and demo-design-review "lead with diagnosis."
**Dependencies:** U4, U5.
**Files:** `netlify/functions/agent-step.js` (extend), `public/app.js` (extend), `netlify/functions/lib/evidence.js` (extend).
**Approach:** When a step fails (wrong tiles, selector miss, delayed-render timeout, solveCaptcha non-clear), the engine returns a **diagnosis** (what was expected, what the screenshot/DOM showed, the inferred cause) and a **recovery action** (re-classify, wait-and-retry, alternate selector). UI freezes on the failure evidence card (optionally the `sessionViewerUrl` frame, demo-design-review ADD) then shows the recovery succeeding. Keep diagnosis as data, not narration (KTD5).
**Patterns to follow:** `product-background/demo-design-review.md` (diagnosis-first emphasis).
**Test scenarios:**
- Happy: an injected delayed-render failure → diagnosis card → wait-retry → pass.
- Edge: vision-grid wrong-tile → re-classify recovery selects correctly on retry.
- Error: a genuinely unrecoverable step ends the route as `failed` (honest), not an infinite loop.
- `Covers R8.` Evidence includes screenshot + failed state + recovery action taken.
**Verification:** at least one route visibly fails, is diagnosed from evidence, and recovers within a bounded retry count.

### U8. Bot-wall (stealth + proxy) and mobile-bug failure modes

**Goal:** Implement the two added failure beats: bot-detection wall recovered via stealth+proxy relaunch, and a mobile-only bug.
**Requirements:** R12, KTD10; reuses R8 diagnose+recover, R13 titles.
**Dependencies:** U4, U6.
**Files:** `netlify/functions/agent-step.js` (extend), `netlify/functions/lib/steel.js` (extend), `netlify/functions/lib/flows.js` (extend), `public/app.js` (extend).
**Approach:** **Bot-wall (d):** agent navigates `bot-wall.html`, observes the "Access Denied" wall, diagnoses "blocked as bot," then recovers by `release()`-ing and creating a **new session with `stealthConfig` + `useProxy`** (KTD10), re-navigating, and detecting `#content`. The new session yields a fresh `debugUrl`, so the UI re-embeds it and the flow title transitions (`▶ Bot wall → relaunching with stealthConfig + useProxy`). **Mobile-bug (e):** create a session with mobile `dimensions`; on `mobile-bug.html` the primary control is hidden at mobile width; agent diagnoses the missing selector and recovers via the alternate path. Both surface as honest, distinct failures for the fleet (U7).
**Patterns to follow:** `steel.js` create/release; `product-background/steel-differentiators-and-captcha.md` (prevention-first framing).
**Test scenarios:**
- Bot-wall happy: default nav → wall detected → diagnosis → stealth+proxy relaunch → `#content` reached.
- Bot-wall integration: a NEW session is created (old released); UI re-embeds the new `debugUrl` (KTD10).
- Mobile-bug: mobile `dimensions` session hits the hidden control → diagnosis → alternate-path recovery.
- Edge: stealth relaunch is bounded (one relaunch, not a loop); sessions released on both paths.
- `Covers R12.` Both modes implemented as own-site, honest recoveries.
**Verification:** bot-wall recovers only after a stealth+proxy relaunch (new debugUrl shown); mobile-bug recovers under a mobile viewport.

### U9. Self-explaining technical showcase layer

**Goal:** Make the site legible to a developer audience: what it is, which Steel capability each flow uses, how it's integrated.
**Requirements:** R14 (and surfaces R4/R13 to the viewer).
**Dependencies:** U5 (UI shell + banner), U4 (flow/feature metadata).
**Files:** `public/index.html` (header/intro + per-flow detail panel), `public/app.js` (bind snippets to active flow), `public/styles.css`, `netlify/functions/lib/flows.js` (extend each flow with `apiSnippet` + `docsUrl`).
**Approach:** **Header/intro**: one-screen explainer — what the site is ("a live tour of the Steel Sessions API"), the **architecture line** (Netlify static UI + Functions → Steel cloud browser via CDP → Gemini Flash agent), and a legend mapping flows → Steel features. **Per-flow detail panel** (beside the live iframe + banner): for the active flow, show the **real integration snippet** it is running — e.g. `sessions.create({ solveCaptcha:true })`, the `connectOverCDP(wss://connect.steel.dev?...)` line, or `sessions.create({ stealthConfig, useProxy })` for the bot-wall recover — plus a one-line "what this proves" and a link to the relevant Steel doc. Snippets come from `flows.js` (`apiSnippet`, `docsUrl`) so they stay in sync with R13 titles. Tone: technical, terse, accurate — no marketing fluff.
**Patterns to follow:** `product-background/steel-api-reference.md` (canonical method/param names).
**Test scenarios:**
- Happy: header states what-it-is + architecture + flow→feature legend on first paint.
- Per-flow: switching flows updates the detail panel to the matching `apiSnippet` + `docsUrl`.
- Accuracy: each snippet uses real Steel SDK method/param names (matches `steel-api-reference.md`).
- `Covers R14.` A cold visitor can identify the site purpose, the Steel feature per flow, and the integration.
- `Test expectation: light` — mostly static/content; assert legend↔flow mapping and snippet-per-flow binding.
**Verification:** a developer who has never seen the site can, within ~30s, state what it demos, the stack, and which Steel API each flow calls.

### U7. Parallel-fleet variance dashboard

**Goal:** Finale: N concurrent sessions, each on a different route, aggregated into a variance dashboard.
**Requirements:** R9, R12e (mobile agent in fleet), KTD7.
**Dependencies:** U4, U6, U8.
**Files:** `netlify/functions/fleet-run.js`, `public/app.js` (extend), `public/index.html` (dashboard section).
**Approach:** `fleet-run.js` launches N sessions (within Hobby concurrency limit, default N=3–5) each assigned a different route, runs them (reusing the step engine logic), and returns per-route `{ pass, fail, recovered }`. UI renders a compact dashboard (per-route bars/chips) — honest variance because routes differ (KTD7). Mind the 10s cap: fleet orchestration is also front-end-driven (kick off + poll), or each session's loop is driven the same way as U5.
**Patterns to follow:** U4/U5 loop reused per session.
**Test scenarios:**
- Happy: N routes run concurrently; dashboard shows differing per-route outcomes.
- Edge: stays within Steel free-tier concurrency (no over-provision); sessions released after.
- Integration: a recovered route shows as `recovered`, a clean route as `pass` — variance is real.
- `Covers R9.` Each agent targets a distinct route/failure.
**Verification:** dashboard populates with per-route variance; concurrency respects free-tier limit; sessions cleaned up.

---

## Scope Boundaries

**In:** one Netlify app (static UI + functions); own multi-route gauntlet (reCAPTCHA v2, Turnstile, optional
hCaptcha, own vision-grid); Gemini-vision per-tile solve; front-end-driven agent loop; live `debugUrl` iframe;
diagnose+recover arc; honest parallel-fleet variance dashboard; test/official keys.

### Deferred to Follow-Up Work
- hCaptcha as a fully-verified route (not on Steel's confirmed auto-solve list — ship as "attempt" or defer).
- Coordinate-based clicking via `sessions.computer` (DOM-id clicks are more reliable for the demo).
- Recorded-replay polish beyond a single freeze-frame.

### Deferred for later (from origin)
- Steel Profiles persistent-login showcase; mobile-mode emulation; building an actual composable Steel "Skill".
- Tie-in to the user's stockpredictors ML site — verbal talking point only.

### Outside this product's identity (ethics)
- Automating or CAPTCHA-bypassing any **third-party** site; real fraud-scoring defeat. Only our own
  pages + widgets we configured are automated.
- Self-hosted steel-browser Docker; any terminal-required or always-on long-running server beyond Netlify functions.

---

## Risks & Dependencies

- **R-risk1 — 10s function cap (highest).** A CDP screenshot + Gemini call + action must fit in 10s.
  *Mitigation:* one atomic step per call (KTD1), pre-warm session (KTD3), static target pages, lean prompts.
- **R-risk2 — Cold-start latency** (session init + function spin-up). *Mitigation:* pre-warm on load; keep pages static.
- **R-risk3 — solveCaptcha "not 100%"** (their FAQ). *Mitigation:* token routes have the diagnose+recover arc; the
  *climax is the vision-grid we control*, so the demo never hinges on a flaky auto-solve.
- **R-risk4 — Gemini free-tier rate limits** under a parallel fleet. *Mitigation:* small N (3–5); the gating
  showcase is the single-route walk-through, fleet is the finale flourish.
- **R-risk5 — Steel Hobby concurrency** (~5). *Mitigation:* cap fleet N at the limit; release sessions promptly.
- **Dependencies:** `steel-sdk` + Playwright (Node, server-side); Gemini API (free); Netlify Functions runtime;
  official reCAPTCHA v2 + Turnstile test keys.

---

## Sources & Research

- Steel API surface, connect snippet, free tier — `product-background/steel-api-reference.md` (verified vs docs.steel.dev).
- CAPTCHA types + real differentiators — `product-background/steel-differentiators-and-captcha.md`.
- Design review (centerpiece, risks, anti-junior, ADD/CUT) — `product-background/demo-design-review.md`.
- CEO/company focus — `product-background/steel-ceo-research.md`, `product-background/founder-journeys.md`.
- Netlify free-tier 10s sync cap / paid background functions — verified via Netlify docs + support forums (2026-06).
