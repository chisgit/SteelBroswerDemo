# HANDOFF — Steel Demo Hub
Updated: 2026-06-19 | Branch: `fix/review-issues` (open PR #4)

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
| Session resume fn | [netlify/functions/session-resume.mjs](netlify/functions/session-resume.mjs) |
| API call logger | [netlify/functions/lib/logger.mjs](netlify/functions/lib/logger.mjs) |
| NVIDIA classifier | [netlify/functions/lib/nvidia.mjs](netlify/functions/lib/nvidia.mjs) |
| Gemini classifier | [netlify/functions/lib/gemini.mjs](netlify/functions/lib/gemini.mjs) |
| Steel tier test | [test_steel_tier.mjs](test_steel_tier.mjs) |

## Active branches
| Branch | Status | Priority |
|--------|--------|----------|
| `fix/review-issues` | 🔄 code review fixes (PR #4) | 1 — merge after review |
| `main` | ✅ all demos live | — |

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

## What's next (PR #4)
1. Code review `fix/review-issues` (9 commits fixing P0/P1/P2 findings)
2. Merge PR #4 to `main`
3. Deploy to Netlify production — verify Stock Predictor + Math Arcade demos work live
4. Manual smoke test: Full Gauntlet timing + evidence cards + fleet variance

## Workflow rules
- Commit per feature cluster; conventional style
- `main` is stable demo — feature work on `feat/<name>` or `fix/<name>` branches
- Verification: manual browser test (no unit test suite — demoware)
- Deploy: `npx netlify deploy --prod` from project root
- Hobby plan: 1 concurrent session limit — never create 2nd session while game session is alive
- Math-arcade phases manage their own CDP lifecycle (avoid wasteful per-phase reconnects)
- `catch(()=>null)` on critical evaluate calls — `catch(()=>0)` masks failures as success
- `sessions.releaseAll()` on 429 in `createSession` — auto-clears leaked sessions, retries once
- Test cleanup: always release created sessions in finally block

## Locked decisions
- Front-end-drives-loop: each `/agent-step` is one atomic ≤10s cycle; UI loops until `done:true`
- `popLog()` transport: logger buffer fills per step, cleared by `popLog()` in each handler
- Vision: NVIDIA MiniMax-M3 via `lib/nvidia.mjs` — faster + free tier reliable
- `solveCaptcha` routes skip on hobby tier (`isHobbyTier = true` in `tokenRoute`)
- Own site only — no third-party automation
- `other-work` uses serverless fetch only — hobby plan 1-session limit means no concurrent Steel session
- **Session-resume does NOT return websocketUrl** — client never sees `STEEL_API_KEY` (P0 security fix)
- **Math-arcade phases manage own CDP lifecycle** — skip shared `connect()` for detach/other-work/resume/finish
- **Evaluate failures must be distinguishable** — use `catch(()=>null)`, not `catch(()=>0)`, on critical reads

## Git history note — secret scrub
- GEMINI_API_KEY + STEEL_API_KEY scrubbed from history via `git-filter-repo` on 2026-06-18
- All commit hashes changed after scrub; branches force-pushed
- Do not push old SHAs
