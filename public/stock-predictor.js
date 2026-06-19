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
    addLog({ method: "sessions.create", status: "error", description: session.detail || "Session creation failed" });
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
    if (res.evidence) appendEvidence(res.evidence);

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
      snippet: `fetch(url).catch(() => {}); // fire-and-forget wake\nawait page.goto("https://stockpredictors.onrender.com");`,
      desc: "Fires a background wake request to Render and navigates immediately.",
      proves: "Steel navigates while Render boots — no blocking wait on the function side.",
    },
    "await-boot": {
      title: "Waiting for Streamlit to boot… (Render free tier cold-start)",
      snippet: `await page.waitForSelector(".stApp", { timeout: 7000 });`,
      desc: "Polling for .stApp — each check is a fresh serverless call, safely under the 10s function limit.",
      proves: "Steel keeps the session alive across multiple polling cycles without re-creating the browser.",
    },
    predict: {
      title: "Entering ticker → clicking Predict",
      snippet: `await page.fill(input, "AAPL");\nawait page.click('button:has-text("Predict")');`,
      desc: "Agent fills the ticker input and clicks the Predict button.",
      proves: "Steel can interact with Streamlit widgets — real DOM events, not just scraping.",
    },
    extract: {
      title: "Extracting result — screenshot + scrape",
      snippet: `const shot = await page.screenshot({ type: "jpeg" });\nconst text = await page.evaluate(() => document.body.innerText);`,
      desc: "Screenshot captures what the model predicted; scraped text confirms fidelity.",
      proves: "Side-by-side screenshot vs text proves the agent saw the real prediction output.",
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
  const line = document.createElement("div");
  line.className = "log-line";
  line.innerHTML = `<span class="log-method">${entry.method || entry.call || "call"}</span>`
    + (entry.description ? ` <span class="log-desc">${entry.description}</span>` : "");
  // remove the initial placeholder
  const placeholder = log.querySelector(".muted");
  if (placeholder) placeholder.remove();
  log.appendChild(line);
  log.scrollTop = log.scrollHeight;
}

function appendEvidence(html) {
  const el = document.createElement("div");
  el.innerHTML = html;
  $("evidence").appendChild(el);
}

function showComparison(b64, text) {
  const section = $("compare-section");
  const card = $("compare-card");
  card.innerHTML = `
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:0.75rem;margin-top:0.5rem">
      <div>
        <div style="font-size:0.7rem;color:var(--muted);margin-bottom:0.3rem">Screenshot</div>
        <img src="data:image/jpeg;base64,${b64}" style="width:100%;border-radius:8px;border:1px solid var(--line);cursor:zoom-in"
          onclick="document.getElementById('shot-modal').classList.add('open');document.getElementById('shot-modal-img').src=this.src" />
      </div>
      <div>
        <div style="font-size:0.7rem;color:var(--muted);margin-bottom:0.3rem">Scraped text</div>
        <pre style="font-size:0.72rem;line-height:1.4;overflow:auto;max-height:220px;background:var(--panel2);padding:0.6rem;border-radius:8px;border:1px solid var(--line);white-space:pre-wrap;word-break:break-word;margin:0">${text.replace(/</g, "&lt;")}</pre>
      </div>
    </div>`;
  section.style.display = "block";
}
