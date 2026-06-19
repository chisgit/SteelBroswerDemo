# HANDOFF — Steel Demo Hub
Updated: 2026-06-18 | Branch: `feat/persistent-session-math-arcade` @ `0e17ee0`

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
| Branch | Plan doc | Status | Priority |
|--------|----------|--------|----------|
| `feat/persistent-session-math-arcade` | [docs/plans/2026-06-18-012-feat-persistent-session-math-arcade-plan.md](docs/plans/2026-06-18-012-feat-persistent-session-math-arcade-plan.md) | ✅ shipped — tested, pushed, ready to PR | 1 — merge to main |
| `feat/stockpredictor-demo` | [docs/plans/2026-06-18-013-feat-stockpredictor-demo-plan.md](docs/plans/2026-06-18-013-feat-stockpredictor-demo-plan.md) | 🔄 parallel agent in progress | 2 — in flight |

## What's done (this session)
- **Math Arcade persistent session demo** — 5-phase lifecycle working end-to-end:
  - `start`: navigate matharcadewrecker.netlify.app, `app.loadGame('match')`, flip 4 cards, capture score
  - `detach`: `browser.close()` only — session alive in Steel cloud, JS heap preserved
  - `other-work`: serverless `fetch()` to Wikipedia Card_game (no Steel session), 3s pause
  - `resume`: `connectOverCDP(same sessionId)` → score matches → heap intact ✓
  - `finish`: play remaining cards, `sessions.release()`
- **429 auto-recovery**: `createSession` catches 429, calls `sessions.releaseAll()`, retries once
- **Phase-labeled CDP logs**: `connect(ws, id, label)` — each phase logs `chromium.connectOverCDP (start/detach/resume)`
- **`other-work` isolated**: no Steel session, no CDP — `agent (no Steel session)` log entries visibly distinct
- **Local test**: `http://localhost:8888/gauntlet-ui.html?recipe=persistent-session`

## Workflow rules
- Commit per feature cluster; conventional style
- Verification: manual browser test at local dev URL above
- Deploy: `npx netlify deploy --prod` from project root
- Hobby plan: 1 concurrent session limit — never create 2nd session while game session is alive
- Linter reverts `agent-step.mjs` to branch HEAD — edit + commit fast, don't leave edits unstaged

## Locked decisions
- Front-end-drives-loop: each `/agent-step` is one atomic ≤10s cycle; UI loops until `done:true`
- `popLog()` transport: logger buffer fills per step, cleared by `popLog()` in each handler
- Vision: NVIDIA MiniMax-M3 via `lib/nvidia.mjs` — faster + free tier reliable
- `solveCaptcha` routes skip on hobby tier (`isHobbyTier = true` in `tokenRoute`)
- Own site only — no third-party automation
- `other-work` uses serverless fetch only — hobby plan 1-session limit means no concurrent Steel session
- `conn._closed = true` before any explicit `browser.close()` in phase handlers — prevents double-close with `finally`
- `sessions.releaseAll()` on 429 in `createSession` — auto-clears leaked sessions, retries once

## Git history note — secret scrub
- GEMINI_API_KEY + STEEL_API_KEY scrubbed from history via `git-filter-repo` on 2026-06-18
- All commit hashes changed after scrub; branches force-pushed
- Do not push old SHAs
