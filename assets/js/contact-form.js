import {configurationRows,buildQuoteMessage,QUOTE_SUBJECT} from "./contact-model.js?v=20261023-emailjs";
import {buildPublicViewerUrl,sendFormSubmitQuote} from "./contact-formsubmit.js?v=20261023-emailjs";
import {sendEmailJsQuote,validateEmailJsConfig} from "./contact-emailjs.js?v=20261023-emailjs";

let dialog, state, captureUrl, extraUrl, widgetId, apiBase, publicConfig, provider, busy = false;
const $ = selector => dialog.querySelector(selector);
const readData = blob => new Promise((resolve,reject)=>{const r=new FileReader();r.onload=()=>resolve(String(r.result).split(",")[1]);r.onerror=reject;r.readAsDataURL(blob);});
async function screenshotAttachment(blob) {
  const bitmap = await createImageBitmap(blob);
  try {
    const scale = Math.min(1,1400 / Math.max(bitmap.width,bitmap.height));
    const canvas = document.createElement("canvas"); canvas.width=Math.round(bitmap.width*scale);canvas.height=Math.round(bitmap.height*scale);
    canvas.getContext("2d").drawImage(bitmap,0,0,canvas.width,canvas.height);
    const png=await new Promise(resolve=>canvas.toBlob(resolve,"image/png"));
    if(!png || png.size>4*1024*1024) throw new Error("L’aperçu dépasse 4 Mo. Réduisez la fenêtre puis réessayez.");
    return {name:"configuration-rosebuds.png",type:"image/png",content:await readData(png)};
  } finally { bitmap.close(); }
}
function status(message,error=false) { $("[data-status]").textContent=message;$("[data-status]").classList.toggle("is-error",error); }
function createDialog() {
  dialog=document.createElement("dialog");dialog.className="quote-dialog";dialog.setAttribute("aria-labelledby","quote-title");
  dialog.innerHTML=`<header class="quote-header"><div><img class="quote-logo" src="./assets/brand/rosebuds-logo-2017-email.png" alt="Rosebuds"><h2 id="quote-title">Contactez-nous</h2></div><div><small data-version></small><button type="button" data-close aria-label="Fermer">×</button></div></header>
    <div class="quote-columns"><section class="quote-preview"><img data-capture alt="Aperçu de votre configuration 3D"><p data-reference></p><p><a data-viewer-link target="_blank" rel="noopener">Ouvrir cette configuration 3D</a></p><dl data-details></dl></section>
    <form class="quote-form"><label>Nom et prénom<input name="name" autocomplete="name" required minlength="2" maxlength="120"></label>
    <label>Adresse e-mail<input name="email" type="email" autocomplete="email" required maxlength="254"></label>
    <label>Sujet<input name="subject" required maxlength="160"></label>
    <label>Message<textarea name="message" required minlength="10" maxlength="10000" rows="10"></textarea></label>
    <label data-attachment-field>Document joint <span>(facultatif, PNG, JPEG ou PDF, 2 Mo maximum)</span><input name="attachment" type="file" accept="image/png,image/jpeg,application/pdf"></label>
    <p data-file-name></p><img data-extra-preview hidden alt="Document image joint"><button type="button" data-remove-file hidden>Retirer le document</button>
    <label class="quote-trap" aria-hidden="true">Site web<input name="website" tabindex="-1" autocomplete="off"></label>
    <p class="quote-privacy">Vos coordonnées et votre configuration seront utilisées par Rosebuds pour traiter cette demande, sans inscription à une newsletter. <a data-privacy target="_blank" rel="noopener">Confidentialité</a></p>
    <div data-captcha></div><p data-status role="status" aria-live="polite"></p>
    <button class="quote-submit" type="submit">Envoyer ma demande</button>
    <div class="quote-fallback" hidden><button type="button" data-copy>Copier le message</button><a href="https://rosebuds.net/fr/nous-contacter" target="_blank" rel="noopener">Formulaire officiel Rosebuds</a><a data-mail>Ouvrir ma messagerie (dernier recours)</a></div></form></div>`;
  document.body.append(dialog);
  $("[data-version]").textContent=document.querySelector('.viewer-visible-version')?.textContent || '';
  $("[data-close]").onclick=()=>dialog.close();
  dialog.addEventListener("close",()=>{if(widgetId!==undefined)window.turnstile?.reset(widgetId);});
  $("[data-copy]").onclick=async()=>{try{await navigator.clipboard.writeText($("[name=message]").value);status("Message copié.");}catch{status("Copie indisponible : sélectionnez le texte du message.",true);}};
  $("[data-mail]").onclick=()=>{$("[data-mail]").href=`mailto:info@rosebuds.net?subject=${encodeURIComponent($("[name=subject]").value)}&body=${encodeURIComponent($("[name=message]").value)}`;};
  $("[data-remove-file]").onclick=()=>{$("[name=attachment]").value="";updateExtra();};
  $("[name=attachment]").onchange=updateExtra;
  $("form").onsubmit=submit;
}
function updateExtra() {
  if(extraUrl)URL.revokeObjectURL(extraUrl);extraUrl=null;
  const file=$("[name=attachment]").files[0],preview=$("[data-extra-preview]");
  preview.hidden=true;preview.removeAttribute("src");$("[data-remove-file]").hidden=!file;
  $("[data-file-name]").textContent=file?`${file.name} — ${Math.ceil(file.size/1024)} Ko`:"";
  if(file && (!['image/png','image/jpeg','application/pdf'].includes(file.type)||file.size>2*1024*1024)) {
    $("[name=attachment]").setCustomValidity("Choisissez un PNG, JPEG ou PDF de 2 Mo maximum.");return;
  }
  $("[name=attachment]").setCustomValidity("");
  if(file?.type.startsWith("image/")){extraUrl=URL.createObjectURL(file);preview.src=extraUrl;preview.hidden=false;}
}
async function setupService() {
  const settings=await fetch("./assets/data/contact-config.json",{cache:"no-store"}).then(r=>{if(!r.ok)throw Error();return r.json();});
  provider=['formsubmit','emailjs'].includes(settings.provider) ? settings.provider : 'backend';
  const hosted=provider !== "backend";
  $("[data-attachment-field]").hidden=hosted;
  $("[name=attachment]").disabled=hosted;
  if(hosted){$("[name=attachment]").value="";updateExtra();}
  if(provider === 'emailjs') {
    publicConfig=validateEmailJsConfig(settings.emailjs);
  }
  $("[data-captcha]").hidden=hosted;
  $("[data-privacy]").href=settings.privacyUrl;
  if(hosted)return;
  apiBase=String(settings.apiBase||"").replace(/\/$/,"");
  if(!apiBase)throw new Error("Le service d’envoi sécurisé n’est pas encore configuré. Vous pouvez conserver ou copier votre demande.");
  const url=new URL(apiBase,location.href);
  if(url.protocol!=="https:" && !['localhost','127.0.0.1'].includes(url.hostname))throw new Error("Le service de contact doit utiliser HTTPS.");
  publicConfig=await fetch(`${apiBase}/config`,{cache:"no-store"}).then(r=>{if(!r.ok)throw Error();return r.json();});
  if(!publicConfig.ready)throw new Error("Le service d’envoi sécurisé n’est pas encore disponible.");
  if(!window.turnstile)await new Promise((resolve,reject)=>{const s=document.createElement("script");s.src="https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit";s.onload=resolve;s.onerror=reject;document.head.append(s);});
  if(widgetId===undefined)widgetId=window.turnstile.render($("[data-captcha]"),{sitekey:publicConfig.siteKey,action:"rosebuds_quote"});
  else window.turnstile.reset(widgetId);
}
export async function openQuoteForm({configuration,capture}) {
  if(busy){if(!dialog.open)dialog.showModal();return;}
  if(!dialog)createDialog();
  const signature=JSON.stringify(configuration);
  if(state?.signature!==signature){
    $("[data-capture]").removeAttribute("src");
    state={signature,configuration:structuredClone(configuration),reference:`RB-${crypto.randomUUID()}`,requestId:crypto.randomUUID(),startedAt:Date.now()};
    $("[name=subject]").value=QUOTE_SUBJECT;$("[name=message]").value=buildQuoteMessage(configuration,state.reference,buildPublicViewerUrl(configuration));
    $("[data-viewer-link]").href=buildPublicViewerUrl(configuration);
    $("[data-reference]").textContent=state.reference;
    $("[data-details]").replaceChildren();
    for(const [key,value] of configurationRows(configuration)){const dt=document.createElement("dt"),dd=document.createElement("dd");dt.textContent=key;dd.textContent=value;$("[data-details]").append(dt,dd);}
  }
  $(".quote-submit").disabled=true;$(".quote-fallback").hidden=true;
  if(!dialog.open)dialog.showModal();status("Préparation de l’aperçu 3D…");
  try{
    const blob=await capture();state.screenshot=await screenshotAttachment(blob);
    if(captureUrl)URL.revokeObjectURL(captureUrl);captureUrl=URL.createObjectURL(blob);$("[data-capture]").src=captureUrl;
    await setupService();status(state.sent?"Cette demande a déjà été prise en charge par le service d’envoi.":provider === "formsubmit"?"Au premier envoi, Rosebuds doit valider l’e-mail d’activation FormSubmit. La réception finale reste à confirmer.":"");$(".quote-submit").disabled=Boolean(state.sent);
  }catch(error){status(error.message||"Le service de contact est indisponible.",true);$(".quote-fallback").hidden=false;}
  $("[data-mail]").href=`mailto:info@rosebuds.net?subject=${encodeURIComponent($("[name=subject]").value)}&body=${encodeURIComponent($("[name=message]").value)}`;
}
async function submit(event) {
  event.preventDefault();const form=$("form"),button=$(".quote-submit");if(busy||state.sent||button.disabled||!form.reportValidity())return;
  if(form.elements.website.value || Date.now()-state.startedAt<2000){status("Veuillez patienter quelques instants puis réessayer.",true);return;}
  const token=provider !== "backend" ? "" : window.turnstile?.getResponse(widgetId);if(provider === "backend" && !token){status("Veuillez terminer la vérification anti-spam.",true);return;}
  busy=true;
  button.disabled=true;status("Envoi de votre demande à Rosebuds en cours…");
  try{
    if(provider === "emailjs"){
      await sendEmailJsQuote({reference:state.reference,startedAt:state.startedAt,configuration:state.configuration,name:form.elements.name.value,email:form.elements.email.value,subject:form.elements.subject.value,message:form.elements.message.value,website:form.elements.website.value},publicConfig);
      state.sent=true;
      status("Votre demande de devis a été envoyée à info@rosebuds.net. Merci pour votre intérêt. L’équipe Rosebuds pourra vous répondre à l’adresse e-mail indiquée. Prise en charge confirmée par EmailJS ; réception finale de cette demande non confirmée. Référence : "+state.reference);
      return;
    }
    if(provider === "formsubmit"){
      await sendFormSubmitQuote({reference:state.reference,configuration:state.configuration,name:form.elements.name.value,email:form.elements.email.value,subject:form.elements.subject.value,message:form.elements.message.value,website:form.elements.website.value});
      state.sent=true;
      status("FormSubmit a pris en charge votre demande destinée à info@rosebuds.net. Au premier envoi, Rosebuds doit cliquer sur le lien d’activation reçu par e-mail. La réception finale n’est pas confirmée. Référence : "+state.reference);
      return;
    }
    const file=$("[name=attachment]").files[0];
    const attachments=[state.screenshot];if(file)attachments.push({name:file.name,type:file.type,content:await readData(file)});
    const payload={reference:state.reference,configuration:state.configuration,name:form.elements.name.value,email:form.elements.email.value,subject:form.elements.subject.value,message:form.elements.message.value,attachments};
    const fingerprint=JSON.stringify(payload);
    if(state.submissionFingerprint&&state.submissionFingerprint!==fingerprint)state.requestId=crypto.randomUUID();
    state.submissionFingerprint=fingerprint;
    const response=await fetch(`${apiBase}/contact`,{method:"POST",headers:{"Content-Type":"application/json"},signal:AbortSignal.timeout(60000),body:JSON.stringify({...payload,requestId:state.requestId,website:form.elements.website.value,startedAt:state.startedAt,captchaToken:token})});
    const result=await response.json().catch(()=>({}));if(!response.ok||result.status!=="accepted")throw Error(result.error||"Votre demande n’a pas pu être transmise. Veuillez réessayer ou utiliser une autre méthode de contact.");
    state.sent=true;status("Votre demande de devis a été envoyée à info@rosebuds.net. Merci pour votre intérêt. L’équipe Rosebuds pourra vous répondre à l’adresse e-mail indiquée. Prise en charge confirmée ; réception finale non confirmée.");
  }catch(error){status(error.message||"Votre demande n’a pas pu être transmise. Veuillez réessayer ou utiliser une autre méthode de contact.",true);$(".quote-fallback").hidden=false;button.disabled=false;window.turnstile?.reset(widgetId);}
  finally{busy=false;}
}
