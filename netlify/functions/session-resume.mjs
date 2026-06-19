// Return the websocket URL for an existing Steel session so the agent can re-attach
// without releasing it. The URL is deterministic: Steel's CDP endpoint + apiKey + sessionId.
// Logging this call as "chromium.connectOverCDP (resume)" keeps the API console accurate.
import { record } from "./lib/logger.mjs";
import { popLog } from "./lib/logger.mjs";

const STEEL_API_KEY = process.env.STEEL_API_KEY;

export const handler = async (event) => {
  try {
    if (!STEEL_API_KEY) {
      return json(500, { error: "STEEL_API_KEY not configured" });
    }
    const body = event.body ? JSON.parse(event.body) : {};
    const { sessionId } = body;
    if (!sessionId) {
      return json(400, { error: "sessionId is required" });
    }

    const websocketUrl = `wss://connect.steel.dev?apiKey=${STEEL_API_KEY}&sessionId=${sessionId}`;
    record("chromium.connectOverCDP (resume)", { sessionId: sessionId.slice(0, 8) + "…" }, "ready");

    return json(200, { websocketUrl, apiLog: popLog() });
  } catch (err) {
    console.error("[session-resume] Error:", err.message);
    return json(502, { error: "session_resume_failed", detail: err.message });
  }
};

function json(statusCode, obj) {
  return { statusCode, headers: { "content-type": "application/json" }, body: JSON.stringify(obj) };
}
