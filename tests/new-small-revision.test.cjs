const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const app=fs.readFileSync('app.js','utf8');
const integrity=JSON.parse(fs.readFileSync('assets/models/plugs/model-integrity.json','utf8'));
const revision=integrity.assetRevisions['new-small'];
assert.equal(revision,'20261104-new-small-v11');
const get=app.slice(app.indexOf('function withCurrentModelVersion('),app.indexOf('function createPlugFallbackPart('));
const context=vm.createContext({MODEL_ASSET_VERSION:'unchanged',NEW_SMALL_ASSET_VERSION:revision});
vm.runInContext(get,context);
for(const name of ['new-small-cristal','new-small-cabochon-lisse']) {
  const url=context.withCurrentModelVersion(`./assets/models/plugs/new-small/${name}.3dm`);
  assert(url.endsWith(`meshVersion=${revision}`));
  assert(app.includes(`./assets/models/plugs/new-small/${name}.3dm?v=${revision}`));
}
assert(context.withCurrentModelVersion('./assets/models/plugs/classiques/medium.3dm').endsWith('meshVersion=unchanged'));
assert.equal(context.withCurrentModelVersion('blob:test'),'blob:test');
assert(fs.existsSync('assets/previews/models/plug-new-small-cristal.png'));
assert(fs.existsSync('assets/previews/models/plug-new-small-cabochon-lisse.png'));
console.log('NEW SMALL revision: both URLs versioned, other caches preserved, thumbnails present.');
