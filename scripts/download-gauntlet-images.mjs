// Fetches a small, vetted set of real photos for the vision-grid challenge and
// writes them to public/gauntlet/images/. Run via `npm run setup` (locally or in
// the Netlify build). Real photos classify far more reliably under Gemini vision
// than illustrations (advisor call). If a download fails, we write a labeled SVG
// fallback so the demo still renders — it degrades, it does not break.
//
// Source: Wikimedia Commons Special:FilePath — the canonical stable redirect to
// the current file bytes (does not rotate like CDN thumb URLs).

import { mkdir, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";

const OUT = new URL("../public/gauntlet/images/", import.meta.url);

// 9 tiles: 3 dogs (the target class) + 6 distractors (bike / train / light).
// label is used ONLY by the page self-check + server manifest, never by the agent.
const TILES = [
  { file: "dog1.jpg", label: "dog", src: "Labrador_on_Quantock_(2175262184).jpg" },
  { file: "dog2.jpg", label: "dog", src: "Golden_Retriever_medium-to-light-coat.jpg" },
  { file: "dog3.jpg", label: "dog", src: "Beagle_puppy_Cadet.jpg" },
  { file: "bike1.jpg", label: "bike", src: "Left_side_of_Flying_Pigeon.jpg" },
  { file: "bike2.jpg", label: "bike", src: "Trek_bicycle.jpg" },
  { file: "train1.jpg", label: "train", src: "TGV_Duplex_Gare_de_Lyon_FRANCE.jpg" },
  { file: "train2.jpg", label: "train", src: "Shinkansen_N700A.jpg" },
  { file: "light1.jpg", label: "light", src: "Ampel-mit-3-Lichtern.jpg" },
  { file: "light2.jpg", label: "light", src: "Traffic_light_3_aspects.jpg" },
];

const COLORS = { dog: "#b5651d", bike: "#2a9d8f", train: "#3a6ea5", light: "#e09f3e" };

function fallbackSvg(label) {
  // Clearly-labeled fallback so a vision model still has a fighting chance and a
  // human can see what the tile is meant to be.
  return `<svg xmlns="http://www.w3.org/2000/svg" width="240" height="240">
  <rect width="240" height="240" fill="${COLORS[label] || "#555"}"/>
  <text x="120" y="130" font-family="sans-serif" font-size="34" font-weight="700"
    fill="#fff" text-anchor="middle">${label.toUpperCase()}</text>
</svg>`;
}

async function fetchOne(t) {
  const url = `https://commons.wikimedia.org/wiki/Special:FilePath/${encodeURIComponent(t.src)}?width=240`;
  const res = await fetch(url, { headers: { "User-Agent": "steel-gauntlet-demo/0.1 (interview demo)" } });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const buf = Buffer.from(await res.arrayBuffer());
  if (buf.length < 1000) throw new Error("suspiciously small");
  await writeFile(new URL(t.file, OUT), buf);
  return buf.length;
}

async function main() {
  if (!existsSync(OUT)) await mkdir(OUT, { recursive: true });
  let ok = 0;
  for (const t of TILES) {
    try {
      const n = await fetchOne(t);
      console.log(`  ok   ${t.file} (${n} bytes)`);
      ok++;
    } catch (e) {
      const svgName = t.file.replace(/\.(jpg|png)$/, ".svg");
      await writeFile(new URL(svgName, OUT), fallbackSvg(t.label), "utf8");
      console.warn(`  FALLBACK ${svgName} — ${e.message}`);
    }
  }
  // Always emit the manifest so the app + server know the answer set regardless.
  const manifest = TILES.map((t, i) => ({
    id: i,
    label: t.label,
    // resolved filename: real if it exists, else the svg fallback
    file: existsSync(new URL(t.file, OUT)) ? t.file : t.file.replace(/\.(jpg|png)$/, ".svg"),
  }));
  await writeFile(new URL("manifest.json", OUT), JSON.stringify(manifest, null, 2), "utf8");
  console.log(`Done. ${ok}/${TILES.length} real photos, manifest written.`);
}

main().catch((e) => { console.error(e); process.exit(1); });
