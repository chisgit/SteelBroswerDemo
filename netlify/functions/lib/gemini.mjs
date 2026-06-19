// Gemini Flash agent brain. Two jobs:
//   classifyTiles — vision: which grid tiles match a target class (the climax)
//   decideText    — light reasoning over page text/DOM for non-vision routes
import { GoogleGenerativeAI } from "@google/generative-ai";

const MODEL = "gemini-2.0-flash";

function model() {
  const key = process.env.GEMINI_API_KEY;
  if (!key) throw new Error("GEMINI_API_KEY not configured");
  return new GoogleGenerativeAI(key).getGenerativeModel({ model: MODEL });
}

/**
 * Classify each tile image against a target class using vision.
 * @param {{id:number, b64:string, mime:string}[]} tiles
 * @param {string} target e.g. "dog"
 * @returns {Promise<{matches:number[], verdicts:{id:number, isMatch:boolean}[]}>}
 */
export async function classifyTiles(tiles, target) {
  console.log(`[classifyTiles] tiles=${tiles.length} target=${target}`);
  const parts = [
    {
      text:
        `You are solving an image-selection challenge. For EACH numbered image, decide ` +
        `whether it primarily shows a ${target}. Respond ONLY with strict JSON: ` +
        `{"verdicts":[{"id":<n>,"isMatch":<bool>}]}. No prose.`,
    },
  ];
  for (const t of tiles) {
    parts.push({ text: `Image id ${t.id}:` });
    parts.push({ inlineData: { data: t.b64, mimeType: t.mime || "image/jpeg" } });
  }

  console.log(`[classifyTiles] calling gemini...`);
  const res = await model().generateContent({ contents: [{ role: "user", parts }] });
  console.log(`[classifyTiles] response text:`, res.response.text());
  const verdicts = parseJson(res.response.text()).verdicts || [];
  console.log(`[classifyTiles] verdicts=${verdicts.length} matches=${verdicts.filter((v) => v.isMatch).length}`);
  return {
    verdicts,
    matches: verdicts.filter((v) => v.isMatch).map((v) => v.id),
  };
}

/**
 * Light text decision for non-vision routes (e.g. "is this page a bot wall?").
 * @returns {Promise<object>} parsed JSON the caller shapes via the prompt
 */
export async function decideText(prompt) {
  const res = await model().generateContent(prompt);
  return parseJson(res.response.text());
}

function parseJson(text) {
  // Models sometimes wrap JSON in ```json fences — strip them.
  const cleaned = String(text).replace(/^```(?:json)?/i, "").replace(/```$/i, "").trim();
  try {
    return JSON.parse(cleaned);
  } catch (_) {
    const m = cleaned.match(/\{[\s\S]*\}/);
    return m ? JSON.parse(m[0]) : {};
  }
}
