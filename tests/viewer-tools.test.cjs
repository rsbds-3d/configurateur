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
for (const value of ["coin", "bottle-small", "bottle-large", "ruler"]) {
  assert(html.includes(`value="${value}"`), `L'objet de comparaison ${value} doit être disponible.`);
}
assert(app.includes("sceneUnitsPerMillimeter"), "Les objets d'échelle doivent respecter l'échelle physique du modèle.");
assert(app.includes("makeRulerReference"), "Une règle graduée de 20 cm doit être générée.");

assert(html.includes('id="download-view-png"'), "Le téléchargement PNG doit être proposé.");
assert(html.includes('id="share-view"'), "Le partage natif doit être proposé.");
assert(app.includes("navigator.share"), "Le partage doit utiliser l'API native lorsqu'elle est disponible.");
assert(app.includes("renderCanvasToPngBlob"), "La vue courante doit être capturée depuis le canvas.");
assert(css.includes(".viewer-actions"), "Les nouvelles actions doivent avoir une présentation responsive dédiée.");

console.log("Viewer optimized render, scale and PNG tools regression test OK");
