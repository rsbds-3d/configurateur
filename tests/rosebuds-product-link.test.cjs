const assert = require("assert");
const path = require("path");
const { pathToFileURL } = require("url");

(async () => {
  const moduleUrl = pathToFileURL(path.resolve(__dirname, "..", "assets", "js", "rosebuds-product-link.js")).href;
  const { buildViewerProductSummary, buildCustomContactUrl, resolveRosebudsProductLink } = await import(moduleUrl);
  const configuration = {
    catalogModel: "plug-classique-medium",
    modelFamily: "Classique",
    classicHead: "avec-tete",
    plugSize: "MEDIUM-30",
    plugSizeLabel: "MEDIUM",
    plugDiameterMm: 30,
    crystalSize: "27 mm",
    metalFamily: "inox",
    metalFinish: "stainless-mirror-silver",
    ornament: "crystal",
    ornamentFinish: "Clear",
  };

  assert.strictEqual(buildViewerProductSummary(configuration), "Originale - MEDIUM - Stainless steel - Clear");
  const standard = resolveRosebudsProductLink(configuration, [
    "https://rosebuds.net/fr/gamme-originale-inox/medium-30-mm-cristal-clear",
  ]);
  assert.strictEqual(standard.custom, false, "Une référence suffisamment proche doit pointer vers le produit Rosebuds.");

  const customConfiguration = { ...configuration, classicHead: "sans-tete", plugDiameterMm: 60, plugSizeLabel: "XXXL" };
  const custom = resolveRosebudsProductLink(customConfiguration, []);
  assert.strictEqual(custom.custom, true, "Un modèle hors standard doit ouvrir une demande sur mesure.");
  const customUrl = new URL(buildCustomContactUrl(customConfiguration));
  assert.strictEqual(customUrl.origin, "https://rosebuds.net");
  assert.strictEqual(customUrl.searchParams.get("id_contact"), "6");
  assert(customUrl.searchParams.get("message").includes("XXXL"), "Le message de contact doit reprendre la taille choisie.");
  assert(customUrl.searchParams.get("message").includes("Clear"), "Le message de contact doit reprendre la finition choisie.");

  console.log("Rosebuds product and custom contact link regression test OK");
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
