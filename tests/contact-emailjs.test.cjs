const assert = require('node:assert/strict');
const fs = require('node:fs');
(async () => {
  const {buildEmailJsParams,validateEmailJsConfig,sendEmailJsQuote,EMAILJS_ENDPOINT} = await import('../assets/js/contact-emailjs.js');
  const config = {serviceId:'rosebuds_devis',templateId:'rosebuds_devis_html',publicKey:'public_test_key'};
  const quote = {name:'Elodie Client',email:'client@example.test',reference:'RB-test',subject:'Mon devis',message:'Bonjour, un devis pour ce produit.',configuration:{modelFamily:'Classique',catalogModel:'plug-classique-medium-keyring',modelLabel:'Plug MEDIUM bronze',plugSizeLabel:'MEDIUM',plugSize:'MEDIUM-30',plugDiameterMm:30,metalFamily:'inox',metalFinish:'stainless-mirror-silver',ornament:'bronze',ornamentFinish:'Gold',bronzeType:'keyring',lengthMm:120,mixedMaterials:true},to:'evil@example.test',attachments:[{content:'PRIVATE_IMAGE'}]};
  const params=buildEmailJsParams(quote);
  assert.equal(params.email,quote.email); assert.equal(params.family,'Originale'); assert.equal(params.diameter,'30 mm');
  assert.equal(params.crystal_size,'Non précisé'); assert.equal(params.metal_finish,'Poli miroir');
  assert.ok(params.mixed_note.includes('Longueur : 120 mm')); assert.ok(params.mixed_note.includes('keyring')); assert.ok(params.mixed_note.includes('Matériaux multiples'));
  assert.ok(params.reply_url.startsWith('mailto:client%40example.test?subject='));
  const viewer = new URL(params.viewer_url); assert.equal(viewer.origin,'https://rsbds-3d.github.io'); assert.equal(viewer.searchParams.get('ornamentFinish'),'Gold'); assert.equal(viewer.searchParams.has('email'),false);
  const template=fs.readFileSync('assets/email/rosebuds-devis-emailjs.html','utf8');
  const form=fs.readFileSync('assets/js/contact-form.js','utf8');
  assert.ok(!form.includes('Envoi via FormSubmit'));assert.ok(!form.includes('Confidentialité FormSubmit'));assert.ok(form.includes('class="quote-privacy"'));
  assert.deepEqual(Object.keys(params).sort(),[...new Set([...template.matchAll(/\{\{(\w+)\}\}/g)].map(m=>m[1]))].sort());
  for(const key of ['to','to_email','from_email','cc','bcc','attachments','accessToken']) assert.equal(params[key],undefined);
  assert.ok(!JSON.stringify(params).includes('PRIVATE_IMAGE'));
  assert.throws(()=>validateEmailJsConfig({}),/configuré/);
  assert.throws(()=>buildEmailJsParams({...quote,email:'client@example.test\r\nBcc: evil@example.test'}));
  assert.throws(()=>buildEmailJsParams({...quote,message:'Court'}));
  let calls=0;
  const accepted=await sendEmailJsQuote(quote,config,async(endpoint,options)=>{
    calls++;assert.equal(endpoint,EMAILJS_ENDPOINT);assert.equal(options.credentials,'omit');assert.equal(options.method,'POST');
    const body=JSON.parse(options.body);assert.equal(body.service_id,'rosebuds_devis');assert.equal(body.template_id,'rosebuds_devis_html');assert.equal(body.user_id,'public_test_key');assert.equal(body.template_params.email,quote.email);assert.equal(body.accessToken,undefined);
    return {status:200,text:async()=> 'OK'};
  });
  assert.equal(accepted.status,'accepted'); assert.equal(calls,1);
  for(const result of [{status:400,text:'Bad'},{status:200,text:'success'},{status:202,text:'OK'},{status:429,text:'Limit'},{status:412,text:'Gmail_API private detail'}]) {
    await assert.rejects(()=>sendEmailJsQuote(quote,config,async()=>({status:result.status,text:async()=>result.text})));
  }
  let failedCalls=0;await assert.rejects(()=>sendEmailJsQuote(quote,config,async()=>{failedCalls++;throw new Error('timeout');}),/doublon/);assert.equal(failedCalls,1);
  await assert.rejects(()=>sendEmailJsQuote({...quote,website:'spam'},config,async()=>{throw Error('must not be sent');}),/informations/);
  console.log('EmailJS: exact template variables, fixed service, client Reply-To, no files/recipient/private key, explicit 200 OK, errors and no automatic retry. All sends mocked.');
})().catch(error=>{console.error(error);process.exitCode=1;});
