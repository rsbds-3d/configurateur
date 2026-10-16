import {createHash,createHmac,timingSafeEqual} from "node:crypto";
import {DatabaseSync} from "node:sqlite";
import {configurationRows} from "../assets/js/contact-model.js";

const QUOTE_RECIPIENT = "info@rosebuds.net";

const escape = value => String(value).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'})[c]);
const fail = (message,status=400) => Object.assign(new Error(message),{status});
const text = (value,max,min=0) => {if(typeof value!=="string"||value.trim().length<min||value.length>max||/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/.test(value))throw fail("Champ invalide.");return value.trim();};
const singleLine = (value,max,min=0) => {const result=text(value,max,min);if(/[\r\n]/.test(result))throw fail("Champ invalide.");return result;};
export function validateQuote(body) {
  const name=singleLine(body.name,120,2),email=singleLine(body.email,254,3);
  if(!/^[a-z0-9.!#$%&'*+\/=?^_`{|}~-]+@[a-z0-9](?:[a-z0-9.-]*[a-z0-9])?\.[a-z]{2,}$/i.test(email))throw fail("Adresse e-mail invalide.");
  if(!/^[a-f0-9-]{36}$/i.test(body.requestId||"")||!/^RB-[a-f0-9-]{36}$/i.test(body.reference||""))throw fail("Référence invalide.");
  const configuration={};
  for(const key of ['modelFamily','modelLabel','catalogModel','plugSize','plugSizeLabel','crystalSize','metalFamily','metalFinish','metalDisplay','metalFinishLabel','ornament','ornamentFinish','bronzeType']) {
    if(body.configuration?.[key]!==undefined)configuration[key]=singleLine(body.configuration[key],300);
  }
  for(const key of ['plugDiameterMm','lengthMm'])if(body.configuration?.[key]!=null){const value=body.configuration[key];if(typeof value!=="number"||!Number.isFinite(value)||value<=0||value>2000)throw fail("Dimension invalide.");configuration[key]=value;}
  if(!configuration.catalogModel)throw fail("Configuration manquante.");
  if(!Array.isArray(body.attachments)||body.attachments.length<1||body.attachments.length>2)throw fail("Aperçu PNG obligatoire, plus un document facultatif.");
  const attachments=body.attachments.map((a,i)=>validateAttachment(a,i));
  return {requestId:body.requestId,reference:body.reference,name,email,subject:singleLine(body.subject,160,3),message:text(body.message,10000,10),configuration,attachments};
}
export function validateAttachment(a,index) {
  const name=singleLine(a?.name,120,1).replace(/[^a-zA-Z0-9._ -]/g,"_");
  if(typeof a.content!=="string"||a.content.length>6*1024*1024||a.content.length%4!==0||!/^[A-Za-z0-9+/]*={0,2}$/.test(a.content))throw fail("Pièce jointe invalide.");
  const bytes=Buffer.from(a.content,"base64");if(bytes.toString('base64')!==a.content)throw fail("Encodage de pièce jointe invalide.");if(!bytes.length||bytes.length>(index===0?4:2)*1024*1024)throw fail("Pièce jointe trop volumineuse.");
  const png=bytes.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10]));
  const jpeg=bytes[0]===255&&bytes[1]===216&&bytes[2]===255;
  const pdf=bytes.subarray(0,5).toString()==="%PDF-";
  const type=png?"image/png":jpeg?"image/jpeg":pdf?"application/pdf":"";
  if(!type||type!==a.type||!(png?/\.png$/i:jpeg?/\.jpe?g$/i:/\.pdf$/i).test(name)||index===0&&!png)throw fail("Type de pièce jointe refusé.");
  if(png&&(bytes.length<24||bytes.readUInt32BE(16)*bytes.readUInt32BE(20)>16000000))throw fail("Dimensions PNG excessives.");
  if(pdf&&/\/(JavaScript|JS\b|OpenAction|AA\b|Launch|EmbeddedFile)/.test(bytes.toString("latin1")))throw fail("PDF actif refusé : joignez un PDF sans script ni fichier intégré.");
  return {filename:index===0?'configuration-rosebuds.png':name,content:a.content,content_type:type};
}
export function buildQuoteEmail(quote,from,date=new Date()) {
  const rows=configurationRows(quote.configuration);
  const plain=`Demande de fabrication sur mesure — Configurateur Rosebuds\n\nRéférence : ${quote.reference}\nNom : ${quote.name}\nE-mail : ${quote.email}\nDate : ${date.toISOString()}\nSujet client : ${quote.subject}\n\n${rows.map(([k,v])=>`${k} : ${v}`).join("\n")}\n\nMessage du client\n${quote.message}\n\nPièces jointes : ${quote.attachments.map(a=>a.filename).join(", ")}`;
  const table=rows.map(([k,v])=>`<tr><th style="text-align:left;padding:8px;border-bottom:1px solid #ddd">${escape(k)}</th><td style="padding:8px;border-bottom:1px solid #ddd">${escape(v)}</td></tr>`).join("");
  return {from,to:[QUOTE_RECIPIENT],reply_to:quote.email,subject:`Demande de devis Rosebuds — ${quote.reference}`,text:plain,
    html:`<!doctype html><html lang="fr"><head><meta charset="utf-8"></head><body style="font-family:Arial,sans-serif;color:#38383b;background:#fff"><main style="max-width:720px;margin:auto;padding:24px;border-top:4px solid #fe3a9e"><h1 style="font-size:24px">Demande de fabrication sur mesure — Configurateur Rosebuds</h1><p><strong>${escape(quote.reference)}</strong></p><h2>Informations client</h2><p>${escape(quote.name)}<br>${escape(quote.email)}<br>${escape(date.toISOString())}</p><h2>Produit configuré</h2><img src="cid:rosebuds-configuration" alt="Configuration 3D du produit" style="width:100%;max-width:640px;height:auto"><table style="border-collapse:collapse;width:100%">${table}</table><h2>Message du client</h2><p style="white-space:pre-wrap">${escape(quote.message)}</p><h2>Pièces jointes</h2><ul>${quote.attachments.map(a=>`<li>${escape(a.filename)}</li>`).join("")}</ul></main></body></html>`,attachments:quote.attachments.map((a,i)=>i===0?{...a,content_id:'rosebuds-configuration'}:a)};
}
export function verifyWebhook(raw,headers,secret,now=Date.now()) {
  const id=headers['svix-id'],timestamp=headers['svix-timestamp'],signature=headers['svix-signature'];
  if(!id||!timestamp||!signature||Math.abs(now/1000-Number(timestamp))>300)throw fail("Signature invalide.",401);
  const key=Buffer.from(String(secret).replace(/^whsec_/,""),"base64");
  const expected=createHmac('sha256',key).update(`${id}.${timestamp}.${raw}`).digest();
  const valid=signature.split(' ').some(item=>{const [version,value]=item.split(',');if(version!=='v1'||!value)return false;const bytes=Buffer.from(value,'base64');return bytes.length===expected.length&&timingSafeEqual(bytes,expected);});
  if(!valid)throw fail("Signature invalide.",401);return JSON.parse(raw);
}

