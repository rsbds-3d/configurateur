const assert = require("assert");
const fs = require("fs");
const path = require("path");

const root = path.resolve(__dirname, "..");
const index = fs.readFileSync(path.join(root, "index.html"), "utf8");
const welcome = fs.readFileSync(path.join(root, "welcome.js"), "utf8");
const app = fs.readFileSync(path.join(root, "app.js"), "utf8");

assert(index.includes('id="welcome-screen"'), "La page d'accueil progressive doit exister.");
assert(index.includes('<main id="app" hidden>'), "Le viewer doit être masqué au premier affichage.");
assert(!index.includes('<script type="module" src="./app.js'), "Le moteur 3D ne doit pas être chargé statiquement sur l'accueil.");
assert(welcome.includes('params.get("viewer") === "1"'), "Le viewer doit être chargé uniquement sur demande.");
assert(welcome.includes('import(`./app.js?v=${VIEWER_VERSION}`)'), "Le moteur 3D doit être importé dynamiquement.");
assert(welcome.includes('url.searchParams.set("catalogModel", modelId)'), "Le modèle choisi doit être transmis au viewer.");
assert(welcome.includes('url.searchParams.set("metalFinish", state.metalFinish)'), "La finition métal choisie doit être transmise.");
const familyQuestionIndex = welcome.indexOf('title: "Quel modèle de plug recherchez-vous ?"');
const classicHeadQuestionIndex = welcome.indexOf('title: "Votre modèle classique doit-il avoir une tête ?"');
const crystalSizeQuestionIndex = welcome.indexOf('title: "Quelle taille de cristal recherchez-vous ?"');
assert(familyQuestionIndex >= 0, "La première question doit permettre de choisir la famille du modèle.");
assert(classicHeadQuestionIndex > familyQuestionIndex, "Le choix avec ou sans tête doit suivre le choix de la famille.");
assert(crystalSizeQuestionIndex > classicHeadQuestionIndex, "La taille du cristal doit être demandée après le choix avec ou sans tête.");
assert(welcome.includes('id: "Classique"'), "La famille Classique doit être proposée.");
assert(welcome.includes('id: "NEW MEDIUM"'), "La famille NEW MEDIUM doit être proposée.");
assert(welcome.includes('id: "NEW SMALL"'), "La famille NEW SMALL doit être proposée.");
assert(welcome.includes('visual: "profile-classic"'), "Le modèle Classique doit avoir un schéma de profil.");
assert(welcome.includes('visual: "profile-new-medium"'), "Le modèle NEW MEDIUM doit avoir un schéma de profil.");
assert(welcome.includes('visual: "profile-new-small"'), "Le modèle NEW SMALL doit avoir un schéma de profil.");
assert(welcome.includes('visible: () => state.family === "Classique"'), "Le choix avec ou sans tête doit être réservé aux modèles Classiques.");
assert(welcome.includes('id: "avec-tete"') && welcome.includes('id: "sans-tete"'), "Les deux variantes Classique doivent être proposées.");
assert(welcome.includes('const activeQuestions = getActiveQuestions();'), "Le nombre d'étapes doit s'adapter aux questions conditionnelles.");
assert(welcome.includes('head: getModelHead(option.value)'), "Chaque modèle doit être classé avec ou sans tête depuis son identifiant stable.");
assert(welcome.includes('model.family === state.family'), "Les tailles et résultats doivent être filtrés par famille.");
assert(welcome.includes('matchesClassicHead(model, state.family, state.head)'), "Les tailles et résultats classiques doivent respecter le choix de tête.");
assert(welcome.includes('availableOrnaments(models, state.family, state.head, state.size, state.metal)'), "Les ornements doivent dépendre de la famille, de la tête, de la taille et du métal choisis.");
assert(index.includes('id="welcome-progress-value">Étape 1 sur 6'), "Le parcours d'accueil doit annoncer six étapes.");
assert(!welcome.includes("Quelle taille de plug recherchez-vous ?"), "L'ancien libellé sur la taille du plug ne doit plus apparaître.");

