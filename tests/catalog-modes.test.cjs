const assert = require("assert");
const fs = require("fs");
const path = require("path");

const root = path.resolve(__dirname, "..");
const html = fs.readFileSync(path.join(root, "index.html"), "utf8");
const welcome = fs.readFileSync(path.join(root, "welcome.js"), "utf8");
const ai = fs.readFileSync(path.join(root, "assets", "js", "catalog-ai.js"), "utf8");
const worker = fs.readFileSync(path.join(root, "assets", "js", "catalog-ai-worker.js"), "utf8");

assert(html.includes('name="catalog-mode" value="guided" checked'), "Le mode guidé doit être proposé par défaut.");
assert(html.includes('name="catalog-mode" value="multi"'), "Le mode multifiltre doit être proposé.");
assert(html.includes('name="catalog-mode" value="ai"'), "Le mode prompt IA doit être proposé.");
assert(html.includes('id="welcome-multifilter-fields"'), "Le panneau multifiltre doit afficher tous ses champs.");
assert(html.includes('id="welcome-ai-prompt"'), "Le prompt en langage naturel doit être disponible.");
assert(welcome.includes("renderMultifilters"), "Le multifiltre doit recalculer ses listes compatibles.");
assert(welcome.includes("getFacetOptions"), "Les facettes doivent être croisées avec les autres filtres actifs.");
assert(welcome.includes("keepOnlyPossibleSelections"), "Une sélection devenue impossible doit être retirée.");
assert(welcome.includes("findClosestModels"), "Le mode IA doit afficher des modèles compatibles et classés.");
assert(welcome.includes("parseCatalogPrompt(prompt, schema)"), "Des premiers résultats doivent apparaître avant la fin du chargement du LLM.");
assert(welcome.includes("Premiers résultats prêts. Le modèle local affine la recherche"), "Le calcul IA en arrière-plan doit être expliqué sans bloquer le catalogue.");
assert(ai.includes("new Worker"), "Le LLM doit travailler dans un worker pour préserver la fluidité.");
assert(worker.includes("@huggingface/transformers"), "Le moteur IA doit utiliser Transformers.js côté client.");
assert(worker.includes("gemma-3-270m-it-ONNX"), "Le prompt doit utiliser un petit LLM open source.");
assert(worker.includes("useBrowserCache = true"), "Le modèle doit être mis en cache dans le navigateur après son premier chargement.");

console.log("Catalog modes and local AI regression test OK");
