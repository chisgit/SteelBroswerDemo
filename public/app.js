const $ = (id) => document.getElementById(id);
const api = (name, body) =>
  fetch("/api/" + name, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body || {}) })
    .then((r) => r.json());

let FLOWS = {};
let ROUTES = [];
let RECIPES = {};
let activeRecipe = null;
let session = null;
const MAX_STEPS = 6;

init();

async function init() {
  const cat = await fetch("/api/flows").then((r) => r.json());
  FLOWS = cat.flows;
  RECIPES = cat.recipes || {};
  activeRecipe = chooseRecipe(cat);
  ROUTES = activeRecipe.routes || cat.routes;
  renderRecipe(activeRecipe);
  renderRecipePicker();
  renderChips();
  const ready = await prewarm();
  $("run-btn").disabled = !ready;
  $("fleet-btn").disabled = !ready;
  $("run-btn").addEventListener("click", runGauntlet);
  $("fleet-btn").addEventListener("click", runFleet);
}

function chooseRecipe(cat) {
  const requested = new URLSearchParams(window.location.search).get("recipe");
  return cat.recipes?.[requested] || cat.recipes?.[cat.defaultRecipeId] || {
    title: "Steel CAPTCHA Gauntlet",
    routes: cat.routes,
    summary: "All current demo routes.",
  };
}

function renderRecipe(recipe) {
  const pageTitle = $("page-title");
  const label = recipe.title || "Steel Demo";
  if (pageTitle) pageTitle.textContent = label;
  document.title = label + " — Steel Demo Hub";
}

async function prewarm() {
  setBanner("Pre-warming a Steel session…", "sessions.create");
  setApiCall("sessions.create", '{ /* hobby tier: no solveCaptcha */ }', "Creating a cloud browser via Steel's Sessions API.");
  setProve("Steel creates a real cloud browser session on demand.", "");
  session = await api("session-create", {});
  if (session.error) {
    setBanner("Steel session failed — check API key", "");
    setApiCall("sessions.create", '{ }', "Error: " + session.detail);
    return false;
  }
  $("viewer").src = session.debugUrl + "?interactive=false&showControls=true";
  $("sval-id").textContent = session.sessionId || "—";
  $("sval-status").textContent = "connected";
  $("sval-status").className = "sval ok";
  setBanner("Ready — click Run demo", "session ready");
  setApiCall("sessions.create", '{ id: "' + (session.sessionId || "").slice(0, 8) + '…" }', "Session created. Cloud browser is live.");
  return true;
}

async function runGauntlet() {
  $("run-btn").disabled = true;
  clearEvidence();
  for (const route of ROUTES) {
    setActiveChip(route);
    const meta = FLOWS[route];
    setBanner(meta.title, meta.feature);
    setApiCall("—", "{ awaiting step… }", meta.proves);
    setProve(meta.proves, meta.docsUrl);
    const outcome = await runRoute(route);
    setChipOutcome(route, outcome);
  }
  setBanner("Demo complete — all routes finished", "done");
  $("run-btn").disabled = false;
}

async function runRoute(route) {
  let phase = "start";
  let last = "fail";
  for (let step = 0; step < MAX_STEPS; step++) {
    const res = await api("agent-step", {
      sessionId: session.sessionId,
      websocketUrl: session.websocketUrl,
      route,
      phase,
    });
    if (res.flowTitle) setBanner(res.flowTitle, res.feature);
    if (res.apiCall) setApiCall(res.apiCall.method, JSON.stringify(res.apiCall.params, null, 2), res.apiCall.description);
    if (res.proves) setProve(res.proves, res.docsUrl);
    if (res.evidence) addEvidence(res.evidence);
    last = res.outcome || last;
    if (res.newSession) {
      session = { ...res.newSession, websocketUrl: res.newWebsocketUrl };
      $("viewer").src = session.debugUrl + "?showControls=true";
      $("sval-id").textContent = session.sessionId || "—";
      setApiCall("sessions.create (stealth relaunch)", '{ stealthConfig: { humanizeInteractions: true }, useProxy: true }', "Released old session, created new stealthed session.");
    }
    if (res.done) break;
    phase = "continue";
  }
  return last;
}

async function runFleet() {
  $("fleet-btn").disabled = true;
  setBanner("Parallel fleet — one route per session", "concurrency");
  setApiCall("sessions.create (×N)", '{ N concurrent sessions }', "Launching multiple sessions in parallel, each on a different route.");
  const res = await api("fleet-run", {});
  renderDash(res);
  $("fleet-btn").disabled = false;
}

// --- rendering helpers -----------------------------------------------------

function setBanner(title, feature) {
  $("banner-title").textContent = title || "";
  $("banner-feature").textContent = feature || "";
}

function setApiCall(method, params, description) {
  $("api-method").textContent = method || "—";
  $("api-params").textContent = params || "—";
  $("api-desc").textContent = description || "";
}

function setProve(body, docsUrl) {
  $("prove-body").textContent = body || "";
  if (docsUrl) { $("prove-link").href = docsUrl; $("prove-link").style.display = "inline"; }
  else { $("prove-link").style.display = "none"; }
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
    btn.innerHTML = `<span>${esc(recipe.title)}</span><small>${esc(recipe.routes.join(" → "))}</small>`;
    btn.addEventListener("click", () => selectRecipe(id));
    el.appendChild(btn);
  }
}

function renderChips() {
  $("chips").innerHTML = "";
  for (const r of ROUTES) {
    const m = FLOWS[r];
    const c = document.createElement("span");
    c.className = "chip"; c.id = "chip-" + r;
    const name = (m.title || r).split(" — ")[0];
    c.textContent = name;
    c.title = m.proves || "";
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
      <div class="act">${esc(e.action)}</div>
      ${e.targetSelector ? `<div class="sel mono">${esc(e.targetSelector)}</div>` : ""}
      ${e.verdict ? `<div class="verdict">${esc(e.verdict)}</div>` : ""}
      ${e.diagnosis ? `<div class="diag">⚠ ${esc(e.diagnosis)}</div>` : ""}
      ${e.recovery ? `<div class="rec">↻ ${esc(e.recovery)}</div>` : ""}
    </div>
    <span class="tag ${e.outcome}">${e.outcome}</span>`;
  $("evidence").appendChild(card);
  $("evidence").scrollTop = $("evidence").scrollHeight;
}

function renderDash(res) {
  if (!res || !res.results) { $("dash").innerHTML = `<p style="color:var(--bad)">Fleet failed: ${esc(res?.detail || "unknown")}</p>`; return; }
  $("dash").innerHTML = "";
  for (const row of res.results) {
    const el = document.createElement("div");
    el.className = "row";
    el.innerHTML = `<span>${esc(row.route)}</span>
      <div class="bar"><span class="seg ${row.outcome}" style="width:100%"></span></div>`;
    $("dash").appendChild(el);
  }
}

function esc(s) { return String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c])); }
