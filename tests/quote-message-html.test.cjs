const assert = require('node:assert/strict');
(async()=>{
  const {quoteMessageHtml} = await import('../assets/js/quote-message-html.js');
  const rows = [['Gamme','Originale'],['Métal','Inox'],['Ornement','<img src=x onerror=alert(1)>']];
  const html = quoteMessageHtml('Bonjour,\n\n**Merci** pour _votre réponse_.\nGamme : Originale\nMétal : Inox\n\n- Prix\n- Délais\n\n<script>alert(1)</script>',rows,'https://example.test/');
  assert.equal((html.match(/<table /g)||[]).length,1);
  assert.equal((html.match(/scope="row"/g)||[]).length,3);
  assert(html.includes('<strong>Merci</strong>'));
  assert(html.includes('<em>votre réponse</em>'));
  assert(html.includes('<ul ') && html.includes('<li '));
  assert(!html.includes('<script') && !html.includes('<img'));
  assert(html.includes('&lt;script&gt;'));
  const custom = quoteMessageHtml('Je souhaite **un devis**.',rows,'https://example.test/');
  assert(custom.includes('Configuration du produit') && custom.includes('Inox'));
  assert(quoteMessageHtml('Configuration 3D : https://example.test/',rows,'https://example.test/').includes('>Voir ma configuration 3D</a>'));
  console.log('Rich quote: escaped HTML, formatted text, one canonical table even with custom message OK');
})().catch(error=>{console.error(error);process.exitCode=1;});
