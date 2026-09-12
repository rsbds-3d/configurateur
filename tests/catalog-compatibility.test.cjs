const assert = require("assert");
const fs = require("fs");
const path = require("path");
const vm = require("vm");

const root = path.resolve(__dirname, "..");
const welcome = fs.readFileSync(path.join(root, "welcome.js"), "utf8");
const app = fs.readFileSync(path.join(root, "app.js"), "utf8");

const rulesSource = welcome.match(/const ALUMINUM_FINISHES_BY_SIZE_CLASS[\s\S]*?const CLASSIC_MODELS_WITH_HEAD/)?.[0]
  .replace(/const CLASSIC_MODELS_WITH_HEAD$/, "");
assert(rulesSource, "La matrice de compatibilite des metaux doit etre lisible dans welcome.js.");

const sandbox = {};
vm.runInNewContext(`${rulesSource}\nthis.rules = {
  aluminumBySize: ALUMINUM_FINISHES_BY_SIZE_CLASS,
  aluminumByFamily: ALUMINUM_FINISHES_BY_MODEL_FAMILY,
  stainlessBySize: STAINLESS_FINISHES_BY_SIZE_CLASS,
  crystalFinishes: CRYSTAL_FINISH_RULES,
};`, sandbox);

const plain = (value) => JSON.parse(JSON.stringify(value));
assert.deepStrictEqual(plain(sandbox.rules.aluminumByFamily["NEW SMALL"]), ["aluminum-black"], "NEW SMALL aluminium doit rester uniquement noir.");
assert.deepStrictEqual(plain(sandbox.rules.aluminumBySize.SMALL), ["aluminum-gray", "aluminum-black", "aluminum-red", "aluminum-violet"], "SMALL aluminium doit proposer gris, noir, rouge et violet.");
assert.strictEqual(sandbox.rules.aluminumBySize.MEDIUM.length, 9, "MEDIUM aluminium doit proposer les neuf couleurs.");
assert.deepStrictEqual(plain(sandbox.rules.aluminumBySize.LARGE), ["aluminum-black", "aluminum-red"], "LARGE aluminium doit proposer noir et rouge.");
["XL", "XXL", "XXXL"].forEach((sizeClass) => {
  assert.deepStrictEqual(plain(sandbox.rules.aluminumBySize[sizeClass]), ["aluminum-black", "aluminum-red", "aluminum-violet", "aluminum-orange"], `${sizeClass} aluminium doit proposer noir, rouge, violet et orange.`);
});

assert.deepStrictEqual(plain(sandbox.rules.stainlessBySize.MEDIUM), ["stainless-mirror-silver", "stainless-flash-gold-1-micron"], "MEDIUM inox doit proposer poli miroir et flash or.");
["SMALL", "LARGE", "XL", "XXL", "XXXL"].forEach((sizeClass) => {
  assert.deepStrictEqual(plain(sandbox.rules.stainlessBySize[sizeClass]), ["stainless-mirror-silver"], `${sizeClass} inox doit proposer uniquement le poli miroir.`);
});

assert.deepStrictEqual(plain(sandbox.rules.crystalFinishes.SMALL_18), ["Aurore Boreale", "Clear", "Aquamarine"], "SMALL 18 doit limiter les couleurs de cristal a trois choix.");
assert.deepStrictEqual(plain(sandbox.rules.crystalFinishes.SMALL), ["Clear", "Aurore Boreale"], "SMALL doit limiter les couleurs de cristal a deux choix.");
assert.deepStrictEqual(plain(sandbox.rules.crystalFinishes.NEW), ["Aurore Boreale", "Clear", "Golden Shadow", "Smoked topaze"], "NEW SMALL et NEW MEDIUM doivent partager quatre couleurs de cristal.");
assert.deepStrictEqual(plain(sandbox.rules.crystalFinishes.XL_35), ["Clear", "Jet"], "XL 35 doit limiter les cristaux a Clear et Jet.");
assert.deepStrictEqual(plain(sandbox.rules.crystalFinishes.XXL_35), ["Clear", "Jet"], "XXL 35 doit limiter les cristaux a Clear et Jet.");
assert(welcome.includes('if (/\\b(?:XXXL|XXL)\\s*50\\b/.test(text)) return null;'), "XXL/XXXL 50 doit proposer toutes les couleurs de cristal.");
assert(app.includes('if (/\\b(?:XXXL|XXL)\\s*50\\b/.test(text)) return null;'), "Le viewer doit conserver toutes les couleurs de cristal pour XXL/XXXL 50.");
assert(welcome.includes('model.family === "Classique" && ["XXL", "XXXL"].includes(model.metalSizeClass)'), "Les classiques au-delà de XL doivent exclure l'aluminium sur l'accueil.");
assert(welcome.includes('function modelSupportsMetalFamily'), "Le choix du métal doit être filtré avant la finition.");
assert(app.includes('modelFamily === "Classique" && ["XXL", "XXXL"].includes(metalSizeClass)'), "Les métadonnées du viewer doivent réserver les classiques XXL et XXXL à l'inox.");

assert(welcome.includes('model.family === "NEW SMALL" && metalFamily === "alu" && ornament === "gem"'), "La gemme doit etre bloquee sur NEW SMALL aluminium.");
assert(welcome.includes('["gem", "pressed-glass"].includes(ornament)'), "Gem et verre presse doivent partager une restriction de famille explicite.");
assert(welcome.includes('model.metalSizeClass === "SMALL"') && welcome.includes('model.family === "NEW MEDIUM"'), "Gem et verre presse doivent etre reserves a SMALL, NEW SMALL et NEW MEDIUM.");
assert(welcome.includes('if (getMetalSizeClass(label, option.value) === "SMALL") ornaments.push("gem", "pressed-glass")'), "Gem et verre presse doivent etre limites aux geometries SMALL compatibles.");
assert(welcome.includes('ornaments.push("crystal")'), "Le cristal doit rester disponible pour tous les modeles avec ornement.");
assert(welcome.includes('["Clear", "Clear"') && welcome.includes('["Aurore Boreale", "Aurore Boreale"'), "Les cristaux doivent afficher leurs noms catalogue d'origine.");
assert(!welcome.includes('"Cristal clair"') && !welcome.includes('"Aurore boréale"'), "Les traductions françaises des noms de cristaux ne doivent plus être affichées.");

[
  "ALUMINUM_FINISHES_BY_MODEL_FAMILY",
  "STAINLESS_FINISHES_BY_SIZE_CLASS",
  "function catalogModelSupportsMetalFinish",
  "function catalogModelSupportsOrnament",
  "function getCatalogCrystalFinishRules",
  "function catalogModelSupportsOrnamentFinish",
  ".filter((family) => catalogModelSupportsOrnament(meta, family, state.metal))",
].forEach((needle) => assert(app.includes(needle), `La logique du viewer doit contenir : ${needle}`));

console.log("Catalog compatibility unit test OK");
