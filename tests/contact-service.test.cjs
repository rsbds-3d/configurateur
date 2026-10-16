const assert=require('node:assert/strict');
const {Readable}=require('node:stream');
const {randomUUID,createHmac}=require('node:crypto');
(async()=>{
 const {validateQuote,buildQuoteEmail,verifyWebhook,createContactService}=await import('../server/contact-service.mjs');
 const image=Buffer.alloc(24);Buffer.from([137,80,78,71,13,10,26,10]).copy(image);image.writeUInt32BE(1,16);image.writeUInt32BE(1,20);
 const body={requestId:randomUUID(),reference:`RB-${randomUUID()}`,name:'Élodie Test',email:'client@example.test',subject:'Demande de devis',message:'Bonjour, devis pour cette configuration <script>test</script>.',startedAt:Date.now()-5000,captchaToken:'test-token',configuration:{catalogModel:'plug-classique-xl',modelFamily:'Classique',plugDiameterMm:40,ornamentFinish:'Silk Shimmer'},attachments:[{name:'configuration.png',type:'image/png',content:image.toString('base64')}]};
 const quote=validateQuote({...body,to:'attacker@example.test'}),email=buildQuoteEmail(quote,'Rosebuds <devis@example.test>');
 assert.deepEqual(email.to,['info@rosebuds.net']);assert.equal(email.reply_to,body.email);assert.equal(email.cc,undefined);assert.equal(email.bcc,undefined);
 assert.ok(email.html.includes('&lt;script&gt;'));assert.ok(!email.html.includes('<script>'));assert.ok(email.text.includes('Élodie'));
 assert.ok(email.html.includes('cid:rosebuds-configuration'));assert.equal(email.attachments[0].content_id,'rosebuds-configuration');
 assert.throws(()=>validateQuote({...body,email:'x\r\nBcc: evil@example.test'}));
 assert.throws(()=>validateQuote({...body,attachments:[{name:'evil.exe',type:'image/png',content:image.toString('base64')}]}));
 assert.throws(()=>validateQuote({...body,attachments:[...body.attachments,{name:'active.pdf',type:'application/pdf',content:Buffer.from('%PDF- /JavaScript(alert)').toString('base64')}]}));
 const secret=Buffer.from('test-webhook-secret').toString('base64'),timestamp=String(Math.floor(Date.now()/1000)),id='evt-1';
 const event=JSON.stringify({type:'email.bounced',data:{email_id:'provider-1'}});
 const sig=createHmac('sha256',Buffer.from(secret,'base64')).update(`${id}.${timestamp}.${event}`).digest('base64');
 assert.equal(verifyWebhook(event,{'svix-id':id,'svix-timestamp':timestamp,'svix-signature':`v1,${sig}`},`whsec_${secret}`).type,'email.bounced');
 assert.throws(()=>verifyWebhook(event+' ',{'svix-id':id,'svix-timestamp':timestamp,'svix-signature':`v1,${sig}`},`whsec_${secret}`));
 let sends=0,providerFailure=false,infected=false;
 const env={CONTACT_ALLOWED_ORIGINS:'https://config.example.test',RESEND_API_KEY:'test',CONTACT_FROM:'Rosebuds <devis@example.test>',CONTACT_RATE_SECRET:'a'.repeat(40),TURNSTILE_SECRET_KEY:'test',TURNSTILE_SITE_KEY:'test',RESEND_WEBHOOK_SECRET:`whsec_${secret}`,AV_SCAN_URL:'https://scanner.example.test'};
 const service=createContactService({env,databasePath:':memory:',fetchImpl:async(url,options)=>{
   if(url.includes('siteverify'))return {json:async()=>({success:true,action:'rosebuds_quote',hostname:'config.example.test'})};
   if(url===env.AV_SCAN_URL)return {ok:true,json:async()=>({clean:!infected})};
   assert.equal(url,'https://api.resend.com/emails');sends++;const payload=JSON.parse(options.body);assert.deepEqual(payload.to,['info@rosebuds.net']);assert.equal(payload.reply_to,body.email);assert.ok(options.headers['Idempotency-Key']);
   return {ok:!providerFailure,json:async()=>providerFailure?{message:'rejected'}:{id:'provider-1'}};
 }});
 const call=async(path,raw,headers)=>{let code,output;const req=Readable.from([Buffer.from(raw)]);Object.assign(req,{url:path,method:'POST',headers,socket:{remoteAddress:'127.0.0.1'}});const res={headersSent:false,setHeader(){},writeHead(status){code=status;this.headersSent=true;},end(body){output=body;}};await service.handler(req,res);return {status:code,json:async()=>JSON.parse(output)};};
 const send=(data,origin='https://config.example.test')=>call('/api/contact',JSON.stringify(data),{origin,'content-type':'application/json'});
 try{
  assert.equal((await send(body,'https://evil.test')).status,403);
  const first=await send(body);assert.equal(first.status,202);assert.equal((await first.json()).status,'accepted');
  assert.equal((await send(body)).status,200);assert.equal(sends,1,'Idempotency must prevent a second provider call');
  assert.equal((await send({...body,message:'Message modifié après envoi'})).status,409);
  providerFailure=true;assert.equal((await send({...body,requestId:randomUUID()})).status,502);providerFailure=false;
  infected=true;assert.equal((await send({...body,requestId:randomUUID()})).status,422);infected=false;
  const concurrent={...body,requestId:randomUUID()};const before=sends;
  const pair=await Promise.all([send(concurrent),send(concurrent)]);
  assert.ok(pair.some(r=>r.status===202));assert.equal(sends-before,1,'Concurrent submissions must call the provider only once');
  assert.equal((await send({...body,requestId:randomUUID()})).status,429);
  assert.equal((await call('/api/contact','{invalid',{'origin':'https://config.example.test','content-type':'application/json'})).status,400);
  const webhook=await call('/api/webhooks/resend',event,{'content-type':'application/json','svix-id':id,'svix-timestamp':timestamp,'svix-signature':`v1,${sig}`});assert.equal(webhook.status,200);
 }finally{service.close();}
 console.log('Contact API: fixed recipient, reply-to, attachments, HTML escaping, webhook, idempotency and errors passed. No real email sent.');
})().catch(e=>{console.error(e);process.exitCode=1;});
