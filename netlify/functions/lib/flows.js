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
    title: "Bot wall — recover via stealthConfig + useProxy",
    feature: "stealthConfig + useProxy",
    proves: "Blocked as a bot, the agent relaunches the session with stealth + proxy to get through.",
    apiSnippet: `// fingerprint/proxy are create-time → recover = relaunch\nawait client.sessions.release(old);\nawait client.sessions.create({ stealthConfig: {...}, useProxy: true });`,
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

export function flowMeta(route) {
  return FLOWS[route] || { title: route, feature: "", proves: "", apiSnippet: "", docsUrl: "", path: "/" };
}
