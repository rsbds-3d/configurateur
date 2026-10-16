const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const {pathToFileURL} = require('node:url');
(async () => {
  const root = path.resolve(__dirname, '..');
  const threeUrl = pathToFileURL(path.join(root, 'assets/vendor/three.module.js')).href;
  const THREE = await import(threeUrl);
  const source = fs.readFileSync(path.join(root, 'assets/js/studio-fur.js'), 'utf8').replace('from "three"', `from "${threeUrl}"`);
  const {furCompression, createFurBladeGeometry, createStudioFur, disposeStudioFur} = await import(`data:text/javascript;base64,${Buffer.from(source).toString('base64')}`);
  const box = new THREE.Box3(new THREE.Vector3(-.5, 0, -.5), new THREE.Vector3(.5, 1, .5));
  assert.equal(furCompression(0, 0, [box], .1), .025);
  assert.equal(furCompression(1, 1, [box], .1), 1);
  assert.ok(furCompression(.6, 0, [box], .1) > .025);
  const geometry = createFurBladeGeometry();
  assert.ok(geometry.attributes.position.count > 4, 'Curved, segmented tuft geometry');
  assert.ok([...geometry.attributes.normal.array].every(Number.isFinite));
  geometry.dispose();
  const options = {layout:{radius:2,center:new THREE.Vector3()},contactBoxes:[box],objectSize:1,color:'#dddddd',alphaMap:null,heightAt:()=>0};
  const desktop = createStudioFur(options);
  const mobile = createStudioFur({...options,mobile:true});
  assert.equal(desktop.count, 68000);
  assert.equal(mobile.count, 24000);
  assert.ok(mobile.count < desktop.count);
  assert.ok(desktop.userData.compressedTufts > 0);
  assert.ok(desktop.userData.compressedTufts < desktop.count);
  assert.ok(desktop.boundingSphere.radius > 2, 'Fibres protrude above the base surface');
  assert.equal(desktop.material.transparent, true);
  assert.equal(desktop.material.depthWrite, false);
  assert.ok(desktop.material.alphaTest > 0);
  const matrix = new THREE.Matrix4(); desktop.getMatrixAt(1,matrix);
  assert.ok(matrix.elements.every(Number.isFinite));
  const annuli = [0, 0, 0, 0];
  for (let i = 0; i < desktop.count; i++) {
    desktop.getMatrixAt(i, matrix);
    const radiusSquared = matrix.elements[12] ** 2 + matrix.elements[13] ** 2;
    annuli[Math.min(3, Math.floor(radiusSquared / options.layout.radius ** 2 * 4))]++;
  }
  annuli.forEach(count => assert.ok(Math.abs(count / desktop.count - .25) < .015,
    'Equal-area annuli must have equal density: no dark central disk'));
  disposeStudioFur(desktop); disposeStudioFur(mobile);
  console.log('Fur: real geometry, density, contact compression and disposal passed.');
})().catch(error=>{console.error(error);process.exitCode=1;});
