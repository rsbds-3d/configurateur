const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { pathToFileURL } = require("node:url");

const root = path.resolve(__dirname, "..");

(async () => {
  const threeUrl = pathToFileURL(path.join(root, "assets/vendor/three.module.js")).href;
  const THREE = await import(threeUrl);
  const helperSource = fs.readFileSync(path.join(root, "assets/js/ruler-reference.js"), "utf8")
    .replace('from "three"', `from "${threeUrl}"`);
  const { createRulerReference } = await import(
    `data:text/javascript;base64,${Buffer.from(helperSource).toString("base64")}`
  );

  const bytes = fs.readFileSync(path.join(root, "assets/models/references/Regle_20cm_ROSEBUDS.glb"));
  assert.equal(bytes.readUInt32LE(0), 0x46546c67, "La référence doit être un GLB valide.");
  const gltf = JSON.parse(bytes.toString("utf8", 20, 20 + bytes.readUInt32LE(12)));
  const nodeNames = gltf.nodes.map((node) => node.name);
  for (const name of ["Regle_corps", "Graduations_gauche", "Graduations_droite", "Semelle"]) {
    assert(nodeNames.includes(name), `Le nœud ${name} doit être conservé.`);
  }
  assert.deepEqual(
    gltf.materials.map((material) => material.name).sort(),
    ["Plastique translucide", "Graduations", "Semelle ROSEBUDS"].sort(),
    "Les matériaux originaux de la règle doivent être conservés."
  );
  assert.equal(gltf.images.length, 2, "Les deux marquages imprimés doivent être présents.");
  assert(gltf.images.every((image) => image.bufferView !== undefined), "Les textures doivent rester embarquées dans le GLB.");

  const positionAccessors = gltf.meshes.flatMap((mesh) => mesh.primitives
    .map((primitive) => gltf.accessors[primitive.attributes.POSITION]));
  const modelSizeMeters = [0, 1, 2].map((axis) => (
    Math.max(...positionAccessors.map((accessor) => accessor.max[axis]))
      - Math.min(...positionAccessors.map((accessor) => accessor.min[axis]))
  ));
  assert(Math.abs(modelSizeMeters[0] - 0.21) < 0.000001, "Le corps extérieur doit mesurer 210 mm.");
  assert(Math.abs(modelSizeMeters[1] - 0.005) < 0.000001, "La hauteur nominale doit mesurer 5 mm.");
  assert(Math.abs(modelSizeMeters[2] - 0.032) < 0.000001, "La largeur doit mesurer 32 mm.");

  const original = new THREE.Group();
  const mesh = new THREE.Mesh(
    new THREE.BoxGeometry(0.21, 0.005, 0.032),
    new THREE.MeshPhysicalMaterial({ color: 0xffffff, transmission: 0.72 })
  );
  mesh.position.set(0.1, 0.2, 0.3);
  original.add(mesh);

  for (const unit of [0.01, 0.1, 1]) {
    const reference = createRulerReference(original, unit, -2);
    const box = new THREE.Box3().setFromObject(reference);
    const size = box.getSize(new THREE.Vector3());
    assert(Math.abs(box.min.y + 2) < 1e-7, "La règle doit reposer sur le sol.");
    assert(Math.abs(size.x / unit - 210) < 0.0001, "La longueur extérieure doit être de 210 mm.");
    assert(Math.abs(size.z / unit - 32) < 0.0001, "La largeur doit être de 32 mm.");
    assert(Math.abs(box.getCenter(new THREE.Vector3()).x) < 1e-7, "La règle doit être centrée horizontalement.");
    assert(Math.abs(box.getCenter(new THREE.Vector3()).z) < 1e-7, "La règle doit être centrée en profondeur.");
    assert.equal(reference.userData.graduatedLengthMm, 200);
    const clonedMesh = reference.children[0].children[0];
    assert.notEqual(clonedMesh.geometry, mesh.geometry);
    assert.notEqual(clonedMesh.material, mesh.material);
    assert.equal(clonedMesh.material.transmission, 0.72);
    assert.equal(clonedMesh.userData.nonMaterialEditable, true);
  }

  assert.equal(original.scale.x, 1, "La source mise en cache ne doit pas être redimensionnée.");
  const app = fs.readFileSync(path.join(root, "app.js"), "utf8");
  assert(app.includes('loadAsync("./assets/models/references/Regle_20cm_ROSEBUDS.glb")'));
  assert(!app.includes("BoxGeometry(200 * unit"), "L'ancienne règle simplifiée ne doit plus être générée.");
  assert(app.includes("request !== scaleReferenceRequest"), "Un chargement tardif ne doit pas réactiver une ancienne sélection.");
  console.log("Ruler GLB, physical dimensions, materials and asynchronous switching OK");
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
