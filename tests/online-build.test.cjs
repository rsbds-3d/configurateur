const assert = require("assert");
const fs = require("fs");
const path = require("path");

const root = path.resolve(__dirname, "..");
const onlineRoot = path.join(root, "online");
const auth = fs.readFileSync(path.join(onlineRoot, "auth.js"), "utf8");
const build = fs.readFileSync(path.join(onlineRoot, "build-online.ps1"), "utf8");
const workflow = fs.readFileSync(path.join(root, ".github", "workflows", "deploy-pages.yml"), "utf8");
const desktopIndex = fs.readFileSync(path.join(root, "index.html"), "utf8");

assert(auth.includes("crypto.subtle.digest"), "La version en ligne doit vérifier l'accès avant le chargement.");
assert(auth.includes("sessionStorage"), "L'autorisation en ligne doit rester limitée à la session de l'onglet.");
assert(/CREDENTIAL_HASH = "[a-f0-9]{64}"/.test(auth), "La version publiée doit stocker uniquement une empreinte SHA-256 des identifiants.");
assert(!auth.includes("passwordInput.value ==="), "Le mot de passe ne doit pas être comparé directement dans le JavaScript publié.");
assert(build.includes("assets"), "Le paquet en ligne doit embarquer toutes les fonctions et ressources du configurateur.");
assert(build.includes("-Raw -Encoding UTF8"), "La construction Windows doit conserver les accents UTF-8.");
assert(!build.includes("'MODELES 3D'") && !build.includes("'MATERIAUX'"), "Les anciens exemples et le classeur métier ne doivent pas être publiés dans le site.");
assert(workflow.includes("actions/deploy-pages@v4"), "Le déploiement GitHub Pages doit être configuré.");
assert(!desktopIndex.includes("access-gate"), "L'application Windows doit rester indépendante de l'écran d'accès en ligne.");

console.log("Independent online build regression test OK");
