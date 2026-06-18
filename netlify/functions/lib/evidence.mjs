// Structured evidence builder (KTD5) — the agent reports DATA, not chat narration.
// Every step returns one evidence card the UI renders as a row.

/**
 * @param {object} e
 * @param {string} e.action        what the agent did this step (e.g. "classify tiles", "click #tile-2")
 * @param {string} [e.targetSelector]
 * @param {string} [e.verdict]     short conclusion ("3 tiles match 'dog'")
 * @param {"pass"|"fail"|"progress"|"recovered"} e.outcome
 * @param {string} [e.screenshotThumb] base64 (no data: prefix) small screenshot
 * @param {string} [e.diagnosis]   on failure: why it failed, from evidence (U6)
 * @param {string} [e.recovery]    on failure: the recovery action taken (U6)
 */
export function card(e) {
  return {
    action: e.action || "",
    targetSelector: e.targetSelector || null,
    verdict: e.verdict || null,
    outcome: e.outcome || "progress",
    screenshotThumb: e.screenshotThumb || null,
    diagnosis: e.diagnosis || null,
    recovery: e.recovery || null,
    ts: Date.now(),
  };
}

/** Take a small screenshot and return base64 (best-effort; null on failure). */
export async function thumb(page) {
  try {
    const buf = await page.screenshot({ type: "jpeg", quality: 40 });
    return buf.toString("base64");
  } catch (_) {
    return null;
  }
}
