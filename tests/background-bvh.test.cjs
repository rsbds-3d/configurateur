const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { pathToFileURL } = require("node:url");
const { Worker } = require("node:worker_threads");

async function main() {
  const url = (file) => pathToFileURL(path.join(__dirname, "..", file)).href;
  const THREE = await import(url("assets/vendor/three.module.js"));
  const { MeshBVH } = await import(url("assets/vendor/three-mesh-bvh.module.js"));
  const { buildBVHInWorker, compileBeforeSwap } = await import(url("assets/js/diamond/background-bvh.js"));
  const workerUrl = url("assets/js/diamond/bvh-worker.js");
  const nodeWorkerFactory = () => {
    const worker = new Worker(`
      const { parentPort } = require('node:worker_threads');
      globalThis.self = { postMessage: (data, transfer) => parentPort.postMessage(data, transfer) };
      import(${JSON.stringify(workerUrl)}).then(() => {
        parentPort.on('message', data => self.onmessage({data}));
      });
    `, { eval: true });
    const adapter = {
      postMessage: (data, transfers) => worker.postMessage(data, transfers),
      terminate: () => worker.terminate(),
    };
    worker.on("message", (data) => adapter.onmessage?.({ data }));
    worker.on("error", (error) => adapter.onerror?.(error));
    return adapter;
  };
  const geometry = new THREE.SphereGeometry(1, 96, 64);
  const original = geometry.attributes.position.array.slice();
  const originalIndex = geometry.index.array.slice();
  const reports = [];
  let heartbeats = 0;
  const timer = setInterval(() => heartbeats++, 1);
  const serialized = await buildBVHInWorker(geometry, { createWorker: nodeWorkerFactory, onProgress: (p) => reports.push(p) });
  clearInterval(timer);
  assert(heartbeats > 0, "Le fil principal doit continuer pendant la construction reelle du BVH");
  assert.deepEqual(geometry.attributes.position.array, original, "Le worker ne detache ni ne change les positions visibles");
  assert.deepEqual(geometry.index.array, originalIndex, "Les indices visibles restent intacts pendant le calcul");
  assert(reports.length > 0 && reports.at(-1) === 1, "Le worker remonte une vraie progression jusqu'a 100 %");
  assert(reports.every((p, i) => p >= 0 && p <= 1 && (!i || p >= reports[i - 1])));
  const bvh = MeshBVH.deserialize(serialized, geometry);
  assert(bvh.raycastFirst(new THREE.Ray(new THREE.Vector3(0, 0, 3), new THREE.Vector3(0, 0, -1)), THREE.DoubleSide));

  let terminated = 0;
  const controller = new AbortController();
  const pending = buildBVHInWorker(new THREE.BoxGeometry(), {
    signal: controller.signal,
    createWorker: () => ({ postMessage() {}, terminate() { terminated++; } }),
  });
  controller.abort();
  await assert.rejects(pending, { name: "AbortError" });
  assert.equal(terminated, 1, "Un changement de modele doit arreter le worker");
  await assert.rejects(buildBVHInWorker(new THREE.BoxGeometry(), {
    timeoutMs: 5,
    createWorker: () => ({ postMessage() {}, terminate() { terminated++; } }),
  }), /Delai/);
  assert.equal(terminated, 2, "Un worker muet doit etre arrete sans bloquer la vue");

  let finishCompilation;
  let current = true;
  let displayed = "preview";
  let disposed = 0;
  let target = "screen";
  const renderer = {
    extensions: { has: () => true },
    getRenderTarget: () => target,
    setRenderTarget: (value) => { target = value; },
    compileAsync() {
      assert.equal(target, "composer", "Compiler la variante du vrai pipeline de rendu");
      return new Promise((resolve) => { finishCompilation = resolve; });
    },
  };
  const options = {
    renderer, candidate: {}, camera: {}, scene: {}, renderTarget: "composer",
    isCurrent: () => current,
    install: () => { displayed = "raytracing"; return true; },
    dispose: () => { disposed++; },
  };
  const compilation = compileBeforeSwap(options);
  assert.equal(displayed, "preview", "Le rendu provisoire reste affiche pendant la compilation GPU");
  assert.equal(target, "screen", "Le rendu normal doit pouvoir continuer tout de suite");
  finishCompilation();
  await compilation;
  assert.equal(displayed, "raytracing");
  assert.equal(disposed, 0);
  displayed = "new-selection";
  const staleCompilation = compileBeforeSwap(options);
  current = false;
  finishCompilation();
  await assert.rejects(staleCompilation, { name: "AbortError" });
  assert.equal(displayed, "new-selection", "Un ancien resultat ne doit jamais remplacer la nouvelle selection");
  assert.equal(disposed, 1);
  current = true;
  renderer.extensions.has = () => false;
  await assert.rejects(compileBeforeSwap(options), /parallele/);
  assert.equal(displayed, "new-selection", "Sans compilation parallele, conserver le rendu rapide");
  const app = fs.readFileSync(path.join(__dirname, "..", "app.js"), "utf8");
  assert.match(app, /await buildDiamondBoundsTree\(geometry, controller.signal/);
  assert.match(app, /await waitForViewerIdle\(controller.signal/, "La compilation GPU doit attendre la fin des interactions");
  assert.match(app, /Rendu rapide interactif : finalisation en attente/, "La progression doit expliquer l'attente de la haute qualité");
  assert.match(app, /await ensureDiamondGpuBVHMaterial/);
  assert.match(app, /\.finally\(\(\) => finishLoading\(\)\)/, "Le chargement initial ne doit pas masquer la progression optique");
  console.log("Background BVH worker, responsiveness, compilation and cancellation tests OK");
}
main().catch((error) => { console.error(error); process.exitCode = 1; });
