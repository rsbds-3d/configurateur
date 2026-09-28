import * as THREE from "three";

export function createCoinReference(source, unitsPerMillimeter, floorY = 0) {
  const coin = source.clone(true);
  coin.traverse((child) => {
    if (!child.isMesh) return;
    // Keep the cached GLB source intact when a displayed instance is disposed.
    child.geometry = child.geometry.clone();
    child.material = Array.isArray(child.material)
      ? child.material.map((material) => material.clone()) : child.material.clone();
    child.castShadow = true;
    child.receiveShadow = true;
    child.userData.nonMaterialEditable = true;
  });

  const group = new THREE.Group();
  group.name = "Pièce de 1 euro ROSEBUDS";
  group.add(coin);

  // glTF lengths are in meters. Stand the coin upright with its obverse facing the camera.
  coin.scale.multiplyScalar(1000 * unitsPerMillimeter);
  coin.rotation.x = Math.PI / 2;
  coin.updateWorldMatrix(true, true);

  const bounds = new THREE.Box3().setFromObject(coin);
  const center = bounds.getCenter(new THREE.Vector3());
  coin.position.add(new THREE.Vector3(-center.x, floorY - bounds.min.y, -center.z));
  group.userData.referenceDiameterMm = (bounds.max.y - bounds.min.y) / unitsPerMillimeter;
  group.userData.referenceThicknessMm = (bounds.max.z - bounds.min.z) / unitsPerMillimeter;
  return group;
}
