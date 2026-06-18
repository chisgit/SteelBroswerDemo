// The agent loop's atomic step (KTD1): exactly one observe->decide->act cycle,
// returns structured state so the front-end can loop (U5). One screenshot + at most
// one model call + one action per invocation to stay under the 10s free-tier cap.
import { createSession, connect, release, relaunchWithStealth, clientView } from "./lib/steel.mjs";
import { flowMeta } from "./lib/flows.mjs";
import { classifyTiles } from "./lib/gemini.mjs";
import { card, thumb } from "./lib/evidence.mjs";

const BASE = process.env.GAUNTLET_BASE_URL || "";

export const handler = async (event) => {
  let conn;
  try {
    const { sessionId, websocketUrl, route, phase = "start", baseUrl } =
      JSON.parse(event.body || "{}");
    const meta = flowMeta(route);
    const base = baseUrl || BASE || originFrom(event);

    conn = await connect(websocketUrl, sessionId);
    const { page } = conn;

    const result = await runStep({ page, route, phase, base, sessionId, meta });
    return json(200, {
      flowTitle: meta.title,
      feature: meta.feature,
      ...result,
    });
  } catch (err) {
    return json(502, { error: "agent_step_failed", detail: err.message, done: true, outcome: "fail" });
  } finally {
    if (conn?.browser) await conn.browser.close().catch(() => {});
  }
};

// --- per-route step logic -------------------------------------------------

async function runStep({ page, route, phase, base, sessionId, meta }) {
  switch (route) {
    case "recaptcha":
    case "turnstile":
      return tokenRoute(page, base, meta);
    case "hcaptcha":
      return hcaptchaStep(page, base, phase, meta);
    case "vision-grid":
      return visionGridStep(page, base, phase);
    case "bot-wall":
      return botWallStep(page, base, phase, sessionId, meta);
    case "mobile-bug":
      return mobileBugStep(page, base, phase, meta);
    default:
      return genericStep(page, base, meta);
  }
}

// Token routes: navigate, let Steel solveCaptcha clear it, detect #solved.
async function tokenRoute(page, base, meta) {
  await page.goto(base + meta.path, { waitUntil: "domcontentloaded" });
  // Steel solves asynchronously; poll briefly within budget.
  const solved = await page
    .waitForSelector("#solved:not(.hidden)", { timeout: 8000 })
    .then(() => true)
    .catch(() => false);
  return {
    done: true,
    outcome: solved ? "pass" : "fail",
    evidence: card({
      action: `navigate ${meta.path} + await solveCaptcha`,
      targetSelector: "#solved",
      verdict: solved ? "captcha token accepted" : "token not detected in budget",
      outcome: solved ? "pass" : "fail",
      screenshotThumb: await thumb(page),
    }),
  };
}

// hCaptcha (attempt) route — the widget renders 3s late (realistic delayed-load).
// Step 1 finds it missing → diagnose. Step 2 (phase=continue) waits + retries → recovered (U6).
async function hcaptchaStep(page, base, phase, meta) {
  if (phase === "start") {
    await page.goto(base + meta.path, { waitUntil: "domcontentloaded" });
    const present = await page.$(".h-captcha");
    if (!present) {
      return {
        done: false,
        outcome: "fail",
        evidence: card({
          action: `navigate ${meta.path} — locate hCaptcha widget`,
          targetSelector: ".h-captcha",
          verdict: "widget not in DOM yet",
          outcome: "fail",
          screenshotThumb: await thumb(page),
          diagnosis: "element absent on first paint — likely a delayed (async) render",
          recovery: "wait for the widget to mount, then retry",
        }),
      };
    }
  }
  // recovery / continue: wait for the delayed widget, then treat solveCaptcha as clearing it.
  const appeared = await page.waitForSelector(".h-captcha", { timeout: 6000 }).then(() => true).catch(() => false);
  const solved = appeared &&
    (await page.waitForSelector("#solved:not(.hidden)", { timeout: 5000 }).then(() => true).catch(() => false));
  return {
    done: true,
    outcome: appeared ? "recovered" : "fail",
    evidence: card({
      action: "wait for delayed widget, then await token",
      targetSelector: ".h-captcha",
      verdict: appeared ? (solved ? "widget mounted + token accepted" : "widget mounted") : "still absent",
      outcome: appeared ? "recovered" : "fail",
      screenshotThumb: await thumb(page),
      recovery: appeared ? "waited for async render — recovered" : null,
    }),
  };
}

// Vision-grid: screenshot tiles, classify with Gemini, click matches, submit.
async function visionGridStep(page, base, phase) {
  if (phase === "start") {
    await page.goto(base + flowMeta("vision-grid").path, { waitUntil: "networkidle" });
  }
  await page.waitForSelector("#grid img", { timeout: 8000 });

  // Pull each tile as its own base64 image (per-tile vision, KTD4).
  const tiles = await tilesAsBase64(page);
  const { matches, verdicts } = await classifyTiles(tiles, "dog");

  for (const id of matches) {
    await page.click("#tile-" + id).catch(() => {});
  }
  await page.click("#verify-btn").catch(() => page.click(".ctl-confirm").catch(() => {}));

  const state = await page
    .waitForSelector("#grid-result", { timeout: 4000 })
    .then((el) => el.getAttribute("data-state"))
    .catch(() => null);

  const pass = state === "pass";
  const isRetry = phase === "continue";
  const outcome = pass ? (isRetry ? "recovered" : "pass") : "fail";
  return {
    done: pass,
    outcome,
    selected: matches,
    evidence: card({
      action: `vision-classify ${tiles.length} tiles for "dog" → click matches`,
      targetSelector: matches.map((m) => "#tile-" + m).join(", "),
      verdict: `${matches.length} tile(s) classified as dog`,
      outcome,
      screenshotThumb: await thumb(page),
      diagnosis: pass ? null : `selection ${state || "unknown"} — re-classify on retry`,
      recovery: pass && isRetry ? "re-classified tiles and re-submitted — recovered" : null,
    }),
    verdicts,
  };
}

