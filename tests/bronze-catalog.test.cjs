const assert = require("assert");
const fs = require("fs");
const path = require("path");

const root = path.resolve(__dirname, "..");
const app = fs.readFileSync(path.join(root, "app.js"), "utf8");
const html = fs.readFileSync(path.join(root, "index.html"), "utf8");
const welcome = fs.readFileSync(path.join(root, "welcome.js"), "utf8");
assert(welcome.includes('activeQuestions.slice(definitionIndex + 1)'), "Downstream resets must follow the displayed bronze question order.");
assert(app.includes('finishes: ["Gold", "Silver", "Shiny", "Patine"]'), "Viewer and catalog must expose the same bronze finishes.");

const variants = [
  ["plug-classique-large-35-keyring", "plug-classique-large-35", 27],
  ["plug-classique-medium-keyring", "plug-classique-medium", 27],
  ["plug-classique-small-18-keyring", "plug-classique-small-18", 18],
  ["plug-classique-small-keyring", "plug-classique-small", 16],
  ["plug-classique-xl-35-keyring", "plug-classique-xl-35", 35],
  ["plug-classique-xl-45-avec-assiette-keyring", "plug-classique-xl-45-avec-assiette", 27],
  ["plug-classique-xl-keyring", "plug-classique-xl", 27],
  ["plug-classique-xxl-35-keyring", "plug-classique-xxl-35", 35],
  ["plug-classique-xxl-keyring", "plug-classique-xxl", 27],
  ["plug-classique-xxxl-60-keyring", "plug-classique-xxxl-60", 50],
  ["plug-classique-xxxl-70-keyring", "plug-classique-xxxl-70", 50],
  ["plug-classique-xxxl-80-keyring", "plug-classique-xxxl-80", 50],
  ["plug-classique-xxxl-90-keyring", "plug-classique-xxxl-90", 50],
  ["plug-classique-xxxl-100-keyring", "plug-classique-xxxl-100", 50],
];

for (const [id, baseId, targetDiameter] of variants) {
  assert(html.includes(`value="${id}"`), `${id} doit être proposé dans le catalogue.`);
  assert(app.includes(`"${id}"`), `${id} doit être enregistré dans le viewer.`);
  assert(app.includes(`"${baseId}"`), `${id} doit réutiliser son corps Originale avec tête correspondant.`);
  assert(app.includes(`, ${targetDiameter}]`), `Le diamètre cible ${targetDiameter} mm doit piloter l'échelle du bronze.`);
}

const asset = path.join(root, "assets", "models", "plugs", "bronzes", "keyring-reference-26-8.3dm");
assert(fs.existsSync(asset) && fs.statSync(asset).size > 1_000_000, "Le bronze Keyring de référence doit être un 3DM exploitable et partagé.");
assert(app.includes("composeRhinoBronzeOrnament"), "Le corps avec tête et le bronze partagé doivent être composés au chargement.");
assert(app.includes('child.name = "Bronze Keyring reference 26.8 mm"'), "Le maillage bronze doit être identifié sans ambiguïté.");

assert(app.includes('classicPlugRole = "bronze"'), "Le bronze doit avoir un rôle distinct du métal et des pierres.");
assert(app.includes('const scale = target / reference;'), "Le bronze doit suivre la même loi d'échelle dimensionnelle que l'ornement principal.");
assert(app.includes('if (family === "bronze") return applyCatalogBronzeFinish'), "Les finitions bronze ne doivent pas être appliquées au corps métallique.");
assert(app.includes('key.includes("silver")') && app.includes('key.includes("gold")') && app.includes('key.includes("patine")'), "Gold, Silver, Shiny et Patine doivent produire des matériaux distincts.");

console.log("Bronze catalog regression test OK");
