const $ = (id) => document.getElementById(id);
const api = (name, body) =>
  fetch("/api/" + name, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body || {}) })
    .then((r) => r.json());

let session = null;
let callCount = 0;
let lastLogKey = null; // for deduplication

init();

async function init() {
  setBanner("Pre-warming a Steel session…");
  setSnippet('await client.sessions.create({});', "Creating a Steel cloud browser session.");

  try {
    // Add timeout to prevent hanging
    const timeoutPromise = new Promise((_, reject) => 
      setTimeout(() => reject(new Error('Session creation timeout')), 15000)
    );
    const apiPromise = api("session-create", {});
    session = await Promise.race([apiPromise, timeoutPromise]);
    
    if (session.error) {
      setBanner("Steel session failed — check API key");
      addLog({ method: "sessions.create", params: {}, status: "error", detail: session.detail || "Session creation failed" });
      return;
    }

    if (session.apiLog) {
      session.apiLog.forEach(entry => addLog({ ...entry, _phase: "session-create" }));
    }

    // Defensive check for debugUrl
    if (!session.debugUrl) {
      throw new Error('Invalid session: missing debugUrl');
    }

    $("viewer").src = session.debugUrl + "?interactive=false&showControls=true";
    $("sval-id").textContent = (session.sessionId || "").slice(0, 16) + "…";
    $("sval-status").textContent = "connected";
    $("sval-status").className = "sval ok";

    setSnippet(
      `const session = await client.sessions.create({});\n// sessionId: "${(session.sessionId || "").slice(0, 8)}…"`,
      "Session live — Steel cloud browser ready."
    );
    setBanner("Ready — click Run demo");
    $("run-btn").disabled = false;
    $("run-btn").addEventListener("click", runDemo);
  } catch (err) {
    console.error('[stock-predictor] Init error:', err);
    setBanner(`Steel session failed: ${err.message}`);
    addLog({ method: "sessions.create", params: {}, status: "error", detail: err.message });
    $("run-btn").disabled = false;
    // Enable retry on click
    $("run-btn").textContent = "Retry";
    $("run-btn").onclick = () => location.reload();
  }
}

async function runDemo() {
  $("run-btn").disabled = true;
  $("compare-section").style.display = "none";
  $("evidence").innerHTML = "";

  let phase = "start";
  const MAX_STEPS = 20; // allows up to ~10 await-boot polls (7s each) before giving up

  for (let step = 0; step < MAX_STEPS; step++) {
    const meta = phaseMetadata(phase);
    setBanner(meta.title);
    if (meta.snippet) setSnippet(meta.snippet, meta.desc);
    if (meta.proves) setProve(meta.proves);

    const res = await api("agent-step", {
      sessionId: session.sessionId,
      websocketUrl: session.websocketUrl,
      route: "stock-predictor",
      phase,
    });

    if (res.apiLog) {
      res.apiLog.forEach(entry => addLog({ ...entry, _phase: phase, _step: res.step }));
    }
    if (res.evidence) appendEvidence(res.evidence, meta.proves);

    if (res.screenshotFull && res.scrapedText) {
      showComparison(res.screenshotFull, res.scrapedText);
    }

    if (res.done) break;
    phase = res.phase;
  }

  setBanner("Done — prediction extracted");
  $("run-btn").disabled = false;
  $("run-btn").textContent = "Run again";
  $("run-btn").addEventListener("click", () => location.reload(), { once: true });
}

function phaseMetadata(phase) {
  const map = {
    start: {
      title: "Navigating to Stock Predictor…",
      snippet: `fetch(url).catch(() => {}); // fire-and-forget Render wake\nawait page.goto("https://stockpredictors.onrender.com");`,
      desc: "Fires a background wake request to Render, then Steel navigates immediately.",
      proves: "Steel navigates any URL in a live cloud browser with full JS execution.",
    },
    "await-boot": {
      title: "Waiting for Streamlit to boot… (Render free tier cold-start ~30s)",
      snippet: `await page.waitForSelector(".stApp", { timeout: 7000 });`,
      desc: "Each poll is a separate serverless call — safely under Netlify's 10s function limit.",
      proves: "Steel keeps the session alive across multiple polling cycles without re-creating the browser.",
    },
    predict: {
      title: "Entering ticker AAPL → clicking Predict",
      snippet: `// Streamlit needs native input events\nnativeInputValueSetter.call(input, "AAPL");\ninput.dispatchEvent(new Event("input", { bubbles: true }));\npredictBtn.click();`,
      desc: "Agent sets the ticker value via native DOM setter (required for React/Streamlit) and clicks Predict.",
      proves: "Steel executes real DOM events — Streamlit receives the input exactly as a human would trigger it.",
    },
    extract: {
      title: "Extracting result — screenshot + scrape",
      snippet: `const shot = await page.screenshot({ type: "jpeg", quality: 75 });\nconst text = await page.evaluate(() => document.body.innerText);`,
      desc: "Full-page screenshot captures the rendered prediction; innerText scrape extracts the raw output.",
      proves: "Side-by-side comparison below confirms the agent saw exactly what the model predicted.",
    },
  };
  return map[phase] || { title: phase, snippet: "", desc: "", proves: "" };
}

function setBanner(title) {
  $("banner-title").textContent = title;
}

function setSnippet(code, desc) {
  $("snippet-code").textContent = code;
  $("api-desc").textContent = desc || "";
}

function setProve(text) {
  $("prove-body").textContent = text || "";
}

