const fs = require("fs");
const path = require("path");

const root = path.resolve(__dirname, "..");
const html = fs.readFileSync(path.join(root, "index.html"), "utf8");
const css = fs.readFileSync(path.join(root, "welcome.css"), "utf8");
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
assert(css.includes("filter: brightness(0) invert(1)"), "Le logo doit être blanc sur le fond sombre.");
assert(css.includes("mix-blend-mode: difference"), "Le logo doit conserver un contraste noir ou blanc selon le fond.");

console.log("Welcome brand regression test OK");
