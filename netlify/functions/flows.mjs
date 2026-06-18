// Expose the flow catalog to the client (banner + technical panel read this, R14/KTD9)
// so the UI never duplicates the server's source of truth.
import { ROUTES, FLOWS } from "./lib/flows.mjs";

export const handler = async () => ({
  statusCode: 200,
  headers: { "content-type": "application/json" },
  body: JSON.stringify({ routes: ROUTES, flows: FLOWS }),
});
