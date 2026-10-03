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
assert(app.includes("renderer.setPixelRatio(originalPixelRatio)"), "La capture doit restaurer la resolution initiale.");
assert(app.includes("Delai de super-resolution depasse"), "Une IA silencieuse doit avoir un delai limite.");
assert(app.includes("catch (error) { reject(error); }"), "Une erreur de conversion de pixels doit permettre le repli HD.");

assert(html.includes('id="scale-reference-enabled"'), "Le viewer doit permettre d'activer un objet d'échelle.");
for (const value of ["coin", "bottle-1l", "ruler", "compare"]) {
  assert(html.includes(`value="${value}"`), `L'objet de comparaison ${value} doit être disponible.`);
}
assert(html.includes('value="bottle-1l" selected'), "La bouteille 1 L doit être l'objet d'échelle sélectionné par défaut.");
assert(app.includes('select?.value || "bottle-1l"'), "Le repli JavaScript de l'objet d'échelle doit utiliser la bouteille.");
assert(app.includes("sceneUnitsPerMillimeter"), "Les objets d'échelle doivent respecter l'échelle physique du modèle.");
assert(app.includes('loadAsync("./assets/models/references/Piece_1_euro.glb")'), "La pièce d'échelle doit utiliser le GLB détaillé fourni.");
assert(app.includes("createCoinReference"), "La pièce GLB doit être préparée dans un module testable dédié.");
assert(app.includes('loadAsync("./assets/models/references/Regle_20cm_ROSEBUDS.glb")'), "La règle d'échelle doit utiliser le GLB ROSEBUDS fourni.");
assert(app.includes("createRulerReference"), "La règle GLB doit être préparée dans un module testable dédié.");
assert(app.includes("getHorizontalPrincipalAxisAngle(root)"), "La règle doit suivre l'axe principal horizontal du plug.");
assert(app.includes("parallelToPlug = true"), "La règle affichée doit être marquée comme parallèle au plug.");
assert(html.includes('id="scale-comparison-upright"'), "La comparaison doit proposer la position verticale des plugs.");
assert(html.includes("Ogive en haut, tête en bas"), "Le sens de la position verticale doit être explicite.");
assert(app.includes('verticalPose = "ogive-up-head-down"'), "La pose verticale doit conserver l'ogive en haut et la tête en bas.");
assert(app.includes("gemBox.getCenter(new THREE.Vector3()).y > box.getCenter(new THREE.Vector3()).y"), "La pierre doit servir de contrôle pour maintenir la tête en bas.");
assert(html.includes('id="scale-comparison-arc"'), "La comparaison doit proposer une disposition en arc.");
assert(html.includes('id="scale-comparison-radius"'), "Le rayon de l'arc doit être réglable.");
assert(app.includes("comparisonArcRadiusMm"), "Le rayon physique de l'arc doit être conservé dans le groupe comparatif.");
assert(app.includes("Halo du plug courant"), "Le plug courant doit être signalé par un halo lumineux.");
assert(app.includes("controls.enablePan = false"), "La caméra comparative doit rester centrée sur le plug courant.");
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
