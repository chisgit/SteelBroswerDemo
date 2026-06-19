import { FLOWS, ROUTES, DEMO_RECIPES, DEFAULT_RECIPE_ID } from "./lib/flows.mjs";

export const handler = async (event) => {
  try {
    return {
      statusCode: 200,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        flows: FLOWS,
        routes: ROUTES,
        recipes: DEMO_RECIPES,
        defaultRecipeId: DEFAULT_RECIPE_ID,
      }),
    };
  } catch (error) {
    console.error("Flows catalog error:", error);
    return {
      statusCode: 500,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ error: "Failed to load flows catalog" }),
    };
  }
};
