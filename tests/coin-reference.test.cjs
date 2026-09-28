const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { pathToFileURL } = require("node:url");

const root = path.resolve(__dirname, "..");

(async () => {
  const threeUrl = pathToFileURL(path.join(root, "assets/vendor/three.module.js")).href;
  const THREE = await import(threeUrl);
  const helperSource = fs.readFileSync(path.join(root, "assets/js/coin-reference.js"), "utf8")
    .replace('from "three"', `from "${threeUrl}"`);
  const { createCoinReference } = await import(
    `data:text/javascript;base64,${Buffer.from(helperSource).toString("base64")}`
  );

  const bytes = fs.readFileSync(path.join(root, "assets/models/references/Piece_1_euro.glb"));
  assert.equal(bytes.readUInt32LE(0), 0x46546c67, "La référence doit être un GLB valide.");
  const gltf = JSON.parse(bytes.toString("utf8", 20, 20 + bytes.readUInt32LE(12)));
  assert(gltf.nodes.some((node) => node.name === "Piece_1_euro"));
  assert.deepEqual(
    gltf.materials.map((material) => material.name).sort(),
    ["Piece_avers", "Piece_revers", "Piece_tranche"].sort(),
    "Les matériaux distincts de l'avers, du revers et de la tranche doivent être conservés."
  );
  assert(gltf.images.every((image) => image.bufferView !== undefined), "La texture doit rester embarquée dans le GLB.");

  const positionAccessors = gltf.meshes.flatMap((mesh) => mesh.primitives
    .map((primitive) => gltf.accessors[primitive.attributes.POSITION]));
  const modelSizeMeters = [0, 1, 2].map((axis) => (
    Math.max(...positionAccessors.map((accessor) => accessor.max[axis]))
      - Math.min(...positionAccessors.map((accessor) => accessor.min[axis]))
  ));
  assert(Math.abs(modelSizeMeters[0] - 0.02325) < 0.000001);
  assert(Math.abs(modelSizeMeters[1] - 0.00233) < 0.000001);
  assert(Math.abs(modelSizeMeters[2] - 0.02325) < 0.000001);

  const original = new THREE.Group();
  const mesh = new THREE.Mesh(
    new THREE.BoxGeometry(0.02325, 0.00233, 0.02325),
    new THREE.MeshStandardMaterial({ color: 0xd8b84d, metalness: 0.8 })
  );
  mesh.position.set(0.1, 0.2, 0.3);
  original.add(mesh);

  for (const unit of [0.01, 0.1, 1]) {
    const reference = createCoinReference(original, unit, -2);
    const box = new THREE.Box3().setFromObject(reference);
    const size = box.getSize(new THREE.Vector3());
    assert(Math.abs(box.min.y + 2) < 1e-7, "La pièce doit reposer sur le sol.");
    assert(Math.abs(size.y / unit - 23.25) < 0.0001, "Le diamètre vertical doit être de 23,25 mm.");
    assert(Math.abs(size.z / unit - 2.33) < 0.0001, "L'épaisseur doit être de 2,33 mm.");
    assert(Math.abs(box.getCenter(new THREE.Vector3()).x) < 1e-7, "La pièce doit être centrée horizontalement.");
    const clonedMesh = reference.children[0].children[0];
    assert.notEqual(clonedMesh.geometry, mesh.geometry);
    assert.notEqual(clonedMesh.material, mesh.material);
    assert.equal(clonedMesh.material.metalness, 0.8);
    assert.equal(clonedMesh.userData.nonMaterialEditable, true);
  }

  assert.equal(original.scale.x, 1, "La source mise en cache ne doit pas être redimensionnée.");
  assert.equal(original.rotation.x, 0, "La source mise en cache ne doit pas être tournée.");
  const app = fs.readFileSync(path.join(root, "app.js"), "utf8");
  assert(app.includes('loadAsync("./assets/models/references/Piece_1_euro.glb")'));
  assert(!app.includes("Piece_1_euro_visionneuse"), "La variante visionneuse ne doit pas être utilisée.");
  assert(!app.includes("CylinderGeometry(11.625"), "L'ancienne pièce simplifiée ne doit plus être générée.");
  assert(app.includes("request !== scaleReferenceRequest"), "Un chargement tardif ne doit pas réactiver une ancienne sélection.");
  console.log("Coin GLB, physical dimensions, materials and asynchronous switching OK");
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
