const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const source = fs.readFileSync(path.join(__dirname, "..", "app.js"), "utf8");

assert.match(
  source,
  /return Boolean\(optical\.isOpticalGem && !optical\.isOpaque && !optical\.isPearl && transmission >= 0\.16\)/,
  "Le shader BVH doit rester disponible pour les cristaux et cabochons transparents.",
);
assert.doesNotMatch(
  source,
  /optical\.isOpticalGem && !optical\.isCabochon && optical\.ior >= 1\.72/,
  "Les cabochons transparents ne doivent plus être exclus du rendu GPU-BVH.",
);
assert.match(
  source,
  /geometry\.userData\.diamondRayTraceReady &&\s*hasActiveDiamondGpuMaterial\(mesh, signature\)/,
  "Un cache prêt ne doit être réutilisé que si le shader BVH est encore réellement assigné.",
);
assert.match(
  source,
  /nextMaterial\.userData\.diamondRayTraceSignature = mesh\.userData\.diamondRayTraceSignature/,
  "Le matériau BVH doit mémoriser la signature du rendu courant.",
);
assert.match(
  source,
  /if \(!replaceMaterialOnMesh\(mesh, sourceMaterial, nextMaterial\)\)/,
  "L'installation du shader doit vérifier que la substitution du matériau a réussi.",
);
assert.doesNotMatch(
  source,
  /function bakeDiamondInternalRayTracing|function traceDiamondChannel|new diamondBVHModule\.MeshBVH\(/,
  "Aucun calcul BVH ni bake CPU bloquant ne doit subsister sur le fil de l'interface.",
);

console.log("diamond-bvh-persistence.test.cjs: OK");
