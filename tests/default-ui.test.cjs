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

assert(app.includes('metalPreset: "silver"'), "Le métal par défaut doit être Argent poli.");
assert(/<option value="silver" selected>Argent poli<\/option>/.test(html), "La liste métal HTML doit sélectionner Argent poli par défaut.");
assert(app.includes('supportMaterial: "rhino-wood-olivier-poli"'), "Le sol par défaut doit être Olivier poli.");
assert(app.includes("setControlsPanelCollapsed(true);"), "Le panneau de réglages doit être réduit par défaut.");
assert(/<aside class="controls is-collapsed"/.test(html), "Le panneau doit être réduit dès le HTML initial.");
assert(/id="toggle-panel"[^>]+aria-label="Ouvrir le panneau"[^>]+aria-expanded="false"/.test(html), "Le bouton du panneau doit annoncer l'état réduit.");
assert(html.includes("20260902-release-v03"), "Le cache-buster HTML doit pointer vers la version courante du parcours catalogue.");
assert(html.includes('id="compare-models-enabled"'), "Le mode plusieurs plugs doit avoir une case d'activation.");
assert(html.includes('id="compare-model-list"'), "Le mode plusieurs plugs doit avoir une liste de choix multiples.");
assert(app.includes('compareModelSpacingMm: 100'), "Le jeu par défaut entre plugs doit être 100 mm.");
assert(css.includes(".controls.is-collapsed #toggle-panel"), "Le bouton du panneau réduit doit rester visible et cliquable.");
assert(/\.controls\.is-collapsed \.controls__header \{[\s\S]*?gap: 0;/.test(css), "Le bouton réduit doit tenir dans la bande visible du panneau.");

console.log("Default UI regression test OK");
