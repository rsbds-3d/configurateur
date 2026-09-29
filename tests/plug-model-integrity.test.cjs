const assert = require("assert");
const crypto = require("crypto");
const fs = require("fs");
const path = require("path");

const root = path.resolve(__dirname, "..");
const modelRoot = path.join(root, "assets", "models", "plugs");
const sourceManifest = JSON.parse(fs.readFileSync(path.join(modelRoot, "model-source-manifest.json"), "utf8"));
const integrity = JSON.parse(fs.readFileSync(path.join(modelRoot, "model-integrity.json"), "utf8"));
const app = fs.readFileSync(path.join(root, "app.js"), "utf8");

assert.strictEqual(sourceManifest.models.length, 37, "Le manifeste doit référencer les 37 modèles fournis.");
assert.strictEqual(integrity.models.length, 37, "Le contrôle d'intégrité doit couvrir les 37 modèles.");
assert.strictEqual(new Set(sourceManifest.models.map((entry) => entry.modelId)).size, 37, "Chaque identifiant doit être unique.");
assert.strictEqual(new Set(sourceManifest.models.map((entry) => entry.target)).size, 37, "Chaque cible doit être unique.");

const integrityById = new Map(integrity.models.map((entry) => [entry.modelId, entry]));
for (const mapping of sourceManifest.models) {
  const expected = integrityById.get(mapping.modelId);
  assert(expected, `Empreinte absente pour ${mapping.modelId}.`);
  assert.strictEqual(expected.target, mapping.target, `Cible incohérente pour ${mapping.modelId}.`);
  const targetPath = path.join(modelRoot, ...mapping.target.split("/"));
  assert(fs.existsSync(targetPath), `Modèle cible absent: ${mapping.target}.`);
  const contents = fs.readFileSync(targetPath);
  assert.strictEqual(contents.length, expected.bytes, `Taille inattendue pour ${mapping.modelId}.`);
  assert.strictEqual(crypto.createHash("sha256").update(contents).digest("hex").toUpperCase(), expected.sha256, `Empreinte invalide pour ${mapping.modelId}.`);
  assert(app.includes(`"${mapping.modelId}"`), `Modèle non déclaré dans app.js: ${mapping.modelId}.`);
  assert(app.includes(`./assets/models/plugs/${mapping.target}`), `Chemin non chargé par app.js: ${mapping.target}.`);
}

assert(app.includes('const MODEL_ASSET_VERSION = "20260929-optimized-3dm-v10"'), "Les modèles doivent utiliser le cache-buster v0.10.");
assert(app.includes("withCurrentModelVersion(url)"), "Le chargeur Rhino doit versionner les URL des modèles.");

console.log("Plug 3DM source mapping and integrity regression test OK");
