// Health probe — proves functions run and reports which secrets are configured
// (booleans only; never echoes key values, R10).
export const handler = async () => {
  return {
    statusCode: 200,
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      ok: true,
      service: "steel-captcha-gauntlet",
      steelKey: Boolean(process.env.STEEL_API_KEY),
      geminiKey: Boolean(process.env.GEMINI_API_KEY),
    }),
  };
};
