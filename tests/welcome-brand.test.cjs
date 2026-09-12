const fs = require("fs");
const path = require("path");

const root = path.resolve(__dirname, "..");
const html = fs.readFileSync(path.join(root, "index.html"), "utf8");
const css = fs.readFileSync(path.join(root, "welcome.css"), "utf8");
const viewerCss = fs.readFileSync(path.join(root, "style.css"), "utf8");
const logo = path.join(root, "assets", "brand", "rosebuds-logo.png");

function assert(condition, message) {
  if (!condition) {
    console.error(message);
    process.exit(1);
  }
}

assert(fs.existsSync(logo), "Le logo officiel ROSEBUDS doit être livré avec l'accueil.");
assert(fs.statSync(logo).size > 1000, "Le fichier du logo ROSEBUDS ne doit pas être vide.");
assert(html.includes('class="welcome-rosebuds-logo"'), "Le logo ROSEBUDS doit apparaître dans l'en-tête.");
assert(html.includes('alt="ROSEBUDS"'), "Le logo doit avoir un nom accessible.");
assert(html.includes('class="viewer-rosebuds-logo"'), "Le logo ROSEBUDS doit rester visible dans le viewer 3D.");
assert(!/CHARLES THIERRY DE VILLE D'AVRAY/i.test(html), "Le nom personnel ne doit plus apparaître dans l'accueil ni dans le viewer.");
assert(viewerCss.includes(".viewer-rosebuds-logo"), "Le viewer doit définir une présentation dédiée au logo ROSEBUDS.");
assert(css.includes("background: #ffffff"), "L'accueil doit reprendre le fond blanc du site Rosebuds.");
assert(css.includes("color: #111111"), "L'accueil doit utiliser un texte noir contrasté.");
assert(css.includes("#ed2b86"), "L'accueil doit reprendre l'accent fuchsia Rosebuds.");
assert(css.includes("mix-blend-mode: normal"), "Le logo noir doit conserver son rendu d'origine sur fond blanc.");
assert(viewerCss.includes("filter: brightness(0)"), "Le logo du viewer doit rester noir sur son panneau clair.");

console.log("Welcome brand regression test OK");
