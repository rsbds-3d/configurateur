import * as THREE from "../../assets/vendor/three.module.js";

export function quotePreviewCamera(box, front = new THREE.Vector3(1, 0, 1), aspect = 4 / 3) {
  if (box.isEmpty()) throw new Error("Le modele 3D n'est pas encore disponible.");
  const center = box.getCenter(new THREE.Vector3());
  const up = new THREE.Vector3(0, 1, 0);
  const axis = front.clone().normalize();
  const side = new THREE.Vector3().crossVectors(up, axis);
  if (side.lengthSq() < 0.001) side.set(1, 0, 0);
  const direction = axis.addScaledVector(side.normalize(), 1.15).addScaledVector(up, 0.65).normalize();
  const camera = new THREE.PerspectiveCamera(32, aspect, 0.001, 10000);
  camera.position.copy(center).add(direction);
  camera.lookAt(center);
  const inverse = camera.quaternion.clone().invert();
  const tanY = Math.tan(THREE.MathUtils.degToRad(camera.fov / 2));
  let distance = 0;
  // Fit every corner in camera space rather than using a loose bounding sphere.
  for (const x of [box.min.x, box.max.x]) for (const y of [box.min.y, box.max.y]) for (const z of [box.min.z, box.max.z]) {
    const point = new THREE.Vector3(x, y, z).sub(center).applyQuaternion(inverse);
    distance = Math.max(distance, point.z + 1.1 * Math.max(Math.abs(point.x) / (tanY * aspect), Math.abs(point.y) / tanY));
  }
  const size = box.getSize(new THREE.Vector3()).length();
  camera.position.copy(center).addScaledVector(direction, distance);
  camera.near = Math.max(0.00001, size / 10000);
  camera.far = distance + size * 10;
  camera.updateProjectionMatrix();
  camera.updateMatrixWorld();
  return camera;
}

export async function captureQuotePreview({renderer, scene, model, bounds, front, excluded = []}) {
  const camera = quotePreviewCamera(bounds, front);
  const width = 1200, height = 900;
  const target = new THREE.WebGLRenderTarget(width, height, {samples: 4});
  target.texture.colorSpace = THREE.SRGBColorSpace;
  const previousTarget = renderer.getRenderTarget();
  const viewport = renderer.getViewport(new THREE.Vector4());
  const scissor = renderer.getScissor(new THREE.Vector4());
  const scissorTest = renderer.getScissorTest();
  const visibility = [model, ...excluded].map(object => [object, object.visible]);
  const pixels = new Uint8Array(width * height * 4);
  try {
    model.visible = true;
    excluded.forEach(object => { object.visible = false; });
    renderer.setRenderTarget(target);
    renderer.setViewport(0, 0, width, height);
    renderer.setScissorTest(false);
    renderer.render(scene, camera);
    renderer.readRenderTargetPixels(target, 0, 0, width, height, pixels);
  } finally {
    visibility.forEach(([object, visible]) => { object.visible = visible; });
    renderer.setRenderTarget(previousTarget);
    renderer.setViewport(viewport);
    renderer.setScissor(scissor);
    renderer.setScissorTest(scissorTest);
    target.dispose();
  }
  const canvas = document.createElement("canvas");
  canvas.width = width; canvas.height = height;
  const image = canvas.getContext("2d").createImageData(width, height);
  for (let y = 0; y < height; y++) image.data.set(pixels.subarray((height - y - 1) * width * 4, (height - y) * width * 4), y * width * 4);
  canvas.getContext("2d").putImageData(image, 0, 0);
  return new Promise((resolve, reject) => canvas.toBlob(blob => blob ? resolve(blob) : reject(new Error("Capture PNG indisponible")), "image/png"));
}
