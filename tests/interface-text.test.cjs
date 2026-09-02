const assert = require("assert");
const fs = require("fs");
const path = require("path");

const root = path.resolve(__dirname, "..");
const textFiles = [
  "index.html",
  "app.js",
  "style.css",
  "welcome.js",
  "welcome.css",
  ".viewer-server.cjs",
  "README.md",
  "relancer-viewer.bat",
  "Lancer Configurateur Bijoux.bat",
  "Installer Configurateur Bijoux.bat"
];

const mojibakePatterns = [
  /Ã[\u0080-\u00bfA-Za-z]/,
  /Â[\u0080-\u00bfA-Za-z]/,
  /â[€™€œ€“—]/,
  /�/
];

for (const relativePath of textFiles) {
  const filePath = path.join(root, relativePath);
  if (!fs.existsSync(filePath)) continue;
  const text = fs.readFileSync(filePath, "utf8");
  for (const pattern of mojibakePatterns) {
    assert(
      !pattern.test(text),
      `${relativePath} contient probablement du texte mal encode: ${pattern}`
    );
  }
}

const index = fs.readFileSync(path.join(root, "index.html"), "utf8");
const expectedLabels = [
  "Choisir les listes o\u00f9 chaque mat\u00e9riau appara\u00eet",
  "Biblioth\u00e8que",
  "Pi\u00e8ce de la biblioth\u00e8que",
  "Journal de d\u00e9bogage"
];

assert(index.includes('<meta charset="utf-8" />'), "index.html doit declarer UTF-8.");
for (const label of expectedLabels) {
  assert(index.includes(label), `Libelle attendu absent ou mal encode: ${label}`);
}

const server = fs.readFileSync(path.join(root, ".viewer-server.cjs"), "utf8");
const expectedHeaders = [
  "text/html; charset=utf-8",
  "text/javascript; charset=utf-8",
  "text/css; charset=utf-8"
];
for (const header of expectedHeaders) {
  assert(server.includes(header), `Header UTF-8 manquant: ${header}`);
}

console.log("Interface text encoding test OK");
