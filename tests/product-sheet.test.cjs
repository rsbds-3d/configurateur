const assert = require("node:assert/strict");
(async () => {
  const { buildProductSheet } = await import("../assets/js/product-sheet.js");
  const html = buildProductSheet({ title: "MEDIUM <test>", image: "data:image/png;base64,AAAA", version: "v0.11", choices: [["Metal", "Inox"], ["Bronze", "Gold"], ["Absent", ""]] });
  assert(html.includes("MEDIUM &lt;test&gt;"));
  assert(html.includes("<dd>Inox</dd>"));
  assert(html.includes("<dd>Gold</dd>"));
  assert(!html.includes("<dt>Absent"));
  assert(html.includes("data:image/png;base64,AAAA"));
  assert(html.includes("@media print"));
  assert.throws(() => buildProductSheet({ image: 'javascript:alert(1)' }));
  console.log("Fiche autonome, visuel, choix et echappement OK");
})().catch(error => { console.error(error); process.exitCode = 1; });
