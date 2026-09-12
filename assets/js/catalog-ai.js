const FIELD_ALIASES = Object.freeze({
  family: [
    ["NEW MEDIUM", ["new medium", "nouveau medium"]],
    ["NEW SMALL", ["new small", "nouveau small"]],
    ["Classique", ["originale", "original", "classique"]],
  ],
  head: [
    ["sans-tete", ["sans tete", "sans tête", "sans pierre", "sans ornement"]],
    ["avec-tete", ["avec tete", "avec tête"]],
  ],
  metal: [
    ["inox", ["inox", "acier inoxydable", "stainless steel", "stainless"]],
    ["alu", ["aluminium", " aluminum ", " alu "]],
  ],
  ornament: [
    ["pressed-glass", ["verre presse", "verre pressé", "pressed glass", "verre"]],
    ["gem", ["pierre precieuse", "pierre précieuse", "gemme", " gem "]],
    ["bronze", ["ornement bronze", "bronze"]],
    ["none", ["sans ornement", "sans pierre"]],
    ["crystal", ["cristal", "crystal"]],
  ],
});

export function normalizePrompt(value) {
  return ` ${String(value || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim()} `;
}

export function parseCatalogPrompt(prompt, schema = {}) {
  const text = normalizePrompt(prompt);
  const result = {};
  for (const [field, definitions] of Object.entries(FIELD_ALIASES)) {
    const match = definitions.find(([, aliases]) => aliases.some((alias) => text.includes(normalizePrompt(alias))));
    if (match) result[field] = match[0];
  }

  for (const field of ["metalFinish", "ornamentFinish"]) {
    const options = [...(schema[field] || [])]
      .filter((option) => option?.id && option?.label)
      .sort((left, right) => normalizePrompt(right.label).length - normalizePrompt(left.label).length);
    const match = options.find((option) => text.includes(normalizePrompt(option.label)) || text.includes(normalizePrompt(option.id)));
    if (match) result[field] = match.id;
  }

  const crystalMatch = text.match(/(?:cristal|crystal|pierre|gemme)\s+(?:de\s+)?(?:diametre\s+)?(\d+(?:[.,]\d+)?)\s*(?:mm)?/);
  if (crystalMatch) result.crystalSize = `${crystalMatch[1].replace(",", ".")} mm`;

  const plugOptions = [...(schema.plugSize || [])].sort((left, right) => String(right.label).length - String(left.label).length);
  const explicitPlug = text.match(/(?:plug|corps)\s+(?:de\s+)?(?:taille\s+)?([a-z]+)?\s*(\d+(?:[.,]\d+)?)?\s*(?:mm)?/);
  const plugMatch = plugOptions.find((option) => {
    const label = normalizePrompt(option.label);
    const diameter = String(option.diameter || "");
    return explicitPlug && ((explicitPlug[1] && label.includes(` ${explicitPlug[1]} `)) || (explicitPlug[2] && diameter === explicitPlug[2].replace(",", ".")));
  }) || plugOptions.find((option) => text.includes(normalizePrompt(option.label)) && (!option.diameter || text.includes(` ${option.diameter} `)));
  if (plugMatch) result.plugSize = plugMatch.id;
  return result;
}

export function createCatalogAiEngine({ onProgress = () => {} } = {}) {
  let worker = null;
  let requestId = 0;
  const pending = new Map();

  const ensureWorker = () => {
    if (worker) return worker;
    worker = new Worker(new URL("./catalog-ai-worker.js", import.meta.url), { type: "module" });
    worker.addEventListener("message", (event) => {
      const message = event.data || {};
      if (message.type === "progress") {
        onProgress(message);
        return;
      }
      const job = pending.get(message.id);
      if (!job) return;
      pending.delete(message.id);
      if (message.type === "result") job.resolve(message.state || {});
      else job.reject(new Error(message.message || "Analyse IA indisponible"));
    });
    worker.addEventListener("error", (event) => {
      for (const job of pending.values()) job.reject(event.error || new Error(event.message || "Worker IA interrompu"));
      pending.clear();
      worker?.terminate();
      worker = null;
    });
    return worker;
  };

  return {
    async analyze(prompt, schema) {
      const fallback = parseCatalogPrompt(prompt, schema);
      const id = ++requestId;
      try {
        const state = await new Promise((resolve, reject) => {
          pending.set(id, { resolve, reject });
          ensureWorker().postMessage({ type: "analyze", id, prompt, schema, fallback });
        });
        return { ...fallback, ...state };
      } catch (error) {
        onProgress({ type: "progress", status: "fallback", progress: 100, label: "Résultats préparés avec l’analyse locale rapide." });
        return fallback;
      }
    },
    dispose() {
      for (const job of pending.values()) job.reject(new Error("Analyse IA annulée"));
      pending.clear();
      worker?.terminate();
      worker = null;
    },
  };
}
