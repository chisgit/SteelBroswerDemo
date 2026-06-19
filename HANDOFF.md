# HANDOFF — Steel Demo Hub
Updated: 2026-06-18 | Branch: `feat/steel-captcha-gauntlet` @ `9eb735a` (HEAD: `fdfe246` on feature branch, merged)

## Workspace
- Path: `c:\Users\User\SteelBroswerDemo`
- Live: https://steeldemo.netlify.app (Netlify free tier, hobby)

## Run commands
```powershell
# Local dev
npm run dev

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

## Active branches
| Branch | Plan doc | Status | Priority |
|--------|----------|--------|----------|
| `feat/steel-captcha-gauntlet` | [docs/plans/2026-06-18-001-feat-steel-captcha-gauntlet-plan.md](docs/plans/2026-06-18-001-feat-steel-captcha-gauntlet-plan.md) | 🔄 demo restructure merged (PR #1) | 1 — smoke test + demo rehearsal |

## What's done
- Full gauntlet: 6 routes implemented (hCaptcha, vision-grid, bot-wall, mobile-bug, recaptcha/turnstile skipped on hobby)
- Vision classifier: NVIDIA MiniMax-M3 (faster, reliable free tier) via `lib/nvidia.mjs`
- Live Steel SDK console: every `sessions.create`, `chromium.connectOverCDP`, `sessions.release` call streams to UI in real time with call-count badge
- Integration snippet panel: real `sessions.create({...})` code from `flows.mjs` updates per active route
- `popLog()` wired into `agent-step.mjs` + `session-create.mjs` — SDK calls reach client
- Hub (`index.html`) sharpened: actual Steel API methods in hero copy + card descriptions
- Deployed live: https://steeldemo.netlify.app

## What's next
1. **Smoke test live** — open https://steeldemo.netlify.app → run Simple Impact + Vision Only → verify API console shows real SDK calls streaming in
2. **Demo rehearsal** — run Full Gauntlet end to end; check timing, evidence cards, fleet variance
3. **Merge to main** when ready for final demo URL (currently working on `feat/steel-captcha-gauntlet`)
4. **PR #1 merged** (squash-merge, branch deleted) — covered: API console, NVIDIA classifier, logger infra, SDK cleanup, skill symlink restore

## Workflow rules
- Commit per feature cluster; conventional style
- Stay on `feat/steel-captcha-gauntlet`
- Verification: manual browser test (no unit test suite — demoware)
- Deploy: `npx netlify deploy --prod` from project root

## Skill file management
- `.claude/skills/steel-developer` is a **symlink** → `.agents/skills/steel-developer/`
- Both paths point to the same skill files under `.agents/`
- Committing the symlink instead of the directory keeps git tracking clean
- The symlink was dropped in commit `604c160` (skill move to `.agents/`) and restored in the merged PR #1 range (`b76beb1`)
- The `.claude/` dir on disk may show as untracked after filter-repo; `git add .claude/skills/steel-developer` re-stages the symlink

## Git history note — secret scrub
- A GCP API key (`GEMINI_API_KEY`) and Steel API key (`STEEL_API_KEY`) were committed in old commits (HANDOFF.md, test_steel_session.py)
- Run `git-filter-repo` to scrub them: `python3 git-filter-repo --force --replace-text <replacement-file>` using `==>` separator for each secret → replacement pair
- After filter-repo: `origin` remote is removed; re-add with `git remote add origin <url>`
- All branches must be force-pushed after the scrub; every commit hash changes
- The scrub was done on 2026-06-18; both `feat/steel-captcha-gauntlet` and `feat/demo-restructure-api-console` were force-pushed
- **Do not push the old SHAs** — the secrets are in those commits

## Locked decisions
- Front-end-drives-loop (KTD1): each `/agent-step` is one atomic ≤10s cycle; UI loops until done
- `popLog()` transport: logger buffer fills per step, cleared by `popLog()` in each handler
- `relaunchWithProxy` (renamed from `relaunchWithStealth` in `steel.mjs`) — import name must match
- Vision: NVIDIA MiniMax-M3 via `lib/nvidia.mjs` (not Gemini) — faster + free tier reliable
- `solveCaptcha` routes hardcoded to skip on hobby tier (`isHobbyTier = true` in `tokenRoute`)
- Own site only — no third-party automation (R11 ethics boundary)
