const assert = require("assert");
const fs = require("fs");
const path = require("path");

const root = path.resolve(__dirname, "..");
const index = fs.readFileSync(path.join(root, "index.html"), "utf8");
const app = fs.readFileSync(path.join(root, "app.js"), "utf8");
const css = fs.readFileSync(path.join(root, "style.css"), "utf8");

[
  'id="catalog-filter-bar"',
  'id="catalog-filter-size"',
  'id="catalog-filter-metal"',
  'id="catalog-filter-metal-finish"',
  'id="catalog-filter-ornament"',
  'id="catalog-filter-ornament-finish"',
  'id="catalog-filter-gallery"',
].forEach((needle) => {
  assert(index.includes(needle), `Controle catalogue manquant: ${needle}`);
});

[
  "catalogMetalFamilies",
  "catalogOrnamentFamilies",
  "function getCatalogModelMeta",
  "function renderCatalogGallery",
  "function filterContextMaterialEntriesForCatalog",
  "function handleCatalogGalleryClick",
  "stainless-flash-gold-1-micron",
].forEach((needle) => {
  assert(app.includes(needle), `Logique catalogue manquante: ${needle}`);
});

[
  ".catalog-bar",
  ".catalog-card",
  ".catalog-card__name",
  ".model-compare__thumb-name",
].forEach((needle) => {
  assert(css.includes(needle), `Style catalogue manquant: ${needle}`);
});

assert(
  app.includes("return getCatalogModelEntries();"),
  "La liste multi-modeles doit reutiliser les modeles filtres du catalogue.",
);
assert(
  app.includes("filterContextMaterialEntriesForCatalog(contextMaterialType, rawEntries, contextMaterialObject)"),
  "Le menu contextuel doit limiter les materiaux aux combinaisons catalogue possibles.",
);

console.log("Catalog filter banner test OK");
