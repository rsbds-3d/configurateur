const CONTACT_URL = "https://rosebuds.net/fr/nous-contacter";
const INOX_CATEGORY_URL = "https://rosebuds.net/fr/6-gamme-originale-inox";
const ALU_CATEGORY_URL = "https://rosebuds.net/fr/7-gamme-originale-alu";

const METAL_LABELS = Object.freeze({
  alu: "Aluminium",
  inox: "Stainless steel",
});

const METAL_FINISH_LABELS = Object.freeze({
  "aluminum-gray": "Grey",
  "aluminum-black": "Black",
  "aluminum-red": "Red",
  "aluminum-violet": "Violet",
  "aluminum-pink": "Pink",
  "aluminum-green": "Green",
  "aluminum-blue": "Blue",
  "aluminum-gold": "Gold",
  "aluminum-orange": "Orange",
  "stainless-mirror-silver": "Poli miroir",
  "stainless-flash-gold-1-micron": "Flash or 1 micron",
});

const ORNAMENT_LABELS = Object.freeze({
  crystal: "Cristal",
  gem: "Gemme",
  "pressed-glass": "Verre pressé",
  bronze: "Ornement bronze",
  none: "Sans ornement",
});

const ALIASES = Object.freeze({
  "aurore boreale": ["aurore_boreale"],
  "smoked topaze": ["smoked_topaz", "smoked_topaze"],
  "black diamond shimmer": ["black_diamond_shimmer"],
  "cristal shine": ["crystal_shimmer", "cristal_shine"],
  fuschia: ["fuschia", "fuchsia"],
  "blue agata": ["blue_agata", "agate_bleue"],
  "red agata": ["red_agata", "agate_rouge"],
  "green agate": ["green_agate", "agate_verte"],
  "tiger eye": ["tiger_eye", "oeil_de_tigre"],
  "jet cabochon": ["jet"],
  "purple cabochon": ["purple"],
  "aquamarine cabochon": ["aquamarine"],
});

export function normalizeCatalogText(value) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/gi, " ")
    .trim()
    .toLowerCase();
}

export function getFamilyDisplayLabel(family) {
  return family === "Classique" ? "Originale" : (family || "Originale");
}

export function buildViewerProductSummary(configuration = {}) {
  const family = getFamilyDisplayLabel(configuration.modelFamily);
  const plug = configuration.plugSizeLabel || String(configuration.plugSize || "").split("-")[0] || "Plug";
  const metal = METAL_LABELS[configuration.metalFamily] || configuration.metalFamily || "Métal";
  const finish = configuration.ornamentFinish || ORNAMENT_LABELS[configuration.ornament] || "Sans ornement";
  return [family, plug, metal, finish].filter(Boolean).join(" - ");
}

export function buildCustomRequestMessage(configuration = {}) {
  const plugDiameter = configuration.plugDiameterMm || String(configuration.plugSize || "").match(/(\d+(?:[.,]\d+)?)/)?.[1] || "Non précisé";
  const plugLabel = configuration.plugSizeLabel || String(configuration.plugSize || "").split("-")[0] || "Non précisé";
  const lines = [
    "Demande de produit sur mesure issue du configurateur Rosebuds",
    "",
    `Gamme : ${getFamilyDisplayLabel(configuration.modelFamily)}`,
    `Modèle 3D : ${configuration.modelLabel || configuration.catalogModel || "Non précisé"}`,
    `Taille du plug : ${plugLabel} (diamètre ${plugDiameter} mm)`,
    `Taille du cristal : ${configuration.crystalSize || "Sans cristal / non précisée"}`,
    `Métal : ${METAL_LABELS[configuration.metalFamily] || configuration.metalFamily || "Non précisé"}`,
    `Finition du métal : ${METAL_FINISH_LABELS[configuration.metalFinish] || configuration.metalFinish || "Non précisée"}`,
    `Ornement : ${ORNAMENT_LABELS[configuration.ornament] || configuration.ornament || "Non précisé"}`,
    `Finition de l’ornement : ${configuration.ornamentFinish || "Non précisée"}`,
    "",
    "Merci de m’indiquer la faisabilité, le délai et le prix de cette configuration.",
  ];
  return lines.join("\n");
}

