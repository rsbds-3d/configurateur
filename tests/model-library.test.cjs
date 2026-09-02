const assert = require("assert");
const fs = require("fs");
const path = require("path");

const root = path.resolve(__dirname, "..");
const app = fs.readFileSync(path.join(root, "app.js"), "utf8");
const html = fs.readFileSync(path.join(root, "index.html"), "utf8");

const models = [
  {
    id: "plug-new-small-cabochon-lisse",
    label: "Plug NEW SMALL cabochon lisse",
    file: "assets/models/plugs/new-small/new-small-cabochon-lisse.3dm",
  },
  {
    id: "plug-new-small-cristal",
    label: "Plug NEW SMALL cristal",
    file: "assets/models/plugs/new-small/new-small-cristal.3dm",
  },
  {
    id: "plug-new-medium-30-sans-tete-cabochon-lisse",
    label: "Plug NEW MEDIUM 30 cabochon lisse",
    file: "assets/models/plugs/new-medium/new-medium-30-sans-tete-cabochon-lisse.3dm",
  },
  {
    id: "plug-new-medium-30-sans-tete-cristal",
    label: "Plug NEW MEDIUM 30 cristal",
    file: "assets/models/plugs/new-medium/new-medium-30-sans-tete-cristal.3dm",
  },
  {
    id: "plug-new-medium-35-sans-tete-cabochon-lisse",
    label: "Plug NEW MEDIUM 35 cabochon lisse",
    file: "assets/models/plugs/new-medium/new-medium-35-sans-tete-cabochon-lisse.3dm",
  },
  {
    id: "plug-new-medium-35-sans-tete-cristal",
    label: "Plug NEW MEDIUM 35 cristal",
    file: "assets/models/plugs/new-medium/new-medium-35-sans-tete-cristal.3dm",
  },
  {
    id: "plug-new-medium-55-sans-tete-cabochon-lisse",
    label: "Plug NEW MEDIUM 55 cabochon lisse",
    file: "assets/models/plugs/new-medium/new-medium-55-sans-tete-cabochon-lisse.3dm",
  },
  {
    id: "plug-new-medium-55-sans-tete-cristal",
    label: "Plug NEW MEDIUM 55 cristal",
    file: "assets/models/plugs/new-medium/new-medium-55-sans-tete-cristal.3dm",
  },
  {
    id: "plug-new-medium-67-sans-tete-cabochon-lisse",
    label: "Plug NEW MEDIUM 67 cabochon lisse",
    file: "assets/models/plugs/new-medium/new-medium-67-sans-tete-cabochon-lisse.3dm",
  },
  {
    id: "plug-new-medium-67-sans-tete-cristal",
    label: "Plug NEW MEDIUM 67 cristal",
    file: "assets/models/plugs/new-medium/new-medium-67-sans-tete-cristal.3dm",
  },
  {
    id: "plug-new-medium-xl-45-sans-tete-cabochon-lisse",
    label: "Plug NEW MEDIUM XL 45 cabochon lisse",
    file: "assets/models/plugs/new-medium/new-medium-xl-45-sans-tete-cabochon-lisse.3dm",
  },
  {
    id: "plug-new-medium-xl-45-sans-tete-cristal",
    label: "Plug NEW MEDIUM XL 45 cristal",
    file: "assets/models/plugs/new-medium/new-medium-xl-45-sans-tete-cristal.3dm",
  },
  {
    id: "plug-new-medium-xxl-50-sans-tete-cabochon-lisse",
    label: "Plug NEW MEDIUM XXL 50 cabochon lisse",
    file: "assets/models/plugs/new-medium/new-medium-xxl-50-sans-tete-cabochon-lisse.3dm",
  },
  {
    id: "plug-new-medium-xxl-50-sans-tete-cristal",
    label: "Plug NEW MEDIUM XXL 50 cristal",
    file: "assets/models/plugs/new-medium/new-medium-xxl-50-sans-tete-cristal.3dm",
  },
  {
    id: "plug-new-medium-xxxl-60-sans-tete-cabochon-lisse",
    label: "Plug NEW MEDIUM XXXL 60 cabochon lisse",
    file: "assets/models/plugs/new-medium/new-medium-xxxl-60-sans-tete-cabochon-lisse.3dm",
  },
  {
    id: "plug-new-medium-xxxl-60-sans-tete-cristal",
    label: "Plug NEW MEDIUM XXXL 60 cristal",
    file: "assets/models/plugs/new-medium/new-medium-xxxl-60-sans-tete-cristal.3dm",
  },
];

for (const model of models) {
  assert(html.includes(`value="${model.id}"`), `${model.label} doit etre present dans la liste HTML.`);
  assert(app.includes(`"${model.id}"`), `${model.label} doit etre present dans le catalogue JS.`);
  assert(app.includes(model.file.replace(/\\/g, "/")), `${model.label} doit pointer vers son fichier asset.`);
  assert(fs.existsSync(path.join(root, model.file)), `${model.label} doit avoir un fichier 3DM servi.`);
  assert(fs.statSync(path.join(root, model.file)).size > 100000, `${model.label} ne doit pas etre un fichier vide.`);
}

console.log("Model library regression test OK");