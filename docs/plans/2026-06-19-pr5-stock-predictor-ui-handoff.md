# HANDOFF — Stock Predictor UI Fixes (PR #5)

**Branch**: `fix/stock-predictor-ui`  
**PR**: https://github.com/chisgit/SteelBroswerDemo/pull/5  
**Status**: 🔄 Ready for review and merge  
**Updated**: 2026-06-19 05:15 UTC

---

## Summary

Fixed three critical UI rendering bugs in the Stock Predictor demo (`public/stock-predictor.js`) that prevented users from seeing evidence cards, API call details, and screenshot/scrape comparison.

### Bugs Fixed

1. **Evidence cards rendering as `[object Object]`**
   - Root cause: `appendEvidence(html)` called with a plain JS object from `card()`, then set as `innerHTML`
   - Fix: Render the object's fields as a proper styled DOM row with thumbnail, outcome badge, action, verdict, proof annotation

2. **API console showing method name only**
   - Root cause: `addLog()` only displayed `entry.method`, ignoring `params`, `status`, `detail`
   - Fix: Show full call signature: `method { param: value, … } → status detail`
   - Status color-coded: green (ok), yellow (429), gray (other)

3. **Side-by-side comparison not appearing**
   - Root cause: `showComparison()` logic incomplete; labels unclear
   - Fix: Always render both views when `screenshotFull && scrapedText` present; clarify labels as "Screenshot (what Steel saw)" vs "Scraped text (innerText extract)"

---

## Files Changed

**`public/stock-predictor.js`** (68 lines added/changed)

Three functions completely rewritten:

### `appendEvidence(card, proves)` — lines 160–188
Renders a card object (from `evidence.mjs`) as a visible DOM row:
```html
[thumbnail] | [outcome badge] [action]
            | [verdict]
            | ✓ [proof statement]
```

- Outcome color-coded: green (pass), red (fail), yellow (warn), gray (progress)
- Thumbnail clickable to zoom full-size screenshot
- Proof annotation shows what the evidence demonstrates

### `addLog(entry)` — lines 138–158
Formats API call log entry for display:
```
sessions.create { sessionId: "sess-abc…" } → ok 1823ms
```

- Params object extracted and displayed as `{ key: value, … }`
- Status color-coded (green=ok, yellow=429, gray=other)
- Detail shows timing or error description

### `showComparison(b64, text)` — lines 190–211
Side-by-side grid layout:
```
┌─────────────────────┬─────────────────────┐
│ Screenshot          │ Scraped text        │
│ (what Steel saw)    │ (innerText extract) │
│ [image, clickable]  │ [monospace text]    │
└─────────────────────┴─────────────────────┘
```

- Evidence cleared on each run (line 41: `$("evidence").innerHTML = ""`)
- Comparison triggered after extract phase (line 63: `if (res.screenshotFull && res.scrapedText)`)

---

## What Users See Now

### Before Merge
- Evidence section: three `[object Object]` entries
- API console: `sessions.create` (no params or status)
- Comparison: missing entirely

### After Merge
- **Evidence Log**: Structured cards showing action, verdict, and proof for each step
- **API Console**: Full call signatures with params, status color, and timing
- **Comparison Section**: Screenshot + scraped text side by side after extract phase

---

## Testing Checklist

### Pre-Merge (on `fix/stock-predictor-ui` branch)
- [ ] Build succeeds: `npm run build`
- [ ] No linting errors in `public/stock-predictor.js`
- [ ] Review PR #5 diff — compare old vs new `appendEvidence`, `addLog`, `showComparison`

### Post-Merge (live on main)
- [ ] Navigate to https://steeldemo.netlify.app/stock-predictor.html
- [ ] Click "Run demo"
- [ ] **Evidence cards appear** (not `[object Object]`):
  - Thumbnail visible (or placeholder box)
  - Outcome badge shows "pass" or "progress" with correct color
  - Action text readable (e.g., "navigate stockpredictors.onrender.com")
  - Verdict and proof statement display
  - Click thumbnail → zoom modal opens
- [ ] **API console shows rich log**:
  - First entry: `sessions.create { sessionId: "…" } → ok XXms`
  - Navigation: `page.goto { url: "…" } → ok XXms`
  - Status colors match expected (green for ok, yellow for 429)
- [ ] **Await-boot polling** (Render cold-start):
  - Banner shows "Waiting for Streamlit to boot…"
  - Evidence cards accumulate as polling loops (outcome: "progress")
  - Once `.stApp` appears, advances to predict phase
- [ ] **After extract phase**:
  - Comparison section appears with both views
  - Screenshot and scraped text both visible and correctly labeled
  - Click screenshot → full-size modal opens

### Render Cold-Start Edge Cases
- [ ] First run after deploy (Render wakes): ~30-60s, polling handles it gracefully
- [ ] Second run (Render still warm): ~5-10s, faster
- [ ] Streamlit timeout (`.stApp` never appears): evidence shows "progress" outcome, doesn't crash

---

## Architecture Notes

### Frontend Loop (stock-predictor.js)
- `runDemo()` calls `agent-step` in a loop until `done: true`
- Each step updates banner, snippet, and proof statement
- Evidence and API logs accumulate (cleared at start of each run)
- Comparison shown when both `screenshotFull` and `scrapedText` present

### Backend Phases (agent-step.mjs lines 499–535)
- **start**: fire-and-forget warmup fetch, navigate, return immediately
- **await-boot**: poll for `.stApp`, return `{ done: false, phase: "await-boot" }` if not ready
- **predict**: fill AAPL, click Predict button
- **extract**: screenshot + scrape innerText, return full results

Each backend call is ≤7-8s (function timeout safe at Netlify's 10s limit).

---

## Known Limitations & Future Work

**Current limitations:**
- Render free tier: cold-start 30-60s (unavoidable; polling handles gracefully)
- Streamlit DOM selectors (`.stApp`, `.stTextInput input`) may drift with Streamlit updates
- No retry logic if Render service permanently down

**Future improvements:**
- Add unit tests for `appendEvidence`, `addLog`, `showComparison` rendering
- Monitor Streamlit selector stability; consider fallback selectors
- Add timeout warning if Render takes >60s (currently silent poll)
- Implement error recovery for Render 503/timeout scenarios

---

## References

**Commit**: `198d3fa` (fix/stock-predictor-ui)  
**Related commits**:
- `8cf94f5` — Non-blocking Render cold-start via polling
- `5b67fcb` — Dedicated stock-predictor.js (no gauntlet framework)

**Files to review**:
- `netlify/functions/agent-step.mjs` lines 499–535 (backend phases)
- `public/stock-predictor.js` lines 69–211 (rendering functions)
- `public/stock-predictor.html` (unchanged; uses stock-predictor.js)

---

**Ready to merge**: ✅ Yes  
**Merge approval**: Awaiting review  
**Deploy after merge**: Netlify CI auto-deploys main
