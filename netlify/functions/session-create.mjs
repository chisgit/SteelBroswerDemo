// Pre-warm a Steel session on page load (KTD3) so cold-start doesn't eat the
// per-step 10s budget. Returns only the client-safe view (KTD2 / R10).
import { createSession, clientView } from "./lib/steel.mjs";
import { popLog } from "./lib/logger.mjs";

export const handler = async (event) => {
  try {
    console.log("[session-create] STEEL_API_KEY present:", !!process.env.STEEL_API_KEY);
    console.log("[session-create] GEMINI_API_KEY present:", !!process.env.GEMINI_API_KEY);
    const body = event.body ? JSON.parse(event.body) : {};
    const session = await createSession({
      solveCaptcha: Boolean(body.solveCaptcha),
      useProxy: Boolean(body.useProxy),
      blockAds: Boolean(body.blockAds),
      dimensions: body.dimensions,
    });
    return json(200, { ...clientView(session), apiLog: popLog() });
  } catch (err) {
    console.error("[session-create] Error:", err.message);
    return json(err.message.includes("STEEL_API_KEY") ? 500 : 502, {
      error: "session_create_failed",
      detail: err.message, // message only — never the key
      apiLog: popLog(),
    });
  }
};

function json(statusCode, obj) {
  return { statusCode, headers: { "content-type": "application/json" }, body: JSON.stringify(obj) };
}
