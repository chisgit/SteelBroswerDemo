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

  try {
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
    setBanner("Ready — log in on the demo");
    $("run-btn").disabled = false;
    $("run-btn").addEventListener("click", () => {
      $("viewer").src = session.debugUrl + "?url=/login-persist-demo.html&interactive=false&showControls=true";
    });
  } catch (err) {
    console.error('[login-persist] Init error:', err);
    setBanner(`Steel session failed: ${err.message}`);
    addLog({ method: "sessions.create", params: {}, status: "error", detail: err.message });
    $("run-btn").disabled = false;
    $("run-btn").textContent = "Retry";
    $("run-btn").onclick = () => location.reload();
  }
}

function setBanner(title, feature = "") {
  $("banner-title").textContent = title;
  if (feature) {
    $("banner-feature").textContent = feature;
  }
}

function setSnippet(code, desc) {
  $("snippet-code").textContent = code;
  $("api-desc").textContent = desc;
}

function setProve(body, docsUrl) {
  $("prove-body").textContent = body;
  if (docsUrl) {
    $("prove-link").href = docsUrl;
  }
}

function addLog(entry) {
  callCount++;
  $("call-count").textContent = callCount + " calls";

  const line = document.createElement("div");
  line.className = "log-line";

  if (entry.status === "error") {
    line.className += " error";
    line.textContent = `❌ ${entry.method}: ${entry.detail || "error"}`;
  } else if (entry.status === "ok") {
    line.className += " ok";
    line.textContent = `✓ ${entry.method}`;
  } else {
    line.textContent = `→ ${entry.method}`;
  }

  $("api-log").appendChild(line);
  $("api-log").scrollTop = $("api-log").scrollHeight;
}
