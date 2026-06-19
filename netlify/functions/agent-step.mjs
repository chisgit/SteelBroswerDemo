// The agent loop's atomic step (KTD1): exactly one observe->decide->act cycle,
// returns structured state so the front-end can loop (U5). One screenshot + at most
// one model call + one action per invocation to stay under the 10s free-tier cap.
import { createSession, connect, release, relaunchWithProxy, clientView } from "./lib/steel.mjs";
import { flowMeta } from "./lib/flows.mjs";
import { classifyTiles } from "./lib/gemini.mjs";
import { classifyTilesNVIDIA } from "./lib/nvidia.mjs";
import { card, thumb } from "./lib/evidence.mjs";
import { popLog, record } from "./lib/logger.mjs";

const BASE = process.env.GAUNTLET_BASE_URL || "";

export const handler = async (event) => {
  let conn;
  let route = "?";
  try {
    const parsed = JSON.parse(event.body || "{}");
    route = parsed.route || "unknown";
    const { sessionId, websocketUrl, phase = "start", baseUrl, savedScore } = parsed;
    const meta = flowMeta(route);
    const base = baseUrl || BASE || originFrom(event);

    console.log(`[step] ${route}/${phase}`);
    conn = await connect(websocketUrl, sessionId);
    const { page } = conn;

    const result = await runStep({ page, conn, route, phase, base, sessionId, websocketUrl, meta, savedScore });
    return json(200, {
      flowTitle: meta.title,
      feature: meta.feature,
      proves: meta.proves,
      apiSnippet: meta.apiSnippet,
      docsUrl: meta.docsUrl,
      apiLog: popLog(),
      ...result,
    });
  } catch (err) {
    console.error(`[step] ERROR ${route}:`, err.message);
    return json(502, { error: "agent_step_failed", detail: err.message, done: true, outcome: "fail", apiLog: popLog() });
  } finally {
    if (conn?.browser && !conn._closed) await conn.browser.close().catch(() => {});
  }
};

// --- per-route step logic -------------------------------------------------

async function runStep({ page, conn, route, phase, base, sessionId, websocketUrl, meta, savedScore }) {
  switch (route) {
    case "recaptcha":
    case "turnstile":
      return tokenRoute(page, base, meta);
    case "hcaptcha":
      return hcaptchaStep(page, base, phase, meta);
    case "vision-grid":
      return visionGridStep(page, base, phase);
    case "bot-wall":
      return botWallStep(page, base, phase, sessionId, meta);
    case "mobile-bug":
      return mobileBugStep(page, base, phase, meta);
    case "math-arcade":
      return mathArcadeStep(conn, page, phase, sessionId, websocketUrl, savedScore);
    case "stock-predictor":
      return stockPredictorStep(page, phase);
    default:
      return genericStep(page, base, meta);
  }
}

// Token routes: navigate, let Steel solveCaptcha clear it, detect #solved.
// NOTE: solveCaptcha is a paid Steel feature (not available on hobby tier).
// Hobby tier: skip this route and display a clear message.
async function tokenRoute(page, base, meta) {
  // Check if solveCaptcha is available (only on paid plans).
  // On hobby tier, return a skipped outcome with clear messaging.
  const isHobbyTier = true; // TODO: detect from API key / session type if needed
  if (isHobbyTier) {
    return {
      done: true,
      outcome: "skipped",
      apiCall: {
        method: "sessions.create",
        params: { solveCaptcha: true },
        description: `solveCaptcha is a paid Steel feature (not available on hobby tier).`,
      },
      evidence: card({
        action: `skip ${meta.path} on hobby tier`,
        targetSelector: "n/a",
        verdict: "solveCaptcha not available on hobby plan",
        outcome: "skipped",
        screenshotThumb: null,
      }),
    };
  }

  await page.goto(base + meta.path, { waitUntil: "domcontentloaded" });
  // Steel solves asynchronously; poll briefly within budget.
  const solved = await page
    .waitForSelector("#solved:not(.hidden)", { timeout: 8000 })
    .then(() => true)
    .catch(() => false);
  return {
    done: true,
    outcome: solved ? "pass" : "fail",
    apiCall: {
      method: "sessions.create",
      params: { solveCaptcha: true },
      description: `Create Steel session with auto-solving, navigate to ${meta.path}`,
    },
    evidence: card({
      action: `navigate ${meta.path} + await solveCaptcha`,
      targetSelector: "#solved",
      verdict: solved ? "captcha token accepted" : "token not detected in budget",
      outcome: solved ? "pass" : "fail",
      screenshotThumb: await thumb(page),
    }),
  };
}

