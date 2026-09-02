const assert = require("assert");
const fs = require("fs");
const path = require("path");

const root = path.resolve(__dirname, "..");
const app = fs.readFileSync(path.join(root, "app.js"), "utf8");
const html = fs.readFileSync(path.join(root, "index.html"), "utf8");
const css = fs.readFileSync(path.join(root, "style.css"), "utf8");

const requiredMetals = [
  ["aluminum-gray", "Aluminium poli gris"],
  ["aluminum-black", "Aluminium anodisé noir"],
  ["aluminum-red", "Aluminium anodisé rouge"],
  ["aluminum-violet", "Aluminium anodisé violet"],
  ["aluminum-pink", "Aluminium anodisé rose"],
  ["aluminum-green", "Aluminium anodisé vert"],
  ["aluminum-blue", "Aluminium anodisé bleu"],
  ["aluminum-gold", "Aluminium anodisé or"],
  ["aluminum-orange", "Aluminium anodisé orange"],
  ["titanium-polished", "Titane poli"],
  ["stainless-mirror-silver", "Inox poli miroir argent"],
  ["stainless-mirror-gold", "Inox poli miroir or"],
  ["stainless-flash-gold-1-micron", "Inox flash or 1 micron"],
];

for (const [id, label] of requiredMetals) {
  assert(app.includes(`"${id}":`), `${label} doit exister dans les presets JS.`);
  assert(app.includes(`label: "${label}"`), `${label} doit avoir son libellé JS.`);
  assert(html.includes(`value="${id}"`), `${label} doit exister dans les listes HTML.`);
}

const decalPath = path.join(root, "assets", "decals", "logo-gravure-alu.png");
assert(fs.existsSync(decalPath), "La décalcomanie ROSEBUDS doit être copiée dans assets/decals.");
assert(fs.statSync(decalPath).size > 1000, "La décalcomanie ne doit pas être vide.");
assert(app.includes('supportTextureLoader.load("./assets/decals/logo-gravure-alu.png"'), "La texture de décalcomanie doit être chargée par l'application.");
assert(app.includes('import { DecalGeometry } from "three/addons/geometries/DecalGeometry.js"'), "La décalcomanie doit utiliser une projection DecalGeometry sur le maillage.");
assert(app.includes("findThinStemDecalPlacement"), "La décalcomanie doit cibler la partie fine de la tige dans le maillage.");
assert(app.includes("stemDecalTexture.rotation = Math.PI / 2"), "La décalcomanie doit être orientée dans le sens de lecture.");
assert(app.includes("gemSideBias"), "La décalcomanie doit être recentrée vers la pierre sur la zone de diamètre constant.");
assert(app.includes("halfTextShiftWorld = widthWorld * 0.5"), "La décalcomanie doit être déplacée d'une demi-longueur de texte vers la pierre.");
assert(app.includes("safeMinT") && app.includes("safeMaxT"), "La décalcomanie doit rester contenue dans la zone de diamètre constant.");
assert(app.includes("worldUnitsPerMillimeter"), "Le déplacement de la décalcomanie doit respecter l'échelle du fichier Rhino.");
assert(app.includes("axis: textAxis"), "La décalcomanie doit aligner le texte sur l'axe de la tige.");
assert(!app.includes("new THREE.PlaneGeometry(widthWorld / scalar, heightWorld / scalar)"), "La décalcomanie ne doit plus être une plaque plane flottante.");
assert(app.includes("addStemDecalToClassicPlug(model, meshOptions)"), "La décalcomanie doit être ajoutée aux imports Rhino de plugs.");
assert(app.includes("addStemDecalToClassicPlug(group, { classicPlugVolumeMaterials: true })"), "La décalcomanie doit aussi exister dans le plug de secours.");
assert(app.includes("child.userData.stemDecal"), "La décalcomanie doit être ignorée par les listes d'objets et calculs de boîte.");

assert(html.includes('id="model-compare-control"'), "Le contrôle de comparaison de plugs doit exister.");
assert(app.includes("function loadModelComparisonFromSelection"), "Le chargement multi-plugs doit être implémenté.");
assert(app.includes("placeComparisonModels(loaded, settings.compareModelSpacingMm)"), "Le placement multi-plugs doit utiliser le jeu réglable.");
assert(app.includes("function getComparisonArrangementAxis"), "Le rangement multi-plugs doit choisir un axe transversal au plug.");
assert(app.includes("comparisonArrangeAxis"), "Le rangement multi-plugs doit mémoriser l'axe utilisé.");
assert(app.includes("function refreshComparisonGemRendering"), "Le rendu optique des pierres doit être relancé après chargement comparatif.");
assert(app.includes("refreshComparisonGemRendering(comparison, { maxRayTraced: Math.min(2, loaded.length) })"), "Les pierres comparées doivent garder le shader optique sans lancer tous les calculs lourds  la fois.");
assert(app.includes("applyGemReflectionFinish(material, preset)"), "Les pierres comparées doivent recevoir immédiatement la finition optique réaliste.");
assert(css.includes(".model-compare__item"), "La liste multi-plugs doit avoir un style dédié.");

console.log("Material library/decal/compare regression test OK");
