const assert = require("assert");
const fs = require("fs");
const path = require("path");
const vm = require("vm");

const root = path.resolve(__dirname, "..");
const welcome = fs.readFileSync(path.join(root, "welcome.js"), "utf8");
const start = welcome.indexOf("function getPlugDiameterMm");
const end = welcome.indexOf("function getModelFamily", start);
assert(start >= 0 && end > start, "Les fonctions de dimensions du catalogue doivent rester isolables.");

const sandbox = {
  CLASSIC_MODELS_WITHOUT_HEAD: new Set([
    "plug-classique-xl-45-sans-tete",
  ]),
};
vm.runInNewContext(`${welcome.slice(start, end)}
this.dimensions = { getPlugDiameterMm, getPlugSizeLabel, getPlugSize, getCrystalSize };`, sandbox);

const dimensions = sandbox.dimensions;

assert.strictEqual(dimensions.getPlugSize("plug-classique-small"), "SMALL-25");
assert.strictEqual(dimensions.getPlugSize("plug-classique-small-18"), "SMALL-25");
assert.strictEqual(dimensions.getPlugSizeLabel("plug-classique-small-18"), "SMALL");
assert.strictEqual(dimensions.getCrystalSize("plug-classique-small"), "16 mm");
assert.strictEqual(dimensions.getCrystalSize("plug-classique-small-18"), "18 mm");

assert.strictEqual(dimensions.getPlugSize("plug-classique-xl"), "XL-40");
assert.strictEqual(dimensions.getPlugSize("plug-classique-xl-35"), "XL-40");
assert.strictEqual(dimensions.getPlugSizeLabel("plug-classique-xl-35"), "XL");
assert.strictEqual(dimensions.getCrystalSize("plug-classique-xl"), "27 mm");
assert.strictEqual(dimensions.getCrystalSize("plug-classique-xl-35"), "35 mm");
assert.strictEqual(dimensions.getPlugSize("plug-classique-xl-45-avec-assiette"), "XL-45");

assert.strictEqual(dimensions.getPlugSize("plug-classique-xxl"), "XXL-50");
assert.strictEqual(dimensions.getPlugSize("plug-classique-xxl-35"), "XXL-50");
assert.strictEqual(dimensions.getPlugSizeLabel("plug-classique-xxl-35"), "XXL");
assert.strictEqual(dimensions.getCrystalSize("plug-classique-xxl"), "27 mm");
assert.strictEqual(dimensions.getCrystalSize("plug-classique-xxl-35"), "35 mm");

assert.strictEqual(dimensions.getPlugSize("plug-classique-xxxl-60"), "XXXL-60");
assert.strictEqual(dimensions.getPlugSize("plug-classique-xxxl-100"), "XXXL-100");
assert.strictEqual(dimensions.getPlugSizeLabel("plug-classique-large-35"), "LARGE");
assert.strictEqual(dimensions.getPlugSizeLabel("plug-classique-medium"), "MEDIUM");
assert.strictEqual(dimensions.getCrystalSize("plug-classique-xxxl-100"), "50 mm");

assert.strictEqual(dimensions.getPlugSize("plug-new-small-cristal"), "SMALL-25");
assert.strictEqual(dimensions.getCrystalSize("plug-new-small-cristal"), "9 mm");
assert.strictEqual(dimensions.getPlugSize("plug-new-medium-xl-45-sans-tete-cristal"), "XL-45");
assert.strictEqual(dimensions.getCrystalSize("plug-new-medium-xl-45-sans-tete-cristal"), "9 mm");

console.log("Catalog plug and crystal dimensions regression test OK");
