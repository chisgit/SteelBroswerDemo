# HANDOFF — Steel CAPTCHA Gauntlet (Arcade miniprojects)
Updated: 2026-06-18 (env setup + hobby-tier fixes) | Branch: `feat/steel-captcha-gauntlet` @ (pending commit)

## Workspace
- Path: `c:\Users\User\SteelBroswerDemo`
- Live target: `matharcardewrecker.netlify.app` (own site, deployed)
- Demo deploy: Netlify free tier (Hobby)

## Run commands
```powershell
# Set env vars (or use .env file)
$env:STEEL_API_KEY='STEEL_API_KEY_REMOVED'
$env:GEMINI_API_KEY='GEMINI_API_KEY_REMOVED'

# Local dev (with tunnel for cloud browser access)
npm run dev

# Tunnel for external Steel access
npx localtunnel --port 8888

# Deploy to Netlify (requires auth)
netlify login
netlify deploy --prod
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

## What's done (committed and verified)
- **Previous session:** MP9 U1 + U2 — header/legend + per-flow snippet panel (R14 showcase). Commit: `88dfd27`
- **This session (2026-06-18):**
  - Set up env vars: `STEEL_API_KEY`, `GEMINI_API_KEY` in `.env`
  - Fixed hobby-tier constraint: `solveCaptcha` not available; changed `session-create.mjs` to default `solveCaptcha: false`
  - Session creation now succeeds on free tier
  - App loads at localhost:8888; session pool functional
  - **Next blocker:** Deploy to Netlify with real URL (not local tunnel) so Steel cloud browser can reach target pages

## What's left (critical path to demo-ready)
1. **Deploy to Netlify** — authenticate, set remote URL, push branch
   - Once deployed: set `GAUNTLET_BASE_URL` to live deploy URL (not local tunnel)
   - Steel browser can then reach `/gauntlet/*.html` pages live
2. **Verify full gauntlet flow** — run all 6 routes end-to-end with timing/error capture
   - reCAPTCHA, Turnstile (need `solveCaptcha: true` or skip token solving)
   - hCaptcha (delayed render + recover)
   - Vision grid (Gemini classify + click)
   - Bot-wall (stealth relaunch)
   - Mobile-bug (viewport recovery)
3. **Timing audit** — confirm each step <10s (Netlify sync cap dominates)

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
1. Authenticate to Netlify: `netlify login`
2. Deploy branch: `netlify deploy --prod`
3. Set live URL in `.env`: `GAUNTLET_BASE_URL=<deploy-url>`
4. Restart server: `npm run dev`
5. Test full gauntlet (all 6 routes)
