// Steel Sessions API helpers (server-side only — holds the API key, KTD2).
// Thin wrapper over steel-sdk + playwright-core CDP connect.
// Every SDK call is logged to a buffer so the UI can show a live API console.
import Steel from "steel-sdk";
import { chromium } from "playwright-core";
import { record } from "./logger.mjs";

const STEEL_API_KEY = process.env.STEEL_API_KEY;
const SESSION_CREATE_TIMEOUT_MS = 25000;

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
  for (let attempt = 1; attempt <= 4; attempt++) {
    try {
      session = await createSessionOnce(params);
      break;
    } catch (err) {
      const hitLimit = isConcurrentLimit(err);
      const retryable = hitLimit || isRetryableCreateError(err);
      if (!retryable || attempt === 4) throw err;

      const delayMs = attempt * 2000;
      if (hitLimit) {
        record("sessions.create", { attempt }, `429 - releaseAll, wait ${delayMs}ms, retrying`);
        await releaseAllSessions();
      } else {
        record("sessions.create", { attempt, error: summarizeError(err) }, `retryable error - wait ${delayMs}ms, retrying`);
      }
      await sleep(delayMs);
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

async function createSessionOnce(params) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), SESSION_CREATE_TIMEOUT_MS);
  try {
    return await client().sessions.create(params, {
      signal: controller.signal,
      timeout: SESSION_CREATE_TIMEOUT_MS,
    });
  } catch (err) {
    if (controller.signal.aborted) {
      throw new Error(`sessions.create timed out after ${SESSION_CREATE_TIMEOUT_MS}ms`);
    }
    throw err;
  } finally {
    clearTimeout(timeout);
  }
}

function isConcurrentLimit(err) {
  return Boolean(err?.message && (err.message.includes("429") || err.message.toLowerCase().includes("concurrent session limit")));
}

function isRetryableCreateError(err) {
  const message = err?.message || "";
  return /\b(500|502|503|504)\b/.test(message) || message.toLowerCase().includes("retryable");
}

function summarizeError(err) {
  return String(err?.message || err).slice(0, 240);
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** Release all live sessions — used to clear the hobby-plan concurrent limit on 429. */
export async function releaseAllSessions() {
  try {
    await client().sessions.releaseAll({});
    record("sessions.releaseAll", {}, "ok");
  } catch (_) {
    // best-effort
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
