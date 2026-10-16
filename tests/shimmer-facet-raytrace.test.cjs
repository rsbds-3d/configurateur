const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const code = fs.readFileSync(path.join(__dirname, '..', 'app.js'), 'utf8');
const start = code.indexOf('const rhinoMaterialSheetGemPresets =');
const end = code.indexOf('function registerRhinoMaterialSheetGemPresets()', start);
const context = {}; vm.createContext(context);
vm.runInContext(code.slice(start, end) + '\nthis.presets = rhinoMaterialSheetGemPresets;', context);
for (const label of ['Silk Shimmer', 'Ghost Light']) {
  const row = context.presets.find(row => row[1] === label);
  assert.ok(row, label);
  assert.equal(row[8], false, `${label} is a faceted crystal, not a cabochon`);
  assert.equal(row[9], false, `${label} is not opaque`);
  assert.equal(row[10], false, `${label} is not a pearl`);
  assert.ok(row[5] >= .16, `${label} transmission supports ray tracing`);
  assert.ok(row[6] <= .032, `${label} polished facets must not look blurred`);
}
const cabochon = context.presets.find(row => row[1] === 'Ruby Cabochon');
assert.equal(cabochon[8], true, 'Real cabochons must remain smooth');
console.log('Shimmer crystals: sharp classification and ray-tracing eligibility passed.');
