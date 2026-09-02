const assert = require("assert");
const fs = require("fs");
const path = require("path");

const root = path.resolve(__dirname, "..");
const app = fs.readFileSync(path.join(root, "app.js"), "utf8");
const html = fs.readFileSync(path.join(root, "index.html"), "utf8");
const css = fs.readFileSync(path.join(root, "style.css"), "utf8");

assert(html.includes('id="loader-progress"'), "La barre de progression doit avoir un indicateur déterminé.");
assert(html.includes('id="loader-percent"'), "Le pourcentage de chargement doit être visible.");
assert(html.includes('id="loader-stage"'), "L'étape de chargement doit être visible.");
assert(html.includes('role="progressbar"'), "La progression doit être accessible aux technologies d'assistance.");
assert(app.includes("function startLoading("), "Le chargement doit avoir un point de départ commun.");
assert(app.includes("function finishLoading("), "Le chargement doit avoir une finalisation commune.");
assert(app.includes("updateRhinoLoadingProgress"), "Le téléchargement Rhino doit alimenter la progression.");
assert(app.includes('setLoadingProgress(93, "Préparation du rendu optique des pierres")'), "Le rendu optique doit être annoncé.");
assert(app.includes("Construction de l’accélérateur BVH"), "La construction BVH doit être annoncée.");
assert(app.includes("Compilation du matériau à lancer de rayons"), "La compilation du matériau optique doit être annoncée.");
assert(app.includes("await waitForProgressPaint()"), "L'interface doit pouvoir peindre la progression avant les calculs bloquants.");
assert(app.includes("diamondCalculationProgressActive"), "La progression BVH doit rester active jusqu'à la première image.");
assert(css.includes("transition-delay: 480ms"), "Les chargements rapides ne doivent pas faire clignoter la barre.");
assert(/\.loader\s*\{[\s\S]*?inset:\s*auto 0 0;/.test(css), "La progression doit être un bandeau discret au bord inférieur.");
assert(/\.loader__bar\s*\{[\s\S]*?height:\s*2px;/.test(css), "La progression doit utiliser un trait fin.");
assert(app.includes("const halfTextShiftWorld = widthWorld * 0.5;"), "La décalcomanie doit être décalée d'une demi-longueur de texte.");
assert(app.includes("const ornamentDirection = gemDirection || inferredOrnamentDirection;"), "Le côté pierre doit être inféré pour les plugs sans pierre.");

console.log("Loading progress regression test OK");
