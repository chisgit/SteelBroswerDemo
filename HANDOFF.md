# HANDOFF — Steel Demo Hub
Updated: 2026-06-19 | Branch: `main` (merged)

## Workspace
- Path: `c:\Users\User\SteelBroswerDemo`
- Live: https://steeldemo.netlify.app (Netlify free tier, hobby)

## Run commands
```powershell
# Local dev
npx netlify dev --port 8888

# Deploy to production
npx netlify deploy --prod
```

## Key files
| Role | File |
|------|------|
| Hub landing | [public/index.html](public/index.html) |
| Gauntlet UI | [public/gauntlet-ui.html](public/gauntlet-ui.html) |
| Stock Predictor UI | [public/stock-predictor.html](public/stock-predictor.html) |
| Frontend logic | [public/app.js](public/app.js) |
| Styles | [public/styles.css](public/styles.css) |
| Flow catalog | [netlify/functions/lib/flows.mjs](netlify/functions/lib/flows.mjs) |
| Agent step engine | [netlify/functions/agent-step.mjs](netlify/functions/agent-step.mjs) |
| Steel SDK wrapper | [netlify/functions/lib/steel.mjs](netlify/functions/lib/steel.mjs) |
| Session create fn | [netlify/functions/session-create.mjs](netlify/functions/session-create.mjs) |
| API call logger | [netlify/functions/lib/logger.mjs](netlify/functions/lib/logger.mjs) |
| NVIDIA classifier | [netlify/functions/lib/nvidia.mjs](netlify/functions/lib/nvidia.mjs) |
| Gemini classifier | [netlify/functions/lib/gemini.mjs](netlify/functions/lib/gemini.mjs) |

## Active branches
All feature work merged into `main`. No active feature branches.

## What's done
- Full gauntlet: 6 routes implemented (hCaptcha, vision-grid, bot-wall, mobile-bug, recaptcha/turnstile skipped on hobby)
- Vision classifier: NVIDIA MiniMax-M3 (faster, reliable free tier) via `lib/nvidia.mjs`
- Live Steel SDK console: every `sessions.create`, `chromium.connectOverCDP`, `sessions.release` call streams to UI in real time
- Integration snippet panel: real `sessions.create({...})` code from `flows.mjs` updates per active route
- Deployed live: https://steeldemo.netlify.app
- Git history scrubbed of committed API keys via `git-filter-repo`
- Smoke test: Simple Impact + Vision Grid both pass
- **Math Arcade persistent session demo** — 5-phase lifecycle: start/detach/other-work/resume/finish
  - `connectOverCDP(same sessionId)` on resume — JS heap preserved across detach
  - 429 auto-recovery: `releaseAll()` + retry
  - Phase-labeled CDP logs per connect call
- **Stock Predictor demo** — sessions.create + live API call streaming, side-by-side comparison
- **Demo hub tile** added for Stock Predictor on landing page

## What's next
1. Deploy merged `main` to Netlify production
2. Smoke test Stock Predictor demo end-to-end on live site
3. Demo rehearsal — Full Gauntlet timing + evidence cards + fleet variance

## Workflow rules
- Commit per feature cluster; conventional style
- `main` is stable demo — feature work on `feat/<name>` branches
- Verification: manual browser test (no unit test suite — demoware)
- Deploy: `npx netlify deploy --prod` from project root
- Hobby plan: 1 concurrent session limit — never create 2nd session while game session is alive
- `conn._closed = true` before any explicit `browser.close()` — prevents double-close with `finally`
- `sessions.releaseAll()` on 429 in `createSession` — auto-clears leaked sessions, retries once

## Locked decisions
- Front-end-drives-loop: each `/agent-step` is one atomic ≤10s cycle; UI loops until `done:true`
- `popLog()` transport: logger buffer fills per step, cleared by `popLog()` in each handler
- Vision: NVIDIA MiniMax-M3 via `lib/nvidia.mjs` — faster + free tier reliable
- `solveCaptcha` routes skip on hobby tier (`isHobbyTier = true` in `tokenRoute`)
- Own site only — no third-party automation
- `other-work` uses serverless fetch only — hobby plan 1-session limit means no concurrent Steel session

## Git history note — secret scrub
- GEMINI_API_KEY + STEEL_API_KEY scrubbed from history via `git-filter-repo` on 2026-06-18
- All commit hashes changed after scrub; branches force-pushed
- Do not push old SHAs
