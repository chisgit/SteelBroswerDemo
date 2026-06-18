// Pre-warm a Steel session on page load (KTD3) so cold-start doesn't eat the
// per-step 10s budget. Returns only the client-safe view (KTD2 / R10).
import { createSession, clientView } from "./lib/steel.js";

export const handler = async (event) => {
  try {
    const body = event.body ? JSON.parse(event.body) : {};
    const session = await createSession({
      solveCaptcha: true,                 // token routes solved by Steel
      stealth: Boolean(body.stealth),     // default off; bot-wall recovery turns it on
      useProxy: Boolean(body.useProxy),
      dimensions: body.dimensions,        // set for the mobile fleet agent
    });
    return json(200, clientView(session));
  } catch (err) {
    return json(err.message.includes("STEEL_API_KEY") ? 500 : 502, {
      error: "session_create_failed",
      detail: err.message, // message only — never the key
    });
  }
};

function json(statusCode, obj) {
  return { statusCode, headers: { "content-type": "application/json" }, body: JSON.stringify(obj) };
}
