import "dotenv/config.js";
import express from "express";
import cors from "cors";
import path from "path";
import { fileURLToPath } from "url";
import { handler as agentStepHandler } from "./netlify/functions/agent-step.mjs";
import { handler as sessionCreateHandler } from "./netlify/functions/session-create.mjs";
import { handler as flowsCatalogHandler } from "./netlify/functions/flows-catalog.mjs";

// Override for local dev
if (!process.env.GAUNTLET_BASE_URL || process.env.GAUNTLET_BASE_URL.includes("netlify")) {
  const PORT = process.env.PORT || 3000;
  process.env.GAUNTLET_BASE_URL = `http://localhost:${PORT}`;
}

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.static(path.join(__dirname, "public")));
app.use(express.json());

// Health check
app.get("/health", (req, res) => {
  res.json({ status: "ok" });
});

// Flows catalog endpoint
app.get("/api/flows", async (req, res) => {
  try {
    const result = await flowsCatalogHandler({});
    res.status(result.statusCode || 200).json(JSON.parse(result.body || "{}"));
  } catch (error) {
    console.error("Flows error:", error);
    res.status(500).json({ error: "flows_failed", detail: error.message });
  }
});

// Session creation endpoint — wrap Netlify handler
app.post("/api/session-create", async (req, res) => {
  try {
    const event = {
      body: JSON.stringify(req.body),
      headers: req.headers,
      requestContext: { http: { method: "POST" } },
    };

    const result = await sessionCreateHandler(event);
    res.status(result.statusCode || 200).json(JSON.parse(result.body || "{}"));
  } catch (error) {
    console.error("Session create error:", error);
    res.status(502).json({
      error: "session_create_failed",
      detail: error.message,
    });
  }
});

// Agent step endpoint — wrap Netlify handler
app.post("/api/agent-step", async (req, res) => {
  try {
    const event = {
      body: JSON.stringify(req.body),
      headers: req.headers,
      requestContext: { http: { method: "POST" } },
    };

    const result = await agentStepHandler(event);
    res.status(result.statusCode || 200).json(JSON.parse(result.body || "{}"));
  } catch (error) {
    console.error("Agent step error:", error);
    res.status(502).json({
      error: "agent_step_failed",
      detail: error.message,
      done: true,
      outcome: "fail",
    });
  }
});

app.listen(PORT, '0.0.0.0', () => {
  console.log(`Server running on port ${PORT}`);
});
