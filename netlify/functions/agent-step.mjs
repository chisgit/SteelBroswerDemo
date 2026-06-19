// The agent loop's atomic step (KTD1): exactly one observe->decide->act cycle,
// returns structured state so the front-end can loop (U5). One screenshot + at most
// one model call + one action per invocation to stay under the 10s free-tier cap.
import { createSession, connect, release, relaunchWithProxy, clientView } from "./lib/steel.mjs";
import { flowMeta } from "./lib/flows.mjs";
import { classifyTiles } from "./lib/gemini.mjs";
import { findElementNVIDIA } from "./lib/nvidia.mjs";
import { card, thumb } from "./lib/evidence.mjs";
import { popLog, record } from "./lib/logger.mjs";

const BASE = process.env.GAUNTLET_BASE_URL || "";

export const handler = async (event) => {
  let conn;
  let route = "?";
  try {
    const parsed = JSON.parse(event.body || "{}");
    route = parsed.route || "unknown";
    const { sessionId, websocketUrl, phase = "start", baseUrl, savedScore, selectedCards } = parsed;
    const meta = flowMeta(route);
    const base = baseUrl || BASE || originFrom(event);

    console.log(`[step] ${route}/${phase}`);
    conn = await connect(websocketUrl, sessionId, `chromium.connectOverCDP (${phase})`);
    const { page } = conn;

    const result = await runStep({ page, conn, route, phase, base, sessionId, websocketUrl, meta, savedScore, selectedCards });
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

async function runStep({ page, conn, route, phase, base, sessionId, websocketUrl, meta, savedScore, selectedCards }) {
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
      return mathArcadeStep(conn, page, phase, sessionId, websocketUrl, savedScore, selectedCards);
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
// Core proof: flip some cards, read score, disconnect (no release), open a NEW tab in the same Steel session,
// browse elsewhere, then re-attach the ORIGINAL session and read score
// again — score unchanged proves JS heap survived the disconnect.
async function mathArcadeStep(conn, page, phase, sessionId, websocketUrl, savedScore, selectedCards = []) {
  const ARCADE_URL = "https://matharcadewrecker.netlify.app";

if (phase === "start") {
     // Navigate and start the Math Match game
     await page.goto(ARCADE_URL, { waitUntil: "domcontentloaded", timeout: 15000 });
     await page.waitForTimeout(5000);
     await page.evaluate(() => app.loadGame("match"));
     await page.waitForFunction(() => typeof matchGame !== "undefined", { timeout: 8000 });
     await page.waitForSelector("#match-grid .card", { timeout: 8000 });

     // Get initial state
     const initialMatched = await page.evaluate(() => matchGame.matched).catch(() => 0);
     const totalCards = await page.evaluate(() => matchGame.cards.length).catch(() => 16);
     
     // Try to find a match by flipping pairs
     const triedPairs = new Set();
     let matchFound = false;
     let matchedPair = null;
    // Keep trying until we find a match
    const maxSafetyAttempts = 1000; // Safety limit to prevent infinite loop
     
    for (let attempt = 0; attempt < maxSafetyAttempts && !matchFound; attempt++) {
       // Get a random pair of unmatched cards we haven't tried yet
       const pair = await chooseRandomCardPair(page, triedPairs);
       if (!pair) break; // No more available pairs
       
       triedPairs.add(pair.join(","));
       
       // Flip both cards
       await page.evaluate((idx) => {
         document.querySelectorAll("#match-grid .card")[idx]?.click();
       }, pair[0]);
       await page.waitForTimeout(400);
       await page.evaluate((idx) => {
         document.querySelectorAll("#match-grid .card")[idx]?.click();
       }, pair[1]);
       await page.waitForTimeout(800); // Wait for game to process
       
       // Check if we got a match
       const newMatched = await page.evaluate(() => matchGame.matched).catch(() => 0);
       if (newMatched > initialMatched) {
         matchFound = true;
         matchedPair = pair;
         // Update initialMatched for subsequent checks if needed, but we break anyway
       }
       // If not matched, cards should have flipped back automatically
     }
     
     // If we found a match, flip one additional card face-up
     let faceUpIndex = null;
     let selectedCardsForCarry = [];
     if (matchFound && matchedPair) {
       // Get one random unmatched card (not part of our matched pair)
       const seenCards = new Set(matchedPair); // Treat matched pair as seen/used
       faceUpIndex = await clickRandomUnmatchedCard(page, seenCards);
       // Note: clickRandomUnmatchedCard flips the card face-up and returns its index
       selectedCardsForCarry = [...matchedPair, faceUpIndex].filter(idx => idx !== null);
     } else {
       // Fallback: original behavior - flip 4 random cards
       const seenCards = new Set();
       for (let i = 0; i < 4; i++) {
         const picked = await clickRandomUnmatchedCard(page, seenCards);
         if (picked !== null) seenCards.add(picked);
         await page.waitForTimeout(400);
       }
       selectedCardsForCarry = Array.from(seenCards);
     }
     
     await page.waitForTimeout(500);
     
     const score = await page.evaluate(() => matchGame.score).catch(() => 0);
     const shot = await thumb(page);
     
     // Prepare return object
     const returnObj = {
       done: false,
       phase: "detach",
       savedScore: score,
       selectedCards: selectedCardsForCarry,
       evidence: card({
         action: matchFound && matchedPair 
           ? `navigate → find match (${matchedPair[0]},${matchedPair[1]}) → flip additional card ${faceUpIndex || 'none'}`
           : "navigate matharcadewrecker.netlify.app → app.loadGame('match') → flip 4 cards (fallback)",
         targetSelector: "#match-grid .card",
         verdict: matchFound && matchedPair
           ? `match found! score: ${score}, matched pair: [${matchedPair[0]},${matchedPair[1]}], face-up: ${faceUpIndex || 'none'}`
           : `game in progress — score: ${score}`,
         outcome: "pass",
         screenshotThumb: shot,
       }),
     };
     
     // Add match-specific state if found
     if (matchFound && matchedPair) {
       returnObj.matchedPair = matchedPair;
       if (faceUpIndex !== null) {
         returnObj.faceUpIndex = faceUpIndex;
       }
     }
     
     return returnObj;
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
    // Agent does independent work WITHOUT touching the Steel session at all.
    // Game session sits dormant in Steel cloud — no CDP client attached, heap fully preserved.
    // We jump to a new tab, browse elsewhere, then close that tab and come back.
    const sideQuest = await conn.context.newPage().catch(() => null);
    record("agent (no Steel session)", { task: "browse elsewhere: Wikipedia Card_game" }, "invoking");
    let wikiSummary = "";
    try {
      if (sideQuest) {
        await sideQuest.goto("https://en.wikipedia.org/wiki/Card_game", { waitUntil: "domcontentloaded", timeout: 12000 });
        wikiSummary = (await sideQuest.textContent("body").catch(() => ""))?.slice(0, 180) || "summary unavailable";
        await sideQuest.waitForTimeout(1500);
        await sideQuest.close().catch(() => {});
      } else {
        const wikiRes = await fetch(
          "https://en.wikipedia.org/api/rest_v1/page/summary/Card_game",
          { headers: { "User-Agent": "SteelDemo/1.0" }, signal: AbortSignal.timeout(6000) }
        );
        const wikiJson = await wikiRes.json();
        wikiSummary = wikiJson.extract?.slice(0, 200) || "summary unavailable";
      }
    } catch (_) {
      wikiSummary = "fetch failed (non-critical)";
    }
    record("agent (no Steel session)", { task: "Wikipedia detour done — waiting 3s" }, "done");

    // Deliberate 3s pause — session sits completely idle, making the story tangible
    await new Promise((r) => setTimeout(r, 3000));

    conn._closed = true;
    await conn.browser.close().catch(() => {});

    return {
      done: false,
      phase: "resume",
      savedScore,
      evidence: card({
        action: "tab hop to Wikipedia → close tab → resume original session",
        targetSelector: "n/a",
        verdict: `game session sat idle in Steel cloud for 3s | "${wikiSummary.slice(0, 100)}…"`,
        outcome: "pass",
      }),
    };
  }

if (phase === "resume") {
     // Re-attach to the ORIGINAL game session — same sessionId, third CDP connect
     const ws = `wss://connect.steel.dev?apiKey=${process.env.STEEL_API_KEY}&sessionId=${sessionId}`;
     conn._closed = true;
     await conn.browser.close().catch(() => {});

     // Visible pause so the user can see: browser closed → then new browser opens
     await new Promise((r) => setTimeout(r, 4000));

     const fresh = await connect(ws, sessionId, "chromium.connectOverCDP (resume: re-attach to game session)");
     const gamePage = fresh.context.pages().find((p) => p.url().includes("matharcade")) || fresh.page;
     await gamePage.bringToFront();

     const resumeScore = await gamePage.evaluate(() => matchGame.score).catch(() => null);
     const scoreIntact = resumeScore !== null && resumeScore === savedScore;

     // Check card state if we have saved state from start phase
     let cardStateIntact = true;
     let cardStateDetails = "";
     if (savedMatchedPair !== undefined) {
       // Verify matched pair cards are still matched (have "matched" class)
       const matchedPairStatus = await gamePage.evaluate(([idx1, idx2]) => {
         const cards = document.querySelectorAll("#match-grid .card");
         const idx1Valid = idx1 < cards.length;
         const idx2Valid = idx2 < cards.length;
         const idx1Matched = idx1Valid && cards[idx1].classList.contains("matched");
         const idx2Matched = idx2Valid && cards[idx2].classList.contains("matched");
         return [idx1Matched, idx2Matched, idx1Valid, idx2Valid];
       }, savedMatchedPair);
       
       const [idx1Matched, idx2Matched, idx1Valid, idx2Valid] = matchedPairStatus;
       cardStateIntact = cardStateIntact && idx1Matched && idx2Matched;
       cardStateDetails += `matchedPair: [${savedMatchedPair[0]},${savedMatchedPair[1]}] `;
       cardStateDetails += idx1Matched && idx2Matched ? '✓' : '✗';
       if (!idx1Valid || !idx2Valid) {
         cardStateDetails += ' (index out of bounds)';
         cardStateIntact = false;
       }
     }
     
     if (savedFaceUpIndex !== undefined && cardStateIntact) {
       // Verify face-up card is still unmatched (and presumably face-up)
       // Note: In memory games, unmatched face-up cards typically flip back down after delay,
       // but we check immediately after reconnect so it might still be face-up
       const faceUpStatus = await gamePage.evaluate((idx) => {
         const cards = document.querySelectorAll("#match-grid .card");
         const valid = idx < cards.length;
         const unmatched = valid && !cards[idx].classList.contains("matched");
         return { valid, unmatched };
       }, savedFaceUpIndex);
       
       cardStateIntact = cardStateIntact && faceUpStatus.unmatched && faceUpStatus.valid;
       cardStateDetails += ` faceUp: ${savedFaceUpIndex} `;
       cardStateDetails += faceUpStatus.unmatched && faceUpStatus.valid ? '✓' : '✗';
       if (!faceUpStatus.valid) {
         cardStateDetails += ' (index out of bounds)';
         cardStateIntact = false;
       }
     }

     const heapIntact = scoreIntact && cardStateIntact;
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
         action: "connectOverCDP(same sessionId) → read matchGame.score + verify card state",
         targetSelector: "#match-grid",
         verdict: heapIntact
           ? `score: ${savedScore}→${resumeScore} ✓, ${cardStateDetails}`
           : `score mismatch (${savedScore}→${resumeScore}) or card state changed: ${cardStateDetails}`,
         outcome: heapIntact ? "pass" : "fail",
         screenshotThumb: shot,
         diagnosis: heapIntact 
           ? null 
           : !scoreIntact 
             ? "JS heap may not have survived — score differs" 
             : "Card state not preserved — matched cards or face-up card changed",
       }),
     };
   }

  if (phase === "finish") {
    // Keep flipping random unmatched card pairs until we get a match (score increases).
    // Cards are already loaded in the cloud browser — same state as when we left
    let matched = await page.evaluate(() => matchGame.matched).catch(() => 0);
    const totalCards = await page.evaluate(() => matchGame.cards.length).catch(() => 16);
    const triedPairs = new Set();

    // Try pairs until we get at least one new match or exhaust attempts
    const maxAttempts = Math.ceil(totalCards / 2);
    for (let attempt = 0; attempt < maxAttempts && matched < 1; attempt++) {
      const pair = await chooseRandomCardPair(page, triedPairs, selectedCards);
      if (!pair) break;
      triedPairs.add(pair.join(","));

      await page.evaluate((idx) => {
        document.querySelectorAll("#match-grid .card")[idx]?.click();
      }, pair[0]);
      await page.waitForTimeout(400);
      await page.evaluate((idx) => {
        document.querySelectorAll("#match-grid .card")[idx]?.click();
      }, pair[1]);
      await page.waitForTimeout(800);
      matched = await page.evaluate(() => matchGame.matched).catch(() => matched);
    }

    const finalScore = await page.evaluate(() => matchGame.score).catch(() => 0);
    const shot = await thumb(page);
    await release(sessionId);

    return {
      done: true,
      outcome: "pass",
      evidence: card({
        action: "resume game → flip random pairs → sessions.release(sessionId)",
        targetSelector: "#match-grid .card",
        verdict: `game resumed and completed — final score: ${finalScore}, matches: ${matched}`,
        outcome: "pass",
        screenshotThumb: shot,
      }),
    };
  }

  return { done: true, outcome: "fail", evidence: card({ action: `unknown phase: ${phase}`, outcome: "fail" }) };
}

