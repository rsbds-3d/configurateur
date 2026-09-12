const fs = require("fs");
const path = require("path");

const root = path.resolve(__dirname, "..");
const html = fs.readFileSync(path.join(root, "index.html"), "utf8");
const logicalVersion = fs.readFileSync(path.join(root, "VERSION"), "utf8").trim();
const displayVersion = `v${logicalVersion}-260911`;

function assert(condition, message) {
  if (!condition) {
    console.error(message);
    process.exit(1);
  }
}

assert(logicalVersion === "0.4", "La version logique attendue est 0.4.");
assert((html.match(new RegExp(displayVersion.replaceAll(".", "\\."), "g")) || []).length >= 2, "La version doit être visible sur l'accueil et dans le viewer.");

console.log("Version display regression test OK");
