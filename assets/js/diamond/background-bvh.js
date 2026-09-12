export const abortError = () => new DOMException("Calcul optique annule", "AbortError");

export async function buildBVHInWorker(geometry, {
  signal,
  onProgress = () => {},
  createWorker = () => new Worker(new URL("./bvh-worker.js", import.meta.url), { type: "module" }),
  timeoutMs = 180000,
} = {}) {
  if (signal?.aborted) throw abortError();
  const attribute = geometry.getAttribute("position");
  if (!attribute || attribute.itemSize !== 3) throw new Error("Positions du maillage invalides");
  // Never transfer the live mesh buffers: the provisional rendering still uses them.
  const position = new Float32Array(attribute.count * 3);
  for (let start = 0; start < attribute.count; start += 8192) {
    if (signal?.aborted) throw abortError();
    for (let i = start; i < Math.min(start + 8192, attribute.count); i += 1) {
      position[i * 3] = attribute.getX(i);
      position[i * 3 + 1] = attribute.getY(i);
      position[i * 3 + 2] = attribute.getZ(i);
    }
    if (start + 8192 < attribute.count) await new Promise((resolve) => setTimeout(resolve, 0));
  }
  const index = geometry.index ? geometry.index.array.slice() : null;
  if (signal?.aborted) throw abortError();
  return new Promise((resolve, reject) => {
    let worker;
    let timer;
    let settled = false;
    const finish = (error, value) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      signal?.removeEventListener("abort", cancel);
      worker?.terminate();
      if (error) reject(error);
      else resolve(value);
    };
    const cancel = () => finish(abortError());
    signal?.addEventListener("abort", cancel, { once: true });
    try {
      worker = createWorker();
      worker.onmessage = ({ data }) => {
        if (settled) return;
        if (data.type === "progress") onProgress(Math.min(1, Math.max(0, data.value)));
        else if (data.type === "result") finish(null, data.bvh);
        else if (data.type === "error") finish(new Error(data.message));
      };
      worker.onerror = (event) => finish(new Error(event.message || "Worker BVH indisponible"));
      worker.onmessageerror = () => finish(new Error("Reponse du worker BVH illisible"));
      timer = setTimeout(() => finish(new Error("Delai du calcul BVH depasse")), timeoutMs);
      worker.postMessage({
        position,
        index,
        groups: geometry.groups.map(({ start, count, materialIndex }) => ({ start, count, materialIndex })),
        drawRange: { ...geometry.drawRange },
      }, index ? [position.buffer, index.buffer] : [position.buffer]);
    } catch (error) {
      finish(error);
    }
  });
}

export async function compileBeforeSwap({ renderer, candidate, camera, scene, renderTarget, isCurrent, install, dispose }) {
  let installed = false;
  try {
    if (!isCurrent()) throw abortError();
    if (!renderer.extensions.has("KHR_parallel_shader_compile")) {
      throw new Error("Compilation GPU en parallele non disponible sur ce navigateur");
    }
    // Compile the same variant used by EffectComposer, not the default framebuffer variant.
    const previousTarget = renderer.getRenderTarget();
    let compilation;
    try {
      renderer.setRenderTarget(renderTarget);
      compilation = renderer.compileAsync(candidate, camera, scene);
    } finally {
      renderer.setRenderTarget(previousTarget);
    }
    await compilation;
    if (!isCurrent()) throw abortError();
    installed = install();
    if (!installed) throw abortError();
  } finally {
    if (!installed) dispose();
  }
}
