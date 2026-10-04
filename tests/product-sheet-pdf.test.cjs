const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { jsPDF } = require("../assets/vendor/jspdf.umd.min.js");
(async () => {
  const { buildProductSheetPdf } = await import("../assets/js/product-sheet.js");
  const root = path.join(__dirname, "..");
  const image = `data:image/png;base64,${fs.readFileSync(path.join(root, "assets/icons/rosebuds-launcher.png")).toString("base64")}`;
  const pdf = await buildProductSheetPdf({ title: "NEW MEDIUM - LARGE - Aluminium - Aurore Boreale", image,
    version: "v0.11-260930", choices: [["Metal", "Aluminium"], ["Taille du cristal", "12 mm"], ...Array.from({ length: 28 }, (_, i) => [`Choix ${i}`, "Valeur longue pour tester le retour a la ligne dans la fiche produit Rosebuds"]) ] }, jsPDF);
  assert.equal(pdf.type, "application/pdf");
  const bytes = Buffer.from(await pdf.arrayBuffer());
  assert(bytes.subarray(0, 5).equals(Buffer.from("%PDF-")));
  assert(bytes.includes(Buffer.from("/Subtype /Image")));
  assert(Number(bytes.toString("latin1").match(/\/Count (\d+)/)?.[1]) > 1);
  fs.mkdirSync(path.join(root, "tmp/pdfs"), { recursive: true });
  fs.writeFileSync(path.join(root, "tmp/pdfs/product-sheet-test.pdf"), bytes);
  await assert.rejects(buildProductSheetPdf({ image: "javascript:alert(1)" }, jsPDF));
  console.log("PDF natif, image et pagination OK");
})().catch((error) => { console.error(error); process.exitCode = 1; });