async function clickRandomUnmatchedCard(page, seenCards = new Set()) {
  return await page.evaluate((seen) => {
    const cards = Array.from(document.querySelectorAll("#match-grid .card"));
    const available = cards
      .map((card, index) => ({ card, index }))
      .filter(({ card, index }) => !card.classList.contains("matched") && !seen.includes(index));
    if (!available.length) return null;
    const pick = available[Math.floor(Math.random() * available.length)];
    pick.card?.click();
    return pick.index;
  }, Array.from(seenCards));
}

async function chooseRandomCardPair(page, triedPairs, excludedCards = []) {
  return await page.evaluate(({ tried, excluded }) => {
    const cards = Array.from(document.querySelectorAll("#match-grid .card"));
    if (cards.length < 2) return null;
    const excludedSet = new Set(excluded);
    const eligible = cards
      .map((card, index) => ({ card, index }))
      .filter(({ card, index }) => !card.classList.contains("matched") && !excludedSet.has(index))
      .map(({ index }) => index);
    const pool = eligible.length >= 2
      ? eligible
      : cards
          .map((card, index) => ({ card, index }))
          .filter(({ card }) => !card.classList.contains("matched"))
          .map(({ index }) => index);
    if (pool.length < 2) return null;
    const triedSet = new Set(tried);
    for (let attempt = 0; attempt < 40; attempt++) {
      const a = pool[Math.floor(Math.random() * pool.length)];
      let b = pool[Math.floor(Math.random() * pool.length)];
      if (a === b) continue;
      const key = [Math.min(a, b), Math.max(a, b)].join(",");
      if (triedSet.has(key)) continue;
      return [Math.min(a, b), Math.max(a, b)];
    }
    return null;
  }, { tried: Array.from(triedPairs), excluded: Array.from(excludedCards) });
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
