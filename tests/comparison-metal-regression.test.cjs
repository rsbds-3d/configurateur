const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const code = fs.readFileSync(require('node:path').join(__dirname, '..', 'app.js'), 'utf8');
const ctx = {};
vm.createContext(ctx);
vm.runInContext(code.slice(code.indexOf('function hasFacetedSourceNormals('), code.indexOf('function hasValidSourceNormals(')), ctx);
function geometry(values) {
  const normal = { count: values.length / 3, getX: i => values[i*3], getY: i => values[i*3+1], getZ: i => values[i*3+2] };
  return { getAttribute: () => normal };
}
assert(ctx.hasFacetedSourceNormals(geometry([0,0,1,0,0,1,0,0,1, 0,1,0,0,1,0,0,1,0])));
assert(!ctx.hasFacetedSourceNormals(geometry([0,0,1,0,0,1,0,0,1, 0,0,1,0,0,1,0,0,1])));
assert(!ctx.hasFacetedSourceNormals(geometry([0,0,1,0,0.6,0.8,0,0.8,0.6, 0,1,0,0,0.8,0.6,0,0.6,0.8])));
const selection = code.slice(code.indexOf('function getAutomaticScaleComparisonModelIds('), code.indexOf('function findModelSceneUnitsPerMillimeter('));
assert(!selection.includes('catalogModelSupportsMetalFinish('));
assert(selection.includes('meta.classicHead !== currentMeta.classicHead'));
const comparisonContext = {
  URLSearchParams, window: { location: { search: '?ornament=crystal&metalFamily=alu&metalFinish=aluminum-pink' } },
  settings: { modelId: 'plug-medium', metalPreset: 'aluminum-pink' },
  modelDefaults: { 'plug-small': {}, 'plug-medium': {}, 'plug-large': {}, 'plug-bronze': {} },
  getCatalogModelMeta: id => ({ modelFamily: 'Classique', classicHead: id === 'plug-bronze' ? 'bronze' : 'avec-tete', ornamentFamilies: ['crystal'] }),
  getComparisonCrystalSize: () => '27 mm',
  getComparisonPlugDiameterMm: id => ({ 'plug-small': 25, 'plug-medium': 30, 'plug-large': 35 }[id]),
  catalogModelSupportsOrnament: () => true,
};
vm.createContext(comparisonContext);
vm.runInContext(selection, comparisonContext);
assert.deepEqual(Array.from(comparisonContext.getAutomaticScaleComparisonModelIds()), ['plug-small', 'plug-medium', 'plug-large']);
const pipeline = code.slice(code.indexOf('function applyImportedMeshProcessing('), code.indexOf('function smoothImportedMeshMaterial('));
assert(pipeline.includes('repairedFacetedSourceNormals: true'));
assert(pipeline.indexOf('classicPlugRole === "gem"') < pipeline.indexOf('hasFacetedSourceNormals'));
console.log('Comparison and faceted metal regression: OK');
const refresh = code.slice(code.indexOf('function refreshComparisonGemRendering('), code.indexOf('function placeComparisonModels('));
assert(refresh.includes('getRootGemMeshes(group).forEach'));
assert(!refresh.includes('isLikelyGemMaterial('));
