# Steel.dev API Surface — Verified Reference

> Pulled 2026-06-18 from docs.steel.dev (llms-full.txt + quickstart + embed/HITL docs).
> Use these exact method/param names when planning + building. Node SDK = `steel-sdk`.

## Connect / sessions
- `client.sessions.create(opts)` → returns `session.id`, `session.websocketUrl` (CDP),
  `session.sessionViewerUrl` (live/replay), `session.debugUrl` (embeddable iframe).
- `client.sessions.release(id)` — tear down.
- `client.sessions.computer({ action })` — vision actions: `take_screenshot`, click, type, scroll.
- **Playwright connect (server-side only):**
  `wss://connect.steel.dev?apiKey=${STEEL_API_KEY}&sessionId=${session.id}`
  → `chromium.connectOverCDP(wsUrl)`. NEVER from the browser client — key would leak + CDP needs server.
- Free tier: **100 browser hours, no credit card**. Sessions start <1s same-region, up to 24h.

## create() options (the showcase levers)
- `solveCaptcha: true` — auto-solves **reCAPTCHA, hCaptcha, Cloudflare Turnstile, image, text**.
- `stealthConfig` — masks automation signals (anti-bot).
- `useProxy` — residential / datacenter / ISP proxies.
- `profileId` (Profiles API) — load persistent auth/cookies/localStorage/fingerprint.
- `dimensions` — viewport / mobile-mode emulation.
- `isSelenium: true` — WebDriver endpoint instead of CDP (not needed here).

## Live viewer / replay (the proof layer)
- Embed live: `<iframe src="${session.debugUrl}?interactive=true&showControls=true">` — auto-fits, no distortion.
- `interactive=true` → user can click/scroll/type in the embedded browser.
- `showControls=true` → URL bar + back/forward.
- `sessionViewerUrl` → real-time monitor + recorded replay after the run.
- Recordings + agent logs preserved for post-run inspection (= the "session-debugging" story).

## Content tools (sprinkle, not core)
- `steel.scrape({ url, format: ["markdown","html"] })` — server-side, post-JS render.
- structured extract with JSON-schema validation (typed output).
- screenshot (base64) + PDF capture.

## Other
- Concurrency: parallel independent sessions (Hobby tier limit ~5; their "Steel Wire" prototype = 100).
- MCP: `createSdkMcpServer` exposes Steel as agent tools.
- Model-agnostic: OpenAI / Anthropic / **Gemini** / Mistral — no lock-in. (We use Gemini Flash, free.)
- Steel CLI: `steel login`, `steel scrape`, `steel sessions`.
- x402 pay-as-you-go: $0.10/hr USDC, no API key (not needed for free demo).

## Feature impact ranking — for CEO Hussien (highest → lowest demo value)
1. **Diagnose-failure-from-session-evidence + self-heal** — IS the Steel Skills thesis. THE centerpiece.
2. **Live `debugUrl` iframe + freeze-frame replay on the failure frame** — the proof, their selling point.
3. **Honest parallel fleet** (each agent hits a *different* injected failure → variance dashboard) — Steel Wire story told truthfully.
4. `solveCaptcha` — real but owned captcha = ONE failure mode, NOT the climax (single flag = "read the docs").
5. Profiles persistent auth — CUT from build; keep as verbal answer to "what else?".
