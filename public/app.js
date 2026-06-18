// Front-end loop orchestrator (KTD1). Netlify free-tier functions cap at 10s, so the
// agent loop lives here: each /agent-step is one atomic cycle; we loop until a route
// is done, render evidence + flow banner + the active API snippet as we go.

const $ = (id) => document.getElementById(id);
const api = (name, body) =>
  fetch("/api/" + name, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body || {}) })
    .then((r) => r.json());

let FLOWS = {};
let ROUTES = [];
let RECIPES = {};
let activeRecipe = null;
let session = null;
const MAX_STEPS = 6; // safety bound per route (U6 recovery counts against this)

init();

async function init() {
  const cat = await fetch("/api/flows").then((r) => r.json());
  FLOWS = cat.flows;
  RECIPES = cat.recipes || {};
  activeRecipe = chooseRecipe(cat);
  ROUTES = activeRecipe.routes || cat.routes;
  renderRecipe(activeRecipe);
  renderRecipePicker();
  renderLegend();
  renderChips();
  showSnippet(ROUTES[0]);
  const ready = await prewarm();
  $("run-btn").disabled = !ready;
  $("fleet-btn").disabled = !ready;
  $("run-btn").addEventListener("click", runGauntlet);
  $("fleet-btn").addEventListener("click", runFleet);
}

async function prewarm() {
  setBanner({ title: "Pre-warming a Steel session…", feature: "sessions.create" });
  setSetup("Checking Steel session...", "Creating cloud browser before run starts.");
  session = await api("session-create", {});
  if (session.error) {
    setBanner({ title: "Steel session failed - check STEEL_API_KEY", feature: "" });
    setSetup("Add keys, then restart dev server", "$env:STEEL_API_KEY='your-steel-key'\n$env:GEMINI_API_KEY='your-gemini-key'\nnpm run dev -- --port 8888", true);
    return false;
  }
  $("viewer").src = session.debugUrl + "?interactive=false&showControls=true";
  setBanner({ title: "Ready - click Run demo", feature: "session ready" });
  setSetup("Ready", "Click Run demo.");
  return true;
}

async function runGauntlet() {
  $("run-btn").disabled = true;
  clearEvidence();
  for (const route of ROUTES) {
    setActiveChip(route);
    showSnippet(route);
    const outcome = await runRoute(route);
    setChipOutcome(route, outcome);
  }
  setBanner({ title: "Gauntlet complete", feature: "done" });
  $("run-btn").disabled = false;
}

async function runRoute(route) {
  const meta = FLOWS[route];
  setBanner({ title: meta.title, feature: meta.feature });
  let phase = "start";
  let last = "fail";
  for (let step = 0; step < MAX_STEPS; step++) {
    const res = await api("agent-step", {
      sessionId: session.sessionId,
      websocketUrl: session.websocketUrl, // server uses its own key; ok if null
      route,
      phase,
    });
    if (res.flowTitle) setBanner({ title: res.flowTitle, feature: res.feature });
    if (res.evidence) addEvidence(res.evidence);
    last = res.outcome || last;
    // recovery may swap the live session (bot-wall, U8) — re-embed + carry new ws
    if (res.newSession) {
      session = { ...res.newSession, websocketUrl: res.newWebsocketUrl };
      $("viewer").src = session.debugUrl + "?showControls=true";
    }
    if (res.done) break;
    phase = "continue";
  }
  return last;
}

async function runFleet() {
  $("fleet-btn").disabled = true;
  setBanner({ title: FLOWS["bot-wall"] ? "Parallel fleet — one route per session" : "Fleet", feature: "concurrency" });
  const res = await api("fleet-run", {});
  renderDash(res);
  $("fleet-btn").disabled = false;
}

// --- rendering ------------------------------------------------------------

function chooseRecipe(cat) {
  const requested = new URLSearchParams(window.location.search).get("recipe");
  return cat.recipes?.[requested] || cat.recipes?.[cat.defaultRecipeId] || {
    title: "Steel CAPTCHA Gauntlet",
    routes: cat.routes,
    summary: "All current demo routes.",
  };
}

function renderRecipe(recipe) {
  const title = $("recipe-title");
  const summary = $("recipe-summary");
  if (title) title.textContent = recipe.title || "Steel CAPTCHA Gauntlet";
  if (summary) summary.textContent = recipe.summary || "";
}

function setSetup(title, body, isCode = false) {
  $("setup-title").textContent = title;
  $("setup-body").innerHTML = isCode ? `<pre>${escapeHtml(body)}</pre>` : escapeHtml(body);
}

