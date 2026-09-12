const fs = require("fs");
const path = require("path");

const root = path.resolve(__dirname, "..");
const app = fs.readFileSync(path.join(root, "app.js"), "utf8");
const html = fs.readFileSync(path.join(root, "index.html"), "utf8");
const css = fs.readFileSync(path.join(root, "style.css"), "utf8");

function assert(condition, message) {
  if (!condition) {
    console.error(message);
    process.exit(1);
  }
}

assert(html.includes('id="decal-edit-mode"'), "Le viewer doit proposer le déplacement visuel du logo.");
assert(html.includes('id="decal-reset-position"'), "Le viewer doit proposer le recentrage du logo.");
assert(app.includes('STEM_DECAL_POSITION_STORAGE_KEY = "ctva-stem-decal-positions-v1"'), "Les positions doivent avoir une clé de stockage stable.");
assert(app.includes("positions[modelId] ="), "Chaque position doit être mémorisée par identifiant de plug.");
assert(app.includes("window.localStorage.setItem(STEM_DECAL_POSITION_STORAGE_KEY"), "Les positions doivent survivre au rechargement.");
assert(app.includes('move: handleStemDecalPointerMove'), "La souris doit déplacer la décalcomanie en direct.");
assert(app.includes('hitTest: getStemDecalAtPointer'), "Le logo doit avoir une sélection prioritaire indépendante du métal.");
assert(app.includes("raycaster.intersectObjects(decals, false)[0]"), "Le hit-test doit interroger directement les maillages de la décalcomanie.");
assert(app.includes("return hit || null;"), "Un impact sur la décalcomanie doit être retourné sans être masqué par le métal placé derrière.");
assert(app.includes("Le listener en phase de"), "La priorité de la décalcomanie sur OrbitControls doit rester explicitement documentée.");
assert(app.includes('stemDecalFrameWorld = model.matrixWorld.clone()'), "Chaque logo doit garder son repère propre.");
assert(app.includes('"#library-add", "#decal-edit-mode", "#material-visibility-library"'), "Les commandes de logo doivent rester dans la bibliothèque visible.");
assert(app.includes("raycaster.intersectObject(target, false)"), "Le déplacement doit rester projeté sur le métal ciblé.");
assert(app.includes("rebuildStemDecalGeometry(decal)"), "La projection doit être recalculée pendant le déplacement.");
assert(/\? \(safeMinT \+ safeMaxT\) \* 0\.5/.test(app), "La position initiale doit être centrée sur la tige utile.");
assert(css.includes("canvas.is-decal-editing"), "Le canvas doit signaler visuellement le mode de déplacement.");
assert(css.includes("canvas.is-decal-dragging"), "Le canvas doit signaler visuellement le glisser en cours.");

console.log("Decal position regression test OK");
