import {configurationRows} from "./contact-model.js?v=20261023-emailjs";
import {buildPublicViewerUrl} from "./contact-formsubmit.js?v=20261023-emailjs";

export const EMAILJS_ENDPOINT = "https://api.emailjs.com/api/v1.0/email/send";
const failure = "Votre demande n’a pas pu être transmise. Veuillez réessayer ou utiliser une autre méthode de contact. Vos informations sont conservées.";

export function validateEmailJsConfig(config) {
  if (!config || !['serviceId','templateId','publicKey'].every(key => typeof config[key] === 'string' && /^[A-Za-z0-9_-]{3,100}$/.test(config[key]))) {
    throw new Error("Le service EmailJS n’est pas encore configuré. Vous pouvez conserver ou copier votre demande.");
  }
  return {serviceId:config.serviceId,templateId:config.templateId,publicKey:config.publicKey};
}

export function buildEmailJsParams(quote) {
  const email = String(quote.email || '').trim();
  const name = String(quote.name || '').trim();
  if (!/^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/.test(email) || /[\r\n]/.test(email) || email.length > 254 || name.length < 2 || name.length > 120) throw new Error("Vérifiez votre nom et votre adresse e-mail.");
  if (typeof quote.message !== 'string' || quote.message.trim().length < 10 || quote.message.length > 10000) throw new Error("Le message doit contenir entre 10 et 10 000 caractères.");
  const rows = new Map(configurationRows(quote.configuration));
  const value = key => String(rows.get(key) || 'Non précisé');
  const reference = String(quote.reference || '').replace(/[\r\n]/g, ' ').slice(0,100);
  if (!reference) throw new Error("La référence de configuration est manquante.");
  const date = new Date(quote.startedAt || Date.now());
  const notes = ['Longueur','Type de bronze'].filter(key => rows.has(key)).map(key => `${key} : ${rows.get(key)}`);
  if (quote.subject) notes.push(`Sujet : ${String(quote.subject).slice(0,160)}`);
  if (quote.configuration?.mixedMaterials) notes.push("Matériaux multiples : le lien reproduit la finition principale, pas les affectations par pièce. Se référer au descriptif pour le devis.");
  return {
    name, email, reference,
    date: date.toLocaleString('fr-FR',{timeZone:'Europe/Paris',dateStyle:'long',timeStyle:'short'}),
    reply_url: `mailto:${encodeURIComponent(email)}?subject=${encodeURIComponent(`Re: Demande de devis Rosebuds - ${reference}`)}`,
    family:value('Gamme'),model:value('Modèle'),model_id:value('Référence du modèle'),size:value('Taille'),
    diameter:value('Diamètre'),crystal_size:value('Taille de la pierre'),metal:value('Métal'),
    metal_finish:value('Finition du métal'),ornament:value('Ornement'),ornament_finish:value('Finition / couleur de l’ornement'),
    mixed_note:notes.join('\n'),viewer_url:buildPublicViewerUrl(quote.configuration),message:quote.message,
  };
}

export async function sendEmailJsQuote(quote, config, fetcher = fetch) {
  const {serviceId,templateId,publicKey} = validateEmailJsConfig(config);
  const params = buildEmailJsParams(quote);
  if (quote.website) throw new Error("Veuillez vérifier les informations de votre demande.");
  if (new TextEncoder().encode(JSON.stringify(params)).length > 50000) throw new Error("Votre demande est trop volumineuse. Raccourcissez le message puis réessayez.");
  let response;
  try {
    response = await fetcher(EMAILJS_ENDPOINT, {
      method:'POST',headers:{'Content-Type':'application/json'},credentials:'omit',signal:AbortSignal.timeout(45000),
      body:JSON.stringify({service_id:serviceId,template_id:templateId,user_id:publicKey,template_params:params}),
    });
  } catch {
    throw new Error("Le résultat de l’envoi n’a pas pu être confirmé. Vos informations sont conservées. Vérifiez auprès de Rosebuds avant de réessayer pour éviter un doublon.");
  }
  const result = await response.text();
  if (response.status !== 200 || result.trim() !== 'OK') {
    if (response.status === 429) throw new Error("Le service d’envoi est temporairement limité. Patientez avant de réessayer. Vos informations sont conservées.");
    throw new Error(failure);
  }
  return {status:'accepted',reference:params.reference};
}
