const MODEL_ID = "onnx-community/gemma-3-270m-it-ONNX";
let generatorPromise = null;

self.addEventListener("message", async (event) => {
  const message = event.data || {};
  if (message.type !== "analyze") return;
  try {
    const generator = await getGenerator(message.id);
    const prompt = buildInstruction(message.prompt, message.schema, message.fallback);
    postProgress(message.id, 82, "Le modèle local interprète votre description…");
    const output = await generator(prompt, {
      max_new_tokens: 160,
      do_sample: false,
      repetition_penalty: 1.05,
    });
    const generated = readGeneratedText(output);
    const state = sanitizeState(extractJson(generated), message.schema);
    postProgress(message.id, 100, "Recherche IA terminée.");
    self.postMessage({ type: "result", id: message.id, state });
  } catch (error) {
    self.postMessage({ type: "error", id: message.id, message: error?.message || String(error) });
  }
});

async function getGenerator(id) {
  if (!generatorPromise) {
    generatorPromise = (async () => {
      postProgress(id, 4, "Chargement de l’IA locale open source…");
      const { env, pipeline } = await import("https://cdn.jsdelivr.net/npm/@huggingface/transformers@3.8.1");
      env.useBrowserCache = true;
      return pipeline("text-generation", MODEL_ID, {
        dtype: "q4",
        device: self.navigator?.gpu ? "webgpu" : "wasm",
        progress_callback: (info) => {
          const progress = Number.isFinite(info?.progress) ? Math.round(8 + info.progress * 0.68) : 10;
          postProgress(id, progress, info?.status === "progress" ? "Téléchargement initial du modèle IA…" : "Préparation du modèle IA…");
        },
      });
    })().catch((error) => {
      generatorPromise = null;
      throw error;
    });
  }
  return generatorPromise;
}

function buildInstruction(userPrompt, schema = {}, fallback = {}) {
  const allowed = Object.fromEntries(Object.entries(schema).map(([key, options]) => [key, (options || []).map((option) => option.id)]));
  return `Tu aides à filtrer un catalogue Rosebuds. Réponds uniquement par un objet JSON compact.\nChamps autorisés: family, head, plugSize, crystalSize, metal, metalFinish, ornament, ornamentFinish.\nValeurs autorisées: ${JSON.stringify(allowed)}\nAnalyse rapide déjà obtenue: ${JSON.stringify(fallback)}\nDescription utilisateur: ${JSON.stringify(userPrompt)}\nJSON:`;
}

function readGeneratedText(output) {
  const value = output?.[0]?.generated_text ?? output?.generated_text ?? "";
  if (Array.isArray(value)) return value[value.length - 1]?.content || JSON.stringify(value);
  return String(value);
}

function extractJson(text) {
  const matches = String(text).match(/\{[\s\S]*?\}/g) || [];
  for (let index = matches.length - 1; index >= 0; index -= 1) {
    try { return JSON.parse(matches[index]); } catch { /* Try the previous object. */ }
  }
  return {};
}

function sanitizeState(state, schema = {}) {
  const clean = {};
  for (const [key, value] of Object.entries(state || {})) {
    const allowed = new Set((schema[key] || []).map((option) => String(option.id)));
    if (allowed.has(String(value))) clean[key] = String(value);
  }
  return clean;
}

function postProgress(id, progress, label) {
  self.postMessage({ type: "progress", id, status: "loading", progress: Math.max(0, Math.min(100, progress)), label });
}
