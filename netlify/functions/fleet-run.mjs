// Parallel-fleet finale (U7/R9/KTD7): launch several Steel sessions concurrently,
// each on a DIFFERENT route so the dashboard shows honest variance — not N copies of
// one task. The mobile-bug agent runs on a mobile `dimensions` viewport so its failure
// is genuinely different. Bounded per-route so the whole batch fits the time budget.
import { createSession, connect, release } from "./lib/steel.mjs";
import { classifyTiles } from "./lib/gemini.mjs";
import { flowMeta } from "./lib/flows.mjs";

// Keep within Steel Hobby concurrency (~5) and the function time budget.
const FLEET = [
  { route: "recaptcha", dimensions: null },
  { route: "turnstile", dimensions: null },
  { route: "vision-grid", dimensions: null },
  { route: "mobile-bug", dimensions: { width: 390, height: 844 } }, // honest variance
];

export const handler = async (event) => {
  try {
    const base = (event && originFrom(event)) || process.env.GAUNTLET_BASE_URL || "";
    const results = await Promise.all(FLEET.map((f) => runOne(f, base)));
    return json(200, { results });
  } catch (err) {
    return json(502, { error: "fleet_failed", detail: err.message });
  }
};

async function runOne({ route, dimensions }, base) {
  let session, conn;
  const meta = flowMeta(route);
  try {
    session = await createSession({ solveCaptcha: true, dimensions: dimensions || undefined });
    conn = await connect(session.websocketUrl, session.id);
    const outcome = await attempt(conn.page, route, base, Boolean(dimensions));
    return { route, feature: meta.feature, outcome };
  } catch (_) {
    return { route, feature: meta.feature, outcome: "fail" };
  } finally {
    if (conn?.browser) await conn.browser.close().catch(() => {});
    if (session) await release(session.id);
  }
}

async function attempt(page, route, base, isMobile) {
  const meta = flowMeta(route);
  await page.goto(base + meta.path, { waitUntil: "domcontentloaded" }).catch(() => {});
  switch (route) {
    case "recaptcha":
    case "turnstile":
      return (await sel(page, "#solved:not(.hidden)", 8000)) ? "pass" : "fail";
    case "mobile-bug": {
      if (await page.isVisible("#primary-continue").catch(() => false)) {
        await page.click("#primary-continue").catch(() => {});
        return (await sel(page, "#solved:not(.hidden)", 2500)) ? "pass" : "fail";
      }
      await page.click("#menu-continue").catch(() => {});
      return (await sel(page, "#solved:not(.hidden)", 2500)) ? "recovered" : "fail"; // mobile bug → recovered
    }
    case "vision-grid": {
      await page.waitForSelector("#grid img", { timeout: 6000 }).catch(() => {});
      const tiles = await tilesAsBase64(page);
      if (!tiles.length) return "fail";
      const { matches } = await classifyTiles(tiles, "dog");
      for (const id of matches) await page.click("#tile-" + id).catch(() => {});
      await page.click("#verify-btn").catch(() => page.click(".ctl-confirm").catch(() => {}));
      const state = await page.waitForSelector("#grid-result", { timeout: 3000 }).then((el) => el.getAttribute("data-state")).catch(() => null);
      return state === "pass" ? "pass" : "fail";
    }
    default:
      return "fail";
  }
}

async function tilesAsBase64(page) {
  const imgs = await page.$$("#grid img");
  const out = [];
  for (const img of imgs) {
    const id = Number((await img.getAttribute("id")).replace("tile-", ""));
    const buf = await img.screenshot({ type: "jpeg", quality: 70 }).catch(() => null);
    if (buf) out.push({ id, b64: buf.toString("base64"), mime: "image/jpeg" });
  }
  return out;
}

const sel = (page, s, t) => page.waitForSelector(s, { timeout: t }).then(() => true).catch(() => false);
function originFrom(event) {
  const proto = event.headers?.["x-forwarded-proto"] || "https";
  const host = event.headers?.host || event.headers?.Host;
  return host ? `${proto}://${host}` : "";
}
function json(statusCode, obj) {
  return { statusCode, headers: { "content-type": "application/json" }, body: JSON.stringify(obj) };
}
