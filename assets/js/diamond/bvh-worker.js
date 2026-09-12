import { BufferAttribute, BufferGeometry } from "../../vendor/three.module.js";
import { MeshBVH } from "../../vendor/three-mesh-bvh.module.js";

self.onmessage = ({ data }) => {
  const geometry = new BufferGeometry();
  try {
    geometry.setAttribute("position", new BufferAttribute(data.position, 3));
    if (data.index) geometry.setIndex(new BufferAttribute(data.index, 1));
    geometry.groups = data.groups;
    geometry.setDrawRange(data.drawRange.start, data.drawRange.count);
    let lastProgress = -1;
    const bvh = new MeshBVH(geometry, {
      maxLeafTris: 8,
      indirect: false,
      onProgress(value) {
        const percent = Math.floor(value * 100);
        if (percent !== lastProgress) {
          lastProgress = percent;
          self.postMessage({ type: "progress", value });
        }
      },
    });
    const serialized = MeshBVH.serialize(bvh, { cloneBuffers: false });
    const transfer = [...serialized.roots, serialized.index.buffer];
    if (serialized.indirectBuffer) transfer.push(serialized.indirectBuffer.buffer);
    self.postMessage({ type: "result", bvh: serialized }, transfer);
  } catch (error) {
    self.postMessage({ type: "error", message: String(error?.message || error) });
  } finally {
    geometry.dispose();
  }
};