const restoreIndex = app.indexOf('.then(() => restorePersistentModelLibrary())');
const welcomeConfigIndex = app.indexOf('.then(() => applyWelcomeLaunchConfiguration(launchParams))');
assert(restoreIndex >= 0 && welcomeConfigIndex > restoreIndex, "La configuration d'accueil doit être appliquée après la restauration locale.");
assert(app.includes('if (metalSelect) metalSelect.value = metalFinish;'), "Le sélecteur métal doit refléter la finition choisie sur l'accueil.");

assert(welcome.includes('./assets/previews/models/${escapeHtml(model.id)}.png'), "Chaque carte doit utiliser une vraie capture du modele 3D.");
assert(!welcome.includes('welcome-model-body"></i>'), "Les silhouettes CSS imaginees ne doivent plus etre utilisees.");
assert(welcome.includes('params.get("thumbnail") === "1"'), "Le viewer doit proposer un mode de prise de vue sans interface.");
assert(app.includes('document.body.dataset.viewerReady = "true"'), "Le pipeline de capture doit connaitre la fin reelle du chargement.");
assert(welcome.includes("size: getPhysicalSize(label)"), "Le premier filtre doit utiliser le diametre physique du plug.");
assert(welcome.includes("family: getModelFamily(label)"), "La famille du modele doit rester une propriete distincte du diametre.");
assert(welcome.includes('if (text.includes("NEW SMALL")) return "18 mm";'), "NEW SMALL doit etre classe dans la taille physique 18 mm.");
assert(!welcome.includes("function getSize(label)"), "L'ancien classement des familles comme tailles ne doit plus etre utilise.");
assert(welcome.includes("sortPhysicalSizes"), "Les tailles physiques doivent etre presentees dans l'ordre numerique.");
assert(welcome.includes("`${model.family} · ${state.size} · ${metal} · ${finish}`"), "La famille doit etre affichee seulement dans la selection finale des modeles.");

const expectedClassicModelsWithHead = [
  "plug-classique-large-35",
  "plug-classique-medium",
  "plug-classique-small-18",
  "plug-classique-small",
  "plug-classique-xl-35",
  "plug-classique-xl-45-avec-assiette",
  "plug-classique-xl",
  "plug-classique-xxl-35",
  "plug-classique-xxl",
  "plug-classique-xxxl-60",
  "plug-classique-xxxl-70",
  "plug-classique-xxxl-80",
  "plug-classique-xxxl-90",
  "plug-classique-xxxl-100",
];
const withHeadBlock = welcome.match(/const CLASSIC_MODELS_WITH_HEAD = new Set\(\[([\s\S]*?)\]\);/)?.[1] || "";
const classifiedWithHead = Array.from(withHeadBlock.matchAll(/"([^"]+)"/g), (match) => match[1]);
assert.deepStrictEqual(classifiedWithHead, expectedClassicModelsWithHead, "La branche Avec tête doit reprendre exactement les modèles Classiques fournis.");

const expectedClassicModelsWithoutHead = [
  "plug-classique-55-sans-tete",
  "plug-classique-67-sans-tete",
  "plug-classique-large-35-sans-tete",
  "plug-classique-medium-30-sans-tete",
  "plug-classique-xl-45-sans-tete",
  "plug-classique-xxl-50-sans-tete",
  "plug-classique-xxxl-60-sans-tete",
];
const withoutHeadBlock = welcome.match(/const CLASSIC_MODELS_WITHOUT_HEAD = new Set\(\[([\s\S]*?)\]\);/)?.[1] || "";
const classifiedWithoutHead = Array.from(withoutHeadBlock.matchAll(/"([^"]+)"/g), (match) => match[1]);
assert.deepStrictEqual(classifiedWithoutHead, expectedClassicModelsWithoutHead, "La branche Sans tête doit rester explicite et séparée.");
assert(welcome.includes('CLASSIC_MODELS_WITH_HEAD.has(id)'), "La détection Avec tête doit utiliser la liste explicite.");
assert(welcome.includes('CLASSIC_MODELS_WITHOUT_HEAD.has(id)'), "La détection Sans tête doit utiliser la liste explicite.");

console.log("Welcome to viewer flow regression test OK");
