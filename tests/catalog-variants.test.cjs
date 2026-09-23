const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const root = path.resolve(__dirname, "..");
const source = fs.readFileSync(path.join(root, "welcome.js"), "utf8");
const app = fs.readFileSync(path.join(root, "app.js"), "utf8");
const context = vm.createContext({});
vm.runInContext(source.slice(source.indexOf("const ALUMINUM_FINISHES_BY_SIZE_CLASS"), source.indexOf("const params ="))
  + source.slice(source.indexOf("function getFinishRules("), source.indexOf("function getAvailableOrnamentFinishes("))
  + "\nfunction normalize(s) { return s.normalize('NFD').replace(/[\\u0300-\\u036f]/g, '').toLowerCase(); }"
  + app.slice(app.indexOf("function catalogModelSupportsOrnament("), app.indexOf("function getCatalogCrystalFinishRules(")), context);
const allowed = (model, ornament, metal) => {
  context.model = model; context.ornament = ornament; context.metal = metal;
  context.meta = { modelFamily: model.family, metalSizeClass: model.metalSizeClass, ornamentFamilies: model.ornaments };
  const home = vm.runInContext("modelSupportsOrnament(model, ornament, metal)", context);
  assert.equal(home, vm.runInContext("catalogModelSupportsOrnament(meta, ornament, metal)", context), "Viewer and welcome must agree");
  return home;
};
for (const family of ["Classique", "NEW SMALL", "NEW MEDIUM"]) {
  const model = { family, label: "SMALL", metalSizeClass: family === "NEW MEDIUM" ? "MEDIUM" : "SMALL", ornaments: ["gem", "pressed-glass"] };
  for (const ornament of model.ornaments) {
    assert.equal(allowed(model, ornament, "inox"), true);
    assert.equal(allowed(model, ornament, "alu"), family !== "NEW MEDIUM");
  }
}
assert.equal(allowed({ family: "Classique", metalSizeClass: "XL", ornaments: ["gem"] }, "gem", "inox"), false);
context.model = { family: "NEW SMALL", label: "NEW SMALL cabochon", metalSizeClass: "SMALL", ornaments: ["gem", "pressed-glass"], plugSize: "SMALL-25", crystalSize: "12 mm", head: "" };
context.metals = { alu: [["aluminum-black"], ["aluminum-red"]], inox: [["stainless-mirror-silver"]] };
context.finishes = { gem: [["Blue Agata"], ["Onyx"]], "pressed-glass": [["Green"], ["Purple cabochon"]] };
const variants = vm.runInContext("enumerateModelConfigurations(model, {}, metals, finishes)", context);
assert.equal(variants.length, 8);
assert.equal(new Set(variants.map(JSON.stringify)).size, variants.length);
assert(variants.every((v) => v.metalFinish !== "aluminum-red"));
const filtered = vm.runInContext('enumerateModelConfigurations(model, {metal:"alu",ornamentFinish:"Onyx"}, metals, finishes)', context);
assert.equal(filtered.length, 1); assert.equal(filtered[0].ornament, "gem");
assert.equal(filtered[0].metalFinish, "aluminum-black");
assert(source.includes("openViewer(variant.model.id, variant.resolved)"), "A result opens its own exact materials");
assert(source.includes("slice(0, visibleResultCount)"), "Do not build thousands of DOM cards at once");
for (const translated of ['"Agate bleue"', '"Pourpre"', '"Aigue-marine"']) assert(!source.includes(translated));
console.log("Catalog material variants, labels and cross-view compatibility OK");
