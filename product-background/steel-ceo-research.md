# Steel.dev — Founder & Company Research (for interview demo)

> Compiled 2026-06-18 for an interview demo. Goal: build a product on Steel that
> appeals directly to the CEO's passions and the company's current focus.
> Sources are public (web search, Steel blog, Fly.io customer story, LinkedIn posts).

## Founders

| Person | Role | Background |
|--------|------|-----------|
| **Hussien Hussien** | Co-Founder & **CEO** | Prior roles at Nen Labs, VendorPM, Anzen, Triage. Educated at University of Toronto. |
| **Nasr Mohamed** | Co-Founder & CTO | Prior: Nen Labs, Lazer Technologies, Katana, Anzen. University of Waterloo. |
| **Dane Wilson** | Founding Engineer | — |

Company founded **2022**. Raised **$17M**. YC-backed (felt like "won a lottery";
humbled day one by YC's questions: *"Who is paying you?"* and *"How fast can you get more of them?"*).
Thousands of GitHub stars on the open-source repo.

## The Thesis (what they are passionate about)

Core mission, in their words:
> **"Equip AI agents with browsers they can truly control — no compromises."**

Recurring passions / values:
- **Agents doing real work on the live web** — not test scripts. Agents go from "smart
  software" to "wielding a full-blown virtual browser, mouse, keyboard, and all."
- **Open source first** — proud of the self-hostable `steel-browser` repo; maintain
  `awesome-web-agents`. Engaging the OSS earns real credibility.
- **Removing infrastructure friction** — CTO: *"We wanted super-fast VMs without the
  Kubernetes nightmare."* / *"It's like a cheat code for startups."*
- **Security at scale** — *"even at scale, nothing is exposed publicly."**

## Current Focus — Launch Week v2 (what's top of mind RIGHT NOW)

Five shipped features + the *why* behind them:

1. **Profiles** — persistent browser identity (cookies, auth, extensions, fingerprint) across sessions.
2. **Mobile Mode** — device emulation. *"For AI agents, this directly improves task completion rates and reduces token costs."*
3. **Agent Logs** — timeline of agent actions + session replay. *"When your agent fails at a task, you can trace exactly where things went wrong."* Jump straight to failure points.
4. **Headful Sessions** — WebRTC streaming at 25fps (replaced screencasting) + MP4 recordings.
5. **Concurrency limits doubled** across all tiers (scale).

**Two themes Hussien clearly cares about most right now:**
- **Debuggability of agent failures** ("trace exactly where things went wrong").
- **Task completion rate** (reliability of agents finishing real tasks).

## Prominent Steel features to showcase

- Sessions API (cloud Chrome, <1s start, up to 24h)
- Playwright / Puppeteer / Selenium drop-in via CDP
- **Session Viewer** (live + recorded) — strong visual proof for a demo
- **Profiles** (persistent auth/identity)
- Anti-bot + CAPTCHA solving *(use only on a site we own — ethics line, see below)*
- Proxies / auth-walled access
- Self-hostable open-source Docker image
- Agent Logs (new), Headful streaming (new), parallel concurrency (new)

## Demo design implications (how research shapes the build)

- **Build a real LLM agent** (Claude in loop) controlling a Steel browser — embodies the
  exact thesis. A test suite alone reads as "I can write Playwright" — too low.
- **Make failures visible** — mirror Agent Logs: show the agent's action timeline +
  session replay, and have it surface where/why a task failed. Direct appeal to current focus.
- **Use Session Viewer / headful streaming** as the live visual — watch the agent work.
- **Showcase Profiles** — persistent login across runs (one of their newest features).
- **Parallel fleet finale** — N agents at once, nods to concurrency focus.
- **Ethics line (user constraint):** do NOT bypass other sites' CAPTCHAs / TOS. Target site
  is one WE build and own (hosted on Netlify), so any CAPTCHA/login is legitimately ours.

## Open questions / to verify before/at interview
- Confirm self-hosted vs hosted-cloud for live demo (Session Viewer URLs differ).
- Whether to mention OSS self-host explicitly even if demoing on cloud (strong signal).
