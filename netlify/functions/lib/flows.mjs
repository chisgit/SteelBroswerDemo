// Single source of truth for every flow: the human title, the Steel feature(s) in
// play, the real integration snippet it runs, and a docs link (KTD9 + R14).
// Both the live banner (R13) and the U9 technical panel read from here, so the
// label always matches what the engine is actually doing.

export const ROUTES = ["recaptcha", "turnstile", "hcaptcha", "vision-grid", "bot-wall", "mobile-bug"];

export const FLOWS = {
  recaptcha: {
    title: "reCAPTCHA v2 — Steel solveCaptcha",
    feature: "solveCaptcha",
    proves: "Steel auto-solves a real reCAPTCHA v2 token challenge.",
    apiSnippet: `await client.sessions.create({ solveCaptcha: true });`,
    docsUrl: "https://docs.steel.dev/overview/stealth/captcha-solving",
    path: "/gauntlet/recaptcha.html",
  },
  turnstile: {
    title: "Cloudflare Turnstile — Steel solveCaptcha",
    feature: "solveCaptcha",
    proves: "Steel clears a real Cloudflare Turnstile widget.",
    apiSnippet: `await client.sessions.create({ solveCaptcha: true });`,
    docsUrl: "https://docs.steel.dev/overview/stealth/captcha-solving",
    path: "/gauntlet/turnstile.html",
  },
  hcaptcha: {
    title: "hCaptcha (attempt) — diagnose + recover",
    feature: "solveCaptcha + reliability",
    proves: "Honest attempt route with a 3s delayed render — exercises wait/retry recovery.",
    apiSnippet: `// not on Steel's confirmed list — wait for render, then retry\nawait page.waitForSelector('.h-captcha', { timeout: 8000 });`,
    docsUrl: "https://docs.steel.dev/overview/stealth/captcha-solving",
    path: "/gauntlet/hcaptcha.html",
  },
  "vision-grid": {
    title: "Vision grid — Gemini vision + DOM actions",
    feature: "agent-on-Steel (vision)",
    proves: "Our Gemini-vision agent classifies each tile and clicks the dogs — not a Steel flag.",
    apiSnippet: `const shot = await page.screenshot();\nconst verdicts = await gemini.classifyTiles(tiles, "dog");\nfor (const id of verdicts.matches) await page.click('#tile-' + id);`,
    docsUrl: "https://docs.steel.dev/overview/sessions-api/overview",
    path: "/gauntlet/vision-grid.html",
  },
  "bot-wall": {
    title: "Bot wall — recover via useProxy + blockAds",
    feature: "useProxy + blockAds",
    proves: "Blocked as a bot, the agent relaunches the session with residential proxy + ad blocking.",
    apiSnippet: `// proxy/ad-block are create-time → recover = relaunch\nawait client.sessions.release(old);\nawait client.sessions.create({ useProxy: true, blockAds: true });`,
    docsUrl: "https://docs.steel.dev/overview/stealth",
    path: "/gauntlet/bot-wall.html",
  },
  "mobile-bug": {
    title: "Mobile bug — dimensions viewport",
    feature: "dimensions (mobile emulation)",
    proves: "A mobile-viewport session hits a layout bug and recovers via an alternate path.",
    apiSnippet: `await client.sessions.create({ dimensions: { width: 390, height: 844 } });`,
    docsUrl: "https://docs.steel.dev/overview/sessions-api/overview",
    path: "/gauntlet/mobile-bug.html",
  },
};

export const BASE_DEMOS = {
  "arcade-task": {
    title: "Arcade reliability task",
    summary: "A small owned task site that can accept challenge overlays without changing the agent loop.",
  },
};

