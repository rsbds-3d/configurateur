export const abortError = () => new DOMException("Calcul optique annule", "AbortError");

const BVH_CACHE_DATABASE = "rosebuds-diamond-bvh-v1";
const BVH_CACHE_STORE = "trees";

function openBvhCacheDatabase() {
  if (!globalThis.indexedDB) return Promise.resolve(null);
  return new Promise((resolve) => {
    const request = indexedDB.open(BVH_CACHE_DATABASE, 1);
    request.onupgradeneeded = () => {
      if (!request.result.objectStoreNames.contains(BVH_CACHE_STORE)) {
        request.result.createObjectStore(BVH_CACHE_STORE);
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => resolve(null);
    request.onblocked = () => resolve(null);
  });
}

export const persistentBvhCache = {
  async get(key) {
    const database = await openBvhCacheDatabase();
    if (!database) return null;
    return new Promise((resolve) => {
      const transaction = database.transaction(BVH_CACHE_STORE, "readonly");
      const request = transaction.objectStore(BVH_CACHE_STORE).get(key);
      request.onsuccess = () => resolve(request.result || null);
      request.onerror = () => resolve(null);
      transaction.oncomplete = () => database.close();
      transaction.onerror = transaction.onabort = () => {
        database.close();
        resolve(null);
      };
    });
  },
  async set(key, value) {
    const database = await openBvhCacheDatabase();
    if (!database) return;
    await new Promise((resolve) => {
      const transaction = database.transaction(BVH_CACHE_STORE, "readwrite");
      transaction.objectStore(BVH_CACHE_STORE).put(value, key);
      transaction.oncomplete = resolve;
      transaction.onerror = resolve;
      transaction.onabort = resolve;
    });
    database.close();
  },
};

export async function buildBVHInWorker(geometry, {
  signal,
  onProgress = () => {},
  onCacheHit = () => {},
  cacheKey = "",
  cache = persistentBvhCache,
  createWorker = () => new Worker(new URL("./bvh-worker.js", import.meta.url), { type: "module" }),
  timeoutMs = 180000,
} = {}) {
  if (signal?.aborted) throw abortError();
  if (cacheKey && cache?.get) {
    const cached = await cache.get(cacheKey).catch(() => null);
    if (signal?.aborted) throw abortError();
    if (cached?.roots?.length && cached?.index) {
      onCacheHit();
      onProgress(1);
      return cached;
    }
  }
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
  const serialized = await new Promise((resolve, reject) => {
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
  if (cacheKey && cache?.set) Promise.resolve(cache.set(cacheKey, serialized)).catch(() => {});
  return serialized;
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
