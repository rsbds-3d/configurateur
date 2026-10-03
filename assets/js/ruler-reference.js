import * as THREE from "three";

export function getRulerSideOffset(modelBox, rulerBox, angle, margin) {
  const axis = { x: Math.cos(angle), z: Math.sin(angle) };
  const side = { x: -axis.z, z: axis.x };
  const project = (box, direction) => {
    const values = [box.min.x, box.max.x].flatMap((x) =>
      [box.min.z, box.max.z].map((z) => x * direction.x + z * direction.z));
    return { min: Math.min(...values), max: Math.max(...values) };
  };
  const along = project(modelBox, axis).min - project(rulerBox, axis).min;
  const across = project(modelBox, side).max - project(rulerBox, side).min + margin;
  return new THREE.Vector3(axis.x * along + side.x * across, 0, axis.z * along + side.z * across);
}

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
