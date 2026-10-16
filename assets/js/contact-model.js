export const QUOTE_RECIPIENT = "info@rosebuds.net";
export const QUOTE_SUBJECT = "Demande de devis — Produit Rosebuds personnalisé";
export function configurationRows(c = {}) {
  const metal = c.metalDisplay || ({alu:"Aluminium",inox:"Stainless steel"})[c.metalFamily] || c.metalFamily;
  const finishes = {"stainless-mirror-silver":"Poli miroir","stainless-flash-gold-1-micron":"Flash or 1 micron",
    "aluminum-black":"Black","aluminum-red":"Red","aluminum-pink":"Pink","aluminum-violet":"Violet",
    "aluminum-green":"Green","aluminum-blue":"Blue","aluminum-gold":"Gold","aluminum-orange":"Orange","aluminum-gray":"Grey"};
  return [
    ["Gamme",c.modelFamily === "Classique" ? "Originale" : c.modelFamily],
    ["Modèle",c.modelLabel], ["Référence du modèle",c.catalogModel],
    ["Taille",c.plugSizeLabel || c.plugSize],
    ["Diamètre",c.plugDiameterMm ? `${c.plugDiameterMm} mm` : ""],
    ["Longueur",c.lengthMm ? `${c.lengthMm} mm` : ""],
    ["Taille de la pierre",c.crystalSize], ["Métal",metal],
    ["Finition du métal",c.metalFinishLabel || finishes[c.metalFinish] || c.metalFinish],
    ["Ornement",({crystal:"Cristal",gem:"Gemme",bronze:"Bronze","pressed-glass":"Verre pressé",none:"Sans ornement"})[c.ornament] || c.ornament],
    ["Type de bronze",c.bronzeType], ["Finition / couleur de l’ornement",c.ornamentFinish],
  ].filter(([,value])=>value !== undefined && value !== null && String(value).trim() !== "");
}
export function buildQuoteMessage(configuration, reference) {
  return `Bonjour,\n\nJe souhaiterais obtenir un devis pour un produit personnalisé réalisé avec le configurateur Rosebuds.\n\nRéférence de configuration : ${reference}\n${configurationRows(configuration).map(([key,value])=>`${key} : ${value}`).join("\n")}\n\nPourriez-vous m’indiquer la faisabilité technique, le prix TTC, le délai de fabrication, les possibilités de livraison et les éventuelles adaptations nécessaires ?\n\nVous trouverez en pièce jointe un aperçu de la configuration 3D.\n\nJe vous remercie par avance pour votre réponse.\n\nCordialement,`;
}
