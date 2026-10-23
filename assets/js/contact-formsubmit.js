import {configurationRows} from "./contact-model.js?v=20261023-emailjs";

export const FORMSUBMIT_ENDPOINT = "https://formsubmit.co/ajax/info@rosebuds.net";
export function buildPublicViewerUrl(configuration = {}) {
  const url = new URL("https://rsbds-3d.github.io/configurateur/configurateur.html");
  url.searchParams.set("viewer", "1");
  for (const key of ["catalogModel", "modelFamily", "classicHead", "bronzeType", "plugSize", "crystalSize", "metalFamily", "metalFinish", "ornament", "ornamentFinish"]) {
    if (configuration[key] != null && String(configuration[key]).trim()) url.searchParams.set(key, String(configuration[key]));
  }
  return url.href;
}
export function buildFormSubmitPayload(quote) {
  const viewerUrl = buildPublicViewerUrl(quote.configuration);
  return {
    name: quote.name.trim(), email: quote.email.trim(), _replyto: quote.email.trim(),
    _subject: `Demande de devis Rosebuds — ${quote.reference}`,
    _template: "table", _captcha: "false", _honey: quote.website || "",
    reference: quote.reference, date: new Date().toISOString(), sujet: quote.subject,
    message: quote.message,
    caracteristiques: configurationRows(quote.configuration).map(([key,value]) => `${key} : ${value}`).join("\n"),
    viewer_3D: viewerUrl,
    apercu_et_fiche: "Ouvrir le viewer ci-dessus, puis utiliser Télécharger PNG ou Télécharger la fiche (PDF). Identification du configurateur éventuellement requise.",
    ...(quote.configuration.mixedMaterials ? {limite_apercu:"Matériaux multiples : le lien reproduit la finition principale, pas les affectations par pièce. Se référer au descriptif pour le devis."} : {}),
  };
}
export async function sendFormSubmitQuote(quote, fetcher = fetch) {
  const response = await fetcher(FORMSUBMIT_ENDPOINT, {
    method: "POST", headers: {"Content-Type":"application/json", Accept:"application/json"},
    credentials: "omit", signal: AbortSignal.timeout(45000),
    body: JSON.stringify(buildFormSubmitPayload(quote)),
  });
  const result = await response.json().catch(() => ({}));
  if (!response.ok || (result.success !== true && result.success !== "true")) {
    throw new Error("Votre demande n’a pas pu être transmise. Vérifiez votre connexion et réessayez. Vos informations sont conservées.");
  }
  return result;
}
