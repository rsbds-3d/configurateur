import * as THREE from "three";

function randomGenerator(seed = 1977) {
  return () => { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return seed / 4294967296; };
}

export function furCompression(x, z, boxes, length) {
  let factor = 1;
  for (const box of boxes) {
    const cx = (box.min.x + box.max.x) / 2, cz = (box.min.z + box.max.z) / 2;
    const rx = Math.max(length, (box.max.x - box.min.x) / 2);
    const rz = Math.max(length, (box.max.z - box.min.z) / 2);
    const distance = (Math.hypot((x - cx) / rx, (z - cz) / rz) - .72) * Math.min(rx, rz);
    const t = THREE.MathUtils.clamp(distance / (length * 2), 0, 1);
    factor = Math.min(factor, 0.025 + 0.975 * t * t * (3 - 2 * t));
  }
  return factor;
}

export function createFurBladeGeometry() {
  const positions = [], uv = [], colors = [], indices = [];
  for (let row = 0; row <= 4; row++) {
    const t = row / 4, width = 1 - t * .45;
    for (const side of [-1, 1]) {
      positions.push(side * width * .5 + t * t * .8, t * t * .3, t);
      uv.push(side < 0 ? 0 : 1, t);
      const shade = .52 + .48 * t;
      colors.push(shade, shade, shade);
    }
    if (row < 4) { const i = row * 2; indices.push(i, i + 1, i + 2, i + 1, i + 3, i + 2); }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute("uv", new THREE.Float32BufferAttribute(uv, 2));
  geometry.setAttribute("color", new THREE.Float32BufferAttribute(colors, 3));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  return geometry;
}

export function createFurAlphaTexture() {
  const canvas = document.createElement("canvas");
  canvas.width = 256; canvas.height = 512;
  const ctx = canvas.getContext("2d");
  ctx.fillStyle = "black"; ctx.fillRect(0, 0, 256, 512);
  const random = randomGenerator();
  ctx.lineCap = "round";
  for (let i = 0; i < 12; i++) {
    const x = 8 + random() * 240, tip = 8 + random() * 100;
    ctx.strokeStyle = "white"; ctx.lineWidth = 3 + random() * 3;
    ctx.beginPath(); ctx.moveTo(x, 512);
    ctx.bezierCurveTo(x - 6, 330, x + 18, 150, x + 12 + random() * 12, tip);
    ctx.stroke();
  }
  const texture = new THREE.CanvasTexture(canvas);
  texture.name = "Masque de fibres fourrure";
  return texture;
}

export function createStudioFur({ layout, contactBoxes, objectSize, color, alphaMap, heightAt, mobile = false }) {
  const count = mobile ? 24000 : 68000;
  const length = THREE.MathUtils.clamp(objectSize * .045, .07, .26);
  const geometry = createFurBladeGeometry();
  const material = new THREE.MeshPhysicalMaterial({
    color, alphaMap, alphaTest: .005, transparent: true, opacity: .8,
    depthWrite: false, forceSinglePass: true, side: THREE.DoubleSide,
    roughness: .95, metalness: 0, sheen: .7, sheenRoughness: .9,
    sheenColor: new THREE.Color(color), specularIntensity: .12,
    vertexColors: true, envMapIntensity: .25,
  });
  const mesh = new THREE.InstancedMesh(geometry, material, count);
  mesh.name = "Fourrure 3D - meches instanciees";
  mesh.userData.studioFur = true;
  mesh.userData.strandCount = count * 12;
  mesh.userData.fiberLength = length;
  const random = randomGenerator(), transform = new THREE.Object3D();
  const tint = new THREE.Color();
  let compressed = 0;
  for (let i = 0; i < count; i++) {
    const radius = Math.sqrt(random()) * layout.radius;
    const angle = random() * Math.PI * 2;
    const x = radius * Math.cos(angle), y = radius * Math.sin(angle);
    const compression = furCompression(layout.center.x + x, layout.center.z - y, contactBoxes, length);
    if (compression < .1) compressed++;
    transform.position.set(x, y, heightAt(x, y) + .0005);
    transform.rotation.set(0, (1 - compression) * .85 + (random() - .5) * .65, random() * Math.PI * 2);
    transform.scale.set(length * (.35 + random() * .2), length, length * (.65 + random() * .7) * compression);
    transform.updateMatrix(); mesh.setMatrixAt(i, transform.matrix);
    tint.setScalar(.8 + random() * .2); mesh.setColorAt(i, tint);
  }
  mesh.instanceMatrix.needsUpdate = true;
  mesh.instanceColor.needsUpdate = true;
  mesh.userData.compressedTufts = compressed;
  mesh.computeBoundingSphere();
  mesh.receiveShadow = true;
  return mesh;
}

export function disposeStudioFur(mesh) {
  mesh.removeFromParent(); mesh.geometry.dispose(); mesh.material.dispose(); mesh.dispose();
}