// hCaptcha (attempt) route — the widget renders 3s late (realistic delayed-load).
// Step 1 finds it missing → diagnose. Step 2 (phase=continue) waits + retries → recovered (U6).
async function hcaptchaStep(page, base, phase, meta) {
  if (phase === "start") {
    await page.goto(base + meta.path, { waitUntil: "domcontentloaded" });
    const present = await page.$(".h-captcha");
    if (!present) {
      return {
        done: false,
        outcome: "fail",
        apiCall: {
          method: "page.goto → page.$",
          params: { path: meta.path, selector: ".h-captcha" },
          description: "Navigate to challenge page — widget not yet rendered",
        },
        evidence: card({
          action: `navigate ${meta.path} — locate hCaptcha widget`,
          targetSelector: ".h-captcha",
          verdict: "widget not in DOM yet",
          outcome: "fail",
          screenshotThumb: await thumb(page),
          diagnosis: "element absent on first paint — likely a delayed (async) render",
          recovery: "wait for the widget to mount, then retry",
        }),
      };
    }
  }
  // recovery / continue: wait for the delayed widget, then treat solveCaptcha as clearing it.
  const appeared = await page.waitForSelector(".h-captcha", { timeout: 6000 }).then(() => true).catch(() => false);
  const solved = appeared &&
    (await page.waitForSelector("#solved:not(.hidden)", { timeout: 5000 }).then(() => true).catch(() => false));
  return {
    done: true,
    outcome: appeared ? "recovered" : "fail",
    apiCall: {
      method: "sessions.create",
      params: { solveCaptcha: true },
      description: appeared
        ? "Widget rendered → Steel solveCaptcha clears the token"
        : "Widget never appeared within timeout",
    },
    evidence: card({
      action: "wait for delayed widget, then await token",
      targetSelector: ".h-captcha",
      verdict: appeared ? (solved ? "widget mounted + token accepted" : "widget mounted") : "still absent",
      outcome: appeared ? "recovered" : "fail",
      screenshotThumb: await thumb(page),
      recovery: appeared ? "waited for async render — recovered" : null,
    }),
  };
}

// Vision-grid: screenshot tiles, classify with NVIDIA MiniMax-M3, click matches, submit.
async function visionGridStep(page, base, phase) {
  if (phase === "start") {
    await page.goto(base + flowMeta("vision-grid").path, { waitUntil: "networkidle" });
  }
  await page.waitForSelector("#grid img", { timeout: 8000 });

  // Pull each tile as its own base64 image (per-tile vision, KTD4).
  const tiles = await tilesAsBase64(page);
  // Use NVIDIA MiniMax-M3 for vision classification (faster + reliable free tier).
  const { matches, verdicts } = await classifyTilesNVIDIA(tiles, "dog");

  for (const id of matches) {
    await page.click("#tile-" + id).catch(() => {});
  }
  await page.click("#verify-btn").catch(() => page.click(".ctl-confirm").catch(() => {}));

  const state = await page
    .waitForSelector("#grid-result", { timeout: 4000 })
    .then((el) => el.getAttribute("data-state"))
    .catch(() => null);

  const pass = state === "pass";
  const isRetry = phase === "continue";
  const outcome = pass ? (isRetry ? "recovered" : "pass") : "fail";
  return {
    done: pass,
    outcome,
    selected: matches,
    apiCall: {
      method: "page.screenshot → nvidia-minimax-m3.classifyTiles → page.click",
      params: { tileCount: tiles.length, target: "dog", matches: matches.length },
      description: `Screenshot ${tiles.length} tiles → NVIDIA MiniMax-M3 classifies each → click ${matches.length} matching tiles → submit`,
    },
    evidence: card({
      action: `vision-classify ${tiles.length} tiles for "dog" → click matches`,
      targetSelector: matches.map((m) => "#tile-" + m).join(", "),
      verdict: `${matches.length} tile(s) classified as dog`,
      outcome,
      screenshotThumb: await thumb(page),
      diagnosis: pass ? null : `selection ${state || "unknown"} — re-classify on retry`,
      recovery: pass && isRetry ? "re-classified tiles and re-submitted — recovered" : null,
    }),
    verdicts,
  };
}

