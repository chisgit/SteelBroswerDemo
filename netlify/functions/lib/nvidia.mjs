// NVIDIA NIM vision classifier using Kimi K2.6 (free tier, multimodal).
// Used when Gemini is unavailable or slow.

const API_URL = "https://integrate.api.nvidia.com/v1/chat/completions";
const MODEL = "moonshotai/kimi-k2.6";

/**
 * Classify each tile image against a target class using NVIDIA Kimi K2.6.
 * @param {{id:number, b64:string, mime:string}[]} tiles
 * @param {string} target e.g. "dog"
 * @returns {Promise<{matches:number[], verdicts:{id:number, isMatch:boolean}[]}>}
 */
export async function classifyTilesNVIDIA(tiles, target) {
  const key = process.env.NVIDIA_API_KEY;
  if (!key) throw new Error("NVIDIA_API_KEY not configured");

  console.log(`[nvidia-vision] tiles=${tiles.length} target=${target}`);

  // Build messages with images for Kimi K2.6 multimodal support
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

  console.log(`[nvidia-vision] calling Kimi K2.6...`);
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

/**
 * Use NVIDIA Kimi K2.6 to visually find a UI element (e.g., "Predict button") on a screenshot
 * and return its approximate center coordinates as percentages (0-100).
 * @param {string} b64Screenshot - Base64 encoded screenshot
 * @param {string} targetDescription - Description of element to find (e.g., "Predict button", "Submit button")
 * @returns {Promise<{x: number, y: number, found: boolean, confidence: number, reasoning: string}>}
 */
export async function findElementNVIDIA(b64Screenshot, targetDescription) {
  const key = process.env.NVIDIA_API_KEY;
  if (!key) throw new Error("NVIDIA_API_KEY not configured");

  console.log(`[nvidia-find-element] target="${targetDescription}"`);

  const messages = [
    {
      role: "user",
      content: [
        {
          type: "text",
          text: `You are an AI that visually locates UI elements on web pages. 
Look at this screenshot and find the ${targetDescription}.
Return ONLY strict JSON:
{
  "found": true|false,
  "x_percent": <0-100, horizontal center>,
  "y_percent": <0-100, vertical center>,
  "confidence": <0-100>,
  "reasoning": "brief description of what you see"
}
If the element is not visible, return found: false with x_percent: 50, y_percent: 50.`,
        },
        {
          type: "image_url",
          image_url: { url: `data:image/jpeg;base64,${b64Screenshot}` },
        },
      ],
    },
  ];

  const payload = {
    model: MODEL,
    messages,
    max_tokens: 256,
    temperature: 0.1,
    top_p: 0.5,
    stream: false,
  };

  console.log(`[nvidia-find-element] calling Kimi K2.6...`);
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
    console.error(`[nvidia-find-element] API error ${response.status}:`, err);
    throw new Error(`NVIDIA API ${response.status}: ${err.slice(0, 100)}`);
  }

  const data = await response.json();
  const text = data.choices?.[0]?.message?.content || "";
  console.log(`[nvidia-find-element] response:`, text.slice(0, 200));

  const result = parseJson(text);
  return {
    found: result.found ?? false,
    x_percent: result.x_percent ?? 50,
    y_percent: result.y_percent ?? 50,
    confidence: result.confidence ?? 0,
    reasoning: result.reasoning ?? "No reasoning provided",
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
