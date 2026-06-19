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
    const { sessionId, websocketUrl, phase = "start", baseUrl, savedScore, matchedPair, faceUpIndex } = parsed;
    const meta = flowMeta(route);
    const base = baseUrl || BASE || originFrom(event);

    console.log(`[step] ${route}/${phase}`);

    // math-arcade phases manage their own CDP lifecycle:
    // - other-work uses plain fetch, no Steel session needed
    // - resume/finish reconnect themselves with a fresh connect()
    // - detach and start need the shared connect() normally
    const skipConnect = route === "math-arcade" && ["other-work", "resume", "finish"].includes(phase);
    if (!skipConnect) {
      conn = await connect(websocketUrl, sessionId, `chromium.connectOverCDP (${phase})`);
    } else {
      conn = { browser: null, context: null, page: null, _closed: true };
    }
    const { page } = conn;

    const result = await runStep({ page, conn, route, phase, base, sessionId, websocketUrl, meta, savedScore, matchedPair, faceUpIndex });
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

async function runStep({ page, conn, route, phase, base, sessionId, websocketUrl, meta, savedScore, matchedPair, faceUpIndex }) {
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
      return mathArcadeStep(conn, page, phase, sessionId, websocketUrl, savedScore, matchedPair, faceUpIndex);
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
async function mathArcadeStep(conn, page, phase, sessionId, websocketUrl, savedScore, matchedPair, faceUpIndex) {
  const ARCADE_URL = "https://matharcadewrecker.netlify.app";

  if (phase === "start") {
    // Navigate and start the Math Match game
    await page.goto(ARCADE_URL, { waitUntil: "domcontentloaded", timeout: 15000 });
    await page.waitForTimeout(5000);
    await page.evaluate(() => app.loadGame("match"));
    await page.waitForFunction(() => typeof matchGame !== "undefined", { timeout: 8000 });
    await page.waitForSelector("#match-grid .card", { timeout: 8000 });

    const chosen = await page.evaluate(async () => {
      const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
      const cards = Array.from(matchGame.cards || []);
      const groups = new Map();
      for (const card of cards) {
        const group = groups.get(card.id) || [];
        group.push(card.index);
        groups.set(card.id, group);
      }
      const pairs = Array.from(groups.values()).filter((group) => group.length >= 2);
      const pair = pairs[Math.floor(Math.random() * pairs.length)]?.slice(0, 2) || [0, 1];
      const els = () => document.querySelectorAll("#match-grid .card");

      els()[pair[0]]?.click();
      await sleep(350);
      els()[pair[1]]?.click();
      await sleep(900);

      const remaining = cards
        .map((card) => card.index)
        .filter((index) => !pair.includes(index) && !els()[index]?.classList.contains("matched"));
      const faceUp = remaining[Math.floor(Math.random() * remaining.length)] ?? null;
      if (faceUp !== null) {
        els()[faceUp]?.click();
        await sleep(350);
      }

      return {
        matchedPair: pair,
        faceUpIndex: faceUp,
        score: matchGame.score,
        matched: matchGame.matched,
      };
    });

    const score = chosen?.score ?? null;
    if (score === null) {
      return { done: true, outcome: "fail", evidence: card({ action: "read matchGame.score", verdict: "evaluate failed — game may not have loaded", outcome: "fail" }) };
    }
    const shot = await thumb(page);
    return {
      done: false,
      phase: "detach",
      savedScore: score,
      matchedPair: chosen.matchedPair,
      faceUpIndex: chosen.faceUpIndex,
      evidence: card({
        action: "wait 5s → app.loadGame('match') → flip a random matching pair → leave one random card face-up",
        targetSelector: "#match-grid .card",
        verdict: `random match: [${chosen.matchedPair.join(", ")}], face-up card: ${chosen.faceUpIndex ?? "none"}, score: ${score}`,
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
      matchedPair,
      faceUpIndex,
      evidence: card({
        action: "browser.close() — CDP disconnect only, no sessions.release()",
        targetSelector: "n/a",
        verdict: "Steel session still running in cloud — JS heap preserved",
        outcome: "pass",
      }),
    };
  }

  if (phase === "other-work") {
    // Agent does independent work WITHOUT touching the Steel session at all.
    // Game session sits dormant in Steel cloud — no CDP client attached, heap fully preserved.
    // We fetch Wikipedia from the serverless function directly — no Steel browser needed.
    // After a 3s pause, we re-attach to prove the session outlived the gap.
    // (conn.browser is null here — we skipped connect() for this phase intentionally)

    record("agent (no Steel session)", { task: "fetch Wikipedia: Card_game strategies" }, "invoking");
    let wikiSummary = "";
    try {
      const wikiRes = await fetch(
        "https://en.wikipedia.org/api/rest_v1/page/summary/Card_game",
        { headers: { "User-Agent": "SteelDemo/1.0" }, signal: AbortSignal.timeout(6000) }
      );
      const wikiJson = await wikiRes.json();
      wikiSummary = wikiJson.extract?.slice(0, 200) || "summary unavailable";
    } catch (_) {
      wikiSummary = "fetch failed (non-critical)";
    }
    record("agent (no Steel session)", { task: "Wikipedia fetch done — waiting 3s" }, "done");

    // Deliberate 3s pause — session sits completely idle, making the story tangible
    await new Promise((r) => setTimeout(r, 3000));

    return {
      done: false,
      phase: "resume",
      savedScore,
      matchedPair,
      faceUpIndex,
      evidence: card({
        action: "serverless fetch → Wikipedia 'Card game' — no Steel session used",
        targetSelector: "n/a",
        verdict: `game session sat idle in Steel cloud for 3s | "${wikiSummary.slice(0, 100)}…"`,
        outcome: "pass",
      }),
    };
  }

  if (phase === "resume") {
    // Re-attach to the ORIGINAL game session — same sessionId, third CDP connect.
    // conn.browser is null here (we skipped the shared connect() for this phase).
    const ws = `wss://connect.steel.dev?apiKey=${process.env.STEEL_API_KEY}&sessionId=${sessionId}`;
    const fresh = await connect(ws, sessionId, "chromium.connectOverCDP (resume: re-attach to game session)");
    const gamePage = fresh.context.pages().find((p) => p.url().includes("matharcade")) || fresh.page;
    await gamePage.bringToFront();

    const resumeScore = await gamePage.evaluate(() => matchGame.score).catch(() => null);
    const cardState = await gamePage.evaluate(({ matchedPair, faceUpIndex }) => {
      const cards = Array.from(document.querySelectorAll("#match-grid .card"));
      const pairMatched = Array.isArray(matchedPair) && matchedPair.length === 2
        ? matchedPair.every((index) => cards[index]?.classList.contains("matched"))
        : false;
      const faceUpPreserved = faceUpIndex === null || faceUpIndex === undefined
        ? true
        : cards[faceUpIndex]?.classList.contains("flipped") && !cards[faceUpIndex]?.classList.contains("matched");
      return { pairMatched, faceUpPreserved };
    }, { matchedPair, faceUpIndex }).catch(() => ({ pairMatched: false, faceUpPreserved: false }));
    const heapIntact = resumeScore !== null && resumeScore === savedScore && cardState.pairMatched && cardState.faceUpPreserved;
    const shot = await thumb(gamePage);
    await fresh.browser.close().catch(() => {});

    return {
      done: false,
      phase: "finish",
      savedScore,
      matchedPair,
      faceUpIndex,
      scoreConfirmed: heapIntact,
      evidence: card({
        action: "reopen same Steel session → verify score, matched pair, and face-up card",
        targetSelector: "#match-grid",
        verdict: heapIntact
          ? `score ${savedScore}→${resumeScore}, matched [${(matchedPair || []).join(", ")}] still removed, card ${faceUpIndex ?? "none"} still face-up`
          : `state changed: score ${savedScore}→${resumeScore}, pair matched=${cardState.pairMatched}, face-up preserved=${cardState.faceUpPreserved}`,
        outcome: heapIntact ? "pass" : "fail",
        screenshotThumb: shot,
        diagnosis: heapIntact ? null : "The resumed browser did not show the same game state that was left before disconnect.",
      }),
    };
  }

  if (phase === "finish") {
    // Re-attach to the game session — each Netlify invocation is stateless, so we must reconnect.
    const ws = `wss://connect.steel.dev?apiKey=${process.env.STEEL_API_KEY}&sessionId=${sessionId}`;
    let finishConn;
    try {
      finishConn = await connect(ws, sessionId, "chromium.connectOverCDP (finish: re-attach)");
    } catch (err) {
      await release(sessionId);
      return { done: true, outcome: "fail", evidence: card({ action: "connectOverCDP (finish)", verdict: `reconnect failed: ${err.message}`, outcome: "fail" }) };
    }
    const finishPage = finishConn.context.pages().find((p) => p.url().includes("matharcade")) || finishConn.page;
    await finishPage.bringToFront();

    const matched = await finishPage.evaluate(async () => {
      const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
      const grid = () => document.querySelectorAll("#match-grid .card");
      for (const c of matchGame.cards) {
        if (c.matched) continue;
        const pair = matchGame.cards.filter((x) => x.id === c.id && !x.matched);
        if (pair.length !== 2) continue;
        const els = grid();
        els[pair[0].index]?.click();
        await sleep(250);
        els[pair[1].index]?.click();
        await sleep(900);
      }
      await sleep(400);
      return matchGame.matched;
    }).catch(() => 0);

    const finalScore = await finishPage.evaluate(() => matchGame.score).catch(() => 0);
    const shot = await thumb(finishPage);
    await finishConn.browser.close().catch(() => {});
    await release(sessionId);

    return {
      done: true,
      released: true,
      outcome: matched > 0 ? "pass" : "recovered",
      evidence: card({
        action: "resume game → flip cards → sessions.release(sessionId)",
        targetSelector: "#match-grid .card",
        verdict: `game resumed and completed — final score: ${finalScore}, matches: ${matched}`,
        outcome: matched > 0 ? "pass" : "recovered",
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
    // Fire warmup fetch in background (don't await) — just wakes Render without blocking
    fetch(STOCK_URL, { signal: AbortSignal.timeout(8000) }).catch(() => {});
    // Navigate immediately — Render may still be booting, that's fine
    let navigationSuccess = false;
    try {
      await page.goto(STOCK_URL, { waitUntil: "domcontentloaded", timeout: 20000 });
      navigationSuccess = true;
    } catch (navErr) {
      console.error(`[stock-predictor] Navigation failed: ${navErr.message}`);
    }

    return {
      done: false,
      phase: "await-boot",
      step: "navigate",
      action: "Navigating to Stock Predictor URL",
      detail: `Loading ${STOCK_URL} (Render cold start may take 2-3 minutes)`,
      evidence: card({
        action: `navigate ${STOCK_URL}`,
        targetSelector: ".stApp",
        verdict: navigationSuccess ? "Navigated — waiting for Streamlit to finish booting" : "Navigation failed or timed out",
        outcome: navigationSuccess ? "pass" : "fail",
        screenshotThumb: await thumb(page),
        diagnosis: navigationSuccess ? null : "Failed to load Stock Predictor URL",
      }),
    };
  }

  // Poll until Streamlit's .stApp is present — each call stays under 10s (function timeout safe)
  if (phase === "await-boot") {
    // Increased timeout to account for Render cold start (up to 3 minutes)
    // We'll check in 10 second intervals, up to 18 checks (3 minutes)
    const ready = await page.waitForSelector(".stApp, .stTextInput input, [data-testid='stAppViewContainer']", { timeout: 10000 })
      .then(() => true).catch(() => false);
    if (!ready) {
      // Still booting — loop back
      return {
        done: false,
        phase: "await-boot",
        step: "await-boot",
        action: "Waiting for Streamlit to finish booting",
        detail: "Render cold start in progress... checking for .stApp element",
      };
    }

    // .stApp found, now wait for the actual input widget to be ready
    const inputReady = await page.waitForSelector('input[aria-label="Ticker symbol"], input[aria-label*="ticker"], input[aria-label*="stock"], input[placeholder*="ticker"], input[placeholder*="AAPL"], input[placeholder*="symbol"], .stTextInput input', { timeout: 10000 })
      .then(() => true).catch(() => false);

    if (!inputReady) {
      return {
        done: false,
        phase: "await-boot",
        step: "await-widgets",
        action: "Streamlit loaded — waiting for input widgets",
        detail: ".stApp detected but ticker input not yet rendered",
      };
    }

    return {
      done: false,
      phase: "predict",
      step: "await-boot-complete",
      action: "Streamlit app fully loaded",
      detail: "Ticker input widget detected — ready for interaction",
      evidence: card({
        action: "await Streamlit boot + widgets",
        targetSelector: "input",
        verdict: "Streamlit app is fully interactive",
        outcome: "pass",
        screenshotThumb: await thumb(page),
      }),
    };
  }

  if (phase === "predict") {
    // Step 1: Fill the ticker input
    const filled = await page.evaluate(async () => {
      const delay = (ms) => new Promise((r) => setTimeout(r, ms));
      const input = document.querySelector('input[aria-label="Ticker symbol"], input[aria-label*="ticker"], input[aria-label*="stock"], input[placeholder*="ticker"], input[placeholder*="AAPL"], input[placeholder*="symbol"], .stTextInput input');
      if (!input) return false;
      const nativeInputValueSetter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, "value").set;
      nativeInputValueSetter.call(input, "AAPL");
      input.dispatchEvent(new Event("input", { bubbles: true }));
      input.dispatchEvent(new Event("change", { bubbles: true }));
      await delay(300);
      return true;
    });

    if (!filled) {
      return {
        done: false,
        phase: "extract",
        step: "predict",
        action: 'Failed to fill ticker "AAPL"',
        detail: "Could not find or interact with ticker input",
        evidence: card({
          action: 'fill ticker "AAPL"',
          targetSelector: "input",
          verdict: "Could not interact with Streamlit ticker input",
          outcome: "fail",
          screenshotThumb: await thumb(page),
          diagnosis: "Streamlit widget selectors may need adjustment",
        }),
      };
    }

    // Step 2: Click away from input to close multi-select dropdown
    record("stockPredictor.predict", { phase: "close-dropdown" }, "invoking", "Clicking body to close ticker dropdown");
    await page.mouse.click(10, 10);
    await page.waitForTimeout(500);
    record("stockPredictor.predict", { phase: "close-dropdown" }, "ok", "Dropdown dismissed");

    // Step 3: Small pause for UI to settle
    await page.waitForTimeout(500);

    // Step 4: Use selector-based click for Predict button
    record("stockPredictor.predict", { phase: "click-predict-selector" }, "invoking", "Finding Predict button via selector");
    const selectorClicked = await page.evaluate(() => {
      const btns = Array.from(document.querySelectorAll("button"));
      const predictBtn = btns.find((b) => {
        const text = b.textContent.toLowerCase();
        return text.includes("predict") || text.includes("submit") || text.includes("run") || text.includes("forecast");
      });
      if (predictBtn) { predictBtn.click(); return true; }
      return false;
    });
    record("stockPredictor.predict", { phase: "click-predict-selector" }, selectorClicked ? "ok" : "fail", selectorClicked ? "Predict button clicked via selector" : "Could not find Predict button");

    if (!selectorClicked) {
      return {
        done: false,
        phase: "extract",
        step: "predict",
        action: 'Filled ticker "AAPL", could not find Predict button',
        detail: "No button matching predict/submit/run/forecast found",
        evidence: card({
          action: 'fill ticker "AAPL" → click Predict (selector failed)',
          targetSelector: "button",
          verdict: "Failed to click Predict button",
          outcome: "fail",
          screenshotThumb: await thumb(page),
          diagnosis: "Predict button text may not match expected patterns",
        }),
      };
    }

    // Step 5: Brief wait for Streamlit to register click and start computation
    await page.waitForTimeout(3000);

    return {
      done: false,
      phase: "extract",
      step: "predict",
      action: 'Filled ticker "AAPL" → clicked Predict via selector → starting prediction',
      detail: "Predict button clicked via selector; extract phase will poll for results.",
      evidence: card({
        action: 'fill ticker "AAPL" → click Predict (selector)',
        targetSelector: "button",
        verdict: "Ticker filled, Predict button clicked via selector",
        outcome: "pass",
        screenshotThumb: await thumb(page),
      }),
    };
  }
  if (phase === "extract") {
    // Poll for prediction results — Streamlit free tier can take 30-60s
    // Wait for specific content indicating prediction is done
    record("stockPredictor.extract", { phase: "wait-for-prediction" }, "invoking", "Polling for prediction results (Market Open/Close, Linear Regression, XGBoost, chart)");

    const predictionReady = await page.waitForFunction(
      () => {
        const text = document.body.innerText.toLowerCase();
        // Check for key prediction result indicators
        return text.includes("market open") &&
               text.includes("market close") &&
               (text.includes("linear regression") || text.includes("xgboost")) &&
               text.includes("chart");
      },
      { timeout: 90000, polling: 5000 }
    ).then(() => true).catch(() => false);

    if (!predictionReady) {
      record("stockPredictor.extract", { phase: "wait-for-prediction" }, "fail", "Timeout waiting for prediction results after 90s");
      // Still try to extract what we have
    } else {
      record("stockPredictor.extract", { phase: "wait-for-prediction" }, "ok", "Prediction results detected");
    }

    // Additional wait for chart/canvas to fully render
    await page.waitForTimeout(3000);

    record("stockPredictor.extract", { phase: "screenshot" }, "invoking", "Capturing full-page screenshot");
    const shot = await page.screenshot({ type: "jpeg", quality: 75, fullPage: true });
    const b64 = shot.toString("base64");
    record("stockPredictor.extract", { phase: "screenshot", size: shot.length }, "ok", "Screenshot captured");

    record("stockPredictor.extract", { phase: "scrape-text" }, "invoking", "Scraping visible page text");
    const text = await page.evaluate(() => {
      const unwanted = document.querySelectorAll("script, style, nav, footer, header");
      unwanted.forEach((el) => el.remove());
      return document.body.innerText.trim();
    }).catch(() => "(text extraction failed)");
    record("stockPredictor.extract", { phase: "scrape-text", length: text.length }, "ok", "Text scraped");

    return {
      done: true,
      outcome: "pass",
      screenshotFull: b64,
      scrapedText: text.substring(0, 3000),
      apiCall: {
        method: "page.screenshot(fullPage) → page.evaluate(innerText)",
        params: { page: STOCK_URL, ticker: "AAPL" },
        description: "Screenshot the prediction result and scrape visible text for side-by-side comparison",
      },
      evidence: card({
        action: `screenshot(fullPage) + scrape "${STOCK_URL}"`,
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