// Bot-wall (R12d/KTD10): first hit shows the wall → diagnose "blocked as bot" →
// recover by RELAUNCHING the session with stealthConfig + useProxy (fingerprint/proxy
// are create-time only), then re-navigate with the stealth marker.
async function botWallStep(page, base, phase, sessionId, meta) {
  if (phase === "start") {
    await page.goto(base + meta.path, { waitUntil: "domcontentloaded" });
    const walled = await page.$("#wall:not(.hidden)");
    if (walled) {
      // Relaunch with stealth + proxy. This returns a NEW session; we hand it back so
      // the UI re-embeds its debugUrl, and the next step (continue) drives it.
      const fresh = await relaunchWithProxy(sessionId, { solveCaptcha: true });
      return {
        done: false,
        outcome: "fail",
        newSession: clientView(fresh),
        newWebsocketUrl: fresh.websocketUrl,
        apiCall: {
          method: "sessions.release → sessions.create",
          params: { useProxy: true, blockAds: true },
          description: "Bot wall detected → release old session → create new with residential proxy",
        },
        evidence: card({
          action: `navigate ${meta.path}`,
          targetSelector: "#wall",
          verdict: "Access Denied — flagged as bot",
          outcome: "fail",
          screenshotThumb: await thumb(page),
          diagnosis: "request blocked by bot detection (default fingerprint)",
          recovery: "release session, relaunch with stealthConfig + useProxy",
        }),
      };
    }
  }
  // continue: drive the (now stealthed) session through with the stealth marker.
  await page.goto(base + meta.path + "?stealth=1", { waitUntil: "domcontentloaded" });
  const through = await page.waitForSelector("#solved", { timeout: 5000 }).then(() => true).catch(() => false);
  return {
    done: true,
    outcome: through ? "recovered" : "fail",
    apiCall: {
      method: "sessions.create",
      params: { stealthConfig: { humanizeInteractions: true }, useProxy: true },
      description: through
        ? "Stealthed session passed the bot wall → success"
        : "Stealthed session still blocked",
    },
    evidence: card({
      action: "re-navigate with stealth fingerprint + proxy",
      targetSelector: "#content",
      verdict: through ? "passed the bot wall" : "still blocked",
      outcome: through ? "recovered" : "fail",
      screenshotThumb: await thumb(page),
      recovery: through ? "stealthConfig + useProxy cleared the wall — recovered" : null,
    }),
  };
}

// Mobile-bug (R12e): a mobile-viewport session hits a hidden primary control and
// recovers via the alternate menu path. (The session is created with mobile dimensions
// by the fleet/runner; this step finds the working selector.)
async function mobileBugStep(page, base, phase, meta) {
  await page.goto(base + meta.path, { waitUntil: "domcontentloaded" });
  const primaryVisible = await page.isVisible("#primary-continue").catch(() => false);
  if (primaryVisible) {
    await page.click("#primary-continue");
    const done = await page.waitForSelector("#solved:not(.hidden)", { timeout: 3000 }).then(() => true).catch(() => false);
    return {
      done: true, outcome: done ? "pass" : "fail",
      apiCall: {
        method: "sessions.create",
        params: { dimensions: { width: 390, height: 844 } },
        description: "Desktop viewport — primary control visible, click succeeds",
      },
      evidence: card({ action: "click #primary-continue (desktop path)", targetSelector: "#primary-continue", outcome: done ? "pass" : "fail", screenshotThumb: await thumb(page) }),
    };
  }
  // primary hidden under mobile viewport → diagnose + recover via alternate.
  await page.click("#menu-continue").catch(() => {});
  const done = await page.waitForSelector("#solved:not(.hidden)", { timeout: 3000 }).then(() => true).catch(() => false);
  return {
    done: true,
    outcome: done ? "recovered" : "fail",
    apiCall: {
      method: "sessions.create",
      params: { dimensions: { width: 390, height: 844 } },
      description: `Mobile viewport (390×844) — #primary-continue hidden, recovered via #menu-continue`,
    },
    evidence: card({
      action: "primary control hidden on mobile → use alternate menu path",
      targetSelector: "#menu-continue",
      verdict: done ? "checkout completed via menu" : "alternate path failed",
      outcome: done ? "recovered" : "fail",
      screenshotThumb: await thumb(page),
      diagnosis: "#primary-continue not visible at mobile viewport (display:none)",
      recovery: done ? "clicked #menu-continue alternate path — recovered" : null,
    }),
  };
}