export function buildCustomContactUrl(configuration = {}) {
  const url = new URL(CONTACT_URL);
  url.searchParams.set("id_contact", "6");
  url.searchParams.set("message", buildCustomRequestMessage(configuration));
  return url.toString();
}

export function resolveRosebudsProductLink(configuration = {}, productUrls = []) {
  const customByGeometry = configuration.classicHead === "sans-tete"
    || Number(configuration.plugDiameterMm || String(configuration.plugSize || "").match(/\d+/)?.[0] || 0) > 50;
  if (customByGeometry) return customResult(configuration, "Configuration sur mesure");

  let best = null;
  for (const url of productUrls) {
    const score = scoreProductUrl(url, configuration);
    if (!best || score > best.score) best = { url, score };
  }
  if (best && best.score >= 18) {
    return { url: best.url, custom: false, label: "Voir le produit Rosebuds", score: best.score };
  }

  if (configuration.modelFamily === "Classique" && configuration.metalFamily) {
    return {
      url: configuration.metalFamily === "alu" ? ALU_CATEGORY_URL : INOX_CATEGORY_URL,
      custom: false,
      label: "Voir la gamme Rosebuds",
      score: best?.score || 0,
    };
  }
  return customResult(configuration, "Demander ce modèle sur mesure");
}

function customResult(configuration, label) {
  return { url: buildCustomContactUrl(configuration), custom: true, label, score: 0 };
}

function scoreProductUrl(url, configuration) {
  const source = normalizeCatalogText(decodeURIComponent(url));
  let score = 0;
  const family = configuration.modelFamily;
  if (family === "NEW SMALL") score += source.includes("new small") ? 14 : -18;
  else if (family === "NEW MEDIUM") score += source.includes("new medium") ? 14 : -18;
  else if (source.includes("new small") || source.includes("new medium")) score -= 16;
  else score += 5;

  if (configuration.metalFamily === "alu") score += source.includes("originale alu") ? 10 : -12;
  if (configuration.metalFamily === "inox") score += source.includes("originale inox") ? 10 : -12;

  const plugLabel = normalizeCatalogText(configuration.plugSizeLabel || String(configuration.plugSize || "").split("-")[0]);
  const plugDiameter = String(configuration.plugDiameterMm || String(configuration.plugSize || "").match(/\d+/)?.[0] || "");
  if (plugLabel && source.includes(plugLabel)) score += 7;
  if (plugDiameter && source.includes(`${plugDiameter} mm`)) score += 5;

  const ornamentTokens = {
    crystal: ["cristal"],
    gem: ["gemme"],
    "pressed-glass": ["verre"],
    bronze: ["bronze"],
  }[configuration.ornament] || [];
  if (ornamentTokens.some((token) => source.includes(token))) score += 9;
  else if (ornamentTokens.length) score -= 10;

  const crystalSize = String(configuration.crystalSize || "").match(/\d+/)?.[0];
  if (crystalSize && source.includes(`${crystalSize}mm`)) score += 3;

  const metalFinish = normalizeCatalogText(configuration.metalFinish);
  for (const token of metalFinish.split(" ").filter((part) => part.length > 2 && !["aluminum", "stainless", "micron"].includes(part))) {
    if (source.includes(token)) score += 2;
  }

  const ornamentFinish = normalizeCatalogText(configuration.ornamentFinish);
  const finishAliases = ALIASES[ornamentFinish] || [ornamentFinish.replace(/\s+/g, "_")];
  if (ornamentFinish && finishAliases.some((alias) => source.includes(normalizeCatalogText(alias)))) score += 9;
  return score;
}

export const ROSEBUDS_LINKS = Object.freeze({
  contact: CONTACT_URL,
  inox: INOX_CATEGORY_URL,
  alu: ALU_CATEGORY_URL,
});
