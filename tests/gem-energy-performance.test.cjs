const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const app = fs.readFileSync(path.join(__dirname, "..", "app.js"), "utf8");

assert(
  app.includes("transmission >= 0.16"),
  "Le shader GPU-BVH doit couvrir toutes les pierres optiques suffisamment transparentes."
);
assert(
  app.includes("fallbackOptical.isCabochon || fallbackOptical.ior < 1.72"),
  "Le bake CPU doit rester reserve aux pierres facettees a fort indice de refraction."
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
  app.includes('"Lancer de rayons GPU-BVH actif, calcul CPU évité."'),
  "Le chemin GPU ne doit pas relancer le bake CPU sommet par sommet."
);
assert(
  app.includes("if (gpuMaterial) {") && app.includes("const p = new THREE.Vector3();"),
  "Le bake CPU doit rester uniquement un fallback quand le shader GPU-BVH est indisponible."
);

console.log("gem-energy-performance.test.cjs: OK");
