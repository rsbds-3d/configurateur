const assert = require("assert");
const fs = require("fs");
const path = require("path");

const root = path.resolve(__dirname, "..");
const indexPath = path.join(root, "index.html");
const appPath = path.join(root, "app.js");
const stylePath = path.join(root, "style.css");
const welcomePath = path.join(root, "welcome.js");
const welcomeStylePath = path.join(root, "welcome.css");

const index = fs.readFileSync(indexPath, "utf8");
const app = fs.readFileSync(appPath, "utf8");

assert(fs.existsSync(stylePath), "style.css doit exister.");
assert(index.includes('id="jewel-canvas"'), "Le canvas WebGL #jewel-canvas doit exister.");
assert(index.includes('id="loader"'), "Le loader #loader doit exister.");
assert(index.includes('id="notice"'), "La zone de notice #notice doit exister.");
assert(index.includes('id="jewel-model"'), "La liste #jewel-model doit exister.");
assert(index.includes('id="stone-showcase-visible"'), "La case #stone-showcase-visible doit exister.");

assert(!/<script[^>]+src=["']\.\/app\.js/.test(index), "L'accueil ne doit pas charger app.js immédiatement.");
assert(/src=["']\.\/welcome\.js\?v=[^"']+["']/.test(index), "index.html doit charger le contrôleur d'accueil léger.");
assert(fs.existsSync(welcomePath), "welcome.js doit exister.");
const welcome = fs.readFileSync(welcomePath, "utf8");
assert(welcome.includes('params.get("viewer") === "1"'), "Le viewer doit être activé explicitement par l'URL.");
assert(welcome.includes('import(`./app.js?v=${VIEWER_VERSION}`)'), "app.js doit être importé seulement au démarrage du viewer.");
assert(index.includes('id="welcome-steps"'), "L'accueil doit contenir le parcours progressif.");
assert(index.includes('<main id="app" hidden>'), "Le viewer doit être masqué sur l'accueil initial.");

assert(/href=["']\.\/welcome\.css\?v=[^"']+["']/.test(index), "index.html doit charger uniquement le style léger de l'accueil.");
assert(fs.existsSync(welcomeStylePath), "welcome.css doit exister.");
assert(fs.existsSync(stylePath), "style.css du viewer doit rester disponible.");

const htmlIds = new Set(Array.from(index.matchAll(/id=["']([^"']+)["']/g), (match) => match[1]));
const requiredSelectors = new Set();
const patterns = [
  /document\.querySelector\(\s*["']#([^"']+)["']\s*\)\s*\.addEventListener/g,
  /document\.querySelector\(\s*["']#([^"']+)["']\s*\)\s*\.value/g,
  /document\.querySelector\(\s*["']#([^"']+)["']\s*\)\s*\.checked/g,
  /document\.querySelector\(\s*["']#([^"']+)["']\s*\)\s*\.textContent/g,
  /document\.querySelector\(\s*["']#([^"']+)["']\s*\)\s*\.classList/g,
  /document\.querySelector\(\s*["']#([^"']+)["']\s*\)\s*\.click/g,
  /document\.querySelector\(\s*["']#([^"']+)["']\s*\)\s*\.hidden/g
];
for (const pattern of patterns) {
  for (const match of app.matchAll(pattern)) requiredSelectors.add(match[1]);
}

const missing = Array.from(requiredSelectors).filter((id) => !htmlIds.has(id)).sort();
assert.deepStrictEqual(missing, [], `Controle(s) requis absent(s) du HTML: ${missing.join(", ")}`);

console.log("Startup smoke test OK");
