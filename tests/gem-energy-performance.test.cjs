const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const app = fs.readFileSync(path.join(__dirname, "..", "app.js"), "utf8");

assert(
  app.includes("transmission >= 0.16"),
  "Le shader GPU-BVH doit couvrir toutes les pierres optiques suffisamment transparentes."
);
assert(
  !app.includes("function bakeDiamondInternalRayTracing"),
  "Le bake CPU bloquant doit etre absent pour toutes les pierres."
);
assert(
  app.includes("THREE.MathUtils.clamp(optical.envMapIntensity * reflectionBoost * studioBoost, 0.55, 4.8)"),
  "L'intensite HDRI des pierres doit etre plafonnee pour eviter la surexposition."
);
assert(
  app.includes("gemHighlightCompression") && app.includes("opticalCompression"),
  "Les deux shaders optiques doivent comprimer leurs hautes lumieres."
);
assert(
  !app.includes("optical.envMapIntensity + getDiamondHdriReflectionStrength() * 7"),
  "L'ancien boost HDRI additif, source de blancs brules, ne doit pas revenir."
);
assert(
  app.includes("geometry.userData.diamondBvhGeometrySignature === geometrySignature"),
  "La BVH doit etre reutilisee tant que la geometrie de la pierre ne change pas."
);
assert(
  app.includes("await buildBVHInWorker(geometry, { signal, onProgress })"),
  "La construction BVH doit utiliser un worker avec progression et annulation."
);
assert(
  app.includes("await compileBeforeSwap({") && !app.includes("function traceDiamondChannel"),
  "Le rendu GPU doit etre precompile sans remplacer le materiau visible ni relancer un bake CPU."
);

console.log("gem-energy-performance.test.cjs: OK");
