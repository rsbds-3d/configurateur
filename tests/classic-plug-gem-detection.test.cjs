const assert = require("assert");
const fs = require("fs");
const path = require("path");

const root = path.resolve(__dirname, "..");
const app = fs.readFileSync(path.join(root, "app.js"), "utf8");

function getFunctionBody(name) {
  const start = app.indexOf(`function ${name}`);
  assert(start >= 0, `Fonction introuvable: ${name}`);
  const next = app.indexOf("\nfunction ", start + 1);
  return app.slice(start, next >= 0 ? next : app.length);
}

const scorer = getFunctionBody("scoreClassicPlugGemCandidate");
assert(scorer.includes('"cabochon"'), "La detection pierre doit reconnaitre les cabochons Rhino.");
assert(scorer.includes('"cristal"'), "La detection pierre doit reconnaitre les cristaux Rhino.");
assert(scorer.includes("isLikelyGemMaterial"), "La detection pierre doit utiliser les indices de materiau et pas seulement le volume.");
assert(scorer.includes("hsl.s > 0.2"), "La saturation couleur doit aider a separer pierre et metal.");

const selector = getFunctionBody("selectClassicPlugGemEntry");
assert(selector.includes("scoreClassicPlugGemCandidate"), "Les plugs avec pierre doivent choisir la gemme par score.");
assert(selector.includes("entries.slice(1)"), "Le plus grand solide doit etre exclu des candidats pierre.");
assert(selector.includes("gemCandidates[gemCandidates.length - 1]"), "Le plus petit volume doit seulement rester un fallback.");

const assigner = getFunctionBody("assignClassicPlugMaterialsByVolume");
assert(assigner.includes("selectClassicPlugGemEntry(entries, meshOptions)"), "L'attribution plug doit utiliser la selection robuste de pierre.");
assert(assigner.includes("gemScore"), "Le journal d'import doit exposer le score de detection pour deboguer les cas Rhino.");

const rootGemMeshes = getFunctionBody("getRootGemMeshes");
assert(rootGemMeshes.includes('if (explicitRole === "metal") return'), "Un solide explicitement metallique ne doit jamais recevoir un materiau de pierre.");
assert(rootGemMeshes.indexOf('if (explicitRole === "metal") return') < rootGemMeshes.indexOf("isLikelyGemMaterial"), "Le veto metal doit preceder toute heuristique de couleur ou transparence.");

const cacheRestore = getFunctionBody("restoreCachedImportedModelState");
assert(cacheRestore.includes('explicitRole !== "metal"'), "La restauration du cache ne doit pas reclasser un metal clair comme pierre.");

const optical = getFunctionBody("getGemOpticalQualityProfile");
assert(optical.includes("isCabochon ? THREE.MathUtils.clamp(transmission, 0.22, 0.46)"), "Les cabochons doivent rester colores et ne pas devenir trop transparents.");
assert(optical.includes("isCabochon ? 0.985"), "Les cabochons doivent conserver une opacite visuelle forte.");

const finish = getFunctionBody("applyGemReflectionFinish");
assert(finish.includes("material.depthWrite = solidOptical || optical.opacity >= 0.97"), "Les cabochons quasi opaques doivent ecrire la profondeur pour eviter les dominantes parasites.");

console.log("Classic plug gem detection regression test OK");