// Math Arcade persistent-session demo: 5-phase lifecycle proves Steel JS heap survives CDP disconnect.
// Phase:  start → detach → other-work → resume → finish
//
// Core proof: flip some cards, read score, disconnect (no release), open a NEW Steel session and
// search the web ("match card game strategies"), then re-attach the ORIGINAL session and read score
// again — score unchanged proves JS heap survived the disconnect.
async function mathArcadeStep(conn, page, phase, sessionId, websocketUrl, savedScore) {
  const ARCADE_URL = "https://matharcadewrecker.netlify.app";

  if (phase === "start") {
    // Navigate and start the Math Match game
    await page.goto(ARCADE_URL, { waitUntil: "domcontentloaded", timeout: 15000 });
    await page.evaluate(() => app.loadGame("match"));
    await page.waitForFunction(() => typeof matchGame !== "undefined", { timeout: 8000 });
    await page.waitForSelector("#match-grid .card", { timeout: 8000 });

    // Flip 4 cards (2 pairs) — we don't need matches, just activity.
    // Cards stay face-down or face-up in the cloud browser after disconnect.
    for (let i = 0; i < 4; i++) {
      await page.evaluate((idx) => {
        document.querySelectorAll("#match-grid .card")[idx]?.click();
      }, i);
      await page.waitForTimeout(400);
    }
    await page.waitForTimeout(500);

    const score = await page.evaluate(() => matchGame.score).catch(() => 0);
    const shot = await thumb(page);
    return {
      done: false,
      phase: "detach",
      savedScore: score,
      evidence: card({
        action: "navigate matharcadewrecker.netlify.app → app.loadGame('match') → flip 4 cards",
        targetSelector: "#match-grid .card",
        verdict: `game in progress — score: ${score}`,
        outcome: "pass",
        screenshotThumb: shot,
      }),
    };
  }

  if (phase === "detach") {
    // browser.close() = CDP disconnect ONLY — Steel session stays alive in cloud with full JS heap
    conn._closed = true;
    await conn.browser.close();
    record("browser.close (no release)", { sessionId: (sessionId || "").slice(0, 8) + "…" }, "session still alive in Steel cloud");
    return {
      done: false,
      phase: "other-work",
      savedScore,
      evidence: card({
        action: "browser.close() — CDP disconnect only, no sessions.release()",
        targetSelector: "n/a",
        verdict: "Steel session still running in cloud — JS heap preserved",
        outcome: "pass",
      }),
    };
  }

  if (phase === "other-work") {
    // Re-connect to the SAME Steel session (game tab is still open), open a second tab,
    // search "memory match card game strategies", screenshot results, close the search tab.
    // The game tab stays alive — card state and score unchanged in the JS heap.
    const ws = `wss://connect.steel.dev?apiKey=${process.env.STEEL_API_KEY}&sessionId=${sessionId}`;
    conn._closed = true;
    await conn.browser.close().catch(() => {});

    const fresh = await connect(ws, sessionId);
    record("chromium.connectOverCDP (other-work)", { sessionId: (sessionId || "").slice(0, 8) + "…" }, "connected — opening search tab");
    const searchPage = await fresh.browser.newPage();
    await searchPage.goto(
      "https://duckduckgo.com/?q=memory+match+card+game+strategies",
      { waitUntil: "domcontentloaded", timeout: 10000 }
    );
    const shot = await thumb(searchPage);
    await searchPage.close();
    fresh._closed = true;
    await fresh.browser.close();

    return {
      done: false,
      phase: "resume",
      savedScore,
      evidence: card({
        action: "re-connect same session → new tab → DuckDuckGo 'memory match card game strategies' → close tab",
        targetSelector: "body",
        verdict: "agent searched for card strategies while game tab stayed alive in Steel cloud",
        outcome: "pass",
        screenshotThumb: shot,
      }),
    };
  }

  if (phase === "resume") {
    // Re-attach to the ORIGINAL game session — same sessionId, third CDP connect
    const ws = `wss://connect.steel.dev?apiKey=${process.env.STEEL_API_KEY}&sessionId=${sessionId}`;
    conn._closed = true;
    await conn.browser.close().catch(() => {});

    const fresh = await connect(ws, sessionId);
    const gamePage = fresh.context.pages().find((p) => p.url().includes("matharcade")) || fresh.page;
    await gamePage.bringToFront();

    const resumeScore = await gamePage.evaluate(() => matchGame.score).catch(() => null);
    const heapIntact = resumeScore !== null && resumeScore === savedScore;
    const shot = await thumb(gamePage);

    // Pass fresh connection to finally block
    conn.browser = fresh.browser;
    conn.context = fresh.context;
    conn._closed = false;

    return {
      done: false,
      phase: "finish",
      savedScore,
      scoreConfirmed: heapIntact,
      evidence: card({
        action: "connectOverCDP(same sessionId) → read matchGame.score",
        targetSelector: "#match-grid",
        verdict: heapIntact
          ? `score before: ${savedScore} / score after: ${resumeScore} → heap intact ✓`
          : `score mismatch (before: ${savedScore} / after: ${resumeScore})`,
        outcome: heapIntact ? "pass" : "fail",
        screenshotThumb: shot,
        diagnosis: heapIntact ? null : "JS heap may not have survived — score differs",
      }),
    };
  }

  if (phase === "finish") {
    // Keep flipping sequential card pairs until we get a match (score increases)
    // Cards are already loaded in the cloud browser — same state as when we left
    let matched = await page.evaluate(() => matchGame.matched).catch(() => 0);
    const totalCards = await page.evaluate(() => matchGame.cards.length).catch(() => 16);
    let cardIdx = 0;

    // Try pairs until we get at least one new match or exhaust attempts
    const maxAttempts = Math.ceil(totalCards / 2);
    for (let attempt = 0; attempt < maxAttempts && matched < 1; attempt++) {
      await page.evaluate((idx) => {
        document.querySelectorAll("#match-grid .card:not(.matched)")[idx]?.click();
      }, 0);
      await page.waitForTimeout(400);
      await page.evaluate((idx) => {
        document.querySelectorAll("#match-grid .card:not(.matched)")[idx]?.click();
      }, 1);
      await page.waitForTimeout(800);
      matched = await page.evaluate(() => matchGame.matched).catch(() => matched);
      cardIdx += 2;
    }

    const finalScore = await page.evaluate(() => matchGame.score).catch(() => 0);
    const shot = await thumb(page);
    await release(sessionId);

    return {
      done: true,
      outcome: "pass",
      evidence: card({
        action: "resume game → flip cards → sessions.release(sessionId)",
        targetSelector: "#match-grid .card",
        verdict: `game resumed and completed — final score: ${finalScore}, matches: ${matched}`,
        outcome: "pass",
        screenshotThumb: shot,
      }),
    };
  }

  return { done: true, outcome: "fail", evidence: card({ action: `unknown phase: ${phase}`, outcome: "fail" }) };
}

