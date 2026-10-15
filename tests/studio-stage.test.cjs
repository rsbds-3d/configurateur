const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

(async () => {
  const root = path.resolve(__dirname, '..');
  const threeUrl = pathToFileURL(path.join(root, 'assets/vendor/three.module.js')).href;
  const THREE = await import(threeUrl);
  const source = fs.readFileSync(path.join(root, 'assets/js/studio-stage.js'), 'utf8')
    .replace('from "three"', `from "${threeUrl}"`);
  const { stageLayout, createStageGeometry } = await import(`data:text/javascript;base64,${Buffer.from(source).toString('base64')}`);
  const box = new THREE.Box3(new THREE.Vector3(-2, 0, -1), new THREE.Vector3(2, 3, 1));
  const layout = stageLayout(box);
  assert.ok(Math.abs(layout.radius * 2 - Math.hypot(4, 2) * 1.2) < 1e-9);
  for (const family of ['silk', 'fur', 'velvet']) {
    const geometry = createStageGeometry(layout, family, [box]);
    const positions = geometry.getAttribute('position');
    let min = 0;
    for (let i = 0; i < positions.count; i++) {
      const x = positions.getX(i), y = positions.getY(i), z = positions.getZ(i);
      assert.ok(Number.isFinite(z) && z <= 1e-8, 'Relief must not cover the object');
      if (Math.abs(x) < 1.99 && Math.abs(y) < .99) assert.ok(Math.abs(z) < 1e-8, 'Contact footprint stays flat');
      min = Math.min(min, z);
    }
    assert.ok(min < -0.001, 'Textile must have geometric relief');
    assert.ok([...geometry.getAttribute('normal').array].every(Number.isFinite));
    geometry.dispose();
  }
  console.log('Studio stage: margin, relief and contact tests passed.');
})().catch(error => { console.error(error); process.exitCode = 1; });
