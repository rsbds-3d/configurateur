const assert = require('node:assert/strict');
const fs = require('node:fs');
(async () => {
  const THREE = await import('../assets/vendor/three.module.js');
  const {quotePreviewCamera} = await import('../assets/js/quote-preview.js');
  for (const size of [[1, 0.4, 0.3], [0.1, 0.3, 0.1], [5, 1, 2]]) {
    const box = new THREE.Box3(new THREE.Vector3(4, 2, -3), new THREE.Vector3(4 + size[0], 2 + size[1], -3 + size[2]));
    for (const aspect of [4 / 3, 1, 2]) {
      const camera = quotePreviewCamera(box, new THREE.Vector3(-1, 0, 0), aspect);
      let occupancy = 0;
      for (const x of [box.min.x, box.max.x]) for (const y of [box.min.y, box.max.y]) for (const z of [box.min.z, box.max.z]) {
        const p = new THREE.Vector3(x, y, z).project(camera);
        assert(Math.abs(p.x) <= 0.92 && Math.abs(p.y) <= 0.92);
        occupancy = Math.max(occupancy, Math.abs(p.x), Math.abs(p.y));
        assert(p.z >= -1 && p.z <= 1);
      }
      assert(occupancy > 0.8, 'Cadrage trop large');
    }
  }
  assert.throws(() => quotePreviewCamera(new THREE.Box3()), /disponible/);
  const form = fs.readFileSync('assets/js/contact-form.js', 'utf8');
  assert(form.includes('<tbody data-details>'));
  assert(form.includes('label.scope="row"'));
  const app = fs.readFileSync('app.js', 'utf8');
  assert(app.includes('capture: captureQuoteProduct'));
  console.log('Quote preview: perspective, 10% margin, table semantics OK');
})().catch(error => { console.error(error); process.exitCode = 1; });
