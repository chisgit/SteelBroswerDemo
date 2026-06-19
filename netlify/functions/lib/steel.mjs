// Steel Sessions API helpers (server-side only — holds the API key, KTD2).
// Thin wrapper over steel-sdk + playwright-core CDP connect.
import Steel from "steel-sdk";
import { chromium } from "playwright-core";

const STEEL_API_KEY = process.env.STEEL_API_KEY;

function client() {
  if (!STEEL_API_KEY) throw new Error("STEEL_API_KEY not configured");
  return new Steel({ steelAPIKey: STEEL_API_KEY });
}

/**
 * Create a Steel cloud browser session.
 * @param {object} opts
 * @param {boolean} [opts.solveCaptcha] enable Steel's CAPTCHA auto-solve
 * @param {boolean} [opts.useProxy]     route through Steel's proxy network
 * @param {boolean} [opts.blockAds]     block ads in the session
 * @param {{width:number,height:number}} [opts.dimensions] viewport (mobile emulation)
 * @param {string}  [opts.userAgent]    custom user agent
 * @param {string}  [opts.region]       session region
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

  const session = await client().sessions.create(params);
  return {
    id: session.id,
    debugUrl: session.debugUrl,
    sessionViewerUrl: session.sessionViewerUrl,
    websocketUrl: session.websocketUrl,
  };
}

/** Connect Playwright to a live Steel session over CDP (server-side only).
 *  Pass the session's websocketUrl when known, else a sessionId to build the URL. */
export async function connect(websocketUrl, sessionId) {
  const ws =
    websocketUrl ||
    `wss://connect.steel.dev?apiKey=${STEEL_API_KEY}&sessionId=${sessionId || ""}`;
  const browser = await chromium.connectOverCDP(ws);
  const context = browser.contexts()[0] || (await browser.newContext());
  const page = context.pages()[0] || (await context.newPage());
  return { browser, context, page };
}

/** Release (tear down) a session. Best-effort; never throws into the caller. */
export async function release(sessionId) {
  try {
    await client().sessions.release(sessionId);
  } catch (_) {
    /* already gone / network — ignore on teardown */
  }
}

/**
 * Stealth relaunch (KTD10): proxy and ad-blocking are session-creation options and
 * cannot be toggled mid-session, so recovery from a bot wall = release + create new.
 * @returns {Promise<{id,debugUrl,sessionViewerUrl,websocketUrl}>} the NEW session
 */
export async function relaunchWithStealth(oldSessionId, opts = {}) {
  await release(oldSessionId);
  return createSession({ ...opts, useProxy: true, blockAds: true });
}

/** Client-safe view of a session: never expose websocketUrl or the key. */
export function clientView(session) {
  return { sessionId: session.id, debugUrl: session.debugUrl, sessionViewerUrl: session.sessionViewerUrl };
}
