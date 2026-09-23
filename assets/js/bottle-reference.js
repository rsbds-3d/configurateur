import * as THREE from "three";

export function createBottleReference(source, unitsPerMillimeter, floorY = 0) {
  const bottle = source.clone(true);
  bottle.traverse((child) => {
    if (!child.isMesh) return;
    // Keep the cached source intact when a displayed instance is disposed.
    child.geometry = child.geometry.clone();
    child.material = Array.isArray(child.material)
      ? child.material.map((material) => material.clone()) : child.material.clone();
    child.castShadow = true;
    child.receiveShadow = true;
    child.userData.nonMaterialEditable = true;
  });
  const group = new THREE.Group();
  group.name = "Bouteille 1 L ROSEBUDS";
  group.add(bottle);
  // glTF lengths are in meters; the plug scale is stored in scene units per mm.
  bottle.scale.multiplyScalar(1000 * unitsPerMillimeter);
  const bounds = new THREE.Box3().setFromObject(bottle);
  const center = bounds.getCenter(new THREE.Vector3());
  bottle.position.add(new THREE.Vector3(-center.x, floorY - bounds.min.y, -center.z));
  group.userData.referenceHeightMm = bounds.max.y / unitsPerMillimeter - bounds.min.y / unitsPerMillimeter;
  return group;
}
