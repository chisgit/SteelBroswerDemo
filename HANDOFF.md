# HANDOFF — Steel CAPTCHA Gauntlet (Arcade miniprojects)
Updated: 2026-06-18 | Branch: `feat/steel-captcha-gauntlet` @ `88dfd27`

## Workspace
- Path: `c:\Users\User\SteelBroswerDemo`
- Live target: `matharcardewrecker.netlify.app` (own site, deployed)
- Demo deploy: Netlify free tier (Hobby)

## Run commands
```powershell
# Local dev
netlify dev

# Run tests (if added)
npm test

# Deploy to Netlify
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

## What's done (committed this session)
- **MP9 U1 + U2** — header/legend + per-flow snippet panel (R14 self-explaining showcase)
  - Legend renders from FLOWS catalog (no hardcoding, no drift)
  - Architecture line: Netlify UI → Functions → Steel CDP → Gemini
  - Per-flow snippet panel shows real `sessions.create` / `stealthConfig` calls + docs link
  - Commit: `88dfd27`

## What's left (unverified, built but not yet hardened)
1. **Verify + harden MP1–MP8** (all code exists, tests + timing probes pending)
   - One agent step fits **10s** Netlify sync cap (001 R-risk1 — dominant constraint)
   - `useProxy` free-tier honesty (gotcha #1) — verify `relaunchWithStealth` doesn't no-op
   - Bot-wall honesty (gotcha #2) — verify MP1 U4's wall gates on a Steel-flipped signal
   - Import mismatch: `agent-step.js` imports `.js` but files are `.mjs` — verify Netlify handles it
2. **MP2 CLI generation** (printing-press workflow, deferred to impl — not blocking demo)
3. **Run live rehearsal** — full gauntlet (pre-warm → all 6 routes → fleet) with timing/error capture

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

## Next prompt (for `/startflow`)
```
Hardening pass: verify + fix the 4 open risks (10s cap, useProxy honesty, bot-wall gate, .mjs imports).
Timing probe on agent-step.js first (dominant risk). Run live rehearsal after fixes.
If MP2 printing-press CLI is deferred, note it as follow-up work.
```
