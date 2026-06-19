// Steel Sessions API helpers (server-side only — holds the API key, KTD2).
// Thin wrapper over steel-sdk + playwright-core CDP connect.
// Every SDK call is logged to a buffer so the UI can show a live API console.
import Steel from "steel-sdk";
import { chromium } from "playwright-core";
import { record } from "./logger.mjs";

const STEEL_API_KEY = process.env.STEEL_API_KEY;

// --- Steel session helpers -------------------------------------------------

function client() {
  if (!STEEL_API_KEY) throw new Error("STEEL_API_KEY not configured");
  return new Steel({ steelAPIKey: STEEL_API_KEY });
}

function sanitize(v) {
  if (typeof v === "string" && v.length > 60) return v.slice(0, 56) + "…";
  return v;
}

/**
 * Create a Steel cloud browser session.
 * @param {object} opts
 * @param {boolean} [opts.solveCaptcha]
 * @param {boolean} [opts.useProxy]
 * @param {boolean} [opts.blockAds]
 * @param {{width:number,height:number}} [opts.dimensions]
 * @param {string}  [opts.userAgent]
 * @param {string}  [opts.region]
 * @returns {Promise<{id,debugUrl,sessionViewerUrl,websocketUrl}>}
 */
export async function createSession(opts = {}) {
  const params = {};
  if (opts.solveCaptcha) params.solveCaptcha = true;
  if (opts.useProxy) params.useProxy = true;
  if (opts.blockAds) params.blockAds = true;
  if (opts.dimensions) params.dimensions = opts.dimensions;
  if (opts.userAgent) params.userAgent = opts.userAgent;
  if (opts.region) params.region = opts.region;

  record("sessions.create", params, "invoking");
  const t0 = Date.now();
  let session;
  try {
    session = await client().sessions.create(params);
  } catch (err) {
    // Hobby plan: 429 = concurrent session limit. Release all stale sessions and retry once.
    if (err.message && err.message.includes("429")) {
      record("sessions.create", {}, "429 — releasing stale sessions, retrying");
      const released = await releaseAllSessions();
      if (!released) throw new Error("429 concurrent session limit: releaseAll failed, cannot retry");
      try {
        session = await client().sessions.create(params);
      } catch (retryErr) {
        throw new Error(`429 on retry after releaseAll: ${retryErr.message}`);
      }
    } else {
      throw err;
    }
  }
  const ms = Date.now() - t0;
  record("sessions.create", { sessionId: sanitize(session.id), status: session.status }, "ok", `${ms}ms`);
  return {
    id: session.id,
    debugUrl: session.debugUrl,
    sessionViewerUrl: session.sessionViewerUrl,
    websocketUrl: session.websocketUrl,
  };
}

/** Release all live sessions — used to clear the hobby-plan concurrent limit on 429. */
export async function retrieveSession(sessionId) {
  record("sessions.retrieve", { sessionId: sanitize(sessionId) }, "invoking");
  try {
    const session = await client().sessions.retrieve(sessionId);
    const live = session.status === "live" || session.status === "running";
    record("sessions.retrieve", { sessionId: sanitize(sessionId), status: session.status }, live ? "live" : "not-live");
    if (!live) return null;
    return {
      id: session.id,
      debugUrl: session.debugUrl,
      sessionViewerUrl: session.sessionViewerUrl,
      status: session.status,
    };
  } catch (err) {
    record("sessions.retrieve", { sessionId: sanitize(sessionId), error: err.message }, "not-found");
    return null;
  }
}

export async function releaseAllSessions() {
  try {
    await client().sessions.releaseAll({});
    record("sessions.releaseAll", {}, "ok");
    return true;
  } catch (err) {
    record("sessions.releaseAll", { error: err.message }, "failed");
    return false;
  }
}

/** Connect Playwright to a live Steel session over CDP (server-side only). */
export async function connect(websocketUrl, sessionId, label = "chromium.connectOverCDP") {
  const ws =
    websocketUrl ||
    `wss://connect.steel.dev?apiKey=${STEEL_API_KEY}&sessionId=${sessionId || ""}`;
  const displayWs = ws.replace(/apiKey=[^&]+/, "apiKey=…");
  record(label, { sessionId: sanitize(sessionId), websocketUrl: displayWs }, "invoking");
  const t0 = Date.now();
  const browser = await chromium.connectOverCDP(ws);
  const ms = Date.now() - t0;
  record(label, { sessionId: sanitize(sessionId), websocketUrl: displayWs, pages: browser.contexts().length }, "connected", `${ms}ms`);
  const context = browser.contexts()[0] || (await browser.newContext());
  const page = context.pages()[0] || (await context.newPage());
  return { browser, context, page, _wsUrl: displayWs };
}

/** Release (tear down) a session. Best-effort; never throws into the caller. */
export async function release(sessionId) {
  try {
    record("sessions.release", { sessionId: sanitize(sessionId) }, "invoking");
    await client().sessions.release(sessionId);
    record("sessions.release", { sessionId: sanitize(sessionId) }, "ok");
  } catch (_) {
    record("sessions.release", { sessionId: sanitize(sessionId) }, "ignored (already released)");
  }
}

/**
 * Relaunch with proxy + ad-block: session-creation options can't be toggled mid-session,
 * so recovery = release old + create new.
 */
export async function relaunchWithProxy(oldSessionId, opts = {}) {
  await release(oldSessionId);
  return createSession({ ...opts, useProxy: true, blockAds: true });
}

/** Client-safe view of a session: never expose websocketUrl or the key. */
export function clientView(session) {
  return { sessionId: session.id, debugUrl: session.debugUrl, sessionViewerUrl: session.sessionViewerUrl };
}
