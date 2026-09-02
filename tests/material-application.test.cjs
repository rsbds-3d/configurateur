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

const helper = getFunctionBody("applySingleMaterialToMesh");
assert(helper.includes("detachDiamondRuntimeFromMesh(mesh)"), "Le changement de matériau doit nettoyer l'ancien état BVH/diamant du mesh.");
assert(helper.includes("mesh.geometry?.clearGroups"), "Le changement de matériau doit neutraliser les anciens groupes multi-matériaux Rhino.");
assert(helper.includes("keepOpticalSettings"), "Le helper doit préserver les propriétés optiques des gemmes.");
assert(helper.includes("preserveObjectMaterialRenderState"), "Le helper doit conserver le durcissement PBR des métaux.");

const objectApply = getFunctionBody("applyMaterialToSelectedObject");
assert(!objectApply.includes("selectedSceneObject.material ="), "Le menu objet ne doit plus assigner le matériau directement.");
assert(/applySingleMaterialToMesh\(selectedSceneObject, material\);/.test(objectApply), "Les métaux doivent passer par le helper robuste.");
assert(/applySingleMaterialToMesh\(selectedSceneObject, material, \{ keepOpticalSettings: true \}\);/.test(objectApply), "Les pierres doivent garder transmission, IOR et shader optique.");
assert(objectApply.includes("delete") === false, "Le nettoyage bas niveau doit rester encapsulé dans le helper.");

const stoneApply = getFunctionBody("applyStoneShowcaseMaterial");
assert(!stoneApply.includes("stoneShowcaseMesh.material = makeGemMaterialFromPreset"), "La pierre témoin ne doit plus assigner le matériau directement.");
assert(stoneApply.includes("keepOpticalSettings: true"), "La pierre témoin doit conserver son matériau optique.");

const savedApply = getFunctionBody("applySavedMaterialToSelectedObject");
assert(!savedApply.includes("selectedSceneObject.material = materialFromSaved"), "Les matériaux sauvegardés doivent passer par le helper robuste.");
assert(savedApply.includes("keepOpticalSettings: selected.entry.type === \"gem\""), "Les sauvegardes de pierres doivent rester optiques.");

const savedFactory = getFunctionBody("materialFromSaved");
assert(savedFactory.includes("applyGemReflectionFinish"), "Un matériau pierre sauvegardé doit récupérer le shader gemme réaliste.");

console.log("Material application regression test OK");