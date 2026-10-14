const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const code = fs.readFileSync(path.join(__dirname, '..', 'app.js'), 'utf8');
assert(code.includes('supportMaterial: "silk-auto"'));
assert(code.includes('new THREE.MeshPhysicalMaterial({'));
assert(code.includes('const blackPlug = /black|noir/i.test(settings.metalPreset)'));
assert(code.includes('floorMaterial.displacementMap = null'));
assert(code.includes('leatherBackdrop.visible = false'));
assert(code.includes('leatherBackdrop.visible = arSceneState.backdropVisible'));
assert(code.includes('function applyStudioDecor(id)'));
for (const asset of ['silk-ivory.png', 'leather-black.png', 'fur-ivory.png', 'velvet-ivory.png']) {
  assert(fs.statSync(path.join(__dirname, '..', 'assets/materials/textile', asset)).size > 1000);
}
console.log('Textile stage: OK');
