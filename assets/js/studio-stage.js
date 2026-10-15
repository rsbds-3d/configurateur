import * as THREE from "three";

export function stageLayout(box, margin = 0.1) {
  const size = box.getSize(new THREE.Vector3());
  const center = box.getCenter(new THREE.Vector3());
  const diameter = Math.max(0.1, Math.hypot(size.x, size.z)) * (1 + 2 * margin);
  return { radius: diameter / 2, height: Math.max(size.y * 1.6, diameter), center };
}

export function createStageGeometry(layout, family, contactBoxes = []) {
  const relief = family === "silk" || family === "fur" || family === "velvet";
  if (!relief) return new THREE.CircleGeometry(layout.radius, 128);
  const rings = 40, sectors = 128;
  const positions = [], uv = [], indices = [];
  const amplitude = layout.radius * (family === "fur" ? 0.009 : 0.025);
  const append = (x, y) => {
    const wx = layout.center.x + x, wz = layout.center.z - y;
    let compression = 1;
    for (const box of contactBoxes) {
      const dx = Math.max(box.min.x - wx, 0, wx - box.max.x);
      const dz = Math.max(box.min.z - wz, 0, wz - box.max.z);
      compression = Math.min(compression, Math.min(1, Math.hypot(dx, dz) / (layout.radius * 0.12)));
    }
    const wave = Math.sin(x / layout.radius * 15 + y / layout.radius * 4)
      * Math.cos(y / layout.radius * 11 - x / layout.radius * 2);
    const height = -amplitude * (1 + wave) * compression;
    positions.push(x, y, height);
    uv.push(0.5 + x / (layout.radius * 2), 0.5 + y / (layout.radius * 2));
  };
  append(0, 0);
  for (let ring = 1; ring <= rings; ring++) {
    const radius = layout.radius * ring / rings;
    for (let sector = 0; sector <= sectors; sector++) {
      const angle = 2 * Math.PI * sector / sectors;
      append(radius * Math.cos(angle), radius * Math.sin(angle));
    }
  }
  for (let sector = 0; sector < sectors; sector++) indices.push(0, sector + 1, sector + 2);
  for (let ring = 1; ring < rings; ring++) {
    const inner = 1 + (ring - 1) * (sectors + 1), outer = inner + sectors + 1;
    for (let sector = 0; sector < sectors; sector++) {
      indices.push(inner + sector, outer + sector, outer + sector + 1,
        inner + sector, outer + sector + 1, inner + sector + 1);
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute("uv", new THREE.Float32BufferAttribute(uv, 2));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  return geometry;
}
