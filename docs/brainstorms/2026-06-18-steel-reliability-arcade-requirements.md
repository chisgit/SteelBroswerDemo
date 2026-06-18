# Reliability Arcade — Steel.dev Interview Demo

**Date:** 2026-06-18
**Status:** Requirements — SUPERSEDED centerpiece (see Pivot below); planned 2026-06-18
**Author:** brainstorm w/ user (clpatel@gmail.com)

> **Pivot (post-research, 2026-06-18):** Research into Steel's API + CEO Hussien's focus, plus a
> Sonnet design review, shifted the centerpiece. The demo is now a **multi-route CAPTCHA Gauntlet**:
> real provider widgets (reCAPTCHA v2 + Cloudflare Turnstile, using official always-pass TEST keys)
> that Steel's `solveCaptcha` walks through, climaxing in **our own vision image-grid** (bikes / trains /
> traffic-lights / dogs) solved per-tile by a **Gemini-vision agent** — the honest "my agent can see and
> act" flex that Steel does NOT auto-do. The reliability/diagnose-from-evidence arc + honest parallel-fleet
> variance dashboard + live `debugUrl` viewer iframe remain as the framing/proof layer. CAPTCHA auto-solve
> is demoted from climax to "table stakes" routes; the vision-grid is the climax. Profiles re-login flourish
> CUT (verbal answer only). Full intel in `product-background/` (steel-api-reference, steel-differentiators-and-captcha,
> demo-design-review, steel-ceo-research, founder-journeys).

## What we're building

A small, **fully autonomous, UI-driven web app** that demonstrates fluency building a *product* on
Steel.dev's hosted browser API — built specifically to appeal to CEO Hussien Hussien's current focus:
**"embarrassingly reliable" agents that diagnose failed runs and recover, at scale.**

A user opens the app, clicks **Run**, and watches an LLM agent autonomously drive a real Steel cloud
browser against a small game/task site we own. The site is **broken on purpose** in escalating ways.
The agent attempts the task, **fails**, **diagnoses the failure from session evidence**, **recovers**,
and the finale runs **several agents in parallel** with a reliability dashboard (pass / fail / recovered).

It is a blend: **Reliability Lab** (the substance — debug + recover + scale) wearing an **Arcade** skin
(a fun, watchable game/task so the demo is enjoyable, not a dry test log).

## Why this, for this CEO

(Full research: `product-background/steel-ceo-research.md`, `product-background/founder-journeys.md`)

- Hussien's signature phrase: **"embarrassingly reliable headless browsers."** The demo's spine is reliability.
- Steel's newest launch — **Steel Skills** — centers on `steel-session-debugging` ("explain a failed run
  from evidence") and `steel-reliability` ("fix the blocks"). The demo enacts exactly this loop.
- **Steel Wire** = their prototype running **100 concurrent sessions**. The parallel-fleet finale nods to scale.
- Hussien's ML/prediction past (March Madness ML post, ICAIF 2020 paper) → optional conversation hook to
  the user's own ML site (stockpredictors), not a build dependency.

## Users

- **Primary:** Hussien Hussien (CEO) + Steel team, watching a live interview demo.
- **Secondary:** the user, who can re-run it autonomously from the UI without a terminal.

## Core requirements

1. **One Netlify deployment** hosts everything: static UI + serverless function(s) running the agent.
   Hard constraint: **must run on Netlify**, **fully free**, **no self-hosting**, **autonomous via UI**.