function addLog(entry) {
  // Filter: only show "interesting" Steel/dev API calls, skip internal record() noise
  const interestingMethods = [
    "sessions.create",
    "sessions.release",
    "sessions.releaseAll",
    "chromium.connectOverCDP",
    "page.goto",
    "page.waitForSelector",
    "page.screenshot",
    "page.evaluate",
    "page.mouse.click",
    "page.click",
    "page.fill",
    "page.type",
    "stockPredictor.predict",
    "stockPredictor.extract",
    "nvidia-find-element",
    "nvidia-vision",
    "gemini.classifyTiles",
  ];
  
  const method = entry.method || "call";
  const isInteresting = interestingMethods.some(m => method.includes(m)) || 
                        (entry.status && entry.status !== "invoking"); // show completed/failed calls
  
  if (!isInteresting) return;

  // Deduplication key: method + phase + step + detail (first 80 chars)
  const dedupeKey = `${method}|${entry._phase || ""}|${entry._step || ""}|${(entry.detail || "").slice(0, 80)}`;
  if (dedupeKey === lastLogKey) return;
  lastLogKey = dedupeKey;

  callCount++;
  $("call-count").textContent = `${callCount} call${callCount !== 1 ? "s" : ""}`;
  const log = $("api-log");
  const placeholder = log.querySelector(".muted");
  if (placeholder) placeholder.remove();

  const params = entry.params && Object.keys(entry.params).length
    ? Object.entries(entry.params).map(([k, v]) => `${k}: ${JSON.stringify(v)}`).join(", ")
    : null;

  // Build phase/step badge
  const phaseBadge = entry._phase 
    ? `<span style="font-size:0.65rem;padding:0.1rem 0.35rem;background:var(--panel2);border:1px solid var(--line);border-radius:3px;margin-right:0.4rem;font-family:monospace">${entry._phase}${entry._step ? "·" + entry._step : ""}</span>`
    : "";

  const statusColor = entry.status === "ok" ? "var(--ok)"
    : (entry.status || "").startsWith("429") ? "var(--warn)"
    : entry.status === "invoking" ? "var(--accent)"
    : "var(--muted)";

  const line = document.createElement("div");
  line.className = "log-line";
  line.innerHTML =
    `${phaseBadge}<span class="log-method">${method}</span>` +
    (params ? ` <span class="log-desc" style="color:var(--muted);font-size:0.78em">{ ${params} }</span>` : "") +
    (entry.status ? ` <span class="log-desc" style="color:${statusColor}">→ ${entry.status}</span>` : "") +
    (entry.detail ? ` <span class="log-desc" style="color:var(--muted);font-size:0.75em">${entry.detail}</span>` : "");

  log.appendChild(line);
  log.scrollTop = log.scrollHeight;
}

// Render a card object (from evidence.mjs) as a visible evidence row
function appendEvidence(card, proves) {
  if (!card || typeof card !== "object") return;
  const outcome = card.outcome || "progress";
  const color = outcome === "pass" ? "var(--ok)"
    : outcome === "fail" ? "var(--bad)"
    : outcome === "warn" ? "var(--warn)"
    : "var(--muted)";

  const row = document.createElement("div");
  row.style.cssText = "display:flex;gap:0.75rem;align-items:flex-start;padding:0.6rem 0;border-bottom:1px solid var(--line)";

  const thumbHtml = card.screenshotThumb
    ? `<img src="data:image/jpeg;base64,${card.screenshotThumb}"
        style="width:80px;height:52px;object-fit:cover;border-radius:6px;border:1px solid var(--line);flex-shrink:0;cursor:zoom-in"
        onclick="document.getElementById('shot-modal').classList.add('open');document.getElementById('shot-modal-img').src=this.src" />`
    : `<div style="width:80px;height:52px;background:var(--panel2);border-radius:6px;border:1px solid var(--line);flex-shrink:0"></div>`;

  row.innerHTML = thumbHtml + `
    <div style="flex:1;min-width:0">
      <div style="display:flex;align-items:center;gap:0.5rem;margin-bottom:0.2rem">
        <span style="font-size:0.7rem;font-weight:700;text-transform:uppercase;color:${color}">${outcome}</span>
        <code style="font-size:0.78rem;color:var(--ink)">${card.action || ""}</code>
      </div>
      ${card.verdict ? `<div style="font-size:0.8rem;color:var(--muted);margin-bottom:0.15rem">${card.verdict}</div>` : ""}
      ${proves ? `<div style="font-size:0.72rem;color:var(--accent)">✓ ${proves}</div>` : ""}
      ${card.diagnosis ? `<div style="font-size:0.72rem;color:var(--warn)">⚠ ${card.diagnosis}</div>` : ""}
    </div>`;

  $("evidence").appendChild(row);
}

function showComparison(b64, text) {
  const card = $("compare-card");
  card.innerHTML = `
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:0.75rem;margin-top:0.5rem">
      <div>
        <div style="font-size:0.7rem;color:var(--muted);margin-bottom:0.3rem;text-transform:uppercase;letter-spacing:0.05em">Screenshot (what Steel saw)</div>
        <img src="data:image/jpeg;base64,${b64}"
          style="width:100%;border-radius:8px;border:1px solid var(--line);cursor:zoom-in;display:block"
          onclick="document.getElementById('shot-modal').classList.add('open');document.getElementById('shot-modal-img').src=this.src" />
      </div>
      <div>
        <div style="font-size:0.7rem;color:var(--muted);margin-bottom:0.3rem;text-transform:uppercase;letter-spacing:0.05em">Scraped text (innerText extract)</div>
        <pre style="font-size:0.72rem;line-height:1.45;overflow:auto;max-height:260px;background:var(--panel2);padding:0.6rem;border-radius:8px;border:1px solid var(--line);white-space:pre-wrap;word-break:break-word;margin:0;color:var(--ink)">${text.replace(/&/g,"&amp;").replace(/</g,"&lt;")}</pre>
      </div>
    </div>`;
  $("compare-section").style.display = "block";
}
