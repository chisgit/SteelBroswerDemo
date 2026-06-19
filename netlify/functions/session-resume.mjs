import { record, popLog } from "./lib/logger.mjs";
import { retrieveSession } from "./lib/steel.mjs";

const STEEL_API_KEY = process.env.STEEL_API_KEY;

export const handler = async (event) => {
  try {
    if (!STEEL_API_KEY) {
      return json(500, { error: "STEEL_API_KEY not configured", apiLog: popLog() });
    }

    const body = event.body ? JSON.parse(event.body) : {};
    const { sessionId } = body;
    if (!sessionId) {
      return json(400, { error: "sessionId is required", apiLog: popLog() });
    }

    const session = await retrieveSession(sessionId);
    if (!session) {
      return json(404, {
        error: "session_not_live",
        detail: "Session is expired or no longer live",
        apiLog: popLog(),
      });
    }

    record("chromium.connectOverCDP (resume)", { sessionId: sessionId.slice(0, 8) + "..." }, "ready");

    return json(200, {
      sessionId: session.id,
      debugUrl: session.debugUrl,
      sessionViewerUrl: session.sessionViewerUrl,
      apiLog: popLog(),
    });
  } catch (err) {
    console.error("[session-resume] Error:", err.message);
    return json(502, { error: "session_resume_failed", detail: err.message, apiLog: popLog() });
  }
};

function json(statusCode, obj) {
  return { statusCode, headers: { "content-type": "application/json" }, body: JSON.stringify(obj) };
}
