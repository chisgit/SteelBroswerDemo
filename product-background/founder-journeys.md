# Founder Journeys (from LinkedIn)

> Captured 2026-06-18 via authenticated browser session. Structured for demo framing.

## Nasr Mohamed — Co-Founder & CTO, Steel.dev

| Period | Role | Org | Notes |
|--------|------|-----|-------|
| Aug 2024 – present (1 yr 11 mos) | Co-Founder & CTO | **Steel.dev** | — |
| Oct 2022 – present (3 yr 9 mos) | Building Products | Nen Labs | overlaps Steel |
| Aug 2020 – Jan 2023 (2 yr 6 mos) | Staff / Senior SW Engineer | Lazer Technologies | web3 / data / fintech projects |
| Aug 2019 – Jul 2020 (1 yr) | Co-Founder & CTO | Anzen (full-time, Sunnyvale CA) | "Face ID for Office Spaces" — Envoy + integrated access control; IoT door controller + facial recognition on consumer hardware |
| May 2019 – Aug 2019 (4 mos) | Data Engineer | Meta (Menlo Park) | — |

Education: University of Waterloo.

**Signals / passions:**
- Repeat **technical co-founder** — second time as CTO (Anzen → Steel).
- Hands-on **hardware + CV + IoT** background (Anzen) — likes building real systems, not just SaaS glue.
- **web3 / data / fintech** engineering depth (Lazer).
- Big-tech data eng foundation (Meta).
- Theme: ships **products that control the physical/real world** (facial-recognition door access → now browsers agents truly control). Maps cleanly to Steel's "agents wielding a real browser."

## Hussien Hussien — Co-Founder & CEO, Steel.dev

Location: San Francisco, CA. Education: **University of Toronto**. 5k+ GitHub stars, millions of API calls served.
Tagline he uses: *"Tools for AGI. Starting with embarrassingly reliable headless browsers."*
Books meetings directly: https://cal.com/hussien-hussien-fjxt3x/30min

| Period | Role | Org | Notes |
|--------|------|-----|-------|
| Sep 2024 – present (1 yr 10 mos) | Co-Founder / **CEO** | Steel | "Tools for AGI. Starting with embarrassingly reliable headless browsers." |
| Dec 2022 – present (3 yr 7 mos) | Co-Founder | Nen Labs | "Built and shipped many web agents with the best co-founder in the game." (= Nasr) |
| May 2021 – Nov 2022 (1 yr 7 mos) | Senior Product Manager | VendorPM (Toronto) | chicken-&-egg marketplace problems, Fortune 500 enterprise |

(Earlier public mentions: Anzen, Triage.)

**Passions / strong signals (high value for interview):**
- **ML + prediction + sports**: wrote a Towards Data Science post predicting the 2014 March Madness
  bracket w/ ML (the Buffett/Quicken $1B perfect-bracket challenge, odds ~1 in 148 quintillion).
  Co-authored a paper in **Proceedings of ICAIF 2020 (ACM)** w/ Eric Tang & Peter A.
  → He likes data science, modeling, sabermetrics. **Hook: my stockpredictors ML site is on-theme.**
- **PM background** (VendorPM) — cares about shipping *products users love*, not just infra.
- **"Embarrassingly reliable"** is his signature phrase. RELIABILITY is the core value.

## Steel's CURRENT focus (from Hussien's recent posts — most important section)

- **Steel Skills** (launched ~2 wks ago): five composable agent skills that hand off to each other.
  Runs in Claude Code, Cursor, Codex, opencode, Pi. His framing: *"A skill is a contract, not a prompt.
  One skill, one job. The handoff between skills is the way."* The five:
  - `steel-browser` — operate a real browser
  - `steel-developer` — write code that runs on Steel
  - **`steel-session-debugging`** — explain a failed run from evidence
  - **`steel-reliability`** — fix the blocks
  - `steel-skill-creator` — compile a repeated task into a skill (drives flow twice, diffs runs, writes+verifies skill)
- **Steel Wire** — in-house prototype agent running **100 concurrent sessions on GPT-5.4-mini**.
  His framing: *"Building one agent is the fun part. Getting a hundred to do real, repeatable work at
  production scale is where the actual problem lives."* → SCALE + reliability.
- **Browser-agent benchmark leaderboard** (kept since early 2025, 4th redesign): WebVoyager, OSWorld,
  OpenAI BrowseComp, WebArena, GAIA, SWEbench. He uses it to help customers pick a stack.
- **Dev challenge**: challenge.steel.dev
- **Convex component** for Steel (community) — multi-tenant sessions, captcha solving, profiles.
- Hiring hard in **Toronto** ("AI-native engineers", "build and ship real systems", "low-level infra").

### What this means for the demo (updated thesis)
The single highest-appeal theme is **reliability + debugging failed agent runs at scale** —
"embarrassingly reliable", `steel-session-debugging`, `steel-reliability`, Steel Wire's 100 concurrent.
A demo that runs an agent, lets it FAIL, then **explains the failure from session evidence and recovers**
hits his exact current worldview. Bonus alignment: ML/prediction flavor (his March Madness/ICAIF past)
and the skills-handoff mental model (one skill, one job).