2. **Target site** — a small game/task app we own (arcade flavor). Self-contained; no third-party site is
   automated (ethics line: no bypassing others' TOS/CAPTCHA — any CAPTCHA/login here is our own).
3. **Agent brain** = **Google Gemini Flash** free tier. Agent observes the page (DOM / accessibility tree)
   and chooses actions autonomously toward a plain-English goal.
4. **Steel hosted cloud** (free tier: 100 browser hours, no CC). Playwright connects via
   `wss://connect.steel.dev?apiKey=...&sessionId=...`; sessions created with `steel-sdk`.
5. **Escalating failure modes** the agent must diagnose + recover from, staged on our own site:
   (a) flaky / slow-loading element, (b) a changed/unexpected selector, (c) a legitimate CAPTCHA on our site,
   (d) **bot-detection wall** — our site shows a fake "Access Denied / automation detected" page; agent
   diagnoses "blocked as bot" → recovers by relaunching the session with `stealthConfig` + `useProxy`,
   (e) **mobile-only layout bug** — one fleet agent runs a mobile `dimensions` viewport and hits a
   layout/selector that only breaks on mobile; makes the parallel-fleet variance honest (different
   failure per agent, not the same one N times).
6. **Diagnose-from-evidence step:** on failure, the agent inspects session evidence (DOM state, logs,
   screenshot/recording) and produces a human-readable explanation of *why* it failed — mirrors
   `steel-session-debugging`.
7. **Recover step:** agent retries with an adjusted strategy and continues — mirrors `steel-reliability`.
8. **Live visibility:** UI surfaces the agent's step-by-step actions and (where feasible) the live/recorded
   **Steel Session Viewer** so the CEO can watch the browser work.
9. **Parallel-fleet finale:** run N agents concurrently and show a **reliability dashboard**
   (attempts, passes, failures, recovered, success rate). Nods to Steel Wire's concurrency.
10. **Secrets** (Steel API key, Gemini key) live in **Netlify env vars**, never shipped to the client.

## Steel features showcased

**Core (built, on-screen):**
Sessions API · Playwright-over-CDP connect · live `debugUrl` viewer iframe · recorded `sessionViewerUrl`
replay (freeze-frame on the failure frame) · `solveCaptcha` (own-site, table-stakes routes) · vision-grid
climax via Gemini vision + `sessions.computer({action})` click/drag · concurrency / parallel sessions
(variance dashboard).

**Expanded levers folded into the diagnose→recover arc (new):**
- **`stealthConfig` + `useProxy`** — surfaced as failure-mode (d): bot wall → diagnose → relaunch with
  stealth + proxy. Turns Steel's #1 differentiator (prevention-first anti-detection) into a recover beat,
  not a flag dump.
- **`dimensions` mobile emulation** — failure-mode (e): one fleet agent on mobile viewport, mobile-only bug.
- **recorded replay** — `sessionViewerUrl` as the "explain from evidence" proof, distinct from live `debugUrl`.

**Optional separate beats (build only if time):**
- **`steel.scrape()` + structured extract (JSON-schema)** — pre-game "recon" step: agent scrapes target site
  into typed level/task JSON before driving. Shows content tools + typed output.
- **`sessions.computer({action})` as Steel-native vision** — already powering the grid climax; note it is
  Steel's own computer-use primitive, not just Gemini glue.

**Verbal-only (answer "what else?", no build):**
Profiles `profileId` persistent auth · MCP `createSdkMcpServer` (Steel-as-agent-tools / agent-native) ·
x402 pay-as-you-go ($0.10/hr USDC, no key) · `isSelenium` WebDriver endpoint · model-agnostic
(Gemini Flash here, OpenAI/Anthropic/Mistral swap-in) · sub-1s session startup · CAPTCHA bridge architecture.

## Success criteria

- From a fresh browser, opening the Netlify URL and clicking **Run** executes the full
  attempt → fail → diagnose → recover → parallel-finale story with **no terminal and no manual steps**.
- Runs entirely on **free tiers** (Netlify + Steel Hobby + Gemini free).
- A viewer with no context understands, within ~2 minutes, that the agent *failed, explained why, and recovered* —
  and that it scaled to several concurrent agents.
- At least one moment visibly shows a **real Steel cloud browser** doing the work (Session Viewer).

## Scope boundaries

**In:** one Netlify app (UI + functions); one owned game/task target site; Gemini-driven agent loop; three
staged failures; diagnose + recover; parallel fleet + dashboard; Session Viewer surfacing.

**Deferred / stretch:** Steel Profiles persistent-login showcase; mobile-mode emulation; building an actual
composable "Steel Skill"; tying in the user's stockpredictors ML site (keep as talking point only).

**Out (identity / ethics):** automating or CAPTCHA-bypassing any third-party site; self-hosted steel-browser
Docker; any flow requiring a terminal or a long-running always-on server beyond Netlify functions.

## Dependencies / assumptions

- Steel hosted cloud free tier (100 browser hours) is sufficient for demo + rehearsal. *(verified: docs quickstart)*
- `steel-sdk` (Node) + Playwright connect over CDP works from a Netlify function. *(SDK + ws endpoint verified;
  running inside a Netlify function not yet tested — validate early in ce-plan)*
- Gemini Flash free-tier rate limits tolerate a multi-step live agent loop + a small parallel fleet.
  *(assumption — confirm limits / fleet size during planning)*
- A free LLM is reliable enough to drive the agent deterministically enough for a live demo.
  *(assumption — may need tight prompting / constrained action space)*

## Gotchas / risks in the expanded feature set (read before ce-plan)

Ordered by how likely they bite during a live demo.

1. **`stealthConfig` + `useProxy` recover beat may not be free-tier honest.** Residential proxies are
   typically a paid/premium feature, not Hobby-tier. If `useProxy` errors or no-ops on free tier, the
   "recover" silently does nothing and the beat is a lie on stage. **Verify free-tier proxy access early.**
   Fallback: recover with `stealthConfig` alone (still real), drop `useProxy` to a verbal point.

2. **Self-defeating recovery — the bot wall is OUR site.** We control the "Access Denied" page, so
   relaunching with stealth doesn't *actually* defeat anything — our page must be coded to let the
   stealthed session through (e.g., gate on a header/fingerprint signal Steel changes). Risk: the demo
   implies Steel "beat" detection when really our own page waved it through. Frame honestly as
   "simulated bot wall" or it's a claim Hussien punctures. Same ethics line as the CAPTCHA (own-site only).

3. **`dimensions` mobile failure is a fabricated bug.** A mobile-only layout break only exists because we
   coded it. Fine for a demo, but the "honest variance" framing requires the bug be a *plausible real*
   mobile failure (e.g., a selector that genuinely differs responsive vs desktop), not an obviously
   planted `if (mobile) throw`. Otherwise variance dashboard looks staged.

4. **More create() variants = more session-create latency + cost across the fleet.** Each distinct config
   (stealth, proxy, mobile) is a separate session. Parallel fleet × multiple configs can hit Hobby
   concurrency cap (~5) and burn browser-hours faster in rehearsal. Budget the 100hr free tier; cap fleet
   size accounting for rehearsal runs.

5. **`solveCaptcha` "not guaranteed 100%" (their own FAQ).** On the always-pass TEST keys it should be
   deterministic, but if a route ever uses a real widget, auto-solve can flake live. Keep table-stakes
   routes on official always-pass test keys only; never a real third-party CAPTCHA (TOS + flake).

6. **`steel.scrape()` recon adds a code path with little story payoff.** Typed-extract is nice but doesn't
   serve the reliability spine. If built, it competes for the ~2-min attention budget (success criterion).
   Defer unless the rest is solid — it's the easiest cut.

7. **`sessions.computer({action})` coordinate drift on the vision grid.** Gemini returns tile coords over a
   screenshot; if viewport/devicePixelRatio differs from the screenshot basis, clicks miss. This is the
   climax — most fragile, most visible if it fails. Pin viewport `dimensions`, map coords carefully,
   and have a deterministic fallback (pre-known tile grid) so the finale never hard-fails on stage.

8. **Netlify function timeout vs. multi-config fleet** (already flagged below for the base loop) — gets
   *worse* with stealth/proxy relaunch, which means a second session-create mid-run. The diagnose→relaunch
   beat may blow the ~10s sync / ~26s background window. The front-end-drives-loop (one step per call)
   architecture matters more now, not less.

9. **Mode (d) and (e) both depend on session re-create, not just retry.** Failure modes (a)/(b) recover
   in-session (retry/adjust selector). (d) and (e) require tearing down and creating a *new* session with
   different opts — different recovery shape, different code path. Don't model all five failures as one
   uniform retry loop.

## Outstanding questions (for ce-plan)

- **Loop execution under Netlify timeouts** (~10s sync / ~26s background): front-end-drives-loop
  (one step per function call) vs single background function. *Deliberately deferred to planning.*
- What is the concrete game/task on the target site (what "winning" looks like)?
- Fleet size for the finale (3? 5?) within Gemini + Steel free limits.
- DOM-only vs DOM + screenshot for the diagnose step (vision may strengthen "explain from evidence").
- Whether to add the Profiles persistent-login stretch if time remains.
- **Does Hobby/free tier actually allow `useProxy`?** (gotcha #1 — verify before promising the proxy beat).
- Which create() configs the fleet runs (stealth, mobile, baseline) vs concurrency cap (~5) + browser-hour budget.
- For mode (d): what signal does our "bot wall" page gate on so a stealthed relaunch legitimately passes (gotcha #2)?
