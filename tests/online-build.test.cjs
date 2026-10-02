const assert = require("assert");
const fs = require("fs");
const path = require("path");

const root = path.resolve(__dirname, "..");
const onlineRoot = path.join(root, "online");
const auth = fs.readFileSync(path.join(onlineRoot, "auth.js"), "utf8");
const guard = fs.readFileSync(path.join(onlineRoot, "app-guard.js"), "utf8");
const login = fs.readFileSync(path.join(onlineRoot, "login.html"), "utf8");
const build = fs.readFileSync(path.join(onlineRoot, "build-online.ps1"), "utf8");
const workflow = fs.readFileSync(path.join(root, ".github", "workflows", "deploy-pages.yml"), "utf8");
const desktopIndex = fs.readFileSync(path.join(root, "index.html"), "utf8");

assert(auth.includes("crypto.subtle.digest"), "La version en ligne doit vérifier l'accès avant le chargement.");
assert(auth.includes("sessionStorage"), "L'autorisation en ligne doit rester limitée à la session de l'onglet.");
assert(auth.includes('APP_PAGE = "./configurateur.html"'), "La page de connexion doit rediriger vers une page d'application distincte.");
assert(auth.includes("window.location.replace(applicationUrl())"), "La connexion doit ouvrir la page protégée sans afficher l'application en arrière-plan.");
assert(/CREDENTIAL_HASH = "[a-f0-9]{64}"/.test(auth), "La version publiée doit stocker uniquement une empreinte SHA-256 des identifiants.");
assert(!auth.includes("passwordInput.value ==="), "Le mot de passe ne doit pas être comparé directement dans le JavaScript publié.");
assert(login.includes('class="access-page"'), "L'identification doit disposer de sa propre page autonome.");
assert(!login.includes("welcome.js") && !login.includes("app.js"), "La page d'identification ne doit charger ni le catalogue ni le viewer.");
assert(guard.includes("window.location.replace(destination)"), "Un accès direct au configurateur sans session doit revenir à la page d'identification.");
assert(build.includes("assets"), "Le paquet en ligne doit embarquer toutes les fonctions et ressources du configurateur.");
assert(build.includes("-Raw -Encoding UTF8"), "La construction Windows doit conserver les accents UTF-8.");
assert(build.includes("configurateur.html"), "Le paquet doit séparer la page de connexion de la page applicative.");
assert(build.includes("app-guard.js"), "La page applicative doit charger le garde d'accès avant l'interface.");
assert(!build.includes("'MODELES 3D'") && !build.includes("'MATERIAUX'"), "Les anciens exemples et le classeur métier ne doivent pas être publiés dans le site.");
assert(workflow.includes("actions/deploy-pages@v4"), "Le déploiement GitHub Pages doit être configuré.");
assert(!desktopIndex.includes("access-gate"), "L'application Windows doit rester indépendante de l'écran d'accès en ligne.");

console.log("Independent online build regression test OK");
