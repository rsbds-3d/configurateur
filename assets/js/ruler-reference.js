import * as THREE from "three";

export function createRulerReference(source, unitsPerMillimeter, floorY = 0) {
  const ruler = source.clone(true);
  ruler.traverse((child) => {
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
  group.name = "Règle 20 cm ROSEBUDS";
  group.add(ruler);

  // glTF lengths are in meters; the plug scale is stored in scene units per mm.
  ruler.scale.multiplyScalar(1000 * unitsPerMillimeter);
  ruler.updateWorldMatrix(true, true);

  const bounds = new THREE.Box3().setFromObject(ruler);
  const center = bounds.getCenter(new THREE.Vector3());
  ruler.position.add(new THREE.Vector3(-center.x, floorY - bounds.min.y, -center.z));
  const size = bounds.getSize(new THREE.Vector3());
  group.userData.referenceLengthMm = size.x / unitsPerMillimeter;
  group.userData.referenceWidthMm = size.z / unitsPerMillimeter;
  group.userData.referenceHeightMm = size.y / unitsPerMillimeter;
  group.userData.graduatedLengthMm = 200;
  return group;
}