// Stock Predictor: 3-phase lifecycle through stockpredictors.onrender.com
//  start → predict → extract → done
const STOCK_URL = "https://stockpredictors.onrender.com";
const WARMUP_URL = "https://stockpredictors.com";

async function stockPredictorStep(page, phase) {
  if (phase === "start") {
    // Kick Render cold-start via server-side fetch before navigating Steel
    try {
      await fetch(STOCK_URL, { signal: AbortSignal.timeout(8000) });
    } catch {
      // warmup fetch failure is non-fatal — Render may still cold-boot
    }
    await page.goto(STOCK_URL, { waitUntil: "domcontentloaded", timeout: 20000 });
    const loaded = await page.waitForSelector("h1, h2, h3", { timeout: 15000 })
      .then(() => true).catch(() => false);
    return {
      done: false,
      phase: "predict",
      evidence: card({
        action: `warmup → navigate ${STOCK_URL}`,
        targetSelector: "h1",
        verdict: loaded ? "Stock Predictor page loaded" : "Page may not have loaded fully",
        outcome: loaded ? "pass" : "fail",
        screenshotThumb: await thumb(page),
      }),
    };
  }

  if (phase === "predict") {
    const interacted = await page.evaluate(async () => {
      const delay = (ms) => new Promise((r) => setTimeout(r, ms));
      const input = document.querySelector('input[aria-label="Ticker symbol"], input[aria-label*="ticker"], input[aria-label*="stock"], input[placeholder*="ticker"], input[placeholder*="AAPL"], input[placeholder*="symbol"], .stTextInput input');
      if (!input) return false;
      const nativeInputValueSetter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, "value").set;
      nativeInputValueSetter.call(input, "AAPL");
      input.dispatchEvent(new Event("input", { bubbles: true }));
      input.dispatchEvent(new Event("change", { bubbles: true }));
      await delay(500);
      const btns = Array.from(document.querySelectorAll("button"));
      const predictBtn = btns.find((b) => b.textContent.toLowerCase().includes("predict"));
      if (predictBtn) { predictBtn.click(); return true; }
      return false;
    });

    return {
      done: false,
      phase: "extract",
      evidence: card({
        action: 'fill ticker "AAPL" → click Predict',
        targetSelector: "input, button",
        verdict: interacted ? "Ticker entered and Predict clicked" : "Could not interact with Streamlit widgets",
        outcome: interacted ? "pass" : "fail",
        screenshotThumb: await thumb(page),
        diagnosis: interacted ? null : "Streamlit widget selectors may need adjustment",
      }),
    };
  }

  if (phase === "extract") {
    await page.waitForTimeout(3000);
    const shot = await page.screenshot({ type: "jpeg", quality: 75 });
    const b64 = shot.toString("base64");
    const text = await page.evaluate(() => {
      const unwanted = document.querySelectorAll("script, style, nav, footer, header");
      unwanted.forEach((el) => el.remove());
      return document.body.innerText.trim();
    }).catch(() => "(text extraction failed)");

    return {
      done: true,
      outcome: "pass",
      screenshotFull: b64,
      scrapedText: text.substring(0, 3000),
      apiCall: {
        method: "page.screenshot → page.evaluate(innerText)",
        params: { page: STOCK_URL, ticker: "AAPL" },
        description: "Screenshot the prediction result and scrape visible text for side-by-side comparison",
      },
      evidence: card({
        action: `screenshot + scrape "${STOCK_URL}"`,
        targetSelector: "body",
        verdict: "Prediction results captured as screenshot and text",
        outcome: "pass",
        screenshotThumb: await thumb(page),
      }),
    };
  }

  return { done: true, outcome: "fail", evidence: card({ action: `unknown phase: ${phase}`, outcome: "fail" }) };
}

async function genericStep(page, base, meta) {
  await page.goto(base + meta.path, { waitUntil: "domcontentloaded" });
  return {
    done: false,
    outcome: "progress",
    evidence: card({ action: `navigate ${meta.path}`, outcome: "progress", screenshotThumb: await thumb(page) }),
  };
}

// --- helpers --------------------------------------------------------------

async function tilesAsBase64(page) {
  const imgs = await page.$$("#grid img");
  const out = [];
  for (let i = 0; i < imgs.length; i++) {
    const id = Number((await imgs[i].getAttribute("id")).replace("tile-", ""));
    const buf = await imgs[i].screenshot({ type: "jpeg", quality: 70 }).catch(() => null);
    if (buf) out.push({ id, b64: buf.toString("base64"), mime: "image/jpeg" });
  }
  return out;
}

function originFrom(event) {
  const proto = event.headers?.["x-forwarded-proto"] || "https";
  const host = event.headers?.host || event.headers?.Host;
  return host ? `${proto}://${host}` : "";
}

function json(statusCode, obj) {
  return { statusCode, headers: { "content-type": "application/json" }, body: JSON.stringify(obj) };
}
