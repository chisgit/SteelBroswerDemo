# Sessions and Browser Loading

## How to Get the Session Loaded and Ready

### Problem
Multiple demo pages (gauntlet-ui.html, login-persist.html, stock-predictor.html) need to load a Steel cloud browser session on page load. Without proper initialization, the viewer iframe stays empty and no session connects.

### Root Cause
Pages must:
1. Call `/api/session-create` endpoint via POST (returns sessionId, debugUrl, etc)
2. Have `/api/flows` endpoint available (for recipe/route metadata)
3. Set iframe.src to `session.debugUrl + "?interactive=false&showControls=true"`
4. Handle async timeout (session creation can take up to 15s)

### Solution Pattern

**JavaScript (client-side):**
```javascript
const api = (name, body) =>
  fetch("/api/" + name, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body || {}) })
    .then((r) => r.json());

async function init() {
  const timeoutPromise = new Promise((_, reject) => 
    setTimeout(() => reject(new Error('Session creation timeout')), 15000)
  );
  const apiPromise = api("session-create", {});
  const session = await Promise.race([apiPromise, timeoutPromise]);
  
  // Verify session.debugUrl exists
  if (!session.debugUrl) throw new Error('Invalid session: missing debugUrl');
  
  // Set iframe to live Steel browser
  document.getElementById("viewer").src = session.debugUrl + "?interactive=false&showControls=true";
}

init();
```

**Backend (Netlify function or Express route):**
- `/api/session-create` — calls Steel SDK `client.sessions.create()`, returns sessionId + debugUrl
- `/api/flows` — returns flow metadata, recipes, routes (needed by gauntlet-ui.html)

### Key Gotchas

**1. debugUrl missing:** If session.debugUrl is undefined, iframe won't load. Verify Steel SDK returned it.

**2. Timeout too short:** Set timeout ≥ 15s. Session creation involves cloud provisioning.

**3. Missing /api/flows:** If gauntlet-ui tries to fetch `/api/flows` and it 404s, page never renders session UI. Must export flows catalog from Netlify function or Express.

**4. iframe.src needs query params:** Bare debugUrl won't show controls. Always append `?interactive=false&showControls=true`.

**5. ES module conflicts:** If .js files treated as ESM but code uses `require()`, Render will fail. Ensure all imports use ES module syntax.

### Example: login-persist.html

```javascript
// 1. Prewarm session on page load
async function init() {
  const session = await api("session-create", {});
  
  // 2. Set viewer iframe
  document.getElementById("viewer").src = session.debugUrl + "?interactive=false&showControls=true";
  
  // 3. Display session info (optional)
  document.getElementById("sval-id").textContent = session.sessionId.slice(0, 16) + "…";
  document.getElementById("sval-status").textContent = "connected";
}
```

Then navigate within the iframe to load a demo page:
```javascript
document.getElementById("viewer").src = session.debugUrl + "?url=/login-persist-demo.html&interactive=false&showControls=true";
```

### Files Involved
- `netlify/functions/session-create.mjs` — Steel API handler
- `netlify/functions/flows-catalog.mjs` — Recipe/flows metadata
- `server.mjs` + `server.js` — Local Express routes (must mirror Netlify endpoints)
- `public/*.html` + `public/*.js` — Client-side session init code

### Deploy Notes
- Render auto-deploys on push to main
- ES module conversion must be complete (all require → import)
- Host binding must be `0.0.0.0` for Render cloud
- Manual redeploy sometimes needed if Render caches old code
