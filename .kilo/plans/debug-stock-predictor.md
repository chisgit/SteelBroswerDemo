# Debug Plan: Stock Predictor Stuck in Pre-warming Mode

## Objective
Diagnose and fix the issue where the Stock Predictor demo is stuck in the "Pre-warming a Steel session…" state.

## Background
- Current branch: `fix/stock-predictor-ui`
- The Stock Predictor demo is located at `public/stock-predictor.html` and uses `public/stock-predictor.js`.
- The demo relies on the `/api/session-create` endpoint (Netlify function) to create a Steel session.
- The UI should transition from "Pre-warming a Steel session…" to "Ready — click Run demo" upon successful session creation.

## Steps to Diagnose

### 1. Check Environment Variables
- Verify that `STEEL_API_KEY` is set in the `.env` file (or Netlify environment variables for deployed version).
- For local development with `netlify dev`, the `.env` file should be present in the project root.

### 2. Inspect Session Creation Response
- In `public/stock-predictor.js`, the `init()` function calls `await api("session-create", {})`.
- If the session creation fails, the code sets an error banner and logs the error.
- Check the network tab in browser dev tools (when running locally) to see the response from `/api/session-create`.
- Look for:
  - HTTP 200 with session data (includes `debugUrl`, `sessionId`)
  - HTTP 500 or 502 with error details

### 3. Review Stock Predictor Step Logic
- Examine `stockPredictorStep` in `netlify/functions/agent-step.mjs`.
- The function has three phases: `start`, `await-boot`, `predict`, `extract`.
- Ensure there are no infinite loops (e.g., if `await-boot` phase never progresses due to a condition that never becomes true).

### 4. Check Frontend State Transitions
- In `public/stock-predictor.js`, the `init()` function sets up the UI based on the session creation response.
- If `session.error` is truthy, it shows an error banner and returns early.
- If successful, it sets the viewer's `src` to `session.debugUrl` and enables the run button.
- Potential issue: If `session.debugUrl` is empty or invalid, the iframe might not load, but the UI should still show "Ready — click Run demo".

### 5. Verify Streamlit App Accessibility
- The stock predictor navigates to `https://stockpredictors.onrender.com`.
- Confirm that this URL is reachable from the runtime environment (local machine or Netlify functions).
- Note: The warmup fetch (`fetch(STOCK_URL, { signal: AbortSignal.timeout(8000) }).catch(() => {});`) is non-blocking and may fail silently.

### 6. Look for Console Errors
- When running the demo locally, check the browser console for JavaScript errors.
- Also check the Netlify function logs (if using `netlify dev`, they appear in the terminal).

### 7. Test Session Creation Independently
- Use a tool like `curl` or Postman to test the `/api/session-create` endpoint.
- Example: `curl -X POST http://localhost:8888/api/session-create` (when running `netlify dev`).

## Potential Fixes Based on Inspection

### A. If Session Creation Fails
- Ensure `STEEL_API_KEY` is correctly set in `.env`.
- Check the Netlify function `session-create.mjs` for errors.
- Verify that the Steel SDK is installed and up to date (`steel-sdk` in `package.json`).

### B. If UI Does Not Update After Successful Session Creation
- Check that `session.debugUrl` is being set correctly in the iframe.
- Ensure that the banner text is updated to "Ready — click Run demo" after session creation.
- Verify that the run button is not disabled due to an error in the `init()` function.

### C. If StockPredictorStep Hangs in a Phase
- Check the `await-boot` phase: it loops if the Streamlit app's `.stApp` selector is not found within 7 seconds.
- Consider increasing the timeout or checking if the Streamlit app is actually loading.
- The `predict` phase attempts to interact with Streamlit widgets; if the selectors are outdated, it might fail and set `interacted` to false, leading to a fail outcome but not a hang.
- The `extract` phase should always complete (it waits 3 seconds then takes a screenshot and scrapes text).

## Hypothesis
Given that the user reports it's stuck in "Pre-warming a Steel session…", the most likely cause is that the session creation request is failing or hanging, preventing the UI from advancing to the ready state.

## Next Steps
1. Confirm session creation is working via direct API test.
2. If session creation works, check the frontend for issues in processing the response.
3. If session creation fails, fix the environment or function code.

## Files to Inspect
- `.env` (for STEEL_API_KEY)
- `netlify/functions/session-create.mjs`
- `netlify/functions/lib/steel.mjs`
- `public/stock-predictor.js`
- `public/stock-predictor.html`
- `netlify/functions/agent-step.mjs` (specifically `stockPredictorStep` function)