// The agent loop's atomic step (KTD1): exactly one observe->decide->act cycle,
// returns structured state so the front-end can loop (U5). One screenshot + at most
// one model call + one action per invocation to stay under the 10s free-tier cap.
import { createSession, connect, release, relaunchWithStealth, clientView } from "./lib/steel.js";
import { flowMeta } from "./lib/flows.js";
import { classifyTiles } from "./lib/gemini.js";
import { card, thumb } from "./lib/evidence.js";

const BASE = process.env.GAUNTLET_BASE_URL || "";

export const handler = async (event) => {
  let conn;
  try {
    const { sessionId, websocketUrl, route, phase = "start", baseUrl } =
      JSON.parse(event.body || "{}");
    const meta = flowMeta(route);
    const base = baseUrl || BASE || originFrom(event);

    conn = await connect(websocketUrl);
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
    case "vision-grid":
      return visionGridStep(page, base, phase);
    default:
      // bot-wall + mobile-bug land in U8; until then, navigate + report progress.
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
  return {
    done: pass,
    outcome: pass ? "pass" : "fail",
    selected: matches,
    evidence: card({
      action: `vision-classify ${tiles.length} tiles for "dog" → click matches`,
      targetSelector: matches.map((m) => "#tile-" + m).join(", "),
      verdict: `${matches.length} tile(s) classified as dog`,
      outcome: pass ? "pass" : "fail",
      screenshotThumb: await thumb(page),
      diagnosis: pass ? null : `selection ${state || "unknown"} — re-classify on retry`,
    }),
    verdicts,
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