export function createContactService({env=process.env,fetchImpl=fetch,databasePath=env.CONTACT_DATABASE||"contact.sqlite"}={}) {
  const db=new DatabaseSync(databasePath);
  db.exec('PRAGMA journal_mode=WAL; PRAGMA busy_timeout=5000;');
  db.exec(`CREATE TABLE IF NOT EXISTS requests(id TEXT PRIMARY KEY, fingerprint TEXT NOT NULL, reference TEXT, provider_id TEXT, status TEXT, created INTEGER, updated INTEGER); CREATE TABLE IF NOT EXISTS limits(key TEXT PRIMARY KEY,count INTEGER,expires INTEGER); CREATE TABLE IF NOT EXISTS events(id TEXT PRIMARY KEY,provider_id TEXT,type TEXT,created INTEGER);`);
  const origins=String(env.CONTACT_ALLOWED_ORIGINS||"").split(',').map(x=>x.trim()).filter(Boolean);
  const ready=Boolean(env.RESEND_API_KEY&&env.CONTACT_FROM&&env.CONTACT_RATE_SECRET?.length>=32&&env.TURNSTILE_SECRET_KEY&&env.TURNSTILE_SITE_KEY&&env.RESEND_WEBHOOK_SECRET&&env.AV_SCAN_URL&&origins.length);
  const log=data=>console.log(JSON.stringify(data));
  async function handler(req,res) {
    res.setHeader('Cache-Control','no-store');res.setHeader('X-Content-Type-Options','nosniff');
    const respond=(status,body)=>{res.writeHead(status,{'Content-Type':'application/json; charset=utf-8'});res.end(JSON.stringify(body));};
    const route=new URL(req.url,'http://localhost').pathname;
    try {
      const webhook=route==='/api/webhooks/resend';
      if(!webhook){const origin=req.headers.origin || (req.method==='GET'&&route==='/api/config'?origins.find(o=>new URL(o).host===req.headers.host):null);if(!origin||!origins.includes(origin))throw fail("Origine non autorisée.",403);res.setHeader('Access-Control-Allow-Origin',origin);res.setHeader('Vary','Origin');}
      if(req.method==='OPTIONS'){res.setHeader('Access-Control-Allow-Methods','GET,POST,OPTIONS');res.setHeader('Access-Control-Allow-Headers','Content-Type');respond(204,{});return;}
      if(route==='/api/config'&&req.method==='GET'){respond(200,{ready,siteKey:ready?env.TURNSTILE_SITE_KEY:"",recipient:QUOTE_RECIPIENT});return;}
      if(!['/api/contact','/api/webhooks/resend'].includes(route)||req.method!=='POST')throw fail("Route inconnue.",404);
      if(!webhook){
        if(!ready)throw fail("Service d’envoi non configuré.",503);
        const source=env.CONTACT_TRUST_PROXY==='1'?String(req.headers['x-forwarded-for']||req.socket.remoteAddress).split(',')[0].trim():req.socket.remoteAddress;
        const key=createHmac('sha256',env.CONTACT_RATE_SECRET).update(`ingress:${source}:${Math.floor(Date.now()/60000)}`).digest('hex');
        const attempts=db.prepare('INSERT INTO limits VALUES(?,1,?) ON CONFLICT(key) DO UPDATE SET count=count+1 RETURNING count').get(key,Date.now()+60000);
        if(attempts.count>30)throw fail("Trop de tentatives. Veuillez réessayer plus tard.",429);
      }
      if(!String(req.headers['content-type']||'').startsWith('application/json'))throw fail("JSON requis.",415);
      const limit=webhook?128*1024:9*1024*1024;
      if(Number(req.headers['content-length']||0)>limit)throw fail("Requête trop volumineuse.",413);
      const chunks=[];let size=0;for await(const chunk of req){size+=chunk.length;if(size>limit)throw fail("Requête trop volumineuse.",413);chunks.push(chunk);}const raw=Buffer.concat(chunks).toString('utf8');
      if(webhook){
        if(!env.RESEND_WEBHOOK_SECRET)throw fail("Webhook non configuré.",503);
        const event=verifyWebhook(raw,req.headers,env.RESEND_WEBHOOK_SECRET);
        const allowed=['email.sent','email.delivered','email.delivery_delayed','email.bounced','email.complained','email.failed'];
        if(allowed.includes(event.type)&&typeof event.data?.email_id==='string'){
          const result=db.prepare('INSERT OR IGNORE INTO events VALUES(?,?,?,?)').run(req.headers['svix-id'],event.data.email_id,event.type,Date.now());
          if(result.changes){db.prepare('UPDATE requests SET status=?,updated=? WHERE provider_id=?').run(event.type,Date.now(),event.data.email_id);log({event:event.type,providerId:event.data.email_id});}
        }
        respond(200,{received:true});return;
      }
      if(!ready)throw fail("Service d’envoi non configuré.",503);
      let body;try{body=JSON.parse(raw);}catch{throw fail("JSON invalide.");}
      if(!body||typeof body!=='object'||Array.isArray(body))throw fail("Requête invalide.");
      if(body.website||!Number.isFinite(body.startedAt)||Date.now()-body.startedAt<2000)throw fail("Vérification anti-spam refusée.",400);
      const quote=validateQuote(body);
      const fingerprint=createHmac('sha256',env.CONTACT_RATE_SECRET).update(JSON.stringify(quote)).digest('hex');
      const previous=db.prepare('SELECT * FROM requests WHERE id=?').get(quote.requestId);
      if(previous){
        if(previous.fingerprint!==fingerprint)throw fail("Le contenu a changé : préparez une nouvelle demande.",409);
        if(previous.provider_id){respond(200,{status:'accepted',reference:quote.reference});return;}
        if(Date.now()-previous.created>23*3600000)throw fail("Cette demande ancienne doit être vérifiée par Rosebuds avant un nouvel envoi.",409);
        if(previous.status==='pending'&&Date.now()-previous.updated<60000)throw fail("Demande déjà en cours. Veuillez patienter avant de réessayer.",409);
      }
      const ip=env.CONTACT_TRUST_PROXY==='1'?String(req.headers['x-forwarded-for']||req.socket.remoteAddress).split(',')[0].trim():req.socket.remoteAddress;
      const bucket=createHmac('sha256',env.CONTACT_RATE_SECRET).update(`${ip}:${Math.floor(Date.now()/3600000)}`).digest('hex');
      db.prepare('DELETE FROM limits WHERE expires<?').run(Date.now());
      db.prepare('DELETE FROM events WHERE created<?').run(Date.now()-30*86400000);
      db.prepare('DELETE FROM requests WHERE updated<?').run(Date.now()-30*86400000);
      const rate=db.prepare('INSERT INTO limits VALUES(?,1,?) ON CONFLICT(key) DO UPDATE SET count=count+1 RETURNING count').get(bucket,Date.now()+3600000);
      if(rate.count>5)throw fail("Trop de demandes. Veuillez réessayer plus tard.",429);
      const challenge=await fetchImpl('https://challenges.cloudflare.com/turnstile/v0/siteverify',{method:'POST',body:new URLSearchParams({secret:env.TURNSTILE_SECRET_KEY,response:text(body.captchaToken,2048,1)}),signal:AbortSignal.timeout(10000)}).then(r=>r.json());
      const hostnames=origins.map(o=>new URL(o).hostname);
      if(!challenge.success||challenge.action!=='rosebuds_quote'||!hostnames.includes(challenge.hostname))throw fail("Vérification anti-spam expirée ou refusée.",400);
      for(const attachment of quote.attachments){
        const scan=await fetchImpl(env.AV_SCAN_URL,{method:'POST',headers:{'Content-Type':'application/octet-stream',...(env.AV_SCAN_TOKEN?{Authorization:`Bearer ${env.AV_SCAN_TOKEN}`}:{})},body:Buffer.from(attachment.content,'base64'),signal:AbortSignal.timeout(15000)});
        if(!scan.ok||(await scan.json()).clean!==true)throw fail("Pièce jointe refusée ou analyse indisponible.",422);
      }
      if(!previous)db.prepare('INSERT OR IGNORE INTO requests VALUES(?,?,?,NULL,?,?,?)').run(quote.requestId,fingerprint,quote.reference,'new',Date.now(),Date.now());
      const lock=db.prepare("UPDATE requests SET status='pending',updated=? WHERE id=? AND fingerprint=? AND provider_id IS NULL AND (status!='pending' OR updated<?)").run(Date.now(),quote.requestId,fingerprint,Date.now()-60000);
      if(!lock.changes){const current=db.prepare('SELECT * FROM requests WHERE id=?').get(quote.requestId);if(current?.fingerprint===fingerprint&&current.provider_id){respond(200,{status:'accepted',reference:quote.reference});return;}throw fail("Demande déjà en cours ou contenu modifié.",409);}
      try {
        const response=await fetchImpl('https://api.resend.com/emails',{method:'POST',headers:{Authorization:`Bearer ${env.RESEND_API_KEY}`,'Content-Type':'application/json','Idempotency-Key':`rosebuds-${quote.requestId}`},body:JSON.stringify(buildQuoteEmail(quote,env.CONTACT_FROM)),signal:AbortSignal.timeout(20000)});
        const result=await response.json();if(!response.ok||typeof result.id!=='string')throw fail("Le prestataire n’a pas accepté l’envoi.",502);
        db.prepare("UPDATE requests SET provider_id=?,status='accepted',updated=? WHERE id=?").run(result.id,Date.now(),quote.requestId);
        log({event:'quote.accepted',reference:quote.reference,providerId:result.id});respond(202,{status:'accepted',reference:quote.reference});
      }catch(error){db.prepare("UPDATE requests SET status='retry',updated=? WHERE id=?").run(Date.now(),quote.requestId);throw error;}
    }catch(error){log({event:'quote.error',status:error.status||503});if(!res.headersSent)respond(error.status||503,{error:error.status?error.message:"Votre demande n’a pas pu être transmise. Veuillez réessayer ou utiliser une autre méthode de contact."});}
  }
  return {handler,close:()=>db.close()};
}
