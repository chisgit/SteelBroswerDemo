// NVIDIA NIM vision classifier using MiniMax-M3 (free tier, multimodal).
// Used when Gemini is unavailable or slow.

const API_URL = "https://integrate.api.nvidia.com/v1/chat/completions";
const MODEL = "minimaxai/minimax-m3";

/**
 * Classify each tile image against a target class using NVIDIA MiniMax-M3.
 * @param {{id:number, b64:string, mime:string}[]} tiles
 * @param {string} target e.g. "dog"
 * @returns {Promise<{matches:number[], verdicts:{id:number, isMatch:boolean}[]}>}
 */
export async function classifyTilesNVIDIA(tiles, target) {
  const key = process.env.NVIDIA_API_KEY;
  if (!key) throw new Error("NVIDIA_API_KEY not configured");

  console.log(`[nvidia-vision] tiles=${tiles.length} target=${target}`);

  // Build messages with images for MiniMax-M3 multimodal support
  const messages = [
    {
      role: "user",
      content: [
        {
          type: "text",
          text: `You are solving an image-selection challenge. For EACH image, decide whether it primarily shows a ${target}. ` +
                `Respond ONLY with strict JSON, no prose: {"verdicts":[{"id":<image_number>,"isMatch":<bool>}]}`,
        },
        ...tiles.map((t) => ({
          type: "image_url",
          image_url: { url: `data:${t.mime || "image/jpeg"};base64,${t.b64}` },
        })),
      ],
    },
  ];

  const payload = {
    model: MODEL,
    messages,
    max_tokens: 512,
    temperature: 0.2,
    top_p: 0.7,
    stream: false,
  };

  console.log(`[nvidia-vision] calling MiniMax-M3...`);
  const response = await fetch(API_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${key}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    const err = await response.text();
    console.error(`[nvidia-vision] API error ${response.status}:`, err);
    throw new Error(`NVIDIA API ${response.status}: ${err.slice(0, 100)}`);
  }

  const data = await response.json();
  const text = data.choices?.[0]?.message?.content || "";
  console.log(`[nvidia-vision] response:`, text.slice(0, 200));

  const verdicts = parseJson(text).verdicts || [];
  console.log(`[nvidia-vision] verdicts=${verdicts.length} matches=${verdicts.filter((v) => v.isMatch).length}`);

  return {
    verdicts,
    matches: verdicts.filter((v) => v.isMatch).map((v) => v.id),
  };
}

function parseJson(text) {
  const cleaned = String(text).replace(/^```(?:json)?/i, "").replace(/```$/i, "").trim();
  try {
    return JSON.parse(cleaned);
  } catch (_) {
    const m = cleaned.match(/\{[\s\S]*\}/);
    return m ? JSON.parse(m[0]) : {};
  }
}
