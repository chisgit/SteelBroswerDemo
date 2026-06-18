# Demo Design Review — Sonnet verdict (2026-06-18)

Senior review of the "Reliability Arcade" demo shape before plan-write. Acted on.

## Reframe (accepted)
- Steel = **observability/debugging layer**, not just "reliable browser." Lead with **diagnose-failure-from-session-evidence + self-heal**; that's the Steel Skills thesis. Recovery is the payoff. Working name energy: "Session Autopsy".
- **Demote CAPTCHA** to one failure mode, not the climax (`solveCaptcha: true` = one flag = reads as "read the docs").

## Technical risks (stack-ranked)
1. **Netlify 10s sync cap is THE killer** (not Gemini). A CDP nav+waitForSelector+click can burn 6-8s. Design: ONE atomic action per function call.
2. **Cold-start latency** both ends. Mitigate: **pre-warm Steel session on page load** (create session before user clicks Run); keep target pages **static** (no SSR cold start).
3. **CDP server-side only** — never connect from browser client (key leak + needs server).
4. Gemini Flash latency ~1-2s = fine.

## Anti-junior rules (accepted)
- Fleet must be **honest**: each parallel agent hits a *different* injected failure → dashboard shows **variance**, not N copies of one task.
- Show **structured evidence** (screenshot thumb, failed selector, recovery action) — NOT Gemini chat narration (GPT-wrapper smell).
- Injected failures must be **invisible/realistic**: 3s delayed render, CSS class rename, captcha gate — NOT 404 or JS throw.

## ADD / CUT (accepted)
- **ADD**: freeze-frame `sessionViewerUrl` replay on the exact failure frame (~30 lines UI, most defensible flex).
- **CUT**: Profiles "skip re-login" flourish → distraction; keep as verbal answer if asked.
