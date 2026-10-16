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
  const { stageLayout, fitStageToCamera, createStageGeometry } = await import(`data:text/javascript;base64,${Buffer.from(source).toString('base64')}`);
  const box = new THREE.Box3(new THREE.Vector3(-2, 0, -1), new THREE.Vector3(2, 3, 1));
  const layout = stageLayout(box);
  assert.ok(Math.abs(layout.radius * 2 - Math.hypot(4, 2) * 1.2) < 1e-9);
  for (const aspect of [390 / 844, 1.44, 2.4]) {
    const camera = new THREE.PerspectiveCamera(45, aspect, .01, 1000);
    camera.position.set(8, 6, 12);
    camera.lookAt(0, 1, 0);
    const fitted = fitStageToCamera(layout, camera, 0);
    assert.ok(fitted.radius >= layout.radius);
    assert.ok(fitted.curtainRadius > Math.hypot(8, 12));
    assert.ok(Math.abs(fitted.radius - fitted.curtainRadius * 1.1) < 1e-9);
    for (const x of [-1, 0, 1]) for (const y of [-1, 0, 1]) {
      const ray = new THREE.Raycaster(); ray.setFromCamera(new THREE.Vector2(x, y), camera);
      const cylinder = new THREE.Mesh(new THREE.CylinderGeometry(fitted.curtainRadius, fitted.curtainRadius, fitted.height + fitted.radius * .08, 128, 1, false), new THREE.MeshBasicMaterial({side:THREE.BackSide}));
      cylinder.position.y = (fitted.height - fitted.radius * .08) / 2;
      cylinder.updateMatrixWorld();
      assert.ok(ray.intersectObject(cylinder).length > 0, 'Every viewport ray must hit the closed decor');
      cylinder.geometry.dispose(); cylinder.material.dispose();
    }
  }
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