// Bot-wall (R12d/KTD10): first hit shows the wall → diagnose "blocked as bot" →
// recover by RELAUNCHING the session with stealthConfig + useProxy (fingerprint/proxy
// are create-time only), then re-navigate with the stealth marker.
async function botWallStep(page, base, phase, sessionId, meta) {
  if (phase === "start") {
    await page.goto(base + meta.path, { waitUntil: "domcontentloaded" });
    const walled = await page.$("#wall:not(.hidden)");
    if (walled) {
      // Relaunch with stealth + proxy. This returns a NEW session; we hand it back so
      // the UI re-embeds its debugUrl, and the next step (continue) drives it.
      const fresh = await relaunchWithStealth(sessionId, { solveCaptcha: true });
      return {
        done: false,
        outcome: "fail",
        newSession: clientView(fresh),
        newWebsocketUrl: fresh.websocketUrl,
        evidence: card({
          action: `navigate ${meta.path}`,
          targetSelector: "#wall",
          verdict: "Access Denied — flagged as bot",
          outcome: "fail",
          screenshotThumb: await thumb(page),
          diagnosis: "request blocked by bot detection (default fingerprint)",
          recovery: "release session, relaunch with stealthConfig + useProxy",
        }),
      };
    }
  }
  // continue: drive the (now stealthed) session through with the stealth marker.
  await page.goto(base + meta.path + "?stealth=1", { waitUntil: "domcontentloaded" });
  const through = await page.waitForSelector("#solved", { timeout: 5000 }).then(() => true).catch(() => false);
  return {
    done: true,
    outcome: through ? "recovered" : "fail",
    evidence: card({
      action: "re-navigate with stealth fingerprint + proxy",
      targetSelector: "#content",
      verdict: through ? "passed the bot wall" : "still blocked",
      outcome: through ? "recovered" : "fail",
      screenshotThumb: await thumb(page),
      recovery: through ? "stealthConfig + useProxy cleared the wall — recovered" : null,
    }),
  };
}

// Mobile-bug (R12e): a mobile-viewport session hits a hidden primary control and
// recovers via the alternate menu path. (The session is created with mobile dimensions
// by the fleet/runner; this step finds the working selector.)
async function mobileBugStep(page, base, phase, meta) {
  await page.goto(base + meta.path, { waitUntil: "domcontentloaded" });
  const primaryVisible = await page.isVisible("#primary-continue").catch(() => false);
  if (primaryVisible) {
    await page.click("#primary-continue");
    const done = await page.waitForSelector("#solved:not(.hidden)", { timeout: 3000 }).then(() => true).catch(() => false);
    return { done: true, outcome: done ? "pass" : "fail",
      evidence: card({ action: "click #primary-continue (desktop path)", targetSelector: "#primary-continue", outcome: done ? "pass" : "fail", screenshotThumb: await thumb(page) }) };
  }
  // primary hidden under mobile viewport → diagnose + recover via alternate.
  await page.click("#menu-continue").catch(() => {});
  const done = await page.waitForSelector("#solved:not(.hidden)", { timeout: 3000 }).then(() => true).catch(() => false);
  return {
    done: true,
    outcome: done ? "recovered" : "fail",
    evidence: card({
      action: "primary control hidden on mobile → use alternate menu path",
      targetSelector: "#menu-continue",
      verdict: done ? "checkout completed via menu" : "alternate path failed",
      outcome: done ? "recovered" : "fail",
      screenshotThumb: await thumb(page),
      diagnosis: "#primary-continue not visible at mobile viewport (display:none)",
      recovery: done ? "clicked #menu-continue alternate path — recovered" : null,
    }),
  };
}

async function genericStep(page, base, meta) {
  await page.goto(base + meta.path, { waitUntil: "domcontentloaded" });
  return {
    done: false,
    outcome: "progress",
    evidence: card({ action: `navigate ${meta.path}`, outcome: "progress", screenshotThumb: await thumb(page) }),
  };
}

// --- helpers --------------------------------------------------------------

async function tilesAsBase64(page) {
  const imgs = await page.$$("#grid img");
  const out = [];
  for (let i = 0; i < imgs.length; i++) {
    const id = Number((await imgs[i].getAttribute("id")).replace("tile-", ""));
    const buf = await imgs[i].screenshot({ type: "jpeg", quality: 70 }).catch(() => null);
    if (buf) out.push({ id, b64: buf.toString("base64"), mime: "image/jpeg" });
  }
  return out;
}

function originFrom(event) {
  const proto = event.headers?.["x-forwarded-proto"] || "https";
  const host = event.headers?.host || event.headers?.Host;
  return host ? `${proto}://${host}` : "";
}

function json(statusCode, obj) {
  return { statusCode, headers: { "content-type": "application/json" }, body: JSON.stringify(obj) };
}
