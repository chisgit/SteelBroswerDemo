# Steel — CAPTCHA Sophistication + Real Differentiators

> Pulled 2026-06-18 from docs.steel.dev/overview/stealth/captcha-solving, captcha blog,
> beginner guide. This is the "what's the actual moat" intel for the interview.

## CAPTCHA: what Steel ACTUALLY solves (verified)
Auto-solve (just set `solveCaptcha: true`, no coordinates needed):
- **reCAPTCHA v2/v3** (checkbox + score/token)
- **Cloudflare Turnstile**
- **ImageToText** captchas
- **Amazon AWS WAF**

Methods (their words): "various methods" — **ML models + third-party solving services +
browser-automation techniques + token manipulation**. So it's a *hybrid/orchestration* layer,
not purely their own vision model.

**Caveat (their own FAQ):** "solving is not guaranteed to work 100% of the time" → handle failure.

### Interactive challenges — does it click images / drag puzzle pieces?
- **Docs do NOT claim** image-grid selection ("pick all traffic lights"), slider/puzzle-piece drag,
  rotate, or audio as supported auto-solve types. Treat as **NOT a reliable auto-feature**.
- BUT: Steel exposes `sessions.computer({action})` (screenshot/click/type/scroll) — vision actions.
  An **LLM-with-vision could in principle attempt** image-grid/slider by reasoning over screenshots +
  issuing clicks/drags. That's *agent logic on top of Steel*, NOT a Steel one-flag feature.
  → If we want a "select images / move puzzle piece" moment, WE build it as agent behavior
  (Gemini vision → coordinates → `computer` click/drag), and frame it honestly as "agent solving
  an interactive challenge using Steel's vision-action primitives", not "Steel auto-solved it".

## The REAL differentiators (vs "anyone can boot a headless browser")
This is the interview-grade answer. Booting remote Chrome is commodity. Steel's moat:

1. **Prevention-first anti-detection** — sophisticated **fingerprint randomization** + stealth so
   CAPTCHAs / blocks **never appear in the first place**. (Hardest to replicate; this is the craft.)
2. **Residential proxy rotation** from a global network, built in.
3. **Sub-second session startup** (claim: <1s vs 3-5s self-managed) — matters at agent scale.
4. **24h persistent sessions + Profiles** (auth/cookies/fingerprint reused across runs) — state mgmt is hard.
5. **CAPTCHA bridge architecture** — WebSocket bridge connecting live session ↔ solver extensions,
   real-time detect→solve→state. (Orchestration, not just a solver call.)
6. **LLM-cost reduction up to 80%** via intelligent content extraction/formatting — AI-specific.
7. **Fleet orchestration + autoscale** — no DevOps; "Steel Wire" = 100 concurrent.
8. **Observability/debugging** — session viewer, recordings, agent logs ("explain a failed run from
   evidence") = the Steel Skills thesis. ← their current strategic bet.

### The one-liner for the interview
"Standing up a remote browser is commodity. What's hard — and what Steel does — is making it
**stay undetected** (fingerprint + proxy + prevention-first), **start in <1s at fleet scale**,
**persist identity across runs**, and **explain itself when an agent run fails**. The browser is
the easy 10%; the reliability + anti-detection + observability around it is the 90%."

## Demo implication
- Don't lean the demo on "Steel solves a hard image captcha" — docs don't back that, and it'd be a
  claim Hussien can puncture.
- DO lean on **prevention-first reliability + diagnose-from-evidence + honest fleet variance**.
- If we want an interactive-challenge wow, build it as **Gemini-vision agent solving OUR own slider/
  image puzzle** via `computer` click/drag — framed as agent-on-Steel, an honest capability flex.
