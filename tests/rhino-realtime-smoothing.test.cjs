const assert = require("assert");
const fs = require("fs");
const path = require("path");

const app = fs.readFileSync(path.resolve(__dirname, "..", "app.js"), "utf8");

const defaults = app.match(/const defaultRhinoMeshOptions = \{([\s\S]*?)\n\};/)?.[1] || "";
assert(defaults.includes("smoothAngle: 86"), "Le lissage Rhino temps réel doit conserver les courbures jusqu'à 86 degrés.");
assert(defaults.includes("weightedNormals: true"), "Les normales pondérées doivent être actives par défaut.");
assert(defaults.includes("weldTolerance: 0.0002"), "Les sommets quasi confondus doivent être soudés avec une tolérance très fine.");
assert(app.includes("if (processing.weightedNormals) computeWeightedSmoothNormals"), "Le pipeline d'import doit appliquer les normales pondérées.");
assert(app.includes("facetTextureEnabled: false"), "La modulation artificielle des facettes doit être désactivée par défaut.");
assert(!app.includes("normal = normalize(mix(normal, smoothNormalForPolish"), "Le shader métal ne doit plus réinjecter la normale plane de chaque triangle.");
assert(app.includes('ctva-smooth-rhino-polish-v3'), "Le shader lissé doit invalider l'ancien cache GPU.");
assert(app.includes('!mesh.geometry?.getAttribute("tangent") && "anisotropy" in mat'), "Imported meshes without tangent frames must not use anisotropic reflection.");
assert(app.includes('composer.addPass(new OutputPass())'), "Postprocessing must finish with color conversion and tone mapping.");

console.log("Rhino realtime smoothing regression test OK");
