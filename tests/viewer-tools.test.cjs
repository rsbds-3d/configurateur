const assert = require("assert");
const fs = require("fs");
const path = require("path");

const root = path.resolve(__dirname, "..");
const html = fs.readFileSync(path.join(root, "index.html"), "utf8");
const app = fs.readFileSync(path.join(root, "app.js"), "utf8");
const worker = fs.readFileSync(path.join(root, "assets", "js", "render-enhance-worker.js"), "utf8");
const css = fs.readFileSync(path.join(root, "style.css"), "utf8");

assert(html.includes('id="optimized-render"'), "Le viewer doit proposer un rendu optimisé.");
assert(html.includes('id="optimized-render-dialog"'), "Le rendu optimisé doit être présenté dans une fenêtre dédiée.");
assert(worker.includes("swin2SR-classical-sr-x2-64"), "Le rendu optimisé doit utiliser le modèle open source Swin2SR.");
assert(worker.includes("@huggingface/transformers"), "L'IA d'image doit être exécutée localement avec Transformers.js.");
assert(app.includes("smoothMetalMeshesForOptimizedRender"), "Le lissage du métal doit précéder la capture optimisée.");
assert(app.includes("showAuxiliaryProgress"), "Le calcul optimisé doit publier sa progression en bas de page.");

assert(html.includes('id="scale-reference-enabled"'), "Le viewer doit permettre d'activer un objet d'échelle.");
for (const value of ["coin", "bottle-1l", "ruler", "compare"]) {
  assert(html.includes(`value="${value}"`), `L'objet de comparaison ${value} doit être disponible.`);
}
assert(app.includes("sceneUnitsPerMillimeter"), "Les objets d'échelle doivent respecter l'échelle physique du modèle.");
assert(app.includes('loadAsync("./assets/models/references/Piece_1_euro.glb")'), "La pièce d'échelle doit utiliser le GLB détaillé fourni.");
assert(app.includes("createCoinReference"), "La pièce GLB doit être préparée dans un module testable dédié.");
assert(app.includes('loadAsync("./assets/models/references/Regle_20cm_ROSEBUDS.glb")'), "La règle d'échelle doit utiliser le GLB ROSEBUDS fourni.");
assert(app.includes("createRulerReference"), "La règle GLB doit être préparée dans un module testable dédié.");
assert(html.includes('id="scale-comparison-upright"'), "La comparaison doit proposer la position verticale des plugs.");
assert(app.includes("comparisonSpacingMm = 20"), "La comparaison automatique doit conserver un jeu physique de 20 mm.");
assert(app.includes("getAutomaticScaleComparisonModelIds"), "Les tailles compatibles doivent être sélectionnées automatiquement.");
assert(app.includes("root.visible = false"), "Le plug isolé doit être remplacé par la rangée comparative.");
assert(!app.includes("BoxGeometry(200 * unit"), "L'ancienne règle simplifiée ne doit plus être générée.");

assert(html.includes('id="download-view-png"'), "Le téléchargement PNG doit être proposé.");
assert(html.includes('id="share-view"'), "Le partage natif doit être proposé.");
assert(app.includes("navigator.share"), "Le partage doit utiliser l'API native lorsqu'elle est disponible.");
assert(app.includes("renderCanvasToPngBlob"), "La vue courante doit être capturée depuis le canvas.");
assert(css.includes(".viewer-actions"), "Les nouvelles actions doivent avoir une présentation responsive dédiée.");

console.log("Viewer optimized render, scale and PNG tools regression test OK");
