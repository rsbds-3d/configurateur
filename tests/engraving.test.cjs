const {test}=require('node:test');
const assert=require('node:assert/strict');

test('engraving is optional, validated and preserved in quote links', async()=>{
  const {normalizeEngraving,engravingFromParams,engravingToParams}=await import('../assets/js/engraving.js');
  const {configurationRows}=await import('../assets/js/contact-model.js');
  const {buildPublicViewerUrl}=await import('../assets/js/contact-formsubmit.js');
  const personalization=normalizeEngraving({enabled:true,text:'  E\u0301lodie  ',axialRatio:.4,angle:Math.PI});
  assert.equal(personalization.text,'Élodie');
  assert.throws(()=>normalizeEngraving({enabled:true,text:' '}));
  assert.throws(()=>normalizeEngraving({enabled:true,text:'a'.repeat(25)}));
  const url=new URL(buildPublicViewerUrl({catalogModel:'plug-new-small-cristal',personalization}));
  assert.deepEqual(engravingFromParams(url.searchParams),personalization);
  assert.equal(new Map(configurationRows({personalization})).get('Texte à graver'),'Élodie');
  engravingToParams(url.searchParams,{enabled:false});
  assert.equal(url.searchParams.has('engravingText'),false);
  assert.equal(engravingFromParams(url.searchParams).enabled,false);
  assert.equal(new Map(configurationRows()).has('Texte à graver'),false);
});
