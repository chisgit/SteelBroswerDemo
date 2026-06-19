# HANDOFF — Steel CAPTCHA Gauntlet (Arcade miniprojects)
Updated: 2026-06-18 (deployed to steeldemo.netlify.app) | Branch: `feat/steel-captcha-gauntlet` @ `1b67f05`

## Workspace
- Path: `c:\Users\User\SteelBroswerDemo`
- Live target: `matharcardewrecker.netlify.app` (own site, deployed)
- Demo deploy: Netlify free tier (Hobby)

## Run commands
```powershell
# Local dev (reads .env automatically)
npm run dev

# Deploy to Netlify (linked to steeldemo.netlify.app)
npx netlify deploy --prod
```

## Key files
| Role | File |
|------|------|
| Master plan | [docs/plans/2026-06-18-001-feat-steel-captcha-gauntlet-plan.md](docs/plans/2026-06-18-001-feat-steel-captcha-gauntlet-plan.md) |
| Mini-project index | [docs/plans/2026-06-18-002-feat-arcade-miniprojects-index-plan.md](docs/plans/2026-06-18-002-feat-arcade-miniprojects-index-plan.md) |
| MP9 plan (just completed) | [docs/plans/2026-06-18-011-feat-mp9-showcase-plan.md](docs/plans/2026-06-18-011-feat-mp9-showcase-plan.md) |
| Frontend UI | [public/app.js](public/app.js), [public/index.html](public/index.html), [public/styles.css](public/styles.css) |
| Flow catalog (backend data) | [netlify/functions/lib/flows.mjs](netlify/functions/lib/flows.mjs) |
| Agent step engine | [netlify/functions/agent-step.js](netlify/functions/agent-step.js) |
| Session lib | [netlify/functions/lib/steel.mjs](netlify/functions/lib/steel.mjs) |

## Active branches
| Branch | Plan doc | Status | Priority |
|--------|----------|--------|----------|
| `feat/steel-captcha-gauntlet` | Master 001 + MP index 002 | 🔄 ~80% built, MP9 UI shipped | 1 — hardening + verify |

## What's done (committed)
- **Commit `1b67f05`** (this session):
  - Set up `.env`: `STEEL_API_KEY`, `GEMINI_API_KEY`
  - Fixed hobby-tier blocker: `solveCaptcha: true` not available on free tier; changed `session-create.mjs` to `solveCaptcha: Boolean(body.solveCaptcha)` (default false)
  - Session creation now works on hobby tier
  - Deployed to `https://steeldemo.netlify.app` (live, linked in Netlify UI)
  - Set `GAUNTLET_BASE_URL=https://steeldemo.netlify.app` in `.env`
  - App loads at localhost:8888, session pool functional, Steel browser can reach live target pages

## What's left (next session)
1. **Test full gauntlet** — all 6 routes end-to-end
   - reCAPTCHA, Turnstile (skip/attempt token solving)
   - hCaptcha (delayed render recovery)
   - Vision grid (Gemini classify + click)
   - Bot-wall (stealth relaunch)
   - Mobile-bug (viewport recovery)
2. **Timing audit** — confirm each step <10s (Netlify sync cap)
3. **Hardening** — verify reliability under load, capture errors

## Locked decisions
- Front-end-drives-loop model (KTD1 master 001) — each `/agent-step` is one atomic ≤10s cycle
- Vision-grid solved by DOM-id clicks, not coordinates (KTD2 master 001) — avoids drift
- `stealthConfig` is verified-free recover path; `useProxy` is conditional (KTD3 MP7)
- Netlify functions, no self-hosted server (R1 ethics boundary)
- Own site + test keys only — no third-party site automation (R11 ethics boundary)

## Open risks (must resolve before demo day)
| Risk | Impact | Mitigation |
|------|--------|-----------|
| 10s sync cap | Full gauntlet fails mid-route if one step overshoots | Timing probe on `agent-step.js` — measure real screenshot + Gemini call + action |
| `useProxy` flakiness | Bot-wall recover claims a proxy beat that doesn't exist | Verify `sessions.create({useProxy:true})` on free tier; if no-op, drop and recover with `stealthConfig` alone |
| Bot-wall gate signal | If MP1 U4's wall is just query-flag theater, recover is a lie | Cross-verify: wall must gate on a signal Steel's `stealthConfig` *actually* flips (e.g. `navigator.webdriver`) |
| Import `.js` vs `.mjs` | Runtime break in Netlify function | Test under `netlify dev` / `netlify functions:invoke` |
| Gemini free-tier rate limit | Fleet route times out under 3–5 parallel agents | Confirm headroom; throttle/stagger if needed (MP8 gotcha #4) |

## Workflow rules
- **Commit strategy:** one commit per mini-project or feature cluster; use conventional style with R/U IDs
- **Branch:** stay on `feat/steel-captcha-gauntlet` (or use worktree for parallel)
- **Testing:** no unit test suite yet (demoware); verification is manual + rehearsal
- **Deploy:** Netlify auto-deploys on `main`; this branch pushes to a preview once ready
- **Plan docs:** do NOT edit during execution; progress lives in git + HANDOFF.md

## Next step
1. Start dev server: `npm run dev`
2. Navigate to localhost:8888
3. Run each demo route (Simple impact, Full CAPTCHA gauntlet, No-CAPTCHA smoke route)
4. Verify timing + error handling under load