export const CHALLENGE_OVERLAYS = {
  none: {
    title: "No CAPTCHA",
    routes: [],
    summary: "Baseline route shape for future demos that need the task without a CAPTCHA gate.",
  },
  captcha: {
    title: "Standard CAPTCHA overlays",
    routes: ["recaptcha", "turnstile", "hcaptcha"],
    summary: "Provider widgets attached to an owned task route.",
  },
  vision: {
    title: "Vision challenge overlay",
    routes: ["vision-grid"],
    summary: "A visual selection challenge solved by the agent, not by Steel auto-solve.",
  },
  reliability: {
    title: "Reliability overlays",
    routes: ["hcaptcha", "bot-wall", "mobile-bug"],
    summary: "Failures that exercise diagnose, recover, relaunch, and alternate paths.",
  },
};

export const SOLVER_STRATEGIES = {
  "steel-solve-captcha": {
    title: "Steel solveCaptcha",
    routes: ["recaptcha", "turnstile"],
  },
  "wait-retry": {
    title: "Wait and retry",
    routes: ["hcaptcha"],
  },
  "gemini-vision": {
    title: "Gemini vision + DOM actions",
    routes: ["vision-grid"],
  },
  "stealth-relaunch": {
    title: "Stealth session relaunch",
    routes: ["bot-wall"],
  },
  "alternate-path": {
    title: "Alternate path recovery",
    routes: ["mobile-bug"],
  },
};

export const SCENARIO_ARCS = {
  "simple-impact": {
    title: "Simple impact slice",
    summary: "Show a failure, diagnose it, recover, then close on the agent seeing and acting.",
  },
  "full-gauntlet": {
    title: "Full CAPTCHA gauntlet",
    summary: "Run every current overlay and finish with fleet variance.",
  },
  "future-fix-redeploy-reset": {
    title: "Fix, redeploy, reset",
    summary: "Reserved scenario: agent fixes a broken demo, redeploys, validates, and resets state.",
  },
};

export const DEFAULT_RECIPE_ID = "simple-impact";

export const DEMO_RECIPES = {
  "captcha-only": {
    title: "I'm not a robot",
    baseDemo: "arcade-task",
    scenario: "simple-impact",
    routes: ["recaptcha", "turnstile"],
    overlays: ["captcha"],
    summary: "Steel auto-solves reCAPTCHA v2 and Cloudflare Turnstile with solveCaptcha.",
  },
  "vision-only": {
    title: "Visual Challenge",
    baseDemo: "arcade-task",
    scenario: "simple-impact",
    routes: ["vision-grid"],
    overlays: ["vision"],
    summary: "Gemini vision classifies an image grid and clicks matching tiles.",
  },
  "reliability": {
    title: "Reliability Arc",
    baseDemo: "arcade-task",
    scenario: "full-gauntlet",
    routes: ["hcaptcha", "bot-wall", "mobile-bug"],
    overlays: ["reliability"],
    summary: "Delayed render, bot wall, and mobile layout bug — diagnose and recover.",
  },
  "simple-impact": {
    title: "Simple impact demo",
    baseDemo: "arcade-task",
    scenario: "simple-impact",
    routes: ["hcaptcha", "vision-grid"],
    overlays: ["captcha", "vision", "reliability"],
    summary: "Smallest finished slice: diagnose/recover on a CAPTCHA-style delay, then the Gemini vision-grid climax.",
  },
  "captcha-gauntlet": {
    title: "Full CAPTCHA gauntlet",
    baseDemo: "arcade-task",
    scenario: "full-gauntlet",
    routes: ROUTES,
    overlays: ["captcha", "vision", "reliability"],
    summary: "All current challenge overlays in one run.",
  },
  "no-captcha-smoke": {
    title: "No-CAPTCHA smoke route",
    baseDemo: "arcade-task",
    scenario: "simple-impact",
    routes: ["mobile-bug"],
    overlays: ["none", "reliability"],
    summary: "Baseline proof that a demo can run without a CAPTCHA overlay.",
  },
};

export function flowMeta(route) {
  return FLOWS[route] || { title: route, feature: "", proves: "", apiSnippet: "", docsUrl: "", path: "/" };
}

export function recipeMeta(recipeId = DEFAULT_RECIPE_ID) {
  return DEMO_RECIPES[recipeId] || DEMO_RECIPES[DEFAULT_RECIPE_ID];
}
