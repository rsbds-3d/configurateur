const MODEL_ID = "Xenova/swin2SR-classical-sr-x2-64";
let enhancerPromise = null;

self.addEventListener("message", async (event) => {
  const message = event.data || {};
  if (message.type !== "enhance" || !message.blob) return;
  try {
    const enhancer = await getEnhancer(message.id);
    postProgress(message.id, 78, "Super-résolution IA locale…");
    const sourceUrl = URL.createObjectURL(message.blob);
    let output;
    try {
      output = await enhancer(sourceUrl);
    } finally {
      URL.revokeObjectURL(sourceUrl);
    }
    const image = Array.isArray(output) ? output[0] : output;
    if (!image?.data || !image.width || !image.height) throw new Error("Image IA vide");
    const rgba = image.channels === 4 ? image : await image.rgba();
    const pixels = new Uint8ClampedArray(rgba.data);
    postProgress(message.id, 98, "Finalisation de l’image optimisée…");
    self.postMessage({ type: "result", id: message.id, width: rgba.width, height: rgba.height, pixels }, [pixels.buffer]);
  } catch (error) {
    self.postMessage({ type: "error", id: message.id, message: error?.message || String(error) });
  }
});

async function getEnhancer(id) {
  if (!enhancerPromise) {
    enhancerPromise = (async () => {
      postProgress(id, 8, "Chargement du modèle open source Swin2SR…");
      const { env, pipeline } = await import("https://cdn.jsdelivr.net/npm/@huggingface/transformers@3.8.1");
      env.useBrowserCache = true;
      return pipeline("image-to-image", MODEL_ID, {
        device: self.navigator?.gpu ? "webgpu" : "wasm",
        progress_callback: (info) => {
          const progress = Number.isFinite(info?.progress) ? Math.round(10 + info.progress * 0.58) : 12;
          postProgress(id, progress, info?.status === "progress" ? "Téléchargement initial du modèle Swin2SR…" : "Préparation de l’IA d’image…");
        },
      });
    })().catch((error) => {
      enhancerPromise = null;
      throw error;
    });
  }
  return enhancerPromise;
}

function postProgress(id, progress, label) {
  self.postMessage({ type: "progress", id, progress: Math.max(0, Math.min(100, progress)), label });
}
