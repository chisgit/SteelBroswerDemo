const $ = (id) => document.getElementById(id);
const api = (name, body) =>
  fetch("/api/" + name, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body || {}) })
    .then((r) => r.json());

let session = null;
let callCount = 0;

init();

async function init() {
  setBanner("Pre-warming a Steel session…");
  setSnippet('await client.sessions.create({});', "Creating a Steel cloud browser session.");

  session = await api("session-create", {});
  if (session.error) {
    setBanner("Steel session failed — check API key");
    addLog({ method: "sessions.create", params: {}, status: "error", detail: session.detail || "Session creation failed" });
    return;
  }

  if (session.apiLog) session.apiLog.forEach(addLog);

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

    if (res.apiLog) res.apiLog.forEach(addLog);
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
  callCount++;
  $("call-count").textContent = `${callCount} call${callCount !== 1 ? "s" : ""}`;
  const log = $("api-log");
  const placeholder = log.querySelector(".muted");
  if (placeholder) placeholder.remove();

  const params = entry.params && Object.keys(entry.params).length
    ? Object.entries(entry.params).map(([k, v]) => `${k}: ${JSON.stringify(v)}`).join(", ")
    : null;

  const statusColor = entry.status === "ok" ? "var(--ok)"
    : (entry.status || "").startsWith("429") ? "var(--warn)"
    : "var(--muted)";

  const line = document.createElement("div");
  line.className = "log-line";
  line.innerHTML =
    `<span class="log-method">${entry.method || "call"}</span>` +
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
