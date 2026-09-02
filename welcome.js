(function () {
  "use strict";

  const VIEWER_VERSION = "20260902-release-v03";
  const ALUMINUM_FINISHES_BY_SIZE_CLASS = Object.freeze({
    SMALL: Object.freeze(["aluminum-gray", "aluminum-black", "aluminum-red", "aluminum-violet"]),
    MEDIUM: Object.freeze(["aluminum-gray", "aluminum-black", "aluminum-red", "aluminum-violet", "aluminum-pink", "aluminum-green", "aluminum-blue", "aluminum-gold", "aluminum-orange"]),
    LARGE: Object.freeze(["aluminum-black", "aluminum-red"]),
    XL: Object.freeze(["aluminum-black", "aluminum-red", "aluminum-violet", "aluminum-orange"]),
    XXL: Object.freeze(["aluminum-black", "aluminum-red", "aluminum-violet", "aluminum-orange"]),
    XXXL: Object.freeze(["aluminum-black", "aluminum-red", "aluminum-violet", "aluminum-orange"]),
  });
  const ALUMINUM_FINISHES_BY_MODEL_FAMILY = Object.freeze({
    "NEW SMALL": Object.freeze(["aluminum-black"]),
  });
  const STAINLESS_FINISHES_BY_SIZE_CLASS = Object.freeze({
    SMALL: Object.freeze(["stainless-mirror-silver"]),
    MEDIUM: Object.freeze(["stainless-mirror-silver", "stainless-flash-gold-1-micron"]),
    LARGE: Object.freeze(["stainless-mirror-silver"]),
    XL: Object.freeze(["stainless-mirror-silver"]),
    XXL: Object.freeze(["stainless-mirror-silver"]),
    XXXL: Object.freeze(["stainless-mirror-silver"]),
  });
  const CRYSTAL_FINISH_RULES = Object.freeze({
    SMALL_18: Object.freeze(["Aurore Boreale", "Clear", "Aquamarine"]),
    SMALL: Object.freeze(["Clear", "Aurore Boreale"]),
    NEW: Object.freeze(["Aurore Boreale", "Clear", "Golden Shadow", "Smoked topaze"]),
    XL_35: Object.freeze(["Clear", "Jet"]),
    XXL_35: Object.freeze(["Clear", "Jet"]),
  });
  const CLASSIC_MODELS_WITH_HEAD = new Set([
    "plug-classique-large-35",
    "plug-classique-medium",
    "plug-classique-small-18",
    "plug-classique-small",
    "plug-classique-xl-35",
    "plug-classique-xl-45-avec-assiette",
    "plug-classique-xl",
    "plug-classique-xxl-35",
    "plug-classique-xxl",
    "plug-classique-xxxl-60",
    "plug-classique-xxxl-70",
    "plug-classique-xxxl-80",
    "plug-classique-xxxl-90",
    "plug-classique-xxxl-100",
  ]);
  const CLASSIC_MODELS_WITHOUT_HEAD = new Set([
    "plug-classique-55-sans-tete",
    "plug-classique-67-sans-tete",
    "plug-classique-large-35-sans-tete",
    "plug-classique-medium-30-sans-tete",
    "plug-classique-xl-45-sans-tete",
    "plug-classique-xxl-50-sans-tete",
    "plug-classique-xxxl-60-sans-tete",
  ]);
  const params = new URLSearchParams(window.location.search);

  if (params.get("viewer") === "1") {
    startViewer();
    return;
  }

  startWelcome();

  function startViewer() {
    const welcome = document.querySelector("#welcome-screen");
    const app = document.querySelector("#app");
    document.body.classList.remove("is-welcome");
    document.body.classList.add("is-viewer");
    if (params.get("thumbnail") === "1") document.body.classList.add("is-thumbnail-capture");
    if (welcome) welcome.hidden = true;
    if (app) app.hidden = false;

    const stylesheet = document.createElement("link");
    stylesheet.rel = "stylesheet";
    stylesheet.href = `./style.css?v=${VIEWER_VERSION}`;
    stylesheet.id = "viewer-style";
    document.head.appendChild(stylesheet);

    const loadApplication = () => import(`./app.js?v=${VIEWER_VERSION}`).catch((error) => {
      console.error("Impossible de charger le viewer 3D.", error);
      document.body.dataset.viewerError = "true";
    });
    stylesheet.addEventListener("load", loadApplication, { once: true });
    stylesheet.addEventListener("error", loadApplication, { once: true });
  }

  function startWelcome() {
    const stepsRoot = document.querySelector("#welcome-steps");
    const results = document.querySelector("#welcome-results");
    const gallery = document.querySelector("#welcome-gallery");
    const count = document.querySelector("#welcome-results-count");
    const progressValue = document.querySelector("#welcome-progress-value");
    const progressBar = document.querySelector("#welcome-progress-bar");
    if (!stepsRoot || !results || !gallery) return;

    const models = readModels();
    const state = {
      family: "",
      head: "",
      size: "",
      metal: "",
      metalFinish: "",
      ornament: "",
      ornamentFinish: "",
    };

    const metalFamilies = [
      { id: "alu", label: "Aluminium", description: "Léger et contemporain, avec des couleurs anodisées adaptées à chaque modèle.", visual: "metal-alu" },
      { id: "inox", label: "Inox", description: "Dense et durable : poli miroir, ou flash or sur les modèles MEDIUM.", visual: "metal-inox" },
    ];
    const modelFamilies = [
      {
        id: "Classique",
        label: "Classique",
        description: "Profil historique Rosebuds, avec une assiette affirmée et un corps généreux.",
        visual: "profile-classic",
      },
      {
        id: "NEW MEDIUM",
        label: "NEW MEDIUM",
        description: "Profil intermédiaire à tige affinée, décliné pour plusieurs diamètres de cristal.",
        visual: "profile-new-medium",
      },
      {
        id: "NEW SMALL",
        label: "NEW SMALL",
        description: "Profil compact à tige fine, conçu autour du cristal de 18 mm.",
        visual: "profile-new-small",
      },
    ];
    const classicHeadOptions = [
      {
        id: "avec-tete",
        label: "Avec tête",
        description: "Le plug comprend une tête destinée à recevoir un cristal, une gemme ou un décor.",
        visual: "profile-with-head",
      },
      {
        id: "sans-tete",
        label: "Sans tête",
        description: "Le corps du plug reste nu, sans tête ni logement d'ornement.",
        visual: "profile-without-head",
      },
    ];
    const metalFinishes = {
      alu: [
        ["aluminum-gray", "Gris", "#8c9194"], ["aluminum-black", "Noir", "#17191a"], ["aluminum-red", "Rouge", "#9d2725"],
        ["aluminum-violet", "Violet", "#7253a5"], ["aluminum-pink", "Rose", "#c67f94"], ["aluminum-green", "Vert", "#48775c"],
        ["aluminum-blue", "Bleu", "#315f92"], ["aluminum-gold", "Or", "#c89b47"], ["aluminum-orange", "Orange", "#c76528"],
      ],
      inox: [
        ["stainless-mirror-silver", "Poli miroir", "#d9dddc"],
        ["stainless-flash-gold-1-micron", "Flash or 1 micron", "#c9a64d"],
      ],
    };
    const ornaments = {
      crystal: { label: "Cristal", description: "Cristal facetté transparent, vif et lumineux.", visual: "ornament-crystal" },
      gem: { label: "Gem / pierre précieuse", description: "Cabochon naturel avec profondeur, couleur et inclusions subtiles.", visual: "ornament-gem" },
      "pressed-glass": { label: "Verre pressé", description: "Cabochon coloré transparent à l'éclat doux.", visual: "ornament-glass" },
      bronze: { label: "Ornement bronze", description: "Décor métallique sculpté, poli ou patiné.", visual: "ornament-bronze" },
      none: { label: "Sans ornement", description: "Plug métallique seul, sans pierre ni décor rapporté.", visual: "ornament-none" },
    };
    const ornamentFinishes = {
      crystal: [
        ["Clear", "Clear", "#eaf8ff"], ["Aurore Boreale", "Aurore Boreale", "#d8b8ea"], ["Aquamarine", "Aquamarine", "#78d7ed"],
        ["Pink", "Pink", "#ed8eb5"], ["Jet", "Jet", "#1c1c22"], ["Majestic Blue", "Majestic Blue", "#2e4cc1"],
        ["Emerald", "Emerald", "#1b9560"], ["Heliotrope", "Heliotrope", "#6e408e"], ["Mandarine", "Mandarine", "#e7792f"],
        ["Volcano", "Volcano", "#b84d58"], ["Chrysolite", "Chrysolite", "#a8ce68"], ["Red Magma", "Red Magma", "#a72d30"],
        ["Vitrail", "Vitrail", "#69a6a3"], ["Spring", "Spring", "#8ac67a"], ["Smoked topaze", "Smoked topaze", "#8d6e56"],
        ["Golden Shadow", "Golden Shadow", "#cdb881"], ["Ocean", "Ocean", "#317b9e"], ["Citrine Shimmer", "Citrine Shimmer", "#d7b242"],
        ["Sunshine Shimmer", "Sunshine Shimmer", "#e9c94f"], ["Siam Shimmer", "Siam Shimmer", "#b2354b"],
        ["Black diamond Shimmer", "Black diamond Shimmer", "#53545c"], ["Peridot Shimmer", "Peridot Shimmer", "#8fbd54"],
        ["Cobalt Shimmer", "Cobalt Shimmer", "#2f58ba"], ["Silk Shimmer", "Silk Shimmer", "#e3c5b5"],
        ["Tangerine Shimmer", "Tangerine Shimmer", "#e67a45"], ["Cristal Shine", "Cristal Shine", "#f4fbff"],
        ["Violet Blue", "Violet Blue", "#6754b7"], ["Fuschia", "Fuschia", "#c83d8e"], ["Silver Night", "Silver Night", "#555967"],
        ["Topaze", "Topaze", "#d99a4f"], ["Capriblue", "Capriblue", "#1986b8"], ["Purple", "Purple", "#793d9c"],
      ],
      gem: [
        ["Blue Agata", "Agate bleue", "#4b77a8"], ["Red Agata", "Agate rouge", "#a13d38"], ["Green Agate", "Agate verte", "#4b885d"],
        ["Rhodochrosite", "Rhodochrosite", "#d27988"], ["Malachite", "Malachite", "#237c52"], ["Tiger Eye", "Œil-de-tigre", "#9a6531"],
        ["Onyx", "Onyx", "#171719"], ["Quartz", "Quartz", "#e8e4df"], ["Rubis", "Rubis", "#9d1535"],
        ["Saphir", "Saphir", "#2452b2"], ["Émeraude", "Émeraude", "#16845a"], ["Diamant", "Diamant", "#edf8ff"],
      ],
      "pressed-glass": [
        ["Outremer", "Outremer", "#254ca5"], ["Red", "Rouge", "#b53639"], ["Green", "Vert", "#3a925d"],
        ["Topaze", "Topaze", "#c8843e"], ["Jet cabochon", "Jet", "#202126"], ["Purple cabochon", "Pourpre", "#744394"],
        ["Aquamarine cabochon", "Aigue-marine", "#68c9dc"],
      ],
      bronze: [
        ["Bronze poli", "Bronze poli", "#bd7d3f"], ["Bronze patiné", "Bronze patiné", "#507e70"], ["Bronze doré", "Bronze doré", "#cc9d45"],
      ],
      none: [["none", "Sans finition", "#5f5d58"]],
    };

    const questionDefinitions = [
      {
        key: "family",
        eyebrow: "01 · Modèle",
        title: "Quel modèle de plug recherchez-vous ?",
        description: "Choisissez d’abord la silhouette. La vue de profil distingue les proportions de l’assiette, de la tige et du corps.",
        options: () => modelFamilies.filter((family) => models.some((model) => model.family === family.id)),
      },
      {
        key: "head",
        eyebrow: "Tête du plug",
        title: "Votre modèle classique doit-il avoir une tête ?",
        description: "Ce choix distingue les modèles complets avec logement d'ornement des corps de plug sans tête.",
        visible: () => state.family === "Classique",
        options: () => classicHeadOptions,
      },
      {
        key: "size",
        eyebrow: "02 · Taille du cristal",
        title: "Quelle taille de cristal recherchez-vous ?",
        description: "Le diamètre du cristal détermine les géométries de plug et les ornements réellement disponibles.",
        options: () => sortPhysicalSizes(unique(models
          .filter((model) => model.family === state.family && matchesClassicHead(model, state.family, state.head))
          .map((model) => model.size))).map((size) => ({
          id: size, label: size, description: describeSize(size), visual: `size-${size.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`,
        })),
      },
      {
        key: "metal",
        eyebrow: "03 · Corps du plug",
        title: "Quel métal souhaitez-vous ?",
        description: "Le matériau pilote le poids visuel, les reflets et la gamme de finitions.",
        options: () => metalFamilies.filter((family) => getCandidateModels(models, state)
          .some((model) => modelSupportsMetalFamily(model, family.id))),
      },
      {
        key: "metalFinish",
        eyebrow: "04 · Finition du métal",
        title: "Quelle finition doit recevoir le plug ?",
        description: "Chaque échantillon correspond au matériau qui sera appliqué dans le viewer.",
        options: () => getAvailableMetalFinishes(models, state, metalFinishes)
          .map(([id, label, color]) => ({ id, label, color, description: finishDescription(id) })),
      },
      {
        key: "ornament",
        eyebrow: "05 · Ornement",
        title: "Quel type d'ornement souhaitez-vous ?",
        description: "Seuls les ornements présents dans au moins un modèle de cette taille sont proposés.",
        options: () => availableOrnaments(models, state.family, state.head, state.size, state.metal).map((id) => ({ id, ...ornaments[id] })),
      },
      {
        key: "ornamentFinish",
        eyebrow: "06 · Couleur et matière",
        title: "Quelle finition d'ornement vous convient ?",
        description: "La teinte sera transmise au rendu optique du cristal, de la gemme ou du décor.",
        options: () => getAvailableOrnamentFinishes(models, state, ornamentFinishes)
          .map(([id, label, color]) => ({ id, label, color, description: ornamentFinishDescription(state.ornament) })),
      },
    ];

    stepsRoot.addEventListener("click", (event) => {
      const button = event.target.closest("[data-welcome-choice]");
      if (!button) return;
      const key = button.dataset.key;
      const value = button.dataset.value;
      const definitionIndex = questionDefinitions.findIndex((question) => question.key === key);
      if (definitionIndex < 0) return;
      state[key] = value;
      questionDefinitions.slice(definitionIndex + 1).forEach((question) => { state[question.key] = ""; });
      render();
      requestAnimationFrame(() => {
        const activeIndex = getActiveQuestions().findIndex((question) => question.key === key);
        const next = stepsRoot.querySelector(`[data-step-index="${activeIndex + 1}"]`);
        next?.scrollIntoView({ behavior: "smooth", block: "center" });
      });
    });

    gallery.addEventListener("click", (event) => {
      const button = event.target.closest("[data-open-model]");
      if (!button) return;
      openViewer(button.dataset.openModel);
    });

    render();

    function render() {
      const activeQuestions = getActiveQuestions();
      let visibleQuestions = 1;
      for (let index = 0; index < activeQuestions.length - 1; index += 1) {
        if (state[activeQuestions[index].key]) visibleQuestions = index + 2;
      }
      const completed = activeQuestions.every((question) => state[question.key]);
      if (completed) visibleQuestions = activeQuestions.length;

      stepsRoot.innerHTML = activeQuestions.slice(0, visibleQuestions).map((question, index) => {
        const options = question.options();
        return `<section class="welcome-step${state[question.key] ? " is-answered" : ""}" data-step-index="${index}">
          <div class="welcome-step-copy">
            <p class="welcome-kicker">${escapeHtml(formatQuestionEyebrow(question, index))}</p>
            <h2>${escapeHtml(question.title)}</h2>
            <p>${escapeHtml(question.description)}</p>
          </div>
          <div class="welcome-options welcome-options--${escapeHtml(question.key)}">
            ${options.map((option) => renderChoice(question.key, option, state[question.key] === option.id)).join("")}
          </div>
        </section>`;
      }).join("");

      const answered = activeQuestions.filter((question) => state[question.key]).length;
      const shownStep = Math.min(answered + 1, activeQuestions.length);
      progressValue.textContent = completed ? "Configuration complète" : `Étape ${shownStep} sur ${activeQuestions.length}`;
      progressBar.style.width = `${Math.max(8, (answered / activeQuestions.length) * 100)}%`;
      renderResults(completed);
    }

    function renderResults(completed) {
      results.hidden = !completed;
      if (!completed) return;
      const compatible = models.filter((model) => model.family === state.family
        && matchesClassicHead(model, state.family, state.head)
        && model.size === state.size
        && modelSupportsMetalFinish(model, state.metal, state.metalFinish)
        && modelSupportsOrnament(model, state.ornament, state.metal)
        && modelSupportsOrnamentFinish(model, state.ornament, state.ornamentFinish));
      count.textContent = `${compatible.length} modèle${compatible.length > 1 ? "s" : ""}`;
      gallery.innerHTML = compatible.length ? compatible.map((model) => {
        const finish = getSelectedLabel(ornamentFinishes[state.ornament], state.ornamentFinish);
        const metal = getSelectedLabel(metalFinishes[state.metal], state.metalFinish);
        return `<button type="button" class="welcome-model" data-open-model="${escapeHtml(model.id)}">
          <span class="welcome-model-visual">
            <img src="./assets/previews/models/${escapeHtml(model.id)}.png?v=${VIEWER_VERSION}" alt="Vue 3D en perspective du ${escapeHtml(model.label)}" loading="lazy" decoding="async" />
          </span>
          <span class="welcome-model-copy">
            <strong>${escapeHtml(model.label)}</strong>
            <small>${escapeHtml(`${model.family} · ${state.size} · ${metal} · ${finish}`)}</small>
          </span>
          <span class="welcome-model-action">Ouvrir le viewer 3D</span>
        </button>`;
      }).join("") : '<p class="welcome-empty">Aucune géométrie ne correspond à cette combinaison.</p>';
    }

    function renderChoice(key, option, selected) {
      const style = option.color ? ` style="--choice-color:${escapeHtml(option.color)}"` : "";
      const visualClass = option.visual || (option.color ? "color-swatch" : "choice-generic");
      return `<button type="button" class="welcome-choice${selected ? " is-selected" : ""}" data-welcome-choice data-key="${escapeHtml(key)}" data-value="${escapeHtml(option.id)}" aria-pressed="${selected}"${style}>
        <span class="welcome-choice-visual ${escapeHtml(visualClass)}" aria-hidden="true"><i></i></span>
        <span class="welcome-choice-copy"><strong>${escapeHtml(option.label)}</strong><small>${escapeHtml(option.description || "")}</small></span>
        <span class="welcome-choice-check" aria-hidden="true">✓</span>
      </button>`;
    }

    function getFinishColor(id) {
      const all = [...Object.values(metalFinishes).flat(), ...Object.values(ornamentFinishes).flat()];
      return all.find(([value]) => value === id)?.[2] || "#d8d5cb";
    }

    function openViewer(modelId) {
      const url = new URL(window.location.href);
      url.search = "";
      url.searchParams.set("viewer", "1");
      url.searchParams.set("catalogModel", modelId);
      url.searchParams.set("modelFamily", state.family);
      url.searchParams.set("classicHead", state.head);
      url.searchParams.set("metalFamily", state.metal);
      url.searchParams.set("metalFinish", state.metalFinish);
      url.searchParams.set("ornament", state.ornament);
      url.searchParams.set("ornamentFinish", state.ornamentFinish);
      window.location.assign(url.toString());
    }

    function getActiveQuestions() {
      return questionDefinitions.filter((question) => !question.visible || question.visible());
    }

    function formatQuestionEyebrow(question, index) {
      const label = question.eyebrow.replace(/^\d+\s*·\s*/, "");
      return `${String(index + 1).padStart(2, "0")} · ${label}`;
    }
  }

  function readModels() {
    return Array.from(document.querySelectorAll("#jewel-model option"))
      .map((option) => {
        const label = option.textContent.trim();
        const normalized = normalize(label);
        const ornaments = [];
        if (normalized.includes("cristal")) ornaments.push("crystal");
        if (normalized.includes("cabochon")) ornaments.push("gem", "pressed-glass");
        if (normalized.includes("avec pierre") || normalized.includes("avec assiette")) {
          ornaments.push("crystal");
          if (getMetalSizeClass(label) === "SMALL") ornaments.push("gem", "pressed-glass");
        }
        if (normalized.includes("bronze")) ornaments.push("bronze");
        if (!ornaments.length) ornaments.push("none");
        return {
          id: option.value,
          label,
          size: getPhysicalSize(label),
          family: getModelFamily(label),
          head: getModelHead(option.value),
          metalSizeClass: getMetalSizeClass(label),
          ornaments: unique(ornaments),
          previewClass: normalized.includes("new medium") ? "is-new-medium" : normalized.includes("new small") ? "is-new-small" : "is-classic",
        };
      })
      .filter((model) => model.id.startsWith("plug-") && model.id !== "plug-decalcomanie");
  }

  function getPhysicalSize(label) {
    const text = normalize(label).toUpperCase();
    if (text.includes("NEW SMALL")) return "18 mm";
    const explicitDiameter = text.match(/\b(100|90|80|70|67|60|55|50|45|35|30|18)\b/)?.[1];
    if (explicitDiameter) return `${explicitDiameter} mm`;
    if (text.includes("SMALL")) return "18 mm";
    if (text.includes("MEDIUM")) return "30 mm";
    return "Autre";
  }

  function getModelFamily(label) {
    const text = normalize(label).toUpperCase();
    if (text.includes("NEW SMALL")) return "NEW SMALL";
    if (text.includes("NEW MEDIUM")) return "NEW MEDIUM";
    return "Classique";
  }

  function getModelHead(id) {
    if (CLASSIC_MODELS_WITH_HEAD.has(id)) return "avec-tete";
    if (CLASSIC_MODELS_WITHOUT_HEAD.has(id)) return "sans-tete";
    return "";
  }

  function matchesClassicHead(model, family, head) {
    return family !== "Classique" || !head || model.head === head;
  }

  function getMetalSizeClass(label) {
    const text = normalize(label).toUpperCase();
    if (text.includes("NEW SMALL")) return "SMALL";
    if (text.includes("NEW MEDIUM")) return "MEDIUM";
    for (const sizeClass of ["XXXL", "XXL", "XL", "LARGE", "MEDIUM", "SMALL"]) {
      if (new RegExp(`\\b${sizeClass}\\b`).test(text)) return sizeClass;
    }
    return "";
  }

  function getCandidateModels(models, state) {
    return models.filter((model) => model.family === state.family
      && matchesClassicHead(model, state.family, state.head)
      && (!state.size || model.size === state.size));
  }

  function getFinishRules(metalFamily, sizeClass, modelFamily = "") {
    if (metalFamily === "alu" && ALUMINUM_FINISHES_BY_MODEL_FAMILY[modelFamily]) {
      return ALUMINUM_FINISHES_BY_MODEL_FAMILY[modelFamily];
    }
    if (metalFamily === "alu") return ALUMINUM_FINISHES_BY_SIZE_CLASS[sizeClass];
    if (metalFamily === "inox") return STAINLESS_FINISHES_BY_SIZE_CLASS[sizeClass];
    return null;
  }

  function getAvailableMetalFinishes(models, state, finishesByMetal) {
    const finishes = finishesByMetal[state.metal] || [];
    const candidates = getCandidateModels(models, state)
      .filter((model) => modelSupportsMetalFamily(model, state.metal));
    const allowedIds = new Set();
    candidates.forEach((model) => {
      const rule = getFinishRules(state.metal, model.metalSizeClass, model.family);
      (rule || finishes.map(([id]) => id)).forEach((id) => allowedIds.add(id));
    });
    return finishes.filter(([id]) => allowedIds.has(id));
  }

  function modelSupportsMetalFamily(model, metalFamily) {
    if (metalFamily !== "alu") return true;
    return !(model.family === "Classique" && ["XXL", "XXXL"].includes(model.metalSizeClass));
  }

  function modelSupportsMetalFinish(model, metalFamily, finishId) {
    if (!modelSupportsMetalFamily(model, metalFamily)) return false;
    if (!finishId) return true;
    const rule = getFinishRules(metalFamily, model.metalSizeClass, model.family);
    return !rule || rule.includes(finishId);
  }

  function modelSupportsOrnament(model, ornament, metalFamily) {
    if (!model.ornaments.includes(ornament)) return false;
    if (["gem", "pressed-glass"].includes(ornament)) {
      const supportsCabochon = model.metalSizeClass === "SMALL"
        || model.family === "NEW SMALL"
        || model.family === "NEW MEDIUM";
      if (!supportsCabochon) return false;
    }
    return !(model.family === "NEW SMALL" && metalFamily === "alu" && ornament === "gem");
  }

  function getCrystalFinishRules(model) {
    const text = normalize(model.label).toUpperCase();
    if (/\b(?:XXXL|XXL)\s*50\b/.test(text)) return null;
    if (model.family === "NEW SMALL" || model.family === "NEW MEDIUM") return CRYSTAL_FINISH_RULES.NEW;
    if (/\bLARGE\s*35\b/.test(text)) return null;
    if (/\bXXL\s*35\b/.test(text)) return CRYSTAL_FINISH_RULES.XXL_35;
    if (/\bXL\s*35\b/.test(text)) return CRYSTAL_FINISH_RULES.XL_35;
    if (/\bSMALL\s*18\b/.test(text)) return CRYSTAL_FINISH_RULES.SMALL_18;
    if (/\bSMALL\b/.test(text)) return CRYSTAL_FINISH_RULES.SMALL;
    return null;
  }

  function modelSupportsOrnamentFinish(model, ornament, finishId) {
    if (!finishId || ornament !== "crystal") return true;
    const rules = getCrystalFinishRules(model);
    return !rules || rules.includes(finishId);
  }

  function getAvailableOrnamentFinishes(models, state, finishesByOrnament) {
    const finishes = finishesByOrnament[state.ornament] || [];
    if (state.ornament !== "crystal") return finishes;
    const candidates = getCandidateModels(models, state)
      .filter((model) => modelSupportsMetalFinish(model, state.metal, state.metalFinish))
      .filter((model) => modelSupportsOrnament(model, state.ornament, state.metal));
    return finishes.filter(([id]) => candidates.some((model) => modelSupportsOrnamentFinish(model, state.ornament, id)));
  }

  function sortPhysicalSizes(sizes) {
    return [...sizes].sort((left, right) => {
      if (left === "Autre") return 1;
      if (right === "Autre") return -1;
      return Number.parseFloat(left) - Number.parseFloat(right);
    });
  }

  function availableOrnaments(models, family, head, size, metalFamily) {
    const found = unique(models
      .filter((model) => model.family === family && matchesClassicHead(model, family, head) && model.size === size
        && modelSupportsMetalFamily(model, metalFamily))
      .flatMap((model) => model.ornaments.filter((ornament) => modelSupportsOrnament(model, ornament, metalFamily))));
    return ["crystal", "gem", "pressed-glass", "bronze", "none"].filter((id) => found.includes(id));
  }

  function describeSize(size) {
    const diameter = size.match(/\d+/)?.[0];
    return diameter ? `Diamètre de référence ${diameter} mm. Plusieurs familles compatibles pourront être proposées.` : "Géométrie de plug disponible.";
  }

  function finishDescription(id) {
    if (id.includes("mirror")) return "Surface inox très polie aux reflets francs.";
    if (id.includes("flash-gold")) return "Dépôt or fin de 1 micron sur base inox.";
    return "Aluminium anodisé poli, coloré dans la masse visuelle.";
  }

  function ornamentFinishDescription(type) {
    if (type === "crystal") return "Cristal transparent avec dispersion et feux colorés.";
    if (type === "gem") return "Pierre paramétrique avec absorption et réflexion internes.";
    if (type === "pressed-glass") return "Verre pressé transparent à saturation contrôlée.";
    if (type === "bronze") return "Métal décoratif avec relief et patine.";
    return "Modèle sans ornement.";
  }

  function getSelectedLabel(options, id) {
    return (options || []).find(([value]) => value === id)?.[1] || id;
  }

  function unique(values) {
    return [...new Set(values.filter(Boolean))];
  }

  function normalize(value) {
    return String(value || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]+/gi, " ").trim().toLowerCase();
  }

  function escapeHtml(value) {
    return String(value ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
  }
})();
