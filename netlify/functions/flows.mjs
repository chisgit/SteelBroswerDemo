// Expose the flow catalog to the client (banner + technical panel read this, R14/KTD9)
// so the UI never duplicates the server's source of truth.
import {
  BASE_DEMOS,
  CHALLENGE_OVERLAYS,
  DEFAULT_RECIPE_ID,
  DEMO_RECIPES,
  FLOWS,
  ROUTES,
  SCENARIO_ARCS,
  SOLVER_STRATEGIES,
} from "./lib/flows.mjs";

export const handler = async () => ({
  statusCode: 200,
  headers: { "content-type": "application/json" },
  body: JSON.stringify({
    routes: ROUTES,
    flows: FLOWS,
    defaultRecipeId: DEFAULT_RECIPE_ID,
    recipes: DEMO_RECIPES,
    components: {
      baseDemos: BASE_DEMOS,
      overlays: CHALLENGE_OVERLAYS,
      solvers: SOLVER_STRATEGIES,
      scenarios: SCENARIO_ARCS,
    },
  }),
});