function renderRecipePicker() {
  const el = $("recipe-picker");
  if (!el) return;
  el.innerHTML = "";
  for (const [id, recipe] of Object.entries(RECIPES)) {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "recipe-option";
    btn.dataset.recipe = id;
    btn.innerHTML = `<span>${escapeHtml(recipe.title)}</span><small>${escapeHtml(recipe.routes.join(" -> "))}</small>`;
    btn.addEventListener("click", () => selectRecipe(id));
    el.appendChild(btn);
  }
  markSelectedRecipe();
}

function selectRecipe(id) {
  const recipe = RECIPES[id];
  if (!recipe) return;
  activeRecipe = recipe;
  ROUTES = recipe.routes || [];
  const url = new URL(window.location.href);
  url.searchParams.set("recipe", id);
  window.history.replaceState({}, "", url);
  renderRecipe(recipe);
  renderLegend();
  renderChips();
  showSnippet(ROUTES[0]);
  markSelectedRecipe(id);
}

function markSelectedRecipe(selectedId) {
  const activeId = selectedId || Object.entries(RECIPES).find(([, recipe]) => recipe === activeRecipe)?.[0];
  document.querySelectorAll(".recipe-option").forEach((btn) => {
    btn.classList.toggle("selected", btn.dataset.recipe === activeId);
  });
}

function setBanner({ title, feature }) {
  $("banner-title").textContent = title || "";
  $("banner-feature").textContent = feature || "";
}

function showSnippet(route) {
  const m = FLOWS[route];
  $("snippet-code").textContent = m.apiSnippet;
  $("snippet-proves").textContent = m.proves;
  $("snippet-docs").href = m.docsUrl;
}

function renderLegend() {
  const el = $("legend");
  if (!el) return;
  el.innerHTML = ROUTES.map((r) => {
    const m = FLOWS[r];
    const name = m.title.split(" — ")[0];
    return `<div class="legend-item"><span class="lname">${escapeHtml(name)}</span>
      <span class="lfeat mono">${escapeHtml(m.feature)}</span></div>`;
  }).join("");
}

function renderChips() {
  $("chips").innerHTML = "";
  for (const r of ROUTES) {
    const c = document.createElement("span");
    c.className = "chip"; c.id = "chip-" + r; c.textContent = FLOWS[r].title.split(" — ")[0];
    $("chips").appendChild(c);
  }
}
function setActiveChip(route) {
  document.querySelectorAll(".chip").forEach((c) => c.classList.remove("active"));
  $("chip-" + route)?.classList.add("active");
}
function setChipOutcome(route, outcome) {
  const c = $("chip-" + route);
  if (c) { c.classList.remove("active"); c.classList.add(outcome); }
}

function clearEvidence() { $("evidence").innerHTML = ""; }
function addEvidence(e) {
  const card = document.createElement("div");
  card.className = "ecard";
  const img = e.screenshotThumb ? `<img src="data:image/jpeg;base64,${e.screenshotThumb}" alt="step screenshot"/>` : `<div></div>`;
  card.innerHTML = `
    ${img}
    <div>
      <div class="act">${escapeHtml(e.action)}</div>
      ${e.targetSelector ? `<div class="sel mono">${escapeHtml(e.targetSelector)}</div>` : ""}
      ${e.verdict ? `<div class="verdict">${escapeHtml(e.verdict)}</div>` : ""}
      ${e.diagnosis ? `<div class="diag">⚠ ${escapeHtml(e.diagnosis)}</div>` : ""}
      ${e.recovery ? `<div class="rec">↻ ${escapeHtml(e.recovery)}</div>` : ""}
    </div>
    <span class="tag ${e.outcome}">${e.outcome}</span>`;
  $("evidence").appendChild(card);
  $("evidence").scrollTop = $("evidence").scrollHeight;
}

function renderDash(res) {
  if (!res || !res.results) { $("dash").innerHTML = `<p style="color:var(--bad)">Fleet failed: ${escapeHtml(res?.detail || "unknown")}</p>`; return; }
  $("dash").innerHTML = "";
  for (const row of res.results) {
    const el = document.createElement("div");
    el.className = "row";
    el.innerHTML = `<span>${escapeHtml(row.route)}</span>
      <div class="bar"><span class="seg ${row.outcome}" style="width:100%"></span></div>`;
    $("dash").appendChild(el);
  }
}

function escapeHtml(s) { return String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c])); }
