const assert = require("assert");
const fs = require("fs");
const path = require("path");

const source = fs.readFileSync(path.join(__dirname, "..", "welcome.js"), "utf8");

assert(source.includes('window.location.protocol === "file:"'), "L'ouverture directe du HTML doit être détectée.");
assert(source.includes('const LOCAL_APPLICATION_URL = "http://localhost:8080/"'), "La reprise doit viser le serveur local de l'application.");
assert(source.includes("targetUrl.search = window.location.search"), "Les choix du modèle doivent être conservés pendant la reprise.");
assert(source.includes("targetUrl.hash = window.location.hash"), "L'ancre éventuelle doit être conservée.");
assert(source.includes("window.location.replace(targetUrl.href)"), "Le fichier local doit basculer vers le serveur lorsque celui-ci répond.");
assert(source.includes("Lancez « Configurateur de Bijoux Rosebuds »"), "Une aide explicite doit remplacer l'écran noir si le serveur est arrêté.");

console.log("Direct file launch recovery regression test OK");
