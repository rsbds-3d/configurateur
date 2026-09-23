const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { pathToFileURL } = require("node:url");
const root = path.resolve(__dirname, "..");
(async () => {
  const { drawWatermarkPattern } = await import(pathToFileURL(path.join(root, "assets/js/png-watermark.js")));
  for (const [width, height] of [[1600, 900], [390, 844], [1024, 1024]]) {
    const draws = [];
    let saved = 0, restored = 0, angle = 0;
    const context = { save() { saved++; }, restore() { restored++; }, translate() {}, rotate(value) { angle = value; }, drawImage(...args) { draws.push(args); } };
    drawWatermarkPattern(context, { width: 945, height: 387 }, width, height);
    assert.equal(saved, restored); assert.equal(angle, -Math.PI / 6);
    assert(draws.length > 12, "Repeated logos cover portrait and landscape");
    assert.equal(new Set(draws.map((d) => d[3])).size, 1, "Stable logo size");
    assert(context.globalAlpha > 0 && context.globalAlpha < 0.4, "Keep product visible");
    const row = draws.filter((d) => d[2] === draws[0][2]);
    const step = row[1][1] - row[0][1];
    for (let i = 2; i < row.length; i++) assert(Math.abs(row[i][1] - row[i - 1][1] - step) < 1e-6);
  }
  const app = fs.readFileSync(path.join(root, "app.js"), "utf8");
  assert(app.includes("return withWatermark ? watermarkPngBlob(blob) : blob"));
  assert(app.includes("const sourceBlob = await renderCanvasToPngBlob(false)"), "AI input remains unmarked");
  assert(app.includes("showOptimizedRender(await watermarkPngBlob(enhanced)"), "Both AI and fallback output are watermarked");
  console.log("PNG diagonal watermark pattern and export integration OK");
})().catch((error) => { console.error(error); process.exitCode = 1; });
