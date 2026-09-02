const assert = require("assert");
const fs = require("fs");
const path = require("path");

const root = path.resolve(__dirname, "..");
const app = fs.readFileSync(path.join(root, "app.js"), "utf8");

assert(app.includes("function frameClassicPlugGemModel"), "Le cadrage dedie aux plugs avec pierre doit exister.");
assert(app.includes("meshOptions.classicPlugGem && frameClassicPlugGemModel"), "Les plugs avec pierre doivent utiliser le cadrage pierre face camera.");
assert(app.includes("frameImportedModel(model, meshOptions)"), "Le chargement Rhino doit transmettre les options au cadrage.");
assert(app.includes("frameImportedModel(model, entry.sourceType"), "Le chargement depuis la bibliotheque doit conserver les options de cadrage.");
assert(app.includes("gemCenter") && app.includes("metalCenter"), "Le cadrage doit se baser sur la pierre et le métal détectés.");

const classicPlugGemMatches = app.match(/classicPlugGem:\s*true/g) || [];
assert(classicPlugGemMatches.length >= 10, "Les plugs classiques avec pierre doivent rester identifies par classicPlugGem.");

console.log("Camera framing regression test OK");