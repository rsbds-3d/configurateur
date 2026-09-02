const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const app = fs.readFileSync(path.join(__dirname, "..", "app.js"), "utf8");

assert(app.includes('replace(/^(crystal|gem|pressed-glass|bronze):/i, "")'), "Le prefixe de famille doit etre retire avant de resoudre la finition de pierre.");
assert(app.includes("function applyCatalogGemPreset("), "Une fonction unique doit appliquer la finition optique catalogue.");
assert(app.includes("settings.activeCatalogGemPreset = presetId"), "La finition de pierre active doit etre memorisee entre les modeles.");
assert(app.includes('applyCatalogGemPreset(ornamentFamily, ornamentFinish, { reason: "configuration accueil" })'), "Le lancement depuis le catalogue doit utiliser la finition unifiee.");
assert(app.includes('applyCatalogGemPreset(state.ornament, state.ornamentFinish, { reason: "changement modele catalogue" })'), "Le changement de miniature doit reappliquer la finition de pierre.");
assert(
  /const material = options\.keepOpticalSettings\s*\? nextMaterial\s*:\s*preserveObjectMaterialRenderState/.test(app),
  "L'affectation optique doit conserver le materiau plutot que la valeur booleenne du reglage."
);
assert(!app.includes('"#include <common>\\\\nattribute'), "Le shader doit recevoir de vrais retours a la ligne GLSL.");
assert(!app.includes("float active ="), "Le shader ne doit pas employer le mot GLSL reserve active.");
assert(!app.includes("gemMeshes.slice(0, 2).forEach"), "Toutes les pierres du modele doivent recevoir le rendu optique, sans limite arbitraire.");
assert(app.includes('if (explicitRole === "metal") return'), "Le catalogue ne doit jamais appliquer une pierre a un maillage explicitement metallique.");

console.log("catalog-gem-consistency.test.cjs: OK");
