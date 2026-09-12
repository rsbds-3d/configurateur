import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { TransformControls } from "three/addons/controls/TransformControls.js";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { OBJLoader } from "three/addons/loaders/OBJLoader.js";
import { FBXLoader } from "three/addons/loaders/FBXLoader.js";
import { PLYLoader } from "three/addons/loaders/PLYLoader.js";
import { TDSLoader } from "three/addons/loaders/TDSLoader.js";
import { Rhino3dmLoader } from "three/addons/loaders/3DMLoader.js";
import { DRACOLoader } from "three/addons/loaders/DRACOLoader.js";
import { RoomEnvironment } from "three/addons/environments/RoomEnvironment.js";
import { DecalGeometry } from "three/addons/geometries/DecalGeometry.js";
import { EffectComposer } from "three/addons/postprocessing/EffectComposer.js";
import { RenderPass } from "three/addons/postprocessing/RenderPass.js";
import { UnrealBloomPass } from "three/addons/postprocessing/UnrealBloomPass.js";
import { BokehPass } from "three/addons/postprocessing/BokehPass.js";
import { MeshoptDecoder } from "meshoptimizer";
import { buildBVHInWorker, compileBeforeSwap, abortError } from "./assets/js/diamond/background-bvh.js";
import { attachDecalGesture } from "./assets/js/decal-gesture.js";
import { pointInPlacementFrame, placementInWorld } from "./assets/js/decal-placement.js";
import { buildViewerProductSummary, resolveRosebudsProductLink } from "./assets/js/rosebuds-product-link.js";

const canvas = document.querySelector("#jewel-canvas");
const loaderEl = document.querySelector("#loader");
const loaderProgressEl = document.querySelector("#loader-progress");
const loaderStageEl = document.querySelector("#loader-stage");
const loaderPercentEl = document.querySelector("#loader-percent");
const loaderProgressBarEl = loaderEl?.querySelector('[role="progressbar"]');
const noticeEl = document.querySelector("#notice");
const debugLog = [];
window.__jewelryDebugLog = debugLog;

let loadingProgress = 0;
let loadingHideTimer = 0;
let diamondCalculationProgressActive = false;
let diamondCalculationProgressTotal = 0;
let diamondCalculationProgressCompleted = 0;
let diamondWorkStarted = false;
let viewerInteractionActive = false;
let lastViewerInteractionAt = performance.now();

function noteViewerInteraction(active = viewerInteractionActive) {
  viewerInteractionActive = active;
  lastViewerInteractionAt = performance.now();
}

async function waitForViewerIdle(signal, isCurrent, onWait, idleMs = 850) {
  while (!signal?.aborted && isCurrent()) {
    const idleFor = performance.now() - lastViewerInteractionAt;
    const inputPending = navigator.scheduling?.isInputPending?.({ includeContinuous: true }) === true;
    if (!viewerInteractionActive && !inputPending && idleFor >= idleMs) return;
    onWait?.();
    await new Promise((resolve) => window.setTimeout(resolve, 80));
  }
  throw abortError();
}

function setLoadingProgress(percent, stage, optical = false) {
  if (diamondWorkStarted && !optical) return;
  const next = THREE.MathUtils.clamp(Number(percent) || 0, 0, 100);
  loadingProgress = Math.max(loadingProgress, next);
  const rounded = Math.round(loadingProgress);
  if (loaderProgressEl) loaderProgressEl.style.width = `${rounded}%`;
  if (loaderPercentEl) loaderPercentEl.textContent = `${rounded} %`;
  if (loaderStageEl && stage) loaderStageEl.textContent = stage;
  loaderProgressBarEl?.setAttribute("aria-valuenow", String(rounded));
}

function startLoading(stage = "Préparation du modèle 3D", percent = 3) {
  window.clearTimeout(loadingHideTimer);
  loadingProgress = 0;
  setLoadingProgress(percent, stage);
  loaderEl?.classList.remove("is-hidden");
}

function finishLoading(stage = "Modèle prêt") {
  if (diamondCalculationProgressActive) {
    return;
  }
  setLoadingProgress(100, stage);
  window.clearTimeout(loadingHideTimer);
  loadingHideTimer = window.setTimeout(() => loaderEl?.classList.add("is-hidden"), 240);
}

function showDiamondCalculationProgress(stage, percent = 94) {
  window.clearTimeout(loadingHideTimer);
  if (!diamondCalculationProgressActive) {
    diamondCalculationProgressActive = true;
    diamondCalculationProgressTotal = 0;
    diamondCalculationProgressCompleted = 0;
    diamondCalculationHadFailure = false;
    if (loadingProgress >= 100 || loaderEl?.classList.contains("is-hidden")) loadingProgress = 0;
  }
  setLoadingProgress(percent, stage, true);
  loaderEl?.classList.remove("is-hidden");
}

function finishDiamondCalculationProgress(stage = "Rendu à lancer de rayons prêt") {
  setLoadingProgress(100, stage, true);
  diamondCalculationProgressActive = false;
  diamondWorkStarted = false;
  window.clearTimeout(loadingHideTimer);
  loadingHideTimer = window.setTimeout(() => loaderEl?.classList.add("is-hidden"), 650);
}

function waitForProgressPaint() {
  return new Promise((resolve) => {
    let completed = false;
    const finish = () => {
      if (completed) return;
      completed = true;
      resolve();
    };
    window.setTimeout(finish, 80);
    requestAnimationFrame(() => window.setTimeout(finish, 0));
  });
}

function updateLoadingFromProgressEvent(event, label = "Téléchargement du modèle", start = 8, end = 58) {
  if (event?.lengthComputable && event.total > 0) {
    const ratio = THREE.MathUtils.clamp(event.loaded / event.total, 0, 1);
    setLoadingProgress(start + (end - start) * ratio, `${label} (${Math.round(ratio * 100)} %)`);
    return;
  }
  setLoadingProgress(Math.min(end - 2, Math.max(start, loadingProgress + 1)), label);
}

function updateRhinoLoadingProgress(event) {
  updateLoadingFromProgressEvent(event, "Téléchargement du fichier Rhino 3DM", 8, 58);
  if (event?.lengthComputable && event.total > 0 && event.loaded >= event.total) {
    setLoadingProgress(60, "Décodage du document Rhino 3DM");
  }
}

function logDebug(type, message, data = undefined) {
  const entry = {
    time: new Date().toISOString(),
    type,
    message,
    data,
  };
  debugLog.push(entry);
  if (debugLog.length > 500) debugLog.shift();
  syncDebugLogPanel();
}

function syncDebugLogPanel() {
  const output = document.querySelector("#debug-log-output");
  if (!output) return;
  output.value = debugLog
    .map((entry) => {
      const payload = entry.data === undefined ? "" : `\n${JSON.stringify(entry.data, null, 2)}`;
      return `[${entry.time}] ${entry.type.toUpperCase()} - ${entry.message}${payload}`;
    })
    .join("\n\n");
}

const originalConsoleError = console.error.bind(console);
const originalConsoleWarn = console.warn.bind(console);
function formatLogArg(arg) {
  if (arg instanceof Error) return `${arg.name}: ${arg.message}`;
  if (typeof arg === "object" && arg !== null) {
    try {
      return JSON.stringify(arg);
    } catch {
      return Object.prototype.toString.call(arg);
    }
  }
  return String(arg);
}
console.error = (...args) => {
  logDebug("error", args.map(formatLogArg).join(" "));
  originalConsoleError(...args);
};
console.warn = (...args) => {
  logDebug("warn", args.map(formatLogArg).join(" "));
  originalConsoleWarn(...args);
};

window.addEventListener("error", (event) => {
  logDebug("error", event.message, { source: event.filename, line: event.lineno, column: event.colno });
});

window.addEventListener("unhandledrejection", (event) => {
  logDebug("error", "Unhandled promise rejection", { reason: String(event.reason) });
});

const settings = {
  modelId: "plug-classique-xxxl-60",
  effectMethod: "spectral",
  gemShape: "oval",
  gemMaterialModel: "natural",
  gemColor: "#ff7d62",
  gemBicolorMode: "off",
  gemZoneA: "#b9154c",
  gemZoneB: "#28a56f",
  gemBoundaryShape: "linear",
  gemBoundarySoftness: 0.18,
  gemBoundaryAngle: -18,
  gemBoundaryAmplitude: 0.22,
  gemBoundaryPeriod: 2.2,
  reflectionColor: "#ffd1f0",
  reflectionIntensity: 2.7,
  gemIor: 1.78,
  gemTransmission: 0.72,
  gemRoughness: 0.035,
  gemIridescence: 0,
  gemClearcoatRoughness: 0.02,
  gemAbsorption: 1.8,
  gemCloudiness: 0.08,
  facetContrast: 0.38,
  spectralRichness: 0.48,
  dispersion: 0.42,
  fireBalance: 0.58,
  chromaticShift: 0.48,
  sparkleDensity: 0.62,
  causticSpread: 1,
  diamondInternalBounces: 8,
  diamondBeerAbsorption: 0.006,
  diamondMicroRoughness: 0,
  diamondHdriReflectionStrength: 1,
  diamondShaderMode: "mesh-bvh",
  diamondPathSamples: 4,
  selectedReflection: 0,
  reflections: [
    { color: "#ff2b42", shape: "facet", x: -0.16, y: 0.05, z: 0.08, radius: 0.072 },
    { color: "#57ff8b", shape: "soft", x: 0.08, y: 0.0, z: -0.1, radius: 0.064 },
    { color: "#4ab3ff", shape: "bar", x: 0.18, y: -0.07, z: 0.12, radius: 0.078 },
  ],
  effects: {
    dispersion: false,
    parametric: false,
    customReflections: false,
    caustics: false,
    bicolor: false,
    bloom: false,
    dof: false,
    autoRotate: false,
  },
  envIntensity: 1.65,
  metalPreset: "silver",
  metalIntensity: 1.38,
  metalRoughness: 0.06,
  facetTextureEnabled: true,
  facetTextureMode: "jewelry",
  facetTextureIntensity: 0.18,
  facetTextureRoughness: 0.14,
  facetTextureTint: 0.055,
  facetTextureReflectance: 0.16,
  facetTextureScale: 1.6,
  facetTextureSeed: 0.37,
  opticalPolishEnabled: false,
  opticalPolishStrength: 0.68,
  opticalPolishEdge: 0.58,
  keyLight: 5.2,
  rimLight: 4.4,
  fillLight: 1.7,
  supportMaterial: "rhino-wood-olivier-poli",
  panelWidth: 430,
  autoRotate: false,
  caustics: false,
  dof: false,
  background: "black",
  stoneShowcaseVisible: false,
  stoneShowcaseOnPedestal: false,
  stoneShowcaseGeometry: "round-brilliant",
  stoneShowcaseMaterial: "diamond",
  activeCatalogGemPreset: "",
  stoneShowcaseDiameter: 8,
  stoneShowcaseScale: 1,
  compareModelsEnabled: false,
  compareModelIds: ["plug-classique-xxxl-60"],
  compareModelSpacingMm: 100,
};

const meshQualityPresets = {
  draft: { chord: 0.12, angle: 24, maxEdge: 0.75, weld: 0.003, smoothAngle: 28, visualSubdivisions: 0 },
  balanced: { chord: 0.05, angle: 12, maxEdge: 0.35, weld: 0.001, smoothAngle: 58, visualSubdivisions: 0 },
  luxury: { chord: 0.015, angle: 5, maxEdge: 0.12, weld: 0.0005, smoothAngle: 78, visualSubdivisions: 0, surfaceRelaxation: 0, relaxationStrength: 0, preserveAngle: 42 },
  "silky-metal": { chord: 0.008, angle: 3.5, maxEdge: 0.055, weld: 0.0002, smoothAngle: 64, visualSubdivisions: 0, surfaceRelaxation: 0, relaxationStrength: 0, preserveAngle: 36, weightedNormals: true },
  "macro-polish": { chord: 0.0035, angle: 2.2, maxEdge: 0.018, weld: 0.0001, smoothAngle: 86, visualSubdivisions: 1, surfaceRelaxation: 0, relaxationStrength: 0, preserveAngle: 34, weightedNormals: true },
};

const defaultRhinoMeshOptions = {
  quality: "luxury",
  chordTolerance: meshQualityPresets.luxury.chord,
  angleTolerance: meshQualityPresets.luxury.angle,
  maxEdgeLength: meshQualityPresets.luxury.maxEdge,
  weldTolerance: 0,
  smoothAngle: 68,
  visualSubdivisions: meshQualityPresets.luxury.visualSubdivisions,
  surfaceRelaxation: meshQualityPresets.luxury.surfaceRelaxation,
  relaxationStrength: meshQualityPresets.luxury.relaxationStrength,
  preserveAngle: meshQualityPresets.luxury.preserveAngle,
  weightedNormals: false,
  recomputeNormals: true,
  creaseNormals: true,
  doubleSided: true,
  ignoreAnnotations: true,
  preserveMaterials: true,
  softStudioShadow: true,
  geometricShadow: false,
  preserveRhinoFrame: true,
  rhinoZUp: true,
};

let pendingMeshImport = null;
let currentRhinoSource = null;
let rhinoRemeshTimer = null;
let rhinoRemeshRequestId = 0;
let rhinoPreviewGroup = null;
let rhinoPreviewTimer = null;

const backgrounds = {
  black: {
    label: "Noir profond",
    color: new THREE.Color("#020303"),
    fog: new THREE.Color("#020303"),
    floor: new THREE.Color("#080706"),
  },
  white: {
    label: "Blanc galerie",
    color: new THREE.Color("#ece7dc"),
    fog: new THREE.Color("#ece7dc"),
    floor: new THREE.Color("#d8cfbf"),
  },
  champagne: {
    label: "Champagne",
    color: new THREE.Color("#6b5337"),
    fog: new THREE.Color("#6b5337"),
    floor: new THREE.Color("#2a1710"),
  },
  "graphite": {
    label: "Graphite satiné",
    color: new THREE.Color("#111314"),
    fog: new THREE.Color("#111314"),
    floor: new THREE.Color("#151515"),
  },
  "warm-ivory": {
    label: "Ivoire chaud",
    color: new THREE.Color("#d8cbb3"),
    fog: new THREE.Color("#d8cbb3"),
    floor: new THREE.Color("#b7a78b"),
  },
  "bronze-night": {
    label: "Bronze nocturne",
    color: new THREE.Color("#22160e"),
    fog: new THREE.Color("#22160e"),
    floor: new THREE.Color("#1b1009"),
  },
  "blue-black": {
    label: "Bleu noir joaillerie",
    color: new THREE.Color("#030711"),
    fog: new THREE.Color("#030711"),
    floor: new THREE.Color("#05070d"),
  },
  "emerald-dark": {
    label: "Vert émeraude sombre",
    color: new THREE.Color("#03120e"),
    fog: new THREE.Color("#03120e"),
    floor: new THREE.Color("#06110d"),
  },
};


function getBackgroundVisual(id) {
  const bg = backgrounds[id] || backgrounds.black;
  const color = `#${bg.color.getHexString()}`;
  const floor = `#${bg.floor.getHexString()}`;
  return {
    label: bg.label || id,
    background: `linear-gradient(145deg, ${color} 0%, ${floor} 100%)`,
  };
}

const clock = new THREE.Clock();
const scene = new THREE.Scene();
scene.fog = new THREE.FogExp2(backgrounds.black.fog, 0.035);

const camera = new THREE.PerspectiveCamera(38, window.innerWidth / window.innerHeight, 0.05, 100);
camera.position.set(4.2, 2.2, 5.3);

const renderer = new THREE.WebGLRenderer({
  canvas,
  antialias: true,
  alpha: true,
  powerPreference: "high-performance",
});
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.08;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;

const pmrem = new THREE.PMREMGenerator(renderer);
scene.environment = pmrem.fromScene(new RoomEnvironment(renderer), 0.04).texture;
scene.environmentIntensity = settings.envIntensity;

const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;
controls.dampingFactor = 0.055;
controls.autoRotate = settings.autoRotate;
controls.autoRotateSpeed = 0.65;
controls.minDistance = 2.8;
controls.maxDistance = 9.5;
controls.target.set(0, 0.32, 0);

const transformControls = new TransformControls(camera, renderer.domElement);
transformControls.setMode("translate");
transformControls.setSize(0.72);
scene.add(transformControls);

const raycaster = new THREE.Raycaster();
const pointer = new THREE.Vector2();
let canvasPointerStart = null;
let stemDecalDragState = null;
let stemDecalGesture = null;
let selectedStemDecal = null;
let stemDecalSelectionHelper = null;
let arCameraStream = null;
let arSceneState = null;
let arVideoTexture = null;
let selectedManipulatorObject = null;
let selectedSceneObject = null;
let contextMaterialObject = null;
let contextMaterialType = "metal";
let stoneShowcaseGroup = null;
let stoneShowcaseMesh = null;
let stoneShowcasePedestal = null;
let stoneShowcaseLockedPosition = null;

const renderPass = new RenderPass(scene, camera);
const bloomPass = new UnrealBloomPass(new THREE.Vector2(window.innerWidth, window.innerHeight), 0.22, 0.42, 0.82);
const bokehPass = new BokehPass(scene, camera, {
  focus: 4.8,
  aperture: 0.00008,
  maxblur: 0.008,
});
bokehPass.enabled = settings.dof;

const composer = new EffectComposer(renderer);
composer.addPass(renderPass);
composer.addPass(bloomPass);
composer.addPass(bokehPass);

const root = new THREE.Group();
root.name = "Luxury ring root";
scene.add(root);

const scaleReferenceGroup = new THREE.Group();
scaleReferenceGroup.name = "Objets de comparaison à l’échelle";
scaleReferenceGroup.visible = false;
scene.add(scaleReferenceGroup);
let optimizedRenderWorker = null;
let optimizedRenderJobId = 0;
let optimizedRenderBlob = null;

let centerGemMesh = null;
const uploadedModels = new Map();
let uploadedModelCounter = 1;
const editableObjects = [];
const PROJECT_MATERIAL_LIBRARY_KEY = "ctva-jewelry-project-materials";
const GENERAL_MATERIAL_LIBRARY_KEY = "ctva-jewelry-general-materials";
const FACET_TEXTURE_LIBRARY_KEY = "ctva-jewelry-facet-texture-configs";
const MATERIAL_VISIBILITY_KEY = "ctva-jewelry-material-visibility";
const MENU_PANEL_WIDTH_KEY = "ctva-jewelry-menu-panel-width";
const MODEL_LIBRARY_DB_NAME = "ctva-jewelry-model-library";
const MODEL_LIBRARY_DB_VERSION = 1;
const MODEL_LIBRARY_STORE = "models";

function openModelLibraryDb() {
  return new Promise((resolve, reject) => {
    if (!("indexedDB" in window)) {
      reject(new Error("IndexedDB non disponible"));
      return;
    }
    const request = indexedDB.open(MODEL_LIBRARY_DB_NAME, MODEL_LIBRARY_DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(MODEL_LIBRARY_STORE)) {
        db.createObjectStore(MODEL_LIBRARY_STORE, { keyPath: "id" });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error || new Error("Ouverture IndexedDB impossible"));
  });
}

async function savePersistentModelRecord(record) {
  const db = await openModelLibraryDb();
  try {
    await new Promise((resolve, reject) => {
      const transaction = db.transaction(MODEL_LIBRARY_STORE, "readwrite");
      transaction.objectStore(MODEL_LIBRARY_STORE).put(record);
      transaction.oncomplete = resolve;
      transaction.onerror = () => reject(transaction.error || new Error("Sauvegarde du modele impossible"));
      transaction.onabort = () => reject(transaction.error || new Error("Sauvegarde du modele annulee"));
    });
  } finally {
    db.close();
  }
}

async function deletePersistentModelRecord(id) {
  const db = await openModelLibraryDb();
  try {
    await new Promise((resolve, reject) => {
      const transaction = db.transaction(MODEL_LIBRARY_STORE, "readwrite");
      transaction.objectStore(MODEL_LIBRARY_STORE).delete(id);
      transaction.oncomplete = resolve;
      transaction.onerror = () => reject(transaction.error || new Error("Suppression du modele impossible"));
    });
  } finally {
    db.close();
  }
}

async function readPersistentModelRecords() {
  const db = await openModelLibraryDb();
  try {
    return await new Promise((resolve, reject) => {
      const request = db.transaction(MODEL_LIBRARY_STORE, "readonly").objectStore(MODEL_LIBRARY_STORE).getAll();
      request.onsuccess = () => resolve(request.result || []);
      request.onerror = () => reject(request.error || new Error("Lecture de la bibliothèque impossible"));
    });
  } finally {
    db.close();
  }
}

const facetTextureBestDefault = {
  name: "Joaillerie luxe - subtil",
  enabled: true,
  mode: "jewelry",
  intensity: 0.18,
  roughness: 0.14,
  tint: 0.055,
  reflectance: 0.16,
  scale: 1.6,
  seed: 0.37,
  opticalPolishEnabled: false,
  opticalPolishStrength: 0.68,
  opticalPolishEdge: 0.58,
};

const facetRealismPresets = {
  "polished-gold": {
    label: "Or poli anti-facettes",
    config: { enabled: true, mode: "jewelry", intensity: 0.14, roughness: 0.1, tint: 0.038, reflectance: 0.2, scale: 1.35, seed: 0.37, opticalPolishEnabled: true, opticalPolishStrength: 0.72, opticalPolishEdge: 0.6 },
    facetContrast: 0.32,
  },
  "mirror-chrome": {
    label: "Chrome joaillerie miroir",
    config: { enabled: true, mode: "subtle", intensity: 0.08, roughness: 0.055, tint: 0.018, reflectance: 0.28, scale: 0.95, seed: 0.22, opticalPolishEnabled: true, opticalPolishStrength: 0.82, opticalPolishEdge: 0.64 },
    facetContrast: 0.22,
  },
  "soft-cast": {
    label: "Fonte precieuse adoucie",
    config: { enabled: true, mode: "jewelry", intensity: 0.2, roughness: 0.18, tint: 0.05, reflectance: 0.12, scale: 1.7, seed: 0.51, opticalPolishEnabled: true, opticalPolishStrength: 0.54, opticalPolishEdge: 0.52 },
    facetContrast: 0.26,
  },
  "readable-facets": {
    label: "Facettes lisibles contrastees",
    config: { enabled: true, mode: "technical", intensity: 0.36, roughness: 0.28, tint: 0.12, reflectance: 0.24, scale: 2.35, seed: 0.68, opticalPolishEnabled: false, opticalPolishStrength: 0.18, opticalPolishEdge: 0.35 },
    facetContrast: 0.52,
  },
};

const facetTextureModePresets = {
  subtle: { intensity: 0.1, roughness: 0.08, tint: 0.025, reflectance: 0.08, scale: 1.15 },
  jewelry: { intensity: 0.18, roughness: 0.14, tint: 0.055, reflectance: 0.16, scale: 1.6 },
  technical: { intensity: 0.34, roughness: 0.24, tint: 0.11, reflectance: 0.28, scale: 2.25 },
};

const lightingPresets = {
  current: { label: "Actuel - studio sombre luxe", env: 1.65, key: 5.2, rim: 4.4, fill: 1.7 },
  "dashboard-chrome": { label: "Tableau de bord chrome & bois", env: 1.35, key: 4.7, rim: 6.9, fill: 1.15 },
  "diamond-macro": { label: "Macro diamant contrastee", env: 2.15, key: 7.6, rim: 8.8, fill: 0.65 },
  "soft-marble": { label: "Softbox marbre clair", env: 1.95, key: 4.1, rim: 2.9, fill: 3.4 },
  "velvet-evening": { label: "Velours noir soiree", env: 1.18, key: 5.8, rim: 5.6, fill: 0.35 },
};

const environmentVisuals = {
  current: {
    background: "radial-gradient(circle at 32% 24%, #fff4d6 0 9%, transparent 10% 19%), linear-gradient(135deg, #050505 0%, #16120d 42%, #d2a04f 50%, #080706 100%)",
  },
  "dashboard-chrome": {
    background: "linear-gradient(115deg, #1d120b 0%, #7a482c 26%, #d6c7ad 42%, #3e4448 56%, #c8d0d4 66%, #17120f 100%)",
  },
  "diamond-macro": {
    background: "radial-gradient(circle at 24% 22%, #ffffff 0 10%, transparent 11% 20%), conic-gradient(from 25deg, #101010, #ffffff, #a7dbff, #ffffff, #121212)",
  },
  "soft-marble": {
    background: "linear-gradient(135deg, #f4eee4 0%, #ffffff 36%, #d8d0c3 58%, #9f8e78 100%)",
  },
  "velvet-evening": {
    background: "radial-gradient(circle at 70% 20%, #d8b15f 0 7%, transparent 8% 20%), linear-gradient(135deg, #030304 0%, #18070e 48%, #3a0d1c 100%)",
  },
};
const modelDefaults = {
  "plug-decalcomanie": {
    title: "Plug avec decalcomanie",
    eyebrow: "Modèle client importé",
    copy: "Modèle Rhino 3DM préchargé avec cotations ignorées et mat\u00e9riau métal PBR.",
    gemColor: "#ff7d62",
    camera: [3.8, 1.9, 4.2],
    target: [0, -0.35, 0],
    url: "./assets/models/plug-decalcomanie.3dm",
    meshOptions: { ...defaultRhinoMeshOptions, preserveRhinoFrame: false, rhinoZUp: false },
  },
  "plug-classique-55-sans-tete": {
    title: "Plug classique 55 sans tête",
    eyebrow: "Collection plugs classiques",
    copy: "Plug classique Rhino sans pierre, métal PBR poli.",
    gemColor: "#ffcf73",
    camera: [3.8, 1.9, 4.2],
    target: [0, -0.35, 0],
    url: "./assets/models/plugs/classiques/55-sans-tete.3dm?v=20260728-classic-plugs",
    meshOptions: { ...defaultRhinoMeshOptions, preserveRhinoFrame: false, rhinoZUp: false, classicPlugVolumeMaterials: true, classicPlugGem: false },
  },
  "plug-classique-67-sans-tete": {
    title: "Plug classique 67 sans tête",
    eyebrow: "Collection plugs classiques",
    copy: "Plug classique Rhino sans pierre, métal PBR poli.",
    gemColor: "#ffcf73",
    camera: [3.8, 1.9, 4.2],
    target: [0, -0.35, 0],
    url: "./assets/models/plugs/classiques/67-sans-tete.3dm?v=20260728-classic-plugs",
    meshOptions: { ...defaultRhinoMeshOptions, preserveRhinoFrame: false, rhinoZUp: false, classicPlugVolumeMaterials: true, classicPlugGem: false },
  },
  "plug-classique-large-35-sans-tete": {
    title: "Plug LARGE 35 sans tête",
    eyebrow: "Collection plugs classiques",
    copy: "Plug classique Rhino sans pierre, métal PBR poli.",
    gemColor: "#ffcf73",
    camera: [3.8, 1.9, 4.2],
    target: [0, -0.35, 0],
    url: "./assets/models/plugs/classiques/large-35-sans-tete.3dm?v=20260728-classic-plugs",
    meshOptions: { ...defaultRhinoMeshOptions, preserveRhinoFrame: false, rhinoZUp: false, classicPlugVolumeMaterials: true, classicPlugGem: false },
  },
  "plug-classique-large-35": {
    title: "Plug LARGE 35 avec pierre",
    eyebrow: "Collection plugs classiques",
    copy: "Plug classique Rhino avec pierre précieuse détectée par volume.",
    gemColor: "#f5fbff",
    camera: [3.8, 1.9, 4.2],
    target: [0, -0.35, 0],
    url: "./assets/models/plugs/classiques/large-35.3dm?v=20260728-classic-plugs",
    meshOptions: { ...defaultRhinoMeshOptions, preserveRhinoFrame: false, rhinoZUp: false, classicPlugVolumeMaterials: true, classicPlugGem: true },
  },
  "plug-classique-medium-30-sans-tete": {
    title: "Plug MEDIUM 30 sans tête",
    eyebrow: "Collection plugs classiques",
    copy: "Plug classique Rhino sans pierre, métal PBR poli.",
    gemColor: "#ffcf73",
    camera: [3.8, 1.9, 4.2],
    target: [0, -0.35, 0],
    url: "./assets/models/plugs/classiques/medium-30-sans-tete.3dm?v=20260728-classic-plugs",
    meshOptions: { ...defaultRhinoMeshOptions, preserveRhinoFrame: false, rhinoZUp: false, classicPlugVolumeMaterials: true, classicPlugGem: false },
  },
  "plug-classique-medium": {
    title: "Plug MEDIUM avec pierre",
    eyebrow: "Collection plugs classiques",
    copy: "Plug classique Rhino avec pierre précieuse détectée par volume.",
    gemColor: "#f5fbff",
    camera: [3.8, 1.9, 4.2],
    target: [0, -0.35, 0],
    url: "./assets/models/plugs/classiques/medium.3dm?v=20260728-classic-plugs",
    meshOptions: { ...defaultRhinoMeshOptions, preserveRhinoFrame: false, rhinoZUp: false, classicPlugVolumeMaterials: true, classicPlugGem: true },
  },
  "plug-classique-small-18": {
    title: "Plug SMALL 18 avec pierre",
    eyebrow: "Collection plugs classiques",
    copy: "Plug classique Rhino avec pierre précieuse détectée par volume.",
    gemColor: "#f5fbff",
    camera: [3.8, 1.9, 4.2],
    target: [0, -0.35, 0],
    url: "./assets/models/plugs/classiques/small-18.3dm?v=20260728-classic-plugs",
    meshOptions: { ...defaultRhinoMeshOptions, preserveRhinoFrame: false, rhinoZUp: false, classicPlugVolumeMaterials: true, classicPlugGem: true },
  },
  "plug-classique-small": {
    title: "Plug SMALL avec pierre",
    eyebrow: "Collection plugs classiques",
    copy: "Plug classique Rhino avec pierre précieuse détectée par volume.",
    gemColor: "#f5fbff",
    camera: [3.8, 1.9, 4.2],
    target: [0, -0.35, 0],
    url: "./assets/models/plugs/classiques/small.3dm?v=20260728-classic-plugs",
    meshOptions: { ...defaultRhinoMeshOptions, preserveRhinoFrame: false, rhinoZUp: false, classicPlugVolumeMaterials: true, classicPlugGem: true },
  },
  "plug-new-small-cabochon-lisse": {
    title: "Plug NEW SMALL cabochon lisse",
    eyebrow: "Collection plugs NEW SMALL",
    copy: "Plug NEW SMALL Rhino avec cabochon lisse détecté par volume.",
    gemColor: "#ffb5c6",
    camera: [3.8, 1.9, 4.2],
    target: [0, -0.35, 0],
    url: "./assets/models/plugs/new-small/new-small-cabochon-lisse.3dm?v=20260729-new-small-models",
    meshOptions: { ...defaultRhinoMeshOptions, preserveRhinoFrame: false, rhinoZUp: false, classicPlugVolumeMaterials: true, classicPlugGem: true },
  },
  "plug-new-small-cristal": {
    title: "Plug NEW SMALL cristal",
    eyebrow: "Collection plugs NEW SMALL",
    copy: "Plug NEW SMALL Rhino avec cristal détecté par volume.",
    gemColor: "#f5fbff",
    camera: [3.8, 1.9, 4.2],
    target: [0, -0.35, 0],
    url: "./assets/models/plugs/new-small/new-small-cristal.3dm?v=20260729-new-small-models",
    meshOptions: { ...defaultRhinoMeshOptions, preserveRhinoFrame: false, rhinoZUp: false, classicPlugVolumeMaterials: true, classicPlugGem: true },
  },
  "plug-new-medium-30-sans-tete-cabochon-lisse": {
    title: "Plug NEW MEDIUM 30 cabochon lisse",
    eyebrow: "Collection plugs NEW MEDIUM",
    copy: "Plug NEW MEDIUM Rhino avec cabochon lisse détecté par volume.",
    gemColor: "#ffb5c6",
    camera: [3.8, 1.9, 4.2],
    target: [0, -0.35, 0],
    url: "./assets/models/plugs/new-medium/new-medium-30-sans-tete-cabochon-lisse.3dm?v=20260805-new-medium-decal-multigems",
    meshOptions: { ...defaultRhinoMeshOptions, preserveRhinoFrame: false, rhinoZUp: false, classicPlugVolumeMaterials: true, classicPlugGem: true },
  },
  "plug-new-medium-30-sans-tete-cristal": {
    title: "Plug NEW MEDIUM 30 cristal",
    eyebrow: "Collection plugs NEW MEDIUM",
    copy: "Plug NEW MEDIUM Rhino avec cristal détecté par volume.",
    gemColor: "#f5fbff",
    camera: [3.8, 1.9, 4.2],
    target: [0, -0.35, 0],
    url: "./assets/models/plugs/new-medium/new-medium-30-sans-tete-cristal.3dm?v=20260805-new-medium-decal-multigems",
    meshOptions: { ...defaultRhinoMeshOptions, preserveRhinoFrame: false, rhinoZUp: false, classicPlugVolumeMaterials: true, classicPlugGem: true },
  },
  "plug-new-medium-35-sans-tete-cabochon-lisse": {
    title: "Plug NEW MEDIUM 35 cabochon lisse",
    eyebrow: "Collection plugs NEW MEDIUM",
    copy: "Plug NEW MEDIUM Rhino avec cabochon lisse détecté par volume.",
    gemColor: "#ffb5c6",
    camera: [3.8, 1.9, 4.2],
    target: [0, -0.35, 0],
    url: "./assets/models/plugs/new-medium/new-medium-35-sans-tete-cabochon-lisse.3dm?v=20260805-new-medium-decal-multigems",
    meshOptions: { ...defaultRhinoMeshOptions, preserveRhinoFrame: false, rhinoZUp: false, classicPlugVolumeMaterials: true, classicPlugGem: true },
  },
  "plug-new-medium-35-sans-tete-cristal": {
    title: "Plug NEW MEDIUM 35 cristal",
    eyebrow: "Collection plugs NEW MEDIUM",
    copy: "Plug NEW MEDIUM Rhino avec cristal détecté par volume.",
    gemColor: "#f5fbff",
    camera: [3.8, 1.9, 4.2],
    target: [0, -0.35, 0],
    url: "./assets/models/plugs/new-medium/new-medium-35-sans-tete-cristal.3dm?v=20260805-new-medium-decal-multigems",
    meshOptions: { ...defaultRhinoMeshOptions, preserveRhinoFrame: false, rhinoZUp: false, classicPlugVolumeMaterials: true, classicPlugGem: true },
  },
  "plug-new-medium-55-sans-tete-cabochon-lisse": {
    title: "Plug NEW MEDIUM 55 cabochon lisse",
    eyebrow: "Collection plugs NEW MEDIUM",
    copy: "Plug NEW MEDIUM Rhino avec cabochon lisse détecté par volume.",
    gemColor: "#ffb5c6",
    camera: [3.8, 1.9, 4.2],
    target: [0, -0.35, 0],
    url: "./assets/models/plugs/new-medium/new-medium-55-sans-tete-cabochon-lisse.3dm?v=20260805-new-medium-decal-multigems",
    meshOptions: { ...defaultRhinoMeshOptions, preserveRhinoFrame: false, rhinoZUp: false, classicPlugVolumeMaterials: true, classicPlugGem: true },
  },
  "plug-new-medium-55-sans-tete-cristal": {
    title: "Plug NEW MEDIUM 55 cristal",
    eyebrow: "Collection plugs NEW MEDIUM",
    copy: "Plug NEW MEDIUM Rhino avec cristal détecté par volume.",
    gemColor: "#f5fbff",
    camera: [3.8, 1.9, 4.2],
    target: [0, -0.35, 0],
    url: "./assets/models/plugs/new-medium/new-medium-55-sans-tete-cristal.3dm?v=20260805-new-medium-decal-multigems",
    meshOptions: { ...defaultRhinoMeshOptions, preserveRhinoFrame: false, rhinoZUp: false, classicPlugVolumeMaterials: true, classicPlugGem: true },
  },
  "plug-new-medium-67-sans-tete-cabochon-lisse": {
    title: "Plug NEW MEDIUM 67 cabochon lisse",
    eyebrow: "Collection plugs NEW MEDIUM",
    copy: "Plug NEW MEDIUM Rhino avec cabochon lisse détecté par volume.",
    gemColor: "#ffb5c6",
    camera: [3.8, 1.9, 4.2],
    target: [0, -0.35, 0],
    url: "./assets/models/plugs/new-medium/new-medium-67-sans-tete-cabochon-lisse.3dm?v=20260805-new-medium-decal-multigems",
    meshOptions: { ...defaultRhinoMeshOptions, preserveRhinoFrame: false, rhinoZUp: false, classicPlugVolumeMaterials: true, classicPlugGem: true },
  },
  "plug-new-medium-67-sans-tete-cristal": {
    title: "Plug NEW MEDIUM 67 cristal",
    eyebrow: "Collection plugs NEW MEDIUM",
    copy: "Plug NEW MEDIUM Rhino avec cristal détecté par volume.",
    gemColor: "#f5fbff",
    camera: [3.8, 1.9, 4.2],
    target: [0, -0.35, 0],
    url: "./assets/models/plugs/new-medium/new-medium-67-sans-tete-cristal.3dm?v=20260805-new-medium-decal-multigems",
    meshOptions: { ...defaultRhinoMeshOptions, preserveRhinoFrame: false, rhinoZUp: false, classicPlugVolumeMaterials: true, classicPlugGem: true },
  },
  "plug-new-medium-xl-45-sans-tete-cabochon-lisse": {
    title: "Plug NEW MEDIUM XL 45 cabochon lisse",
    eyebrow: "Collection plugs NEW MEDIUM",
    copy: "Plug NEW MEDIUM Rhino avec cabochon lisse détecté par volume.",
    gemColor: "#ffb5c6",
    camera: [3.8, 1.9, 4.2],
    target: [0, -0.35, 0],
    url: "./assets/models/plugs/new-medium/new-medium-xl-45-sans-tete-cabochon-lisse.3dm?v=20260805-new-medium-decal-multigems",
    meshOptions: { ...defaultRhinoMeshOptions, preserveRhinoFrame: false, rhinoZUp: false, classicPlugVolumeMaterials: true, classicPlugGem: true },
  },
  "plug-new-medium-xl-45-sans-tete-cristal": {
    title: "Plug NEW MEDIUM XL 45 cristal",
    eyebrow: "Collection plugs NEW MEDIUM",
    copy: "Plug NEW MEDIUM Rhino avec cristal détecté par volume.",
    gemColor: "#f5fbff",
    camera: [3.8, 1.9, 4.2],
    target: [0, -0.35, 0],
    url: "./assets/models/plugs/new-medium/new-medium-xl-45-sans-tete-cristal.3dm?v=20260805-new-medium-decal-multigems",
    meshOptions: { ...defaultRhinoMeshOptions, preserveRhinoFrame: false, rhinoZUp: false, classicPlugVolumeMaterials: true, classicPlugGem: true },
  },
  "plug-new-medium-xxl-50-sans-tete-cabochon-lisse": {
    title: "Plug NEW MEDIUM XXL 50 cabochon lisse",
    eyebrow: "Collection plugs NEW MEDIUM",
    copy: "Plug NEW MEDIUM Rhino avec cabochon lisse détecté par volume.",
    gemColor: "#ffb5c6",
    camera: [3.8, 1.9, 4.2],
    target: [0, -0.35, 0],
    url: "./assets/models/plugs/new-medium/new-medium-xxl-50-sans-tete-cabochon-lisse.3dm?v=20260805-new-medium-decal-multigems",
    meshOptions: { ...defaultRhinoMeshOptions, preserveRhinoFrame: false, rhinoZUp: false, classicPlugVolumeMaterials: true, classicPlugGem: true },
  },
  "plug-new-medium-xxl-50-sans-tete-cristal": {
    title: "Plug NEW MEDIUM XXL 50 cristal",
    eyebrow: "Collection plugs NEW MEDIUM",
    copy: "Plug NEW MEDIUM Rhino avec cristal détecté par volume.",
    gemColor: "#f5fbff",
    camera: [3.8, 1.9, 4.2],
    target: [0, -0.35, 0],
    url: "./assets/models/plugs/new-medium/new-medium-xxl-50-sans-tete-cristal.3dm?v=20260805-new-medium-decal-multigems",
    meshOptions: { ...defaultRhinoMeshOptions, preserveRhinoFrame: false, rhinoZUp: false, classicPlugVolumeMaterials: true, classicPlugGem: true },
  },
  "plug-new-medium-xxxl-60-sans-tete-cabochon-lisse": {
    title: "Plug NEW MEDIUM XXXL 60 cabochon lisse",
    eyebrow: "Collection plugs NEW MEDIUM",
    copy: "Plug NEW MEDIUM Rhino avec cabochon lisse détecté par volume.",
    gemColor: "#ffb5c6",
    camera: [3.8, 1.9, 4.2],
    target: [0, -0.35, 0],
    url: "./assets/models/plugs/new-medium/new-medium-xxxl-60-sans-tete-cabochon-lisse.3dm?v=20260805-new-medium-decal-multigems",
    meshOptions: { ...defaultRhinoMeshOptions, preserveRhinoFrame: false, rhinoZUp: false, classicPlugVolumeMaterials: true, classicPlugGem: true },
  },
  "plug-new-medium-xxxl-60-sans-tete-cristal": {
    title: "Plug NEW MEDIUM XXXL 60 cristal",
    eyebrow: "Collection plugs NEW MEDIUM",
    copy: "Plug NEW MEDIUM Rhino avec cristal détecté par volume.",
    gemColor: "#f5fbff",
    camera: [3.8, 1.9, 4.2],
    target: [0, -0.35, 0],
    url: "./assets/models/plugs/new-medium/new-medium-xxxl-60-sans-tete-cristal.3dm?v=20260805-new-medium-decal-multigems",
    meshOptions: { ...defaultRhinoMeshOptions, preserveRhinoFrame: false, rhinoZUp: false, classicPlugVolumeMaterials: true, classicPlugGem: true },
  },
  "plug-classique-xl-35": {
    title: "Plug XL 35 avec pierre",
    eyebrow: "Collection plugs classiques",
    copy: "Plug classique Rhino avec pierre précieuse détectée par volume.",
    gemColor: "#f5fbff",
    camera: [3.8, 1.9, 4.2],
    target: [0, -0.35, 0],
    url: "./assets/models/plugs/classiques/xl-35.3dm?v=20260728-classic-plugs",
    meshOptions: { ...defaultRhinoMeshOptions, preserveRhinoFrame: false, rhinoZUp: false, classicPlugVolumeMaterials: true, classicPlugGem: true },
  },
  "plug-classique-xl-45-avec-assiette": {
    title: "Plug XL 45 avec assiette",
    eyebrow: "Collection plugs classiques",
    copy: "Plug classique Rhino avec pierre précieuse détectée par volume.",
    gemColor: "#f5fbff",
    camera: [3.8, 1.9, 4.2],
    target: [0, -0.35, 0],
    url: "./assets/models/plugs/classiques/xl-45-avec-assiette.3dm?v=20260728-classic-plugs",
    meshOptions: { ...defaultRhinoMeshOptions, preserveRhinoFrame: false, rhinoZUp: false, classicPlugVolumeMaterials: true, classicPlugGem: true },
  },
  "plug-classique-xl-45-sans-tete": {
    title: "Plug XL 45 sans tête",
    eyebrow: "Collection plugs classiques",
    copy: "Plug classique Rhino sans pierre, métal PBR poli.",
    gemColor: "#ffcf73",
    camera: [3.8, 1.9, 4.2],
    target: [0, -0.35, 0],
    url: "./assets/models/plugs/classiques/xl-45-sans-tete.3dm?v=20260728-classic-plugs",
    meshOptions: { ...defaultRhinoMeshOptions, preserveRhinoFrame: false, rhinoZUp: false, classicPlugVolumeMaterials: true, classicPlugGem: false },
  },
  "plug-classique-xl": {
    title: "Plug XL avec pierre",
    eyebrow: "Collection plugs classiques",
    copy: "Plug classique Rhino avec pierre précieuse détectée par volume.",
    gemColor: "#f5fbff",
    camera: [3.8, 1.9, 4.2],
    target: [0, -0.35, 0],
    url: "./assets/models/plugs/classiques/xl.3dm?v=20260728-classic-plugs",
    meshOptions: { ...defaultRhinoMeshOptions, preserveRhinoFrame: false, rhinoZUp: false, classicPlugVolumeMaterials: true, classicPlugGem: true },
  },
  "plug-classique-xxl-35": {
    title: "Plug XXL 35 avec pierre",
    eyebrow: "Collection plugs classiques",
    copy: "Plug classique Rhino avec pierre précieuse détectée par volume.",
    gemColor: "#f5fbff",
    camera: [3.8, 1.9, 4.2],
    target: [0, -0.35, 0],
    url: "./assets/models/plugs/classiques/xxl-35.3dm?v=20260728-classic-plugs",
    meshOptions: { ...defaultRhinoMeshOptions, preserveRhinoFrame: false, rhinoZUp: false, classicPlugVolumeMaterials: true, classicPlugGem: true },
  },
  "plug-classique-xxl-50-sans-tete": {
    title: "Plug XXL 50 sans tête",
    eyebrow: "Collection plugs classiques",
    copy: "Plug classique Rhino sans pierre, métal PBR poli.",
    gemColor: "#ffcf73",
    camera: [3.8, 1.9, 4.2],
    target: [0, -0.35, 0],
    url: "./assets/models/plugs/classiques/xxl-50-sans-tete.3dm?v=20260728-classic-plugs",
    meshOptions: { ...defaultRhinoMeshOptions, preserveRhinoFrame: false, rhinoZUp: false, classicPlugVolumeMaterials: true, classicPlugGem: false },
  },
  "plug-classique-xxl": {
    title: "Plug XXL avec pierre",
    eyebrow: "Collection plugs classiques",
    copy: "Plug classique Rhino avec pierre précieuse détectée par volume.",
    gemColor: "#f5fbff",
    camera: [3.8, 1.9, 4.2],
    target: [0, -0.35, 0],
    url: "./assets/models/plugs/classiques/xxl.3dm?v=20260728-classic-plugs",
    meshOptions: { ...defaultRhinoMeshOptions, preserveRhinoFrame: false, rhinoZUp: false, classicPlugVolumeMaterials: true, classicPlugGem: true },
  },
  "plug-classique-xxxl-60-sans-tete": {
    title: "Plug XXXL 60 sans tête",
    eyebrow: "Collection plugs classiques",
    copy: "Plug classique Rhino sans pierre, métal PBR poli.",
    gemColor: "#ffcf73",
    camera: [3.8, 1.9, 4.2],
    target: [0, -0.35, 0],
    url: "./assets/models/plugs/classiques/xxxl-60-sans-tete.3dm?v=20260728-classic-plugs",
    meshOptions: { ...defaultRhinoMeshOptions, preserveRhinoFrame: false, rhinoZUp: false, classicPlugVolumeMaterials: true, classicPlugGem: false },
  },
  "plug-classique-xxxl-60": {
    title: "Plug XXXL 60 avec pierre",
    eyebrow: "Collection plugs classiques",
    copy: "Plug classique Rhino avec pierre précieuse détectée par volume.",
    gemColor: "#f5fbff",
    camera: [3.8, 1.9, 4.2],
    target: [0, -0.35, 0],
    url: "./assets/models/plugs/classiques/xxxl-60.3dm?v=20260728-classic-plugs",
    meshOptions: { ...defaultRhinoMeshOptions, preserveRhinoFrame: false, rhinoZUp: false, classicPlugVolumeMaterials: true, classicPlugGem: true },
  },
  "plug-classique-xxxl-70": {
    title: "Plug XXXL 70 avec pierre",
    eyebrow: "Collection plugs classiques",
    copy: "Plug classique Rhino avec pierre précieuse détectée par volume.",
    gemColor: "#f5fbff",
    camera: [3.8, 1.9, 4.2],
    target: [0, -0.35, 0],
    url: "./assets/models/plugs/classiques/xxxl-70.3dm?v=20260728-classic-plugs",
    meshOptions: { ...defaultRhinoMeshOptions, preserveRhinoFrame: false, rhinoZUp: false, classicPlugVolumeMaterials: true, classicPlugGem: true },
  },
  "plug-classique-xxxl-80": {
    title: "Plug XXXL 80 avec pierre",
    eyebrow: "Collection plugs classiques",
    copy: "Plug classique Rhino avec pierre précieuse détectée par volume.",
    gemColor: "#f5fbff",
    camera: [3.8, 1.9, 4.2],
    target: [0, -0.35, 0],
    url: "./assets/models/plugs/classiques/xxxl-80.3dm?v=20260728-classic-plugs",
    meshOptions: { ...defaultRhinoMeshOptions, preserveRhinoFrame: false, rhinoZUp: false, classicPlugVolumeMaterials: true, classicPlugGem: true },
  },
  "plug-classique-xxxl-90": {
    title: "Plug XXXL 90 avec pierre",
    eyebrow: "Collection plugs classiques",
    copy: "Plug classique Rhino avec pierre précieuse détectée par volume.",
    gemColor: "#f5fbff",
    camera: [3.8, 1.9, 4.2],
    target: [0, -0.35, 0],
    url: "./assets/models/plugs/classiques/xxxl-90.3dm?v=20260728-classic-plugs",
    meshOptions: { ...defaultRhinoMeshOptions, preserveRhinoFrame: false, rhinoZUp: false, classicPlugVolumeMaterials: true, classicPlugGem: true },
  },
  "plug-classique-xxxl-100": {
    title: "Plug XXXL 100 avec pierre",
    eyebrow: "Collection plugs classiques",
    copy: "Plug classique Rhino avec pierre précieuse détectée par volume.",
    gemColor: "#f5fbff",
    camera: [3.8, 1.9, 4.2],
    target: [0, -0.35, 0],
    url: "./assets/models/plugs/classiques/xxxl-100.3dm?v=20260728-classic-plugs",
    meshOptions: { ...defaultRhinoMeshOptions, preserveRhinoFrame: false, rhinoZUp: false, classicPlugVolumeMaterials: true, classicPlugGem: true },
  },

};

const gemPresets = {
  padparadscha: {
    label: "Saphir padparadscha",
    color: "#ff7d62",
    fire: "#ffd1f0",
    ior: 1.77,
    transmission: 0.76,
    roughness: 0.028,
    dispersion: 0.38,
    intensity: 2.8,
    fireBalance: 0.58,
    attenuation: "#ff8468",
  },
  diamond: {
    label: "Diamant",
    color: "#f5fbff",
    fire: "#e9f7ff",
    ior: 2.42,
    transmission: 0.88,
    roughness: 0,
    dispersion: 1.15,
    intensity: 7.4,
    fireBalance: 1.0,
    attenuation: "#eaf7ff",
  },
  ruby: {
    label: "Rubis",
    color: "#b80f2f",
    fire: "#ff4f6d",
    ior: 1.76,
    transmission: 0.62,
    roughness: 0.035,
    dispersion: 0.32,
    intensity: 2.7,
    fireBalance: 0.46,
    attenuation: "#d5163f",
  },
  "ruby-cabochon": {
    label: "Rubis cabochon",
    color: "#9e1232",
    fire: "#ff6380",
    ior: 1.76,
    transmission: 0.38,
    roughness: 0.16,
    dispersion: 0.12,
    intensity: 1.75,
    fireBalance: 0.24,
    attenuation: "#a31234",
    cabochon: true,
  },
  sapphire: {
    label: "Saphir bleu",
    color: "#234cff",
    fire: "#8fc1ff",
    ior: 1.77,
    transmission: 0.68,
    roughness: 0.03,
    dispersion: 0.36,
    intensity: 2.8,
    fireBalance: 0.5,
    attenuation: "#264bff",
  },
  "sapphire-cabochon": {
    label: "Saphir cabochon",
    color: "#163caa",
    fire: "#80a8ff",
    ior: 1.77,
    transmission: 0.34,
    roughness: 0.17,
    dispersion: 0.11,
    intensity: 1.7,
    fireBalance: 0.22,
    attenuation: "#173a9d",
    cabochon: true,
  },
  emerald: {
    label: "Emeraude",
    color: "#1fbf83",
    fire: "#8fffd2",
    ior: 1.58,
    transmission: 0.58,
    roughness: 0.055,
    dispersion: 0.22,
    intensity: 2.35,
    fireBalance: 0.34,
    attenuation: "#20b879",
  },
  "emerald-cabochon": {
    label: "Emeraude cabochon",
    color: "#158d63",
    fire: "#78ffc6",
    ior: 1.58,
    transmission: 0.34,
    roughness: 0.18,
    dispersion: 0.1,
    intensity: 1.65,
    fireBalance: 0.22,
    attenuation: "#138458",
    cabochon: true,
  },
  amethyst: {
    label: "Amethyste",
    color: "#8a4dff",
    fire: "#d0a6ff",
    ior: 1.54,
    transmission: 0.64,
    roughness: 0.04,
    dispersion: 0.26,
    intensity: 2.2,
    fireBalance: 0.42,
    attenuation: "#8a55d7",
  },
  aquamarine: {
    label: "Aigue-marine",
    color: "#80e8ff",
    fire: "#d9ffff",
    ior: 1.58,
    transmission: 0.76,
    roughness: 0.025,
    dispersion: 0.24,
    intensity: 2.25,
    fireBalance: 0.36,
    attenuation: "#8fe9ff",
  },
  citrine: {
    label: "Citrine",
    color: "#f6a21a",
    fire: "#ffe08a",
    ior: 1.54,
    transmission: 0.66,
    roughness: 0.038,
    dispersion: 0.28,
    intensity: 2.35,
    fireBalance: 0.45,
    attenuation: "#f4a321",
  },
  topaz: {
    label: "Topaze bleue",
    color: "#28bfff",
    fire: "#b9f4ff",
    ior: 1.62,
    transmission: 0.72,
    roughness: 0.026,
    dispersion: 0.3,
    intensity: 2.55,
    fireBalance: 0.46,
    attenuation: "#2bb8ff",
  },
  tourmaline: {
    label: "Tourmaline rose",
    color: "#e83f9d",
    fire: "#ffc2e8",
    ior: 1.64,
    transmission: 0.62,
    roughness: 0.036,
    dispersion: 0.32,
    intensity: 2.55,
    fireBalance: 0.48,
    attenuation: "#e64a9d",
  },
  peridot: {
    label: "Peridot",
    color: "#92d84f",
    fire: "#ddff9c",
    ior: 1.67,
    transmission: 0.66,
    roughness: 0.034,
    dispersion: 0.34,
    intensity: 2.45,
    fireBalance: 0.44,
    attenuation: "#90cf4b",
  },
  garnet: {
    label: "Grenat",
    color: "#6d1230",
    fire: "#ff4772",
    ior: 1.79,
    transmission: 0.46,
    roughness: 0.045,
    dispersion: 0.42,
    intensity: 2.4,
    fireBalance: 0.52,
    attenuation: "#7b1534",
  },
  opal: {
    label: "Opale",
    color: "#f2fff2",
    fire: "#9fffe6",
    ior: 1.45,
    transmission: 0.36,
    roughness: 0.18,
    dispersion: 0.72,
    intensity: 2.9,
    fireBalance: 0.86,
    attenuation: "#eaffff",
    iridescence: 0.92,
  },
  turquoise: {
    label: "Turquoise",
    color: "#27c8c4",
    fire: "#7ffff5",
    ior: 1.61,
    transmission: 0.12,
    roughness: 0.34,
    dispersion: 0.08,
    intensity: 1.35,
    fireBalance: 0.18,
    attenuation: "#27c8c4",
    opaque: true,
  },
  pearl: {
    label: "Perle",
    color: "#fff5dc",
    fire: "#ffd8ef",
    ior: 1.53,
    transmission: 0.18,
    roughness: 0.28,
    dispersion: 0.18,
    intensity: 1.65,
    fireBalance: 0.28,
    attenuation: "#fff2d0",
    pearl: true,
  },
};

Object.assign(gemPresets, {
  "cg-almandite-violet-cabochon": {
    "label": "Almandite Violet Cabochon",
    "color": "#b56f94",
    "fire": "#e7b7d1",
    "attenuation": "#9e517a",
    "ior": 1.79,
    "transmission": 0.36,
    "roughness": 0.17,
    "dispersion": 0.12,
    "intensity": 1.65,
    "fireBalance": 0.22,
    "texture": "./assets/materials/crossgems/gem/almandite-violet-cabochon.jpg",
    "cabochon": true,
    "pearl": false,
    "opaque": false,
    "group": "Biblioth\u00e8que mat\u00e9riaux"
  },
  "cg-almandite-violet": {
    "label": "Almandite Violet",
    "color": "#ba2e78",
    "fire": "#ee74b5",
    "attenuation": "#992662",
    "ior": 1.79,
    "transmission": 0.62,
    "roughness": 0.04,
    "dispersion": 0.3,
    "intensity": 2.45,
    "fireBalance": 0.46,
    "texture": "./assets/materials/crossgems/gem/almandite-violet.jpg",
    "cabochon": false,
    "pearl": false,
    "opaque": false,
    "group": "Biblioth\u00e8que mat\u00e9riaux"
  },
  "cg-amethyst-cabochon": {
    "label": "Amethyst Cabochon",
    "color": "#97789d",
    "fire": "#d4b5da",
    "attenuation": "#7e6084",
    "ior": 1.54,
    "transmission": 0.36,
    "roughness": 0.17,
    "dispersion": 0.12,
    "intensity": 1.65,
    "fireBalance": 0.22,
    "texture": "./assets/materials/crossgems/gem/amethyst-cabochon.jpg",
    "cabochon": true,
    "pearl": false,
    "opaque": false,
    "group": "Biblioth\u00e8que mat\u00e9riaux"
  },
  "cg-amethyst": {
    "label": "Amethyst",
    "color": "#674a7a",
    "fire": "#a876c8",
    "attenuation": "#543d64",
    "ior": 1.54,
    "transmission": 0.62,
    "roughness": 0.04,
    "dispersion": 0.3,
    "intensity": 2.45,
    "fireBalance": 0.46,
    "texture": "./assets/materials/crossgems/gem/amethyst.jpg",
    "cabochon": false,
    "pearl": false,
    "opaque": false,
    "group": "Biblioth\u00e8que mat\u00e9riaux"
  },
  "cg-aquamarine-cabochon": {
    "label": "Aquamarine Cabochon",
    "color": "#92b7c4",
    "fire": "#ddedf3",
    "attenuation": "#6a9dae",
    "ior": 1.58,
    "transmission": 0.36,
    "roughness": 0.17,
    "dispersion": 0.12,
    "intensity": 1.65,
    "fireBalance": 0.22,
    "texture": "./assets/materials/crossgems/gem/aquamarine-cabochon.jpg",
    "cabochon": true,
    "pearl": false,
    "opaque": false,
    "group": "Biblioth\u00e8que mat\u00e9riaux"
  },
  "cg-aquamarine": {
    "label": "Aquamarine",
    "color": "#57a8d4",
    "fire": "#b0ddf5",
    "attenuation": "#3290c3",
    "ior": 1.58,
    "transmission": 0.62,
    "roughness": 0.04,
    "dispersion": 0.3,
    "intensity": 2.45,
    "fireBalance": 0.46,
    "texture": "./assets/materials/crossgems/gem/aquamarine.jpg",
    "cabochon": false,
    "pearl": false,
    "opaque": false,
    "group": "Biblioth\u00e8que mat\u00e9riaux"
  },
  "cg-aventurine-blue-cabochon": {
    "label": "Aventurine Blue Cabochon",
    "color": "#3d7e9e",
    "fire": "#76bddf",
    "attenuation": "#326782",
    "ior": 1.54,
    "transmission": 0.18,
    "roughness": 0.17,
    "dispersion": 0.12,
    "intensity": 1.65,
    "fireBalance": 0.22,
    "texture": "./assets/materials/crossgems/gem/aventurine-blue-cabochon.jpg",
    "cabochon": true,
    "pearl": false,
    "opaque": true,
    "group": "Biblioth\u00e8que mat\u00e9riaux"
  },
  "cg-aventurine-blue": {
    "label": "Aventurine Blue",
    "color": "#1a6681",
    "fire": "#28b9ed",
    "attenuation": "#15546a",
    "ior": 1.54,
    "transmission": 0.18,
    "roughness": 0.11,
    "dispersion": 0.12,
    "intensity": 1.65,
    "fireBalance": 0.22,
    "texture": "./assets/materials/crossgems/gem/aventurine-blue.jpg",
    "cabochon": false,
    "pearl": false,
    "opaque": true,
    "group": "Biblioth\u00e8que mat\u00e9riaux"
  },
  "cg-aventurine-cabochon": {
    "label": "Aventurine Cabochon",
    "color": "#88c95a",
    "fire": "#c9f0ae",
    "attenuation": "#6db43b",
    "ior": 1.54,
    "transmission": 0.18,
    "roughness": 0.17,
    "dispersion": 0.12,
    "intensity": 1.65,
    "fireBalance": 0.22,
    "texture": "./assets/materials/crossgems/gem/aventurine-cabochon.jpg",
    "cabochon": true,
    "pearl": false,
    "opaque": true,
    "group": "Biblioth\u00e8que mat\u00e9riaux"
  },
  "cg-aventurine": {
    "label": "Aventurine",
    "color": "#6da24b",
    "fire": "#abdd8b",
    "attenuation": "#59853e",
    "ior": 1.54,
    "transmission": 0.18,
    "roughness": 0.11,
    "dispersion": 0.12,
    "intensity": 1.65,
    "fireBalance": 0.22,
    "texture": "./assets/materials/crossgems/gem/aventurine.jpg",
    "cabochon": false,
    "pearl": false,
    "opaque": true,
    "group": "Biblioth\u00e8que mat\u00e9riaux"
  },
  "cg-chalcedony-cabochon": {
    "label": "Chalcedony Cabochon",
    "color": "#618899",
    "fire": "#9ec5d6",
    "attenuation": "#50707d",
    "ior": 1.54,
    "transmission": 0.18,
    "roughness": 0.17,
    "dispersion": 0.12,
    "intensity": 1.65,
    "fireBalance": 0.22,
    "texture": "./assets/materials/crossgems/gem/chalcedony-cabochon.jpg",
    "cabochon": true,
    "pearl": false,
    "opaque": true,
    "group": "Biblioth\u00e8que mat\u00e9riaux"
  },
  "cg-chalcedony-green-cabochon": {
    "label": "Chalcedony Green Cabochon",
    "color": "#4db374",
    "fire": "#97e3b4",
    "attenuation": "#3f935f",
    "ior": 1.54,
    "transmission": 0.18,
    "roughness": 0.17,
    "dispersion": 0.12,
    "intensity": 1.65,
    "fireBalance": 0.22,
    "texture": "./assets/materials/crossgems/gem/chalcedony-green-cabochon.jpg",
    "cabochon": true,
    "pearl": false,
    "opaque": true,
    "group": "Biblioth\u00e8que mat\u00e9riaux"
  },
  "cg-chalcedony-green": {
    "label": "Chalcedony Green",
    "color": "#28914a",
    "fire": "#4ee57f",
    "attenuation": "#21773d",
    "ior": 1.54,
    "transmission": 0.18,
    "roughness": 0.11,
    "dispersion": 0.12,
    "intensity": 1.65,
    "fireBalance": 0.22,
    "texture": "./assets/materials/crossgems/gem/chalcedony-green.jpg",
    "cabochon": false,
    "pearl": false,
    "opaque": true,
    "group": "Biblioth\u00e8que mat\u00e9riaux"
  },
  "cg-chalcedony": {
    "label": "Chalcedony",
    "color": "#98b9ca",
    "fire": "#e6f1f7",
    "attenuation": "#6e9cb4",
    "ior": 1.54,
    "transmission": 0.18,
    "roughness": 0.11,
    "dispersion": 0.12,
    "intensity": 1.65,
    "fireBalance": 0.22,
    "texture": "./assets/materials/crossgems/gem/chalcedony.jpg",
    "cabochon": false,
    "pearl": false,
    "opaque": true,
    "group": "Biblioth\u00e8que mat\u00e9riaux"
  },
  "cg-citrine-cabochon": {
    "label": "Citrine Cabochon",
    "color": "#cdad74",
    "fire": "#f3e4c8",
    "attenuation": "#be944a",
    "ior": 1.54,
    "transmission": 0.36,
    "roughness": 0.17,
    "dispersion": 0.12,
    "intensity": 1.65,
    "fireBalance": 0.22,
    "texture": "./assets/materials/crossgems/gem/citrine-cabochon.jpg",
    "cabochon": true,
    "pearl": false,
    "opaque": false,
    "group": "Biblioth\u00e8que mat\u00e9riaux"
  },
  "cg-citrine": {
    "label": "Citrine",
    "color": "#b27926",
    "fire": "#f0b662",
    "attenuation": "#92631f",
    "ior": 1.54,
    "transmission": 0.62,
    "roughness": 0.04,
    "dispersion": 0.3,
    "intensity": 2.45,
    "fireBalance": 0.46,
    "texture": "./assets/materials/crossgems/gem/citrine.jpg",
    "cabochon": false,
    "pearl": false,
    "opaque": false,
    "group": "Biblioth\u00e8que mat\u00e9riaux"
  },
  "cg-diamond-black": {
    "label": "Diamond Black",
    "color": "#272726",
    "fire": "#777750",
    "attenuation": "#2e2e2d",
    "ior": 2.42,
    "transmission": 0.62,
    "roughness": 0.04,
    "dispersion": 0.88,
    "intensity": 2.45,
    "fireBalance": 0.46,
    "texture": "./assets/materials/crossgems/gem/diamond-black.png",
    "cabochon": false,
    "pearl": false,
    "opaque": false,
    "group": "Biblioth\u00e8que mat\u00e9riaux"
  },
  "cg-diamond-cabochon": {
    "label": "Diamond Cabochon",
    "color": "#e2e2e2",
    "fire": "#ffffff",
    "attenuation": "#b9b9b9",
    "ior": 2.42,
    "transmission": 0.36,
    "roughness": 0.17,
    "dispersion": 0.12,
    "intensity": 1.65,
    "fireBalance": 0.22,
    "texture": "./assets/materials/crossgems/gem/diamond-cabochon.jpg",
    "cabochon": true,
    "pearl": false,
    "opaque": false,
    "group": "Biblioth\u00e8que mat\u00e9riaux"
  },
  "cg-diamond-cognac-cabochon": {
    "label": "Diamond Cognac Cabochon",
    "color": "#f3d099",
    "fire": "#ffffff",
    "attenuation": "#ebb359",
    "ior": 2.42,
    "transmission": 0.36,
    "roughness": 0.17,
    "dispersion": 0.12,
    "intensity": 1.65,
    "fireBalance": 0.22,
    "texture": "./assets/materials/crossgems/gem/diamond-cognac-cabochon.jpg",
    "cabochon": true,
    "pearl": false,
    "opaque": false,
    "group": "Biblioth\u00e8que mat\u00e9riaux"
  },
  "cg-diamond-cognac": {
    "label": "Diamond Cognac",
    "color": "#cbb379",
    "fire": "#f3e7cb",
    "attenuation": "#bb9b4f",
    "ior": 2.42,
    "transmission": 0.62,
    "roughness": 0.04,
    "dispersion": 0.88,
    "intensity": 2.45,
    "fireBalance": 0.46,
    "texture": "./assets/materials/crossgems/gem/diamond-cognac.jpg",
    "cabochon": false,
    "pearl": false,
    "opaque": false,
    "group": "Biblioth\u00e8que mat\u00e9riaux"
  },
  "cg-diamond": {
    "label": "Diamond",
    "color": "#ccd1d6",
    "fire": "#ffffff",
    "attenuation": "#a2abb4",
    "ior": 2.42,
    "transmission": 0.62,
    "roughness": 0.04,
    "dispersion": 0.88,
    "intensity": 2.45,
    "fireBalance": 0.46,
    "texture": "./assets/materials/crossgems/gem/diamond.jpg",
    "cabochon": false,
    "pearl": false,
    "opaque": false,
    "group": "Biblioth\u00e8que mat\u00e9riaux"
  },
  "cg-emerald-cabochon": {
    "label": "Emerald Cabochon",
    "color": "#4fac80",
    "fire": "#95e0bd",
    "attenuation": "#418d69",
    "ior": 1.58,
    "transmission": 0.36,
    "roughness": 0.17,
    "dispersion": 0.12,
    "intensity": 1.65,
    "fireBalance": 0.22,
    "texture": "./assets/materials/crossgems/gem/emerald-cabochon.jpg",
    "cabochon": true,
    "pearl": false,
    "opaque": false,
    "group": "Biblioth\u00e8que mat\u00e9riaux"
  },
  "cg-emerald": {
    "label": "Emerald",
    "color": "#1f8851",
    "fire": "#37ea8c",
    "attenuation": "#197042",
    "ior": 1.58,
    "transmission": 0.62,
    "roughness": 0.04,
    "dispersion": 0.3,
    "intensity": 2.45,
    "fireBalance": 0.46,
    "texture": "./assets/materials/crossgems/gem/emerald.jpg",
    "cabochon": false,
    "pearl": false,
    "opaque": false,
    "group": "Biblioth\u00e8que mat\u00e9riaux"
  },
  "cg-garnet-cabochon": {
    "label": "Garnet Cabochon",
    "color": "#7d5257",
    "fire": "#c8828a",
    "attenuation": "#664347",
    "ior": 1.79,
    "transmission": 0.36,
    "roughness": 0.17,
    "dispersion": 0.12,
    "intensity": 1.65,
    "fireBalance": 0.22,
    "texture": "./assets/materials/crossgems/gem/garnet-cabochon.jpg",
    "cabochon": true,
    "pearl": false,
    "opaque": false,
    "group": "Biblioth\u00e8que mat\u00e9riaux"
  },
  "cg-garnet-rhodolite-cabochon": {
    "label": "Garnet Rhodolite Cabochon",
    "color": "#99707b",
    "fire": "#d7acb8",
    "attenuation": "#7f5a64",
    "ior": 1.79,
    "transmission": 0.36,
    "roughness": 0.17,
    "dispersion": 0.12,
    "intensity": 1.65,
    "fireBalance": 0.22,
    "texture": "./assets/materials/crossgems/gem/garnet-rhodolite-cabochon.jpg",
    "cabochon": true,
    "pearl": false,
    "opaque": false,
    "group": "Biblioth\u00e8que mat\u00e9riaux"
  },
  "cg-garnet-rhodolite": {
    "label": "Garnet Rhodolite",
    "color": "#6d3140",
    "fire": "#cc4c6c",
    "attenuation": "#592834",
    "ior": 1.79,
    "transmission": 0.62,
    "roughness": 0.04,
    "dispersion": 0.3,
    "intensity": 2.45,
    "fireBalance": 0.46,
    "texture": "./assets/materials/crossgems/gem/garnet-rhodolite.jpg",
    "cabochon": false,
    "pearl": false,
    "opaque": false,
    "group": "Biblioth\u00e8que mat\u00e9riaux"
  },
  "cg-garnet": {
    "label": "Garnet",
    "color": "#66272b",
    "fire": "#d13640",
    "attenuation": "#542023",
    "ior": 1.79,
    "transmission": 0.62,
    "roughness": 0.04,
    "dispersion": 0.3,
    "intensity": 2.45,
    "fireBalance": 0.46,
    "texture": "./assets/materials/crossgems/gem/garnet.jpg",
    "cabochon": false,
    "pearl": false,
    "opaque": false,
    "group": "Biblioth\u00e8que mat\u00e9riaux"
  },
  "cg-hiddenite-green-cabochon": {
    "label": "Hiddenite Green Cabochon",
    "color": "#7a8171",
    "fire": "#b8c8a4",
    "attenuation": "#646a5d",
    "ior": 1.54,
    "transmission": 0.36,
    "roughness": 0.17,
    "dispersion": 0.12,
    "intensity": 1.65,
    "fireBalance": 0.22,
    "texture": "./assets/materials/crossgems/gem/hiddenite-green-cabochon.jpg",
    "cabochon": true,
    "pearl": false,
    "opaque": false,
    "group": "Biblioth\u00e8que mat\u00e9riaux"
  },
  "cg-hiddenite-green": {
    "label": "Hiddenite Green",
    "color": "#4a814e",
    "fire": "#79cc7f",
    "attenuation": "#3d6a40",
    "ior": 1.54,
    "transmission": 0.62,
    "roughness": 0.04,
    "dispersion": 0.3,
    "intensity": 2.45,
    "fireBalance": 0.46,
    "texture": "./assets/materials/crossgems/gem/hiddenite-green.jpg",
    "cabochon": false,
    "pearl": false,
    "opaque": false,
    "group": "Biblioth\u00e8que mat\u00e9riaux"
  },
  "cg-hiddenite-yellow-cabochon": {
    "label": "Hiddenite Yellow Cabochon",
    "color": "#d8bd45",
    "fire": "#f6e7a1",
    "attenuation": "#c1a529",
    "ior": 1.54,
    "transmission": 0.36,
    "roughness": 0.17,
    "dispersion": 0.12,
    "intensity": 1.65,
    "fireBalance": 0.22,
    "texture": "./assets/materials/crossgems/gem/hiddenite-yellow-cabochon.jpg",
    "cabochon": true,
    "pearl": false,
    "opaque": false,
    "group": "Biblioth\u00e8que mat\u00e9riaux"
  },
  "cg-hiddenite-yellow": {
    "label": "Hiddenite Yellow",
    "color": "#c7a451",
    "fire": "#eed8a4",
    "attenuation": "#ae8b38",
    "ior": 1.54,
    "transmission": 0.62,
    "roughness": 0.04,
    "dispersion": 0.3,
    "intensity": 2.45,
    "fireBalance": 0.46,
    "texture": "./assets/materials/crossgems/gem/hiddenite-yellow.jpg",
    "cabochon": false,
    "pearl": false,
    "opaque": false,
    "group": "Biblioth\u00e8que mat\u00e9riaux"
  },
  "cg-jade": {
    "label": "Jade",
    "color": "#8d967f",
    "fire": "#cbd7b8",
    "attenuation": "#747d66",
    "ior": 1.54,
    "transmission": 0.18,
    "roughness": 0.11,
    "dispersion": 0.12,
    "intensity": 1.65,
    "fireBalance": 0.22,
    "texture": "./assets/materials/crossgems/gem/jade.png",
    "cabochon": false,
    "pearl": false,
    "opaque": true,
    "group": "Biblioth\u00e8que mat\u00e9riaux"
  },
  "cg-kunzite-light-violet-cabochon": {
    "label": "Kunzite Light-Violet Cabochon",
    "color": "#a47db7",
    "fire": "#dec5ea",
    "attenuation": "#8b5aa3",
    "ior": 1.54,
    "transmission": 0.36,
    "roughness": 0.17,
    "dispersion": 0.12,
    "intensity": 1.65,
    "fireBalance": 0.22,
    "texture": "./assets/materials/crossgems/gem/kunzite-light-violet-cabochon.jpg",
    "cabochon": true,
    "pearl": false,
    "opaque": false,
    "group": "Biblioth\u00e8que mat\u00e9riaux"
  },
  "cg-kunzite-light-violet": {
    "label": "Kunzite Light-Violet",
    "color": "#803eba",
    "fire": "#bc8ae9",
    "attenuation": "#693399",
    "ior": 1.54,
    "transmission": 0.62,
    "roughness": 0.04,
    "dispersion": 0.3,
    "intensity": 2.45,
    "fireBalance": 0.46,
    "texture": "./assets/materials/crossgems/gem/kunzite-light-violet.jpg",
    "cabochon": false,
    "pearl": false,
    "opaque": false,
    "group": "Biblioth\u00e8que mat\u00e9riaux"
  },
  "cg-kunzite-pink-violet-cabochon": {
    "label": "Kunzite Pink Violet Cabochon",
    "color": "#a7697f",
    "fire": "#dfacbe",
    "attenuation": "#8d5267",
    "ior": 1.54,
    "transmission": 0.36,
    "roughness": 0.17,
    "dispersion": 0.12,
    "intensity": 1.65,
    "fireBalance": 0.22,
    "texture": "./assets/materials/crossgems/gem/kunzite-pink-violet-cabochon.jpg",
    "cabochon": true,
    "pearl": false,
    "opaque": false,
    "group": "Biblioth\u00e8que mat\u00e9riaux"
  },
  "cg-kunzite-pink-violet": {
    "label": "Kunzite Pink Violet",
    "color": "#9f486d",
    "fire": "#dc85aa",
    "attenuation": "#823b59",
    "ior": 1.54,
    "transmission": 0.62,
    "roughness": 0.04,
    "dispersion": 0.3,
    "intensity": 2.45,
    "fireBalance": 0.46,
    "texture": "./assets/materials/crossgems/gem/kunzite-pink-violet.jpg",
    "cabochon": false,
    "pearl": false,
    "opaque": false,
    "group": "Biblioth\u00e8que mat\u00e9riaux"
  },
  "cg-lapis-lazuli": {
    "label": "Lapis Lazuli",
    "color": "#404c8e",
    "fire": "#7181d7",
    "attenuation": "#343e74",
    "ior": 1.54,
    "transmission": 0.18,
    "roughness": 0.11,
    "dispersion": 0.12,
    "intensity": 1.65,
    "fireBalance": 0.22,
    "texture": "./assets/materials/crossgems/gem/lapis-lazuli.jpg",
    "cabochon": false,
    "pearl": false,
    "opaque": true,
    "group": "Biblioth\u00e8que mat\u00e9riaux"
  },
  "cg-malachite": {
    "label": "Malachite",
    "color": "#096e4f",
    "fire": "#00f1a7",
    "attenuation": "#075a41",
    "ior": 1.54,
    "transmission": 0.18,
    "roughness": 0.11,
    "dispersion": 0.12,
    "intensity": 1.65,
    "fireBalance": 0.22,
    "texture": "./assets/materials/crossgems/gem/malachite.jpg",
    "cabochon": false,
    "pearl": false,
    "opaque": true,
    "group": "Biblioth\u00e8que mat\u00e9riaux"
  },
  "cg-opal-black": {
    "label": "Opal Black",
    "color": "#5d655e",
    "fire": "#89b48e",
    "attenuation": "#4c534d",
    "ior": 1.54,
    "transmission": 0.18,
    "roughness": 0.11,
    "dispersion": 0.12,
    "intensity": 1.65,
    "fireBalance": 0.22,
    "texture": "./assets/materials/crossgems/gem/opal-black.jpg",
    "cabochon": false,
    "pearl": false,
    "opaque": true,
    "group": "Biblioth\u00e8que mat\u00e9riaux"
  },
  "cg-opal-white": {
    "label": "Opal White",
    "color": "#adb8b8",
    "fire": "#ecf4f4",
    "attenuation": "#8b9a9a",
    "ior": 1.54,
    "transmission": 0.18,
    "roughness": 0.11,
    "dispersion": 0.12,
    "intensity": 1.65,
    "fireBalance": 0.22,
    "texture": "./assets/materials/crossgems/gem/opal-white.jpg",
    "cabochon": false,
    "pearl": false,
    "opaque": true,
    "group": "Biblioth\u00e8que mat\u00e9riaux"
  },
  "cg-pearl-black": {
    "label": "Pearl Black",
    "color": "#6f7a75",
    "fire": "#a0c3b3",
    "attenuation": "#5b6460",
    "ior": 1.54,
    "transmission": 0.18,
    "roughness": 0.24,
    "dispersion": 0.12,
    "intensity": 1.65,
    "fireBalance": 0.22,
    "texture": "./assets/materials/crossgems/gem/pearl-black.png",
    "cabochon": false,
    "pearl": true,
    "opaque": true,
    "group": "Biblioth\u00e8que mat\u00e9riaux"
  },
  "cg-pearl-golden": {
    "label": "Pearl Golden",
    "color": "#c7b796",
    "fire": "#f5efe2",
    "attenuation": "#b19b6d",
    "ior": 1.54,
    "transmission": 0.18,
    "roughness": 0.24,
    "dispersion": 0.12,
    "intensity": 1.65,
    "fireBalance": 0.22,
    "texture": "./assets/materials/crossgems/gem/pearl-golden.png",
    "cabochon": false,
    "pearl": true,
    "opaque": true,
    "group": "Biblioth\u00e8que mat\u00e9riaux"
  },
  "cg-pearl-gray": {
    "label": "Pearl Gray",
    "color": "#b5b2b0",
    "fire": "#f3efec",
    "attenuation": "#96928f",
    "ior": 1.54,
    "transmission": 0.18,
    "roughness": 0.24,
    "dispersion": 0.12,
    "intensity": 1.65,
    "fireBalance": 0.22,
    "texture": "./assets/materials/crossgems/gem/pearl-gray.png",
    "cabochon": false,
    "pearl": true,
    "opaque": true,
    "group": "Biblioth\u00e8que mat\u00e9riaux"
  },
  "cg-pearl-lab": {
    "label": "Pearl Lab",
    "color": "#c1bfb9",
    "fire": "#fbfbf9",
    "attenuation": "#a19e95",
    "ior": 1.54,
    "transmission": 0.18,
    "roughness": 0.24,
    "dispersion": 0.12,
    "intensity": 1.65,
    "fireBalance": 0.22,
    "texture": "./assets/materials/crossgems/gem/pearl-lab.png",
    "cabochon": false,
    "pearl": true,
    "opaque": true,
    "group": "Biblioth\u00e8que mat\u00e9riaux"
  },
  "cg-pearl-pink": {
    "label": "Pearl Pink",
    "color": "#cdbcb8",
    "fire": "#ffffff",
    "attenuation": "#b0958f",
    "ior": 1.54,
    "transmission": 0.18,
    "roughness": 0.24,
    "dispersion": 0.12,
    "intensity": 1.65,
    "fireBalance": 0.22,
    "texture": "./assets/materials/crossgems/gem/pearl-pink.png",
    "cabochon": false,
    "pearl": true,
    "opaque": true,
    "group": "Biblioth\u00e8que mat\u00e9riaux"
  },
  "cg-pearl-white": {
    "label": "Pearl White",
    "color": "#a5a9a5",
    "fire": "#dfeadf",
    "attenuation": "#868c86",
    "ior": 1.54,
    "transmission": 0.18,
    "roughness": 0.24,
    "dispersion": 0.12,
    "intensity": 1.65,
    "fireBalance": 0.22,
    "texture": "./assets/materials/crossgems/gem/pearl-white.png",
    "cabochon": false,
    "pearl": true,
    "opaque": true,
    "group": "Biblioth\u00e8que mat\u00e9riaux"
  },
  "cg-precious-beryl-yellow-green-cabochon": {
    "label": "Precious Beryl Yellow Green Cabochon",
    "color": "#b2c28a",
    "fire": "#e9f1d5",
    "attenuation": "#98ae63",
    "ior": 1.58,
    "transmission": 0.36,
    "roughness": 0.17,
    "dispersion": 0.12,
    "intensity": 1.65,
    "fireBalance": 0.22,
    "texture": "./assets/materials/crossgems/gem/precious-beryl-yellow-green-cabochon.jpg",
    "cabochon": true,
    "pearl": false,
    "opaque": false,
    "group": "Biblioth\u00e8que mat\u00e9riaux"
  },
  "cg-precious-beryl-yellow-green": {
    "label": "Precious Beryl Yellow Green",
    "color": "#7f9d20",
    "fire": "#c7ef48",
    "attenuation": "#68811a",
    "ior": 1.58,
    "transmission": 0.62,
    "roughness": 0.04,
    "dispersion": 0.3,
    "intensity": 2.45,
    "fireBalance": 0.46,
    "texture": "./assets/materials/crossgems/gem/precious-beryl-yellow-green.jpg",
    "cabochon": false,
    "pearl": false,
    "opaque": false,
    "group": "Biblioth\u00e8que mat\u00e9riaux"
  },
  "cg-quartz-rose-cabochon": {
    "label": "Quartz Rose Cabochon",
    "color": "#bfaac3",
    "fire": "#f6f0f8",
    "attenuation": "#a283a8",
    "ior": 1.54,
    "transmission": 0.36,
    "roughness": 0.17,
    "dispersion": 0.12,
    "intensity": 1.65,
    "fireBalance": 0.22,
    "texture": "./assets/materials/crossgems/gem/quartz-rose-cabochon.jpg",
    "cabochon": true,
    "pearl": false,
    "opaque": false,
    "group": "Biblioth\u00e8que mat\u00e9riaux"
  },
  "cg-quartz-rose": {
    "label": "Quartz Rose",
    "color": "#cd8eb3",
    "fire": "#f6dfed",
    "attenuation": "#ba6396",
    "ior": 1.54,
    "transmission": 0.62,
    "roughness": 0.04,
    "dispersion": 0.3,
    "intensity": 2.45,
    "fireBalance": 0.46,
    "texture": "./assets/materials/crossgems/gem/quartz-rose.jpg",
    "cabochon": false,
    "pearl": false,
    "opaque": false,
    "group": "Biblioth\u00e8que mat\u00e9riaux"
  },
  "cg-quartz-smokey-cabochon": {
    "label": "Quartz Smokey Cabochon",
    "color": "#978271",
    "fire": "#d6bfad",
    "attenuation": "#7d6a5c",
    "ior": 1.54,
    "transmission": 0.36,
    "roughness": 0.17,
    "dispersion": 0.12,
    "intensity": 1.65,
    "fireBalance": 0.22,
    "texture": "./assets/materials/crossgems/gem/quartz-smokey-cabochon.jpg",
    "cabochon": true,
    "pearl": false,
    "opaque": false,
    "group": "Biblioth\u00e8que mat\u00e9riaux"
  },
  "cg-quartz-smokey": {
    "label": "Quartz Smokey",
    "color": "#796151",
    "fire": "#c59b7f",
    "attenuation": "#635042",
    "ior": 1.54,
    "transmission": 0.62,
    "roughness": 0.04,
    "dispersion": 0.3,
    "intensity": 2.45,
    "fireBalance": 0.46,
    "texture": "./assets/materials/crossgems/gem/quartz-smokey.jpg",
    "cabochon": false,
    "pearl": false,
    "opaque": false,
    "group": "Biblioth\u00e8que mat\u00e9riaux"
  },
  "cg-ruby-cabochon": {
    "label": "Ruby Cabochon",
    "color": "#a9486b",
    "fire": "#e08baa",
    "attenuation": "#8b3b58",
    "ior": 1.77,
    "transmission": 0.36,
    "roughness": 0.17,
    "dispersion": 0.12,
    "intensity": 1.65,
    "fireBalance": 0.22,
    "texture": "./assets/materials/crossgems/gem/ruby-cabochon.jpg",
    "cabochon": true,
    "pearl": false,
    "opaque": false,
    "group": "Biblioth\u00e8que mat\u00e9riaux"
  },
  "cg-ruby": {
    "label": "Ruby",
    "color": "#ab2b4a",
    "fire": "#ec6585",
    "attenuation": "#8c233d",
    "ior": 1.77,
    "transmission": 0.62,
    "roughness": 0.04,
    "dispersion": 0.3,
    "intensity": 2.45,
    "fireBalance": 0.46,
    "texture": "./assets/materials/crossgems/gem/ruby.jpg",
    "cabochon": false,
    "pearl": false,
    "opaque": false,
    "group": "Biblioth\u00e8que mat\u00e9riaux"
  },
  "cg-sapphire-cabochon": {
    "label": "Sapphire Cabochon",
    "color": "#3f618f",
    "fire": "#719cd8",
    "attenuation": "#345075",
    "ior": 1.77,
    "transmission": 0.36,
    "roughness": 0.17,
    "dispersion": 0.12,
    "intensity": 1.65,
    "fireBalance": 0.22,
    "texture": "./assets/materials/crossgems/gem/sapphire-cabochon.jpg",
    "cabochon": true,
    "pearl": false,
    "opaque": false,
    "group": "Biblioth\u00e8que mat\u00e9riaux"
  },
  "cg-sapphire": {
    "label": "Sapphire",
    "color": "#14418b",
    "fire": "#2373f7",
    "attenuation": "#103572",
    "ior": 1.77,
    "transmission": 0.62,
    "roughness": 0.04,
    "dispersion": 0.3,
    "intensity": 2.45,
    "fireBalance": 0.46,
    "texture": "./assets/materials/crossgems/gem/sapphire.jpg",
    "cabochon": false,
    "pearl": false,
    "opaque": false,
    "group": "Biblioth\u00e8que mat\u00e9riaux"
  },
  "cg-topaz-blue-cabochon": {
    "label": "Topaz Blue Cabochon",
    "color": "#5c8193",
    "fire": "#96bfd3",
    "attenuation": "#4b6a79",
    "ior": 1.62,
    "transmission": 0.36,
    "roughness": 0.17,
    "dispersion": 0.12,
    "intensity": 1.65,
    "fireBalance": 0.22,
    "texture": "./assets/materials/crossgems/gem/topaz-blue-cabochon.jpg",
    "cabochon": true,
    "pearl": false,
    "opaque": false,
    "group": "Biblioth\u00e8que mat\u00e9riaux"
  },
  "cg-topaz-blue": {
    "label": "Topaz Blue",
    "color": "#3d809c",
    "fire": "#75bfde",
    "attenuation": "#326980",
    "ior": 1.62,
    "transmission": 0.62,
    "roughness": 0.04,
    "dispersion": 0.3,
    "intensity": 2.45,
    "fireBalance": 0.46,
    "texture": "./assets/materials/crossgems/gem/topaz-blue.jpg",
    "cabochon": false,
    "pearl": false,
    "opaque": false,
    "group": "Biblioth\u00e8que mat\u00e9riaux"
  },
  "cg-topaz-orange-cabochon": {
    "label": "Topaz Orange Cabochon",
    "color": "#c5894d",
    "fire": "#edc69f",
    "attenuation": "#a97037",
    "ior": 1.62,
    "transmission": 0.36,
    "roughness": 0.17,
    "dispersion": 0.12,
    "intensity": 1.65,
    "fireBalance": 0.22,
    "texture": "./assets/materials/crossgems/gem/topaz-orange-cabochon.jpg",
    "cabochon": true,
    "pearl": false,
    "opaque": false,
    "group": "Biblioth\u00e8que mat\u00e9riaux"
  },
  "cg-topaz-orange": {
    "label": "Topaz Orange",
    "color": "#c16929",
    "fire": "#f2a872",
    "attenuation": "#9e5622",
    "ior": 1.62,
    "transmission": 0.62,
    "roughness": 0.04,
    "dispersion": 0.3,
    "intensity": 2.45,
    "fireBalance": 0.46,
    "texture": "./assets/materials/crossgems/gem/topaz-orange.jpg",
    "cabochon": false,
    "pearl": false,
    "opaque": false,
    "group": "Biblioth\u00e8que mat\u00e9riaux"
  },
  "cg-tourmaline-pink-cabochon": {
    "label": "Tourmaline Pink Cabochon",
    "color": "#bb84a6",
    "fire": "#edcde0",
    "attenuation": "#a75f8b",
    "ior": 1.64,
    "transmission": 0.36,
    "roughness": 0.17,
    "dispersion": 0.12,
    "intensity": 1.65,
    "fireBalance": 0.22,
    "texture": "./assets/materials/crossgems/gem/tourmaline-pink-cabochon.jpg",
    "cabochon": true,
    "pearl": false,
    "opaque": false,
    "group": "Biblioth\u00e8que mat\u00e9riaux"
  },
  "cg-tourmaline-pink": {
    "label": "Tourmaline Pink",
    "color": "#a9547e",
    "fire": "#de99bb",
    "attenuation": "#8b4567",
    "ior": 1.64,
    "transmission": 0.62,
    "roughness": 0.04,
    "dispersion": 0.3,
    "intensity": 2.45,
    "fireBalance": 0.46,
    "texture": "./assets/materials/crossgems/gem/tourmaline-pink.jpg",
    "cabochon": false,
    "pearl": false,
    "opaque": false,
    "group": "Biblioth\u00e8que mat\u00e9riaux"
  },
  "cg-turquoise": {
    "label": "Turquoise",
    "color": "#55b0b8",
    "fire": "#a1e1e7",
    "attenuation": "#41949c",
    "ior": 1.54,
    "transmission": 0.18,
    "roughness": 0.11,
    "dispersion": 0.12,
    "intensity": 1.65,
    "fireBalance": 0.22,
    "texture": "./assets/materials/crossgems/gem/turquoise.jpg",
    "cabochon": false,
    "pearl": false,
    "opaque": true,
    "group": "Biblioth\u00e8que mat\u00e9riaux"
  },
  "cg-zircon-cabochon": {
    "label": "Zircon Cabochon",
    "color": "#cbc5ca",
    "fire": "#ffffff",
    "attenuation": "#a99fa7",
    "ior": 1.92,
    "transmission": 0.36,
    "roughness": 0.17,
    "dispersion": 0.12,
    "intensity": 1.65,
    "fireBalance": 0.22,
    "texture": "./assets/materials/crossgems/gem/zircon-cabochon.jpg",
    "cabochon": true,
    "pearl": false,
    "opaque": false,
    "group": "Biblioth\u00e8que mat\u00e9riaux"
  },
  "cg-zircon": {
    "label": "Zircon",
    "color": "#9fa09f",
    "fire": "#d6e3d6",
    "attenuation": "#828382",
    "ior": 1.92,
    "transmission": 0.62,
    "roughness": 0.04,
    "dispersion": 0.3,
    "intensity": 2.45,
    "fireBalance": 0.46,
    "texture": "./assets/materials/crossgems/gem/zircon.jpg",
    "cabochon": false,
    "pearl": false,
    "opaque": false,
    "group": "Biblioth\u00e8que mat\u00e9riaux"
  }
});


const rhinoMaterialSheetGemPresets = [
  ["rh7-aquamarine-cabochon", "Aquamarine cabochon", "#8adfed", "#d7fbff", 1.58, 0.34, 0.18, 0.13, true, false, false, 0.08],
  ["rh7-jet-cabochon", "Jet cabochon", "#030303", "#6f6f6f", 1.66, 0.03, 0.24, 0.03, true, true, false, 0.0],
  ["rh7-purple-cabochon", "Purple cabochon", "#8c47b3", "#dfb2ff", 1.56, 0.28, 0.2, 0.1, true, false, false, 0.12],
  ["rh7-topaze-cabochon", "Topaze cabochon", "#ed8708", "#ffe09a", 1.62, 0.32, 0.18, 0.12, true, false, false, 0.1],
  ["rh7-blue-agata", "Blue Agata", "#0f52ba", "#75b9ff", 1.53, 0.1, 0.34, 0.08, true, true, false, 0.02],
  ["rh7-green-agate", "Green Agate", "#0a7f3f", "#8ee8a8", 1.53, 0.12, 0.34, 0.08, true, true, false, 0.02],
  ["rh7-red-agata", "Red Agata", "#d61f2c", "#ff8c8c", 1.53, 0.1, 0.34, 0.08, true, true, false, 0.02],
  ["rh7-malachite", "Malachite", "#0b7b3a", "#72e595", 1.66, 0.04, 0.42, 0.04, true, true, false, 0.0],
  ["rh7-onyx", "Onyx", "#070707", "#dfdfd8", 1.54, 0.02, 0.26, 0.03, true, true, false, 0.0],
  ["rh7-quartz", "Quartz", "#e9f3f4", "#ffffff", 1.54, 0.62, 0.055, 0.22, false, false, false, 0.05],
  ["rh7-clear-crystal", "Clear", "#f7fbff", "#ffffff", 1.52, 0.76, 0.018, 0.18, false, false, false, 0.04],
  ["rh7-rhodochrosite", "Rhodochrosite", "#e8889f", "#ffd2df", 1.6, 0.12, 0.3, 0.08, true, true, false, 0.02],
  ["rh7-tiger-eye", "Tiger Eye", "#b48f6b", "#ffd06f", 1.54, 0.08, 0.36, 0.1, true, true, false, 0.08],
  ["rh7-aurore-boreale", "Aurore Boreale", "#9cb3b7", "#f2b9ff", 1.52, 0.72, 0.035, 0.58, false, false, false, 0.72],
  ["rh7-aquamarine", "Aquamarine", "#87e5ee", "#d8ffff", 1.58, 0.72, 0.026, 0.3, false, false, false, 0.08],
  ["rh7-pink", "Pink", "#fac8ee", "#ffd4f6", 1.55, 0.66, 0.035, 0.34, false, false, false, 0.1],
  ["rh7-jet-cristal", "Jet cristal", "#050506", "#81818d", 1.66, 0.1, 0.09, 0.16, false, true, false, 0.0],
  ["rh7-majestic-blue", "Majestic Blue", "#04236f", "#5f8cff", 1.64, 0.58, 0.035, 0.36, false, false, false, 0.16],
  ["rh7-emerald", "Emerald", "#50c878", "#a8ffd1", 1.58, 0.58, 0.055, 0.22, false, false, false, 0.08],
  ["rh7-heliotrope", "Heliotrope", "#57306f", "#d18bff", 1.55, 0.54, 0.05, 0.3, false, false, false, 0.24],
  ["rh7-mandarine", "Mandarine", "#f2bb94", "#ffd19d", 1.61, 0.62, 0.035, 0.36, false, false, false, 0.1],
  ["rh7-volcano-swarovsky", "Volcano Swarovsky", "#ff6b08", "#ffe658", 1.58, 0.72, 0.028, 0.68, false, false, false, 0.7],
  ["rh7-volcano", "Volcano", "#ffb000", "#ff4fbd", 1.58, 0.72, 0.03, 0.64, false, false, false, 0.62],
  ["rh7-chrysolite", "Chrysolite", "#aae15c", "#eaff9d", 1.67, 0.66, 0.034, 0.34, false, false, false, 0.08],
  ["rh7-red-magma", "Red Magma", "#ae0000", "#ff765f", 1.76, 0.5, 0.045, 0.42, false, false, false, 0.12],
  ["rh7-vitrail", "Vitrail", "#8f58ff", "#ffd15a", 1.58, 0.74, 0.03, 0.82, false, false, false, 0.88],
  ["rh7-spring", "Spring", "#dfffaf", "#ffffff", 1.54, 0.68, 0.04, 0.28, false, false, false, 0.2],
  ["rh7-smoked-topaze", "Smoked topaze", "#815f3d", "#e5b277", 1.62, 0.5, 0.055, 0.22, false, false, false, 0.04],
  ["rh7-golden-shadow", "Golden Shadow", "#f6bc77", "#ffe4ab", 1.58, 0.7, 0.03, 0.48, false, false, false, 0.36],
  ["rh7-ocean", "Ocean", "#3fbf7f", "#93ffe4", 1.56, 0.66, 0.035, 0.42, false, false, false, 0.34],
  ["rh7-citrine-shimmer", "Citrine Shimmer", "#f2bb94", "#fff07b", 1.54, 0.7, 0.03, 0.56, false, false, false, 0.42],
  ["rh7-sunshine-shimmer", "Sunshine Shimmer", "#ebc231", "#fff47a", 1.54, 0.68, 0.032, 0.5, false, false, false, 0.36],
  ["rh7-siam-shimmer", "Siam Shimmer", "#9d1035", "#ff6d93", 1.76, 0.56, 0.04, 0.44, false, false, false, 0.24],
  ["rh7-black-diamond-shimmer", "Black diamond Shimmer", "#1a1a1d", "#ffffff", 2.42, 0.28, 0.018, 0.7, false, false, false, 0.22],
  ["rh7-peridot-shimmer", "Peridot Shimmer", "#8bd44e", "#e7ff95", 1.67, 0.66, 0.032, 0.44, false, false, false, 0.22],
  ["rh7-cobalt-shimmer", "Cobalt Shimmer", "#184ed5", "#75b8ff", 1.62, 0.62, 0.032, 0.52, false, false, false, 0.28],
  ["rh7-silk-shimmer", "Silk Shimmer", "#f1d1b4", "#fff2df", 1.54, 0.52, 0.09, 0.24, true, false, true, 0.28],
  ["rh7-tangerine-shimmer", "Tangerine Shimmer", "#ff8b2b", "#ffd26a", 1.61, 0.64, 0.035, 0.5, false, false, false, 0.22],
  ["rh7-cristal-shine", "Cristal Shine", "#ffffff", "#dff6ff", 2.42, 0.94, 0.008, 0.88, false, false, false, 0.18],
  ["rh7-violet-blue", "Violet Blue", "#8d6ec7", "#7ec8ff", 1.58, 0.66, 0.03, 0.56, false, false, false, 0.44],
  ["rh7-fuschia", "Fuschia", "#d247b0", "#ff9de5", 1.62, 0.62, 0.034, 0.42, false, false, false, 0.14],
  ["rh7-paradise-shine", "Paradise Shine", "#9cb3b7", "#ff9fe7", 1.58, 0.72, 0.03, 0.8, false, false, false, 0.86],
  ["rh7-ghost-light", "Ghost Light", "#c7b1d7", "#ffffff", 1.52, 0.64, 0.08, 0.38, true, false, false, 0.54],
  ["rh7-silver-night", "Silver Night", "#22242c", "#cfd6ff", 1.62, 0.46, 0.055, 0.48, false, false, false, 0.28],
  ["rh7-capriblue", "Capriblue", "#8bb6d9", "#c8f5ff", 1.58, 0.68, 0.028, 0.38, false, false, false, 0.18],
  ["rh7-los-angeles", "Los angeles", "#61ce81", "#ffc364", 1.57, 0.68, 0.036, 0.66, false, false, false, 0.72],
  ["rh7-purple", "Purple", "#ad76b6", "#e0b5ff", 1.56, 0.62, 0.035, 0.34, false, false, false, 0.12],
  ["rh7-ruby-cabochon", "Ruby Cabochon", "#e0115f", "#ff7ea7", 1.76, 0.34, 0.18, 0.12, true, false, false, 0.08],
];

function registerRhinoMaterialSheetGemPresets() {
  rhinoMaterialSheetGemPresets.forEach(([id, label, color, fire, ior, transmission, roughness, dispersion, cabochon, opaque, pearl, iridescence]) => {
    if (gemPresets[id] || Object.values(gemPresets).some((preset) => preset.label === label)) return;
    gemPresets[id] = {
      label,
      color,
      fire,
      attenuation: color,
      ior,
      transmission,
      roughness,
      dispersion,
      intensity: cabochon || opaque ? 1.75 : 2.7,
      fireBalance: Math.min(0.92, 0.24 + dispersion * 0.75 + iridescence * 0.18),
      cabochon,
      opaque,
      pearl,
      iridescence,
      group: "Bibliothèque Rhino mat\u00e9riaux",
    };
  });
}

registerRhinoMaterialSheetGemPresets();

const metalPresets = {
  "yellow-gold": {
    label: "Or jaune 18k",
    color: "#e7ad42",
    roughness: 0.082,
    clearcoatRoughness: 0.038,
    env: 1.36,
  },
  "white-gold": {
    label: "Or blanc",
    color: "#e4dfd4",
    roughness: 0.085,
    clearcoatRoughness: 0.045,
    env: 1.22,
  },
  "rose-gold": {
    label: "Or rose",
    color: "#e6a07f",
    roughness: 0.11,
    clearcoatRoughness: 0.06,
    env: 1.14,
  },
  platinum: {
    label: "Platine",
    color: "#d8d9d6",
    roughness: 0.075,
    clearcoatRoughness: 0.04,
    env: 1.3,
  },
  silver: {
    label: "Argent poli",
    color: "#f0eee8",
    roughness: 0.06,
    clearcoatRoughness: 0.035,
    env: 1.38,
  },
  "black-rhodium": {
    label: "Rhodium noir",
    color: "#2b2a2a",
    roughness: 0.14,
    clearcoatRoughness: 0.08,
    env: 1.05,
  },
  "aluminum-gray": {
    label: "Aluminium poli gris",
    color: "#bec2c3",
    roughness: 0.105,
    clearcoatRoughness: 0.045,
    env: 1.28,
    group: "Aluminium anodisé",
  },
  "aluminum-black": {
    label: "Aluminium anodisé noir",
    color: "#171819",
    roughness: 0.13,
    clearcoatRoughness: 0.055,
    env: 1.16,
    group: "Aluminium anodisé",
  },
  "aluminum-red": {
    label: "Aluminium anodisé rouge",
    color: "#be2332",
    roughness: 0.12,
    clearcoatRoughness: 0.052,
    env: 1.18,
    group: "Aluminium anodisé",
  },
  "aluminum-violet": {
    label: "Aluminium anodisé violet",
    color: "#6847c4",
    roughness: 0.12,
    clearcoatRoughness: 0.052,
    env: 1.18,
    group: "Aluminium anodisé",
  },
  "aluminum-pink": {
    label: "Aluminium anodisé rose",
    color: "#d45f91",
    roughness: 0.12,
    clearcoatRoughness: 0.052,
    env: 1.18,
    group: "Aluminium anodisé",
  },
  "aluminum-green": {
    label: "Aluminium anodisé vert",
    color: "#2d9a63",
    roughness: 0.12,
    clearcoatRoughness: 0.052,
    env: 1.18,
    group: "Aluminium anodisé",
  },
  "aluminum-blue": {
    label: "Aluminium anodisé bleu",
    color: "#2469c9",
    roughness: 0.12,
    clearcoatRoughness: 0.052,
    env: 1.18,
    group: "Aluminium anodisé",
  },
  "aluminum-gold": {
    label: "Aluminium anodisé or",
    color: "#d5ac43",
    roughness: 0.115,
    clearcoatRoughness: 0.05,
    env: 1.21,
    group: "Aluminium anodisé",
  },
  "aluminum-orange": {
    label: "Aluminium anodisé orange",
    color: "#d66a24",
    roughness: 0.12,
    clearcoatRoughness: 0.052,
    env: 1.18,
    group: "Aluminium anodisé",
  },
  "titanium-polished": {
    label: "Titane poli",
    color: "#9fa1a0",
    roughness: 0.085,
    clearcoatRoughness: 0.04,
    env: 1.32,
    group: "Titane",
  },
  "stainless-mirror-silver": {
    label: "Inox poli miroir argent",
    color: "#f5f7f6",
    roughness: 0.015,
    clearcoatRoughness: 0.008,
    env: 1.72,
    group: "Inox poli miroir",
  },
  "stainless-mirror-gold": {
    label: "Inox poli miroir or",
    color: "#f0c869",
    roughness: 0.018,
    clearcoatRoughness: 0.01,
    env: 1.68,
    group: "Inox poli miroir",
  },
  "stainless-flash-gold-1-micron": {
    label: "Inox flash or 1 micron",
    color: "#f2c65f",
    roughness: 0.022,
    clearcoatRoughness: 0.012,
    env: 1.7,
    group: "Inox poli miroir",
  },
};

Object.assign(metalPresets, {
  "cg-aluminum-aquamarine": {
    "label": "Aluminum Aquamarine",
    "color": "#a3c0c5",
    "roughness": 0.16,
    "clearcoatRoughness": 0.09,
    "env": 1.12,
    "preview": "./assets/materials/crossgems/metal/all/aluminum-aquamarine.png",
    "group": "Biblioth\u00e8que mat\u00e9riaux"
  },
  "cg-aluminum-berry": {
    "label": "Aluminum Berry",
    "color": "#8f116d",
    "roughness": 0.16,
    "clearcoatRoughness": 0.09,
    "env": 1.12,
    "preview": "./assets/materials/crossgems/metal/all/aluminum-berry.png",
    "group": "Biblioth\u00e8que mat\u00e9riaux"
  },
  "cg-aluminum-blue": {
    "label": "Aluminum Blue",
    "color": "#1b60c7",
    "roughness": 0.16,
    "clearcoatRoughness": 0.09,
    "env": 1.12,
    "preview": "./assets/materials/crossgems/metal/all/aluminum-blue.png",
    "group": "Biblioth\u00e8que mat\u00e9riaux"
  },
  "cg-aluminum-forest": {
    "label": "Aluminum Forest",
    "color": "#6f9c78",
    "roughness": 0.16,
    "clearcoatRoughness": 0.09,
    "env": 1.12,
    "preview": "./assets/materials/crossgems/metal/all/aluminum-forest.png",
    "group": "Biblioth\u00e8que mat\u00e9riaux"
  },
  "cg-aluminum-fuchsia": {
    "label": "Aluminum Fuchsia",
    "color": "#b239c5",
    "roughness": 0.16,
    "clearcoatRoughness": 0.09,
    "env": 1.12,
    "preview": "./assets/materials/crossgems/metal/all/aluminum-fuchsia.png",
    "group": "Biblioth\u00e8que mat\u00e9riaux"
  },
  "cg-aluminum-lime": {
    "label": "Aluminum Lime",
    "color": "#6aaf4d",
    "roughness": 0.16,
    "clearcoatRoughness": 0.09,
    "env": 1.12,
    "preview": "./assets/materials/crossgems/metal/all/aluminum-lime.png",
    "group": "Biblioth\u00e8que mat\u00e9riaux"
  },
  "cg-aluminum-olive": {
    "label": "Aluminum Olive",
    "color": "#8f8d6f",
    "roughness": 0.16,
    "clearcoatRoughness": 0.09,
    "env": 1.12,
    "preview": "./assets/materials/crossgems/metal/all/aluminum-olive.png",
    "group": "Biblioth\u00e8que mat\u00e9riaux"
  },
  "cg-aluminum-orange": {
    "label": "Aluminum Orange",
    "color": "#c69f15",
    "roughness": 0.16,
    "clearcoatRoughness": 0.09,
    "env": 1.12,
    "preview": "./assets/materials/crossgems/metal/all/aluminum-orange.png",
    "group": "Biblioth\u00e8que mat\u00e9riaux"
  },
  "cg-aluminum-orchid": {
    "label": "Aluminum Orchid",
    "color": "#9b94b7",
    "roughness": 0.16,
    "clearcoatRoughness": 0.09,
    "env": 1.12,
    "preview": "./assets/materials/crossgems/metal/all/aluminum-orchid.png",
    "group": "Biblioth\u00e8que mat\u00e9riaux"
  },
  "cg-aluminum-purple": {
    "label": "Aluminum Purple",
    "color": "#764fb4",
    "roughness": 0.16,
    "clearcoatRoughness": 0.09,
    "env": 1.12,
    "preview": "./assets/materials/crossgems/metal/all/aluminum-purple.png",
    "group": "Biblioth\u00e8que mat\u00e9riaux"
  },
  "cg-aluminum": {
    "label": "Aluminum",
    "color": "#bfbebe",
    "roughness": 0.16,
    "clearcoatRoughness": 0.09,
    "env": 1.12,
    "preview": "./assets/materials/crossgems/metal/all/aluminum.png",
    "group": "Biblioth\u00e8que mat\u00e9riaux"
  },
  "cg-brass": {
    "label": "Brass",
    "color": "#cac89f",
    "roughness": 0.11,
    "clearcoatRoughness": 0.07,
    "env": 1.18,
    "preview": "./assets/materials/crossgems/metal/all/brass.png",
    "group": "Biblioth\u00e8que mat\u00e9riaux"
  },
  "cg-bronze": {
    "label": "Bronze",
    "color": "#75564c",
    "roughness": 0.11,
    "clearcoatRoughness": 0.07,
    "env": 1.18,
    "preview": "./assets/materials/crossgems/metal/all/bronze.png",
    "group": "Biblioth\u00e8que mat\u00e9riaux"
  },
  "cg-copper": {
    "label": "Copper",
    "color": "#c58248",
    "roughness": 0.11,
    "clearcoatRoughness": 0.07,
    "env": 1.18,
    "preview": "./assets/materials/crossgems/metal/all/copper.png",
    "group": "Biblioth\u00e8que mat\u00e9riaux"
  },
  "cg-green-gold-10k": {
    "label": "Green Gold 10K",
    "color": "#b9c78b",
    "roughness": 0.075,
    "clearcoatRoughness": 0.04,
    "env": 1.32,
    "preview": "./assets/materials/crossgems/metal/all/green-gold-10k.png",
    "group": "Biblioth\u00e8que mat\u00e9riaux"
  },
  "cg-green-gold-14k": {
    "label": "Green Gold 14K",
    "color": "#b9c78b",
    "roughness": 0.075,
    "clearcoatRoughness": 0.04,
    "env": 1.32,
    "preview": "./assets/materials/crossgems/metal/all/green-gold-14k.png",
    "group": "Biblioth\u00e8que mat\u00e9riaux"
  },
  "cg-green-gold-18k-sand-blast": {
    "label": "Green Gold 18K Sand Blast",
    "color": "#becf8b",
    "roughness": 0.22,
    "clearcoatRoughness": 0.16,
    "env": 1.05,
    "preview": "./assets/materials/crossgems/metal/all/green-gold-18k-sand-blast.png",
    "group": "Biblioth\u00e8que mat\u00e9riaux"
  },
  "cg-green-gold-18k": {
    "label": "Green Gold 18K",
    "color": "#b9c78b",
    "roughness": 0.075,
    "clearcoatRoughness": 0.04,
    "env": 1.32,
    "preview": "./assets/materials/crossgems/metal/all/green-gold-18k.png",
    "group": "Biblioth\u00e8que mat\u00e9riaux"
  },
  "cg-palladium-18k": {
    "label": "Palladium 18K",
    "color": "#b2b2b1",
    "roughness": 0.075,
    "clearcoatRoughness": 0.04,
    "env": 1.32,
    "preview": "./assets/materials/crossgems/metal/all/palladium-18k.png",
    "group": "Biblioth\u00e8que mat\u00e9riaux"
  },
  "cg-platinum-950-sand-blast": {
    "label": "Platinum 950 Sand Blast",
    "color": "#b7b7b7",
    "roughness": 0.22,
    "clearcoatRoughness": 0.16,
    "env": 1.05,
    "preview": "./assets/materials/crossgems/metal/all/platinum-950-sand-blast.png",
    "group": "Biblioth\u00e8que mat\u00e9riaux"
  },
  "cg-platinum-950": {
    "label": "Platinum 950",
    "color": "#b2b2b1",
    "roughness": 0.075,
    "clearcoatRoughness": 0.04,
    "env": 1.32,
    "preview": "./assets/materials/crossgems/metal/all/platinum-950.png",
    "group": "Biblioth\u00e8que mat\u00e9riaux"
  },
  "cg-rhodium": {
    "label": "Rhodium",
    "color": "#b2b2b1",
    "roughness": 0.075,
    "clearcoatRoughness": 0.04,
    "env": 1.32,
    "preview": "./assets/materials/crossgems/metal/all/rhodium.png",
    "group": "Biblioth\u00e8que mat\u00e9riaux"
  },
  "cg-rose-gold-10k": {
    "label": "Rose Gold 10K",
    "color": "#d0a983",
    "roughness": 0.075,
    "clearcoatRoughness": 0.04,
    "env": 1.32,
    "preview": "./assets/materials/crossgems/metal/all/rose-gold-10k.png",
    "group": "Biblioth\u00e8que mat\u00e9riaux"
  },
  "cg-rose-gold-14k": {
    "label": "Rose Gold 14K",
    "color": "#d0a983",
    "roughness": 0.075,
    "clearcoatRoughness": 0.04,
    "env": 1.32,
    "preview": "./assets/materials/crossgems/metal/all/rose-gold-14k.png",
    "group": "Biblioth\u00e8que mat\u00e9riaux"
  },
  "cg-rose-gold-18k-sand-blast": {
    "label": "Rose Gold 18K Sand Blast",
    "color": "#e7be92",
    "roughness": 0.22,
    "clearcoatRoughness": 0.16,
    "env": 1.05,
    "preview": "./assets/materials/crossgems/metal/all/rose-gold-18k-sand-blast.png",
    "group": "Biblioth\u00e8que mat\u00e9riaux"
  },
  "cg-rose-gold-18k": {
    "label": "Rose Gold 18K",
    "color": "#d0a983",
    "roughness": 0.075,
    "clearcoatRoughness": 0.04,
    "env": 1.32,
    "preview": "./assets/materials/crossgems/metal/all/rose-gold-18k.png",
    "group": "Biblioth\u00e8que mat\u00e9riaux"
  },
  "cg-silver-925-sand-blast": {
    "label": "Silver 925 Sand Blast",
    "color": "#b7b7b7",
    "roughness": 0.22,
    "clearcoatRoughness": 0.16,
    "env": 1.05,
    "preview": "./assets/materials/crossgems/metal/all/silver-925-sand-blast.png",
    "group": "Biblioth\u00e8que mat\u00e9riaux"
  },
  "cg-silver-925": {
    "label": "Silver 925",
    "color": "#b2b2b1",
    "roughness": 0.075,
    "clearcoatRoughness": 0.04,
    "env": 1.32,
    "preview": "./assets/materials/crossgems/metal/all/silver-925.png",
    "group": "Biblioth\u00e8que mat\u00e9riaux"
  },
  "cg-steel": {
    "label": "Steel",
    "color": "#aeafb1",
    "roughness": 0.16,
    "clearcoatRoughness": 0.09,
    "env": 1.12,
    "preview": "./assets/materials/crossgems/metal/all/steel.png",
    "group": "Biblioth\u00e8que mat\u00e9riaux"
  },
  "cg-titanium": {
    "label": "Titanium",
    "color": "#8b8b8a",
    "roughness": 0.16,
    "clearcoatRoughness": 0.09,
    "env": 1.12,
    "preview": "./assets/materials/crossgems/metal/all/titanium.png",
    "group": "Biblioth\u00e8que mat\u00e9riaux"
  },
  "cg-tungsten": {
    "label": "Tungsten",
    "color": "#868c8a",
    "roughness": 0.16,
    "clearcoatRoughness": 0.09,
    "env": 1.12,
    "preview": "./assets/materials/crossgems/metal/all/tungsten.png",
    "group": "Biblioth\u00e8que mat\u00e9riaux"
  },
  "cg-white-gold-10k": {
    "label": "White Gold 10K",
    "color": "#b2b2b1",
    "roughness": 0.075,
    "clearcoatRoughness": 0.04,
    "env": 1.32,
    "preview": "./assets/materials/crossgems/metal/all/white-gold-10k.png",
    "group": "Biblioth\u00e8que mat\u00e9riaux"
  },
  "cg-white-gold-14k": {
    "label": "White Gold 14K",
    "color": "#b2b2b1",
    "roughness": 0.075,
    "clearcoatRoughness": 0.04,
    "env": 1.32,
    "preview": "./assets/materials/crossgems/metal/all/white-gold-14k.png",
    "group": "Biblioth\u00e8que mat\u00e9riaux"
  },
  "cg-white-gold-18k-sand-blast": {
    "label": "White Gold 18K Sand Blast",
    "color": "#b7b7b7",
    "roughness": 0.22,
    "clearcoatRoughness": 0.16,
    "env": 1.05,
    "preview": "./assets/materials/crossgems/metal/all/white-gold-18k-sand-blast.png",
    "group": "Biblioth\u00e8que mat\u00e9riaux"
  },
  "cg-white-gold-18k": {
    "label": "White Gold 18K",
    "color": "#b2b2b1",
    "roughness": 0.075,
    "clearcoatRoughness": 0.04,
    "env": 1.32,
    "preview": "./assets/materials/crossgems/metal/all/white-gold-18k.png",
    "group": "Biblioth\u00e8que mat\u00e9riaux"
  },
  "cg-yellow-gold-10k": {
    "label": "Yellow Gold 10K",
    "color": "#d0bb83",
    "roughness": 0.075,
    "clearcoatRoughness": 0.04,
    "env": 1.32,
    "preview": "./assets/materials/crossgems/metal/all/yellow-gold-10k.png",
    "group": "Biblioth\u00e8que mat\u00e9riaux"
  },
  "cg-yellow-gold-14k": {
    "label": "Yellow Gold 14K",
    "color": "#d0bb83",
    "roughness": 0.075,
    "clearcoatRoughness": 0.04,
    "env": 1.32,
    "preview": "./assets/materials/crossgems/metal/all/yellow-gold-14k.png",
    "group": "Biblioth\u00e8que mat\u00e9riaux"
  },
  "cg-yellow-gold-18k-sand-blast": {
    "label": "Yellow Gold 18K Sand Blast",
    "color": "#e7d392",
    "roughness": 0.22,
    "clearcoatRoughness": 0.16,
    "env": 1.05,
    "preview": "./assets/materials/crossgems/metal/all/yellow-gold-18k-sand-blast.png",
    "group": "Biblioth\u00e8que mat\u00e9riaux"
  },
  "cg-yellow-gold-18k": {
    "label": "Yellow Gold 18K",
    "color": "#d0bb83",
    "roughness": 0.075,
    "clearcoatRoughness": 0.04,
    "env": 1.32,
    "preview": "./assets/materials/crossgems/metal/all/yellow-gold-18k.png",
    "group": "Biblioth\u00e8que mat\u00e9riaux"
  },
  "cg-yellow-gold-19-25k": {
    "label": "Yellow Gold 19.25K",
    "color": "#d0bb83",
    "roughness": 0.075,
    "clearcoatRoughness": 0.04,
    "env": 1.32,
    "preview": "./assets/materials/crossgems/metal/all/yellow-gold-19-25k.png",
    "group": "Biblioth\u00e8que mat\u00e9riaux"
  },
  "cg-yellow-gold-22k": {
    "label": "Yellow Gold 22K",
    "color": "#d0bb83",
    "roughness": 0.075,
    "clearcoatRoughness": 0.04,
    "env": 1.32,
    "preview": "./assets/materials/crossgems/metal/all/yellow-gold-22k.png",
    "group": "Biblioth\u00e8que mat\u00e9riaux"
  },
  "cg-yellow-gold-24k": {
    "label": "Yellow Gold 24K",
    "color": "#d0bb83",
    "roughness": 0.075,
    "clearcoatRoughness": 0.04,
    "env": 1.32,
    "preview": "./assets/materials/crossgems/metal/all/yellow-gold-24k.png",
    "group": "Biblioth\u00e8que mat\u00e9riaux"
  }
});

const supportPresets = {
  "velvet-black": { label: "Velours noir", color: "#151213", roughness: 0.9, metalness: 0, env: 0.16, sheen: 0.82, sheenColor: "#3a2532" },
  "velvet-burgundy": { label: "Velours bordeaux", color: "#2b0711", roughness: 0.9, metalness: 0, env: 0.09, sheen: 0.82, sheenColor: "#7b1d35" },
  walnut: { label: "Bois noyer satiné", color: "#3b2114", roughness: 0.58, metalness: 0, env: 0.24, sheen: 0.18, sheenColor: "#8a5637" },
  ebony: { label: "Bois ébène", color: "#090706", roughness: 0.42, metalness: 0, env: 0.2, sheen: 0.16, sheenColor: "#2b211c" },
  "marble-white": { label: "Marbre blanc veine", color: "#d9d4c8", roughness: 0.34, metalness: 0, env: 0.34, sheen: 0.08, sheenColor: "#ffffff" },
  "marble-black": { label: "Marbre noir", color: "#09090a", roughness: 0.28, metalness: 0, env: 0.3, sheen: 0.08, sheenColor: "#6c6c70" },
  travertine: { label: "Pierre travertin", color: "#a48b68", roughness: 0.72, metalness: 0, env: 0.14, sheen: 0.05, sheenColor: "#d7c19a" },
  slate: { label: "Ardoise sombre", color: "#11161a", roughness: 0.76, metalness: 0, env: 0.12, sheen: 0.04, sheenColor: "#5d6870" },
  ivory: { label: "Ivoire mat", color: "#d8c9ad", roughness: 0.66, metalness: 0, env: 0.16, sheen: 0.1, sheenColor: "#fff1d4" },
  leather: { label: "Cuir brun graine", color: "#2c160e", roughness: 0.68, metalness: 0, env: 0.16, sheen: 0.26, sheenColor: "#7a4427" },
  "champagne-satin": { label: "Satin champagne", color: "#8e7b5d", roughness: 0.5, metalness: 0, env: 0.2, sheen: 0.65, sheenColor: "#f3d99f" },
  "chrome-mirror": { label: "Chrome miroir", color: "#c8c8c5", roughness: 0.08, metalness: 1, env: 0.9, sheen: 0, sheenColor: "#ffffff" },
};

Object.assign(supportPresets, {
  hidden: { label: "Sol masque", hidden: true, family: "none", color: "#000000", accent: "#000000", roughness: 1, metalness: 0, env: 0, sheen: 0, sheenColor: "#000000" },
  "velvet-black": { ...supportPresets["velvet-black"], family: "velvet", accent: "#3a3032", roughness: 0.92, sheen: 0.88, texture: "./assets/materials/crossgems/velvet/black.png", textureRepeat: [2.4, 2.4], normalStrength: 0.035 },
  "velvet-burgundy": { ...supportPresets["velvet-burgundy"], family: "velvet", accent: "#7b1d35", roughness: 0.92, sheen: 0.92, texture: "./assets/materials/crossgems/velvet/red.png", textureRepeat: [2.4, 2.4], normalStrength: 0.035 },
  "velvet-emerald": { label: "Velours vert \u00e9meraude", family: "velvet", color: "#061c17", accent: "#0f6d55", roughness: 0.93, metalness: 0, env: 0.08, sheen: 0.88, sheenColor: "#1a8065", texture: "./assets/materials/crossgems/velvet/green.png", textureRepeat: [2.4, 2.4], normalStrength: 0.035 },
  "velvet-sapphire": { label: "Velours bleu nuit", family: "velvet", color: "#050917", accent: "#123a78", roughness: 0.93, metalness: 0, env: 0.08, sheen: 0.88, sheenColor: "#1b4d91", texture: "./assets/materials/crossgems/velvet/blue.png", textureRepeat: [2.4, 2.4], normalStrength: 0.035 },
  "velvet-ivory": { label: "Velours ivoire", family: "velvet", color: "#c9bda3", accent: "#fff3cf", roughness: 0.9, metalness: 0, env: 0.11, sheen: 0.78, sheenColor: "#fff1d4", texture: "./assets/materials/crossgems/velvet/white.png", textureRepeat: [2.1, 2.1], normalStrength: 0.03 },
  walnut: { ...supportPresets.walnut, label: "Bois noyer satin\u00e9", family: "wood", color: "#4a2a18", accent: "#c58a52", grain: "#241008", roughness: 0.46, env: 0.32, sheen: 0.14, sheenColor: "#d09a62", texture: "./assets/materials/crossgems/wood/moabi.jpg", textureRepeat: [3.2, 1.55], textureRotation: Math.PI / 2, normalStrength: 0.04, clearcoat: 0.3, clearcoatRoughness: 0.22 },
  ebony: { ...supportPresets.ebony, family: "wood", accent: "#4c3a2e", grain: "#050403", roughness: 0.48, texture: "./assets/materials/crossgems/wood/koto.jpg", textureRepeat: [3.5, 1.7], textureRotation: Math.PI / 2, normalStrength: 0.035, clearcoat: 0.26, clearcoatRoughness: 0.25 },
  mahogany: { label: "Bois acajou poli", family: "wood", color: "#4a160d", accent: "#c46a3d", grain: "#210805", roughness: 0.4, metalness: 0, env: 0.28, sheen: 0.16, sheenColor: "#c46d45", texture: "./assets/materials/crossgems/wood/moabi.jpg", textureRepeat: [3.0, 1.45], textureRotation: Math.PI / 2, normalStrength: 0.04, clearcoat: 0.34, clearcoatRoughness: 0.2 },
  "oak-smoked": { label: "Bois chêne fumé", family: "wood", color: "#3b3024", accent: "#b08a5f", grain: "#1c1710", roughness: 0.54, metalness: 0, env: 0.22, sheen: 0.1, sheenColor: "#9a7a55", texture: "./assets/materials/crossgems/wood/koto.jpg", textureRepeat: [3.8, 1.8], textureRotation: Math.PI / 2, normalStrength: 0.04, clearcoat: 0.22, clearcoatRoughness: 0.32 },
  rosewood: { label: "Bois palissandre", family: "wood", color: "#2a0b0b", accent: "#b85d45", grain: "#130303", roughness: 0.42, metalness: 0, env: 0.27, sheen: 0.16, sheenColor: "#b75a48", texture: "./assets/materials/crossgems/wood/moabi.jpg", textureRepeat: [2.8, 1.35], textureRotation: Math.PI / 2, normalStrength: 0.04, clearcoat: 0.32, clearcoatRoughness: 0.22 },
  "marble-white": { ...supportPresets["marble-white"], family: "marble", accent: "#7d7a74", roughness: 0.24, texture: "./assets/materials/crossgems/marble/white.png", textureRepeat: [1.18, 1.18], normalStrength: 0.07, clearcoat: 0.38, clearcoatRoughness: 0.16 },
  "marble-black": { ...supportPresets["marble-black"], family: "marble", accent: "#b9b2a0", roughness: 0.22, texture: "./assets/materials/crossgems/marble/black.png", textureRepeat: [1.18, 1.18], normalStrength: 0.065, clearcoat: 0.4, clearcoatRoughness: 0.14 },
  "marble-green": { label: "Marbre vert Alpi", family: "marble", color: "#102b20", accent: "#d8d1aa", roughness: 0.24, metalness: 0, env: 0.34, sheen: 0.06, sheenColor: "#a2d1ba", texture: "./assets/materials/crossgems/marble/green.png", textureRepeat: [1.15, 1.15], normalStrength: 0.07, clearcoat: 0.4, clearcoatRoughness: 0.15 },
  "marble-rose": { label: "Marbre rose portugais", family: "marble", color: "#b98b82", accent: "#fff0df", roughness: 0.3, metalness: 0, env: 0.31, sheen: 0.08, sheenColor: "#ffd8cf", texture: "./assets/materials/crossgems/marble/brown.png", textureRepeat: [1.2, 1.2], normalStrength: 0.065, clearcoat: 0.34, clearcoatRoughness: 0.18 },
  "marble-champagne": { label: "Marbre champagne", family: "marble", color: "#b9a276", accent: "#fff0c9", roughness: 0.28, metalness: 0, env: 0.32, sheen: 0.08, sheenColor: "#f5dfad", texture: "./assets/materials/crossgems/marble/brown.png", textureRepeat: [1.16, 1.16], normalStrength: 0.06, clearcoat: 0.34, clearcoatRoughness: 0.18 },
  travertine: { ...supportPresets.travertine, family: "stone", textureStyle: "travertine", color: "#b59a72", accent: "#e0c99f", grain: "#6f604b", roughness: 0.78, textureRepeat: [1.05, 1.05], normalStrength: 0.075, clearcoat: 0.02, clearcoatRoughness: 0.78 },
  slate: { ...supportPresets.slate, family: "stone", accent: "#5d6870", roughness: 0.8, texture: "./assets/materials/crossgems/marble/dark-grey.png", textureRepeat: [1.45, 1.45], normalStrength: 0.11, clearcoat: 0.03, clearcoatRoughness: 0.72 },
  limestone: { label: "Pierre calcaire claire", family: "stone", color: "#c4b79b", accent: "#f1dfb9", roughness: 0.82, metalness: 0, env: 0.12, sheen: 0.04, sheenColor: "#ead8b0", texture: "./assets/materials/crossgems/stone/chalcedony.jpg", textureRepeat: [1.55, 1.55], normalStrength: 0.13, clearcoat: 0.02, clearcoatRoughness: 0.75 },
  basalt: { label: "Basalte adouci", family: "stone", color: "#151514", accent: "#57534b", roughness: 0.7, metalness: 0, env: 0.15, sheen: 0.03, sheenColor: "#6a665e", texture: "./assets/materials/crossgems/stone/opal-black.jpg", textureRepeat: [1.7, 1.7], normalStrength: 0.1, clearcoat: 0.05, clearcoatRoughness: 0.58 },
  "onyx-honey": { label: "Onyx miel translucide", family: "marble", color: "#9b6428", accent: "#ffd27a", roughness: 0.22, metalness: 0, env: 0.4, sheen: 0.1, sheenColor: "#ffe0a0", texture: "./assets/materials/crossgems/stone/citrine.png", textureRepeat: [1.12, 1.12], normalStrength: 0.045, clearcoat: 0.46, clearcoatRoughness: 0.12 },
  ivory: { ...supportPresets.ivory, family: "stone", accent: "#fff1d4", roughness: 0.62, texture: "./assets/materials/crossgems/resin/white.png", textureRepeat: [1.25, 1.25], normalStrength: 0.045, clearcoat: 0.16, clearcoatRoughness: 0.36 },
  leather: { ...supportPresets.leather, family: "leather", accent: "#7a4427", roughness: 0.68, texture: "./assets/materials/crossgems/leather/brown-plastic.png", textureRepeat: [2.6, 2.6], normalStrength: 0.12, clearcoat: 0.08, clearcoatRoughness: 0.5 },
  "champagne-satin": { ...supportPresets["champagne-satin"], family: "velvet", accent: "#f3d99f", roughness: 0.72, texture: "./assets/materials/crossgems/velvet/yellow.png", textureRepeat: [2.0, 2.0], normalStrength: 0.03, clearcoat: 0.12, clearcoatRoughness: 0.38 },
  "pbr-walnut-relief": { label: "PBR noyer rainure", family: "wood", textureStyle: "luxury-wood", color: "#3a1e10", accent: "#c38954", grain: "#160806", roughness: 0.42, metalness: 0, env: 0.3, sheen: 0.14, sheenColor: "#bd8156", textureRepeat: [2.6, 1.25], textureRotation: Math.PI / 2, normalStrength: 0.075, clearcoat: 0.34, clearcoatRoughness: 0.2 },
  "pbr-ebony-ribbed": { label: "PBR ébène rainuré", family: "wood", textureStyle: "luxury-wood", color: "#080604", accent: "#5d4a37", grain: "#010101", roughness: 0.38, metalness: 0, env: 0.32, sheen: 0.1, sheenColor: "#574636", textureRepeat: [2.9, 1.35], textureRotation: Math.PI / 2, normalStrength: 0.085, clearcoat: 0.42, clearcoatRoughness: 0.16 },
  "pbr-marble-calacatta": { label: "PBR marbre Calacatta", family: "marble", textureStyle: "calacatta", color: "#ece5d7", accent: "#7c7467", grain: "#c7a15b", roughness: 0.2, metalness: 0, env: 0.38, sheen: 0.06, sheenColor: "#ffffff", textureRepeat: [0.92, 0.92], normalStrength: 0.055, clearcoat: 0.46, clearcoatRoughness: 0.12 },
  "pbr-marble-nero-gold": { label: "PBR marbre Nero or", family: "marble", textureStyle: "calacatta", color: "#070707", accent: "#e0c172", grain: "#40362a", roughness: 0.19, metalness: 0, env: 0.42, sheen: 0.06, sheenColor: "#e0c172", textureRepeat: [0.95, 0.95], normalStrength: 0.052, clearcoat: 0.5, clearcoatRoughness: 0.1 },
  "pbr-travertine-filled": { label: "PBR travertin rempli", family: "stone", textureStyle: "travertine", color: "#b89f76", accent: "#ead3a6", grain: "#77654c", roughness: 0.72, metalness: 0, env: 0.14, sheen: 0.04, sheenColor: "#ead3a6", textureRepeat: [0.88, 0.88], normalStrength: 0.105, clearcoat: 0.03, clearcoatRoughness: 0.7 },
  "pbr-limestone-brushed": { label: "PBR calcaire brossé", family: "stone", textureStyle: "brushed-stone", color: "#bfb392", accent: "#efe1bd", grain: "#756d5b", roughness: 0.86, metalness: 0, env: 0.1, sheen: 0.03, sheenColor: "#e8d7b5", textureRepeat: [1.1, 1.1], normalStrength: 0.11, clearcoat: 0.01, clearcoatRoughness: 0.82 },
  "pbr-velvet-ribbed-black": { label: "PBR velours noir côtelé", family: "velvet", textureStyle: "ribbed-velvet", color: "#100e10", accent: "#3f3337", roughness: 0.95, metalness: 0, env: 0.07, sheen: 0.94, sheenColor: "#5b4a52", textureRepeat: [2.0, 2.0], normalStrength: 0.075, clearcoat: 0.02, clearcoatRoughness: 0.8 },
  "pbr-leather-full-grain": { label: "PBR cuir pleine fleur", family: "leather", textureStyle: "full-grain", color: "#35180e", accent: "#94532d", grain: "#140704", roughness: 0.62, metalness: 0, env: 0.18, sheen: 0.24, sheenColor: "#9b5b35", textureRepeat: [2.1, 2.1], normalStrength: 0.16, clearcoat: 0.12, clearcoatRoughness: 0.46 },
  "pbr-onyx-honey-polished": { label: "PBR onyx miel poli", family: "marble", textureStyle: "onyx", color: "#9b5b20", accent: "#ffd47b", grain: "#fff0bd", roughness: 0.16, metalness: 0, env: 0.46, sheen: 0.08, sheenColor: "#ffdca0", textureRepeat: [0.92, 0.92], normalStrength: 0.04, clearcoat: 0.58, clearcoatRoughness: 0.08 },
  "chrome-mirror": { ...supportPresets["chrome-mirror"], family: "metal", accent: "#ffffff", roughness: 0.1, env: 0.95, texture: "./assets/materials/crossgems/metal/rhodium.png", textureRepeat: [1.0, 1.0], normalStrength: 0.015, clearcoat: 0.6, clearcoatRoughness: 0.08 },
});


const rhinoRenderContentMaterials = {"metal":[{"label":"Acier bruni"},{"label":"Acier inoxydable bruni"},{"label":"Aluminium anodis\u00e9 bruni aigue clair"},{"label":"Aluminium anodis\u00e9 bruni bleu"},{"label":"Aluminium anodis\u00e9 bruni fuchsia"},{"label":"Aluminium anodis\u00e9 bruni olive"},{"label":"Aluminium anodis\u00e9 bruni orange"},{"label":"Aluminium anodis\u00e9 bruni orchid\u00e9e"},{"label":"Aluminium anodis\u00e9 bruni rose"},{"label":"Aluminium anodis\u00e9 bruni vert clair"},{"label":"Aluminium anodis\u00e9 bruni vert fonc\u00e9"},{"label":"Aluminium anodis\u00e9 bruni violet"},{"label":"Aluminium bruni"},{"label":"Argent bruni"},{"label":"Bronze bruni"},{"label":"Chrome bruni"},{"label":"Cuivre bruni"},{"label":"Laiton bruni"},{"label":"Or bruni"},{"label":"Or jaune bruni"},{"label":"Platine bruni"},{"label":"Titane bruni"},{"label":"Corten clair"},{"label":"Corten plus fonc\u00e9"},{"label":"Corten rouill\u00e9"},{"label":"Grille metallique \u00e9tendue"},{"label":"Grilles d'a\u00e9ration metalliques 2"},{"label":"Grilles d'a\u00e9ration metalliques 3"},{"label":"Grilles d'a\u00e9ration metalliques"},{"label":"Acier inoxydable mat"},{"label":"Acier mat"},{"label":"Aluminium anodis\u00e9 mat aigue-marine"},{"label":"Aluminium anodis\u00e9 mat bleu"},{"label":"Aluminium anodis\u00e9 mat fuchsia"},{"label":"Aluminium anodis\u00e9 mat olive"},{"label":"Aluminium anodis\u00e9 mat orange"},{"label":"Aluminium anodis\u00e9 mat orchid\u00e9e"},{"label":"Aluminium anodis\u00e9 mat rose"},{"label":"Aluminium anodis\u00e9 mat vert clair"},{"label":"Aluminium anodis\u00e9 mat vert fonc\u00e9"},{"label":"Aluminium anodis\u00e9 mat violet"},{"label":"Aluminium mat"},{"label":"Argent mat"},{"label":"Bronze mat"},{"label":"Chrome mat"},{"label":"Cuivre mat"},{"label":"Laiton mat"},{"label":"Or jaune mat"},{"label":"Or mat"},{"label":"Platine mat"},{"label":"Titane mat"},{"label":"Acier inoxydable poli"},{"label":"Acier poli"},{"label":"Aluminium anodis\u00e9 poli aigue-marine"},{"label":"Aluminium anodis\u00e9 poli bleu"},{"label":"Aluminium anodis\u00e9 poli fuchsia"},{"label":"Aluminium anodis\u00e9 poli olive"},{"label":"Aluminium anodis\u00e9 poli orange"},{"label":"Aluminium anodis\u00e9 poli orchid\u00e9e"},{"label":"Aluminium anodis\u00e9 poli rose"},{"label":"Aluminium anodis\u00e9 poli vert clair"},{"label":"Aluminium anodis\u00e9 poli vert fonc\u00e9"},{"label":"Aluminium anodis\u00e9 poli violet"},{"label":"Aluminium poli"},{"label":"Argent poli"},{"label":"Bronze poli"},{"label":"Chrome poli"},{"label":"Cuivre poli"},{"label":"Laiton poli"},{"label":"Or jaune poli"},{"label":"Or poli"},{"label":"Platine poli"},{"label":"Titane poli"},{"label":"Acier inoxydable satin\u00e9"},{"label":"Acier satin\u00e9"},{"label":"Aluminium anodis\u00e9 satin\u00e9 aigue-marine"},{"label":"Aluminium anodis\u00e9 satin\u00e9 bleu"},{"label":"Aluminium anodis\u00e9 satin\u00e9 fuchsia"},{"label":"Aluminium anodis\u00e9 satin\u00e9 olive"},{"label":"Aluminium anodis\u00e9 satin\u00e9 orange"},{"label":"Aluminium anodis\u00e9 satin\u00e9 orchid\u00e9e"},{"label":"Aluminium anodis\u00e9 satin\u00e9 rose"},{"label":"Aluminium anodis\u00e9 satin\u00e9 vert clair"},{"label":"Aluminium anodis\u00e9 satin\u00e9 vert fonc\u00e9"},{"label":"Aluminium anodis\u00e9 satin\u00e9 violet"},{"label":"Aluminium satin\u00e9"},{"label":"Argent satin\u00e9"},{"label":"Bronze satin\u00e9"},{"label":"Chrome satin\u00e9"},{"label":"Cuivre satin\u00e9"},{"label":"Laiton satin\u00e9"},{"label":"Or jaune satin\u00e9"},{"label":"Or satin\u00e9"},{"label":"Platine satin\u00e9"},{"label":"Titane satin\u00e9"},{"label":"Acier galvanis\u00e9"},{"label":"Cuivre martel\u00e9 r\u00e9fl\u00e9chissant"},{"label":"Cuivre martel\u00e9"},{"label":"Cuivre patin\u00e9"},{"label":"Fonte r\u00e9fl\u00e9chissante"},{"label":"Fonte"},{"label":"Grille metallique"},{"label":"Martel\u00e9 r\u00e9fl\u00e9chissant"},{"label":"Martel\u00e9"},{"label":"T\u00f4le en losanges 1"},{"label":"T\u00f4le en losanges 2 r\u00e9fl\u00e9chissante"},{"label":"T\u00f4le en losanges 2"},{"label":"T\u00f4le en losanges 3 r\u00e9fl\u00e9chissante"},{"label":"T\u00f4le en losanges 3"},{"label":"Metal - Flat - White"},{"label":"Metal - Flat - Yellow"},{"label":"Metal - Polished - White"},{"label":"Metal - Polished - Yellow"}],"gem":[{"label":"Verre d\u00e9poli bleu clair","kind":"crystal"},{"label":"Verre d\u00e9poli bleu fonc\u00e9","kind":"crystal"},{"label":"Verre d\u00e9poli clair","kind":"crystal"},{"label":"Verre d\u00e9poli gris","kind":"crystal"},{"label":"Verre d\u00e9poli turquoise","kind":"crystal"},{"label":"Verre d\u00e9poli vert clair","kind":"crystal"},{"label":"Verre d\u00e9poli vert moyen","kind":"crystal"},{"label":"Plexiglass","kind":"crystal"},{"label":"Verre bleu clair","kind":"crystal"},{"label":"Verre bleu fonc\u00e9","kind":"crystal"},{"label":"Verre gris","kind":"crystal"},{"label":"Verre limpide","kind":"crystal"},{"label":"Verre turquoise","kind":"crystal"},{"label":"Verre vert clair","kind":"crystal"},{"label":"Verre vert moyen","kind":"crystal"},{"label":"\u00c9mail - Black","kind":"cabochon"},{"label":"\u00c9mail - Red","kind":"cabochon"},{"label":"\u00c9mail - White","kind":"cabochon"},{"label":"Opaque - Onyx","kind":"cabochon"},{"label":"Opaque - Tigers Eye","kind":"cabochon"},{"label":"Opaque - Turquoise","kind":"cabochon"},{"label":"Realistic - Diamond","kind":"gem"},{"label":"Realistic - Emerald","kind":"gem"},{"label":"Realistic - Ruby","kind":"gem"},{"label":"Realistic - Sapphire","kind":"gem"},{"label":"Stylized - Diamond","kind":"gem"},{"label":"Stylized - Emerald","kind":"gem"},{"label":"Stylized - Ruby","kind":"gem"},{"label":"Stylized - Sapphire","kind":"gem"},{"label":"Perle - Dark Gray","kind":"cabochon"},{"label":"Perle - White","kind":"cabochon"}],"support":[{"label":"Acajou poli","family":"wood"},{"label":"Acajou \u00e0 grandes feuilles poli","family":"wood"},{"label":"Acajou \u00e0 grandes feuilles","family":"wood"},{"label":"Acajou","family":"wood"},{"label":"Agglom\u00e9r\u00e9 poli","family":"wood"},{"label":"Agglom\u00e9r\u00e9","family":"wood"},{"label":"Ani\u00e9gr\u00e9 poli","family":"wood"},{"label":"Ani\u00e9gr\u00e9","family":"wood"},{"label":"Antiaris poli","family":"wood"},{"label":"Antiaris","family":"wood"},{"label":"Buches fendues","family":"wood"},{"label":"Buches","family":"wood"},{"label":"Avodir\u00e9 poli","family":"wood"},{"label":"Avodir\u00e9","family":"wood"},{"label":"Ayous poli","family":"wood"},{"label":"Ayous","family":"wood"},{"label":"Bambou poli","family":"wood"},{"label":"Bambou","family":"wood"},{"label":"Boss\u00e9 poli","family":"wood"},{"label":"Boss\u00e9","family":"wood"},{"label":"Bouleau poli","family":"wood"},{"label":"Bouleau","family":"wood"},{"label":"Broussin 1 poli","family":"wood"},{"label":"Broussin 1","family":"wood"},{"label":"Broussin 2 poli","family":"wood"},{"label":"Broussin 2","family":"wood"},{"label":"Broussin 3 poli","family":"wood"},{"label":"Broussin 3","family":"wood"},{"label":"Broussin de ch\u00eane poli","family":"wood"},{"label":"Broussin de ch\u00eane","family":"wood"},{"label":"Broussin de platane poli","family":"wood"},{"label":"Broussin de platane","family":"wood"},{"label":"Bubinga poli","family":"wood"},{"label":"Bubinga","family":"wood"},{"label":"Cerisier fonc\u00e9 poli","family":"wood"},{"label":"Cerisier fonc\u00e9","family":"wood"},{"label":"Cerisier poli","family":"wood"},{"label":"Cerisier","family":"wood"},{"label":"Ch\u00e2taigner poli","family":"wood"},{"label":"Ch\u00e2taigner","family":"wood"},{"label":"Ch\u00eane br\u00e9silien poli","family":"wood"},{"label":"Ch\u00eane br\u00e9silien","family":"wood"},{"label":"Ch\u00eane clair poli","family":"wood"},{"label":"Ch\u00eane clair","family":"wood"},{"label":"Ch\u00eane fonc\u00e9 poli","family":"wood"},{"label":"Ch\u00eane fonc\u00e9","family":"wood"},{"label":"Ch\u00eane poli","family":"wood"},{"label":"Ch\u00eane rouge poli","family":"wood"},{"label":"Ch\u00eane rouge","family":"wood"},{"label":"Ch\u00eane","family":"wood"},{"label":"Cigu\u00eb poli","family":"wood"},{"label":"Cigu\u00eb","family":"wood"},{"label":"Contreplaqu\u00e9 poli","family":"wood"},{"label":"Contreplaqu\u00e9","family":"wood"},{"label":"C\u00e8dre rouge poli","family":"wood"},{"label":"C\u00e8dre rouge","family":"wood"},{"label":"Douglas poli","family":"wood"},{"label":"Douglas","family":"wood"},{"label":"Douka poli","family":"wood"},{"label":"Douka","family":"wood"},{"label":"Eyong jaune poli","family":"wood"},{"label":"Eyong jaune","family":"wood"},{"label":"Eyong poli","family":"wood"},{"label":"Eyong","family":"wood"},{"label":"Framir\u00e9 poli","family":"wood"},{"label":"Framir\u00e9","family":"wood"},{"label":"Fr\u00eane poli","family":"wood"},{"label":"Fr\u00eane","family":"wood"},{"label":"Fuma poli","family":"wood"},{"label":"Fuma","family":"wood"},{"label":"H\u00eatre clair poli","family":"wood"},{"label":"H\u00eatre clair","family":"wood"},{"label":"H\u00eatre poli","family":"wood"},{"label":"H\u00eatre rouge poli","family":"wood"},{"label":"H\u00eatre rouge","family":"wood"},{"label":"H\u00eatre","family":"wood"},{"label":"Igaganga poli","family":"wood"},{"label":"Igaganga","family":"wood"},{"label":"Iroko poli","family":"wood"},{"label":"Iroko","family":"wood"},{"label":"Ivindo poli","family":"wood"},{"label":"Ivindo","family":"wood"},{"label":"Kosipo poli","family":"wood"},{"label":"Kosipo","family":"wood"},{"label":"Kotib\u00e9 poli","family":"wood"},{"label":"Kotib\u00e9","family":"wood"},{"label":"Koto poli","family":"wood"},{"label":"Koto","family":"wood"},{"label":"Lauan poli","family":"wood"},{"label":"Lauan","family":"wood"},{"label":"Limba poli","family":"wood"},{"label":"Limba","family":"wood"},{"label":"Li\u00e8ge clair poli","family":"wood"},{"label":"Li\u00e8ge clair","family":"wood"},{"label":"Li\u00e8ge fonc\u00e9 poli","family":"wood"},{"label":"Li\u00e8ge fonc\u00e9","family":"wood"},{"label":"Li\u00e8ge poli","family":"wood"},{"label":"Li\u00e8ge","family":"wood"},{"label":"Louro faia poli","family":"wood"},{"label":"Louro faia rouge poli","family":"wood"},{"label":"Louro faia rouge","family":"wood"},{"label":"Louro faia","family":"wood"},{"label":"Makor\u00e9 poli","family":"wood"},{"label":"Makor\u00e9","family":"wood"},{"label":"Moabi poli","family":"wood"},{"label":"Moabi","family":"wood"},{"label":"Movingui poli","family":"wood"},{"label":"Movingui","family":"wood"},{"label":"M\u00e9l\u00e8ze poli","family":"wood"},{"label":"M\u00e9l\u00e8ze","family":"wood"},{"label":"Niangon poli","family":"wood"},{"label":"Niangon","family":"wood"},{"label":"Niov\u00e9 poli","family":"wood"},{"label":"Niov\u00e9","family":"wood"},{"label":"Noyer fonc\u00e9 poli","family":"wood"},{"label":"Noyer fonc\u00e9","family":"wood"},{"label":"Noyer marron poli","family":"wood"},{"label":"Noyer marron","family":"wood"},{"label":"Noyer moins de lignes poli","family":"wood"},{"label":"Noyer moins de lignes","family":"wood"},{"label":"Noyer poli","family":"wood"},{"label":"Noyer","family":"wood"},{"label":"Olivier poli","family":"wood"},{"label":"OlivierOlive","family":"wood"},{"label":"Orme japonais poli","family":"wood"},{"label":"Orme japonais","family":"wood"},{"label":"Orme poli","family":"wood"},{"label":"Orme rouge poli","family":"wood"},{"label":"Orme rouge","family":"wood"},{"label":"Orme","family":"wood"},{"label":"Ozigo poli","family":"wood"},{"label":"Ozigo","family":"wood"},{"label":"Palissandre poli","family":"wood"},{"label":"Palissandre","family":"wood"},{"label":"Paldao poli","family":"wood"},{"label":"Paldao","family":"wood"},{"label":"Palmier br\u00e9silien poli","family":"wood"},{"label":"Palmier br\u00e9silien","family":"wood"},{"label":"Palmier de Rio poli","family":"wood"},{"label":"Palmier de Rio","family":"wood"},{"label":"Palmier indien poli","family":"wood"},{"label":"Palmier indien","family":"wood"},{"label":"Particules poli","family":"wood"},{"label":"Particules","family":"wood"},{"label":"Peuplier poli","family":"wood"},{"label":"Peuplier","family":"wood"},{"label":"Pin argent\u00e9 poli","family":"wood"},{"label":"Pin argent\u00e9","family":"wood"},{"label":"Pin de l'Oregon fonc\u00e9 poli","family":"wood"},{"label":"Pin de l'Oregon fonc\u00e9","family":"wood"},{"label":"Pin de l'Oregon poli","family":"wood"},{"label":"Pin de l'Oregon","family":"wood"},{"label":"Pin maritime poli","family":"wood"},{"label":"Pin maritime","family":"wood"},{"label":"Pin rose poli","family":"wood"},{"label":"Pin rose","family":"wood"},{"label":"Pin sylvestre poli","family":"wood"},{"label":"PinSylvestre","family":"wood"},{"label":"Platane poli","family":"wood"},{"label":"Platane","family":"wood"},{"label":"Poirier poli","family":"wood"},{"label":"Poirier","family":"wood"},{"label":"Ramin poli","family":"wood"},{"label":"Ramin","family":"wood"},{"label":"Sapelli brun poli","family":"wood"},{"label":"Sapelli brun","family":"wood"},{"label":"Sapelli poli","family":"wood"},{"label":"Sapelli","family":"wood"},{"label":"Sorbier alisier poli","family":"wood"},{"label":"Sorbier alisier","family":"wood"},{"label":"Tan poli","family":"wood"},{"label":"Tan","family":"wood"},{"label":"Tatajuba poli","family":"wood"},{"label":"Tatajuba","family":"wood"},{"label":"Teck africain poli","family":"wood"},{"label":"Teck africain","family":"wood"},{"label":"Teck poli","family":"wood"},{"label":"Teck","family":"wood"},{"label":"Weng\u00e9 poli","family":"wood"},{"label":"Weng\u00e9","family":"wood"},{"label":"Zebrano poli","family":"wood"},{"label":"Zebrano","family":"wood"},{"label":"\u00c9b\u00e8ne poli","family":"wood"},{"label":"\u00c9b\u00e8ne","family":"wood"},{"label":"\u00c9rable clair poli","family":"wood"},{"label":"\u00c9rable clair","family":"wood"},{"label":"\u00c9rable fonc\u00e9 poli","family":"wood"},{"label":"\u00c9rable fonc\u00e9","family":"wood"},{"label":"\u00c9rable moyen","family":"wood"},{"label":"\u00c9rable moyen poli","family":"wood"},{"label":"\u00c9rable poli","family":"wood"},{"label":"\u00c9rable","family":"wood"},{"label":"Bleu imprim\u00e9 fleuri","family":"velvet"},{"label":"Capitons","family":"velvet"},{"label":"Couverture verte et bleue","family":"velvet"},{"label":"Couverture verte","family":"velvet"},{"label":"Feutre bleu","family":"velvet"},{"label":"Gros canevas marron","family":"velvet"},{"label":"Imprim\u00e9 floral rouge","family":"velvet"},{"label":"Jeans bleu clair","family":"velvet"},{"label":"Jeans bleu d\u00e9lav\u00e9","family":"velvet"},{"label":"Jeans bleu fonc\u00e9","family":"velvet"},{"label":"Jeans bleu vert","family":"velvet"},{"label":"Jeans violet bleu fonc\u00e9","family":"velvet"},{"label":"Moquette rouge bleue","family":"velvet"},{"label":"Motif fleuri cyan","family":"velvet"},{"label":"Motif texture japonaise","family":"velvet"},{"label":"Paillasson ext\u00e9rieur","family":"velvet"},{"label":"Paillasson marron bossel\u00e9","family":"velvet"},{"label":"Paillasson marron fonc\u00e9","family":"velvet"},{"label":"Paillasson noir et blanc","family":"velvet"},{"label":"Rugueux color\u00e9","family":"velvet"},{"label":"Rugueux tons de marrons","family":"velvet"},{"label":"Tapis de bain vert","family":"velvet"},{"label":"Tissu beige","family":"velvet"},{"label":"Tissu blanc","family":"velvet"},{"label":"Tissu bleu gris","family":"velvet"},{"label":"Tissu bleu noir","family":"velvet"},{"label":"Tissu carreaux rose et marron","family":"velvet"},{"label":"Tissu carreaux verts","family":"velvet"},{"label":"Tissu gris ray\u00e9","family":"velvet"},{"label":"Tissu gris","family":"velvet"},{"label":"Tissu jaune avec volutes","family":"velvet"},{"label":"Tissu marron","family":"velvet"},{"label":"Tissu noir et bleu","family":"velvet"},{"label":"Tissu rouge bleu","family":"velvet"},{"label":"Tissu rouge vert","family":"velvet"},{"label":"Tissu texture japonaise","family":"velvet"},{"label":"Tissu violet","family":"velvet"},{"label":"Voile jaune-vert","family":"velvet"},{"label":"\u00c9cossais vert","family":"velvet"},{"label":"Bleu vernis","family":"stone"},{"label":"Craquel\u00e9","family":"stone"},{"label":"Gr\u00e8s c\u00e9ramique","family":"stone"},{"label":"Porcelaine","family":"stone"},{"label":"Terracotta","family":"stone"},{"label":"Pl\u00e2tre avocat","family":"stone"},{"label":"Pl\u00e2tre beige","family":"stone"},{"label":"Pl\u00e2tre blanc ancien","family":"stone"},{"label":"Pl\u00e2tre blanc sale","family":"stone"},{"label":"Pl\u00e2tre blanc","family":"stone"},{"label":"Pl\u00e2tre bleu clair","family":"stone"},{"label":"Pl\u00e2tre bleu gris","family":"stone"},{"label":"Pl\u00e2tre bleu vert","family":"stone"},{"label":"Pl\u00e2tre brume","family":"stone"},{"label":"Pl\u00e2tre chocolat","family":"stone"},{"label":"Pl\u00e2tre eau","family":"stone"},{"label":"Pl\u00e2tre gris clair","family":"stone"},{"label":"Pl\u00e2tre gris classique","family":"stone"},{"label":"Pl\u00e2tre gris","family":"stone"},{"label":"Pl\u00e2tre lavande","family":"stone"},{"label":"Pl\u00e2tre marine","family":"stone"},{"label":"Pl\u00e2tre marron","family":"stone"},{"label":"Pl\u00e2tre noir","family":"stone"},{"label":"Pl\u00e2tre ocre","family":"stone"},{"label":"Pl\u00e2tre p\u00eache","family":"stone"},{"label":"Pl\u00e2tre rose","family":"stone"},{"label":"Pl\u00e2tre sable","family":"stone"},{"label":"Pl\u00e2tre saumon","family":"stone"},{"label":"Pl\u00e2tre sel marin","family":"stone"},{"label":"Pl\u00e2tre vert p\u00e2le","family":"stone"},{"label":"Cuir gris","family":"leather"},{"label":"Cuir marron clair","family":"leather"},{"label":"Cuir marron fonc\u00e9","family":"leather"},{"label":"Cuir rouge gris","family":"leather"},{"label":"Cuir rouge","family":"leather"},{"label":"Agneau","family":"velvet"},{"label":"Fausse fourrure","family":"velvet"},{"label":"\u00c9corce grise","family":"wood"},{"label":"\u00c9corce marron","family":"wood"},{"label":"\u00c9corce verte","family":"wood"},{"label":"Gravier gris petites pierres","family":"stone"},{"label":"Motifs de pav\u00e9s en pierre","family":"stone"},{"label":"Pav\u00e9s courts et longs","family":"stone"},{"label":"Pav\u00e9s pierre carr\u00e9s gris","family":"stone"},{"label":"Pav\u00e9s pierre carr\u00e9s","family":"stone"},{"label":"Pav\u00e9s rectangulaires avec herbe","family":"stone"},{"label":"Pav\u00e9s rectangulaires gris quinconce","family":"stone"},{"label":"Pav\u00e9s","family":"stone"},{"label":"Pierres avec herbe","family":"stone"},{"label":"Pierres incrust\u00e9es","family":"stone"},{"label":"Texture ma\u00e7onnerie gr\u00e8s color\u00e9 grossier y5159","family":"stone"},{"label":"Texture ma\u00e7onnerie gr\u00e8s color\u00e9 grossier y5168","family":"stone"},{"label":"Texture ma\u00e7onnerie gr\u00e8s color\u00e9 y5330","family":"stone"},{"label":"Texture ma\u00e7onnerie gr\u00e8s color\u00e9 y5331","family":"stone"},{"label":"Texture ma\u00e7onnerie gr\u00e8s color\u00e9 y5332","family":"stone"},{"label":"Texture ma\u00e7onnerie gr\u00e8s motif color\u00e9 y5440","family":"stone"},{"label":"Bandes de pierres 01","family":"stone"},{"label":"Bandes de pierres 02","family":"stone"},{"label":"Bandes de pierres","family":"stone"},{"label":"Blocs de pierres taill\u00e9es","family":"stone"},{"label":"Blocs en pierre taill\u00e9e diff\u00e9rentes tailles gris clair","family":"stone"},{"label":"Blocs en pierre taill\u00e9e diff\u00e9rentes tailles grises","family":"stone"},{"label":"Galets enfouis ovales","family":"stone"},{"label":"Galets enfouis","family":"stone"},{"label":"Granit clair","family":"stone"},{"label":"Granit gris fonc\u00e9","family":"stone"},{"label":"Granit noir poli","family":"stone"},{"label":"Granit noir","family":"stone"},{"label":"Granit rose","family":"stone"},{"label":"Granit rouge poli","family":"stone"},{"label":"Granit rouge","family":"stone"},{"label":"Granit \u00e0 points noir","family":"stone"},{"label":"Graviers","family":"stone"},{"label":"Gr\u00e8s clair","family":"stone"},{"label":"Gr\u00e8s gris clair","family":"stone"},{"label":"Gr\u00e8s marron clair","family":"stone"},{"label":"Gr\u00e8s marron rouge","family":"stone"},{"label":"Gr\u00e8s","family":"stone"},{"label":"Joint blanc petites pierres","family":"stone"},{"label":"Marbre bleu poli","family":"marble"},{"label":"Marbre bleu","family":"marble"},{"label":"Marbre brun poli","family":"marble"},{"label":"Marbre brun","family":"marble"},{"label":"Marbre clair poli","family":"marble"},{"label":"Marbre clair","family":"marble"},{"label":"Marbre gris brun poli","family":"marble"},{"label":"Marbre gris brun","family":"marble"},{"label":"Marbre gris poli","family":"marble"},{"label":"Marbre gris","family":"marble"},{"label":"Marbre marron poli","family":"marble"},{"label":"Marbre marron","family":"marble"},{"label":"Marbre noir poli","family":"marble"},{"label":"Marbre noir","family":"marble"},{"label":"Marbre rose poli","family":"marble"},{"label":"Marbre rose","family":"marble"},{"label":"Marbre \u00e9meul\u00e9","family":"marble"},{"label":"Motif b\u00e9ton","family":"stone"},{"label":"Mur granit rose","family":"stone"},{"label":"Mur pierres avec joint","family":"stone"},{"label":"Mur pierres nature","family":"stone"},{"label":"Mur rustique","family":"stone"},{"label":"Pav\u00e9 fonc\u00e9","family":"stone"},{"label":"Pav\u00e9 marron fonc\u00e9","family":"stone"},{"label":"Petites pierres","family":"stone"},{"label":"Pierre d'ornement","family":"stone"},{"label":"Pierre grise","family":"stone"},{"label":"Pierres avec joint blanc diff\u00e9rentes tailles et couleurs","family":"stone"},{"label":"Pierres avec joint diff\u00e9rentes formes","family":"stone"},{"label":"Pierres avec joint diff\u00e9rentes tailles et couleurs","family":"stone"},{"label":"Pierres avec joint diff\u00e9rentes tailles gris uni","family":"stone"},{"label":"Pierres diff\u00e9rentes tailles et couleurs avec joint gris","family":"stone"},{"label":"Pierres empil\u00e9es","family":"stone"},{"label":"Pierres grands formats sans joint diff\u00e9rentes tailles et couleurs","family":"stone"},{"label":"Pierres grises avec joint gris diff\u00e9rentes tailles","family":"stone"},{"label":"Pierres grises avec joint sable diff\u00e9rentes tailles","family":"stone"},{"label":"Pierres jaunes avec joint","family":"stone"},{"label":"Pierres plates sans joint claires","family":"stone"},{"label":"Pierres plates sans joint fonc\u00e9es","family":"stone"},{"label":"Pierres sans joint diff\u00e9rentes tailles et couleurs","family":"stone"},{"label":"Pierres sans joint diff\u00e9rentes tailles rectangulaires gris","family":"stone"},{"label":"Pierres sans joint jaunes et grises","family":"stone"},{"label":"Pierres sans joint ombr\u00e9es jaunes et grises","family":"stone"},{"label":"Pierres sans joint taill\u00e9es diff\u00e9rentes couleurs","family":"stone"},{"label":"Pierres taill\u00e9es avec joint diff\u00e9rentes tailles et couleurs","family":"stone"},{"label":"Pierres taill\u00e9es vieux ch\u00e2teau","family":"stone"},{"label":"Roche","family":"stone"},{"label":"Vieilles pierres al\u00e9atoires","family":"stone"},{"label":"Vieilles pierres avec joint blanc","family":"stone"},{"label":"Vieilles pierres avec joint gris et marron","family":"stone"},{"label":"Granito gris clair poli","family":"stone"},{"label":"Granito gris clair","family":"stone"},{"label":"Granito gris poli","family":"stone"},{"label":"Granito gris","family":"stone"},{"label":"Granito poli","family":"stone"},{"label":"Granito rouge vert poli","family":"stone"},{"label":"Granito rouge vert","family":"stone"},{"label":"Granito","family":"stone"},{"label":"Ardoise bleue et marron","family":"stone"},{"label":"Ardoise bleue marron","family":"stone"},{"label":"Ardoise bleue","family":"stone"},{"label":"Ardoise fonc\u00e9e","family":"stone"},{"label":"Ardoise grise","family":"stone"},{"label":"Ardoise multicolore","family":"stone"},{"label":"Bleu multicolore","family":"stone"},{"label":"Multicolore - ardoise","family":"stone"}]};

function registerRhinoRenderContentMaterials() {
  const uniqueId = (target, prefix, label) => {
    const base = `${prefix}-${label.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "material"}`;
    let id = base;
    let index = 2;
    while (target[id]) {
      id = `${base}-${index}`;
      index += 1;
    }
    return id;
  };

  const textKey = (label) => label.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
  const metalColor = (label) => {
    const key = textKey(label);
    if (key.includes("or jaune") || key.includes("yellow") || key === "or" || key.includes(" or ")) return "#d8ad43";
    if (key.includes("or blanc") || key.includes("white gold")) return "#e1ded2";
    if (key.includes("rose gold") || key.includes("or rose")) return "#d99a78";
    if (key.includes("argent") || key.includes("silver")) return "#d4d2c9";
    if (key.includes("platine") || key.includes("platinum") || key.includes("palladium")) return "#d9dbd6";
    if (key.includes("chrome") || key.includes("rhodium")) return "#e8ecec";
    if (key.includes("cuivre") || key.includes("copper")) return "#b96b42";
    if (key.includes("bronze")) return "#9b6a36";
    if (key.includes("laiton") || key.includes("brass")) return "#c49a45";
    if (key.includes("corten")) return "#8b3f25";
    if (key.includes("titane") || key.includes("titanium")) return "#8f8d88";
    if (key.includes("aluminium")) return "#bfc5c5";
    if (key.includes("acier") || key.includes("steel") || key.includes("inox")) return "#a6aaa7";
    if (key.includes("noir") || key.includes("black")) return "#111111";
    return "#bca66d";
  };
  const metalRoughness = (label) => {
    const key = textKey(label);
    if (key.includes("poli") || key.includes("polished")) return 0.055;
    if (key.includes("satine") || key.includes("satin")) return 0.18;
    if (key.includes("mat") || key.includes("flat")) return 0.36;
    if (key.includes("bruni") || key.includes("burnished")) return 0.28;
    if (key.includes("sable") || key.includes("sand")) return 0.48;
    if (key.includes("texture") || key.includes("martele") || key.includes("hammer")) return 0.42;
    return 0.16;
  };

  rhinoRenderContentMaterials.metal.forEach((entry) => {
    if (Object.values(metalPresets).some((preset) => preset.label === entry.label)) return;
    const roughness = metalRoughness(entry.label);
    const id = uniqueId(metalPresets, "rhino-metal", entry.label);
    metalPresets[id] = {
      label: entry.label,
      color: metalColor(entry.label),
      roughness,
      env: THREE.MathUtils.clamp(1.18 - roughness * 0.9, 0.48, 1.12),
      clearcoat: roughness < 0.22 ? 0.78 : 0.42,
      clearcoatRoughness: THREE.MathUtils.clamp(roughness * 0.8, 0.05, 0.42),
      group: "Rhino Render Content",
    };
  });

  const gemBase = (label) => {
    const key = textKey(label);
    let color = "#d9efff";
    let fire = "#ffffff";
    let attenuation = "#92c7ff";
    let ior = 1.52;
    let opaque = false;
    let pearl = false;
    if (key.includes("diamond") || key.includes("diamant")) { color = "#f8fbff"; fire = "#d9f7ff"; attenuation = "#ffffff"; ior = 2.417; }
    else if (key.includes("emerald") || key.includes("emeraude")) { color = "#17a85d"; fire = "#b9ffd5"; attenuation = "#075f35"; ior = 1.58; }
    else if (key.includes("ruby") || key.includes("rubis")) { color = "#b10b2f"; fire = "#ffd0df"; attenuation = "#5b0017"; ior = 1.76; }
    else if (key.includes("sapphire") || key.includes("saphir")) { color = "#174ec9"; fire = "#c8dcff"; attenuation = "#08205f"; ior = 1.77; }
    else if (key.includes("turquoise")) { color = "#28c8bc"; fire = "#d9fff8"; attenuation = "#0f6c65"; ior = 1.61; opaque = true; }
    else if (key.includes("onyx")) { color = "#060606"; fire = "#ffffff"; attenuation = "#000000"; ior = 1.53; opaque = true; }
    else if (key.includes("tigers") || key.includes("tigre")) { color = "#8c551f"; fire = "#ffd27a"; attenuation = "#2b1204"; ior = 1.54; opaque = true; }
    else if (key.includes("perle") || key.includes("pearl")) { color = key.includes("dark") || key.includes("gris") ? "#6f7376" : "#f6f2df"; fire = "#fff7d9"; attenuation = color; ior = 1.53; opaque = true; pearl = true; }
    else if (key.includes("email") || key.includes("enamel")) { color = key.includes("red") || key.includes("rouge") ? "#b20d22" : key.includes("black") || key.includes("noir") ? "#050505" : "#f3f0e8"; fire = "#ffffff"; attenuation = color; opaque = true; }
    else if (key.includes("bleu") || key.includes("blue")) { color = "#58b8ff"; fire = "#dff7ff"; attenuation = "#1b6fa0"; }
    else if (key.includes("vert") || key.includes("green")) { color = "#45b875"; fire = "#d7ffe8"; attenuation = "#167844"; }
    else if (key.includes("gris") || key.includes("gray") || key.includes("grey")) { color = "#9ca2a6"; fire = "#ffffff"; attenuation = "#53585c"; }
    return { color, fire, attenuation, ior, opaque, pearl };
  };

  rhinoRenderContentMaterials.gem.forEach((entry) => {
    if (Object.values(gemPresets).some((preset) => preset.label === entry.label)) return;
    const base = gemBase(entry.label);
    const id = uniqueId(gemPresets, entry.kind === "cabochon" ? "rhino-cabochon" : "rhino-gem", entry.label);
    gemPresets[id] = {
      label: entry.label,
      color: base.color,
      attenuation: base.attenuation,
      fire: base.fire,
      ior: base.ior,
      transmission: base.opaque ? 0.04 : 0.92,
      roughness: base.pearl ? 0.22 : base.opaque ? 0.16 : 0.035,
      dispersion: base.opaque ? 0.08 : 0.34,
      fireBalance: base.opaque ? 0.16 : 0.48,
      intensity: base.opaque ? 1.2 : 2.25,
      iridescence: base.pearl ? 0.5 : 0.12,
      opaque: base.opaque,
      pearl: base.pearl,
      group: entry.kind === "cabochon" ? "Cabochons et opaques" : "Cristaux et pierres Rhino",
    };
  });

  const supportColor = (label, family) => {
    const key = textKey(label);
    if (family === "wood") {
      if (key.includes("ebene") || key.includes("wenge")) return ["#160d08", "#5b412c", "#070403"];
      if (key.includes("acajou") || key.includes("mahogany") || key.includes("sapelli") || key.includes("palissandre")) return ["#4b180d", "#bd6d43", "#200805"];
      if (key.includes("chene") || key.includes("oak") || key.includes("hetre") || key.includes("bouleau") || key.includes("bambou")) return ["#b78a52", "#f1c985", "#6a3f1d"];
      if (key.includes("cedre") || key.includes("cerisier") || key.includes("teck")) return ["#7a3d1f", "#d18b52", "#35160a"];
      return ["#6a3f22", "#c98b55", "#2a1207"];
    }
    if (family === "marble") {
      if (key.includes("noir") || key.includes("black")) return ["#080807", "#d6d0bf", "#020202"];
      if (key.includes("vert") || key.includes("green")) return ["#123022", "#d2c48e", "#07140e"];
      if (key.includes("rose")) return ["#b98a82", "#fff0df", "#70443e"];
      return ["#d8d1c4", "#ffffff", "#7d766b"];
    }
    if (family === "leather") return key.includes("rouge") ? ["#5a1210", "#c45b45", "#210403"] : key.includes("gris") ? ["#4f4f4b", "#96938a", "#1d1d1b"] : ["#4a2412", "#a7643a", "#1f0b04"];
    if (family === "velvet") return key.includes("rouge") ? ["#3d0712", "#a1243d", "#130207"] : key.includes("bleu") ? ["#060d25", "#2c5eaa", "#02040c"] : ["#15100f", "#766457", "#060403"];
    if (family === "metal") return ["#6e6f6a", "#d8d2c4", "#252522"];
    if (key.includes("noir") || key.includes("black")) return ["#141414", "#5e5c55", "#070707"];
    if (key.includes("rouge") || key.includes("terracotta")) return ["#8b3c28", "#d2845e", "#3c140b"];
    if (key.includes("bleu")) return ["#2c5577", "#9fc6de", "#0e2535"];
    if (key.includes("vert")) return ["#2e5a3e", "#98bf8c", "#102417"];
    return ["#8a8174", "#d2c6ae", "#3b3730"];
  };

  rhinoRenderContentMaterials.support.forEach((entry) => {
    if (Object.values(supportPresets).some((preset) => preset.label === entry.label)) return;
    const [color, accent, grain] = supportColor(entry.label, entry.family);
    const id = uniqueId(supportPresets, `rhino-${entry.family}`, entry.label);
    supportPresets[id] = {
      label: entry.label,
      family: entry.family,
      color,
      accent,
      grain,
      roughness: entry.family === "marble" ? 0.28 : entry.family === "wood" ? 0.48 : entry.family === "metal" ? 0.18 : entry.family === "velvet" ? 0.9 : 0.72,
      metalness: entry.family === "metal" ? 0.7 : 0,
      env: entry.family === "metal" ? 0.62 : entry.family === "marble" ? 0.34 : entry.family === "wood" ? 0.24 : 0.12,
      sheen: entry.family === "velvet" ? 0.82 : entry.family === "leather" ? 0.2 : 0.06,
      sheenColor: accent,
      textureRepeat: getSupportTextureRepeat(entry.family),
      normalStrength: entry.family === "stone" ? 0.13 : entry.family === "wood" ? 0.045 : entry.family === "velvet" ? 0.035 : 0.08,
      clearcoat: entry.family === "marble" ? 0.36 : entry.family === "wood" ? 0.24 : entry.family === "metal" ? 0.56 : 0.08,
      clearcoatRoughness: entry.family === "marble" ? 0.16 : entry.family === "wood" ? 0.28 : 0.48,
      group: "Supports Rhino Render Content",
    };
  });
}

function normalizeSupportLabel(value = "") {
  return String(value)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
}



function inferSupportTextureStyle(preset = {}, id = "") {
  const key = normalizeSupportLabel(String(id) + " " + (preset.label || "") + " " + (preset.textureStyle || ""));
  if (key.includes("onyx")) return "onyx";
  if (key.includes("nero") || key.includes("noir") || key.includes("black")) return "nero";
  if (key.includes("vert") || key.includes("green")) return "verde";
  if (key.includes("rose") || key.includes("pink")) return "rosa";
  if (key.includes("champagne") || key.includes("brun") || key.includes("brown")) return "champagne";
  return preset.textureStyle || "calacatta";
}

function isSingleSlabSupport(preset = {}) {
  if (preset.singleSlab === false) return false;
  if (preset.singleSlab === true) return true;
  const family = preset.family || "";
  return family === "marble" || family === "stone";
}

function isArchitecturalSupportPattern(preset = {}, id = "") {
  const key = normalizeSupportLabel(String(id) + " " + (preset.label || ""));
  return [
    "galet", "gravier", "pave", "paves", "pavage", "joint", "mur ",
    "murs", "maconnerie", "bloc", "blocs", "bande de pierre",
    "bandes de pierre", "vieilles pierres", "petites pierres", "pierres avec",
    "pierres sans", "pierres taillees", "pierre carree", "rectangulaire"
  ].some((word) => key.includes(word));
}



function shouldUseSupportImageTexture(preset = {}) {
  // Imported render-content images are previews, not flat tileable PBR maps.
  return preset.useFloorBitmap === true;
}

function inferStoneSlabStyle(preset = {}, id = "") {
  const key = normalizeSupportLabel(String(id) + " " + (preset.label || "") + " " + (preset.textureStyle || ""));
  if (key.includes("travertin")) return "travertine-slab";
  if (key.includes("ardoise") || key.includes("slate")) return "slate-slab";
  if (key.includes("granit") || key.includes("granito")) return "granite-slab";
  if (key.includes("platre")) return "plaster-slab";
  if (key.includes("beton") || key.includes("ceramique") || key.includes("porcelaine")) return "ceramic-slab";
  return preset.textureStyle || "honed-stone-slab";
}



function calibrateSupportFloorMaterials() {
  Object.entries(supportPresets).forEach(([id, preset]) => {
    if (!preset || preset.hidden) return;
    const family = preset.family || "";
    const key = normalizeSupportLabel(String(id) + " " + (preset.label || ""));
    if (preset.texture && !shouldUseSupportImageTexture(preset)) {
      preset.previewTexture = preset.texture;
      delete preset.texture;
    }
    if (isArchitecturalSupportPattern(preset, id)) {
      preset.architecturalPattern = true;
      preset.singleSlab = true;
      preset.textureRepeat = [1, 1];
      preset.textureMacroScale = 1;
      preset.textureStyle = inferStoneSlabStyle(preset, id);
      preset.normalStrength = Math.min(preset.normalStrength ?? 0.026, 0.026);
      preset.roughness = Math.max(preset.roughness ?? 0.72, 0.62);
    }
    if (family === "marble") {
      preset.singleSlab = true;
      preset.textureRepeat = [1, 1];
      preset.textureMacroScale = 1;
      preset.textureStyle = inferSupportTextureStyle(preset, id);
      if (preset.texture && key.includes("marbre")) delete preset.texture;
      if (preset.textureStyle === "nero") {
        delete preset.texture;
        preset.color = preset.color || "#060606";
        preset.accent = preset.accent || "#d8d2c4";
        preset.grain = preset.grain || "#8b7445";
        preset.roughness = Math.min(preset.roughness ?? 0.22, 0.24);
        preset.env = Math.max(preset.env ?? 0.34, 0.38);
        preset.normalStrength = Math.min(preset.normalStrength ?? 0.026, 0.028);
        preset.clearcoat = Math.max(preset.clearcoat ?? 0.42, 0.48);
        preset.clearcoatRoughness = Math.min(preset.clearcoatRoughness ?? 0.14, 0.12);
      }
      return;
    }
    if (family === "stone") {
      preset.singleSlab = true;
      preset.textureRepeat = [1, 1];
      preset.textureMacroScale = 1;
      preset.textureStyle = inferStoneSlabStyle(preset, id);
      preset.normalStrength = Math.min(preset.normalStrength ?? 0.032, 0.035);
      preset.clearcoat = Math.min(preset.clearcoat ?? 0.04, 0.08);
      preset.clearcoatRoughness = Math.max(preset.clearcoatRoughness ?? 0.62, 0.58);
    }
  });
}

registerRhinoRenderContentMaterials();
calibrateSupportFloorMaterials();

const materialListTargets = [
  { id: "metal-preset", type: "metal", label: "Métal", short: "Métal" },
  { id: "object-metal-material", type: "metal", label: "Objet métal", short: "Objet métal" },
  { id: "gem-preset", type: "gem", label: "Pierre centrale", short: "Pierre" },
  { id: "object-gem-material", type: "gem", label: "Pierre objet", short: "Objet pierre" },
  { id: "support-material", type: "support", label: "Support noble", short: "Support" },
];

function getMaterialSources() {
  return {
    metal: metalPresets,
    gem: gemPresets,
    support: supportPresets,
  };
}

function makeDefaultMaterialVisibility() {
  const visibility = {};
  const sources = getMaterialSources();
  Object.entries(sources).forEach(([type, presets]) => {
    Object.keys(presets).forEach((id) => {
      const key = `${type}:${id}`;
      visibility[key] = {};
      materialListTargets.forEach((target) => {
        if (target.type === type) visibility[key][target.id] = true;
      });
    });
  });
  return visibility;
}

function readMaterialVisibility() {
  const defaults = makeDefaultMaterialVisibility();
  try {
    const saved = JSON.parse(localStorage.getItem(MATERIAL_VISIBILITY_KEY) || "{}");
    Object.entries(saved).forEach(([key, targetMap]) => {
      if (!defaults[key] || typeof targetMap !== "object") return;
      Object.keys(defaults[key]).forEach((targetId) => {
        if (typeof targetMap[targetId] === "boolean") defaults[key][targetId] = targetMap[targetId];
      });
    });
  } catch {
    localStorage.removeItem(MATERIAL_VISIBILITY_KEY);
  }
  return defaults;
}

function writeMaterialVisibility(visibility) {
  localStorage.setItem(MATERIAL_VISIBILITY_KEY, JSON.stringify(visibility));
}

function isMaterialVisibleInTarget(type, id, targetId, visibility = readMaterialVisibility()) {
  const key = `${type}:${id}`;
  return visibility[key]?.[targetId] !== false;
}

function getVisibleMaterialEntries(type, targetId, visibility = readMaterialVisibility()) {
  const presets = getMaterialSources()[type] || {};
  const entries = Object.entries(presets).filter(([id]) => isMaterialVisibleInTarget(type, id, targetId, visibility));
  return entries.length ? entries : Object.entries(presets).slice(0, 1);
}

function buildOptions(entries, selected, placeholder = "") {
  const optionHtml = entries.map(([id, preset]) => `<option value="${id}">${preset.label}</option>`).join("");
  const prefix = placeholder ? `<option value="">${placeholder}</option>` : "";
  return prefix + optionHtml;
}

function setSelectValueToVisible(select, desired, fallback) {
  if (!select) return "";
  const allowed = Array.from(select.options).some((option) => option.value === desired);
  select.value = allowed ? desired : fallback;
  return select.value;
}

function populateMaterialSelectOptions({ preserve = true } = {}) {
  const visibility = readMaterialVisibility();
  const metalEntries = getVisibleMaterialEntries("metal", "metal-preset", visibility);
  const metalSelect = document.querySelector("#metal-preset");
  const previousMetal = preserve ? metalSelect?.value || settings.metalPreset : settings.metalPreset;
  metalSelect.innerHTML = buildOptions(metalEntries);
  settings.metalPreset = setSelectValueToVisible(metalSelect, previousMetal, metalEntries[0]?.[0] || "yellow-gold");

  const objectMetalEntries = getVisibleMaterialEntries("metal", "object-metal-material", visibility);
  const objectMetalSelect = document.querySelector("#object-metal-material");
  objectMetalSelect.innerHTML = buildOptions(objectMetalEntries, "", "Choisir un métal...");
  objectMetalSelect.value = "";

  const gemEntries = getVisibleMaterialEntries("gem", "gem-preset", visibility);
  const gemSelect = document.querySelector("#gem-preset");
  const previousGem = preserve ? gemSelect?.value || "padparadscha" : "padparadscha";
  gemSelect.innerHTML = buildOptions(gemEntries);
  setSelectValueToVisible(gemSelect, previousGem, gemEntries[0]?.[0] || "padparadscha");

  const objectGemEntries = getVisibleMaterialEntries("gem", "object-gem-material", visibility);
  const objectGemSelect = document.querySelector("#object-gem-material");
  objectGemSelect.innerHTML = buildOptions(objectGemEntries, "", "Choisir une pierre...");
  objectGemSelect.value = "";

  const supportEntries = getVisibleMaterialEntries("support", "support-material", visibility);
  const supportSelect = document.querySelector("#support-material");
  const previousSupport = preserve ? supportSelect?.value || settings.supportMaterial : settings.supportMaterial;
  supportSelect.innerHTML = buildOptions(supportEntries);
  settings.supportMaterial = setSelectValueToVisible(supportSelect, previousSupport, supportEntries[0]?.[0] || "velvet-black");

  populateStoneShowcaseControls();
  ensureMaterialSelectSwatches();
}

function getMaterialVisibilityVisual(type, id) {
  if (type === "metal") return getSelectVisual({ id: "metal-preset" }, id);
  if (type === "gem") return getSelectVisual({ id: "gem-preset" }, id);
  return getSupportVisual(id);
}

function buildMaterialVisibilityLibrary() {
  const table = document.querySelector("#material-visibility-table");
  if (!table) return;
  const visibility = readMaterialVisibility();
  const sources = getMaterialSources();
  table.innerHTML = "";

  const header = document.createElement("div");
  header.className = "material-visibility__row material-visibility__row--head";
  header.innerHTML =
    "<span>Matériau</span>" +
    materialListTargets.map((target) => `<span title="${target.label}">${target.short}</span>`).join("");
  table.appendChild(header);

  Object.entries(sources).forEach(([type, presets]) => {
    const group = document.createElement("div");
    group.className = "material-visibility__group";
    group.textContent = type === "metal" ? "Métaux" : type === "gem" ? "Pierres précieuses" : "Supports";
    table.appendChild(group);

    Object.entries(presets).forEach(([id, preset]) => {
      const row = document.createElement("div");
      row.className = "material-visibility__row";
      const visual = getMaterialVisibilityVisual(type, id);
      const name = document.createElement("span");
      name.className = "material-visibility__name";
      name.innerHTML = `<i style="background:${visual.background}"></i><b>${preset.label}</b>`;
      row.appendChild(name);

      materialListTargets.forEach((target) => {
        const cell = document.createElement("label");
        cell.className = "material-visibility__cell";
        if (target.type !== type) {
          cell.innerHTML = "<span>-</span>";
          cell.setAttribute("aria-disabled", "true");
        } else {
          const input = document.createElement("input");
          input.type = "checkbox";
          input.checked = visibility[`${type}:${id}`]?.[target.id] !== false;
          input.dataset.materialType = type;
          input.dataset.materialId = id;
          input.dataset.targetId = target.id;
          input.setAttribute("aria-label", `${preset.label} dans ${target.label}`);
          cell.appendChild(input);
        }
        row.appendChild(cell);
      });
      table.appendChild(row);
    });
  });
  table.dataset.built = "true";
}

function toggleMaterialVisibilityLibrary() {
  const table = document.querySelector("#material-visibility-table");
  const toggle = document.querySelector("#material-visibility-toggle");
  const reset = document.querySelector("#material-visibility-reset");
  if (!table || !toggle) return;
  const opening = table.hidden;
  if (opening && table.dataset.built !== "true") buildMaterialVisibilityLibrary();
  table.hidden = !opening;
  toggle.setAttribute("aria-expanded", String(opening));
  toggle.textContent = opening ? "Masquer les listes" : "Gérer les listes";
  if (reset) reset.hidden = !opening;
}

function applyMaterialVisibilityChange(input) {
  const visibility = readMaterialVisibility();
  const key = `${input.dataset.materialType}:${input.dataset.materialId}`;
  if (!visibility[key]) visibility[key] = {};
  visibility[key][input.dataset.targetId] = input.checked;
  const presets = getMaterialSources()[input.dataset.materialType] || {};
  const remainingCount = Object.keys(presets).filter((id) =>
    isMaterialVisibleInTarget(input.dataset.materialType, id, input.dataset.targetId, visibility)
  ).length;
  if (!remainingCount) {
    visibility[key][input.dataset.targetId] = true;
    input.checked = true;
    showNotice("Gardez au moins un mat\u00e9riau visible dans chaque liste.");
    return;
  }
  writeMaterialVisibility(visibility);
  populateMaterialSelectOptions();
  buildMaterialVisibilityLibrary();
  showNotice("Bibliothèque de mat\u00e9riaux mise \u00e0 jour.");
}

function resetMaterialVisibilityLibrary() {
  localStorage.removeItem(MATERIAL_VISIBILITY_KEY);
  populateMaterialSelectOptions();
  const table = document.querySelector("#material-visibility-table");
  if (table) {
    table.dataset.built = "false";
    if (!table.hidden) buildMaterialVisibilityLibrary();
  }
  showNotice("Tous les mat\u00e9riaux sont de nouveau visibles dans leurs listes.");
}

const gemMaterialModelVisuals = {
  natural: { kind: "gem", background: "radial-gradient(circle at 32% 26%, #ffffff 0 9%, #ffd7f0 10% 15%, #7b4cff 42%, #190b2d 100%)" },
  "high-fire": { kind: "gem", background: "conic-gradient(from 25deg, #ff2648, #ffe45c, #25ffa7, #35a4ff, #bd4dff, #ff2648)" },
  opal: { kind: "gem", background: "radial-gradient(circle at 35% 28%, #ffffff, transparent 18%), conic-gradient(#fff4cf, #8fffe8, #d9a6ff, #fff4cf)" },
  included: { kind: "gem", background: "radial-gradient(circle at 30% 25%, #ffffff, transparent 12%), repeating-linear-gradient(35deg, #6e4422 0 3px, #b8895d 4px 8px, #332016 9px 12px)" },
  smoky: { kind: "gem", background: "radial-gradient(circle at 35% 25%, #d7c8ff, transparent 14%), linear-gradient(145deg, #4b3a61, #120d18)" },
  "milky-cabochon": { kind: "gem", background: "radial-gradient(circle at 34% 24%, #ffffff 0 16%, #f8dccf 34%, #9e6e80 100%)" },
};

function getSupportVisual(id) {
  const preset = supportPresets[id];
  if (!preset) return { kind: "support", background: "#2b2b2b" };
  const color = preset.color || "#202020";
  const accent = preset.accent || preset.sheenColor || "#ffffff";
  const family = preset.family || id.split("-")[0];
  const patterns = {
    velvet: `radial-gradient(circle at 28% 22%, ${accent}55, transparent 30%), repeating-linear-gradient(112deg, ${color} 0 7px, ${accent}22 8px 10px)`,
    wood: `linear-gradient(100deg, ${color}, ${accent}55 32%, ${color} 64%), repeating-linear-gradient(8deg, transparent 0 7px, ${accent}33 8px 11px)`,
    marble: `radial-gradient(circle at 35% 20%, #ffffff66, transparent 24%), repeating-linear-gradient(132deg, ${color} 0 14px, ${accent}88 15px 18px, ${color} 24px 36px)`,
    stone: `radial-gradient(circle at 30% 20%, ${accent}44, transparent 22%), repeating-linear-gradient(45deg, ${color} 0 8px, ${accent}22 9px 12px)`,
    leather: `repeating-radial-gradient(circle at 35% 35%, ${accent}22 0 2px, transparent 3px 7px), linear-gradient(145deg, ${color}, ${accent}55)`,
    metal: `linear-gradient(115deg, #111 0%, ${color} 25%, #fff 47%, ${accent} 62%, #222 100%)`,
  };
  return { kind: family === "metal" ? "metal" : "support", background: patterns[family] || `linear-gradient(145deg, ${color}, ${accent})` };
}

function getSelectVisual(select, value) {
  const id = select.id;
  if (id === "metal-preset" || id === "object-metal-material") {
    const preset = metalPresets[value] || metalPresets["yellow-gold"];
    const gradient = `linear-gradient(115deg, #2b1b08 0%, ${preset.color} 34%, #fff5bf 48%, ${preset.color} 62%, #3a260a 100%)`;
    return { kind: "metal", background: preset.preview ? `${gradient}, url("${preset.preview}") center / cover` : gradient };
  }
  if (id === "support-material") return getSupportVisual(value);
  if (id === "stone-showcase-geometry") return { kind: "gem", background: getStoneGeometryVisual(value) };
  if (id === "gem-preset" || id === "object-gem-material" || id === "stone-showcase-material") {
    const preset = gemPresets[value] || gemPresets.padparadscha;
    const gradient = `radial-gradient(circle at 32% 25%, #ffffff 0 9%, ${preset.fire || "#ffffff"} 10% 18%, ${preset.color} 42%, ${preset.attenuation || preset.color} 100%)`;
    return {
      kind: "gem",
      background: preset.texture ? `${gradient}, url("${preset.texture}") center / cover` : gradient,
    };
  }
  if (id === "gem-material-model") return gemMaterialModelVisuals[value] || gemMaterialModelVisuals.natural;
  if (id === "facet-texture-mode") {
    const backgrounds = {
      subtle: "linear-gradient(145deg, #d8b15f, #5c4524)",
      jewelry: "conic-gradient(from 30deg, #f3c15d, #fff0b8, #b8882e, #f3c15d)",
      technical: "repeating-linear-gradient(45deg, #7fe8ff 0 3px, #1b2f34 4px 8px)",
    };
    return { kind: "metal", background: backgrounds[value] || backgrounds.jewelry };
  }
  return { kind: "support", background: "linear-gradient(145deg, #3b3730, #d8b15f)" };
}

function updateSelectSwatch(select) {
  const wrapper = select.closest(".select-preview-row");
  const swatch = wrapper?.querySelector(".select-swatch");
  if (!swatch) return;
  const visual = getSelectVisual(select, select.value);
  swatch.style.background = visual.background;
  swatch.dataset.kind = visual.kind;
  const selectedText = select.selectedOptions?.[0]?.textContent || select.value;
  swatch.title = selectedText.replace(/^[?]\s*/, "");
}

function decorateSelectOptions(select) {
  Array.from(select.options).forEach((option) => {
    if (!option.value) return;
    const visual = getSelectVisual(select, option.value);
    option.style.background = visual.background;
    option.style.color = visual.kind === "metal" || visual.kind === "support" ? "#fff8e8" : "#ffffff";
  });
}

function ensureMaterialSelectSwatches() {
  [
    "#metal-preset",
    "#object-metal-material",
    "#support-material",
    "#gem-preset",
    "#object-gem-material",
    "#stone-showcase-material",
    "#stone-showcase-geometry",
    "#gem-material-model",
    "#facet-texture-mode",
  ].forEach((selector) => {
    const select = document.querySelector(selector);
    if (!select) return;
    if (!select.closest(".select-preview-row")) {
      const wrapper = document.createElement("div");
      wrapper.className = "select-preview-row";
      select.parentNode.insertBefore(wrapper, select);
      wrapper.appendChild(select);
      const swatch = document.createElement("span");
      swatch.className = "select-swatch";
      swatch.setAttribute("aria-hidden", "true");
      wrapper.appendChild(swatch);
      select.addEventListener("change", () => updateSelectSwatch(select));
    }
    decorateSelectOptions(select);
    updateSelectSwatch(select);
  });
}

const materialRegistry = {
  metals: [],
  centerGems: [],
  diamonds: [],
  pinkPaves: [],
};

function getFacetTextureConfig() {
  return {
    enabled: settings.facetTextureEnabled,
    mode: settings.facetTextureMode,
    intensity: settings.facetTextureIntensity,
    roughness: settings.facetTextureRoughness,
    tint: settings.facetTextureTint,
    reflectance: settings.facetTextureReflectance,
    scale: settings.facetTextureScale,
    seed: settings.facetTextureSeed,
    opticalPolishEnabled: settings.opticalPolishEnabled,
    opticalPolishStrength: settings.opticalPolishStrength,
    opticalPolishEdge: settings.opticalPolishEdge,
  };
}

function installFacetTextureShader(material) {
  if (!material || material.userData.facetTextureShaderInstalled) return material;
  material.userData.facetTextureShaderInstalled = true;
  material.onBeforeCompile = (shader) => {
    material.userData.facetTextureUniforms = {
      enabled: shader.uniforms.uFacetTextureEnabled = { value: settings.facetTextureEnabled ? 1 : 0 },
      intensity: shader.uniforms.uFacetTextureIntensity = { value: settings.facetTextureIntensity },
      roughness: shader.uniforms.uFacetTextureRoughness = { value: settings.facetTextureRoughness },
      tint: shader.uniforms.uFacetTextureTint = { value: settings.facetTextureTint },
      scale: shader.uniforms.uFacetTextureScale = { value: settings.facetTextureScale },
      seed: shader.uniforms.uFacetTextureSeed = { value: settings.facetTextureSeed },
      polishEnabled: shader.uniforms.uOpticalPolishEnabled = { value: settings.opticalPolishEnabled ? 1 : 0 },
      polishStrength: shader.uniforms.uOpticalPolishStrength = { value: settings.opticalPolishStrength },
      polishEdge: shader.uniforms.uOpticalPolishEdge = { value: settings.opticalPolishEdge },
    };
    shader.fragmentShader = shader.fragmentShader
      .replace(
        "#include <common>",
        `#include <common>
uniform float uFacetTextureEnabled;
uniform float uFacetTextureIntensity;
uniform float uFacetTextureRoughness;
uniform float uFacetTextureTint;
uniform float uFacetTextureScale;
uniform float uFacetTextureSeed;
uniform float uOpticalPolishEnabled;
uniform float uOpticalPolishStrength;
uniform float uOpticalPolishEdge;
float facetTextureHash(vec3 n) {
  vec3 q = floor(abs(normalize(n)) * (18.0 + uFacetTextureScale * 12.0) + uFacetTextureSeed * 19.0);
  return fract(sin(dot(q, vec3(12.9898, 78.233, 37.719))) * 43758.5453);
}
float facetTexturePattern(vec3 facetNormal) {
  float h = facetTextureHash(facetNormal);
  return (h - 0.5) * 2.0;
}
vec3 polishedFacetNormal(vec3 faceNormal) {
  return normalize(faceNormal);
}`
      )
      .replace(
        "#include <normal_fragment_maps>",
        `#include <normal_fragment_maps>
if (uOpticalPolishEnabled > 0.5) {
  vec3 faceNormalForPolish = normalize(cross(dFdx(vViewPosition), dFdy(vViewPosition)));
  vec3 smoothNormalForPolish = polishedFacetNormal(faceNormalForPolish);
  normal = normalize(mix(normal, smoothNormalForPolish, clamp(uOpticalPolishStrength * 0.42, 0.0, 0.72)));
}`
      )
      .replace(
        "#include <color_fragment>",
        `#include <color_fragment>
if (uFacetTextureEnabled > 0.5) {
  vec3 facetNormalForTexture = polishedFacetNormal(normalize(cross(dFdx(vViewPosition), dFdy(vViewPosition))));
  float facetTone = facetTexturePattern(facetNormalForTexture);
  diffuseColor.rgb *= 1.0 + facetTone * uFacetTextureTint * uFacetTextureIntensity;
}`
      )
      .replace(
        "#include <roughnessmap_fragment>",
        `#include <roughnessmap_fragment>
if (uFacetTextureEnabled > 0.5) {
  vec3 facetNormalForRoughness = polishedFacetNormal(normalize(cross(dFdx(vViewPosition), dFdy(vViewPosition))));
  float facetRough = abs(facetTexturePattern(facetNormalForRoughness));
  roughnessFactor = clamp(roughnessFactor * (1.0 + facetRough * uFacetTextureRoughness * uFacetTextureIntensity), 0.015, 1.0);
}`
      );
  };
  material.customProgramCacheKey = () => "ctva-facet-texture-optical-polish-v2";
  return material;
}

function updateFacetTextureMaterials() {
  materialRegistry.metals.forEach((mat) => {
    installFacetTextureShader(mat);
    const uniforms = mat.userData.facetTextureUniforms;
    if (uniforms) {
      uniforms.enabled.value = settings.facetTextureEnabled ? 1 : 0;
      uniforms.intensity.value = settings.facetTextureIntensity;
      uniforms.roughness.value = settings.facetTextureRoughness;
      uniforms.tint.value = settings.facetTextureTint;
      uniforms.scale.value = settings.facetTextureScale;
      uniforms.seed.value = settings.facetTextureSeed;
      uniforms.polishEnabled.value = settings.opticalPolishEnabled ? 1 : 0;
      uniforms.polishStrength.value = settings.opticalPolishStrength;
      uniforms.polishEdge.value = settings.opticalPolishEdge;
    }
    mat.envMapIntensity = settings.metalIntensity * (1 + settings.facetTextureReflectance * settings.facetTextureIntensity * 0.18);
    mat.needsUpdate = true;
  });
  logDebug("material", "Texture adaptée aux facettes appliquée aux métaux", getFacetTextureConfig());
}

function applyFacetTextureConfig(config, { sync = true } = {}) {
  settings.facetTextureEnabled = config.enabled !== false;
  settings.facetTextureMode = config.mode || "jewelry";
  settings.facetTextureIntensity = Number(config.intensity ?? facetTextureBestDefault.intensity);
  settings.facetTextureRoughness = Number(config.roughness ?? facetTextureBestDefault.roughness);
  settings.facetTextureTint = Number(config.tint ?? facetTextureBestDefault.tint);
  settings.facetTextureReflectance = Number(config.reflectance ?? facetTextureBestDefault.reflectance);
  settings.facetTextureScale = Number(config.scale ?? facetTextureBestDefault.scale);
  settings.facetTextureSeed = Number(config.seed ?? facetTextureBestDefault.seed);
  settings.opticalPolishEnabled = config.opticalPolishEnabled !== false;
  settings.opticalPolishStrength = Number(config.opticalPolishStrength ?? settings.opticalPolishStrength);
  settings.opticalPolishEdge = Number(config.opticalPolishEdge ?? settings.opticalPolishEdge);
  if (sync) syncFacetTextureControls();
  updateFacetTextureMaterials();
}

function applyFacetRealismPreset(id) {
  const preset = facetRealismPresets[id] || facetRealismPresets["polished-gold"];
  const select = document.querySelector("#facet-realism-preset");
  if (select) select.value = id;
  applyFacetTextureConfig(preset.config);
  settings.facetContrast = preset.facetContrast;
  document.querySelector("#facet-contrast").value = String(preset.facetContrast);
  updateGemOpticalEffect();
  showNotice(`Reglage facettisation : ${preset.label}.`);
}

function applyMenuPanelWidth(value) {
  const width = THREE.MathUtils.clamp(Number(value) || 430, 320, 720);
  settings.panelWidth = width;
  document.documentElement.style.setProperty("--control-width", `${width}px`);
  document.querySelector("#menu-panel-width").value = String(width);
  document.querySelector("#menu-panel-width-value").textContent = String(Math.round(width));
  localStorage.setItem(MENU_PANEL_WIDTH_KEY, String(width));
}

function restoreMenuPanelWidth() {
  applyMenuPanelWidth(localStorage.getItem(MENU_PANEL_WIDTH_KEY) || 430);
}

function applyLightingPreset(id) {
  const preset = lightingPresets[id] || lightingPresets.current;
  settings.envIntensity = preset.env;
  settings.keyLight = preset.key;
  settings.rimLight = preset.rim;
  settings.fillLight = preset.fill;
  document.querySelector("#env-intensity").value = String(preset.env);
  document.querySelector("#key-light").value = String(preset.key);
  document.querySelector("#rim-light").value = String(preset.rim);
  document.querySelector("#fill-light").value = String(preset.fill);
  scene.environmentIntensity = preset.env;
  updateDiamondEnvironmentReflections();
  requestDiamondRayTraceRebake("preset eclairage HDRI");
  keyLight.intensity = preset.key;
  rimLight.intensity = preset.rim;
  fillLight.intensity = preset.fill;
  showNotice(`Eclairage : ${preset.label}.`);
}

function readFacetTextureConfigs() {
  try {
    return JSON.parse(localStorage.getItem(FACET_TEXTURE_LIBRARY_KEY) || "[]");
  } catch {
    return [];
  }
}

function writeFacetTextureConfigs(entries) {
  localStorage.setItem(FACET_TEXTURE_LIBRARY_KEY, JSON.stringify(entries));
}

const goldMaterial = new THREE.MeshPhysicalMaterial({
  color: new THREE.Color("#f3c15d"),
  metalness: 1,
  roughness: settings.metalRoughness,
  envMapIntensity: settings.metalIntensity,
  clearcoat: 0.75,
  clearcoatRoughness: 0.08,
  anisotropy: 0.45,
});

const whiteGoldMaterial = new THREE.MeshPhysicalMaterial({
  color: new THREE.Color("#d8d5cd"),
  metalness: 1,
  roughness: 0.095,
  envMapIntensity: settings.metalIntensity * 1.1,
  clearcoat: 0.7,
  clearcoatRoughness: 0.06,
  anisotropy: 0.35,
});

const pearlMaterial = new THREE.MeshPhysicalMaterial({
  color: new THREE.Color("#fff2d0"),
  roughness: 0.32,
  metalness: 0,
  clearcoat: 1,
  clearcoatRoughness: 0.18,
  sheen: 0.8,
  sheenColor: new THREE.Color("#ffd8ef"),
  envMapIntensity: 1.6,
});

const centerGemMaterial = new THREE.MeshPhysicalMaterial({
  color: new THREE.Color(settings.gemColor),
  roughness: 0.035,
  metalness: 0,
  transmission: 0.72,
  thickness: 1.8,
  ior: 1.78,
  attenuationColor: new THREE.Color("#ff7a66"),
  attenuationDistance: 1.8,
  clearcoat: 1,
  clearcoatRoughness: 0.02,
  envMapIntensity: 2.7,
});

centerGemMaterial.userData.jewelryMaterial = { type: "gem", preset: "padparadscha" };

const diamondMaterial = new THREE.MeshPhysicalMaterial({
  color: new THREE.Color("#f5fbff"),
  roughness: 0,
  metalness: 0,
  transmission: 0.88,
  thickness: 1.85,
  ior: 2.42,
  clearcoat: 1,
  clearcoatRoughness: 0,
  envMapIntensity: 12.0,
  transparent: true,
  opacity: 0.86,
  depthWrite: false,
  side: THREE.DoubleSide,
});

diamondMaterial.userData.jewelryMaterial = { type: "gem", preset: "diamond" };

const pinkPaveMaterial = new THREE.MeshPhysicalMaterial({
  color: new THREE.Color("#ff8dbc"),
  roughness: 0.03,
  transmission: 0.68,
  thickness: 0.55,
  ior: 1.76,
  clearcoat: 1,
  envMapIntensity: 2.6,
});

materialRegistry.metals.push(goldMaterial, whiteGoldMaterial);
materialRegistry.centerGems.push(centerGemMaterial);
materialRegistry.diamonds.push(diamondMaterial);
materialRegistry.pinkPaves.push(pinkPaveMaterial);
updateFacetTextureMaterials();

const keyLight = new THREE.RectAreaLight("#ffe0b0", settings.keyLight, 4.2, 3.2);
keyLight.position.set(-3.6, 4.2, 3.5);
keyLight.lookAt(0, 0, 0);
scene.add(keyLight);

const rimLight = new THREE.RectAreaLight("#cde6ff", settings.rimLight, 5.5, 2.2);
rimLight.position.set(3.6, 2.7, -3.5);
rimLight.lookAt(0, 0.4, 0);
scene.add(rimLight);

const fillLight = new THREE.PointLight("#ffd4ec", settings.fillLight, 8, 1.7);
fillLight.position.set(0, 1.2, 3.2);
scene.add(fillLight);

const floorMaterial = new THREE.MeshStandardMaterial({
  color: backgrounds.black.floor,
  roughness: 0.92,
  metalness: 0,
  envMapIntensity: 0.08,
});
const SUPPORT_TEXTURE_VERSION = "flat-floor-v4";
const supportTextureCache = new Map();
const supportTextureLoader = new THREE.TextureLoader();
const gemTextureCache = new Map();
const gemTextureLoader = new THREE.TextureLoader();
const stemDecalTexture = supportTextureLoader.load("./assets/decals/logo-gravure-alu.png", (texture) => {
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.center.set(0.5, 0.5);
  texture.rotation = Math.PI / 2;
  texture.anisotropy = renderer.capabilities.getMaxAnisotropy?.() || 8;
  texture.needsUpdate = true;
});
stemDecalTexture.colorSpace = THREE.SRGBColorSpace;
stemDecalTexture.center.set(0.5, 0.5);
stemDecalTexture.rotation = Math.PI / 2;
const floor = new THREE.Mesh(new THREE.CircleGeometry(8, 128), floorMaterial);
floor.rotation.x = -Math.PI / 2;
floor.position.y = -1.16;
floor.receiveShadow = true;
scene.add(floor);

const softStudioShadow = new THREE.Mesh(
  new THREE.CircleGeometry(0.5, 96),
  new THREE.MeshBasicMaterial({
    map: createSoftShadowTexture(),
    color: "#000000",
    transparent: true,
    opacity: 0.34,
    alphaTest: 0.015,
    depthWrite: false,
    blending: THREE.NormalBlending,
  }),
);
softStudioShadow.name = "soft studio contact shadow";
softStudioShadow.rotation.x = -Math.PI / 2;
softStudioShadow.position.y = floor.position.y + 0.014;
softStudioShadow.renderOrder = 1;
softStudioShadow.visible = false;
scene.add(softStudioShadow);

const reflectionRig = new THREE.Group();
reflectionRig.name = "Gem optical effect rig";
root.add(reflectionRig);

const reflectionTextures = createReflectionTextures();
const sparkleTexture = reflectionTextures.cross;
const causticTexture = createCausticTexture();
const causticMaterial = new THREE.MeshBasicMaterial({
  map: causticTexture,
  color: "#ffd7f2",
  transparent: true,
  opacity: 0.34,
  blending: THREE.AdditiveBlending,
  depthWrite: false,
});
const causticPlane = new THREE.Mesh(new THREE.PlaneGeometry(3.2, 2.25), causticMaterial);
causticPlane.rotation.x = -Math.PI / 2;
causticPlane.position.set(0, -1.145, 0.35);
causticPlane.userData.selectableCaustic = true;
scene.add(causticPlane);

function loadJewelryExample(id, options = {}) {
  if (uploadedModels.has(id)) {
    return loadUploadedLibraryModel(id);
  }

  const defaultId = modelDefaults[id] ? id : "plug-classique-xxxl-60";
  const defaults = modelDefaults[defaultId] || modelDefaults["plug-decalcomanie"];
  if (defaults.url) {
    return loadPreloadedLibraryModel(defaultId, defaults);
  }

  setCurrentRhinoSource(null);
  settings.modelId = defaultId;
  if (options.applyGemDefault !== false) {
    settings.gemColor = defaults.gemColor;
    document.querySelector("#gem-color").value = defaults.gemColor;
    centerGemMaterial.color.set(defaults.gemColor);
    centerGemMaterial.attenuationColor.set(defaults.gemColor);
  }

  updateProductCopy(defaults);

  buildProceduralPlugFallback();
  applyGemShape(settings.gemShape);
  prepareObjectMaterialEditor();
  camera.position.set(...defaults.camera);
  controls.target.set(...defaults.target);
  controls.update();
  buildGemOpticalEffect();
}

function updateProductCopy(defaults) {
  const description = document.querySelector("#viewer-product-description");
  if (description) description.textContent = String(defaults.copy || "").replace(/\bclassique\b/gi, "de la gamme Originale");
}

function loadWithTimeout(promise, timeoutMs, label) {
  return Promise.race([
    promise,
    new Promise((_, reject) => {
      window.setTimeout(() => reject(new Error(`${label} trop long a charger`)), timeoutMs);
    }),
  ]);
}

function createPlugFallbackPart(geometry, name, position, rotation = [0, 0, Math.PI / 2]) {
  const mesh = new THREE.Mesh(geometry, makeRhinoPolishedMetalMaterial(name));
  mesh.name = name;
  mesh.position.set(...position);
  mesh.rotation.set(...rotation);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  mesh.userData.imported = true;
  mesh.userData.fallbackPlug = true;
  return mesh;
}

function buildPreloadedPlugFallback(defaults, error, requestedId = settings.modelId) {
  resetJewelryRoot();
  settings.modelId = requestedId;
  document.querySelector("#jewel-model").value = requestedId;
  updateProductCopy(defaults);

  const group = new THREE.Group();
  group.name = "Plug avec decalcomanie - aperçu de secours";
  group.userData.preloadedFallback = true;

  const bodyProfile = [
    new THREE.Vector2(0.02, -1.08),
    new THREE.Vector2(0.18, -1.03),
    new THREE.Vector2(0.42, -0.86),
    new THREE.Vector2(0.56, -0.55),
    new THREE.Vector2(0.62, -0.12),
    new THREE.Vector2(0.55, 0.28),
    new THREE.Vector2(0.36, 0.52),
    new THREE.Vector2(0.16, 0.64),
  ];
  const body = createPlugFallbackPart(new THREE.LatheGeometry(bodyProfile, 192), "plug corps poli", [0.62, 0, 0]);
  group.add(body);

  const collar = createPlugFallbackPart(new THREE.TorusGeometry(0.42, 0.035, 24, 160), "plug col arrondi", [-0.1, 0, 0], [Math.PI / 2, 0, 0]);
  collar.scale.set(1.0, 1.0, 0.24);
  group.add(collar);

  group.add(createPlugFallbackPart(new THREE.CylinderGeometry(0.15, 0.18, 1.08, 128), "plug tige polie", [-0.68, 0, 0]));
  group.add(createPlugFallbackPart(new THREE.CylinderGeometry(0.52, 0.52, 0.16, 192), "plug disque arriere", [-1.28, 0, 0]));
  group.add(createPlugFallbackPart(new THREE.TorusGeometry(0.43, 0.055, 24, 160), "plug chanfrein arriere", [-1.37, 0, 0], [Math.PI / 2, 0, 0]));
  group.add(createPlugFallbackPart(new THREE.TorusGeometry(0.2, 0.032, 24, 128), "plug ouverture polie", [-1.46, 0, 0], [Math.PI / 2, 0, 0]));

  group.rotation.set(0, 0.08, 0);
  addStemDecalToClassicPlug(group, { classicPlugVolumeMaterials: true });
  root.add(group);
  frameImportedModel(group);
  prepareObjectMaterialEditor();
  buildGemOpticalEffect();
  syncEffectStatus();
  setCurrentRhinoSource(null);
  logDebug("fallback", "Aperçu procédural du plug chargé", { error: error?.message || String(error || "") });
}


const catalogMetalFamilies = {
  alu: {
    label: "Alu",
    finishes: [
      ["aluminum-gray", "Gris"],
      ["aluminum-black", "Noir"],
      ["aluminum-red", "Rouge"],
      ["aluminum-violet", "Violet"],
      ["aluminum-pink", "Rose"],
      ["aluminum-green", "Vert"],
      ["aluminum-blue", "Bleu"],
      ["aluminum-gold", "Or"],
      ["aluminum-orange", "Orange"],
    ],
  },
  inox: {
    label: "Inox",
    finishes: [
      ["stainless-mirror-silver", "Poli miroir"],
      ["stainless-flash-gold-1-micron", "Flash or 1 micron"],
    ],
  },
};

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

const catalogOrnamentFamilies = {
  crystal: {
    label: "Cristal",
    finishes: [
      "Clear", "Aurore Boreale", "Aquamarine", "Pink", "Jet", "Majestic Blue", "Emerald", "Heliotrope", "Mandarine", "Volcano Swarovsky",
      "Volcano", "Chrysolite", "Red Magma", "Vitrail", "Spring", "Smoked topaze", "Golden Shadow", "Ocean", "Citrine Shimmer",
      "Sunshine Shimmer", "Siam Shimmer", "Light Colorado Topaz Shimmer", "Black diamond Shimmer", "Peridot Shimmer", "Cobalt Shimmer",
      "Silk Shimmer", "Tangerine Shimmer", "Cristal Shine", "Violet Blue", "Fuschia", "Paradise Shine", "Ghost Light", "Silver Night",
      "Topaze", "Capriblue", "Los angeles", "Purple",
    ],
  },
  gem: {
    label: "Gem / pierre précieuse",
    finishes: ["Blue Agata", "Red Agata", "Green Agate", "Rhodochrosite", "Malachite", "Tiger Eye", "Onyx", "Quartz", "Rubis", "Saphir", "Émeraude", "Diamant"],
  },
  "pressed-glass": {
    label: "Verre pressé",
    finishes: ["Outremer", "Red", "Green", "Topaze", "Jet cabochon", "Purple cabochon", "Aquamarine cabochon"],
  },
  bronze: {
    label: "Ornement bronze",
    finishes: ["Bronze poli", "Bronze patiné", "Bronze doré"],
  },
};

function escapeCatalogHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function normalizeCatalogText(value) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/gi, " ")
    .trim()
    .toLowerCase();
}

function getCatalogOptionSource(id, label) {
  const defaults = modelDefaults[id] || {};
  return `${defaults.title || ""} ${defaults.copy || ""} ${label || ""} ${id || ""}`;
}

function getCatalogSizeFromText(text) {
  const upper = String(text || "").toUpperCase();
  const patterns = [
    ["XXXL 100", /XXXL\s*100/],
    ["XXXL 90", /XXXL\s*90/],
    ["XXXL 80", /XXXL\s*80/],
    ["XXXL 70", /XXXL\s*70/],
    ["XXXL 60", /XXXL\s*60/],
    ["XXL 50", /XXL\s*50/],
    ["XXL 35", /XXL\s*35/],
    ["XL 45", /XL\s*45/],
    ["XL 35", /XL\s*35/],
    ["LARGE 35", /LARGE\s*35/],
    ["MEDIUM 30", /MEDIUM\s*30/],
    ["SMALL 18", /SMALL\s*18/],
    ["NEW SMALL", /NEW\s*SMALL/],
    ["NEW MEDIUM", /NEW\s*MEDIUM/],
    ["67", /(?:^|\D)67(?:\D|$)/],
    ["55", /(?:^|\D)55(?:\D|$)/],
    ["35", /(?:^|\D)35(?:\D|$)/],
    ["30", /(?:^|\D)30(?:\D|$)/],
  ];
  return patterns.find(([, pattern]) => pattern.test(upper))?.[0] || "Autre";
}

function getCatalogDiameterFromSize(size) {
  const match = String(size || "").match(/(\d+(?:\.\d+)?)/);
  return match ? Number(match[1]) : null;
}

function getCatalogMetalSizeClass(text) {
  const upper = String(text || "").toUpperCase();
  if (upper.includes("NEW SMALL")) return "SMALL";
  if (upper.includes("NEW MEDIUM")) return "MEDIUM";
  return ["XXXL", "XXL", "XL", "LARGE", "MEDIUM", "SMALL"]
    .find((sizeClass) => new RegExp(`\\b${sizeClass}\\b`).test(upper)) || "";
}

function getCatalogModelFamily(text) {
  const upper = String(text || "").toUpperCase();
  if (upper.includes("NEW SMALL")) return "NEW SMALL";
  if (upper.includes("NEW MEDIUM")) return "NEW MEDIUM";
  return "Classique";
}

function getCatalogFinishRules(metalFamily, meta) {
  if (metalFamily === "alu" && ALUMINUM_FINISHES_BY_MODEL_FAMILY[meta?.modelFamily]) {
    return ALUMINUM_FINISHES_BY_MODEL_FAMILY[meta.modelFamily];
  }
  if (metalFamily === "alu") return ALUMINUM_FINISHES_BY_SIZE_CLASS[meta?.metalSizeClass];
  if (metalFamily === "inox") return STAINLESS_FINISHES_BY_SIZE_CLASS[meta?.metalSizeClass];
  return null;
}

function catalogModelSupportsMetalFinish(meta, metalFamily, finishId) {
  if (metalFamily && !meta?.metalFamilies?.includes(metalFamily)) return false;
  if (!finishId) return true;
  const rules = getCatalogFinishRules(metalFamily, meta);
  return !rules || rules.includes(finishId);
}

function catalogModelSupportsOrnament(meta, ornament, metalFamily) {
  if (!meta?.ornamentFamilies?.includes(ornament)) return false;
  if (["gem", "pressed-glass"].includes(ornament)) {
    const supportsCabochon = meta.metalSizeClass === "SMALL"
      || meta.modelFamily === "NEW SMALL"
      || meta.modelFamily === "NEW MEDIUM";
    if (!supportsCabochon) return false;
  }
  return !(meta.modelFamily === "NEW SMALL" && metalFamily === "alu" && ornament === "gem");
}

function getCatalogCrystalFinishRules(meta) {
  const text = String(meta?.source || "").toUpperCase();
  if (/\b(?:XXXL|XXL)\s*50\b/.test(text)) return null;
  if (meta?.modelFamily === "NEW SMALL" || meta?.modelFamily === "NEW MEDIUM") return CRYSTAL_FINISH_RULES.NEW;
  if (/\bLARGE\s*35\b/.test(text)) return null;
  if (/\bXXL\s*35\b/.test(text)) return CRYSTAL_FINISH_RULES.XXL_35;
  if (/\bXL\s*35\b/.test(text)) return CRYSTAL_FINISH_RULES.XL_35;
  if (/\bSMALL\s*18\b/.test(text)) return CRYSTAL_FINISH_RULES.SMALL_18;
  if (/\bSMALL\b/.test(text)) return CRYSTAL_FINISH_RULES.SMALL;
  return null;
}

function catalogModelSupportsOrnamentFinish(meta, ornament, finishLabel) {
  if (!finishLabel || ornament !== "crystal") return true;
  const rules = getCatalogCrystalFinishRules(meta);
  return !rules || rules.includes(finishLabel);
}

function getCatalogModelMeta(id, label = "") {
  const source = getCatalogOptionSource(id, label);
  const normalized = normalizeCatalogText(source);
  const size = getCatalogSizeFromText(source);
  const isNewSmall = normalized.includes("new small");
  const isNewMedium = normalized.includes("new medium");
  const metalSizeClass = getCatalogMetalSizeClass(source);
  const modelFamily = getCatalogModelFamily(source);
  const hasCrystal = normalized.includes("cristal") || normalized.includes("crystal");
  const hasCabochon = normalized.includes("cabochon");
  const hasStone = hasCrystal || hasCabochon || normalized.includes("avec pierre") || normalized.includes("pierre precieuse");
  const isSansTete = normalized.includes("sans tete") && !hasCrystal && !hasCabochon;
  const ornamentFamilies = [];
  if (hasCrystal) ornamentFamilies.push("crystal");
  if (hasCabochon) {
    ornamentFamilies.push("gem");
    if (isNewSmall || isNewMedium) ornamentFamilies.push("pressed-glass");
  }
  if (!hasCrystal && !hasCabochon && hasStone && !isSansTete) {
    ornamentFamilies.push("crystal");
    if (metalSizeClass === "SMALL") ornamentFamilies.push("gem", "pressed-glass");
  }
  if (normalized.includes("bronze")) ornamentFamilies.push("bronze");
  const uniqueOrnaments = [...new Set(ornamentFamilies)];
  return {
    id,
    label: label || modelDefaults[id]?.title || id,
    size,
    diameterMm: getCatalogDiameterFromSize(size),
    metalSizeClass,
    modelFamily,
    metalFamilies: modelFamily === "Classique" && ["XXL", "XXXL"].includes(metalSizeClass)
      ? ["inox"]
      : ["alu", "inox"],
    ornamentFamilies: uniqueOrnaments,
    hasStone: uniqueOrnaments.length > 0,
    isNewSmall,
    isNewMedium,
    isPlug: String(id || "").startsWith("plug-"),
    source,
  };
}

function getCatalogModelEntries() {
  const staticOptions = Array.from(document.querySelectorAll("#jewel-model option"));
  return staticOptions
    .map((option) => {
      const id = option.value;
      const label = option.textContent.trim();
      return { id, label, meta: getCatalogModelMeta(id, label) };
    })
    .filter((entry) => entry.meta.isPlug);
}

function attachCatalogMetaToModel(model, id, label = "") {
  if (!model) return;
  const meta = getCatalogModelMeta(id, label);
  model.userData.catalogModelId = id;
  model.userData.catalogMeta = meta;
  model.traverse?.((child) => {
    child.userData.catalogModelId = child.userData.catalogModelId || id;
    child.userData.catalogMeta = child.userData.catalogMeta || meta;
  });
  if (model.userData?.meshOptions?.classicPlugVolumeMaterials) {
    addStemDecalToClassicPlug(model, { ...model.userData.meshOptions, modelId: id });
  }
}

function getCatalogFilterState() {
  const launchParams = new URLSearchParams(window.location.search);
  return {
    size: document.querySelector("#catalog-filter-size")?.value || "",
    metal: document.querySelector("#catalog-filter-metal")?.value || launchParams.get("metalFamily") || "",
    metalFinish: document.querySelector("#catalog-filter-metal-finish")?.value || launchParams.get("metalFinish") || "",
    ornament: document.querySelector("#catalog-filter-ornament")?.value || launchParams.get("ornament") || "",
    ornamentFinish: document.querySelector("#catalog-filter-ornament-finish")?.value || launchParams.get("ornamentFinish") || "",
  };
}

function setCatalogSelectOptions(select, options, placeholder, previousValue = "") {
  if (!select) return "";
  const unique = [];
  const seen = new Set();
  options.forEach((entry) => {
    const value = Array.isArray(entry) ? entry[0] : entry.value;
    const label = Array.isArray(entry) ? entry[1] : entry.label;
    if (!value || seen.has(value)) return;
    seen.add(value);
    unique.push([value, label || value]);
  });
  select.innerHTML = `<option value="">${escapeCatalogHtml(placeholder)}</option>` + unique
    .map(([value, label]) => `<option value="${escapeCatalogHtml(value)}">${escapeCatalogHtml(label)}</option>`)
    .join("");
  select.value = unique.some(([value]) => value === previousValue) ? previousValue : "";
  return select.value;
}

function populateCatalogFilters() {
  const entries = getCatalogModelEntries();
  const sizeSelect = document.querySelector("#catalog-filter-size");
  const ornamentSelect = document.querySelector("#catalog-filter-ornament");
  if (sizeSelect) {
    const previous = sizeSelect.value;
    const sizes = [...new Set(entries.map((entry) => entry.meta.size).filter(Boolean))];
    const ordered = sizes.sort((a, b) => {
      const an = getCatalogDiameterFromSize(a) || 9999;
      const bn = getCatalogDiameterFromSize(b) || 9999;
      return an === bn ? a.localeCompare(b) : an - bn;
    });
    setCatalogSelectOptions(sizeSelect, ordered.map((size) => [size, size]), "Toutes les tailles", previous);
  }
  if (ornamentSelect) {
    const previous = ornamentSelect.value;
    const available = [...new Set(entries.flatMap((entry) => entry.meta.ornamentFamilies))];
    setCatalogSelectOptions(
      ornamentSelect,
      Object.entries(catalogOrnamentFamilies)
        .filter(([id]) => available.includes(id))
        .map(([id, item]) => [id, item.label]),
      "Tous les ornements",
      previous,
    );
  }
  syncCatalogFilterOptions();
}

function syncCatalogFilterOptions() {
  const state = getCatalogFilterState();
  const metalFinishSelect = document.querySelector("#catalog-filter-metal-finish");
  const ornamentFinishSelect = document.querySelector("#catalog-filter-ornament-finish");
  const metalFamilies = state.metal ? [state.metal] : Object.keys(catalogMetalFamilies);
  const candidateEntries = getCatalogModelEntries().filter((entry) => (!state.size || entry.meta.size === state.size)
    && (!state.metal || entry.meta.metalFamilies.includes(state.metal)));
  const metalFinishes = metalFamilies.flatMap((family) => (catalogMetalFamilies[family]?.finishes || [])
    .filter(([id]) => candidateEntries.some((entry) => catalogModelSupportsMetalFinish(entry.meta, family, id))));
  const selectedMetalFinish = setCatalogSelectOptions(metalFinishSelect, metalFinishes, "Toutes les finitions", state.metalFinish);
  const nextState = { ...state, metalFinish: selectedMetalFinish };
  const ornamentCandidates = candidateEntries.filter((entry) => !nextState.metalFinish
    || catalogModelSupportsMetalFinish(entry.meta, nextState.metal, nextState.metalFinish));
  const availableOrnaments = nextState.ornament ? [nextState.ornament] : Object.keys(catalogOrnamentFamilies);
  const ornamentFinishes = availableOrnaments.flatMap((family) => {
    const prefix = catalogOrnamentFamilies[family]?.label || family;
    return (catalogOrnamentFamilies[family]?.finishes || [])
      .filter((label) => ornamentCandidates.some((entry) => catalogModelSupportsOrnament(entry.meta, family, nextState.metal)
        && catalogModelSupportsOrnamentFinish(entry.meta, family, label)))
      .map((label) => [`${family}:${label}`, `${prefix} - ${label}`]);
  });
  setCatalogSelectOptions(ornamentFinishSelect, ornamentFinishes, "Toutes les finitions", state.ornamentFinish);
}

function modelMatchesCatalogFilters(entry, state = getCatalogFilterState()) {
  const meta = entry.meta || getCatalogModelMeta(entry.id, entry.label);
  if (state.size && meta.size !== state.size) return false;
  if (state.metal && !meta.metalFamilies.includes(state.metal)) return false;
  if (state.metalFinish) {
    const family = Object.entries(catalogMetalFamilies).find(([, item]) => item.finishes.some(([id]) => id === state.metalFinish))?.[0];
    if (family && (!meta.metalFamilies.includes(family) || !catalogModelSupportsMetalFinish(meta, family, state.metalFinish))) return false;
  }
  if (state.ornament && !catalogModelSupportsOrnament(meta, state.ornament, state.metal)) return false;
  if (state.ornamentFinish) {
    const [family, ...finishParts] = state.ornamentFinish.split(":");
    const finishLabel = finishParts.join(":");
    if (family && (!catalogModelSupportsOrnament(meta, family, state.metal)
      || !catalogModelSupportsOrnamentFinish(meta, family, finishLabel))) return false;
  }
  return true;
}

function getFilteredCatalogEntries() {
  syncCatalogFilterOptions();
  const state = getCatalogFilterState();
  return getCatalogModelEntries().filter((entry) => modelMatchesCatalogFilters(entry, state));
}

function getCatalogPreviewMetal(entry, state = getCatalogFilterState()) {
  const finishId = state.metalFinish || (state.metal ? catalogMetalFamilies[state.metal]?.finishes?.[0]?.[0] : null) || settings.metalPreset || "silver";
  const preset = metalPresets[finishId] || metalPresets.silver || metalPresets["yellow-gold"];
  return preset.preview ? `url('${preset.preview}') center / cover` : `linear-gradient(135deg, #ffffff 0%, ${preset.color || "#d6d6d6"} 48%, #191714 100%)`;
}

function getCatalogPreviewStone(entry, state = getCatalogFilterState()) {
  if (!entry.meta?.hasStone) return "transparent";
  const family = state.ornament || entry.meta.ornamentFamilies[0] || "gem";
  if (family === "crystal") return "conic-gradient(from 20deg, #ffffff, #b8e9ff, #fff1ba, #ffb4f6, #ffffff)";
  if (family === "pressed-glass") return "radial-gradient(circle at 30% 20%, #ffffff, #58bde7 22%, #1a7bb1 68%, #042135)";
  if (family === "bronze") return "linear-gradient(135deg, #5a341c, #c77b31, #f1b15c, #4a2918)";
  return "radial-gradient(circle at 30% 20%, #ffffff, #ffb4a4 24%, #bd3558 72%, #3c0816)";
}

function renderCatalogGallery() {
  const gallery = document.querySelector("#catalog-filter-gallery");
  if (!gallery) return;
  const state = getCatalogFilterState();
  const entries = getFilteredCatalogEntries();
  if (!entries.length) {
    gallery.innerHTML = '<div class="catalog-empty">Aucun plug ne correspond à cette combinaison.</div>';
    return;
  }
  gallery.innerHTML = entries.map((entry) => {
    const selected = entry.id === settings.modelId ? ' aria-current="true"' : "";
    const stone = entry.meta.hasStone ? `<span class="catalog-card__stone" style="--catalog-stone:${getCatalogPreviewStone(entry, state)}"></span>` : "";
    const ornamentLabel = entry.meta.ornamentFamilies.map((id) => catalogOrnamentFamilies[id]?.label || id).join(" / ") || "Sans ornement";
    return `<button class="catalog-card" type="button" data-catalog-model-id="${escapeCatalogHtml(entry.id)}"${selected}>
      <span class="catalog-card__preview" style="--catalog-metal:${getCatalogPreviewMetal(entry, state)}">${stone}</span>
      <span class="catalog-card__name">${escapeCatalogHtml(entry.label)}</span>
      <span class="catalog-card__meta">${escapeCatalogHtml(entry.meta.size)} · ${escapeCatalogHtml(ornamentLabel)}</span>
    </button>`;
  }).join("");
}

function getCurrentCatalogMetaForObject(object = null) {
  return object?.userData?.catalogMeta || getCatalogModelMeta(settings.modelId, modelDefaults[settings.modelId]?.title || "");
}

function getCatalogAllowedMetalPresetIds(meta = getCurrentCatalogMetaForObject()) {
  const state = getCatalogFilterState();
  const families = state.metal ? [state.metal] : (meta?.metalFamilies?.length ? meta.metalFamilies : Object.keys(catalogMetalFamilies));
  const ids = families.flatMap((family) => (catalogMetalFamilies[family]?.finishes || [])
    .filter(([id]) => catalogModelSupportsMetalFinish(meta, family, id))
    .map(([id]) => id));
  return new Set(ids.length ? ids : Object.keys(metalPresets));
}

function catalogGemPresetMatchesFamily(id, preset, family, finishLabel = "") {
  const haystack = normalizeCatalogText(`${id} ${preset?.label || ""} ${preset?.group || ""}`);
  const normalizedFinish = normalizeCatalogText(finishLabel.replace(/^(crystal|gem|pressed-glass|bronze):/i, ""));
  if (normalizedFinish && (haystack.includes(normalizedFinish) || normalizedFinish.includes(haystack))) return true;
  if (family === "crystal") return /diamond|diamant|crystal|cristal|clear|aurore|aquamarine|pink|jet|emerald|topaz|shimmer|vitrail|volcano|chrysolite|citrine|violet|fuschia|capri|purple/.test(haystack);
  if (family === "gem") return /agate|agata|rubis|ruby|saphir|sapphire|emerald|emeraude|quartz|onyx|malachite|tiger|rhodochrosite|diamant|diamond/.test(haystack);
  if (family === "pressed-glass") return /glass|verre|cabochon|outremer|topaze|aquamarine|purple|green|red|jet/.test(haystack);
  if (family === "bronze") return /bronze|copper|cuivre|dor/.test(haystack);
  return true;
}

function resolveCatalogGemPresetId(family, finishValue = "") {
  if (!family || family === "none") return "";
  const rawFinish = String(finishValue || "").replace(/^(crystal|gem|pressed-glass|bronze):/i, "").trim();
  if (!rawFinish) return "";
  const finishText = normalizeCatalogText(rawFinish);
  const entries = Object.entries(gemPresets);
  const exact = entries.find(([id, preset]) => {
    const idText = normalizeCatalogText(id);
    const labelText = normalizeCatalogText(preset?.label || "");
    return idText === finishText || labelText === finishText;
  });
  if (exact) return exact[0];
  const partial = entries.find(([id, preset]) => {
    if (!catalogGemPresetMatchesFamily(id, preset, family)) return false;
    const idText = normalizeCatalogText(id);
    const labelText = normalizeCatalogText(preset?.label || "");
    return idText.includes(finishText) || finishText.includes(idText) || labelText.includes(finishText) || finishText.includes(labelText);
  });
  return partial?.[0] || "";
}

function getRootGemMeshes(object = root) {
  const meshes = [];
  object?.traverse?.((child) => {
    if (!child.isMesh || child.userData?.stemDecal) return;
    const materials = Array.isArray(child.material) ? child.material : [child.material];
    const explicitRole = child.userData?.classicPlugRole;
    if (explicitRole === "metal") return;
    if (explicitRole === "gem") {
      meshes.push(child);
      return;
    }
    const typedMaterialRole = materials.find((material) =>
      ["metal", "gem"].includes(material?.userData?.jewelryMaterial?.type)
    )?.userData?.jewelryMaterial?.type;
    if (typedMaterialRole === "metal") return;
    const label = `${child.name || ""} ${materials.map((material) => material?.name || "").join(" ")}`.toLowerCase();
    const isGem = typedMaterialRole === "gem" ||
      isLikelyGemMaterial(materials[0], label);
    if (isGem) meshes.push(child);
  });
  return meshes;
}

function applyCatalogGemPreset(family, finishValue, options = {}) {
  const presetId = resolveCatalogGemPresetId(family, finishValue) || settings.activeCatalogGemPreset;
  if (!presetId || !gemPresets[presetId]) return false;
  settings.activeCatalogGemPreset = presetId;
  const gemMeshes = getRootGemMeshes(options.object || root);
  gemMeshes.forEach((mesh) => {
    applySingleMaterialToMesh(mesh, makeGemMaterialFromPreset(presetId), { keepOpticalSettings: true });
    mesh.userData.classicPlugRole = "gem";
    mesh.userData.catalogGemPreset = presetId;
  });
  if (gemMeshes[0]) centerGemMesh = gemMeshes[0];
  applyGemPreset(presetId, { updateSelectedMaterial: false });
  gemMeshes.forEach((mesh, index) => {
    window.setTimeout(() => scheduleDiamondInternalRayTracing(mesh, options.reason || `materiau catalogue pierre ${index + 1}`), 120 + index * 180);
  });
  updateDiamondEnvironmentReflections();
  buildGemOpticalEffect();
  logDebug("gem", "Finition catalogue appliquee uniformement aux pierres du modele", {
    family,
    finishValue,
    presetId,
    meshes: gemMeshes.length,
  });
  return gemMeshes.length > 0;
}

function filterContextMaterialEntriesForCatalog(type, entries, object = null) {
  if (!Array.isArray(entries) || (type !== "metal" && type !== "gem")) return entries;
  const meta = getCurrentCatalogMetaForObject(object);
  if (type === "metal") {
    const allowed = getCatalogAllowedMetalPresetIds(meta);
    return entries.filter(([id]) => allowed.has(id));
  }
  const state = getCatalogFilterState();
  const families = (state.ornament ? [state.ornament] : (meta?.ornamentFamilies?.length ? meta.ornamentFamilies : Object.keys(catalogOrnamentFamilies)))
    .filter((family) => catalogModelSupportsOrnament(meta, family, state.metal));
  const finish = state.ornamentFinish || "";
  return entries.filter(([id, preset]) => families.some((family) => {
    if (!catalogGemPresetMatchesFamily(id, preset, family, finish)) return false;
    if (family !== "crystal") return true;
    const rules = getCatalogCrystalFinishRules(meta);
    return !rules || rules.some((label) => catalogGemPresetMatchesFamily(id, preset, family, label));
  }));
}

function handleCatalogGalleryClick(event) {
  const button = event.target.closest("[data-catalog-model-id]");
  if (!button) return;
  const id = button.dataset.catalogModelId;
  if (!id) return;
  settings.compareModelsEnabled = false;
  const compareToggle = document.querySelector("#compare-models-enabled");
  if (compareToggle) compareToggle.checked = false;
  syncCompareModelControlState();
  const select = document.querySelector("#jewel-model");
  if (select) select.value = id;
  settings.modelId = id;
  Promise.resolve(loadJewelryExample(id)).then(() => {
    const state = getCatalogFilterState();
    if (state.metalFinish && metalPresets[state.metalFinish]) applyMetalPreset(state.metalFinish);
    if (state.ornament && state.ornamentFinish) {
      applyCatalogGemPreset(state.ornament, state.ornamentFinish, { reason: "changement modele catalogue" });
    } else if (settings.activeCatalogGemPreset) {
      applyCatalogGemPreset("gem", settings.activeCatalogGemPreset, { reason: "restauration finition pierre catalogue" });
    }
    if (scaleReferenceGroup.visible) refreshScaleReference();
    const meta = getCatalogModelMeta(id, modelDefaults[id]?.title || id);
    const params = new URLSearchParams(window.location.search);
    params.set("catalogModel", id);
    params.set("modelFamily", meta.modelFamily || "");
    params.set("plugSize", meta.size || "");
    if (state.metal) params.set("metalFamily", state.metal);
    if (state.metalFinish) params.set("metalFinish", state.metalFinish);
    if (state.ornament) params.set("ornament", state.ornament);
    if (state.ornamentFinish) params.set("ornamentFinish", state.ornamentFinish);
    void updateViewerProductInformation(params, meta);
    renderCatalogGallery();
    showNotice("Modèle chargé depuis le catalogue filtré.");
  });
}

function getCompareModelEntries() {
  return getCatalogModelEntries();
}

function getSelectedCompareModelIds() {
  const checked = Array.from(document.querySelectorAll("#compare-model-list input[type='checkbox']:checked"))
    .map((input) => input.value);
  return checked.length ? checked : [settings.modelId].filter(Boolean);
}

function syncCompareModelControlState() {
  const enabled = Boolean(settings.compareModelsEnabled);
  const single = document.querySelector("#single-model-control");
  const list = document.querySelector("#compare-model-list");
  const spacing = document.querySelector("#compare-model-spacing-control");
  if (single) single.hidden = enabled;
  if (list) list.hidden = !enabled;
  if (spacing) spacing.hidden = !enabled;
}

function populateCompareModelControls() {
  const enabledInput = document.querySelector("#compare-models-enabled");
  const list = document.querySelector("#compare-model-list");
  const spacing = document.querySelector("#compare-model-spacing");
  const spacingValue = document.querySelector("#compare-model-spacing-value");
  if (!enabledInput || !list) return;

  enabledInput.checked = settings.compareModelsEnabled;
  list.innerHTML = "";
  const ids = new Set(settings.compareModelIds?.length ? settings.compareModelIds : [settings.modelId]);
  getCompareModelEntries().forEach((entry) => {
    const label = document.createElement("label");
    label.className = "model-compare__item";
    const input = document.createElement("input");
    input.type = "checkbox";
    input.value = entry.id;
    input.checked = ids.has(entry.id);
    const preview = document.createElement("span");
    preview.className = "model-compare__thumb";
    preview.style.setProperty("--catalog-metal", getCatalogPreviewMetal(entry));
    preview.style.setProperty("--catalog-stone", getCatalogPreviewStone(entry));
    preview.toggleAttribute("data-has-stone", Boolean(entry.meta?.hasStone));
    const text = document.createElement("span");
    text.className = "model-compare__thumb-name";
    text.textContent = entry.label;
    label.append(input, preview, text);
    list.appendChild(label);
  });
  if (spacing) spacing.value = String(settings.compareModelSpacingMm);
  if (spacingValue) spacingValue.textContent = String(Math.round(settings.compareModelSpacingMm));
  syncCompareModelControlState();
}

function updateCompareModelSelectionFromList() {
  settings.compareModelIds = getSelectedCompareModelIds();
  const select = document.querySelector("#jewel-model");
  if (select && settings.compareModelIds[0]) select.value = settings.compareModelIds[0];
}

function setCompareModelsEnabled(enabled) {
  settings.compareModelsEnabled = Boolean(enabled);
  const enabledInput = document.querySelector("#compare-models-enabled");
  if (enabledInput) enabledInput.checked = settings.compareModelsEnabled;
  if (settings.compareModelsEnabled) updateCompareModelSelectionFromList();
  syncCompareModelControlState();
  if (settings.compareModelsEnabled) {
    loadModelComparisonFromSelection();
  } else {
    loadJewelryExample(settings.modelId || "plug-classique-xxxl-60");
  }
}

function updateCompareModelSpacing(value) {
  const numeric = Number(value);
  settings.compareModelSpacingMm = Number.isFinite(numeric) ? THREE.MathUtils.clamp(numeric, 0, 300) : 100;
  const label = document.querySelector("#compare-model-spacing-value");
  if (label) label.textContent = settings.compareModelSpacingMm.toFixed(settings.compareModelSpacingMm % 1 ? 1 : 0);
  if (settings.compareModelsEnabled) loadModelComparisonFromSelection();
}

function loadRhinoModelDetached(url, meshOptions = {}) {
  const loader = new Rhino3dmLoader();
  loader.setLibraryPath("https://unpkg.com/three@0.164.1/examples/jsm/libs/rhino3dm/");
  const effectiveMeshOptions = { ...defaultRhinoMeshOptions, ...meshOptions, skipFrame: true, quiet: true };

  return new Promise((resolve, reject) => {
    loader.load(
      url,
      (object) => {
        object.name = "Imported Rhino 3DM jewelry model";
        applyRhinoCoordinateFrame(object, effectiveMeshOptions);
        normalizeImportedModel(object, effectiveMeshOptions);
        resolve(object);
      },
      undefined,
      reject,
    );
  });
}

async function loadLibraryModelDetached(id) {
  const uploaded = uploadedModels.get(id);
  if (uploaded?.model) {
    const clone = cloneModelForLibrary(uploaded.model);
    restoreCachedImportedModelState(clone, uploaded.sourceType === "3dm" ? (uploaded.meshOptions || defaultRhinoMeshOptions) : {});
    attachCatalogMetaToModel(clone, id, uploaded.name);
    return { model: clone, defaults: { title: uploaded.name, copy: uploaded.copy, meshOptions: uploaded.meshOptions || {} } };
  }
  if (uploaded?.sourceBlob) {
    const url = URL.createObjectURL(uploaded.sourceBlob);
    try {
      const object = await loadPersistentModelObject(url, uploaded.sourceType, { ...(uploaded.meshOptions || {}), skipFrame: true, quiet: true });
      uploaded.model = cloneModelForLibrary(object);
      attachCatalogMetaToModel(object, id, uploaded.name);
      if (uploaded.sourceType === "3dm") uploaded.sourceUrl = url;
      else URL.revokeObjectURL(url);
      return { model: object, defaults: { title: uploaded.name, copy: uploaded.copy, meshOptions: uploaded.meshOptions || {} } };
    } catch (error) {
      URL.revokeObjectURL(url);
      throw error;
    }
  }

  const defaults = modelDefaults[id];
  if (!defaults?.url) return null;
  const ext = defaults.url.split("?")[0].split(".").pop().toLowerCase();
  let model;
  if (ext === "3dm") model = await loadWithTimeout(loadRhinoModelDetached(defaults.url, defaults.meshOptions || defaultRhinoMeshOptions), 24000, defaults.title || "Modèle 3DM");
  else if (ext === "obj") model = await loadObjModel(defaults.url);
  else if (ext === "fbx") model = await loadFbxModel(defaults.url);
  else if (ext === "ply") model = await loadPlyModel(defaults.url);
  else if (ext === "3ds") model = await load3dsModel(defaults.url);
  else model = await loadGltfModel(defaults.url);
  attachCatalogMetaToModel(model, id, defaults.title);
  return { model, defaults };
}

function getComparisonArrangementAxis(models) {
  const firstBox = models.map((entry) => getVisibleMeshBox(entry.model)).find((box) => !isBoxEmpty(box));
  if (!firstBox) return "z";
  const size = firstBox.getSize(new THREE.Vector3());
  return size.x >= size.z ? "z" : "x";
}

function refreshComparisonGemRendering(group, options = {}) {
  const gems = [];
  centerGemMesh = null;
  group.traverse((child) => {
    if (!child.isMesh) return;
    const material = Array.isArray(child.material) ? child.material[0] : child.material;
    const label = `${child.name || ""} ${material?.name || ""}`.toLowerCase();
    const isGem = child.userData?.classicPlugRole === "gem" || isDiamondRayTraceTarget(child) || isLikelyGemMaterial(material, label);
    if (!isGem) return;
    gems.push(child);
    if (!centerGemMesh) centerGemMesh = child;
    const preset = getMaterialPresetForGem(material) || (material?.userData?.jewelryMaterial?.preset && gemPresets[material.userData.jewelryMaterial.preset]) || gemPresets.diamond;
    applyGemReflectionFinish(material, preset);
    ensureDiamondRayColorAttribute(child.geometry, preset?.cabochon ? 0.07 : 0.12);
  });

  const maxRayTraced = Number.isFinite(options.maxRayTraced) ? Math.max(0, options.maxRayTraced) : Math.min(2, gems.length);
  gems.slice(0, maxRayTraced).forEach((mesh, index) => {
    setTimeout(() => scheduleDiamondInternalRayTracing(mesh, `comparaison plugs ${index + 1}`), 240 + index * 520);
  });
  logDebug("diamond-rt", "Rendu optique comparaison prepare.", { gems: gems.length, rayTraced: Math.min(gems.length, maxRayTraced) });
}

function placeComparisonModels(models, spacingMm) {
  const group = new THREE.Group();
  group.name = "Comparaison de plugs";
  const spacing = Math.max(0, spacingMm) / 100;
  const arrangeAxis = getComparisonArrangementAxis(models);
  let cursor = 0;

  models.forEach((entry) => {
    const model = entry.model;
    model.updateWorldMatrix(true, true);
    const box = getVisibleMeshBox(model);
    if (isBoxEmpty(box)) return;
    const size = box.getSize(new THREE.Vector3());
    const center = box.getCenter(new THREE.Vector3());
    if (arrangeAxis === "z") {
      model.position.x -= center.x;
      model.position.z += cursor - box.min.z;
      cursor += size.z + spacing;
    } else {
      model.position.x += cursor - box.min.x;
      model.position.z -= center.z;
      cursor += size.x + spacing;
    }
    model.updateWorldMatrix(true, true);
    const movedBox = getVisibleMeshBox(model);
    model.position.y += floor.position.y - movedBox.min.y + 0.08;
    model.updateWorldMatrix(true, true);
    group.add(model);
  });

  group.updateWorldMatrix(true, true);
  const groupBox = getVisibleMeshBox(group);
  if (!isBoxEmpty(groupBox)) {
    const center = groupBox.getCenter(new THREE.Vector3());
    group.position.x -= center.x;
    group.position.z -= center.z;
  }
  group.userData.comparisonArrangeAxis = arrangeAxis;
  return group;
}

async function loadModelComparisonFromSelection() {
  updateCompareModelSelectionFromList();
  const ids = settings.compareModelIds?.length ? settings.compareModelIds : [settings.modelId || "plug-classique-xxxl-60"];
  startLoading(`Chargement de ${ids.length} modèles à comparer`, 3);
  try {
    const loaded = [];
    for (let index = 0; index < ids.length; index += 1) {
      const id = ids[index];
      setLoadingProgress(8 + (index / ids.length) * 48, `Chargement du modèle ${index + 1} sur ${ids.length}`);
      const entry = await loadLibraryModelDetached(id);
      if (entry?.model) loaded.push(entry);
    }
    if (!loaded.length) throw new Error("Aucun plug de comparaison chargeable");
    resetJewelryRoot();
    const comparison = placeComparisonModels(loaded, settings.compareModelSpacingMm);
    setLoadingProgress(72, "Disposition des modèles en parallèle");
    root.add(comparison);
    prepareObjectMaterialEditor({ ensureStoneShowcase: false });
    refreshComparisonGemRendering(comparison, { maxRayTraced: Math.min(2, loaded.length) });
    setLoadingProgress(88, "Préparation du rendu optique des pierres");
    buildGemOpticalEffect();
    updateSoftStudioShadow(comparison, true);
    frameImportedModel(comparison, { classicPlugGem: loaded.some((entry) => entry.defaults?.meshOptions?.classicPlugGem) });
    updateProductCopy({ copy: `${loaded.length} plugs affichés en parallèle. Jeu : ${settings.compareModelSpacingMm.toFixed(0)} mm.` });
    logDebug("library", "Comparaison de plugs chargée", { ids, spacingMm: settings.compareModelSpacingMm });
  } catch (error) {
    console.error(error);
    showNotice("Impossible de charger la comparaison de plugs.");
  } finally {
    finishLoading();
  }
}

async function loadPreloadedLibraryModel(id, defaults) {
  settings.modelId = id;
  resetDiamondRayTraceQueue("changement modele bibliotheque");
  updateProductCopy(defaults);
  startLoading("Ouverture du modèle", 3);
  try {
    let model;
    const ext = defaults.url.split("?")[0].split(".").pop().toLowerCase();
    if (ext === "3dm") model = await loadWithTimeout(loadRhinoModel(defaults.url, defaults.meshOptions || defaultRhinoMeshOptions), 24000, defaults.title || "Modèle 3DM");
    else if (ext === "obj") model = await loadObjModel(defaults.url);
    else if (ext === "fbx") model = await loadFbxModel(defaults.url);
    else if (ext === "ply") model = await loadPlyModel(defaults.url);
    else if (ext === "3ds") model = await load3dsModel(defaults.url);
    else model = await loadGltfModel(defaults.url);
    attachCatalogMetaToModel(model, id, defaults.title);
    uploadedModels.set(id, {
      id,
      name: defaults.title,
      model: model ? cloneModelForLibrary(model) : null,
      copy: defaults.copy,
      sourceType: ext === "3dm" ? "3dm" : ext,
      sourceUrl: ext === "3dm" ? defaults.url : null,
      sourceFileName: defaults.title,
      meshOptions: ext === "3dm" ? { ...(defaults.meshOptions || defaultRhinoMeshOptions) } : null,
    });
    document.querySelector("#jewel-model").value = id;
    updateProductCopy(defaults);
    prepareObjectMaterialEditor({ ensureStoneShowcase: !(defaults.meshOptions && defaults.meshOptions.classicPlugGem) });
    buildGemOpticalEffect();
    syncEffectStatus();
    setCurrentRhinoSource(ext === "3dm" ? {
      id,
      url: defaults.url,
      fileName: defaults.title,
      meshOptions: defaults.meshOptions || defaultRhinoMeshOptions,
      preloaded: true,
    } : null);
    logDebug("info", "Modèle préchargé depuis la bibliothèque", { id, url: defaults.url });
  } catch (error) {
    console.error(error);
    buildPreloadedPlugFallback(defaults, error, id);
    showNotice("Modèle 3DM indisponible : aperçu procédural chargé.");
  } finally {
    finishLoading();
  }
}

function addUploadedModelToLibrary(model, fileName, source = {}) {
  const id = source.id || `uploaded-${Date.now()}-${uploadedModelCounter++}`;
  const cleanName = fileName.replace(/\.(glb|gltf|obj|fbx|ply|3ds|3dm)$/i, "");
  const entry = {
    id,
    name: cleanName,
    model: model ? cloneModelForLibrary(model) : null,
    copy: `Modèle importé : ${cleanName}. Matériaux convertis pour rendu joaillerie.`,
    sourceType: source.type || null,
    sourceUrl: source.url || null,
    sourceFileName: source.fileName || fileName,
    sourceBlob: source.blob || null,
    meshOptions: source.meshOptions ? { ...source.meshOptions } : null,
    persistent: Boolean(source.blob || source.persistent),
  };
  uploadedModels.set(id, entry);

  const select = document.querySelector("#jewel-model");
  let option = [...select.options].find((candidate) => candidate.value === id);
  if (!option) {
    option = document.createElement("option");
    option.value = id;
    select.appendChild(option);
  }
  option.textContent = `Import - ${cleanName}`;
  if (source.activate !== false) {
    select.value = id;
    settings.modelId = id;
    updateProductCopy({ copy: entry.copy });
    setCurrentRhinoSource(entry.sourceType === "3dm" ? {
      id,
      url: entry.sourceUrl,
      fileName: entry.sourceFileName,
      meshOptions: entry.meshOptions || defaultRhinoMeshOptions,
      preloaded: false,
    } : null);
  }

  if (entry.sourceBlob && source.skipPersist !== true) {
    savePersistentModelRecord({
      id,
      name: entry.name,
      fileName: entry.sourceFileName,
      type: entry.sourceType || fileName.split(".").pop().toLowerCase(),
      blob: entry.sourceBlob,
      meshOptions: entry.meshOptions,
      createdAt: Date.now(),
    }).then(() => {
      logDebug("library", "Modèle sauvegardé dans la bibliothèque persistante", { id, fileName: entry.sourceFileName });
      showNotice(`${entry.name} enregistré dans la bibliothèque locale.`);
    }).catch((error) => {
      console.error(error);
      showNotice("Le modele n a pas pu être sauvegarde localement. Espace navigateur insuffisant possible.");
    });
  }
  return entry;
}
async function loadPersistentModelObject(url, type, meshOptions) {
  if (type === "3dm") return loadRhinoModel(url, meshOptions || defaultRhinoMeshOptions);
  if (type === "obj") return loadObjModel(url);
  if (type === "fbx") return loadFbxModel(url);
  if (type === "ply") return loadPlyModel(url);
  if (type === "3ds") return load3dsModel(url);
  return loadGltfModel(url);
}

async function restorePersistentModelLibrary() {
  let records;
  try {
    records = await readPersistentModelRecords();
  } catch (error) {
    console.warn("Bibliothèque persistante indisponible", error);
    return;
  }
  if (!records.length) return;

  let restored = 0;
  for (const record of records.sort((a, b) => (a.createdAt || 0) - (b.createdAt || 0))) {
    if (!record?.blob || !record?.id || uploadedModels.has(record.id)) continue;
    addUploadedModelToLibrary(null, record.fileName || record.name, {
      id: record.id,
      type: record.type,
      fileName: record.fileName || record.name,
      blob: record.blob,
      meshOptions: record.meshOptions,
      persistent: true,
      skipPersist: true,
      activate: false,
    });
    restored += 1;
  }

  if (restored > 0) {
    logDebug("library", "Bibliothèque persistante indexée sans charger les géométries", { restored });
    showNotice(`${restored} projet(s) disponible(s) dans la bibliothèque locale.`);
  }
}

async function loadUploadedLibraryModel(id) {
  const entry = uploadedModels.get(id);
  if (!entry) return;

  if (!entry.model && entry.sourceBlob) {
    startLoading("Ouverture du modèle sauvegardé", 3);
    const url = URL.createObjectURL(entry.sourceBlob);
    try {
      resetJewelryRoot();
      const model = await loadPersistentModelObject(url, entry.sourceType, entry.meshOptions);
      attachCatalogMetaToModel(model, id, entry.name);
      entry.model = cloneModelForLibrary(model);
      if (entry.sourceType === "3dm") entry.sourceUrl = url;
      else URL.revokeObjectURL(url);
      updateProductCopy({ copy: entry.copy });
      settings.modelId = id;
      document.querySelector("#jewel-model").value = id;
      setCurrentRhinoSource(entry.sourceType === "3dm" ? {
        id,
        url: entry.sourceUrl,
        fileName: entry.sourceFileName || entry.name,
        meshOptions: entry.meshOptions || defaultRhinoMeshOptions,
        preloaded: false,
      } : null);
      return;
    } catch (error) {
      URL.revokeObjectURL(url);
      console.error(error);
      showNotice("Impossible d’ouvrir le modèle sauvegardé depuis la bibliothèque locale.");
      return;
    } finally {
      finishLoading();
    }
  }

  resetJewelryRoot();
  const model = cloneModelForLibrary(entry.model);
  attachCatalogMetaToModel(model, id, entry.name);
  centerGemMesh = null;
  root.add(model);
  restoreCachedImportedModelState(model, entry.sourceType === "3dm" ? (entry.meshOptions || defaultRhinoMeshOptions) : {});
  const hasEmbeddedClassicGem = entry.sourceType === "3dm" && entry.meshOptions && entry.meshOptions.classicPlugGem;
  if (hasEmbeddedClassicGem) settings.stoneShowcaseVisible = false;
  prepareObjectMaterialEditor({ ensureStoneShowcase: !hasEmbeddedClassicGem });
  buildGemOpticalEffect();
  updateProductCopy({ copy: entry.copy });
  settings.modelId = id;
  frameImportedModel(model, entry.sourceType === "3dm" ? (entry.meshOptions || defaultRhinoMeshOptions) : {});
  controls.update();
  setCurrentRhinoSource(entry.sourceType === "3dm" ? {
    id,
    url: entry.sourceUrl,
    fileName: entry.sourceFileName || entry.name,
    meshOptions: entry.meshOptions || defaultRhinoMeshOptions,
    preloaded: false,
  } : null);
}

function removeSelectedLibraryModel() {
  const select = document.querySelector("#jewel-model");
  if (select.options.length <= 1) {
    showNotice("Impossible d’enlever le dernier modèle de la bibliothèque.");
    return;
  }

  const id = select.value;
  const option = select.selectedOptions[0];
  const removed = uploadedModels.get(id);
  if (removed?.sourceType === "3dm" && removed.sourceUrl?.startsWith("blob:")) {
    URL.revokeObjectURL(removed.sourceUrl);
  }
  uploadedModels.delete(id);
  option.remove();
  if (removed?.persistent) {
    deletePersistentModelRecord(id).catch((error) => console.error("Suppression persistante impossible", error));
  }

  const nextId = select.value || select.options[0].value;
  select.value = nextId;
  loadJewelryExample(nextId);
  showNotice(removed?.persistent ? "Modèle supprimé de la bibliothèque locale." : "Modèle enlevé de la bibliothèque pour cette session.");
}

function setCurrentRhinoSource(source) {
  currentRhinoSource = source && source.url ? {
    ...source,
    meshOptions: { ...defaultRhinoMeshOptions, ...(source.meshOptions || {}) },
  } : null;
  syncRhinoRemeshControls(currentRhinoSource?.meshOptions || defaultRhinoMeshOptions);
  updateRhinoRemeshAvailability();
  clearRhinoMeshPreview();
}

function getCurrentRhinoLibraryEntry() {
  if (!currentRhinoSource?.id) return null;
  return uploadedModels.get(currentRhinoSource.id) || null;
}

function updateRhinoRemeshAvailability(stateText = null) {
  const panel = document.querySelector(".rhino-remesh");
  if (!panel) return;
  const enabled = Boolean(currentRhinoSource?.url);
  panel.setAttribute("aria-disabled", String(!enabled));
  [
    "#rhino-remesh-quality",
    "#rhino-remesh-chord",
    "#rhino-remesh-angle",
    "#rhino-remesh-max-edge",
    "#rhino-remesh-subdivision",
    "#rhino-remesh-relaxation",
    "#rhino-remesh-relaxation-strength",
    "#rhino-remesh-preserve-angle",
    "#rhino-remesh-smooth-angle",
    "#rhino-remesh-recompute-normals",
    "#rhino-remesh-weighted-normals",
    "#rhino-remesh-live",
    "#rhino-preview-enabled",
    "#rhino-preview-mode",
    "#rhino-preview-opacity",
    "#rhino-remesh-apply",
  ].forEach((selector) => {
    const control = document.querySelector(selector);
    if (control) control.disabled = !enabled;
  });
  const state = document.querySelector("#rhino-remesh-state");
  if (state) {
    state.textContent = stateText || (enabled ? "Source 3DM disponible" : "Aucune source 3DM active");
  }
}

function getRhinoRemeshOptions() {
  return {
    ...defaultRhinoMeshOptions,
    quality: document.querySelector("#rhino-remesh-quality")?.value || "luxury",
    chordTolerance: Number(document.querySelector("#rhino-remesh-chord")?.value || defaultRhinoMeshOptions.chordTolerance),
    angleTolerance: Number(document.querySelector("#rhino-remesh-angle")?.value || defaultRhinoMeshOptions.angleTolerance),
    maxEdgeLength: Number(document.querySelector("#rhino-remesh-max-edge")?.value || defaultRhinoMeshOptions.maxEdgeLength),
    visualSubdivisions: Number(document.querySelector("#rhino-remesh-subdivision")?.value || defaultRhinoMeshOptions.visualSubdivisions),
    surfaceRelaxation: Number(document.querySelector("#rhino-remesh-relaxation")?.value || defaultRhinoMeshOptions.surfaceRelaxation),
    relaxationStrength: Number(document.querySelector("#rhino-remesh-relaxation-strength")?.value || defaultRhinoMeshOptions.relaxationStrength),
    preserveAngle: Number(document.querySelector("#rhino-remesh-preserve-angle")?.value || defaultRhinoMeshOptions.preserveAngle),
    smoothAngle: Number(document.querySelector("#rhino-remesh-smooth-angle")?.value || defaultRhinoMeshOptions.smoothAngle),
    recomputeNormals: document.querySelector("#rhino-remesh-recompute-normals")?.checked === true,
    weightedNormals: document.querySelector("#rhino-remesh-weighted-normals")?.checked === true,
    preserveRhinoFrame: document.querySelector("#rhino-preserve-frame")?.checked !== false,
    rhinoZUp: document.querySelector("#rhino-z-up")?.checked !== false,
    creaseNormals: true,
  };
}

function syncRhinoRemeshControls(options = defaultRhinoMeshOptions) {
  const quality = document.querySelector("#rhino-remesh-quality");
  if (!quality) return;
  quality.value = options.quality || "custom";
  document.querySelector("#rhino-remesh-chord").value = String(options.chordTolerance ?? defaultRhinoMeshOptions.chordTolerance);
  document.querySelector("#rhino-remesh-angle").value = String(options.angleTolerance ?? defaultRhinoMeshOptions.angleTolerance);
  document.querySelector("#rhino-remesh-max-edge").value = String(options.maxEdgeLength ?? defaultRhinoMeshOptions.maxEdgeLength);
  document.querySelector("#rhino-remesh-subdivision").value = String(options.visualSubdivisions ?? defaultRhinoMeshOptions.visualSubdivisions);
  document.querySelector("#rhino-remesh-relaxation").value = String(options.surfaceRelaxation ?? defaultRhinoMeshOptions.surfaceRelaxation);
  document.querySelector("#rhino-remesh-relaxation-strength").value = String(options.relaxationStrength ?? defaultRhinoMeshOptions.relaxationStrength);
  document.querySelector("#rhino-remesh-preserve-angle").value = String(options.preserveAngle ?? defaultRhinoMeshOptions.preserveAngle);
  document.querySelector("#rhino-remesh-smooth-angle").value = String(options.smoothAngle ?? defaultRhinoMeshOptions.smoothAngle);
  document.querySelector("#rhino-remesh-recompute-normals").checked = options.recomputeNormals === true;
  document.querySelector("#rhino-remesh-weighted-normals").checked = options.weightedNormals === true;
  const preserveFrame = document.querySelector("#rhino-preserve-frame");
  if (preserveFrame) preserveFrame.checked = options.preserveRhinoFrame !== false;
  const rhinoZUp = document.querySelector("#rhino-z-up");
  if (rhinoZUp) rhinoZUp.checked = options.rhinoZUp !== false;
  syncRhinoRemeshLabels();
}

function syncRhinoRemeshLabels() {
  const options = getRhinoRemeshOptions();
  const formatAngle = (value) => Number.isInteger(value) ? value.toFixed(0) : value.toFixed(1);
  document.querySelector("#rhino-remesh-chord-value").textContent = options.chordTolerance.toFixed(3);
  document.querySelector("#rhino-remesh-angle-value").textContent = formatAngle(options.angleTolerance);
  document.querySelector("#rhino-remesh-max-edge-value").textContent = options.maxEdgeLength.toFixed(4);
  document.querySelector("#rhino-remesh-subdivision-value").textContent = String(options.visualSubdivisions);
  document.querySelector("#rhino-remesh-relaxation-value").textContent = String(options.surfaceRelaxation);
  document.querySelector("#rhino-remesh-relaxation-strength-value").textContent = options.relaxationStrength.toFixed(2);
  document.querySelector("#rhino-remesh-preserve-angle-value").textContent = formatAngle(options.preserveAngle);
  document.querySelector("#rhino-remesh-smooth-value").textContent = formatAngle(options.smoothAngle);
  const previewOpacity = Number(document.querySelector("#rhino-preview-opacity")?.value || 0.42);
  document.querySelector("#rhino-preview-opacity-value").textContent = previewOpacity.toFixed(2);
}

function applyRhinoRemeshPreset(id) {
  const preset = meshQualityPresets[id] || meshQualityPresets.luxury;
  syncRhinoRemeshControls({
    ...getRhinoRemeshOptions(),
    quality: id,
    chordTolerance: preset.chord,
    angleTolerance: preset.angle,
    maxEdgeLength: preset.maxEdge,
    visualSubdivisions: preset.visualSubdivisions,
    surfaceRelaxation: preset.surfaceRelaxation ?? defaultRhinoMeshOptions.surfaceRelaxation,
    relaxationStrength: preset.relaxationStrength ?? defaultRhinoMeshOptions.relaxationStrength,
    preserveAngle: preset.preserveAngle ?? defaultRhinoMeshOptions.preserveAngle,
    smoothAngle: preset.smoothAngle ?? defaultRhinoMeshOptions.smoothAngle,
    weightedNormals: preset.weightedNormals === true,
    recomputeNormals: preset.recomputeNormals !== false,
    preserveRhinoFrame: getRhinoRemeshOptions().preserveRhinoFrame,
    rhinoZUp: getRhinoRemeshOptions().rhinoZUp,
  });
}

function scheduleCurrentRhinoRemesh(immediate = false) {
  if (!currentRhinoSource?.url) {
    updateRhinoRemeshAvailability();
    showNotice("Ce modele n'a pas de source Rhino 3DM associee.");
    return;
  }
  window.clearTimeout(rhinoRemeshTimer);
  if (immediate) {
    rhinoRemeshTimer = window.setTimeout(() => remeshCurrentRhinoModel(), immediate ? 0 : 420);
  }
}

function scheduleRhinoInstantPreview(immediate = false) {
  window.clearTimeout(rhinoPreviewTimer);
  if (!document.querySelector("#rhino-preview-enabled")?.checked) {
    clearRhinoMeshPreview();
    updateRhinoRemeshAvailability(currentRhinoSource?.url ? "Source 3DM disponible" : null);
    return;
  }
  rhinoPreviewTimer = window.setTimeout(() => updateRhinoMeshPreview(), immediate ? 0 : 40);
}

async function remeshCurrentRhinoModel() {
  if (!currentRhinoSource?.url) return;
  const requestId = ++rhinoRemeshRequestId;
  const options = getRhinoRemeshOptions();
  const source = { ...currentRhinoSource };
  clearRhinoMeshPreview();
  startLoading("Recalcul du maillage Rhino", 4);
  updateRhinoRemeshAvailability("Recalcul du maillage...");
  try {
    logDebug("import", "Recalcul maillage Rhino depuis source 3DM", {
      id: source.id,
      fileName: source.fileName,
      options,
    });
    const model = await loadRhinoModel(source.url, options);
    if (requestId !== rhinoRemeshRequestId) return;
    const entry = getCurrentRhinoLibraryEntry();
    if (entry) {
      entry.model = cloneModelForLibrary(model);
      entry.meshOptions = { ...options };
      entry.sourceType = "3dm";
      entry.sourceUrl = source.url;
      entry.sourceFileName = source.fileName;
    }
    currentRhinoSource = { ...source, meshOptions: { ...options } };
    syncRhinoRemeshControls(options);
    updateRhinoRemeshAvailability("Maillage mis a jour");
    scheduleRhinoInstantPreview(true);
    showNotice("Maillage Rhino recalcule et affichage mis a jour.");
  } catch (error) {
    console.error(error);
    updateRhinoRemeshAvailability("Erreur de recalcul");
    showNotice("Impossible de recalculer ce maillage depuis le 3DM source.");
  } finally {
    finishLoading("Maillage mis à jour");
  }
}

function getActiveImportedModel() {
  return root.children.find((child) => child !== reflectionRig && child !== rhinoPreviewGroup) || null;
}

function clearRhinoMeshPreview() {
  if (!rhinoPreviewGroup) return;
  const active = getActiveImportedModel();
  if (active) active.visible = true;
  rhinoPreviewGroup.traverse((child) => {
    if (child.isMesh) {
      child.geometry?.dispose?.();
      if (Array.isArray(child.material)) child.material.forEach((mat) => mat.dispose?.());
      else child.material?.dispose?.();
    }
  });
  root.remove(rhinoPreviewGroup);
  rhinoPreviewGroup = null;
  const stats = document.querySelector("#rhino-preview-stats");
  if (stats) stats.textContent = "Aperçu : inactif";
}

function makePreviewWireMaterial(opacity) {
  return new THREE.MeshBasicMaterial({
    color: "#7fe8ff",
    transparent: true,
    opacity,
    wireframe: true,
    depthTest: false,
    depthWrite: false,
    toneMapped: false,
  });
}

function makePreviewSurfaceMaterial() {
  return new THREE.MeshPhysicalMaterial({
    color: "#c8efff",
    metalness: 0,
    roughness: 0.2,
    transparent: true,
    opacity: 0.16,
    depthWrite: false,
    side: THREE.DoubleSide,
    toneMapped: false,
  });
}

function updateRhinoMeshPreview() {
  if (!currentRhinoSource?.url) {
    clearRhinoMeshPreview();
    updateRhinoRemeshAvailability();
    return;
  }
  const active = getActiveImportedModel();
  if (!active) return;

  clearRhinoMeshPreview();
  const options = getRhinoRemeshOptions();
  const acceptedOptions = currentRhinoSource?.meshOptions || defaultRhinoMeshOptions;
  const acceptedSubdivisions = Number(acceptedOptions.visualSubdivisions || 0);
  const targetSubdivisions = Number(options.visualSubdivisions || 0);
  const previewProcessingOptions = {
    ...options,
    visualSubdivisions: Math.max(0, targetSubdivisions - acceptedSubdivisions),
  };
  const mode = document.querySelector("#rhino-preview-mode")?.value || "wire-overlay";
  const opacity = Number(document.querySelector("#rhino-preview-opacity")?.value || 0.42);
  const preview = new THREE.Group();
  preview.name = "Rhino mesh instant preview";
  preview.userData.rhinoMeshPreview = true;
  const wireMaterial = makePreviewWireMaterial(opacity);
  const surfaceMaterial = makePreviewSurfaceMaterial();
  const showSurface = mode === "surface-overlay" || mode === "wire-only";
  const stats = { meshes: 0, vertices: 0, triangles: 0 };

  active.updateWorldMatrix(true, true);
  active.traverse((child) => {
    if (!child.isMesh || !child.geometry) return;
    const holder = new THREE.Group();
    const mesh = new THREE.Mesh(child.geometry.clone(), new THREE.MeshBasicMaterial());
    holder.add(mesh);
    applyImportedMeshProcessing(holder, {
      ...previewProcessingOptions,
      doubleSided: false,
      softStudioShadow: false,
      geometricShadow: false,
    }, { quiet: true });
    const previewGeometry = mesh.geometry;
    const positionCount = previewGeometry.getAttribute("position")?.count || 0;
    stats.meshes += 1;
    stats.vertices += positionCount;
    stats.triangles += previewGeometry.index ? Math.floor(previewGeometry.index.count / 3) : Math.floor(positionCount / 3);
    const wire = new THREE.Mesh(previewGeometry, wireMaterial.clone());
    wire.name = `${child.name || "mesh"} - filaire aperçu`;
    wire.matrix.copy(child.matrixWorld);
    wire.matrixAutoUpdate = false;
    wire.renderOrder = 90;
    preview.add(wire);
    if (showSurface) {
      const surface = new THREE.Mesh(previewGeometry.clone(), surfaceMaterial.clone());
      surface.name = `${child.name || "mesh"} - surface aperçu`;
      surface.matrix.copy(child.matrixWorld);
      surface.matrixAutoUpdate = false;
      surface.visible = mode === "surface-overlay";
      surface.renderOrder = 80;
      preview.add(surface);
    }
  });

  active.visible = mode !== "wire-only";
  rhinoPreviewGroup = preview;
  root.add(rhinoPreviewGroup);
  const statsEl = document.querySelector("#rhino-preview-stats");
  if (statsEl) {
    const downsampleNote = targetSubdivisions < acceptedSubdivisions ? " - valider pour revenir \u00e0 moins fin" : "";
    statsEl.textContent = `Aperçu : ${stats.meshes} mesh(s), ${stats.vertices.toLocaleString("fr-FR")} sommets, ${stats.triangles.toLocaleString("fr-FR")} triangles${downsampleNote}`;
  }
  updateRhinoRemeshAvailability("Aperçu instantané actif");
  logDebug("import", "Aperçu instantané du maillage mis \u00e0 jour", {
    mode,
    opacity,
    smoothAngle: options.smoothAngle,
    visualSubdivisions: options.visualSubdivisions,
  });
}

function resetJewelryRoot() {
  stemDecalGesture?.cancel();
  clearStemDecalSelection();
  clearRhinoMeshPreview();
  detachManipulator();
  closeMaterialContextMenu();
  resetDiamondRayTraceQueue("reset scene bijoux");
  root.clear();
  reflectionRig.clear();
  stoneShowcaseGroup = null;
  stoneShowcaseMesh = null;
  stoneShowcasePedestal = null;
  stoneShowcaseLockedPosition = null;
  centerGemMesh = null;
  selectedSceneObject = null;
  editableObjects.length = 0;
  root.add(reflectionRig);
  softStudioShadow.visible = false;
  const objectSelect = document.querySelector("#object-select");
  const objectLabel = document.querySelector("#selected-object-name");
  if (objectSelect) objectSelect.innerHTML = '<option value="">Aucun objet</option>';
  if (objectLabel) objectLabel.textContent = "Aucun objet";
}

function buildProceduralRing() {
  resetJewelryRoot();

  const shank = new THREE.Mesh(new THREE.TorusGeometry(1.42, 0.135, 42, 192), goldMaterial);
  shank.name = "polished yellow gold shank";
  shank.rotation.x = Math.PI / 2;
  shank.scale.set(1.04, 0.86, 1);
  shank.castShadow = true;
  root.add(shank);

  const shoulderGeo = new THREE.TorusGeometry(1.03, 0.046, 18, 120, Math.PI * 0.72);
  for (const side of [-1, 1]) {
    const shoulder = new THREE.Mesh(shoulderGeo, goldMaterial);
    shoulder.name = "gold pave shoulder";
    shoulder.position.set(side * 0.54, 0.31, 0);
    shoulder.rotation.set(Math.PI / 2, 0, side * 0.2);
    shoulder.scale.set(0.72, 0.42, 1);
    shoulder.castShadow = true;
    root.add(shoulder);
  }

  const halo = new THREE.Mesh(new THREE.TorusGeometry(0.72, 0.045, 18, 128), goldMaterial);
  halo.name = "gold halo setting";
  halo.position.y = 0.72;
  halo.scale.set(1, 0.74, 1);
  halo.rotation.x = Math.PI / 2;
  halo.castShadow = true;
  root.add(halo);

  const basket = new THREE.Mesh(new THREE.CylinderGeometry(0.55, 0.68, 0.22, 96, 1, true), goldMaterial);
  basket.name = "openwork gold basket";
  basket.position.y = 0.57;
  basket.scale.z = 0.72;
  basket.castShadow = true;
  root.add(basket);

  const gem = new THREE.Mesh(createOvalGemGeometry(0.58, 0.42, 0.46, 96), centerGemMaterial);
  gem.name = "padparadscha center gemstone";
  gem.position.y = 0.82;
  gem.rotation.y = 0.08;
  gem.castShadow = true;
  gem.renderOrder = 2;
  centerGemMesh = gem;
  root.add(gem);

  addProngs();
  addHaloPaves();
  addShoulderPaves();

  root.rotation.y = -0.38;
  root.position.y = -0.08;
}

function buildEmeraldSolitaireRing() {
  resetJewelryRoot();
  const shank = new THREE.Mesh(new THREE.TorusGeometry(1.36, 0.12, 40, 180), goldMaterial);
  shank.rotation.x = Math.PI / 2;
  shank.scale.set(1.02, 0.88, 1);
  shank.castShadow = true;
  root.add(shank);

  addShoulderStones(0.58, 8, diamondMaterial, 0.052);
  const bezel = new THREE.Mesh(new THREE.BoxGeometry(1.0, 0.16, 0.72, 8, 2, 8), goldMaterial);
  bezel.position.y = 0.72;
  bezel.castShadow = true;
  root.add(bezel);

  const gem = new THREE.Mesh(new THREE.BoxGeometry(0.76, 0.34, 0.5, 5, 4, 5), centerGemMaterial);
  gem.name = "emerald cut center gemstone";
  gem.position.y = 0.93;
  gem.rotation.y = 0.05;
  gem.castShadow = true;
  centerGemMesh = gem;
  root.add(gem);

  addProngsAround(0.48, 0.34, 0.95);
  root.rotation.y = -0.34;
  root.position.y = -0.08;
}

function buildSapphireTrilogyRing() {
  resetJewelryRoot();
  const shank = new THREE.Mesh(new THREE.TorusGeometry(1.34, 0.11, 36, 180), whiteGoldMaterial);
  shank.rotation.x = Math.PI / 2;
  shank.scale.set(1.05, 0.84, 1);
  shank.castShadow = true;
  root.add(shank);

  const basket = new THREE.Mesh(new THREE.CylinderGeometry(0.68, 0.8, 0.2, 96, 1, true), whiteGoldMaterial);
  basket.position.y = 0.58;
  basket.scale.z = 0.52;
  root.add(basket);

  const center = new THREE.Mesh(createOvalGemGeometry(0.5, 0.36, 0.42, 80), centerGemMaterial);
  center.name = "oval sapphire center gemstone";
  center.position.y = 0.82;
  center.castShadow = true;
  centerGemMesh = center;
  root.add(center);

  for (const side of [-1, 1]) {
    const diamond = new THREE.Mesh(createOvalGemGeometry(0.25, 0.18, 0.22, 54), diamondMaterial);
    diamond.name = "pear side diamond";
    diamond.position.set(side * 0.64, 0.78, 0);
    diamond.rotation.z = side * 0.22;
    diamond.castShadow = true;
    root.add(diamond);
  }
  addProngsAround(0.48, 0.3, 0.85, whiteGoldMaterial);
  root.rotation.y = -0.32;
  root.position.y = -0.08;
}

function buildRubySignetRing() {
  resetJewelryRoot();
  const shank = new THREE.Mesh(new THREE.TorusGeometry(1.28, 0.2, 44, 180), goldMaterial);
  shank.rotation.x = Math.PI / 2;
  shank.scale.set(1.08, 0.86, 1);
  shank.castShadow = true;
  root.add(shank);

  const head = new THREE.Mesh(new THREE.CylinderGeometry(0.78, 0.9, 0.34, 96), goldMaterial);
  head.position.y = 0.63;
  head.scale.z = 0.66;
  head.castShadow = true;
  root.add(head);

  const gem = new THREE.Mesh(new THREE.SphereGeometry(0.42, 64, 32, 0, Math.PI * 2, 0, Math.PI * 0.56), centerGemMaterial);
  gem.name = "ruby cabochon gemstone";
  gem.position.y = 0.78;
  gem.scale.z = 0.78;
  gem.castShadow = true;
  centerGemMesh = gem;
  root.add(gem);

  addPaveCircle(0.73, 0.78, 0.5, 22, diamondMaterial, 0.038);
  root.rotation.y = -0.28;
  root.position.y = -0.1;
}

function buildDiamondTennisBracelet() {
  resetJewelryRoot();
  const count = 34;
  for (let i = 0; i < count; i += 1) {
    const a = (i / count) * Math.PI * 2;
    const x = Math.cos(a) * 1.65;
    const z = Math.sin(a) * 0.88;
    const link = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.08, 0.18, 2, 1, 2), whiteGoldMaterial);
    link.position.set(x, 0.2, z);
    link.rotation.y = -a;
    link.castShadow = true;
    root.add(link);

    const stone = new THREE.Mesh(createRoundBrilliantGeometry(0.082, 0.1, 20), i === 0 ? centerGemMaterial : diamondMaterial);
    stone.name = "bracelet brilliant diamond";
    stone.position.set(x, 0.29, z);
    stone.rotation.x = Math.PI / 2;
    stone.castShadow = true;
    if (i === 0) centerGemMesh = stone;
    root.add(stone);
  }
  root.rotation.set(0.25, -0.45, 0);
  root.position.y = -0.16;
}

function buildEmeraldCuffBracelet() {
  resetJewelryRoot();
  const cuff = new THREE.Mesh(new THREE.TorusGeometry(1.48, 0.12, 32, 160, Math.PI * 1.55), whiteGoldMaterial);
  cuff.rotation.x = Math.PI / 2;
  cuff.rotation.z = Math.PI * 0.72;
  cuff.scale.set(1.15, 0.72, 1);
  cuff.castShadow = true;
  root.add(cuff);

  for (let i = 0; i < 9; i += 1) {
    const t = (i - 4) / 4;
    const x = t * 1.15;
    const z = Math.cos(t * Math.PI * 0.42) * 0.22;
    const gem = new THREE.Mesh(createOvalGemGeometry(0.15, 0.1, 0.18, 48), i === 4 ? centerGemMaterial : centerGemMaterial.clone());
    gem.name = "emerald cuff cabochon";
    gem.position.set(x, 0.38 + Math.cos(t * Math.PI) * 0.08, z);
    gem.rotation.x = Math.PI / 2;
    gem.castShadow = true;
    if (i === 4) centerGemMesh = gem;
    root.add(gem);
  }
  root.rotation.set(0.18, -0.36, 0);
  root.position.y = -0.1;
}

function buildPearlEarrings() {
  resetJewelryRoot();
  for (const side of [-1, 1]) {
    const top = new THREE.Mesh(createRoundBrilliantGeometry(0.12, 0.12, 24), diamondMaterial);
    top.position.set(side * 0.45, 1.02, 0);
    top.rotation.x = Math.PI / 2;
    root.add(top);

    const hoop = new THREE.Mesh(new THREE.TorusGeometry(0.22, 0.022, 16, 72), goldMaterial);
    hoop.position.set(side * 0.45, 0.75, 0);
    hoop.rotation.x = Math.PI / 2;
    root.add(hoop);

    const pearl = new THREE.Mesh(new THREE.SphereGeometry(0.22, 64, 32), side === -1 ? centerGemMaterial : pearlMaterial);
    pearl.name = "ivory pearl drop";
    pearl.position.set(side * 0.45, 0.38, 0);
    pearl.scale.set(1, 1.08, 1);
    pearl.castShadow = true;
    if (side === -1) centerGemMesh = pearl;
    root.add(pearl);
  }
  root.rotation.y = -0.25;
  root.position.y = -0.22;
}

function buildSapphireDropEarrings() {
  resetJewelryRoot();
  for (const side of [-1, 1]) {
    const rail = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.025, 0.7, 16), whiteGoldMaterial);
    rail.position.set(side * 0.46, 0.72, 0);
    rail.rotation.z = 0.05 * side;
    root.add(rail);

    for (let i = 0; i < 5; i += 1) {
      const diamond = new THREE.Mesh(createRoundBrilliantGeometry(0.055, 0.06, 18), diamondMaterial);
      diamond.position.set(side * 0.46, 1.05 - i * 0.13, 0.02);
      diamond.rotation.x = Math.PI / 2;
      root.add(diamond);
    }

    const sapphire = new THREE.Mesh(createOvalGemGeometry(0.2, 0.14, 0.26, 60), side === -1 ? centerGemMaterial : centerGemMaterial.clone());
    sapphire.name = "sapphire drop gemstone";
    sapphire.position.set(side * 0.46, 0.22, 0);
    sapphire.rotation.x = Math.PI / 2;
    sapphire.castShadow = true;
    if (side === -1) centerGemMesh = sapphire;
    root.add(sapphire);
  }
  root.rotation.y = -0.28;
  root.position.y = -0.2;
}

function buildDiamondPendantNecklace() {
  resetJewelryRoot();
  addChainArc(1.45, 0.92, 30, whiteGoldMaterial);
  const bail = new THREE.Mesh(new THREE.TorusGeometry(0.16, 0.018, 16, 48), whiteGoldMaterial);
  bail.position.set(0, 0.48, 0);
  bail.rotation.x = Math.PI / 2;
  root.add(bail);

  const gem = new THREE.Mesh(createRoundBrilliantGeometry(0.26, 0.32, 48), centerGemMaterial);
  gem.name = "solitaire diamond pendant";
  gem.position.set(0, 0.1, 0);
  gem.rotation.x = Math.PI / 2;
  gem.castShadow = true;
  centerGemMesh = gem;
  root.add(gem);
  addProngsAround(0.25, 0.25, 0.12, whiteGoldMaterial);
  root.rotation.set(0.05, -0.2, 0);
  root.position.y = -0.05;
}

function buildRubyRiviereNecklace() {
  resetJewelryRoot();
  addChainArc(1.7, 0.9, 34, goldMaterial);
  for (let i = 0; i < 15; i += 1) {
    const t = (i - 7) / 7;
    const x = t * 1.45;
    const y = 0.08 - Math.abs(t) * 0.22;
    const scale = 0.13 + (1 - Math.abs(t)) * 0.08;
    const mat = i === 7 ? centerGemMaterial : centerGemMaterial.clone();
    const ruby = new THREE.Mesh(createOvalGemGeometry(scale, scale * 0.76, scale * 1.12, 48), mat);
    ruby.name = "graduated ruby necklace gemstone";
    ruby.position.set(x, y, 0);
    ruby.rotation.x = Math.PI / 2;
    ruby.castShadow = true;
    if (i === 7) centerGemMesh = ruby;
    root.add(ruby);

    if (i % 2 === 0) {
      const diamond = new THREE.Mesh(createRoundBrilliantGeometry(scale * 0.34, scale * 0.4, 18), diamondMaterial);
      diamond.position.set(x + 0.1, y + 0.02, 0.02);
      diamond.rotation.x = Math.PI / 2;
      root.add(diamond);
    }
  }
  root.rotation.set(0.08, -0.24, 0);
  root.position.y = 0.02;
}

function addProngs() {
  const prongGeo = new THREE.CylinderGeometry(0.026, 0.035, 0.56, 18);
  const positions = [
    [-0.56, 0, -0.32],
    [0.56, 0, -0.32],
    [-0.56, 0, 0.32],
    [0.56, 0, 0.32],
  ];

  positions.forEach(([x, , z]) => {
    const prong = new THREE.Mesh(prongGeo, goldMaterial);
    prong.name = "gold claw prong";
    prong.position.set(x, 0.75, z);
    prong.rotation.z = x > 0 ? -0.18 : 0.18;
    prong.rotation.x = z > 0 ? 0.15 : -0.15;
    prong.castShadow = true;
    root.add(prong);
  });
}

function addProngsAround(width, depth, y, material = goldMaterial) {
  const prongGeo = new THREE.CylinderGeometry(0.018, 0.026, 0.34, 16);
  const positions = [
    [-width, y, -depth],
    [width, y, -depth],
    [-width, y, depth],
    [width, y, depth],
  ];

  positions.forEach(([x, py, z]) => {
    const prong = new THREE.Mesh(prongGeo, material);
    prong.name = "classic claw prong";
    prong.position.set(x, py, z);
    prong.rotation.z = x > 0 ? -0.14 : 0.14;
    prong.rotation.x = z > 0 ? 0.12 : -0.12;
    prong.castShadow = true;
    root.add(prong);
  });
}

function addShoulderStones(startX, count, material, radius) {
  const geo = createRoundBrilliantGeometry(radius, radius * 1.18, 18);
  for (const side of [-1, 1]) {
    for (let i = 0; i < count; i += 1) {
      const t = i / Math.max(1, count - 1);
      const stone = new THREE.Mesh(geo, material);
      stone.name = "classic shoulder diamond";
      stone.position.set(side * (startX + t * 0.74), 0.5 - t * 0.16, 0.02);
      stone.rotation.set(Math.PI / 2, side * 0.35, 0);
      stone.scale.setScalar(1 - t * 0.24);
      stone.castShadow = true;
      root.add(stone);
    }
  }
}

function addPaveCircle(rx, y, rz, count, material, radius) {
  const geo = createRoundBrilliantGeometry(radius, radius * 1.12, 16);
  for (let i = 0; i < count; i += 1) {
    const angle = (i / count) * Math.PI * 2;
    const pave = new THREE.Mesh(geo, material);
    pave.name = "classic diamond halo";
    pave.position.set(Math.cos(angle) * rx, y, Math.sin(angle) * rz);
    pave.rotation.set(Math.PI / 2, 0, -angle);
    root.add(pave);
  }
}

function addChainArc(rx, rz, count, material) {
  for (let i = 0; i < count; i += 1) {
    const t = i / (count - 1);
    const angle = Math.PI * (0.12 + t * 0.76);
    const x = Math.cos(angle) * rx;
    const y = 0.78 - Math.sin(angle) * 0.72;
    const z = Math.sin(angle) * rz * 0.12;
    const link = new THREE.Mesh(new THREE.TorusGeometry(0.075, 0.012, 10, 28), material);
    link.name = "oval necklace chain link";
    link.position.set(x, y, z);
    link.rotation.set(Math.PI / 2, 0, -angle);
    link.scale.x = 1.45;
    link.castShadow = true;
    root.add(link);
  }
}

function addHaloPaves() {
  const gemGeo = createRoundBrilliantGeometry(0.075, 0.085, 18);
  const count = 34;
  for (let i = 0; i < count; i += 1) {
    const angle = (i / count) * Math.PI * 2;
    const material = i % 4 === 0 ? pinkPaveMaterial : diamondMaterial;
    const pave = new THREE.Mesh(gemGeo, material);
    pave.name = material === pinkPaveMaterial ? "pink sapphire pave" : "diamond pave";
    pave.position.set(Math.cos(angle) * 0.75, 0.86, Math.sin(angle) * 0.52);
    pave.rotation.set(Math.PI / 2, 0, -angle);
    pave.castShadow = true;
    root.add(pave);
  }
}

function addShoulderPaves() {
  const gemGeo = createRoundBrilliantGeometry(0.052, 0.062, 16);
  for (const side of [-1, 1]) {
    for (let i = 0; i < 11; i += 1) {
      const t = i / 10;
      const pave = new THREE.Mesh(gemGeo, i % 3 === 1 ? pinkPaveMaterial : diamondMaterial);
      pave.name = "gradient pave on shoulder";
      pave.position.set(side * (0.7 + t * 0.8), 0.49 - t * 0.18, -0.04 + Math.sin(t * Math.PI) * 0.08);
      pave.rotation.set(Math.PI / 2.15, side * 0.45, 0);
      pave.scale.setScalar(1 - t * 0.24);
      pave.castShadow = true;
      root.add(pave);
    }
  }
}

function buildGemOpticalEffect() {
  detachManipulator();
  reflectionRig.clear();
  if (!centerGemMesh) return;

  if (settings.effectMethod === "physical") {
    if (settings.effects.customReflections) addCustomInternalReflections();
    updateGemOpticalEffect();
    return;
  }

  if (settings.effects.dispersion && (settings.effectMethod === "spectral" || settings.effectMethod === "chromatic")) {
    const spectral = [
      { name: "red spectral refraction shell", color: "#ff2b42", offset: -1 },
      { name: "green spectral refraction shell", color: "#57ff8b", offset: 0 },
      { name: "blue spectral refraction shell", color: "#4ab3ff", offset: 1 },
    ];

    spectral.forEach((entry, index) => {
      const mat = new THREE.MeshBasicMaterial({
        color: entry.color,
        transparent: true,
        opacity: 0.16,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        side: THREE.BackSide,
      });
      const shell = new THREE.Mesh(centerGemMesh.geometry, mat);
      shell.name = entry.name;
      shell.userData.spectralOffset = entry.offset;
      shell.userData.baseScale = 1.004 + index * 0.002;
      shell.position.copy(centerGemMesh.position);
      shell.rotation.copy(centerGemMesh.rotation);
      reflectionRig.add(shell);
    });
  }

  if (settings.effects.caustics && (settings.effectMethod === "caustic" || settings.effectMethod === "spectral")) {
    addFacetSparkles();
  }

  if (settings.effects.parametric) addParametricGemEffects();
  if (settings.effects.customReflections) addCustomInternalReflections();
  updateGemOpticalEffect();
}

function addParametricGemEffects() {
  if (settings.gemMaterialModel === "natural" && settings.spectralRichness < 0.18 && settings.gemCloudiness < 0.12) {
    return;
  }

  const count = Math.round(5 + settings.spectralRichness * 13 + settings.facetContrast * 8);
  const palette = getSpectralPalette();
  for (let i = 0; i < count; i += 1) {
    const mat = new THREE.MeshBasicMaterial({
      color: palette[i % palette.length],
      transparent: true,
      opacity: 0.06,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      side: THREE.DoubleSide,
    });
    const size = 0.08 + ((i % 5) / 5) * 0.16;
    const geo = new THREE.BufferGeometry();
    geo.setAttribute(
      "position",
      new THREE.Float32BufferAttribute([0, size, 0, -size * 0.82, -size * 0.62, 0, size * 0.92, -size * 0.42, 0], 3),
    );
    geo.computeVertexNormals();
    const shard = new THREE.Mesh(geo, mat);
    shard.name = "parametric spectral facet";
    shard.userData.parametricGemEffect = true;
    shard.userData.phase = i * 0.73;
    const a = i * 2.399;
    shard.position.set(
      centerGemMesh.position.x + Math.cos(a) * (0.08 + (i % 4) * 0.055),
      centerGemMesh.position.y + 0.02 - (i % 5) * 0.035,
      centerGemMesh.position.z + Math.sin(a) * (0.06 + (i % 3) * 0.05),
    );
    shard.rotation.set(0.4 + i * 0.13, a, i * 0.41);
    reflectionRig.add(shard);
  }
}

function getSpectralPalette() {
  if (settings.gemMaterialModel === "smoky") return ["#1d1330", "#50316f", "#b989ff", "#332211", "#f0a94a"];
  if (settings.gemMaterialModel === "opal") return ["#ff3f8f", "#44ffd2", "#66a8ff", "#f8ff83", "#b78cff"];
  if (settings.gemMaterialModel === "included") return ["#ffffff", "#f8d8aa", "#7bd1ff", "#ff90c8", "#9affc7"];
  return ["#ff304f", "#ff9d00", "#ffe600", "#2eff8a", "#28d7ff", "#315cff", "#c238ff", "#ff4ed8"];
}

function addCustomInternalReflections() {
  settings.reflections.forEach((reflection, index) => {
    const mat = new THREE.SpriteMaterial({
      map: getReflectionTexture(reflection.shape),
      color: reflection.color,
      transparent: true,
      opacity: reflection.shape === "point" ? 0.95 : 0.72,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      depthTest: true,
    });
    const glint = new THREE.Sprite(mat);
    glint.name = `custom internal reflection ${index + 1}`;
    glint.userData.customReflection = true;
    glint.userData.manipulable = true;
    glint.userData.reflectionIndex = index;
    glint.userData.phase = index * 2.2 + 0.4;
    glint.userData.baseScale = reflection.radius;
    reflectionRig.add(glint);
  });
}

function addFacetSparkles() {
  const points = [
    [-0.34, 0.94, 0.11, 0.04],
    [-0.14, 1.03, -0.18, 0.033],
    [0.1, 1.01, 0.19, 0.038],
    [0.32, 0.91, -0.05, 0.03],
    [-0.03, 0.89, 0.31, 0.026],
    [0.24, 0.82, 0.26, 0.028],
    [-0.42, 0.82, -0.1, 0.025],
    [0, 1.06, 0.02, 0.044],
  ];

  points.forEach(([x, y, z, scale], index) => {
    const mat = new THREE.SpriteMaterial({
      map: sparkleTexture,
      color: index % 3 === 0 ? "#ffffff" : settings.reflectionColor,
      transparent: true,
      opacity: 0.7,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });
    const sparkle = new THREE.Sprite(mat);
    sparkle.name = "facet spectral sparkle";
    sparkle.position.set(x, y, z);
    sparkle.scale.setScalar(scale);
    sparkle.userData.phase = index * 1.7;
    sparkle.userData.baseScale = scale;
    reflectionRig.add(sparkle);
  });
}


const stoneDiameterOptions = [3, 5, 8, 9, 12, 16, 18, 27];
const stoneDiameterReferenceMm = 8;
const stoneWorldDiameterAtReference = 0.58;
const stoneShowcaseMinScale = 0.35;
const stoneShowcaseMaxScale = 4.5;
const stoneGeometryCache = new Map();
const stoneGeometryPromiseCache = new Map();

const stoneGeometryPresets = {
  "round-brilliant": {
    label: "1088",
    sourceShape: "1088",
    sourceDiameterMm: 8,
    shape: "round",
    kind: "rhino-stone",
    fallbackKind: "faceted",
    modelUrl: "./assets/models/stones/1088_8mm.3dm",
    width: stoneWorldDiameterAtReference,
    depth: stoneWorldDiameterAtReference,
    height: 0.42,
    visual: "radial-gradient(circle at 38% 28%, #ffffff 0 7%, transparent 8%), conic-gradient(from 12deg, #f7fbff, #86d8ff, #ffffff, #ffd16f, #f7fbff)",
  },
  "stone-1122": {
    label: "1122",
    sourceShape: "1122",
    sourceDiameterMm: 18,
    shape: "round",
    kind: "rhino-stone",
    fallbackKind: "faceted",
    modelUrl: "./assets/models/stones/1122_18mm.3dm?v=20260728-1122-source",
    width: stoneWorldDiameterAtReference,
    depth: stoneWorldDiameterAtReference,
    height: 0.38,
    visual: "radial-gradient(circle at 38% 28%, #ffffff 0 7%, transparent 8%), conic-gradient(from 20deg, #f8fbff, #d9e5ff, #ffffff, #aaaeb5, #f8fbff)",
  },
  "stone-1201": {
    label: "1201",
    sourceShape: "1201",
    sourceDiameterMm: 27,
    shape: "round",
    kind: "rhino-stone",
    fallbackKind: "faceted",
    modelUrl: "./assets/models/stones/1201_27mm.3dm?v=20260728-1201-source",
    width: stoneWorldDiameterAtReference,
    depth: stoneWorldDiameterAtReference,
    height: 0.4,
    visual: "radial-gradient(circle at 38% 28%, #ffffff 0 7%, transparent 8%), conic-gradient(from 30deg, #ffffff, #c7eeff, #ffdcb0, #c8bfff, #ffffff)",
  },
  "stone-2006": {
    label: "2006",
    sourceShape: "2006",
    sourceDiameterMm: 16,
    shape: "round",
    kind: "rhino-stone",
    fallbackKind: "faceted",
    modelUrl: "./assets/models/stones/2006_16mm.3dm?v=20260728-2006-source",
    preserveRhinoFrame: true,
    width: stoneWorldDiameterAtReference,
    depth: stoneWorldDiameterAtReference,
    height: 0.38,
    visual: "radial-gradient(circle at 38% 28%, #ffffff 0 7%, transparent 8%), conic-gradient(from 14deg, #ffffff, #f5d7db, #d8fbff, #9ea7ad, #ffffff)",
  },
  "stone-2088": {
    label: "2088",
    sourceShape: "2088",
    sourceDiameterMm: 3,
    shape: "round",
    kind: "rhino-stone",
    fallbackKind: "faceted",
    modelUrl: "./assets/models/stones/2088_3mm.3dm",
    width: stoneWorldDiameterAtReference,
    depth: stoneWorldDiameterAtReference,
    height: 0.34,
    visual: "radial-gradient(circle at 38% 28%, #ffffff 0 7%, transparent 8%), conic-gradient(from 8deg, #ffffff, #aeefff, #f7fbff, #f3cf73, #ffffff)",
  },
  "cabochon": {
    label: "Cabochon",
    sourceShape: "cabochon",
    sourceDiameterMm: 12,
    shape: "round",
    kind: "rhino-stone",
    fallbackKind: "cabochon",
    modelUrl: "./assets/models/stones/cabochon_12mm.3dm",
    width: 0.62,
    depth: 0.62,
    height: 0.28,
    material: "rh7-aquamarine-cabochon",
    visual: "radial-gradient(circle at 34% 25%, #ffffff 0 12%, transparent 13%), radial-gradient(circle, #d8fbff, #5cc3e6)",
  },
  "cristaux-cabochon": {
    label: "Cristaux cabochon",
    sourceShape: "cristaux-cabochon",
    sourceDiameterMm: 12,
    shape: "round",
    kind: "rhino-stone",
    fallbackKind: "faceted-cabochon",
    modelUrl: "./assets/models/stones/cristaux-cabochon_12mm.3dm",
    width: 0.62,
    depth: 0.62,
    height: 0.24,
    facetRings: 4,
    facetSegments: 18,
    visual: "radial-gradient(circle at 34% 24%, #ffffff 0 10%, transparent 11%), conic-gradient(from 10deg, #f8fbff, #9da3a8, #ffffff, #6f7479, #f8fbff)",
  },
};

const stoneGeometryAliases = {
  "1088": "round-brilliant",
  "1122": "stone-1122",
  "1201": "stone-1201",
  "2006": "stone-2006",
  "2088": "stone-2088",
  "faceted-cabochon-clear": "cristaux-cabochon",
  "faceted-cabochon-aurore": "cristaux-cabochon",
};

function resolveStoneGeometryId(id) {
  return stoneGeometryPresets[id] ? id : stoneGeometryAliases[id] || "round-brilliant";
}

function createOvalGemGeometry(width, depth, height, segments) {
  const positions = [];
  const indices = [];
  const rings = [
    { y: height * 0.5, sx: 0.42, sz: 0.42 },
    { y: height * 0.26, sx: 1, sz: 1 },
    { y: -height * 0.08, sx: 0.88, sz: 0.88 },
    { y: -height * 0.5, sx: 0.18, sz: 0.18 },
  ];

  rings.forEach((ring, ringIndex) => {
    for (let i = 0; i < segments; i += 1) {
      const a = (i / segments) * Math.PI * 2;
      const facet = ringIndex % 2 ? 1 + Math.sin(i * 7) * 0.018 : 1 + Math.cos(i * 9) * 0.012;
      positions.push(Math.cos(a) * width * ring.sx * facet, ring.y, Math.sin(a) * depth * ring.sz * facet);
    }
  });

  for (let r = 0; r < rings.length - 1; r += 1) {
    for (let i = 0; i < segments; i += 1) {
      const a = r * segments + i;
      const b = r * segments + ((i + 1) % segments);
      const c = (r + 1) * segments + i;
      const d = (r + 1) * segments + ((i + 1) % segments);
      indices.push(a, c, b, b, c, d);
    }
  }

  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  geo.setIndex(indices);
  geo.computeVertexNormals();
  return geo;
}

function createRoundBrilliantGeometry(radius, height, segments) {
  const count = Math.max(16, Math.round(segments || 48));
  const positions = [];
  const origin = new THREE.Vector3(0, -height * 0.08, 0);
  const point = (r, y, i, offset = 0) => {
    const a = ((i + offset) / count) * Math.PI * 2;
    return new THREE.Vector3(Math.cos(a) * radius * r, y, Math.sin(a) * radius * r);
  };
  const pushTri = (a, b, c) => {
    const normal = new THREE.Vector3().subVectors(b, a).cross(new THREE.Vector3().subVectors(c, a));
    const outward = new THREE.Vector3().addVectors(a, b).add(c).multiplyScalar(1 / 3).sub(origin);
    if (normal.dot(outward) < 0) [b, c] = [c, b];
    positions.push(a.x, a.y, a.z, b.x, b.y, b.z, c.x, c.y, c.z);
  };

  const tableY = height * 0.34;
  const starY = height * 0.19;
  const girdleTopY = height * 0.015;
  const girdleBottomY = -height * 0.035;
  const pavilionY = -height * 0.38;
  const culet = new THREE.Vector3(0, -height * 0.64, 0);
  const tableCenter = new THREE.Vector3(0, tableY + height * 0.012, 0);

  for (let i = 0; i < count; i += 1) {
    const next = (i + 1) % count;
    const t0 = point(0.52, tableY, i);
    const t1 = point(0.52, tableY, next);
    const s0 = point(0.74, starY, i, 0.5);
    const s1 = point(0.74, starY, next, 0.5);
    const g0 = point(1.0, girdleTopY, i);
    const g1 = point(1.0, girdleTopY, next);
    const gb0 = point(0.985, girdleBottomY, i);
    const gb1 = point(0.985, girdleBottomY, next);
    const p0 = point(0.43, pavilionY, i, 0.5);
    const p1 = point(0.43, pavilionY, next, 0.5);

    pushTri(tableCenter, t0, t1);
    pushTri(t0, s0, t1);
    pushTri(t1, s0, s1);
    pushTri(s0, g0, s1);
    pushTri(s1, g0, g1);
    pushTri(g0, gb0, g1);
    pushTri(g1, gb0, gb1);
    pushTri(gb0, p0, gb1);
    pushTri(gb1, p0, p1);
    pushTri(p0, culet, p1);
  }

  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  geo.computeVertexNormals();
  return geo;
}

function createCabochonGemGeometry(width, depth, height, segments = 96, rings = 18) {
  const positions = [];
  const indices = [];
  for (let r = 0; r <= rings; r += 1) {
    const v = r / rings;
    const radius = Math.sin(v * Math.PI * 0.5);
    const dome = Math.cos(v * Math.PI * 0.5);
    const y = dome * height * 0.56 - height * 0.16;
    for (let i = 0; i < segments; i += 1) {
      const a = (i / segments) * Math.PI * 2;
      positions.push(Math.cos(a) * width * 0.5 * radius, y, Math.sin(a) * depth * 0.5 * radius);
    }
  }
  for (let r = 0; r < rings; r += 1) {
    for (let i = 0; i < segments; i += 1) {
      const a = r * segments + i;
      const b = r * segments + ((i + 1) % segments);
      const c = (r + 1) * segments + i;
      const d = (r + 1) * segments + ((i + 1) % segments);
      indices.push(a, b, c, b, d, c);
    }
  }
  const baseCenter = positions.length / 3;
  positions.push(0, -height * 0.18, 0);
  const last = rings * segments;
  for (let i = 0; i < segments; i += 1) {
    indices.push(baseCenter, last + ((i + 1) % segments), last + i);
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  geo.setIndex(indices);
  geo.computeVertexNormals();
  return geo;
}

function createFacetedCabochonGemGeometry(width, depth, height, segments = 18, rings = 4) {
  const positions = [];
  const pushVertex = (point) => positions.push(point.x, point.y, point.z);
  const pushTri = (a, b, c) => {
    pushVertex(a);
    pushVertex(b);
    pushVertex(c);
  };
  const ringPoint = (ring, index) => {
    const t = ring / rings;
    const angleStep = (Math.PI * 2) / segments;
    const angle = index * angleStep + (ring % 2 ? angleStep * 0.5 : 0);
    const facetPulse = 1 + Math.sin(index * 2.17 + ring * 1.31) * 0.012;
    const radius = Math.sin(t * Math.PI * 0.5) * facetPulse;
    const dome = Math.cos(t * Math.PI * 0.5);
    return new THREE.Vector3(
      Math.cos(angle) * width * 0.5 * radius,
      dome * height * 0.58 - height * 0.16,
      Math.sin(angle) * depth * 0.5 * radius,
    );
  };
  const top = new THREE.Vector3(0, height * 0.44, 0);
  for (let i = 0; i < segments; i += 1) {
    pushTri(top, ringPoint(1, i), ringPoint(1, (i + 1) % segments));
  }
  for (let r = 1; r < rings; r += 1) {
    for (let i = 0; i < segments; i += 1) {
      const a = ringPoint(r, i);
      const b = ringPoint(r + 1, i);
      const c = ringPoint(r, (i + 1) % segments);
      const d = ringPoint(r + 1, (i + 1) % segments);
      if ((i + r) % 2 === 0) {
        pushTri(a, b, c);
        pushTri(c, b, d);
      } else {
        pushTri(a, b, d);
        pushTri(a, d, c);
      }
    }
  }
  const baseCenter = new THREE.Vector3(0, -height * 0.18, 0);
  for (let i = 0; i < segments; i += 1) {
    const a = ringPoint(rings, i);
    const b = ringPoint(rings, (i + 1) % segments);
    const aBase = new THREE.Vector3(a.x, baseCenter.y, a.z);
    const bBase = new THREE.Vector3(b.x, baseCenter.y, b.z);
    pushTri(a, aBase, b);
    pushTri(b, aBase, bBase);
    pushTri(baseCenter, bBase, aBase);
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  geo.computeVertexNormals();
  return geo;
}
function createStoneShowcaseFallbackGeometry(id) {
  const resolvedId = resolveStoneGeometryId(id);
  const preset = stoneGeometryPresets[resolvedId] || stoneGeometryPresets["round-brilliant"];
  const kind = preset.fallbackKind || preset.kind;
  if (kind === "cabochon") return createCabochonGemGeometry(preset.width, preset.depth, preset.height, 112, 22);
  if (kind === "faceted-cabochon") return createFacetedCabochonGemGeometry(preset.width, preset.depth, preset.height, preset.facetSegments || 18, preset.facetRings || 4);
  return createClassicGemGeometry(preset.shape || "round", preset.width, preset.depth, preset.height);
}

function createStoneShowcaseGeometry(id) {
  const resolvedId = resolveStoneGeometryId(id);
  const cachedGeometry = stoneGeometryCache.get(resolvedId);
  if (cachedGeometry) return cachedGeometry.clone();
  return createStoneShowcaseFallbackGeometry(resolvedId);
}

function loadRhinoStoneObject(url) {
  const loader = new Rhino3dmLoader();
  loader.setLibraryPath("https://unpkg.com/three@0.164.1/examples/jsm/libs/rhino3dm/");

  return new Promise((resolve, reject) => {
    loader.load(url, resolve, undefined, reject);
  });
}

function collectStoneMeshEntries(object) {
  object.updateMatrixWorld(true);
  const entries = [];
  object.traverse((child) => {
    if (!child.isMesh || !child.geometry?.attributes?.position) return;
    const box = new THREE.Box3().setFromObject(child);
    if (isBoxEmpty(box)) return;
    const size = box.getSize(new THREE.Vector3());
    entries.push({ mesh: child, box, center: box.getCenter(new THREE.Vector3()), diagonal: size.length(), volume: Math.max(size.x * size.y * size.z, 0) });
  });
  return entries;
}

function mergeStoneMeshGeometries(object) {
  const entries = collectStoneMeshEntries(object);
  if (!entries.length) throw new Error("Aucun maillage de pierre trouve dans le fichier 3DM.");
  const primary = entries.reduce((best, entry) => (!best || entry.volume > best.volume ? entry : best), null);
  const maxDiagonal = Math.max(...entries.map((entry) => entry.diagonal));
  const relevantEntries = entries.filter((entry) => {
    const nearPrimary = entry.center.distanceTo(primary.center) <= Math.max(primary.diagonal * 1.9, maxDiagonal * 0.24);
    const visibleScale = entry.diagonal >= maxDiagonal * 0.018;
    return nearPrimary && visibleScale;
  });
  const selectedEntries = relevantEntries.length ? relevantEntries : [primary];
  const positions = [];
  const normals = [];
  const normalMatrix = new THREE.Matrix3();
  const normal = new THREE.Vector3();
  selectedEntries.forEach(({ mesh }) => {
    let geometry = mesh.geometry.clone();
    if (geometry.index) geometry = geometry.toNonIndexed();
    if (!geometry.attributes.normal) geometry.computeVertexNormals();
    const normalAttr = geometry.attributes.normal;
    normalMatrix.getNormalMatrix(mesh.matrixWorld);
    geometry.applyMatrix4(mesh.matrixWorld);
    const positionAttr = geometry.attributes.position;
    for (let i = 0; i < positionAttr.count; i += 1) {
      positions.push(positionAttr.getX(i), positionAttr.getY(i), positionAttr.getZ(i));
      if (normalAttr) {
        normal.set(normalAttr.getX(i), normalAttr.getY(i), normalAttr.getZ(i)).normalize();
        normals.push(normal.x, normal.y, normal.z);
      }
    }
    geometry.dispose();
  });
  const merged = new THREE.BufferGeometry();
  merged.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  if (normals.length === positions.length) merged.setAttribute("normal", new THREE.Float32BufferAttribute(normals, 3));
  else merged.computeVertexNormals();
  merged.computeBoundingBox();
  merged.computeBoundingSphere();
  merged.userData.preserveStoneNormals = true;
  return merged;
}

function normalizeRhinoStoneGeometry(geometry, preset) {
  geometry.computeBoundingBox();
  const box = geometry.boundingBox;
  if (!box || isBoxEmpty(box)) return geometry;
  const size = box.getSize(new THREE.Vector3());
  const measuredDiameter = Math.max(size.x, size.z, size.y * 0.72);
  if (measuredDiameter > 0) {
    const scale = stoneWorldDiameterAtReference / measuredDiameter;
    geometry.scale(scale, scale, scale);
  }
  geometry.computeBoundingBox();
  geometry.computeBoundingSphere();
  geometry.userData.sourceShape = preset.sourceShape;
  geometry.userData.sourceDiameterMm = preset.sourceDiameterMm;
  geometry.userData.normalizedDiameterMm = stoneDiameterReferenceMm;
  return geometry;
}

async function buildRhinoStoneGeometry(preset) {
  const object = await loadRhinoStoneObject(preset.modelUrl);
  applyRhinoCoordinateFrame(object, { rhinoZUp: preset.preserveRhinoFrame !== true });
  const merged = mergeStoneMeshGeometries(object);
  return normalizeRhinoStoneGeometry(merged, preset);
}

async function loadStoneShowcaseGeometry(id) {
  const resolvedId = resolveStoneGeometryId(id);
  const preset = stoneGeometryPresets[resolvedId] || stoneGeometryPresets["round-brilliant"];
  const cachedGeometry = stoneGeometryCache.get(resolvedId);
  if (cachedGeometry) return cachedGeometry.clone();
  if (!preset.modelUrl) {
    const fallback = createStoneShowcaseFallbackGeometry(resolvedId);
    stoneGeometryCache.set(resolvedId, fallback.clone());
    return fallback;
  }
  if (!stoneGeometryPromiseCache.has(resolvedId)) {
    const promise = buildRhinoStoneGeometry(preset).then((geometry) => {
      stoneGeometryCache.set(resolvedId, geometry.clone());
      return geometry;
    }).catch((error) => {
      stoneGeometryPromiseCache.delete(resolvedId);
      logDebug("error", "Chargement geometrie pierre 3DM impossible", { pierre: preset.label, fichier: preset.modelUrl, erreur: error?.message || String(error) });
      throw error;
    });
    stoneGeometryPromiseCache.set(resolvedId, promise);
  }
  const geometry = await stoneGeometryPromiseCache.get(resolvedId);
  return geometry.clone();
}

function getStoneGeometryVisual(id) {
  return stoneGeometryPresets[resolveStoneGeometryId(id)]?.visual || "conic-gradient(#fff, #80e8ff, #ffd06f, #fff)";
}

function getStoneShowcaseSafeRadius() {
  const scale = settings.stoneShowcaseScale || 1;
  return Object.values(stoneGeometryPresets).reduce((maxRadius, preset) => {
    const radius = Math.max(preset.width || 0.6, preset.depth || 0.5) * 0.5 * scale;
    return Math.max(maxRadius, radius);
  }, 0.52 * scale);
}

function alignStoneShowcaseMeshToAnchor() {
  if (!stoneShowcaseMesh?.geometry) return;
  if (!settings.stoneShowcaseOnPedestal) {
    stoneShowcaseMesh.position.set(0, 0, 0);
    return;
  }
  stoneShowcaseMesh.geometry.computeBoundingBox();
  stoneShowcaseMesh.geometry.computeBoundingSphere();
  const box = stoneShowcaseMesh.geometry.boundingBox;
  if (!box || isBoxEmpty(box)) return;
  const scale = stoneShowcaseMesh.scale.x || 1;
  const center = box.getCenter(new THREE.Vector3());
  const stoneBottomClearance = 0.058;
  stoneShowcaseMesh.position.set(
    -center.x * scale,
    stoneBottomClearance - box.min.y * scale,
    -center.z * scale,
  );
}

function updateStoneShowcasePedestalVisibility() {
  if (stoneShowcasePedestal) stoneShowcasePedestal.visible = settings.stoneShowcaseOnPedestal;
}

function positionStoneShowcase(options = {}) {
  if (!stoneShowcaseGroup) return;
  updateStoneShowcasePedestalVisibility();
  alignStoneShowcaseMeshToAnchor();
  if (!settings.stoneShowcaseOnPedestal) {
    stoneShowcaseLockedPosition = null;
    stoneShowcaseGroup.position.set(0, 0, 0);
    return;
  }
  if (stoneShowcaseLockedPosition && !options.reflow) {
    stoneShowcaseGroup.position.copy(stoneShowcaseLockedPosition);
    return;
  }
  const wasVisible = stoneShowcaseGroup.visible;
  stoneShowcaseGroup.visible = false;
  const box = getVisibleMeshBox(root);
  stoneShowcaseGroup.visible = wasVisible;
  const size = box.getSize(new THREE.Vector3());
  const center = box.getCenter(new THREE.Vector3());
  const safeRadius = getStoneShowcaseSafeRadius();
  const clearance = 0.72;
  const x = isBoxEmpty(box) ? 1.35 : box.max.x + safeRadius + clearance;
  const z = isBoxEmpty(box) ? 0.15 : center.z + Math.max(size.z * 0.18, safeRadius * 0.55);
  stoneShowcaseGroup.position.set(x, floor.position.y + 0.002, z);
  stoneShowcaseLockedPosition = stoneShowcaseGroup.position.clone();
}

function ensureStoneShowcase() {
  if (stoneShowcaseGroup?.parent === root && stoneShowcaseMesh) {
    alignStoneShowcaseMeshToAnchor();
    positionStoneShowcase();
    return;
  }
  stoneShowcaseGroup = new THREE.Group();
  stoneShowcaseGroup.name = "Bibliothèque de géométries de pierres";
  stoneShowcaseMesh = new THREE.Mesh(createStoneShowcaseGeometry(settings.stoneShowcaseGeometry), makeGemMaterialFromPreset(settings.stoneShowcaseMaterial));
  stoneShowcaseMesh.name = "Pierre témoin - clic droit pour forme et mat\u00e9riau";
  stoneShowcaseMesh.userData.stoneShowcase = true;
  stoneShowcaseMesh.userData.stoneGeometryId = settings.stoneShowcaseGeometry;
  stoneShowcaseMesh.castShadow = true;
  stoneShowcaseMesh.receiveShadow = true;
  stoneShowcaseMesh.scale.setScalar(settings.stoneShowcaseScale);
  alignStoneShowcaseMeshToAnchor();
  stoneShowcaseGroup.add(stoneShowcaseMesh);
  stoneShowcasePedestal = new THREE.Mesh(
    new THREE.CylinderGeometry(0.42, 0.48, 0.045, 72),
    new THREE.MeshStandardMaterial({ color: "#2a2520", roughness: 0.48, metalness: 0.05, envMapIntensity: 0.4 }),
  );
  stoneShowcasePedestal.name = "Socle discret pierre temoin";
  stoneShowcasePedestal.position.y = 0.0225;
  stoneShowcasePedestal.visible = settings.stoneShowcaseOnPedestal;
  stoneShowcasePedestal.userData.parametricGemEffect = true;
  stoneShowcaseGroup.add(stoneShowcasePedestal);
  root.add(stoneShowcaseGroup);
  stoneShowcaseGroup.visible = settings.stoneShowcaseVisible;
  positionStoneShowcase({ reflow: true });
  scheduleDiamondInternalRayTracing(stoneShowcaseMesh, "initialisation pierre temoin");
  void loadStoneShowcaseGeometry(settings.stoneShowcaseGeometry)
    .then((geometry) => {
      if (!stoneShowcaseMesh || stoneShowcaseMesh.userData.stoneGeometryId !== settings.stoneShowcaseGeometry) return;
      const resolvedGeometryId = resolveStoneGeometryId(settings.stoneShowcaseGeometry);
      const preset = stoneGeometryPresets[resolvedGeometryId] || stoneGeometryPresets["round-brilliant"];
      const fixedGroupPosition = stoneShowcaseLockedPosition?.clone() || stoneShowcaseGroup?.position.clone() || null;
      settings.stoneShowcaseGeometry = resolvedGeometryId;
      installStoneShowcaseGeometry(geometry, resolvedGeometryId, preset, { fixedGroupPosition, select: false, reason: "chargement 3DM pierre temoin" });
    })
    .catch(() => {
      showNotice("Geometrie 3DM de pierre indisponible, fallback procedural conserve.");
    });
}

function installStoneShowcaseGeometry(geometry, resolvedId, preset, options = {}) {
  if (!stoneShowcaseMesh) return;
  const previousGeometry = stoneShowcaseMesh.geometry;
  stoneShowcaseMesh.geometry = geometry;
  if (previousGeometry && previousGeometry !== geometry) previousGeometry.dispose();
  stoneShowcaseMesh.userData.stoneGeometryId = resolvedId;
  stoneShowcaseMesh.name = "Pierre temoin - " + (preset.label || resolvedId);
  if (!stoneShowcaseMesh.geometry.attributes.normal) stoneShowcaseMesh.geometry.computeVertexNormals();
  stoneShowcaseMesh.geometry.normalizeNormals?.();
  stoneShowcaseMesh.geometry.computeBoundingBox();
  stoneShowcaseMesh.geometry.computeBoundingSphere();
  alignStoneShowcaseMeshToAnchor();
  scheduleDiamondInternalRayTracing(stoneShowcaseMesh, options.reason || "changement geometrie pierre");
  if (options.fixedGroupPosition && stoneShowcaseGroup) {
    stoneShowcaseLockedPosition = options.fixedGroupPosition.clone();
    stoneShowcaseGroup.position.copy(options.fixedGroupPosition);
  }
  syncStoneShowcaseControls();
  prepareObjectMaterialEditor();
  if (options.select !== false) selectSceneObject(stoneShowcaseMesh);
  if (options.fixedGroupPosition && stoneShowcaseGroup) stoneShowcaseGroup.position.copy(options.fixedGroupPosition);
}

async function applyStoneShowcaseGeometry(id) {
  const resolvedId = resolveStoneGeometryId(id);
  const preset = stoneGeometryPresets[resolvedId] || stoneGeometryPresets["round-brilliant"];
  settings.stoneShowcaseGeometry = resolvedId;
  if (!stoneShowcaseMesh) {
    if (!settings.stoneShowcaseVisible) {
      syncStoneShowcaseControls();
      showNotice((preset.label || resolvedId) + " selectionnee pour la pierre temoin. Cochez Afficher pour la voir.");
      return;
    }
    ensureStoneShowcase();
  }
  const fixedGroupPosition = stoneShowcaseLockedPosition?.clone() || stoneShowcaseGroup?.position.clone() || null;
  const alreadyLoaded = stoneGeometryCache.has(resolvedId);
  installStoneShowcaseGeometry(createStoneShowcaseGeometry(resolvedId), resolvedId, preset, { fixedGroupPosition, reason: alreadyLoaded ? "geometrie pierre 3DM en cache" : "fallback geometrie pierre" });
  if (preset.modelUrl && !alreadyLoaded) {
    startLoading("Chargement de la géométrie de pierre", 3);
    try {
      const geometry = await loadStoneShowcaseGeometry(resolvedId);
      if (!stoneShowcaseMesh || settings.stoneShowcaseGeometry !== resolvedId) return;
      installStoneShowcaseGeometry(geometry, resolvedId, preset, { fixedGroupPosition, reason: "chargement geometrie pierre 3DM" });
      showNotice((preset.label || resolvedId) + " charge depuis le 3DM source " + (preset.sourceDiameterMm || "?") + " mm - diametre courant conserve.");
    } catch (error) {
      showNotice((preset.label || resolvedId) + " utilise le fallback procedural : 3DM non charge.");
    } finally {
      finishLoading("Géométrie de pierre prête");
    }
    return;
  }
  showNotice((preset.label || resolvedId) + " appliquee a la pierre temoin - position et materiau conserves.");
}

function applyStoneShowcaseMaterial(id, options = {}) {
  const nextMaterial = gemPresets[id] ? id : settings.stoneShowcaseMaterial;
  const preset = gemPresets[nextMaterial] || gemPresets.padparadscha;
  settings.stoneShowcaseMaterial = nextMaterial;
  if (!stoneShowcaseMesh) {
    if (!settings.stoneShowcaseVisible) {
      syncStoneShowcaseControls();
      if (!options.silent) showNotice(`${preset.label} choisi pour la pierre temoin. Cochez Afficher pour la voir.`);
      return;
    }
    ensureStoneShowcase();
  }
  applySingleMaterialToMesh(stoneShowcaseMesh, makeGemMaterialFromPreset(settings.stoneShowcaseMaterial), { keepOpticalSettings: true });
  stoneShowcaseMesh.material.name = preset.label;
  scheduleDiamondInternalRayTracing(stoneShowcaseMesh, "changement materiau pierre");
  syncStoneShowcaseControls();
  if (!options.silent) {
    const geometryId = stoneShowcaseMesh?.userData?.stoneGeometryId || settings.stoneShowcaseGeometry;
    const label = String(preset.label || settings.stoneShowcaseMaterial || "").toLowerCase();
    const isDiamondMaterial = label.includes("diamant") || label.includes("diamond");
    const shapeHint = isDiamondMaterial && geometryId !== "round-brilliant" ?
       " Forme conservée : pour un vrai diamant taillé, choisir Rond brillant."
      : "";
    showNotice(`${preset.label} applique a la pierre témoin.${shapeHint}`);
  }
}

function setStoneShowcaseVisible(visible) {
  settings.stoneShowcaseVisible = Boolean(visible);
  if (settings.stoneShowcaseVisible) {
    if (!stoneShowcaseGroup) ensureStoneShowcase();
    if (stoneShowcaseGroup) {
      stoneShowcaseGroup.visible = true;
      positionStoneShowcase({ reflow: true });
    }
  } else if (stoneShowcaseGroup) {
    stoneShowcaseGroup.visible = false;
    if (selectedSceneObject?.userData?.stoneShowcase) selectSceneObject(null);
  }
  syncStoneShowcaseControls();
}

function setStoneShowcasePedestal(enabled) {
  settings.stoneShowcaseOnPedestal = Boolean(enabled);
  if (settings.stoneShowcaseVisible || stoneShowcaseGroup) {
    if (!stoneShowcaseGroup) ensureStoneShowcase();
    stoneShowcaseLockedPosition = null;
    positionStoneShowcase({ reflow: true });
  }
  syncStoneShowcaseControls();
  showNotice(settings.stoneShowcaseOnPedestal ?
     "Pierre temoin visible sur socle, placee a cote du modele."
    : "Socle masque : pierre temoin replacee a l'origine du fichier."
  );
}

function setStoneShowcaseScale(value) {
  const preservedGeometryId = resolveStoneGeometryId(stoneShowcaseMesh?.userData?.stoneGeometryId || settings.stoneShowcaseGeometry);
  settings.stoneShowcaseGeometry = preservedGeometryId;
  settings.stoneShowcaseScale = THREE.MathUtils.clamp(Number(value) || 1, stoneShowcaseMinScale, stoneShowcaseMaxScale);
  const inferredDiameter = settings.stoneShowcaseScale * stoneDiameterReferenceMm;
  const exactDiameter = stoneDiameterOptions.find((diameter) => Math.abs(diameter - inferredDiameter) < 0.05);
  if (exactDiameter) settings.stoneShowcaseDiameter = exactDiameter;
  if (!stoneShowcaseMesh) {
    if (!settings.stoneShowcaseVisible) {
      syncStoneShowcaseControls();
      return;
    }
    ensureStoneShowcase();
  }
  const preservedGroupPosition = stoneShowcaseGroup?.position.clone() || stoneShowcaseLockedPosition?.clone() || null;
  stoneShowcaseMesh.userData.stoneGeometryId = preservedGeometryId;
  stoneShowcaseMesh.scale.setScalar(settings.stoneShowcaseScale);
  alignStoneShowcaseMeshToAnchor();
  if (preservedGroupPosition && stoneShowcaseGroup) {
    stoneShowcaseGroup.position.copy(preservedGroupPosition);
    stoneShowcaseLockedPosition = preservedGroupPosition.clone();
  }
  syncStoneShowcaseControls();
}

function setStoneShowcaseDiameter(value) {
  const preservedGeometryId = stoneShowcaseMesh?.userData?.stoneGeometryId || settings.stoneShowcaseGeometry;
  const diameter = stoneDiameterOptions.includes(Number(value)) ? Number(value) : stoneDiameterReferenceMm;
  settings.stoneShowcaseGeometry = preservedGeometryId;
  settings.stoneShowcaseDiameter = diameter;
  settings.stoneShowcaseScale = THREE.MathUtils.clamp(diameter / stoneDiameterReferenceMm, stoneShowcaseMinScale, stoneShowcaseMaxScale);
  if (!stoneShowcaseMesh) {
    if (!settings.stoneShowcaseVisible) {
      syncStoneShowcaseControls();
      showNotice(`Diamètre pierre ${diameter} mm préparé. Cochez Afficher pour la voir.`);
      return;
    }
    ensureStoneShowcase();
  }
  const preservedGroupPosition = stoneShowcaseGroup?.position.clone() || stoneShowcaseLockedPosition?.clone() || null;
  stoneShowcaseMesh.userData.stoneGeometryId = preservedGeometryId;
  stoneShowcaseMesh.scale.setScalar(settings.stoneShowcaseScale);
  alignStoneShowcaseMeshToAnchor();
  if (preservedGroupPosition && stoneShowcaseGroup) {
    stoneShowcaseGroup.position.copy(preservedGroupPosition);
    stoneShowcaseLockedPosition = preservedGroupPosition.clone();
  }
  syncStoneShowcaseControls();
  showNotice(`Diamètre pierre ${diameter} mm - position conservée.`);
}

function populateStoneShowcaseControls() {
  const geometrySelect = document.querySelector("#stone-showcase-geometry");
  if (geometrySelect) {
    geometrySelect.innerHTML = Object.entries(stoneGeometryPresets)
      .map(([id, preset]) => `<option value="${id}">${preset.label}</option>`)
      .join("");
  }
  const materialSelect = document.querySelector("#stone-showcase-material");
  if (materialSelect) {
    materialSelect.innerHTML = getVisibleMaterialEntries("gem", "gem-preset")
      .map(([id, preset]) => `<option value="${id}">${preset.label}</option>`)
      .join("");
  }
  syncStoneShowcaseControls();
}

function syncStoneShowcaseControls() {
  const visible = document.querySelector("#stone-showcase-visible");
  const geometry = document.querySelector("#stone-showcase-geometry");
  const material = document.querySelector("#stone-showcase-material");
  const scale = document.querySelector("#stone-showcase-scale");
  const pedestal = document.querySelector("#stone-showcase-pedestal");
  const scaleValue = document.querySelector("#stone-showcase-scale-value");
  if (visible) visible.checked = settings.stoneShowcaseVisible;
  if (geometry) geometry.value = resolveStoneGeometryId(settings.stoneShowcaseGeometry);
  if (material) material.value = settings.stoneShowcaseMaterial;
  if (pedestal) pedestal.checked = settings.stoneShowcaseOnPedestal;
  if (scale) scale.value = String(settings.stoneShowcaseScale);
  const diameterLabel = settings.stoneShowcaseDiameter ? ` - ${settings.stoneShowcaseDiameter} mm` : "";
  if (scaleValue) scaleValue.textContent = `${settings.stoneShowcaseScale.toFixed(2)}x${diameterLabel}`;
}

function applyGemShape(shape) {
  if (!centerGemMesh) return;
  const box = new THREE.Box3().setFromObject(centerGemMesh);
  const size = box.getSize(new THREE.Vector3());
  const width = THREE.MathUtils.clamp(size.x || 0.9, 0.22, 1.2);
  const depth = THREE.MathUtils.clamp(size.z || 0.62, 0.18, 0.9);
  const height = THREE.MathUtils.clamp(size.y || 0.42, 0.16, 0.62);
  centerGemMesh.geometry.dispose();
  centerGemMesh.geometry = createClassicGemGeometry(shape, width, depth, height);
  centerGemMesh.name = `${shape} classic faceted gemstone`;
  centerGemMesh.castShadow = true;
  centerGemMesh.geometry.computeBoundingSphere();
  applyGemBicolorPattern();
}

function applyGemBicolorPattern() {
  if (!centerGemMesh?.geometry) return;
  const material = Array.isArray(centerGemMesh.material) ? centerGemMesh.material[0] : centerGemMesh.material;
  if (!material) return;

  if (!settings.effects.bicolor || settings.gemBicolorMode === "off") {
    centerGemMesh.geometry.deleteAttribute("color");
    material.vertexColors = false;
    material.color.set(settings.gemColor);
    material.needsUpdate = true;
    return;
  }

  const position = centerGemMesh.geometry.getAttribute("position");
  if (!position) return;
  const colors = [];
  const colorA = new THREE.Color(settings.gemZoneA);
  const colorB = new THREE.Color(settings.gemZoneB);
  const angle = THREE.MathUtils.degToRad(settings.gemBoundaryAngle);
  const dirX = Math.cos(angle);
  const dirZ = Math.sin(angle);
  const sideX = -Math.sin(angle);
  const sideZ = Math.cos(angle);
  const softness = settings.gemBicolorMode === "hard" ? 0.002 : settings.gemBoundarySoftness;

  for (let i = 0; i < position.count; i += 1) {
    const x = position.getX(i);
    const z = position.getZ(i);
    const along = x * sideX + z * sideZ;
    const boundary =
      settings.gemBoundaryShape === "curved" ?
         Math.sin(along * settings.gemBoundaryPeriod * Math.PI * 2) * settings.gemBoundaryAmplitude * 0.18
        : 0;
    const signed = x * dirX + z * dirZ - boundary;
    const t = settings.gemBicolorMode === "hard" ? (signed > 0 ? 1 : 0) : THREE.MathUtils.smoothstep(signed, -softness, softness);
    const color = colorA.clone().lerp(colorB, t);
    colors.push(color.r, color.g, color.b);
  }

  centerGemMesh.geometry.setAttribute("color", new THREE.Float32BufferAttribute(colors, 3));
  material.vertexColors = true;
  material.color.set("#ffffff");
  material.needsUpdate = true;
}

function createClassicGemGeometry(shape, width, depth, height) {
  if (shape === "round") return createRoundBrilliantGeometry(Math.max(width, depth) * 0.48, height, 48);
  return createGemFromOutline(getGemOutline(shape), width, depth, height);
}

function createGemFromOutline(outline, width, depth, height) {
  const positions = [];
  const indices = [];
  const rings = [
    { y: height * 0.48, scale: 0.48 },
    { y: height * 0.24, scale: 0.94 },
    { y: -height * 0.04, scale: 1 },
    { y: -height * 0.48, scale: 0.18 },
  ];

  rings.forEach((ring, ringIndex) => {
    outline.forEach(([x, z], i) => {
      const facet = 1 + Math.sin((i + 1) * 3.7 + ringIndex) * 0.018;
      positions.push(x * width * 0.5 * ring.scale * facet, ring.y, z * depth * 0.5 * ring.scale * facet);
    });
  });

  const count = outline.length;
  for (let r = 0; r < rings.length - 1; r += 1) {
    for (let i = 0; i < count; i += 1) {
      const a = r * count + i;
      const b = r * count + ((i + 1) % count);
      const c = (r + 1) * count + i;
      const d = (r + 1) * count + ((i + 1) % count);
      indices.push(a, c, b, b, c, d);
    }
  }

  const topCenter = positions.length / 3;
  positions.push(0, height * 0.54, 0);
  const bottomCenter = positions.length / 3;
  positions.push(0, -height * 0.56, 0);
  for (let i = 0; i < count; i += 1) {
    indices.push(topCenter, i, (i + 1) % count);
    const last = (rings.length - 1) * count;
    indices.push(bottomCenter, last + ((i + 1) % count), last + i);
  }

  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  geo.setIndex(indices);
  geo.computeVertexNormals();
  return geo;
}

function getGemOutline(shape) {
  const roundish = (segments, xScale = 1, zScale = 1) =>
    Array.from({ length: segments }, (_, i) => {
      const angle = (i / segments) * Math.PI * 2;
      return [Math.cos(angle) * xScale, Math.sin(angle) * zScale];
    });

  const roundedRect = (cornerSteps, radius, aspectX = 1, aspectZ = 0.78) => {
    const points = [];
    const corners = [
      [1 - radius, 1 - radius, 0],
      [-1 + radius, 1 - radius, Math.PI / 2],
      [-1 + radius, -1 + radius, Math.PI],
      [1 - radius, -1 + radius, Math.PI * 1.5],
    ];
    corners.forEach(([cx, cz, start]) => {
      for (let i = 0; i <= cornerSteps; i += 1) {
        const a = start + (i / cornerSteps) * (Math.PI / 2);
        points.push([(cx + Math.cos(a) * radius) * aspectX, (cz + Math.sin(a) * radius) * aspectZ]);
      }
    });
    return points;
  };

  const shapes = {
    princess: [
      [1, 1],
      [-1, 1],
      [-1, -1],
      [1, -1],
    ],
    rectangle: [
      [1, 0.62],
      [0.78, 0.82],
      [-0.78, 0.82],
      [-1, 0.62],
      [-1, -0.62],
      [-0.78, -0.82],
      [0.78, -0.82],
      [1, -0.62],
    ],
    baguette: [
      [1, 0.42],
      [0.82, 0.56],
      [-0.82, 0.56],
      [-1, 0.42],
      [-1, -0.42],
      [-0.82, -0.56],
      [0.82, -0.56],
      [1, -0.42],
    ],
    octagon: roundish(8, 1, 1),
    oval: roundish(36, 1, 0.72),
    cushion: roundedRect(5, 0.36, 1, 0.86),
    triangle: [
      [0, 1.12],
      [-1.05, -0.82],
      [1.05, -0.82],
    ],
    marquise: [
      [1.12, 0],
      [0.82, 0.28],
      [0.42, 0.44],
      [0, 0.5],
      [-0.42, 0.44],
      [-0.82, 0.28],
      [-1.12, 0],
      [-0.82, -0.28],
      [-0.42, -0.44],
      [0, -0.5],
      [0.42, -0.44],
      [0.82, -0.28],
    ],
    lozenge: [
      [0, 1.08],
      [-0.85, 0],
      [0, -1.08],
      [0.85, 0],
    ],
    heart: [
      [0, -1.05],
      [0.72, -0.38],
      [0.96, 0.28],
      [0.62, 0.78],
      [0.18, 0.68],
      [0, 0.46],
      [-0.18, 0.68],
      [-0.62, 0.78],
      [-0.96, 0.28],
      [-0.72, -0.38],
    ],
    pear: [
      [0, 1.16],
      [0.48, 0.62],
      [0.78, 0.04],
      [0.6, -0.56],
      [0, -0.92],
      [-0.6, -0.56],
      [-0.78, 0.04],
      [-0.48, 0.62],
    ],
  };

  return shapes[shape] || shapes.oval;
}

function createCausticTexture() {
  const c = document.createElement("canvas");
  c.width = 512;
  c.height = 512;
  const ctx = c.getContext("2d");
  const gradient = ctx.createRadialGradient(256, 256, 20, 256, 256, 230);
  gradient.addColorStop(0, "rgba(255,255,255,0.7)");
  gradient.addColorStop(0.35, "rgba(255,176,214,0.2)");
  gradient.addColorStop(1, "rgba(255,255,255,0)");
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, 512, 512);
  ctx.strokeStyle = "rgba(255,235,250,0.45)";
  ctx.lineWidth = 2;
  for (let i = 0; i < 34; i += 1) {
    ctx.beginPath();
    const y = 80 + Math.random() * 350;
    ctx.ellipse(256, y, 40 + Math.random() * 150, 4 + Math.random() * 9, Math.random() * Math.PI, 0, Math.PI * 2);
    ctx.stroke();
  }
  const texture = new THREE.CanvasTexture(c);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

function createReflectionTextures() {
  return {
    point: createLightTexture("point"),
    soft: createLightTexture("soft"),
    oval: createLightTexture("oval"),
    facet: createLightTexture("facet"),
    bar: createLightTexture("bar"),
    cross: createLightTexture("cross"),
  };
}

function createLightTexture(type) {
  const c = document.createElement("canvas");
  c.width = 192;
  c.height = 192;
  const ctx = c.getContext("2d");
  ctx.clearRect(0, 0, 192, 192);

  if (type === "point") {
    ctx.strokeStyle = "rgba(255,255,255,0.95)";
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(96, 58);
    ctx.lineTo(96, 134);
    ctx.moveTo(58, 96);
    ctx.lineTo(134, 96);
    ctx.stroke();
    ctx.fillStyle = "rgba(255,255,255,0.92)";
    ctx.beginPath();
    ctx.arc(96, 96, 3.4, 0, Math.PI * 2);
    ctx.fill();
  } else if (type === "facet" || type === "bar") {
    const gradient = ctx.createLinearGradient(22, 96, 170, 96);
    gradient.addColorStop(0, "rgba(255,255,255,0)");
    gradient.addColorStop(0.38, "rgba(255,255,255,0.6)");
    gradient.addColorStop(0.5, "rgba(255,255,255,1)");
    gradient.addColorStop(0.62, "rgba(255,255,255,0.6)");
    gradient.addColorStop(1, "rgba(255,255,255,0)");
    ctx.fillStyle = gradient;
    ctx.save();
    ctx.translate(96, 96);
    ctx.rotate(type === "facet" ? -0.35 : 0);
    ctx.fillRect(-74, -8, 148, 16);
    ctx.restore();
  } else {
    const rx = type === "oval" ? 84 : 62;
    const ry = type === "oval" ? 32 : 62;
    const gradient = ctx.createRadialGradient(96, 96, 0, 96, 96, Math.max(rx, ry));
    gradient.addColorStop(0, "rgba(255,255,255,0.95)");
    gradient.addColorStop(0.28, "rgba(255,255,255,0.48)");
    gradient.addColorStop(1, "rgba(255,255,255,0)");
    ctx.fillStyle = gradient;
    ctx.save();
    ctx.translate(96, 96);
    ctx.scale(rx / Math.max(rx, ry), ry / Math.max(rx, ry));
    ctx.beginPath();
    ctx.arc(0, 0, Math.max(rx, ry), 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  if (type === "cross") {
    ctx.strokeStyle = "rgba(255,255,255,0.86)";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(96, 14);
    ctx.lineTo(96, 178);
    ctx.moveTo(14, 96);
    ctx.lineTo(178, 96);
    ctx.stroke();
  }

  const texture = new THREE.CanvasTexture(c);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

function getReflectionTexture(shape) {
  return reflectionTextures[shape] || reflectionTextures.soft;
}

function getReflectionScale(reflection) {
  const radius = reflection.radius * (1 + settings.dispersion * 0.25);
  const shape = reflection.shape || "soft";
  if (shape === "point") return { x: Math.max(0.018, radius * 0.32), y: Math.max(0.018, radius * 0.32) };
  if (shape === "oval") return { x: radius * 1.85, y: radius * 0.72 };
  if (shape === "facet") return { x: radius * 2.35, y: radius * 0.42 };
  if (shape === "bar") return { x: radius * 2.8, y: radius * 0.34 };
  if (shape === "cross") return { x: radius * 1.15, y: radius * 1.15 };
  return { x: radius, y: radius };
}

function getReflectionOpacity(shape, flicker) {
  const base = shape === "point" ? 0.34 : shape === "bar" || shape === "facet" ? 0.18 : 0.16;
  return Math.min(0.96, settings.reflectionIntensity * base * flicker);
}

function setupControlsAccordion() {
  const controlGrid = document.querySelector(".control-grid");
  if (!controlGrid || document.querySelector(".controls-accordion")) return;
  const accordion = document.createElement("div");
  accordion.className = "controls-accordion";
  controlGrid.parentNode.insertBefore(accordion, controlGrid);

  const moved = new Set();
  const getBlock = (selector) => {
    const el = document.querySelector(selector);
    if (!el) return null;
    const grouped = el.closest(".material-editor, .material-visibility, .effect-status, .reflection-editor, .facet-texture, .rhino-remesh, .library-actions, .decal-position-control, .segmented, .toggles, .file-loader");
    if (grouped) return grouped;
    return el.closest(".material-editor, .material-visibility, .effect-status, .reflection-editor, .facet-texture, .rhino-remesh, .stone-showcase-controls, .library-actions, .segmented, .toggles, .file-loader, label");
  };
  const moveBlocks = (panel, selectors) => {
    selectors.forEach((selector) => {
      const block = getBlock(selector);
      if (!block || moved.has(block)) return;
      moved.add(block);
      panel.appendChild(block);
    });
  };
  const addSection = (title, summary, selectors, open = false) => {
    const details = document.createElement("details");
    details.className = "accordion-section";
    details.open = open;
    const head = document.createElement("summary");
    head.innerHTML = `<span>${title}</span><small>${summary}</small>`;
    const panel = document.createElement("div");
    panel.className = "accordion-panel";
    details.append(head, panel);
    accordion.appendChild(details);
    moveBlocks(panel, selectors);
    return panel;
  };

  addSection("Bibliothèque", "Pièces, stockage local, listes", ["#jewel-model", "#model-compare-control", "#menu-panel-width", "#library-add", "#decal-edit-mode", "#material-visibility-library"], true);
  addSection("Objet & mat\u00e9riaux", "Sélection, métaux, facettes", ["#object-select", "#metal-intensity", "#metal-preset", "#metal-roughness", "#facet-texture-enabled"], true);
  addSection("Pierre & reflets", "Gemmes, feux, effets", [
    "#effect-method",
    "#active-effects-count",
    "#gem-color",
    "#gem-bicolor-mode",
    "#gem-zone-a",
    "#gem-zone-b",
    "#gem-boundary-shape",
    "#gem-boundary-softness",
    "#gem-boundary-angle",
    "#gem-boundary-amplitude",
    "#gem-boundary-period",
    "#gem-preset",
    "#gem-material-model",
    "#gem-shape",
    "#stone-showcase-visible",
    "#stone-showcase-geometry",
    "#stone-showcase-material",
    "#stone-showcase-scale",
    "#stone-showcase-pedestal",
    "#reflection-color",
    "#reflection-intensity",
    "#gem-ior",
    "#diamond-shader-mode",
    "#diamond-bounces",
    "#diamond-beer-absorption",
    "#diamond-micro-roughness",
    "#diamond-hdri-reflection",
    "#diamond-path-samples",
    "#dispersion",
    "#fire-balance",
    "#gem-absorption",
    "#gem-cloudiness",
    "#facet-contrast",
    "#spectral-richness",
    "#chromatic-shift",
    "#sparkle-density",
    "#caustic-spread",
    "#reflection-select",
  ]);
  addSection("Studio & rendu", "Lumiere, fond, support", ["#lighting-preset", "#env-intensity", "#key-light", "#rim-light", "#fill-light", "#support-material", "[data-bg]", "#auto-rotate"]);
  const importPanel = addSection("Import & maillage Rhino", "Fichiers, aperçu, finesse", ["#model-file", "#rhino-remesh-state"]);

  Array.from(controlGrid.children).forEach((child) => {
    if (!moved.has(child)) importPanel.appendChild(child);
  });
  controlGrid.remove();
}

function isPortraitViewport() {
  return window.matchMedia?.("(orientation: portrait)")?.matches || window.innerHeight > window.innerWidth;
}

function setControlsPanelCollapsed(collapsed) {
  const panel = document.querySelector(".controls");
  const button = document.querySelector("#toggle-panel");
  if (!panel) return;
  panel.classList.toggle("is-collapsed", collapsed);
  if (button) {
    button.setAttribute("aria-expanded", String(!collapsed));
    button.setAttribute("aria-label", collapsed ? "Ouvrir le panneau" : "Réduire le panneau");
  }
}

function applyDefaultControlsPanelState() {
  setControlsPanelCollapsed(true);
}

function setArStatus(message = "") {
  const status = document.querySelector("#ar-status");
  if (!status) return;
  status.textContent = message;
  status.hidden = !message;
}

function syncArButton(active, busy = false) {
  const button = document.querySelector("#toggle-ar");
  if (!button) return;
  button.disabled = busy;
  button.setAttribute("aria-pressed", String(active));
  button.textContent = busy ? "Ouverture de la caméra..." : active ? "Quitter l’AR" : "Voir en AR";
}

function updateArVideoTextureTransform() {
  const video = document.querySelector("#ar-camera-feed");
  if (!arVideoTexture || !video?.videoWidth || !video.videoHeight) return;
  const videoAspect = video.videoWidth / video.videoHeight;
  const viewportAspect = Math.max(window.innerWidth, 1) / Math.max(window.innerHeight, 1);
  arVideoTexture.repeat.set(1, 1);
  arVideoTexture.offset.set(0, 0);
  if (videoAspect > viewportAspect) {
    arVideoTexture.repeat.x = viewportAspect / videoAspect;
    arVideoTexture.offset.x = (1 - arVideoTexture.repeat.x) * 0.5;
  } else {
    arVideoTexture.repeat.y = videoAspect / viewportAspect;
    arVideoTexture.offset.y = (1 - arVideoTexture.repeat.y) * 0.5;
  }
}

async function startCameraAR() {
  if (arCameraStream) return;
  if (!navigator.mediaDevices?.getUserMedia) {
    setArStatus("La caméra n’est pas disponible dans ce navigateur.");
    return;
  }

  const video = document.querySelector("#ar-camera-feed");
  if (!video) return;
  syncArButton(false, true);
  setArStatus("Autorisez l’accès à la caméra pour placer le plug sur l’image filmée.");

  try {
    const stream = await navigator.mediaDevices.getUserMedia({
      video: { facingMode: { ideal: "environment" } },
      audio: false,
    });
    arCameraStream = stream;
    video.srcObject = stream;
    video.hidden = false;
    await video.play();

    arVideoTexture = new THREE.VideoTexture(video);
    arVideoTexture.colorSpace = THREE.SRGBColorSpace;
    arVideoTexture.minFilter = THREE.LinearFilter;
    arVideoTexture.magFilter = THREE.LinearFilter;
    arVideoTexture.generateMipmaps = false;
    updateArVideoTextureTransform();

    arSceneState = {
      background: scene.background,
      floorVisible: floor.visible,
      floorReceiveShadow: floor.receiveShadow,
      softShadowVisible: softStudioShadow.visible,
    };
    scene.background = arVideoTexture;
    floor.visible = false;
    floor.receiveShadow = false;
    softStudioShadow.visible = false;
    document.body.classList.add("is-ar-mode");
    syncArButton(true);
    setArStatus("Caméra active. Faites pivoter et zoomez le plug directement sur l’image.");
    stream.getVideoTracks().forEach((track) => track.addEventListener("ended", () => stopCameraAR(false), { once: true }));
  } catch (error) {
    arCameraStream?.getTracks().forEach((track) => track.stop());
    arCameraStream = null;
    arVideoTexture?.dispose();
    arVideoTexture = null;
    video.srcObject = null;
    video.hidden = true;
    syncArButton(false);
    const message = error?.name === "NotAllowedError"
      ? "Accès à la caméra refusé. Autorisez la caméra dans les réglages du navigateur puis réessayez."
      : error?.name === "NotFoundError"
        ? "Aucune caméra compatible n’a été trouvée."
        : "Impossible d’ouvrir la caméra pour le mode AR.";
    setArStatus(message);
    logDebug("ar", "Ouverture de la caméra impossible", { name: error?.name, message: error?.message });
  }
}

function stopCameraAR(announce = true) {
  const video = document.querySelector("#ar-camera-feed");
  arCameraStream?.getTracks().forEach((track) => track.stop());
  arCameraStream = null;
  if (video) {
    video.pause();
    video.srcObject = null;
    video.hidden = true;
  }
  if (arSceneState) {
    scene.background = arSceneState.background;
    floor.visible = arSceneState.floorVisible;
    floor.receiveShadow = arSceneState.floorReceiveShadow;
    softStudioShadow.visible = arSceneState.softShadowVisible;
    arSceneState = null;
  }
  arVideoTexture?.dispose();
  arVideoTexture = null;
  document.body.classList.remove("is-ar-mode");
  syncArButton(false);
  setArStatus(announce ? "Mode AR fermé et caméra libérée." : "");
}

function toggleCameraAR() {
  if (arCameraStream) stopCameraAR();
  else startCameraAR();
}

function showAuxiliaryProgress(percent, stage) {
  window.clearTimeout(loadingHideTimer);
  if (percent <= 5 || loaderEl?.classList.contains("is-hidden")) loadingProgress = 0;
  setLoadingProgress(percent, stage, true);
  loaderEl?.classList.remove("is-hidden");
}

function finishAuxiliaryProgress(stage) {
  setLoadingProgress(100, stage, true);
  window.clearTimeout(loadingHideTimer);
  loadingHideTimer = window.setTimeout(() => loaderEl?.classList.add("is-hidden"), 900);
}

function getSceneUnitsPerMillimeter() {
  let scale = null;
  root.traverse((child) => {
    if (scale == null && Number.isFinite(child.userData?.sceneUnitsPerMillimeter)) scale = child.userData.sceneUnitsPerMillimeter;
  });
  if (scale != null) return scale;
  const box = getVisibleMeshBox(root);
  const diameter = getCatalogModelMeta(settings.modelId, modelDefaults[settings.modelId]?.title || "").diameterMm || 50;
  return isBoxEmpty(box) ? 0.03 : Math.max(box.getSize(new THREE.Vector3()).length() / Math.max(diameter * 2.4, 1), 0.002);
}

function clearScaleReference() {
  scaleReferenceGroup.traverse((child) => {
    child.geometry?.dispose?.();
    if (Array.isArray(child.material)) child.material.forEach((material) => material?.dispose?.());
    else child.material?.dispose?.();
  });
  scaleReferenceGroup.clear();
}

function makeScaleReferenceMaterial(options = {}) {
  return new THREE.MeshPhysicalMaterial({
    color: options.color || "#b8bdc2",
    metalness: options.metalness ?? 0.05,
    roughness: options.roughness ?? 0.32,
    transmission: options.transmission ?? 0,
    thickness: options.thickness ?? 0,
    transparent: (options.transmission || 0) > 0,
    opacity: options.opacity ?? 1,
    envMapIntensity: 1.2,
  });
}

function makeCoinReference(unit) {
  const group = new THREE.Group();
  const coin = new THREE.Mesh(new THREE.CylinderGeometry(11.625 * unit, 11.625 * unit, 2.33 * unit, 96), makeScaleReferenceMaterial({ color: "#d7b45a", metalness: 0.92, roughness: 0.22 }));
  coin.rotation.x = Math.PI / 2;
  coin.position.y = floor.position.y + 11.625 * unit;
  group.add(coin);
  return group;
}

function makeBottleReference(unit, large = false) {
  const height = (large ? 320 : 180) * unit;
  const radius = (large ? 45 : 30) * unit;
  const group = new THREE.Group();
  const plastic = makeScaleReferenceMaterial({ color: "#d8f2f5", roughness: 0.18, transmission: 0.72, thickness: 1.2, opacity: 0.72 });
  const body = new THREE.Mesh(new THREE.CylinderGeometry(radius * 0.88, radius, height * 0.78, 64, 3), plastic);
  body.position.y = floor.position.y + height * 0.39;
  const shoulder = new THREE.Mesh(new THREE.SphereGeometry(radius * 0.9, 64, 32, 0, Math.PI * 2, 0, Math.PI * 0.5), plastic.clone());
  shoulder.scale.y = 0.52;
  shoulder.position.y = floor.position.y + height * 0.78;
  const neck = new THREE.Mesh(new THREE.CylinderGeometry(radius * 0.28, radius * 0.38, height * 0.14, 48), plastic.clone());
  neck.position.y = floor.position.y + height * 0.9;
  const cap = new THREE.Mesh(new THREE.CylinderGeometry(radius * 0.3, radius * 0.3, height * 0.06, 48), makeScaleReferenceMaterial({ color: "#ed2b86", metalness: 0, roughness: 0.48 }));
  cap.position.y = floor.position.y + height * 0.99;
  group.add(body, shoulder, neck, cap);
  return group;
}

function makeRulerTexture() {
  const surface = document.createElement("canvas");
  surface.width = 1600;
  surface.height = 220;
  const context = surface.getContext("2d");
  context.fillStyle = "#f7e7a9";
  context.fillRect(0, 0, surface.width, surface.height);
  context.fillStyle = "#171717";
  context.font = "42px Arial";
  context.textAlign = "center";
  for (let millimeter = 0; millimeter <= 200; millimeter += 1) {
    const x = 18 + (surface.width - 36) * (millimeter / 200);
    const length = millimeter % 10 === 0 ? 86 : millimeter % 5 === 0 ? 58 : 34;
    context.fillRect(x, 0, 2, length);
    if (millimeter % 10 === 0 && millimeter < 200) context.fillText(String(millimeter / 10), x + 12, 145);
  }
  const texture = new THREE.CanvasTexture(surface);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = renderer.capabilities.getMaxAnisotropy();
  return texture;
}

function makeRulerReference(unit) {
  const group = new THREE.Group();
  const ruler = new THREE.Mesh(
    new THREE.BoxGeometry(200 * unit, 2.4 * unit, 28 * unit),
    makeScaleReferenceMaterial({ color: "#fff2ba", roughness: 0.5 }),
  );
  ruler.position.y = floor.position.y + 1.2 * unit;
  const markings = new THREE.Mesh(
    new THREE.PlaneGeometry(200 * unit, 28 * unit),
    new THREE.MeshBasicMaterial({ map: makeRulerTexture(), toneMapped: false, side: THREE.DoubleSide }),
  );
  markings.rotation.x = -Math.PI / 2;
  markings.position.y = floor.position.y + 2.43 * unit;
  group.add(ruler, markings);
  return group;
}

function frameModelAndScaleReference() {
  const box = getVisibleMeshBox(root);
  if (scaleReferenceGroup.visible) box.union(new THREE.Box3().setFromObject(scaleReferenceGroup));
  if (isBoxEmpty(box)) return;
  const size = box.getSize(new THREE.Vector3());
  const center = box.getCenter(new THREE.Vector3());
  const radius = Math.max(size.x, size.y, size.z, 0.8);
  controls.target.copy(center);
  camera.position.set(center.x + radius * 1.5, center.y + radius * 0.75, center.z + radius * 1.85);
  camera.near = Math.max(0.001, radius / 2400);
  camera.far = Math.max(1000, radius * 12);
  camera.updateProjectionMatrix();
  controls.update();
}

function refreshScaleReference() {
  clearScaleReference();
  const enabled = document.querySelector("#scale-reference-enabled")?.checked === true;
  const select = document.querySelector("#scale-reference-type");
  scaleReferenceGroup.visible = enabled;
  if (select) select.disabled = !enabled;
  if (!enabled) {
    frameImportedModel(root);
    return;
  }
  const unit = getSceneUnitsPerMillimeter();
  const type = select?.value || "coin";
  const object = type === "coin" ? makeCoinReference(unit)
    : type === "bottle-small" ? makeBottleReference(unit, false)
      : type === "bottle-large" ? makeBottleReference(unit, true)
        : makeRulerReference(unit);
  const modelBox = getVisibleMeshBox(root);
  const objectBox = new THREE.Box3().setFromObject(object);
  const margin = Math.max(unit * 12, 0.08);
  object.position.x += modelBox.max.x - objectBox.min.x + margin;
  scaleReferenceGroup.add(object);
  scaleReferenceGroup.updateWorldMatrix(true, true);
  frameModelAndScaleReference();
}

function renderCanvasToPngBlob() {
  composer.render();
  return new Promise((resolve, reject) => {
    renderer.domElement.toBlob((blob) => blob ? resolve(blob) : reject(new Error("Capture PNG vide")), "image/png", 1);
  });
}

function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

async function downloadCurrentView() {
  try {
    showAuxiliaryProgress(12, "Capture de la vue 3D");
    const blob = await renderCanvasToPngBlob();
    downloadBlob(blob, `rosebuds-${settings.modelId || "plug"}.png`);
    finishAuxiliaryProgress("Image PNG téléchargée");
  } catch (error) {
    finishAuxiliaryProgress("Capture impossible");
    showNotice("Impossible de capturer la vue 3D dans ce navigateur.");
  }
}

async function shareCurrentView() {
  try {
    showAuxiliaryProgress(12, "Préparation de l’image à partager");
    const blob = await renderCanvasToPngBlob();
    const file = new File([blob], `rosebuds-${settings.modelId || "plug"}.png`, { type: "image/png" });
    if (navigator.canShare?.({ files: [file] })) {
      await navigator.share({ title: "Mon plug Rosebuds", text: document.querySelector("#viewer-product-summary")?.textContent || "Configuration Rosebuds", files: [file] });
    } else if (navigator.share) {
      await navigator.share({ title: "Mon plug Rosebuds", text: document.querySelector("#viewer-product-summary")?.textContent || "Configuration Rosebuds", url: window.location.href });
    } else {
      downloadBlob(blob, file.name);
      showNotice("Le partage natif n’est pas disponible : l’image PNG a été téléchargée.");
    }
    finishAuxiliaryProgress("Image prête à être partagée");
  } catch (error) {
    if (error?.name !== "AbortError") showNotice("Le partage de l’image n’a pas pu être lancé.");
    finishAuxiliaryProgress(error?.name === "AbortError" ? "Partage annulé" : "Partage indisponible");
  }
}

function smoothMetalMeshesForOptimizedRender() {
  root.traverse((child) => {
    if (!child.isMesh || child.userData?.classicPlugRole === "gem") return;
    const materials = Array.isArray(child.material) ? child.material : [child.material];
    const isMetal = child.userData?.classicPlugRole === "metal"
      || materials.some((material) => material?.userData?.jewelryMaterial?.type === "metal" || material?.metalness > 0.65);
    if (!isMetal) return;
    child.geometry?.computeVertexNormals?.();
    materials.filter(Boolean).forEach((material) => {
      material.flatShading = false;
      material.needsUpdate = true;
    });
  });
}

function optimizedPixelsToBlob(message) {
  const surface = document.createElement("canvas");
  surface.width = message.width;
  surface.height = message.height;
  const context = surface.getContext("2d");
  context.putImageData(new ImageData(message.pixels, message.width, message.height), 0, 0);
  return new Promise((resolve, reject) => surface.toBlob((blob) => blob ? resolve(blob) : reject(new Error("Conversion PNG impossible")), "image/png", 1));
}

function showOptimizedRender(blob, caption) {
  optimizedRenderBlob = blob;
  const image = document.querySelector("#optimized-render-image");
  const dialog = document.querySelector("#optimized-render-dialog");
  const captionEl = document.querySelector("#optimized-render-caption");
  if (image) {
    if (image.dataset.objectUrl) URL.revokeObjectURL(image.dataset.objectUrl);
    image.dataset.objectUrl = URL.createObjectURL(blob);
    image.src = image.dataset.objectUrl;
  }
  if (captionEl) captionEl.textContent = caption;
  if (dialog?.showModal && !dialog.open) dialog.showModal();
}

async function createOptimizedRender() {
  const button = document.querySelector("#optimized-render");
  if (button) button.disabled = true;
  try {
    showAuxiliaryProgress(4, "Lissage adaptatif des surfaces métalliques");
    smoothMetalMeshesForOptimizedRender();
    await waitForProgressPaint();
    const currentPixelRatio = renderer.getPixelRatio();
    const capturePixelRatio = Math.min(Math.max(currentPixelRatio, window.devicePixelRatio * 1.25), 2.5);
    renderer.setPixelRatio(capturePixelRatio);
    composer.setPixelRatio(capturePixelRatio);
    renderer.setSize(window.innerWidth, window.innerHeight, false);
    composer.setSize(window.innerWidth, window.innerHeight);
    showAuxiliaryProgress(18, "Calcul de l’éclairage PBR haute définition");
    await waitForProgressPaint();
    const sourceBlob = await renderCanvasToPngBlob();
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    composer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.setSize(window.innerWidth, window.innerHeight, false);
    composer.setSize(window.innerWidth, window.innerHeight);
    showAuxiliaryProgress(28, "Préparation de la super-résolution IA locale");

    const id = ++optimizedRenderJobId;
    optimizedRenderWorker ||= new Worker(new URL("./assets/js/render-enhance-worker.js", import.meta.url), { type: "module" });
    const enhanced = await new Promise((resolve, reject) => {
      const onMessage = async (event) => {
        const message = event.data || {};
        if (message.id !== id) return;
        if (message.type === "progress") {
          showAuxiliaryProgress(Math.max(28, message.progress || 0), message.label || "Optimisation IA locale");
          return;
        }
        optimizedRenderWorker.removeEventListener("message", onMessage);
        optimizedRenderWorker.removeEventListener("error", onError);
        if (message.type === "error") reject(new Error(message.message));
        else resolve(await optimizedPixelsToBlob(message));
      };
      const onError = (event) => {
        optimizedRenderWorker.removeEventListener("message", onMessage);
        optimizedRenderWorker.removeEventListener("error", onError);
        reject(event.error || new Error(event.message || "IA d’image interrompue"));
      };
      optimizedRenderWorker.addEventListener("message", onMessage);
      optimizedRenderWorker.addEventListener("error", onError);
      optimizedRenderWorker.postMessage({ type: "enhance", id, blob: sourceBlob });
    }).catch((error) => {
      logDebug("optimized-render", "Super-résolution indisponible, rendu WebGL haute définition conservé.", { message: error?.message || String(error) });
      return sourceBlob;
    });
    const aiApplied = enhanced !== sourceBlob;
    showOptimizedRender(enhanced, aiApplied ? "Lissage PBR et super-résolution Swin2SR locale" : "Rendu PBR haute définition (repli sans IA)");
    finishAuxiliaryProgress(aiApplied ? "Rendu optimisé par IA prêt" : "Rendu haute définition prêt");
  } catch (error) {
    logDebug("optimized-render", "Création du rendu optimisé impossible.", { message: error?.message || String(error) });
    finishAuxiliaryProgress("Rendu optimisé indisponible");
    showNotice("Le rendu optimisé n’a pas pu être créé.");
  } finally {
    if (button) button.disabled = false;
  }
}

function wireInterface() {
  logDebug("info", "Application initialis?e", {
    userAgent: navigator.userAgent,
    webgl2: Boolean(renderer.capabilities.isWebGL2),
    pixelRatio: renderer.getPixelRatio(),
  });
  populateGemPresets();
  populateStoneShowcaseControls();
  ensureMaterialSelectSwatches();
  restoreMenuPanelWidth();
  setupControlsAccordion();
  applyDefaultControlsPanelState();
  document.querySelector("#menu-panel-width")?.addEventListener("input", (event) => applyMenuPanelWidth(event.target.value));
  document.querySelector("#material-visibility-table")?.addEventListener("change", (event) => {
    if (event.target.matches("input[type='checkbox'][data-material-id]")) {
      applyMaterialVisibilityChange(event.target);
    }
  });
  document.querySelector("#material-visibility-reset")?.addEventListener("click", resetMaterialVisibilityLibrary);
  document.querySelector("#material-visibility-toggle")?.addEventListener("click", toggleMaterialVisibilityLibrary);
  renderer.domElement.addEventListener("pointerdown", () => noteViewerInteraction(true), { capture: true });
  renderer.domElement.addEventListener("pointermove", (event) => {
    if (event.buttons) noteViewerInteraction(true);
  }, { capture: true });
  renderer.domElement.addEventListener("pointerup", () => noteViewerInteraction(false), { capture: true });
  renderer.domElement.addEventListener("pointercancel", () => noteViewerInteraction(false), { capture: true });
  renderer.domElement.addEventListener("wheel", () => noteViewerInteraction(false), { capture: true, passive: true });
  renderer.domElement.addEventListener("pointerdown", handleCanvasPointerDown);
  renderer.domElement.addEventListener("pointerup", handleCanvasPointerUp);
  renderer.domElement.addEventListener("contextmenu", handleCanvasContextMenu);
  renderer.domElement.addEventListener("dblclick", handleCanvasDoubleClick);
  renderer.domElement.addEventListener("pointercancel", () => {
    canvasPointerStart = null;
    stemDecalGesture?.cancel();
  });
  stemDecalGesture = attachDecalGesture(renderer.domElement, {
    hitTest: getStemDecalAtPointer,
    select: selectStemDecal,
    begin: startStemDecalDrag,
    move: handleStemDecalPointerMove,
    finish: finishStemDecalDrag,
    immediate: () => document.querySelector("#decal-edit-mode")?.checked === true,
    lock: () => {
      canvasPointerStart = null;
      const saved = { enabled: controls.enabled, autoRotate: controls.autoRotate };
      controls.enabled = false;
      controls.autoRotate = false;
      return saved;
    },
    unlock: (saved) => {
      controls.enabled = saved.enabled;
      controls.autoRotate = saved.autoRotate;
      canvasPointerStart = null;
    },
  });
  window.addEventListener("blur", () => stemDecalGesture.cancel());
  window.addEventListener("pagehide", () => stemDecalGesture.cancel());
  window.addEventListener("keydown", (event) => { if (event.key === "Escape") stemDecalGesture.cancel(); });
  document.querySelector("#decal-edit-mode")?.addEventListener("change", syncStemDecalEditMode);
  document.querySelector("#decal-reset-position")?.addEventListener("click", resetCurrentStemDecalPosition);
  document.querySelector("#toggle-ar")?.addEventListener("click", toggleCameraAR);
  document.querySelector("#scale-reference-enabled")?.addEventListener("change", refreshScaleReference);
  document.querySelector("#scale-reference-type")?.addEventListener("change", refreshScaleReference);
  document.querySelector("#download-view-png")?.addEventListener("click", downloadCurrentView);
  document.querySelector("#share-view")?.addEventListener("click", shareCurrentView);
  document.querySelector("#optimized-render")?.addEventListener("click", createOptimizedRender);
  document.querySelector("#optimized-render-close")?.addEventListener("click", () => document.querySelector("#optimized-render-dialog")?.close());
  document.querySelector("#optimized-render-download")?.addEventListener("click", () => {
    if (optimizedRenderBlob) downloadBlob(optimizedRenderBlob, `rosebuds-${settings.modelId || "plug"}-optimise.png`);
  });
  document.querySelector("#material-context-close")?.addEventListener("click", closeMaterialContextMenu);
  document.querySelector("#material-context-switch")?.addEventListener("click", () => {
    if (contextMaterialType === "support" || contextMaterialType === "environment") return;
    contextMaterialType = contextMaterialType === "metal" ? "gem" : "metal";
    renderMaterialContextOptions();
  });
  document.querySelector("#material-context-options")?.addEventListener("click", handleMaterialContextChoice);
  document.addEventListener("pointerdown", (event) => {
    const menu = document.querySelector("#material-context-menu");
    if (!menu?.hidden && !menu.contains(event.target) && event.target !== renderer.domElement) closeMaterialContextMenu();
  });
  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape") closeMaterialContextMenu();
  });
  window.addEventListener("resize", closeMaterialContextMenu);
  transformControls.addEventListener("dragging-changed", (event) => {
    controls.enabled = !event.value;
    controls.autoRotate = event.value ? false : settings.autoRotate;
    if (!event.value) {
      commitManipulatorPosition();
    }
  });
  transformControls.addEventListener("objectChange", commitManipulatorPosition);
  populateCompareModelControls();
  populateCatalogFilters();
  renderCatalogGallery();
  ["#catalog-filter-size", "#catalog-filter-metal", "#catalog-filter-metal-finish", "#catalog-filter-ornament", "#catalog-filter-ornament-finish"].forEach((selector) => {
    document.querySelector(selector)?.addEventListener("change", renderCatalogGallery);
  });
  document.querySelector("#catalog-filter-gallery")?.addEventListener("click", handleCatalogGalleryClick);
  document.querySelector("#compare-models-enabled")?.addEventListener("change", (event) => {
    setCompareModelsEnabled(event.target.checked);
  });
  document.querySelector("#compare-model-spacing")?.addEventListener("input", (event) => {
    updateCompareModelSpacing(event.target.value);
  });
  document.querySelector("#compare-model-list")?.addEventListener("change", (event) => {
    if (!event.target.matches("input[type='checkbox']")) return;
    updateCompareModelSelectionFromList();
    if (settings.compareModelsEnabled) loadModelComparisonFromSelection();
  });
  document.querySelector("#jewel-model").addEventListener("change", (event) => {
    settings.modelId = event.target.value;
    if (settings.compareModelsEnabled) {
      if (!settings.compareModelIds.includes(settings.modelId)) settings.compareModelIds = [settings.modelId, ...settings.compareModelIds].slice(0, 6);
      populateCompareModelControls();
      loadModelComparisonFromSelection();
      return;
    }
    Promise.resolve(loadJewelryExample(event.target.value)).then(() => {
      if (settings.activeCatalogGemPreset) {
        applyCatalogGemPreset("gem", settings.activeCatalogGemPreset, { reason: "changement piece bibliotheque" });
      }
      if (scaleReferenceGroup.visible) refreshScaleReference();
      showNotice("Pièce de la bibliothèque chargée.");
    });
  });
  document.querySelector("#library-add").addEventListener("click", () => {
    document.querySelector("#model-file").click();
  });
  document.querySelector("#library-remove").addEventListener("click", removeSelectedLibraryModel);
  document.querySelector("#repair-import").addEventListener("click", repairCurrentImport);
  document.querySelector("#open-log").addEventListener("click", () => {
    syncDebugLogPanel();
    document.querySelector("#debug-log-panel").hidden = false;
  });
  document.querySelector("#close-log").addEventListener("click", () => {
    document.querySelector("#debug-log-panel").hidden = true;
  });
  document.querySelector("#clear-log").addEventListener("click", () => {
    debugLog.length = 0;
    logDebug("info", "Journal vide");
  });
  document.querySelector("#copy-log").addEventListener("click", async () => {
    syncDebugLogPanel();
    const text = document.querySelector("#debug-log-output").value;
    try {
      await navigator.clipboard.writeText(text);
      showNotice("Journal copi dans le presse-papiers.");
    } catch {
      document.querySelector("#debug-log-output").select();
      showNotice("Copie automatique refus?e, utilisez Ctrl+C.");
    }
  });
  document.querySelector("#gem-shape").addEventListener("change", (event) => {
    settings.gemShape = event.target.value;
    applyGemShape(settings.gemShape);
    applyGemBicolorPattern();
    buildGemOpticalEffect();
  });
  document.querySelector("#gem-bicolor-mode").addEventListener("change", (event) => {
    settings.gemBicolorMode = event.target.value;
    syncBicolorControls();
    applyGemBicolorPattern();
  });
  bindColor("#gem-zone-a", (value) => {
    settings.gemZoneA = value;
    applyGemBicolorPattern();
  });
  bindColor("#gem-zone-b", (value) => {
    settings.gemZoneB = value;
    applyGemBicolorPattern();
  });
  document.querySelector("#gem-boundary-shape").addEventListener("change", (event) => {
    settings.gemBoundaryShape = event.target.value;
    applyGemBicolorPattern();
  });
  bindRange("#gem-boundary-softness", "gemBoundarySoftness", applyGemBicolorPattern);
  bindRange("#gem-boundary-angle", "gemBoundaryAngle", applyGemBicolorPattern);
  bindRange("#gem-boundary-amplitude", "gemBoundaryAmplitude", applyGemBicolorPattern);
  bindRange("#gem-boundary-period", "gemBoundaryPeriod", applyGemBicolorPattern);
  document.querySelector("#gem-preset").addEventListener("change", (event) => {
    applyGemPreset(event.target.value);
  });
  document.querySelector("#gem-material-model").addEventListener("change", (event) => {
    settings.gemMaterialModel = event.target.value;
    applyMaterialModelDefaults(event.target.value);
    buildGemOpticalEffect();
  });
  document.querySelector("#metal-preset").addEventListener("change", (event) => {
    applyMetalPreset(event.target.value);
  });
  document.querySelector("#object-metal-material").addEventListener("change", (event) => {
    if (!event.target.value) return;
    applyMaterialToSelectedObject("metal", event.target.value);
    event.target.value = "";
  });
  document.querySelector("#object-gem-material").addEventListener("change", (event) => {
    if (!event.target.value) return;
    applyMaterialToSelectedObject("gem", event.target.value);
    event.target.value = "";
  });
  document.querySelector("#object-select").addEventListener("change", (event) => {
    selectSceneObject(editableObjects.find((object) => object.uuid === event.target.value) || null);
  });
  document.querySelector("#stone-showcase-visible")?.addEventListener("change", (event) => {
    setStoneShowcaseVisible(event.target.checked);
  });
  document.querySelector("#stone-showcase-pedestal")?.addEventListener("change", (event) => {
    setStoneShowcasePedestal(event.target.checked);
  });
  document.querySelector("#stone-showcase-geometry")?.addEventListener("change", (event) => {
    void applyStoneShowcaseGeometry(event.target.value);
  });
  document.querySelector("#stone-showcase-material")?.addEventListener("change", (event) => {
    applyStoneShowcaseMaterial(event.target.value);
  });
  document.querySelector("#stone-showcase-scale")?.addEventListener("input", (event) => {
    setStoneShowcaseScale(event.target.value);
  });
  document.querySelector("#save-project-material").addEventListener("click", () => saveSelectedMaterial("project"));
  document.querySelector("#save-general-material").addEventListener("click", () => saveSelectedMaterial("general"));
  document.querySelector("#apply-saved-material").addEventListener("click", applySavedMaterialToSelectedObject);
  document.querySelector("#delete-saved-material").addEventListener("click", deleteSavedMaterial);
  document.querySelector("#effect-method").addEventListener("change", (event) => {
    settings.effectMethod = event.target.value;
    buildGemOpticalEffect();
    syncEffectControls();
  });
  bindColor("#gem-color", (value) => {
    settings.gemColor = value;
    centerGemMaterial.color.set(value);
    centerGemMaterial.attenuationColor.set(value);
    updateGemOpticalEffect();
  });
  bindColor("#reflection-color", (value) => {
    settings.reflectionColor = value;
    reflectionRig.children.forEach((child) => {
      if (child.isSprite && child.material.color.getHexString() !== "ffffff") {
        child.material.color.set(value);
      }
    });
    causticMaterial.color.set(value);
  });
  bindRange("#reflection-intensity", "reflectionIntensity", updateGemOpticalEffect);
  bindRange("#gem-ior", "gemIor", updateGemOpticalEffect);
  bindRange("#dispersion", "dispersion", updateGemOpticalEffect);
  bindRange("#fire-balance", "fireBalance", updateGemOpticalEffect);
  bindRange("#gem-absorption", "gemAbsorption", updateGemOpticalEffect);
  bindRange("#gem-cloudiness", "gemCloudiness", () => {
    buildGemOpticalEffect();
  });
  bindRange("#facet-contrast", "facetContrast", updateGemOpticalEffect);
  bindRange("#spectral-richness", "spectralRichness", () => {
    buildGemOpticalEffect();
  });
  bindRange("#chromatic-shift", "chromaticShift", updateGemOpticalEffect);
  bindRange("#sparkle-density", "sparkleDensity", updateGemOpticalEffect);
  bindRange("#caustic-spread", "causticSpread", updateGemOpticalEffect);
  document.querySelector("#diamond-shader-mode")?.addEventListener("change", (event) => {
    settings.diamondShaderMode = event.target.value;
    syncDiamondShaderModeControl();
    updateDiamondEnvironmentReflections();
    updateGemOpticalEffect();
    const labels = {
      "mesh-bvh": "Moteur three-mesh-bvh Diamond Shader actif.",
      "studio-bvh": "Moteur BVH studio joaillerie actif.",
      "path-tracing": "Aperçu THREE.js PathTracing Renderer actif.",
    };
    showNotice(labels[settings.diamondShaderMode] || labels["mesh-bvh"]);
  });
  document.querySelector("#diamond-bounces")?.addEventListener("input", (event) => {
    settings.diamondInternalBounces = Number(event.target.value);
    syncDiamondBounceControl();
    updateGemOpticalEffect();
    requestDiamondRayTraceRebake("rebonds internes");
  });
  document.querySelector("#diamond-beer-absorption")?.addEventListener("input", (event) => {
    settings.diamondBeerAbsorption = Number(event.target.value);
    syncDiamondBeerAbsorptionControl();
    updateGemOpticalEffect();
    requestDiamondRayTraceRebake("absorption Beer-Lambert");
  });
  document.querySelector("#diamond-micro-roughness")?.addEventListener("input", (event) => {
    settings.diamondMicroRoughness = Number(event.target.value);
    syncDiamondMicroRoughnessControl();
    updateDiamondPolishMaterials();
    updateGemOpticalEffect();
    requestDiamondRayTraceRebake("micro-rugosite diamant");
  });
  document.querySelector("#diamond-hdri-reflection")?.addEventListener("input", (event) => {
    settings.diamondHdriReflectionStrength = Number(event.target.value);
    syncDiamondHdriReflectionControl();
    updateDiamondEnvironmentReflections();
    updateGemOpticalEffect();
    requestDiamondRayTraceRebake("reflexions HDRI diamant");
  });
  document.querySelector("#diamond-path-samples")?.addEventListener("input", (event) => {
    settings.diamondPathSamples = Number(event.target.value);
    syncDiamondPathSamplesControl();
    updateGemOpticalEffect();
  });
  bindRange("#env-intensity", "envIntensity", () => {
    scene.environmentIntensity = settings.envIntensity;
    updateDiamondEnvironmentReflections();
    requestDiamondRayTraceRebake("intensite HDRI");
  });
  document.querySelector("#lighting-preset").addEventListener("change", (event) => applyLightingPreset(event.target.value));
  bindRange("#metal-intensity", "metalIntensity", updateMetalMaterials);
  bindRange("#metal-roughness", "metalRoughness", updateMetalMaterials);
  wireFacetTextureControls();
  bindRange("#key-light", "keyLight", () => (keyLight.intensity = settings.keyLight));
  bindRange("#rim-light", "rimLight", () => (rimLight.intensity = settings.rimLight));
  bindRange("#fill-light", "fillLight", () => (fillLight.intensity = settings.fillLight));
  document.querySelector("#support-material").addEventListener("change", (event) => {
    applySupportMaterial(event.target.value);
  });
  bindEffectToggle("#fx-dispersion", "dispersion", () => buildGemOpticalEffect());
  bindEffectToggle("#fx-parametric", "parametric", () => buildGemOpticalEffect());
  bindEffectToggle("#fx-custom-reflections", "customReflections", () => buildGemOpticalEffect());
  bindEffectToggle("#fx-caustics", "caustics", () => {
    settings.caustics = settings.effects.caustics;
    document.querySelector("#caustics").checked = settings.effects.caustics;
    updateGemOpticalEffect();
  });
  bindEffectToggle("#fx-bicolor", "bicolor", () => applyGemBicolorPattern());
  bindEffectToggle("#fx-bloom", "bloom", () => {
    bloomPass.enabled = settings.effects.bloom;
  });
  bindEffectToggle("#fx-dof-toggle", "dof", () => {
    settings.dof = settings.effects.dof;
    document.querySelector("#dof").checked = settings.effects.dof;
    bokehPass.enabled = settings.effects.dof;
  });
  bindEffectToggle("#fx-auto-rotate", "autoRotate", () => {
    settings.autoRotate = settings.effects.autoRotate;
    document.querySelector("#auto-rotate").checked = settings.effects.autoRotate;
    controls.autoRotate = settings.effects.autoRotate;
  });

  document.querySelector("#auto-rotate").addEventListener("change", (event) => {
    settings.autoRotate = event.target.checked;
    settings.effects.autoRotate = event.target.checked;
    document.querySelector("#fx-auto-rotate").checked = event.target.checked;
    controls.autoRotate = settings.autoRotate;
    syncEffectStatus();
  });
  document.querySelector("#caustics").addEventListener("change", (event) => {
    settings.caustics = event.target.checked;
    settings.effects.caustics = event.target.checked;
    document.querySelector("#fx-caustics").checked = event.target.checked;
    causticPlane.visible = settings.caustics && settings.effects.caustics;
    updateGemOpticalEffect();
    syncEffectStatus();
  });
  document.querySelector("#dof").addEventListener("change", (event) => {
    settings.dof = event.target.checked;
    settings.effects.dof = event.target.checked;
    document.querySelector("#fx-dof-toggle").checked = event.target.checked;
    bokehPass.enabled = settings.dof;
    syncEffectStatus();
  });
  document.querySelector("#toggle-panel").addEventListener("click", () => {
    const panel = document.querySelector(".controls");
    setControlsPanelCollapsed(!panel.classList.contains("is-collapsed"));
  });
  document.querySelectorAll("[data-bg]").forEach((button) => {
    button.addEventListener("click", () => applyBackground(button.dataset.bg));
  });
  document.querySelector("#model-file").addEventListener("change", handleModelFile);
  wireMeshImportDialog();
  wireRhinoRemeshControls();
  document.querySelector("#reflection-select").addEventListener("change", (event) => {
    settings.selectedReflection = Number(event.target.value);
    syncReflectionEditor();
    attachReflectionManipulatorByIndex(settings.selectedReflection);
  });
  document.querySelector("#custom-reflection-color").addEventListener("input", (event) => {
    const reflection = getSelectedReflection();
    if (!reflection) return;
    reflection.color = event.target.value;
    updateGemOpticalEffect();
    syncReflectionEditor({ keepFocus: true });
  });
  document.querySelector("#reflection-shape").addEventListener("change", (event) => {
    const reflection = getSelectedReflection();
    if (!reflection) return;
    reflection.shape = event.target.value;
    updateGemOpticalEffect();
  });
  document.querySelector("#reflection-depth").addEventListener("input", (event) => {
    const reflection = getSelectedReflection();
    if (!reflection) return;
    reflection.y = Number(event.target.value);
    updateGemOpticalEffect();
  });
  document.querySelector("#reflection-radius").addEventListener("input", (event) => {
    const reflection = getSelectedReflection();
    if (!reflection) return;
    reflection.radius = THREE.MathUtils.clamp(Number(event.target.value), 0.01, 0.75);
    updateGemOpticalEffect();
  });
  document.querySelector("#add-reflection").addEventListener("click", addReflection);
  document.querySelector("#remove-reflection").addEventListener("click", removeReflection);
  document.querySelectorAll("[data-reflect-move]").forEach((button) => {
    button.addEventListener("click", () => moveSelectedReflection(button.dataset.reflectMove));
  });
  document.querySelectorAll("[data-reflect-size]").forEach((button) => {
    button.addEventListener("click", () => resizeSelectedReflection(Number(button.dataset.reflectSize)));
  });
  syncEffectControls();
  syncDiamondBounceControl();
  syncDiamondBeerAbsorptionControl();
  syncDiamondMicroRoughnessControl();
  syncDiamondHdriReflectionControl();
  syncDiamondShaderModeControl();
  syncDiamondPathSamplesControl();
  updateDiamondEnvironmentReflections();
  syncReflectionEditor({ keepFocus: true });
  syncBicolorControls();
  prepareObjectMaterialEditor();
  syncSavedMaterialLibrary();
  syncEffectStatus();
}

function bindRange(selector, key, callback) {
  document.querySelector(selector).addEventListener("input", (event) => {
    settings[key] = Number(event.target.value);
    callback();
  });
}

function bindColor(selector, callback) {
  document.querySelector(selector).addEventListener("input", (event) => callback(event.target.value));
}

function bindEffectToggle(selector, key, callback) {
  const input = document.querySelector(selector);
  input.checked = Boolean(settings.effects[key]);
  input.addEventListener("change", (event) => {
    settings.effects[key] = event.target.checked;
    callback();
    syncEffectStatus();
  });
}

function syncEffectStatus() {
  const active = Object.values(settings.effects).filter(Boolean).length;
  const total = Object.values(settings.effects).length;
  bloomPass.enabled = settings.effects.bloom;
  bokehPass.enabled = settings.effects.dof;
  controls.autoRotate = settings.effects.autoRotate;
  causticPlane.visible = settings.effects.caustics && settings.caustics && settings.effectMethod !== "physical";
  const counter = document.querySelector("#active-effects-count");
  if (counter) counter.textContent = `${active}/${total} actifs`;
  Object.entries({
    "#fx-dispersion": "dispersion",
    "#fx-parametric": "parametric",
    "#fx-custom-reflections": "customReflections",
    "#fx-caustics": "caustics",
    "#fx-bicolor": "bicolor",
    "#fx-bloom": "bloom",
    "#fx-dof-toggle": "dof",
    "#fx-auto-rotate": "autoRotate",
  }).forEach(([selector, key]) => {
    const input = document.querySelector(selector);
    if (!input) return;
    input.checked = Boolean(settings.effects[key]);
    const row = input.closest("label");
    if (row) {
      row.classList.toggle("is-enabled", input.checked);
      row.classList.toggle("is-disabled", !input.checked);
      row.dataset.state = input.checked ? "actif" : "inactif";
    }
  });
  logDebug("info", "Effets du projet synchronises", { active, total, ...settings.effects });
}

function wireMeshImportDialog() {
  const dialog = document.querySelector("#mesh-preview-dialog");
  if (!dialog) return;
  const quality = document.querySelector("#mesh-quality");
  quality.addEventListener("change", () => {
    if (quality.value !== "custom") applyMeshQualityPreset(quality.value);
    syncMeshImportControls();
  });
  ["#mesh-chord", "#mesh-angle", "#mesh-max-edge", "#mesh-weld", "#mesh-smooth-angle", "#mesh-subdivision"].forEach((selector) => {
    document.querySelector(selector).addEventListener("input", () => {
      quality.value = "custom";
      syncMeshImportControls();
    });
  });
  document.querySelector("#mesh-import-apply").addEventListener("click", confirmPendingMeshImport);
  document.querySelector("#mesh-import-cancel").addEventListener("click", cancelPendingMeshImport);
  dialog.addEventListener("cancel", (event) => {
    event.preventDefault();
    cancelPendingMeshImport();
  });
  setMeshDialogOptions(defaultRhinoMeshOptions);
  syncMeshImportControls();
}

function wireRhinoRemeshControls() {
  const panel = document.querySelector(".rhino-remesh");
  if (!panel) return;
  const quality = document.querySelector("#rhino-remesh-quality");
  quality.addEventListener("change", () => {
    if (quality.value !== "custom") applyRhinoRemeshPreset(quality.value);
    syncRhinoRemeshLabels();
    scheduleRhinoInstantPreview(true);
  });
  [
    "#rhino-remesh-chord",
    "#rhino-remesh-angle",
    "#rhino-remesh-max-edge",
    "#rhino-remesh-subdivision",
    "#rhino-remesh-relaxation",
    "#rhino-remesh-relaxation-strength",
    "#rhino-remesh-preserve-angle",
    "#rhino-remesh-smooth-angle",
  ].forEach((selector) => {
    document.querySelector(selector).addEventListener("input", () => {
      quality.value = "custom";
      syncRhinoRemeshLabels();
      scheduleRhinoInstantPreview();
    });
  });
  ["#rhino-remesh-recompute-normals", "#rhino-remesh-weighted-normals", "#rhino-preserve-frame", "#rhino-z-up"].forEach((selector) => {
    document.querySelector(selector).addEventListener("change", () => scheduleRhinoInstantPreview(true));
  });
  ["#rhino-preview-enabled", "#rhino-preview-mode"].forEach((selector) => {
    document.querySelector(selector).addEventListener("change", () => scheduleRhinoInstantPreview(true));
  });
  document.querySelector("#rhino-preview-opacity").addEventListener("input", () => {
    syncRhinoRemeshLabels();
    scheduleRhinoInstantPreview();
  });
  document.querySelector("#rhino-remesh-apply").addEventListener("click", () => scheduleCurrentRhinoRemesh(true));
  syncRhinoRemeshControls(defaultRhinoMeshOptions);
  updateRhinoRemeshAvailability();
}

function wireFacetTextureControls() {
  if (!document.querySelector("#facet-texture-enabled")) return;
  document.querySelector("#facet-texture-enabled").addEventListener("change", (event) => {
    settings.facetTextureEnabled = event.target.checked;
    updateFacetTextureMaterials();
  });
  document.querySelector("#facet-realism-preset").addEventListener("change", (event) => {
    applyFacetRealismPreset(event.target.value);
  });
  document.querySelector("#facet-texture-mode").addEventListener("change", (event) => {
    const preset = facetTextureModePresets[event.target.value] || facetTextureModePresets.jewelry;
    applyFacetTextureConfig({ ...getFacetTextureConfig(), mode: event.target.value, ...preset });
  });
  [
    ["#facet-texture-intensity", "facetTextureIntensity"],
    ["#facet-texture-roughness", "facetTextureRoughness"],
    ["#facet-texture-tint", "facetTextureTint"],
    ["#facet-texture-reflectance", "facetTextureReflectance"],
    ["#facet-texture-scale", "facetTextureScale"],
    ["#facet-texture-seed", "facetTextureSeed"],
    ["#optical-polish-strength", "opticalPolishStrength"],
    ["#optical-polish-edge", "opticalPolishEdge"],
  ].forEach(([selector, key]) => {
    document.querySelector(selector).addEventListener("input", (event) => {
      settings[key] = Number(event.target.value);
      syncFacetTextureLabels();
      updateFacetTextureMaterials();
    });
  });
  document.querySelector("#optical-polish-enabled").addEventListener("change", (event) => {
    settings.opticalPolishEnabled = event.target.checked;
    syncFacetTextureLabels();
    updateFacetTextureMaterials();
  });
  document.querySelector("#facet-config-save").addEventListener("click", saveFacetTextureConfig);
  document.querySelector("#facet-config-apply").addEventListener("click", applySelectedFacetTextureConfig);
  document.querySelector("#facet-config-delete").addEventListener("click", deleteSelectedFacetTextureConfig);
  document.querySelector("#facet-config-default").addEventListener("click", () => {
    applyFacetTextureConfig(facetTextureBestDefault);
    showNotice("Meilleure configuration par défaut appliquée.");
  });
  syncFacetTextureControls();
  syncFacetTextureLibrary();
  applyFacetTextureConfig(facetTextureBestDefault);
}

function applyMeshQualityPreset(id) {
  const preset = meshQualityPresets[id] || meshQualityPresets.balanced;
  setMeshDialogOptions({
    quality: id,
    chordTolerance: preset.chord,
    angleTolerance: preset.angle,
    maxEdgeLength: preset.maxEdge,
    weldTolerance: preset.weld,
    smoothAngle: preset.smoothAngle,
    visualSubdivisions: preset.visualSubdivisions,
    surfaceRelaxation: preset.surfaceRelaxation ?? defaultRhinoMeshOptions.surfaceRelaxation,
    relaxationStrength: preset.relaxationStrength ?? defaultRhinoMeshOptions.relaxationStrength,
    preserveAngle: preset.preserveAngle ?? defaultRhinoMeshOptions.preserveAngle,
    recomputeNormals: preset.recomputeNormals !== false,
    weightedNormals: preset.weightedNormals === true,
    preserveRhinoFrame: document.querySelector("#mesh-preserve-frame")?.checked !== false,
    rhinoZUp: document.querySelector("#mesh-rhino-z-up")?.checked !== false,
  });
}

function setMeshDialogOptions(options) {
  document.querySelector("#mesh-quality").value = options.quality || "custom";
  document.querySelector("#mesh-chord").value = String(options.chordTolerance ?? 0.015);
  document.querySelector("#mesh-angle").value = String(options.angleTolerance ?? 5);
  document.querySelector("#mesh-max-edge").value = String(options.maxEdgeLength ?? 0.12);
  document.querySelector("#mesh-weld").value = String(options.weldTolerance ?? 0.0005);
  document.querySelector("#mesh-smooth-angle").value = String(options.smoothAngle ?? 78);
  document.querySelector("#mesh-subdivision").value = String(options.visualSubdivisions ?? 1);
  document.querySelector("#mesh-relaxation").value = String(options.surfaceRelaxation ?? defaultRhinoMeshOptions.surfaceRelaxation);
  document.querySelector("#mesh-relaxation-strength").value = String(options.relaxationStrength ?? defaultRhinoMeshOptions.relaxationStrength);
  document.querySelector("#mesh-preserve-angle").value = String(options.preserveAngle ?? defaultRhinoMeshOptions.preserveAngle);
  document.querySelector("#mesh-recompute-normals").checked = options.recomputeNormals !== false;
  document.querySelector("#mesh-weighted-normals").checked = options.weightedNormals === true;
  document.querySelector("#mesh-double-sided").checked = options.doubleSided !== false;
  document.querySelector("#mesh-ignore-annotations").checked = options.ignoreAnnotations !== false;
  document.querySelector("#mesh-preserve-materials").checked = options.preserveMaterials !== false;
  document.querySelector("#mesh-soft-shadow").checked = options.softStudioShadow !== false;
  document.querySelector("#mesh-geometric-shadow").checked = options.geometricShadow === true;
  const preserveFrame = document.querySelector("#mesh-preserve-frame");
  if (preserveFrame) preserveFrame.checked = options.preserveRhinoFrame !== false;
  const rhinoZUp = document.querySelector("#mesh-rhino-z-up");
  if (rhinoZUp) rhinoZUp.checked = options.rhinoZUp !== false;
}

function getMeshImportOptions() {
  return {
    quality: document.querySelector("#mesh-quality")?.value || "balanced",
    chordTolerance: Number(document.querySelector("#mesh-chord")?.value || 0.05),
    angleTolerance: Number(document.querySelector("#mesh-angle")?.value || 12),
    maxEdgeLength: Number(document.querySelector("#mesh-max-edge")?.value || 0.35),
    weldTolerance: Number(document.querySelector("#mesh-weld")?.value || 0.001),
    smoothAngle: Number(document.querySelector("#mesh-smooth-angle")?.value || 45),
    visualSubdivisions: Number(document.querySelector("#mesh-subdivision")?.value || 0),
    surfaceRelaxation: Number(document.querySelector("#mesh-relaxation")?.value || defaultRhinoMeshOptions.surfaceRelaxation),
    relaxationStrength: Number(document.querySelector("#mesh-relaxation-strength")?.value || defaultRhinoMeshOptions.relaxationStrength),
    preserveAngle: Number(document.querySelector("#mesh-preserve-angle")?.value || defaultRhinoMeshOptions.preserveAngle),
    recomputeNormals: document.querySelector("#mesh-recompute-normals")?.checked !== false,
    weightedNormals: document.querySelector("#mesh-weighted-normals")?.checked === true,
    doubleSided: document.querySelector("#mesh-double-sided")?.checked !== false,
    ignoreAnnotations: document.querySelector("#mesh-ignore-annotations")?.checked !== false,
    preserveMaterials: document.querySelector("#mesh-preserve-materials")?.checked !== false,
    softStudioShadow: document.querySelector("#mesh-soft-shadow")?.checked !== false,
    geometricShadow: document.querySelector("#mesh-geometric-shadow")?.checked === true,
    preserveRhinoFrame: document.querySelector("#mesh-preserve-frame")?.checked !== false,
    rhinoZUp: document.querySelector("#mesh-rhino-z-up")?.checked !== false,
  };
}

function syncMeshImportControls() {
  const values = getMeshImportOptions();
  document.querySelector("#mesh-chord-value").textContent = values.chordTolerance.toFixed(3);
  document.querySelector("#mesh-angle-value").textContent = values.angleTolerance.toFixed(0);
  document.querySelector("#mesh-max-edge-value").textContent = values.maxEdgeLength.toFixed(4);
  document.querySelector("#mesh-weld-value").textContent = values.weldTolerance.toFixed(3);
  document.querySelector("#mesh-smooth-angle-value").textContent = values.smoothAngle.toFixed(0);
  document.querySelector("#mesh-subdivision-value").textContent = String(values.visualSubdivisions);
  document.querySelector("#mesh-relaxation-value").textContent = String(values.surfaceRelaxation);
  document.querySelector("#mesh-relaxation-strength-value").textContent = values.relaxationStrength.toFixed(2);
  document.querySelector("#mesh-preserve-angle-value").textContent = values.preserveAngle.toFixed(0);
}

function populateMeshPreviewDialog(file, stats) {
  document.querySelector("#mesh-import-summary").textContent =
    `${file.name} - ${formatFileSize(file.size)}. ${stats.meshes > 0 ? "Maillage de rendu détecté." : "Aucun maillage de rendu détecté. Un recalcul depuis les NURBS peut être nécessaire."}`;
  document.querySelector("#mesh-stat-meshes").textContent = String(stats.meshes);
  document.querySelector("#mesh-stat-lines").textContent = String(stats.lines);
  document.querySelector("#mesh-stat-vertices").textContent = String(stats.vertices);
  document.querySelector("#mesh-stat-triangles").textContent = String(stats.triangles);
  const applyButton = document.querySelector("#mesh-import-apply");
  applyButton.disabled = stats.meshes === 0;
  applyButton.textContent = stats.meshes === 0 ? "Aucun mesh importable" : "Importer avec ces réglages";
}

function formatFileSize(bytes) {
  if (bytes > 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(1)} Mo`;
  if (bytes > 1024) return `${(bytes / 1024).toFixed(1)} Ko`;
  return `${bytes} octets`;
}

function updateMetalMaterials() {
  materialRegistry.metals.forEach((mat) => {
    mat.roughness = settings.metalRoughness;
    mat.envMapIntensity = settings.metalIntensity;
    mat.opacity = 1;
    mat.transparent = false;
    mat.colorWrite = true;
    mat.depthWrite = true;
    mat.depthTest = true;
    mat.needsUpdate = true;
  });
  updateFacetTextureMaterials();
}

function applyMetalPreset(id) {
  const preset = metalPresets[id] || metalPresets["yellow-gold"];
  settings.metalPreset = id;
  settings.metalRoughness = preset.roughness;
  settings.metalIntensity = preset.env;
  document.querySelector("#metal-roughness").value = String(preset.roughness);
  document.querySelector("#metal-intensity").value = String(preset.env);

  materialRegistry.metals.forEach((mat) => {
    mat.color.set(preset.color);
    mat.roughness = preset.roughness;
    mat.envMapIntensity = preset.env;
    mat.metalness = 1;
    mat.clearcoat = 0.72;
    mat.clearcoatRoughness = preset.clearcoatRoughness;
    mat.opacity = 1;
    mat.transparent = false;
    mat.colorWrite = true;
    mat.depthWrite = true;
    mat.depthTest = true;
    mat.needsUpdate = true;
  });
  updateFacetTextureMaterials();
  showNotice(`${preset.label} appliqué au métal.`);
}

function makeActiveMetalMaterial(name = "precious metal") {
  return makeMetalMaterialFromPreset(settings.metalPreset, name);
}

function makeRhinoPolishedMetalMaterial(name = "Rhino polished gold") {
  const preset = metalPresets[settings.metalPreset] || metalPresets["yellow-gold"];
  const mat = new THREE.MeshPhysicalMaterial({
    name,
    color: new THREE.Color(preset.color).lerp(new THREE.Color("#fff0b8"), 0.055),
    metalness: 1,
    roughness: Math.min(0.055, preset.roughness * 0.55),
    envMapIntensity: Math.max(1.85, preset.env * 1.62),
    clearcoat: 1,
    clearcoatRoughness: 0.022,
    anisotropy: 0.82,
    iridescence: 0.045,
  });
  mat.userData.jewelryMaterial = { type: "metal", preset: settings.metalPreset, rhinoPolished: true };
  installFacetTextureShader(mat);
  materialRegistry.metals.push(mat);
  return mat;
}

function makeRhinoClassicGoldMaterial(name = "Rhino classic gold") {
  const mat = new THREE.MeshPhysicalMaterial({
    name,
    color: new THREE.Color("#a97824"),
    metalness: 1,
    roughness: 0.22,
    envMapIntensity: 0.58,
    clearcoat: 0.42,
    clearcoatRoughness: 0.16,
    anisotropy: 0.24,
  });
  mat.userData.jewelryMaterial = { type: "metal", preset: "yellow-gold", rhinoClassic: true };
  installFacetTextureShader(mat);
  materialRegistry.metals.push(mat);
  return mat;
}

function makeMetalMaterialFromPreset(id, name = "precious metal") {
  const preset = metalPresets[settings.metalPreset] || metalPresets["yellow-gold"];
  const mat = new THREE.MeshPhysicalMaterial({
    name,
    color: new THREE.Color((metalPresets[id] || preset).color),
    metalness: 1,
    roughness: (metalPresets[id] || preset).roughness,
    envMapIntensity: (metalPresets[id] || preset).env,
    clearcoat: 0.72,
    clearcoatRoughness: (metalPresets[id] || preset).clearcoatRoughness,
    anisotropy: 0.42,
  });
  mat.userData.jewelryMaterial = { type: "metal", preset: id };
  installFacetTextureShader(mat);
  materialRegistry.metals.push(mat);
  return mat;
}

function preserveObjectMaterialRenderState(object, nextMaterial) {
  const previousMaterials = Array.isArray(object.material) ? object.material.filter(Boolean) : [object.material].filter(Boolean);
  const previous = previousMaterials[0];
  const requiresDoubleSide =
    object.userData?.meshProcessing?.doubleSided === true ||
    previousMaterials.some((material) => material.side === THREE.DoubleSide);

  nextMaterial.side = requiresDoubleSide ? THREE.DoubleSide : (previous?.side ?? THREE.FrontSide);
  nextMaterial.shadowSide = previous?.shadowSide ?? null;
  nextMaterial.opacity = 1;
  nextMaterial.transparent = false;
  nextMaterial.alphaTest = 0;
  nextMaterial.colorWrite = true;
  nextMaterial.depthWrite = true;
  nextMaterial.depthTest = true;
  nextMaterial.visible = true;
  nextMaterial.needsUpdate = true;
  return nextMaterial;
}

function getObjectMaterialList(material) {
  return Array.isArray(material) ? material.filter(Boolean) : [material].filter(Boolean);
}

function detachDiamondRuntimeFromMaterial(material) {
  const uniform = material?.userData?.diamondBvhUniform;
  if (uniform?.dispose) {
    try {
      uniform.dispose();
    } catch {}
  }
  if (material?.userData) {
    delete material.userData.diamondBvhUniform;
    delete material.userData.diamondBvhGeometryUuid;
    delete material.userData.diamondBvhGeometrySignature;
    delete material.userData.diamondBvhSourceMesh;
    delete material.userData.diamondGpuBvhEnabled;
  }
}

function detachDiamondRuntimeFromMesh(mesh) {
  getObjectMaterialList(mesh?.material).forEach(detachDiamondRuntimeFromMaterial);
  if (mesh?.userData) {
    delete mesh.userData.diamondRayTraceSignature;
    delete mesh.userData.diamondRayTraceGeneration;
  }
  if (mesh?.geometry?.userData) mesh.geometry.userData.diamondRayTraceReady = false;
}

function applySingleMaterialToMesh(mesh, nextMaterial, options = {}) {
  if (!mesh?.isMesh || !nextMaterial) return null;
  detachDiamondRuntimeFromMesh(mesh);
  const previousMaterials = getObjectMaterialList(mesh.material);
  const requiresDoubleSide =
    mesh.userData?.meshProcessing?.doubleSided === true ||
    previousMaterials.some((material) => material.side === THREE.DoubleSide);
  const material = options.keepOpticalSettings
    ? nextMaterial
    : preserveObjectMaterialRenderState(mesh, nextMaterial);
  if (options.keepOpticalSettings) {
    material.side = requiresDoubleSide ? THREE.DoubleSide : material.side;
    material.shadowSide = material.shadowSide ?? previousMaterials[0]?.shadowSide ?? null;
    material.visible = true;
    material.colorWrite = true;
    material.depthTest = true;
    material.needsUpdate = true;
  }
  mesh.material = material;
  if (options.clearGroups !== false && mesh.geometry?.clearGroups) mesh.geometry.clearGroups();
  mesh.visible = true;
  mesh.frustumCulled = false;
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  mesh.userData.assignedMaterialName = material.name || material.type || "materiau";
  material.needsUpdate = true;
  return material;
}

function cloneMaterialForLibrary(material) {
  const cloned = material.clone();
  if (materialRegistry.metals.includes(material)) {
    installFacetTextureShader(cloned);
    materialRegistry.metals.push(cloned);
  }
  return cloned;
}

function cloneModelForLibrary(model) {
  const cloned = model.clone(true);
  const materialMap = new Map();
  cloned.traverse((child) => {
    if (!child.isMesh || !child.material) return;
    if (Array.isArray(child.material)) {
      child.material = child.material.map((mat) => {
        if (!materialMap.has(mat.uuid)) materialMap.set(mat.uuid, cloneMaterialForLibrary(mat));
        return materialMap.get(mat.uuid);
      });
    } else {
      if (!materialMap.has(child.material.uuid)) materialMap.set(child.material.uuid, cloneMaterialForLibrary(child.material));
      child.material = materialMap.get(child.material.uuid);
    }
  });
  return cloned;
}

function prepareObjectMaterialEditor(options = {}) {
  const shouldEnsureStoneShowcase = options.ensureStoneShowcase !== false && settings.stoneShowcaseVisible;
  if (shouldEnsureStoneShowcase) ensureStoneShowcase();
  assignUniqueMaterialsToObjects();
  refreshEditableObjectList();
  syncSavedMaterialLibrary();
}

function assignUniqueMaterialsToObjects() {
  root.traverse((child) => {
    if (!child.isMesh || child.parent === reflectionRig || child.userData.parametricGemEffect || child.userData.stemDecal) return;
    child.castShadow = true;
    child.receiveShadow = true;
    const inferred = inferMaterialForObject(child);
    child.material = inferred;
  });
}

function inferMaterialForObject(object) {
  const source = Array.isArray(object.material) ? object.material[0] : object.material;
  const name = `${object.name || ""} ${source?.name || ""} ${object.userData?.attributes?.layer || ""}`.toLowerCase();
  if (source?.userData?.jewelryMaterial) return source.clone();
  if (name.includes("diamond") || name.includes("diamant") || name.includes("brilliant")) return makeGemMaterialFromPreset("diamond");
  if (name.includes("ruby") || name.includes("rubis")) return makeGemMaterialFromPreset(name.includes("cabochon") ? "ruby-cabochon" : "ruby");
  if (name.includes("sapphire") || name.includes("saphir")) return makeGemMaterialFromPreset(name.includes("cabochon") ? "sapphire-cabochon" : "sapphire");
  if (name.includes("emerald") || name.includes("emeraude")) {
    return makeGemMaterialFromPreset(name.includes("cabochon") ? "emerald-cabochon" : "emerald");
  }
  if (name.includes("pearl") || name.includes("perle")) return makeGemMaterialFromPreset("pearl");
  if (name.includes("stone") || name.includes("gem") || name.includes("pierre") || isLikelyGemMaterial(source, name)) {
    return makeGemMaterialFromSource(source, name);
  }
  if (name.includes("white gold") || name.includes("or blanc")) return makeMetalMaterialFromPreset("white-gold", "Or blanc");
  if (name.includes("rose gold") || name.includes("or rose")) return makeMetalMaterialFromPreset("rose-gold", "Or rose");
  if (name.includes("silver") || name.includes("argent")) return makeMetalMaterialFromPreset("silver", "Argent poli");
  if (name.includes("platinum") || name.includes("platine")) return makeMetalMaterialFromPreset("platinum", "Platine");
  if (name.includes("rhodium")) return makeMetalMaterialFromPreset("black-rhodium", "Rhodium noir");
  if (name.includes("gold") || name.includes("or ") || name.includes("metal") || name.includes("ring") || isLikelyMetalMaterial(source, name)) {
    return makeMetalMaterialFromPreset(settings.metalPreset, metalPresets[settings.metalPreset]?.label || "Métal précieux");
  }
  return makeMetalMaterialFromPreset(settings.metalPreset, "Métal précieux");
}

function refreshEditableObjectList() {
  editableObjects.length = 0;
  root.traverse((child) => {
    if (child.isMesh && child.parent !== reflectionRig && !child.userData.parametricGemEffect && !child.userData.stemDecal) editableObjects.push(child);
  });
  const select = document.querySelector("#object-select");
  if (!select) return;
  select.innerHTML =
    '<option value="">Aucun objet</option>' +
    editableObjects
      .map((object, index) => `<option value="${object.uuid}">${index + 1}. ${object.name || object.type}</option>`)
      .join("");
  if (selectedSceneObject && editableObjects.includes(selectedSceneObject)) {
    select.value = selectedSceneObject.uuid;
  } else {
    select.value = "";
    selectSceneObject(null);
  }
}

function readMaterialLibrary(scope) {
  const key = scope === "general" ? GENERAL_MATERIAL_LIBRARY_KEY : PROJECT_MATERIAL_LIBRARY_KEY;
  try {
    return JSON.parse(localStorage.getItem(key) || "[]");
  } catch {
    return [];
  }
}

function writeMaterialLibrary(scope, entries) {
  const key = scope === "general" ? GENERAL_MATERIAL_LIBRARY_KEY : PROJECT_MATERIAL_LIBRARY_KEY;
  localStorage.setItem(key, JSON.stringify(entries));
}

function syncSavedMaterialLibrary() {
  const select = document.querySelector("#saved-materials");
  if (!select) return;
  const project = readMaterialLibrary("project").map((entry) => ({ ...entry, scope: "project" }));
  const general = readMaterialLibrary("general").map((entry) => ({ ...entry, scope: "general" }));
  const all = [...project, ...general];
  select.innerHTML =
    '<option value="">Aucun mat\u00e9riau sauvegardé</option>' +
    all.map((entry) => `<option value="${entry.scope}:${entry.id}">${entry.scope === "project" ? "Projet" : "Général"} - ${entry.name}</option>`).join("");
}

function syncFacetTextureControls() {
  const enabled = document.querySelector("#facet-texture-enabled");
  if (!enabled) return;
  enabled.checked = settings.facetTextureEnabled;
  document.querySelector("#facet-texture-mode").value = settings.facetTextureMode;
  document.querySelector("#facet-texture-intensity").value = String(settings.facetTextureIntensity);
  document.querySelector("#facet-texture-roughness").value = String(settings.facetTextureRoughness);
  document.querySelector("#facet-texture-tint").value = String(settings.facetTextureTint);
  document.querySelector("#facet-texture-reflectance").value = String(settings.facetTextureReflectance);
  document.querySelector("#facet-texture-scale").value = String(settings.facetTextureScale);
  document.querySelector("#facet-texture-seed").value = String(settings.facetTextureSeed);
  document.querySelector("#optical-polish-enabled").checked = settings.opticalPolishEnabled;
  document.querySelector("#optical-polish-strength").value = String(settings.opticalPolishStrength);
  document.querySelector("#optical-polish-edge").value = String(settings.opticalPolishEdge);
  syncFacetTextureLabels();
}

function syncFacetTextureLabels() {
  const pairs = {
    "#facet-texture-intensity-value": settings.facetTextureIntensity.toFixed(2),
    "#facet-texture-roughness-value": settings.facetTextureRoughness.toFixed(2),
    "#facet-texture-tint-value": settings.facetTextureTint.toFixed(3),
    "#facet-texture-reflectance-value": settings.facetTextureReflectance.toFixed(2),
    "#facet-texture-scale-value": settings.facetTextureScale.toFixed(2),
    "#facet-texture-seed-value": settings.facetTextureSeed.toFixed(2),
    "#optical-polish-strength-value": settings.opticalPolishStrength.toFixed(2),
    "#optical-polish-edge-value": settings.opticalPolishEdge.toFixed(2),
  };
  Object.entries(pairs).forEach(([selector, value]) => {
    const el = document.querySelector(selector);
    if (el) el.textContent = value;
  });
}

function syncFacetTextureLibrary() {
  const select = document.querySelector("#facet-config-library");
  if (!select) return;
  const entries = readFacetTextureConfigs();
  select.innerHTML =
    '<option value="">Aucune configuration</option>' +
    entries.map((entry) => `<option value="${entry.id}">${entry.name}</option>`).join("");
}

function saveFacetTextureConfig() {
  const name = window.prompt("Nom de la configuration facet-aware", `Configuration facettes ${new Date().toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" })}`);
  if (!name) return;
  const entries = readFacetTextureConfigs();
  const entry = {
    id: `facet-${Date.now()}`,
    name,
    createdAt: new Date().toISOString(),
    config: getFacetTextureConfig(),
  };
  entries.push(entry);
  writeFacetTextureConfigs(entries);
  syncFacetTextureLibrary();
  document.querySelector("#facet-config-library").value = entry.id;
  showNotice("Configuration de texture facettee sauvegardee.");
}

function applySelectedFacetTextureConfig() {
  const id = document.querySelector("#facet-config-library")?.value;
  if (!id) return;
  const entry = readFacetTextureConfigs().find((item) => item.id === id);
  if (!entry) return;
  applyFacetTextureConfig(entry.config);
  showNotice(`Configuration appliquée : ${entry.name}.`);
}

function deleteSelectedFacetTextureConfig() {
  const select = document.querySelector("#facet-config-library");
  const id = select?.value;
  if (!id) return;
  writeFacetTextureConfigs(readFacetTextureConfigs().filter((entry) => entry.id !== id));
  syncFacetTextureLibrary();
  showNotice("Configuration de texture supprimée.");
}

function serializeMaterial(material, fallbackName = "Matériau joaillerie") {
  const jewel = material.userData?.jewelryMaterial || {};
  return {
    id: `${Date.now()}-${Math.random().toString(16).slice(2)}`,
    name: material.name || fallbackName,
    type: jewel.type || (material.metalness > 0.5 ? "metal" : "gem"),
    preset: jewel.preset || "",
    color: `#${material.color?.getHexString?.() || "ffffff"}`,
    roughness: material.roughness ?? 0.1,
    metalness: material.metalness ?? 0,
    transmission: material.transmission ?? 0,
    thickness: material.thickness ?? 1,
    ior: material.ior ?? 1.5,
    envMapIntensity: material.envMapIntensity ?? 1,
    clearcoat: material.clearcoat ?? 0,
    clearcoatRoughness: material.clearcoatRoughness ?? 0,
    iridescence: material.iridescence ?? 0,
    attenuationColor: `#${material.attenuationColor?.getHexString?.() || "ffffff"}`,
    attenuationDistance: material.attenuationDistance ?? 1,
    gemMaterialModel: settings.gemMaterialModel,
    gemBicolorMode: settings.gemBicolorMode,
    gemZoneA: settings.gemZoneA,
    gemZoneB: settings.gemZoneB,
    gemBoundaryShape: settings.gemBoundaryShape,
    gemBoundarySoftness: settings.gemBoundarySoftness,
    gemBoundaryAngle: settings.gemBoundaryAngle,
    gemBoundaryAmplitude: settings.gemBoundaryAmplitude,
    gemBoundaryPeriod: settings.gemBoundaryPeriod,
  };
}

function materialFromSaved(entry) {
  const mat = new THREE.MeshPhysicalMaterial({
    name: entry.name,
    color: new THREE.Color(entry.color),
    roughness: entry.roughness,
    metalness: entry.metalness,
    transmission: entry.transmission,
    thickness: entry.thickness,
    ior: entry.ior,
    envMapIntensity: entry.envMapIntensity,
    clearcoat: entry.clearcoat,
    clearcoatRoughness: entry.clearcoatRoughness,
    iridescence: entry.iridescence,
    attenuationColor: new THREE.Color(entry.attenuationColor || "#ffffff"),
    attenuationDistance: entry.attenuationDistance,
  });
  mat.userData.jewelryMaterial = { type: entry.type, preset: entry.preset || "", saved: true };
  if (entry.type === "metal") {
    materialRegistry.metals.push(mat);
  } else {
    applyGemReflectionFinish(mat, entry.preset && gemPresets[entry.preset] ? gemPresets[entry.preset] : {});
  }
  return mat;
}

function saveSelectedMaterial(scope) {
  if (!selectedSceneObject?.material) {
    showNotice("Sélectionnez un objet avant de sauvegarder son mat\u00e9riau.");
    return;
  }
  const material = Array.isArray(selectedSceneObject.material) ? selectedSceneObject.material[0] : selectedSceneObject.material;
  const entry = serializeMaterial(material, selectedSceneObject.name || "Matériau");
  entry.name = `${entry.name} - ${selectedSceneObject.name || "objet"}`;
  const library = readMaterialLibrary(scope);
  library.push(entry);
  writeMaterialLibrary(scope, library);
  syncSavedMaterialLibrary();
  showNotice(`Matériau sauvegardé dans la bibliothèque ${scope === "project" ? "projet" : "générale"}.`);
}

function getSelectedSavedMaterialEntry() {
  const value = document.querySelector("#saved-materials").value;
  if (!value) return null;
  const [scope, id] = value.split(":");
  return { scope, entry: readMaterialLibrary(scope).find((item) => item.id === id) };
}

function applySavedMaterialToSelectedObject() {
  if (!selectedSceneObject?.isMesh) {
    showNotice("Sélectionnez d’abord un objet dans le dessin.");
    return;
  }
  const selected = getSelectedSavedMaterialEntry();
  if (!selected?.entry) return;
  const material = materialFromSaved(selected.entry);
  applySingleMaterialToMesh(selectedSceneObject, material, { keepOpticalSettings: selected.entry.type === "gem" });
  if (selected.entry.type === "gem") {
    selectedSceneObject.userData.classicPlugRole = "gem";
    centerGemMesh = selectedSceneObject;
    restoreGemParamsFromSaved(selected.entry);
    scheduleDiamondInternalRayTracing(selectedSceneObject, "matériau sauvegardé pierre");
    buildGemOpticalEffect();
  } else if (centerGemMesh === selectedSceneObject) {
    selectedSceneObject.userData.classicPlugRole = "metal";
    centerGemMesh = null;
    reflectionRig.clear();
  }
  selectSceneObject(selectedSceneObject);
  showNotice("Matériau appliqué à l’objet sélectionné.");
}

function deleteSavedMaterial() {
  const selected = getSelectedSavedMaterialEntry();
  if (!selected?.entry) return;
  const library = readMaterialLibrary(selected.scope).filter((entry) => entry.id !== selected.entry.id);
  writeMaterialLibrary(selected.scope, library);
  syncSavedMaterialLibrary();
  showNotice("Matériau supprimé de la bibliothèque.");
}

function restoreGemParamsFromSaved(entry) {
  settings.gemMaterialModel = entry.gemMaterialModel || settings.gemMaterialModel;
  settings.gemBicolorMode = entry.gemBicolorMode || "off";
  settings.gemZoneA = entry.gemZoneA || settings.gemZoneA;
  settings.gemZoneB = entry.gemZoneB || settings.gemZoneB;
  settings.gemBoundaryShape = entry.gemBoundaryShape || settings.gemBoundaryShape;
  settings.gemBoundarySoftness = entry.gemBoundarySoftness ?? settings.gemBoundarySoftness;
  settings.gemBoundaryAngle = entry.gemBoundaryAngle ?? settings.gemBoundaryAngle;
  settings.gemBoundaryAmplitude = entry.gemBoundaryAmplitude ?? settings.gemBoundaryAmplitude;
  settings.gemBoundaryPeriod = entry.gemBoundaryPeriod ?? settings.gemBoundaryPeriod;
  document.querySelector("#gem-material-model").value = settings.gemMaterialModel;
  document.querySelector("#gem-bicolor-mode").value = settings.gemBicolorMode;
  document.querySelector("#gem-zone-a").value = settings.gemZoneA;
  document.querySelector("#gem-zone-b").value = settings.gemZoneB;
  syncBicolorControls();
  applyGemBicolorPattern();
}

function updateGemOpticalEffect() {
  centerGemMaterial.ior = settings.gemIor;
  centerGemMaterial.roughness = settings.gemRoughness;
  centerGemMaterial.transmission =
    settings.effectMethod === "physical" ? Math.max(settings.gemTransmission, 0.18) : settings.gemTransmission;
  centerGemMaterial.thickness = settings.effectMethod === "physical" ? 2.25 : 1.4 + settings.gemTransmission;
  centerGemMaterial.envMapIntensity =
    settings.effectMethod === "chromatic" ? 3.3 : 2.45 + settings.reflectionIntensity * 0.08;
  centerGemMaterial.iridescence =
    settings.effectMethod === "chromatic" ? Math.max(settings.gemIridescence, 0.38 + settings.chromaticShift * 0.42) : settings.gemIridescence;
  centerGemMaterial.iridescenceIOR = 1.55 + settings.dispersion * 0.65;
  centerGemMaterial.clearcoatRoughness = settings.gemClearcoatRoughness;
  centerGemMaterial.attenuationDistance = settings.gemAbsorption;
  centerGemMaterial.sheen = settings.gemCloudiness * 0.85;
  centerGemMaterial.sheenColor = new THREE.Color(settings.reflectionColor);
  if (settings.effects.bicolor && settings.gemBicolorMode !== "off") {
    centerGemMaterial.color.set("#ffffff");
    centerGemMaterial.vertexColors = true;
  }

  applyGemMaterialModel();

  if (!centerGemMesh) {
    reflectionRig.clear();
    causticPlane.visible = false;
    return;
  }
  const spectralPower =
    settings.effectMethod === "chromatic" ?
       settings.chromaticShift * 0.16
      : settings.dispersion * (0.1 + settings.fireBalance * 0.26);

  reflectionRig.children.forEach((child) => {
    if (child.isMesh) {
      if (child.userData.parametricGemEffect) {
        const flicker = 0.65 + Math.sin(clock.elapsedTime * 1.4 + child.userData.phase) * 0.35;
        child.material.opacity =
          (0.025 + settings.spectralRichness * 0.11 + settings.facetContrast * 0.08) * flicker;
        child.scale.setScalar(0.75 + settings.facetContrast * 1.35);
        return;
      }
      const offset = child.userData.spectralOffset || 0;
      const spread = offset * spectralPower;
      child.position.set(centerGemMesh.position.x + spread, centerGemMesh.position.y, centerGemMesh.position.z - spread * 0.36);
      child.rotation.copy(centerGemMesh.rotation);
      child.scale.setScalar(child.userData.baseScale + settings.reflectionIntensity * 0.006);
      child.material.opacity =
        settings.effectMethod === "chromatic" ?
           settings.reflectionIntensity * 0.025 + Math.abs(offset) * settings.chromaticShift * 0.035
          : settings.reflectionIntensity * (0.028 + settings.fireBalance * 0.024);
    }

    if (child.isSprite) {
      if (child.userData.customReflection) {
        const reflection = settings.reflections[child.userData.reflectionIndex];
        if (!reflection) return;
        const flicker = 0.86 + Math.sin(clock.elapsedTime * 1.35 + child.userData.phase) * 0.14;
        if (!(selectedManipulatorObject === child && transformControls.dragging)) {
          child.position.set(
            centerGemMesh.position.x + reflection.x,
            centerGemMesh.position.y + reflection.y,
            centerGemMesh.position.z + reflection.z,
          );
        }
        child.material.map = getReflectionTexture(reflection.shape);
        child.material.color.set(reflection.color);
        child.material.opacity = getReflectionOpacity(reflection.shape, flicker);
        const scale = getReflectionScale(reflection);
        child.scale.set(scale.x, scale.y, 1);
        return;
      }
      const flicker = 0.78 + Math.sin(clock.elapsedTime * 2.6 + child.userData.phase) * 0.22;
      child.material.opacity = settings.reflectionIntensity * settings.sparkleDensity * 0.15 * flicker;
      child.scale.setScalar(child.userData.baseScale * (1 + settings.reflectionIntensity * 0.08) * settings.causticSpread);
    }
  });

  causticPlane.visible = settings.effects.caustics && settings.caustics && settings.effectMethod !== "physical";
  causticPlane.scale.setScalar(settings.causticSpread);
  causticMaterial.opacity =
    settings.caustics && (settings.effectMethod === "caustic" || settings.effectMethod === "spectral") ?
       Math.min(0.66, settings.reflectionIntensity * 0.12)
      : Math.min(0.18, settings.reflectionIntensity * 0.04);
}

function syncEffectControls() {
  document.querySelectorAll("[data-effect-control]").forEach((control) => {
    const methods = control.dataset.effectControl.split(" ");
    control.hidden = !methods.includes(settings.effectMethod);
  });
}

function syncBicolorControls() {
  const active = settings.gemBicolorMode !== "off";
  document.querySelectorAll("[data-bicolor-control]").forEach((control) => {
    control.hidden = !active;
  });
}

function applyGemMaterialModel() {
  const model = settings.gemMaterialModel;
  if (model === "high-fire") {
    centerGemMaterial.transmission = Math.max(centerGemMaterial.transmission, 0.86);
    centerGemMaterial.roughness = Math.min(centerGemMaterial.roughness, 0.018);
    centerGemMaterial.iridescence = Math.max(centerGemMaterial.iridescence, 0.35 + settings.spectralRichness * 0.5);
    centerGemMaterial.envMapIntensity = 3.4 + settings.spectralRichness * 1.4;
  } else if (model === "opal") {
    centerGemMaterial.transmission = Math.min(centerGemMaterial.transmission, 0.42);
    centerGemMaterial.roughness = Math.max(centerGemMaterial.roughness, 0.16);
    centerGemMaterial.iridescence = 0.82 + settings.spectralRichness * 0.18;
    centerGemMaterial.envMapIntensity = 2.2;
  } else if (model === "included") {
    centerGemMaterial.roughness = Math.max(centerGemMaterial.roughness, 0.09 + settings.gemCloudiness * 0.18);
    centerGemMaterial.transmission = Math.max(0.28, centerGemMaterial.transmission - settings.gemCloudiness * 0.35);
    centerGemMaterial.envMapIntensity = 2.15;
  } else if (model === "smoky") {
    centerGemMaterial.transmission = Math.max(0.2, centerGemMaterial.transmission - 0.24);
    centerGemMaterial.attenuationDistance = Math.min(settings.gemAbsorption, 1.05);
    centerGemMaterial.envMapIntensity = 2.75;
  } else if (model === "milky-cabochon") {
    centerGemMaterial.transmission = 0.22;
    centerGemMaterial.roughness = 0.24 + settings.gemCloudiness * 0.16;
    centerGemMaterial.clearcoatRoughness = 0.16;
    centerGemMaterial.iridescence = 0.28;
    centerGemMaterial.envMapIntensity = 1.85;
  }
  applyGemReflectionFinish(centerGemMaterial, { fire: settings.reflectionColor, opaque: centerGemMaterial.transmission < 0.08, cabochon: settings.gemMaterialModel.includes("cabochon"), pearl: settings.gemMaterialModel === "opal" });
  centerGemMaterial.needsUpdate = true;
}

function applyMaterialModelDefaults(model) {
  const presets = {
    natural: { cloud: 0.08, contrast: 0.38, richness: 0.48, absorption: 1.8, dispersion: settings.dispersion },
    "high-fire": { cloud: 0.02, contrast: 0.82, richness: 0.95, absorption: 2.8, dispersion: 0.92 },
    opal: { cloud: 0.56, contrast: 0.42, richness: 0.9, absorption: 1.2, dispersion: 0.72 },
    included: { cloud: 0.72, contrast: 0.34, richness: 0.5, absorption: 0.85, dispersion: 0.28 },
    smoky: { cloud: 0.28, contrast: 0.7, richness: 0.54, absorption: 0.55, dispersion: 0.38 },
    "milky-cabochon": { cloud: 0.82, contrast: 0.18, richness: 0.32, absorption: 0.7, dispersion: 0.12 },
  };
  const preset = presets[model] || presets.natural;
  settings.gemCloudiness = preset.cloud;
  settings.facetContrast = preset.contrast;
  settings.spectralRichness = preset.richness;
  settings.gemAbsorption = preset.absorption;
  settings.dispersion = preset.dispersion;
  document.querySelector("#gem-cloudiness").value = String(preset.cloud);
  document.querySelector("#facet-contrast").value = String(preset.contrast);
  document.querySelector("#spectral-richness").value = String(preset.richness);
  document.querySelector("#gem-absorption").value = String(preset.absorption);
  document.querySelector("#dispersion").value = String(preset.dispersion);
}

function populateGemPresets() {
  populateMaterialSelectOptions({ preserve: true });
}

function applyGemPreset(id, options = {}) {
  const preset = gemPresets[id] || gemPresets.padparadscha;
  settings.gemColor = preset.color;
  settings.reflectionColor = preset.fire;
  settings.gemIor = preset.ior;
  settings.gemTransmission = preset.opaque ? 0.04 : preset.transmission;
  settings.gemRoughness = preset.roughness;
  settings.gemIridescence = preset.iridescence || (preset.pearl ? 0.42 : 0);
  settings.gemClearcoatRoughness = preset.pearl ? 0.22 : 0.02;
  settings.dispersion = preset.dispersion;
  settings.fireBalance = preset.fireBalance;
  settings.reflectionIntensity = preset.intensity;

  if (options.updateSelectedMaterial !== false) {
    centerGemMaterial.color.set(preset.color);
    centerGemMaterial.attenuationColor.set(preset.attenuation);
    centerGemMaterial.roughness = settings.gemRoughness;
    centerGemMaterial.transmission = settings.gemTransmission;
    centerGemMaterial.thickness = preset.opaque ? 0.2 : 1.4 + preset.transmission;
    centerGemMaterial.clearcoat = preset.pearl ? 0.85 : 1;
    centerGemMaterial.clearcoatRoughness = preset.cabochon ? 0.12 : preset.pearl ? 0.22 : 0.02;
    centerGemMaterial.userData.jewelryMaterial = { type: "gem", preset: id };
    applyGemPresetTexture(centerGemMaterial, preset);
    centerGemMaterial.iridescence = settings.gemIridescence;
    centerGemMaterial.iridescenceIOR = 1.35 + preset.dispersion * 0.7;
    applyGemReflectionFinish(centerGemMaterial, preset);
    if (centerGemMesh) scheduleDiamondInternalRayTracing(centerGemMesh, "preset gemme centrale");
  }
  if (settings.gemBicolorMode !== "off") {
    applyGemBicolorPattern();
  }

  document.querySelector("#gem-color").value = preset.color;
  document.querySelector("#reflection-color").value = preset.fire;
  document.querySelector("#gem-ior").value = String(preset.ior);
  document.querySelector("#dispersion").value = String(preset.dispersion);
  document.querySelector("#fire-balance").value = String(preset.fireBalance);
  document.querySelector("#reflection-intensity").value = String(preset.intensity);


  seedPresetReflections(preset);
  buildGemOpticalEffect();
  syncDiamondBounceControl();
  syncReflectionEditor({ keepFocus: true });
  showNotice(`${preset.label} appliqué aux réglages de pierre.`);
}

function seedPresetReflections(preset) {
  const base = new THREE.Color(preset.color);
  const fire = new THREE.Color(preset.fire);
  const colors = [
    `#${base.clone().offsetHSL(-0.05, 0.18, 0.08).getHexString()}`,
    `#${fire.getHexString()}`,
    `#${base.clone().offsetHSL(0.08, 0.22, 0.14).getHexString()}`,
  ];
  if (preset.label === "Diamant" || preset.label === "Opale") {
    colors[0] = "#ff3355";
    colors[1] = "#55ff95";
    colors[2] = "#4ab3ff";
  }

  settings.reflections = settings.reflections.slice(0, Math.max(3, settings.reflections.length));
  for (let i = 0; i < 3; i += 1) {
    settings.reflections[i] = {
      ...settings.reflections[i],
      color: colors[i],
      shape: settings.reflections[i]?.shape || ["facet", "soft", "bar"][i],
      radius: preset.cabochon ? 0.16 + i * 0.025 : preset.opaque ? 0.052 : 0.07 + i * 0.005,
    };
    if (preset.cabochon) {
      settings.reflections[i].shape = i === 1 ? "oval" : "soft";
    }
  }
  settings.selectedReflection = Math.min(settings.selectedReflection, settings.reflections.length - 1);
}

function getSelectedReflection() {
  return settings.reflections[settings.selectedReflection];
}

function syncReflectionEditor(options = {}) {
  const select = document.querySelector("#reflection-select");
  const current = Math.min(settings.selectedReflection, Math.max(0, settings.reflections.length - 1));
  settings.selectedReflection = current;
  select.innerHTML = settings.reflections
    .map((reflection, index) => `<option value="${index}">Reflet ${index + 1} - ${reflection.color.toUpperCase()}</option>`)
    .join("");
  select.value = String(current);

  const reflection = getSelectedReflection();
  const disabled = !reflection;
  document.querySelector("#custom-reflection-color").disabled = disabled;
  document.querySelector("#reflection-shape").disabled = disabled;
  document.querySelector("#reflection-depth").disabled = disabled;
  document.querySelector("#reflection-radius").disabled = disabled;
  document.querySelector("#remove-reflection").disabled = settings.reflections.length <= 1;

  if (!reflection) return;
  document.querySelector("#custom-reflection-color").value = reflection.color;
  document.querySelector("#reflection-shape").value = reflection.shape || "soft";
  document.querySelector("#reflection-depth").value = String(reflection.y);
  document.querySelector("#reflection-radius").value = String(reflection.radius);
  attachSelectedReflectionManipulator();

  if (!options.keepFocus) select.focus({ preventScroll: true });
}

function attachSelectedReflectionManipulator() {
  if (!selectedManipulatorObject?.userData.customReflection) return;
  attachReflectionManipulatorByIndex(settings.selectedReflection);
}

function attachReflectionManipulatorByIndex(index) {
  const object = reflectionRig.children.find(
    (child) => child.userData.customReflection && child.userData.reflectionIndex === index,
  );
  if (object) {
    selectedManipulatorObject = object;
    transformControls.attach(object);
  }
}

function addReflection() {
  const palette = ["#ff2b42", "#57ff8b", "#4ab3ff", "#ffd766", "#ff66d8", "#ffffff"];
  const index = settings.reflections.length;
  settings.reflections.push({
    color: palette[index % palette.length],
    shape: index % 2 === 0 ? "facet" : "soft",
    x: ((index % 3) - 1) * 0.12,
    y: -0.06 + (index % 4) * 0.04,
    z: (index % 2 === 0 ? 1 : -1) * 0.1,
    radius: 0.064,
  });
  settings.selectedReflection = settings.reflections.length - 1;
  buildGemOpticalEffect();
  syncReflectionEditor();
}

function removeReflection() {
  if (settings.reflections.length <= 1) return;
  settings.reflections.splice(settings.selectedReflection, 1);
  settings.selectedReflection = Math.max(0, settings.selectedReflection - 1);
  buildGemOpticalEffect();
  syncReflectionEditor();
}

function moveSelectedReflection(payload) {
  const reflection = getSelectedReflection();
  if (!reflection) return;
  const [axis, rawDirection] = payload.split(":");
  const direction = Number(rawDirection);
  const step = axis === "y" ? 0.025 : 0.035;
  reflection[axis] = THREE.MathUtils.clamp(reflection[axis] + direction * step, -0.34, 0.34);
  if (axis === "y") {
    reflection.y = THREE.MathUtils.clamp(reflection.y, -0.26, 0.24);
    document.querySelector("#reflection-depth").value = String(reflection.y);
  }
  updateGemOpticalEffect();
}

function resizeSelectedReflection(direction) {
  const reflection = getSelectedReflection();
  if (!reflection) return;
  const step = reflection.radius < 0.18 ? 0.01 : reflection.radius < 0.42 ? 0.025 : 0.05;
  reflection.radius = THREE.MathUtils.clamp(reflection.radius + direction * step, 0.01, 0.75);
  document.querySelector("#reflection-radius").value = String(reflection.radius);
  updateGemOpticalEffect();
}

function getEditableObjectAtPointer(event) {
  const bounds = renderer.domElement.getBoundingClientRect();
  if (!bounds.width || !bounds.height) return null;
  pointer.x = ((event.clientX - bounds.left) / bounds.width) * 2 - 1;
  pointer.y = -((event.clientY - bounds.top) / bounds.height) * 2 + 1;
  raycaster.setFromCamera(pointer, camera);
  const selectableObjects = editableObjects.filter(
    (object) =>
      object?.isMesh &&
      object.geometry &&
      isObjectVisibleInHierarchy(object) &&
      !object.userData.customReflection &&
      !object.userData.selectableCaustic &&
      !object.userData.spectralOffset &&
      object.parent !== reflectionRig,
  );
  return raycaster.intersectObjects(selectableObjects, false)[0]?.object || null;
}

function detectContextMaterialType(object) {
  const materials = Array.isArray(object.material) ? object.material.filter(Boolean) : [object.material].filter(Boolean);
  const material = materials[0];
  const declaredType = material?.userData?.jewelryMaterial?.type;
  if (declaredType === "gem") return "gem";
  if (declaredType === "metal") return "metal";

  const name = `${object.name || ""} ${materials.map((item) => item.name || "").join(" ")} ${object.userData?.attributes?.layer || ""}`.toLowerCase();
  const gemWords = ["gem", "stone", "pierre", "crystal", "cristal", "diamond", "diamant", "ruby", "rubis", "sapphire", "saphir", "emerald", "emeraude", "opale", "opal", "quartz", "topaz", "tourmaline", "perle", "pearl"];
  if (gemWords.some((word) => name.includes(word))) return "gem";
  if (materials.some((item) => item.transmission > 0.08 || item.ior > 1.55 || item.iridescence > 0.18)) return "gem";
  if (isLikelyGemMaterial(material, name)) return "gem";
  return "metal";
}

function getContextMaterialSwatch(type, preset, id = null) {
  if (type === "environment") return environmentVisuals[id]?.background || "linear-gradient(135deg, #050505, #d8b15f)";
  if (type === "support") return getSupportVisual(id).background || preset.color || "#2b2b2b";
  if (type === "metal") return preset.preview ? `url("${preset.preview}") center / cover` : preset.color || "#bda66d";
  return preset.texture ? `url("${preset.texture}") center / cover` : preset.color || preset.attenuation || "#d8efff";
}

function renderMaterialContextOptions() {
  const menu = document.querySelector("#material-context-menu");
  const options = document.querySelector("#material-context-options");
  const kind = document.querySelector("#material-context-kind");
  const switchButton = document.querySelector("#material-context-switch");
  if (!menu || !options || !contextMaterialObject) return;

  const targetId = contextMaterialType === "metal" ?
     "object-metal-material"
    : contextMaterialType === "gem" ?
       "object-gem-material"
      : contextMaterialType === "support" ?
         "support-material"
        : "lighting-preset";
  const rawEntries = contextMaterialType === "environment" ?
     Object.entries(lightingPresets)
    : getVisibleMaterialEntries(contextMaterialType, targetId);
  const entries = filterContextMaterialEntriesForCatalog(contextMaterialType, rawEntries, contextMaterialObject);

  if (contextMaterialType === "support") {
    kind.textContent = "Support au sol";
    switchButton.hidden = true;
  } else if (contextMaterialType === "environment") {
    kind.textContent = "Environnement studio";
    switchButton.hidden = true;
  } else {
    kind.textContent = contextMaterialType === "metal" ? "Métal détecté" : "Pierre / cristal détecté";
    switchButton.hidden = false;
    switchButton.textContent = contextMaterialType === "metal" ? "Afficher les pierres et cristaux" : "Afficher les métaux";
  }

  if (contextMaterialType === "environment") {
    const environmentButtons = Object.entries(lightingPresets).map(([id, preset]) => {
      const swatch = getContextMaterialSwatch("environment", preset, id);
      const current = document.querySelector("#lighting-preset")?.value === id ? ' aria-current="true"' : "";
      return `<button class="material-context-option" type="button" data-material-type="environment" data-material-id="${id}" style="--material-swatch:${swatch}"${current}>
        <span class="material-context-option__swatch" aria-hidden="true"></span>
        <span class="material-context-option__label">${preset.label}</span>
        <span class="material-context-option__arrow" aria-hidden="true">&rsaquo;</span>
      </button>`;
    }).join("");
    const backgroundButtons = Object.entries(backgrounds).map(([id, bg]) => {
      const visual = getBackgroundVisual(id);
      const current = settings.background === id ? ' aria-current="true"' : "";
      return `<button class="material-context-option" type="button" data-background-id="${id}" style="--material-swatch:${visual.background}"${current}>
        <span class="material-context-option__swatch" aria-hidden="true"></span>
        <span class="material-context-option__label">${bg.label || id}</span>
        <span class="material-context-option__arrow" aria-hidden="true">&rsaquo;</span>
      </button>`;
    }).join("");
    options.innerHTML = `<div class="env-context-tabs" role="tablist" aria-label="R?glages du ciel">
        <button class="is-active" type="button" data-env-tab="studio">Ambiance studio</button>
        <button type="button" data-env-tab="sky">Couleur du ciel</button>
      </div>
      <div class="env-context-panel is-active" data-env-panel="studio">${environmentButtons}</div>
      <div class="env-context-panel" data-env-panel="sky">${backgroundButtons}</div>`;
    return;
  }

  const geometrySection = contextMaterialObject?.userData?.stoneShowcase
    ? `<div class="stone-context-section">
        <div class="stone-context-section__title">Forme de pierre</div>
        <div class="stone-context-grid">
          ${Object.entries(stoneGeometryPresets).map(([id, preset]) => {
            const current = contextMaterialObject.userData.stoneGeometryId === id ? ' aria-current="true"' : "";
            return `<button class="stone-context-option" type="button" data-stone-geometry-id="${id}"${current} style="--stone-swatch:${getStoneGeometryVisual(id)}">
              <span class="stone-context-option__preview" aria-hidden="true"></span>
              <span>${preset.label}</span>
            </button>`;
          }).join("")}
        </div>
        <div class="stone-context-section__title">Diamètre</div>
        <div class="stone-context-grid stone-context-grid--diameters">
          ${stoneDiameterOptions.map((diameter) => {
            const current = settings.stoneShowcaseDiameter === diameter ? ' aria-current="true"' : "";
            return `<button class="stone-context-option stone-context-option--diameter" type="button" data-stone-diameter-mm="${diameter}"${current}>
              <span>${diameter} mm</span>
            </button>`;
          }).join("")}
        </div>
                <label class="stone-context-toggle">
          <input type="checkbox" data-stone-pedestal-toggle${settings.stoneShowcaseOnPedestal ? " checked" : ""} />
          <span>Pierre visible sur un socle</span>
        </label>
<div class="stone-context-section__title">Matière de la pierre</div>
      </div>`
    : "";

  if (!entries.length) {
    options.innerHTML = geometrySection + '<div class="catalog-empty">Aucun matériau compatible avec cette combinaison.</div>';
    return;
  }

  options.innerHTML = geometrySection + entries.map(([id, preset]) => {
    const swatch = getContextMaterialSwatch(contextMaterialType, preset, id);
    const objectPreset = contextMaterialObject?.material?.userData?.jewelryMaterial?.preset;
    const current = (
      (contextMaterialType === "support" && id === settings.supportMaterial) ||
      (contextMaterialType === "environment" && document.querySelector("#lighting-preset")?.value === id) ||
      (contextMaterialType === "gem" && objectPreset === id) ||
      (contextMaterialType === "metal" && objectPreset === id)
    )
      ? ' aria-current="true"'
      : "";
    return `<button class="material-context-option" type="button" data-material-type="${contextMaterialType}" data-material-id="${id}" style="--material-swatch:${swatch}"${current}>
      <span class="material-context-option__swatch" aria-hidden="true"></span>
      <span class="material-context-option__label">${preset.label}</span>
      <span class="material-context-option__arrow" aria-hidden="true">&rsaquo;</span>
    </button>`;
  }).join("");
}

function positionMaterialContextMenu(clientX, clientY) {
  const menu = document.querySelector("#material-context-menu");
  if (!menu) return;
  menu.hidden = false;
  menu.style.left = "0px";
  menu.style.top = "0px";
  const rect = menu.getBoundingClientRect();
  const margin = 10;
  const left = Math.min(clientX + 8, window.innerWidth - rect.width - margin);
  const top = Math.min(clientY + 8, window.innerHeight - rect.height - margin);
  menu.style.left = `${Math.max(margin, left)}px`;
  menu.style.top = `${Math.max(margin, top)}px`;
}

function closeMaterialContextMenu() {
  const menu = document.querySelector("#material-context-menu");
  if (menu) menu.hidden = true;
  contextMaterialObject = null;
}

function handleMaterialContextChoice(event) {
  const tabButton = event.target.closest("[data-env-tab]");
  if (tabButton) {
    const menu = tabButton.closest("#material-context-menu");
    menu?.querySelectorAll("[data-env-tab]").forEach((button) => button.classList.toggle("is-active", button === tabButton));
    menu?.querySelectorAll("[data-env-panel]").forEach((panel) => panel.classList.toggle("is-active", panel.dataset.envPanel === tabButton.dataset.envTab));
    return;
  }
  const backgroundButton = event.target.closest("[data-background-id]");
  if (backgroundButton && contextMaterialType === "environment") {
    applyBackground(backgroundButton.dataset.backgroundId);
    syncBackgroundButtons();
    showNotice(`${backgrounds[backgroundButton.dataset.backgroundId]?.label || "Fond"} appliqué au ciel.`);
    closeMaterialContextMenu();
    return;
  }
  const pedestalToggle = event.target.closest("[data-stone-pedestal-toggle]");
  if (pedestalToggle && contextMaterialObject?.userData?.stoneShowcase) {
    setStoneShowcasePedestal(pedestalToggle.checked);
    renderMaterialContextOptions();
    return;
  }
  const diameterButton = event.target.closest("[data-stone-diameter-mm]");
  if (diameterButton && contextMaterialObject?.userData?.stoneShowcase) {
    setStoneShowcaseDiameter(Number(diameterButton.dataset.stoneDiameterMm));
    renderMaterialContextOptions();
    return;
  }
  const geometryButton = event.target.closest("[data-stone-geometry-id]");
  if (geometryButton && contextMaterialObject?.userData?.stoneShowcase) {
    void applyStoneShowcaseGeometry(geometryButton.dataset.stoneGeometryId).then(() => renderMaterialContextOptions());
    return;
  }
  const button = event.target.closest("[data-material-type][data-material-id]");
  if (!button || !contextMaterialObject) return;
  if (button.dataset.materialType === "environment") {
    applyLightingPreset(button.dataset.materialId);
    const lightingSelect = document.querySelector("#lighting-preset");
    if (lightingSelect) lightingSelect.value = button.dataset.materialId;
    showNotice(`${lightingPresets[button.dataset.materialId]?.label || "Environnement"} appliqu\u00e9 au studio.`);
    closeMaterialContextMenu();
    return;
  }
  if (button.dataset.materialType === "support") {
    applySupportMaterial(button.dataset.materialId);
    const supportSelect = document.querySelector("#support-material");
    if (supportSelect) supportSelect.value = button.dataset.materialId;
    showNotice(`${supportPresets[button.dataset.materialId]?.label || "Support"} appliqu\u00e9 au sol.`);
    closeMaterialContextMenu();
    return;
  }
  selectSceneObject(contextMaterialObject);
  applyMaterialToSelectedObject(button.dataset.materialType, button.dataset.materialId);
  closeMaterialContextMenu();
}

function handleCanvasContextMenu(event) {
  event.preventDefault();
  canvasPointerStart = null;
  const object = getEditableObjectAtPointer(event);
  if (!object) {
    raycaster.setFromCamera(pointer, camera);
    const floorHit = floor.visible ? raycaster.intersectObject(floor, false)[0] : null;
    if (floorHit) {
      detachManipulator();
      selectSceneObject(null);
      contextMaterialObject = floor;
      contextMaterialType = "support";
      document.querySelector("#material-context-object").textContent = "Sol / support";
      renderMaterialContextOptions();
      positionMaterialContextMenu(event.clientX, event.clientY);
      return;
    }
    detachManipulator();
    selectSceneObject(null);
    contextMaterialObject = scene;
    contextMaterialType = "environment";
    document.querySelector("#material-context-object").textContent = "Ciel / environnement";
    renderMaterialContextOptions();
    positionMaterialContextMenu(event.clientX, event.clientY);
    return;
  }
  detachManipulator();
  selectSceneObject(object);
  contextMaterialObject = object;
  contextMaterialType = detectContextMaterialType(object);
  document.querySelector("#material-context-object").textContent = object.name || "Partie du mod\u00e8le";
  renderMaterialContextOptions();
  positionMaterialContextMenu(event.clientX, event.clientY);
}

function handleCanvasDoubleClick(event) {
  event.preventDefault();
  canvasPointerStart = null;
  if (transformControls.dragging) return;
  const object = getEditableObjectAtPointer(event);
  if (!object) return;
  closeMaterialContextMenu();
  detachManipulator();
  selectSceneObject(object);
  if (frameSelectedObject(object)) {
    showNotice(`Zoom sélection : ${object.name || "partie du modèle"}.`);
  }
}
function handleCanvasPointerDown(event) {
  if (event.button !== 0) return;
  canvasPointerStart = {
    x: event.clientX,
    y: event.clientY,
    time: performance.now(),
  };
}

function handleCanvasPointerUp(event) {
  if (!canvasPointerStart || event.button !== 0) {
    canvasPointerStart = null;
    return;
  }
  const distance = Math.hypot(event.clientX - canvasPointerStart.x, event.clientY - canvasPointerStart.y);
  const duration = performance.now() - canvasPointerStart.time;
  canvasPointerStart = null;
  if (distance > 7 || duration > 700 || transformControls.dragging) return;
  handleCanvasSelection(event);
}

function isObjectVisibleInHierarchy(object) {
  let current = object;
  while (current) {
    if (current.visible === false) return false;
    current = current.parent;
  }
  return true;
}

function handleCanvasSelection(event) {
  if (transformControls.dragging) return;
  if (selectedManipulatorObject && transformControls.axis) return;

  const bounds = renderer.domElement.getBoundingClientRect();
  if (!bounds.width || !bounds.height) return;
  pointer.x = ((event.clientX - bounds.left) / bounds.width) * 2 - 1;
  pointer.y = -((event.clientY - bounds.top) / bounds.height) * 2 + 1;
  raycaster.setFromCamera(pointer, camera);

  const selectableEffects = [
    ...reflectionRig.children.filter((child) => child.userData.customReflection && isObjectVisibleInHierarchy(child)),
    ...(causticPlane.visible ? [causticPlane] : []),
  ];
  const effectHits = raycaster.intersectObjects(selectableEffects, false);
  if (effectHits.length) {
    selectManipulatorObject(effectHits[0].object);
    return;
  }

  const selectableObjects = editableObjects.filter(
    (object) =>
      object?.isMesh &&
      object.geometry &&
      isObjectVisibleInHierarchy(object) &&
      !object.userData.customReflection &&
      !object.userData.selectableCaustic &&
      !object.userData.spectralOffset &&
      object.parent !== reflectionRig,
  );
  const sceneHits = raycaster.intersectObjects(selectableObjects, false);

  if (sceneHits.length) {
    detachManipulator();
    const selected = sceneHits[0].object;
    selectSceneObject(selected);
    showNotice(`Objet sélectionné : ${selected.name || selected.type}. Choisissez maintenant son mat\u00e9riau.`);
    return;
  }

  detachManipulator();
  selectSceneObject(null);
}
function selectManipulatorObject(object) {
  selectedManipulatorObject = object;
  transformControls.attach(object);
  if (object.userData.customReflection) {
    settings.selectedReflection = object.userData.reflectionIndex;
    syncReflectionEditor({ keepFocus: true });
    showNotice(`Repère du reflet ${object.userData.reflectionIndex + 1} sélectionné. Glissez le manipulateur pour déplacer la tache.`);
  } else if (object.userData.selectableCaustic) {
    showNotice("Repère de caustique sélectionné. Glissez le manipulateur pour déplacer la projection lumineuse.");
  }
}

function detachManipulator() {
  selectedManipulatorObject = null;
  transformControls.detach();
}

function selectSceneObject(object) {
  clearStemDecalSelection();
  selectedSceneObject = object;
  const label = document.querySelector("#selected-object-name");
  const select = document.querySelector("#object-select");
  if (!object) {
    label.textContent = "Aucun objet";
    if (select) select.value = "";
    return;
  }
  if (select) select.value = object.uuid;
  const materialName = Array.isArray(object.material) ?
     object.material.map((mat) => mat.name || "mat\u00e9riau").join(", ")
    : object.material?.name || "mat\u00e9riau sans nom";
  label.textContent = `${object.name || object.type} - ${materialName}`;
}

function applyMaterialToSelectedObject(type, id) {
  if (!selectedSceneObject?.isMesh) {
    showNotice("Sélectionnez d’abord une partie du bijou dans le dessin.");
    return;
  }

  if (type === "metal") {
    const material = makeMetalMaterialFromPreset(id, `Objet - ${metalPresets[id]?.label || "métal"}`);
    applySingleMaterialToMesh(selectedSceneObject, material);
    selectedSceneObject.userData.classicPlugRole = "metal";
    if (centerGemMesh === selectedSceneObject) {
      centerGemMesh = null;
      reflectionRig.clear();
    }
    showNotice(`${metalPresets[id]?.label || "Métal"} appliqué à l’objet sélectionné.`);
  } else {
    if (selectedSceneObject.userData?.stoneShowcase) {
      applyStoneShowcaseMaterial(id);
      return;
    }
    const material = makeGemMaterialFromPreset(id);
    applySingleMaterialToMesh(selectedSceneObject, material, { keepOpticalSettings: true });
    selectedSceneObject.userData.classicPlugRole = "gem";
    centerGemMesh = selectedSceneObject;
    applyGemPreset(id, { updateSelectedMaterial: false });
    scheduleDiamondInternalRayTracing(selectedSceneObject, "matériau pierre OBJ/GLB");
    showNotice(`${gemPresets[id]?.label || "Pierre"} appliquée à la pierre sélectionnée.`);
  }

  selectSceneObject(selectedSceneObject);
  if (type === "gem") buildGemOpticalEffect();
}

function commitManipulatorPosition() {
  const object = selectedManipulatorObject;
  if (!object) return;

  if (object.userData.customReflection && centerGemMesh) {
    const reflection = settings.reflections[object.userData.reflectionIndex];
    if (!reflection) return;
    reflection.x = THREE.MathUtils.clamp(object.position.x - centerGemMesh.position.x, -0.34, 0.34);
    reflection.y = THREE.MathUtils.clamp(object.position.y - centerGemMesh.position.y, -0.26, 0.24);
    reflection.z = THREE.MathUtils.clamp(object.position.z - centerGemMesh.position.z, -0.34, 0.34);
    syncReflectionEditor({ keepFocus: true });
  }
}

function syncBackgroundButtons() {
  document.querySelectorAll("[data-bg]").forEach((button) => {
    button.classList.toggle("is-active", button.dataset.bg === settings.background);
  });
}

function applyBackground(name) {
  const bg = backgrounds[name] || backgrounds.black;
  settings.background = backgrounds[name] ? name : "black";
  scene.background = bg.color;
  scene.fog.color.copy(bg.fog);
  if (settings.supportMaterial === "legacy-background") {
    floorMaterial.color.copy(bg.floor);
  }
  syncBackgroundButtons();
}

function applySupportMaterial(id) {
  const preset = supportPresets[id] || supportPresets["velvet-black"];
  settings.supportMaterial = id;
  floor.visible = !preset.hidden;
  floor.receiveShadow = !preset.hidden;
  if (preset.hidden) {
    softStudioShadow.visible = false;
    floorMaterial.map = null;
    floorMaterial.roughnessMap = null;
    floorMaterial.normalMap = null;
    floorMaterial.needsUpdate = true;
    logDebug("support", "Support masque", preset);
    return;
  }
  const maps = getSupportTextureSet(id, preset);
  floorMaterial.bumpMap = null;
  floorMaterial.displacementMap = null;
  floorMaterial.color.set(maps.map ? "#ffffff" : preset.color);
  floorMaterial.roughness = preset.roughness;
  floorMaterial.metalness = preset.metalness;
  floorMaterial.envMapIntensity = preset.env;
  floorMaterial.sheen = preset.sheen;
  floorMaterial.sheenColor = new THREE.Color(preset.sheenColor);
  floorMaterial.map = maps.map;
  floorMaterial.roughnessMap = maps.roughnessMap;
  floorMaterial.normalMap = maps.normalMap;
  floorMaterial.normalScale.setScalar(
    preset.normalStrength ?? (preset.family === "velvet" ? 0.06 : preset.family === "wood" ? 0.045 : preset.family === "stone" ? 0.18 : 0.14)
  );
  floorMaterial.clearcoat = preset.clearcoat ?? (preset.metalness > 0 ? 0.6 : preset.family === "marble" ? 0.32 : preset.family === "wood" ? 0.28 : 0.05);
  floorMaterial.clearcoatRoughness = preset.clearcoatRoughness ?? (preset.family === "marble" ? 0.18 : preset.family === "wood" ? 0.24 : 0.45);
  floorMaterial.needsUpdate = true;
  logDebug("support", `Support applique : ${preset.label}`, preset);
}

function getSupportTextureSet(id, preset) {
  const macroRepeat = getSupportMacroRepeat(preset);
  const cacheId = [
    SUPPORT_TEXTURE_VERSION,
    id,
    preset.family || "support",
    preset.textureStyle || "default",
    preset.color || "",
    preset.accent || "",
    preset.grain || "",
    preset.normalStrength ?? "",
    preset.textureMacroScale ?? 1,
    shouldUseSupportImageTexture(preset) && preset.texture ? preset.texture : "procedural",
    JSON.stringify(macroRepeat),
  ].join(":");
  if (supportTextureCache.has(cacheId)) return supportTextureCache.get(cacheId);
  const size = getSupportTextureSize(preset.family);
  const useImageTexture = shouldUseSupportImageTexture(preset) && Boolean(preset.texture);
  const map = useImageTexture
    ? makeOpaqueSupportImageTexture(size, preset)
    : makeSupportCanvasTexture(size, preset, "color");
  const roughnessMap = makeSupportCanvasTexture(size, preset, "roughness");
  const normalMap = makeSupportCanvasTexture(size, preset, "normal");
  [map, roughnessMap, normalMap].forEach((texture) => configureSupportTexture(texture, preset, texture === map));
  const set = { map, roughnessMap, normalMap };
  supportTextureCache.set(cacheId, set);
  return set;
}


function makeOpaqueSupportImageTexture(size, preset) {
  const texture = makeSupportCanvasTexture(size, preset, "color");
  const canvas = texture.image;
  const ctx = canvas.getContext("2d");
  const image = new Image();
  image.crossOrigin = "anonymous";
  image.onload = () => {
    const source = getSupportImageCrop(image);
    ctx.save();
    ctx.globalAlpha = getSupportImageBlend(preset.family);
    ctx.globalCompositeOperation = "source-over";
    ctx.drawImage(image, source.x, source.y, source.w, source.h, 0, 0, size, size);
    ctx.restore();
    sealSupportTextureEdges(ctx, size, preset);
    texture.needsUpdate = true;
    floorMaterial.needsUpdate = true;
  };
  image.onerror = () => logDebug("support", `Texture de support introuvable : ${preset.texture}`);
  image.src = preset.texture;
  return texture;
}

function getSupportImageCrop(image) {
  const margin = Math.round(Math.min(image.width, image.height) * 0.08);
  return {
    x: margin,
    y: margin,
    w: Math.max(1, image.width - margin * 2),
    h: Math.max(1, image.height - margin * 2),
  };
}

function getSupportImageBlend(family) {
  if (family === "wood") return 0.78;
  if (family === "marble") return 0.66;
  if (family === "stone") return 0.55;
  if (family === "velvet") return 0.42;
  if (family === "leather") return 0.58;
  return 0.6;
}

function sealSupportTextureEdges(ctx, size, preset) {
  const image = ctx.getImageData(0, 0, size, size);
  const base = new THREE.Color(preset.color || "#777777");
  const fallback = [base.r * 255, base.g * 255, base.b * 255];
  for (let i = 0; i < image.data.length; i += 4) {
    const a = image.data[i + 3];
    const isVeryDark = image.data[i] + image.data[i + 1] + image.data[i + 2] < 12;
    if (a < 250 || isVeryDark) {
      const t = a / 255;
      image.data[i] = Math.round(fallback[0] * (1 - t) + image.data[i] * t);
      image.data[i + 1] = Math.round(fallback[1] * (1 - t) + image.data[i + 1] * t);
      image.data[i + 2] = Math.round(fallback[2] * (1 - t) + image.data[i + 2] * t);
      image.data[i + 3] = 255;
    }
  }
  ctx.putImageData(image, 0, 0);
}

function configureSupportTexture(texture, preset, isColorMap = false) {
  const singleSlab = isSingleSlabSupport(preset);
  texture.wrapS = singleSlab ? THREE.ClampToEdgeWrapping : THREE.RepeatWrapping;
  texture.wrapT = singleSlab ? THREE.ClampToEdgeWrapping : THREE.RepeatWrapping;
  const repeat = getSupportMacroRepeat(preset);
  texture.repeat.set(repeat[0], repeat[1]);
  texture.offset.set(0, 0);
  texture.rotation = singleSlab ? (preset.slabRotation || 0) : (preset.textureRotation || 0);
  texture.center.set(0.5, 0.5);
  texture.anisotropy = 16;
  texture.minFilter = THREE.LinearMipmapLinearFilter;
  texture.magFilter = THREE.LinearFilter;
  texture.colorSpace = isColorMap ? THREE.SRGBColorSpace : THREE.NoColorSpace;
  texture.needsUpdate = true;
}

// --- Calibrage de l'echelle des textures de support (sol Ø16) au zoom sur le bijou ---
// Les repetitions de base ci-dessous sont pensees pour le sol entier ; comme le bijou
// n'occupe que ~2.7 unites (voir targetSize du fitting), les motifs (veines de marbre,
// grain de bois, tissage...) paraissent geants quand on zoome dessus. On densifie donc
// les textures. SUPPORT_TEXTURE_DENSITY = reglage global (monter = plus fin). Les
// facteurs par famille rattrapent les mati\u00e8res les plus grossières (marbre, metal...).
const SUPPORT_TEXTURE_DENSITY = 1.35;
const SUPPORT_FAMILY_DENSITY = {
  marble: 2.4,
  metal: 1.8,
  stone: 1.5,
  leather: 1.35,
  velvet: 1.25,
  wood: 1.05,
  none: 1,
};

function getSupportMacroRepeat(preset = {}) {
  if (isSingleSlabSupport(preset)) return [1, 1];
  const family = preset.family || "stone";
  const explicit = preset.textureRepeat || getSupportTextureRepeat(family);
  const style = preset.textureStyle || "";
  let target;
  if (family === "wood") target = style === "luxury-wood" ? [9.5, 3.8] : [8.2, 3.2];
  else if (family === "marble") target = style === "calacatta" || style === "onyx" ? [2.2, 2.2] : [2.65, 2.65];
  else if (family === "stone") target = style === "travertine" ? [3.2, 2.45] : style === "brushed-stone" ? [4.6, 2.4] : [4.4, 4.4];
  else if (family === "velvet") target = style === "ribbed-velvet" ? [5.2, 3.4] : [5.6, 5.6];
  else if (family === "leather") target = style === "full-grain" ? [6.8, 6.8] : [5.8, 5.8];
  else if (family === "metal") target = [2.4, 2.4];
  else target = [1.8, 1.8];
  // Densite finale = base * reglage global * facteur famille * override eventuel du preset.
  const zoom = SUPPORT_TEXTURE_DENSITY * (SUPPORT_FAMILY_DENSITY[family] ?? 1.2) * (preset.textureMacroScale ?? 1);
  return [
    Math.max((explicit[0] || 1) * zoom, target[0] * zoom),
    Math.max((explicit[1] || 1) * zoom, target[1] * zoom),
  ];
}

function getSupportTextureRepeat(family) {
  if (family === "wood") return [3.2, 1.6];
  if (family === "marble") return [1.15, 1.15];
  if (family === "velvet") return [2.4, 2.4];
  if (family === "stone") return [1.6, 1.6];
  if (family === "leather") return [2.2, 2.2];
  if (family === "metal") return [1.0, 1.0];
  return [1, 1];
}

function getSupportTextureSize(family) {
  if (family === "wood" || family === "marble") return 1024;
  if (family === "stone" || family === "leather" || family === "velvet") return 768;
  return 512;
}
function supportVeinLine(u, v, angle, offset, width, wobble, seed, power = 1.6) {
  const cu = u - 0.5;
  const cv = v - 0.5;
  const c = Math.cos(angle);
  const sn = Math.sin(angle);
  const across = cu * c + cv * sn + offset;
  const along = -cu * sn + cv * c;
  const undulation = Math.sin(along * 7.0 + seed) * wobble + (supportFractalNoise(along * 2.2 + seed, across * 3.4 - seed, 3) - 0.5) * wobble * 1.4;
  const d = Math.abs(across + undulation);
  return Math.pow(1.0 - THREE.MathUtils.smoothstep(width, width * 4.2, d), power);
}

function sampleFlatStoneSlab(preset, base, accent, grainColor, u, v, fine, soft, broad) {
  const style = preset.textureStyle || "honed-stone-slab";
  const labelKey = normalizeSupportLabel(preset.label || "");
  const isGranite = style.includes("granite") || labelKey.includes("granit");
  const isSlate = style.includes("slate") || labelKey.includes("ardoise");
  const isTravertine = style.includes("travertine") || labelKey.includes("travertin");
  const isPlaster = style.includes("plaster") || labelKey.includes("platre");
  const cloud = supportFractalNoise(u * 2.0 + 4.0, v * 1.8 + 7.0, 5);
  const mineral = supportFractalNoise(u * 8.0 + 1.0, v * 7.0 + 3.0, 4);
  const micro = supportFractalNoise(u * 52.0 + 8.0, v * 48.0 + 2.0, 2);
  const slowVein = supportVeinLine(u, v, isTravertine ? 1.55 : 0.76, -0.08, isTravertine ? 0.028 : 0.012, 0.032, 6.3, 1.4);
  const hair = supportVeinLine(u, v, isTravertine ? 1.48 : 1.03, 0.22, isTravertine ? 0.012 : 0.0045, 0.018, 13.1, 1.7);
  const speckle = isGranite ? Math.pow(fine, 3.2) * 0.75 + Math.pow(micro, 6.0) * 0.45 : Math.pow(micro, 5.5) * 0.22;
  const satin = THREE.MathUtils.clamp(cloud * 0.45 + mineral * 0.35 + soft * 0.16, 0, 1);
  const sediment = isTravertine ? Math.pow(1.0 - Math.abs(Math.sin((v * 5.2 + broad * 0.7) * Math.PI)), 3.2) : 0;
  let color = base.clone()
    .lerp(accent, THREE.MathUtils.clamp(satin * (isSlate ? 0.24 : 0.36) + slowVein * 0.22 + sediment * 0.16, 0, 0.58))
    .lerp(grainColor, THREE.MathUtils.clamp(hair * 0.22 + speckle * 0.24 + mineral * 0.08, 0, isGranite ? 0.42 : 0.28));
  if (isSlate) color.lerp(new THREE.Color("#0b0d0e"), THREE.MathUtils.clamp((1 - cloud) * 0.18, 0, 0.2));
  if (isPlaster) color.lerp(new THREE.Color("#f1eadb"), THREE.MathUtils.clamp(cloud * 0.1, 0, 0.16));
  const pattern = THREE.MathUtils.clamp(satin * 0.45 + slowVein * 0.24 + hair * 0.2 + speckle * 0.3 + sediment * 0.22, 0, 1);
  const bump = THREE.MathUtils.clamp(micro * 0.08 + slowVein * 0.05 + hair * 0.08 + speckle * 0.06 + sediment * 0.04, 0, 1);
  const roughnessValue = Math.round((isSlate ? 188 : isTravertine ? 206 : 176) + pattern * 36 + micro * 10);
  return {
    pattern,
    bump,
    color,
    roughnessValue,
    normalX: 128 + (micro - 0.5) * 4 + (hair - 0.5) * 2,
    normalY: 128 + (bump - 0.5) * 8 + (slowVein - 0.5) * 2,
  };
}

function sampleSingleSlabMarble(preset, base, accent, grainColor, u, v, fine, soft, broad) {
  const style = preset.textureStyle || "calacatta";
  const isDark = style === "nero" || base.r + base.g + base.b < 0.22;
  const isOnyx = style === "onyx";
  const cloud = supportFractalNoise(u * 2.1 + 9.0, v * 1.7 + 4.0, 5);
  const mist = supportFractalNoise(u * 5.0 + 12.0, v * 4.2 + 2.0, 4);
  const main = Math.max(
    supportVeinLine(u, v, 0.82, -0.18, isDark ? 0.012 : 0.018, 0.045, 1.4, isDark ? 1.35 : 1.15),
    supportVeinLine(u, v, 0.94, 0.22, isDark ? 0.009 : 0.015, 0.038, 5.2, 1.2),
    supportVeinLine(u, v, 0.54, 0.03, isDark ? 0.005 : 0.01, 0.026, 8.8, 1.5)
  );
  const hair = Math.max(
    supportVeinLine(u, v, 0.76, -0.03, 0.0038, 0.018, 11.2, 1.8),
    supportVeinLine(u, v, 1.18, 0.12, 0.0035, 0.016, 17.7, 1.7),
    supportVeinLine(u, v, 0.38, -0.29, 0.003, 0.012, 23.9, 1.9)
  );
  const mineral = supportVeinLine(u, v, 0.88, -0.2, 0.0025, 0.01, 31.5, 1.4) * (0.45 + fine * 0.55);
  const satin = THREE.MathUtils.clamp(0.28 + cloud * 0.42 + soft * 0.18, 0, 1);
  const veinColor = isDark ? accent.clone().lerp(new THREE.Color("#ffffff"), 0.28) : accent.clone();
  let color = base.clone()
    .lerp(veinColor, THREE.MathUtils.clamp(main * (isDark ? 0.78 : 0.62) + hair * 0.42 + mist * 0.05, 0, isDark ? 0.92 : 0.76))
    .lerp(grainColor, THREE.MathUtils.clamp(mineral * (isDark ? 0.58 : 0.28) + cloud * 0.08, 0, isDark ? 0.42 : 0.22));
  if (style === "verde") color.lerp(new THREE.Color("#d8c78f"), THREE.MathUtils.clamp(hair * 0.16, 0, 0.18));
  if (style === "rosa") color.lerp(new THREE.Color("#fff1e2"), THREE.MathUtils.clamp(main * 0.18 + mist * 0.08, 0, 0.24));
  if (style === "champagne") color.lerp(new THREE.Color("#ffe2a6"), THREE.MathUtils.clamp(main * 0.22, 0, 0.24));
  if (isOnyx) color.lerp(new THREE.Color("#ffd98a"), THREE.MathUtils.clamp(hair * 0.28 + satin * 0.08, 0, 0.24));
  const pattern = THREE.MathUtils.clamp(main * 0.72 + hair * 0.56 + mineral * 0.36 + mist * 0.1, 0, 1);
  const bump = THREE.MathUtils.clamp(main * 0.2 + hair * 0.34 + mineral * 0.16 + mist * 0.04, 0, 1);
  const roughnessValue = Math.round((isDark ? 48 : isOnyx ? 42 : 58) + satin * 18 + mist * 16 - main * 10);
  return {
    pattern,
    bump,
    color,
    roughnessValue,
    normalX: 128 + (hair - 0.5) * 8 + (cloud - 0.5) * 5,
    normalY: 128 + (bump - 0.5) * 18 + (main - 0.5) * 6,
  };
}


function makeSupportCanvasTexture(size, preset, channel) {
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d");
  const base = new THREE.Color(preset.color);
  const accent = new THREE.Color(preset.accent || preset.sheenColor || preset.color);
  const grainColor = preset.grain ? new THREE.Color(preset.grain) : base.clone().multiplyScalar(0.38);
  const image = ctx.createImageData(size, size);
  const family = preset.family || "stone";

  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      const u = x / size;
      const v = y / size;
      const fine = supportNoise(u * 211.7, v * 197.3);
      const soft = supportFractalNoise(u * 7.0, v * 7.0, 4);
      const broad = supportFractalNoise(u * 2.3, v * 2.3, 3);
      let pattern = soft;
      let bump = soft;
      let color = base.clone();
      let roughnessValue = 185;
      let normalX = 128 + (fine - 0.5) * 12;
      let normalY = 128 + (bump - 0.5) * 22;

      if (family === "wood") {
        if (preset.textureStyle === "luxury-wood") {
          const flow = v + Math.sin(u * 5.0 + broad * 3.0) * 0.026 + supportFractalNoise(u * 2.2, v * 4.0, 4) * 0.035;
          const annual = Math.pow(1.0 - Math.abs(Math.sin((flow * 18.0 + fine * 0.12) * Math.PI)), 5.5);
          const microFibers = Math.pow(Math.abs(Math.sin((u * 720.0 + flow * 42.0 + fine * 5.0) * Math.PI)), 18.0);
          const openPores = Math.pow(supportNoise(u * 310.0, v * 75.0), 10.0);
          const rib = Math.pow(Math.abs(Math.sin(u * 44.0 * Math.PI)), 14.0);
          pattern = THREE.MathUtils.clamp(annual * 0.36 + microFibers * 0.18 + openPores * 0.1 + rib * 0.16 + broad * 0.1, 0, 1);
          bump = THREE.MathUtils.clamp(annual * 0.16 + microFibers * 0.28 + openPores * 0.26 + rib * 0.22, 0, 1);
          color = base.clone()
            .lerp(accent, THREE.MathUtils.clamp(annual * 0.52 + broad * 0.2, 0, 0.78))
            .lerp(grainColor, THREE.MathUtils.clamp(microFibers * 0.24 + openPores * 0.48 + rib * 0.18, 0, 0.5));
          roughnessValue = Math.round(96 + pattern * 54 + openPores * 34);
          normalX = 128 + (rib - 0.5) * 18 + (fine - 0.5) * 8;
          normalY = 128 + (bump - 0.5) * 28;
        } else {
        const boardCount = 4.0;
        const boardIndex = Math.floor(u * boardCount);
        const boardU = u * boardCount - boardIndex;
        const boardTone = supportNoise(boardIndex * 13.13, 8.41) * 0.18 - 0.05;
        const flow = v + Math.sin(v * 8.0 + boardIndex * 1.7) * 0.018 + supportFractalNoise(u * 4.0, v * 2.0, 3) * 0.035;
        const ringWave = Math.sin((flow * 15.0 + Math.sin(u * 9.0) * 0.55 + broad * 2.4) * Math.PI);
        const annual = Math.pow(Math.abs(ringWave), 2.15);
        const darkRing = Math.pow(1.0 - Math.abs(ringWave), 8.5);
        const fibers = Math.pow(Math.abs(Math.sin((u * 520.0 + flow * 20.0 + fine * 8.0) * Math.PI)), 20.0);
        const pores = Math.pow(fine, 7.0);
        const seam = 1.0 - THREE.MathUtils.smoothstep(Math.min(boardU, 1.0 - boardU), 0.003, 0.02);
        const knotDistance = Math.hypot((boardU - 0.54) * 1.7, ((flow * 2.5) % 1.0) - 0.5);
        const knot = Math.pow(Math.max(0, 1.0 - knotDistance * 3.2), 2.0) * supportNoise(boardIndex * 5.7, Math.floor(flow * 2.5));
        pattern = THREE.MathUtils.clamp(annual * 0.28 + darkRing * 0.34 + fibers * 0.12 + pores * 0.03 + knot * 0.28 + seam * 0.22 + boardTone, 0, 1);
        bump = THREE.MathUtils.clamp(darkRing * 0.24 + fibers * 0.18 + knot * 0.14 + seam * 0.12, 0, 1);
        color = base.clone()
          .lerp(accent, THREE.MathUtils.clamp(annual * 0.48 + broad * 0.24 + boardTone + 0.12, 0, 0.88))
          .lerp(grainColor, THREE.MathUtils.clamp(darkRing * 0.42 + fibers * 0.18 + knot * 0.36 + seam * 0.34, 0, 0.56));
        roughnessValue = Math.round(112 + pattern * 42 + fibers * 18 + seam * 18);
        normalX = 128 + (fine - 0.5) * 8;
        normalY = 128 + (bump - 0.5) * 16;
        }
      } else if (family === "marble") {
        if (isSingleSlabSupport(preset)) {
          const slab = sampleSingleSlabMarble(preset, base, accent, grainColor, u, v, fine, soft, broad);
          pattern = slab.pattern;
          bump = slab.bump;
          color = slab.color;
          roughnessValue = slab.roughnessValue;
          normalX = slab.normalX;
          normalY = slab.normalY;
        } else if (preset.textureStyle === "calacatta" || preset.textureStyle === "onyx") {
          const sweep = u * 2.2 + v * 1.25 + supportFractalNoise(u * 1.8, v * 1.8, 4) * 1.5;
          const mainVein = Math.pow(1.0 - Math.abs(Math.sin(sweep * Math.PI)), preset.textureStyle === "onyx" ? 2.2 : 9.0);
          const goldVein = Math.pow(1.0 - Math.abs(Math.sin((sweep * 3.6 + fine * 0.2) * Math.PI)), 24.0);
          const translucentBand = Math.pow(1.0 - Math.abs(Math.sin((u * 1.3 - v * 2.4 + broad) * Math.PI)), 3.0);
          const cloud = supportFractalNoise(u * 4.0 + 5.0, v * 4.0, 4);
          pattern = THREE.MathUtils.clamp(mainVein * 0.7 + goldVein * 0.9 + cloud * 0.14 + translucentBand * 0.18, 0, 1);
          bump = THREE.MathUtils.clamp(mainVein * 0.22 + goldVein * 0.32, 0, 1);
          color = base.clone()
            .lerp(accent, THREE.MathUtils.clamp((preset.textureStyle === "onyx" ? translucentBand * 0.52 : mainVein * 0.72) + cloud * 0.08, 0, 0.88))
            .lerp(grainColor, THREE.MathUtils.clamp(goldVein * 0.74 + mainVein * 0.18, 0, 0.72));
          roughnessValue = Math.round((preset.textureStyle === "onyx" ? 42 : 58) + cloud * 26 + goldVein * 24);
          normalX = 128 + (cloud - 0.5) * 7;
          normalY = 128 + (bump - 0.5) * 16;
        } else {
        const flow = u * 3.4 + v * 1.85 + supportFractalNoise(u * 2.4, v * 2.4, 4) * 1.35;
        const wideVein = Math.pow(1.0 - Math.abs(Math.sin(flow * Math.PI)), 7.0);
        const hairline = Math.pow(1.0 - Math.abs(Math.sin((flow * 2.8 + fine * 0.35) * Math.PI)), 22.0);
        const cloud = supportFractalNoise(u * 5.2 + 3.0, v * 5.2, 4);
        pattern = THREE.MathUtils.clamp(wideVein * 0.58 + hairline * 0.78 + cloud * 0.12, 0, 1);
        bump = THREE.MathUtils.clamp(wideVein * 0.28 + hairline * 0.36, 0, 1);
        color = base.clone()
          .lerp(accent, THREE.MathUtils.clamp(pattern * 0.82 + cloud * 0.08, 0, 0.9))
          .lerp(base.clone().multiplyScalar(0.58), THREE.MathUtils.clamp(wideVein * 0.22, 0, 0.28));
        roughnessValue = Math.round(70 + cloud * 28 + hairline * 34);
        normalX = 128 + (cloud - 0.5) * 8;
        normalY = 128 + (bump - 0.5) * 18;
        }
      } else if (family === "stone" && isSingleSlabSupport(preset)) {
        const slab = sampleFlatStoneSlab(preset, base, accent, grainColor, u, v, fine, soft, broad);
        pattern = slab.pattern;
        bump = slab.bump;
        color = slab.color;
        roughnessValue = slab.roughnessValue;
        normalX = slab.normalX;
        normalY = slab.normalY;
      } else if (family === "stone" && preset.textureStyle === "travertine") {
        const flow = v + Math.sin(u * 2.8 + broad * 2.0) * 0.035 + supportFractalNoise(u * 1.6, v * 3.8, 4) * 0.075;
        const sediment = Math.pow(1.0 - Math.abs(Math.sin(flow * 11.0 * Math.PI)), 5.8);
        const softBand = Math.pow(1.0 - Math.abs(Math.sin((flow * 5.5 + broad * 0.8) * Math.PI)), 2.4);
        const hairVein = Math.pow(1.0 - Math.abs(Math.sin((u * 1.15 + v * 1.75 + broad * 1.6) * Math.PI)), 16.0);
        const poreNoise = supportNoise(u * 420.0, v * 390.0);
        const pores = Math.pow(poreNoise, 9.0) * supportFractalNoise(u * 42.0, v * 42.0, 2);
        const mineralCloud = supportFractalNoise(u * 5.0 + 8.0, v * 4.0, 4);
        pattern = THREE.MathUtils.clamp(sediment * 0.34 + softBand * 0.18 + hairVein * 0.18 + mineralCloud * 0.18 + pores * 0.28, 0, 1);
        bump = THREE.MathUtils.clamp(pores * 0.34 + sediment * 0.12 + hairVein * 0.1, 0, 1);
        color = base.clone()
          .lerp(accent, THREE.MathUtils.clamp(softBand * 0.34 + mineralCloud * 0.22, 0, 0.58))
          .lerp(grainColor, THREE.MathUtils.clamp(sediment * 0.22 + hairVein * 0.3 + pores * 0.38, 0, 0.44));
        roughnessValue = Math.round(198 + pattern * 36 + pores * 20);
        normalX = 128 + (mineralCloud - 0.5) * 10 + (hairVein - 0.5) * 4;
        normalY = 128 + (bump - 0.5) * 24;
      } else if (family === "stone" && preset.textureStyle === "brushed-stone") {
        const brush = Math.pow(Math.abs(Math.sin((u * 180.0 + broad * 2.0) * Math.PI)), 8.0);
        const mineral = supportFractalNoise(u * 9.0, v * 7.0, 4);
        const pores = Math.pow(fine, 6.5);
        const softVein = Math.pow(1.0 - Math.abs(Math.sin((v * 6.0 + mineral * 1.3) * Math.PI)), 4.0);
        pattern = THREE.MathUtils.clamp(brush * 0.32 + mineral * 0.26 + pores * 0.22 + softVein * 0.16, 0, 1);
        bump = THREE.MathUtils.clamp(brush * 0.28 + pores * 0.32 + softVein * 0.08, 0, 1);
        color = base.clone().lerp(accent, THREE.MathUtils.clamp(mineral * 0.36 + softVein * 0.2, 0, 0.58)).lerp(grainColor, THREE.MathUtils.clamp(pores * 0.28, 0, 0.32));
        roughnessValue = Math.round(210 + pattern * 32);
        normalX = 128 + (brush - 0.5) * 18;
        normalY = 128 + (bump - 0.5) * 30;
      } else if (family === "stone") {
        const strata = Math.pow(Math.abs(Math.sin((v * 18.0 + broad * 3.2) * Math.PI)), 2.4);
        const pores = Math.pow(fine, 4.2);
        const chips = Math.pow(supportFractalNoise(u * 32.0, v * 32.0, 2), 5.0);
        pattern = THREE.MathUtils.clamp(soft * 0.46 + strata * 0.22 + pores * 0.2 + chips * 0.24, 0, 1);
        bump = THREE.MathUtils.clamp(pores * 0.42 + chips * 0.38 + strata * 0.16, 0, 1);
        color = base.clone().lerp(accent, THREE.MathUtils.clamp(pattern * 0.52 + broad * 0.12, 0, 0.64));
        roughnessValue = Math.round(185 + pattern * 48);
        normalX = 128 + (fine - 0.5) * 22;
        normalY = 128 + (bump - 0.5) * 50;
      } else if (family === "velvet") {
        if (preset.textureStyle === "ribbed-velvet") {
          const ribs = Math.pow(Math.max(0, Math.sin(u * 72.0 * Math.PI + broad * 1.4)), 2.4);
          const nap = Math.pow(Math.max(0, Math.sin((u * 0.7 + v * 1.4) * 42.0 + broad * 7.0)), 2.2);
          const fuzz = supportFractalNoise(u * 90.0, v * 90.0, 3);
          pattern = THREE.MathUtils.clamp(ribs * 0.54 + nap * 0.28 + fuzz * 0.12, 0, 1);
          bump = THREE.MathUtils.clamp(ribs * 0.34 + fuzz * 0.16, 0, 1);
          color = base.clone().lerp(accent, THREE.MathUtils.clamp(nap * 0.5 + ribs * 0.18, 0, 0.66));
          roughnessValue = Math.round(224 + pattern * 26);
          normalX = 128 + (ribs - 0.5) * 28;
          normalY = 128 + (bump - 0.5) * 18;
        } else {
        const direction = u * 0.85 + v * 1.15;
        const nap = Math.pow(Math.max(0, Math.sin(direction * 52.0 + broad * 5.0)), 2.0);
        const weave = Math.pow(Math.abs(Math.sin(u * 210.0 * Math.PI)), 10.0) * 0.5 + Math.pow(Math.abs(Math.sin(v * 180.0 * Math.PI)), 10.0) * 0.5;
        pattern = THREE.MathUtils.clamp(nap * 0.48 + weave * 0.22 + soft * 0.18, 0, 1);
        bump = THREE.MathUtils.clamp(weave * 0.22 + nap * 0.1, 0, 1);
        color = base.clone().lerp(accent, THREE.MathUtils.clamp(nap * 0.46 + broad * 0.12, 0, 0.62));
        roughnessValue = Math.round(214 + pattern * 34);
        normalX = 128 + (weave - 0.5) * 8;
        normalY = 128 + (bump - 0.5) * 16;
        }
      } else if (family === "leather") {
        if (preset.textureStyle === "full-grain") {
          const cellA = Math.abs(Math.sin((u * 115.0 + broad * 5.0) * Math.PI) * Math.sin((v * 108.0 + soft * 4.0) * Math.PI));
          const cellB = Math.abs(Math.sin((u * 61.0 - v * 74.0 + fine * 2.0) * Math.PI));
          const wrinkles = Math.pow(1.0 - Math.abs(Math.sin((u * 3.4 + v * 2.7 + broad * 2.3) * Math.PI)), 12.0);
          const pores = Math.pow(fine, 8.0);
          pattern = THREE.MathUtils.clamp(cellA * 0.38 + cellB * 0.16 + wrinkles * 0.28 + pores * 0.18, 0, 1);
          bump = THREE.MathUtils.clamp(cellA * 0.42 + wrinkles * 0.2 + pores * 0.22, 0, 1);
          color = base.clone().lerp(accent, THREE.MathUtils.clamp(pattern * 0.48 + broad * 0.08, 0, 0.62)).lerp(grainColor, THREE.MathUtils.clamp(wrinkles * 0.32 + pores * 0.26, 0, 0.36));
          roughnessValue = Math.round(154 + pattern * 58);
          normalX = 128 + (cellA - 0.5) * 42;
          normalY = 128 + (bump - 0.5) * 44;
        } else {
        const pebble = Math.abs(Math.sin((u * 95.0 + broad * 4.0) * Math.PI) * Math.sin((v * 88.0 + soft * 5.0) * Math.PI));
        const creases = Math.pow(1.0 - Math.abs(Math.sin((u * 4.2 + v * 2.2 + broad * 2.0) * Math.PI)), 10.0);
        pattern = THREE.MathUtils.clamp(pebble * 0.5 + creases * 0.32 + soft * 0.22, 0, 1);
        bump = THREE.MathUtils.clamp(pebble * 0.5 + creases * 0.18, 0, 1);
        color = base.clone().lerp(accent, THREE.MathUtils.clamp(pattern * 0.5 + fine * 0.06, 0, 0.58));
        roughnessValue = Math.round(165 + pattern * 52);
        normalX = 128 + (pebble - 0.5) * 32;
        normalY = 128 + (bump - 0.5) * 38;
        }
      } else if (family === "metal") {
        const brush = Math.pow(Math.abs(Math.sin((u * 260.0 + broad * 5.0) * Math.PI)), 6.0);
        pattern = THREE.MathUtils.clamp(brush * 0.38 + broad * 0.16, 0, 1);
        bump = brush * 0.16;
        color = base.clone().lerp(accent, THREE.MathUtils.clamp(pattern * 0.38, 0, 0.46));
        roughnessValue = Math.round(34 + pattern * 38);
        normalX = 128 + (brush - 0.5) * 8;
        normalY = 128 + (bump - 0.5) * 6;
      } else {
        color = base.clone().lerp(accent, THREE.MathUtils.clamp(pattern * 0.65, 0, 0.72));
        roughnessValue = Math.round(155 + THREE.MathUtils.clamp(pattern, 0, 1) * 86);
      }

      const i = (y * size + x) * 4;
      if (channel === "roughness") {
        const value = THREE.MathUtils.clamp(roughnessValue, 18, 248);
        image.data[i] = value;
        image.data[i + 1] = value;
        image.data[i + 2] = value;
      } else if (channel === "normal") {
        image.data[i] = THREE.MathUtils.clamp(Math.round(normalX), 0, 255);
        image.data[i + 1] = THREE.MathUtils.clamp(Math.round(normalY), 0, 255);
        image.data[i + 2] = 255;
      } else {
        image.data[i] = Math.round(THREE.MathUtils.clamp(color.r, 0, 1) * 255);
        image.data[i + 1] = Math.round(THREE.MathUtils.clamp(color.g, 0, 1) * 255);
        image.data[i + 2] = Math.round(THREE.MathUtils.clamp(color.b, 0, 1) * 255);
      }
      image.data[i + 3] = 255;
    }
  }
  ctx.putImageData(image, 0, 0);
  return new THREE.CanvasTexture(canvas);
}

function supportNoise(x, y) {
  return Math.abs((Math.sin(x * 12.9898 + y * 78.233) * 43758.5453) % 1);
}

function supportFractalNoise(x, y, octaves = 3) {
  let value = 0;
  let amplitude = 0.5;
  let frequency = 1;
  let total = 0;
  for (let i = 0; i < octaves; i += 1) {
    value += supportNoise(x * frequency, y * frequency) * amplitude;
    total += amplitude;
    amplitude *= 0.5;
    frequency *= 2.03;
  }
  return total > 0 ? value / total : 0;
}

function createSoftShadowTexture() {
  const size = 512;
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d");
  ctx.clearRect(0, 0, size, size);
  const gradient = ctx.createRadialGradient(size / 2, size / 2, 4, size / 2, size / 2, size * 0.48);
  gradient.addColorStop(0, "rgba(0, 0, 0, 0.62)");
  gradient.addColorStop(0.34, "rgba(0, 0, 0, 0.28)");
  gradient.addColorStop(0.68, "rgba(0, 0, 0, 0.05)");
  gradient.addColorStop(0.9, "rgba(0, 0, 0, 0)");
  gradient.addColorStop(1, "rgba(0, 0, 0, 0)");
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, size, size);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.needsUpdate = true;
  return texture;
}

function updateSoftStudioShadow(model, enabled) {
  if (!enabled || !floor.visible) {
    softStudioShadow.visible = false;
    return;
  }
  const box = getVisibleMeshBox(model);
  if (isBoxEmpty(box)) {
    softStudioShadow.visible = false;
    return;
  }
  const size = box.getSize(new THREE.Vector3());
  const center = box.getCenter(new THREE.Vector3());
  softStudioShadow.position.set(center.x, floor.position.y + 0.008, center.z);
  softStudioShadow.scale.set(Math.max(size.x, 0.6) * 1.45, Math.max(size.z, 0.6) * 1.45, 1);
  softStudioShadow.material.opacity = THREE.MathUtils.clamp(0.22 + size.y * 0.045, 0.24, 0.42);
  softStudioShadow.visible = true;
}

async function handleModelFile(event) {
  const file = event.target.files?.[0];
  if (!file) return;

  const ext = file.name.split(".").pop().toLowerCase();
  logDebug("import", "Fichier sélectionné", { name: file.name, size: file.size, extension: ext });
  if (["step", "stp", "stl"].includes(ext)) {
    showNotice(`${file.name} doit être converti en GLB/OBJ/3DM avant import. Le modèle procédural reste actif.`);
    return;
  }

  if (!["glb", "gltf", "obj", "fbx", "ply", "3ds", "3dm"].includes(ext)) {
    showNotice("Format non supporte dans le navigateur. Utilisez GLB, GLTF, OBJ, FBX, PLY, 3DS ou Rhino 3DM.");
    return;
  }

  startLoading("Lecture du fichier sélectionné", 3);
  const url = URL.createObjectURL(file);
  try {
    if (ext === "3dm") {
      const stats = await inspectRhinoModel(url);
      pendingMeshImport = { file, url, stats };
      setMeshDialogOptions(defaultRhinoMeshOptions);
      syncMeshImportControls();
      populateMeshPreviewDialog(file, stats);
      document.querySelector("#mesh-preview-dialog").showModal();
      logDebug("import", "Previsualisation 3DM prete", { name: file.name, ...stats });
      return;
    } else if (ext === "obj") {
      const model = await loadObjModel(url);
      addUploadedModelToLibrary(model, file.name, { type: ext, fileName: file.name, blob: file });
      showNotice(`${file.name} chargé en nouveau projet avec mat\u00e9riaux PBR.`);
    } else if (ext === "fbx") {
      const model = await loadFbxModel(url);
      addUploadedModelToLibrary(model, file.name, { type: ext, fileName: file.name, blob: file });
      showNotice(`${file.name} chargé en nouveau projet avec mat\u00e9riaux PBR.`);
    } else if (ext === "ply") {
      const model = await loadPlyModel(url);
      addUploadedModelToLibrary(model, file.name, { type: ext, fileName: file.name, blob: file });
      showNotice(`${file.name} chargé en nouveau projet avec mat\u00e9riau PBR.`);
    } else if (ext === "3ds") {
      const model = await load3dsModel(url);
      addUploadedModelToLibrary(model, file.name, { type: ext, fileName: file.name, blob: file });
      showNotice(`${file.name} chargé en nouveau projet avec mat\u00e9riaux PBR.`);
    } else {
      const model = await loadGltfModel(url);
      addUploadedModelToLibrary(model, file.name, { type: ext, fileName: file.name, blob: file });
      showNotice(`${file.name} chargé en nouveau projet. Matériaux remappés automatiquement par nom quand c’est possible.`);
    }
  } catch (error) {
    console.error(error);
    if (ext === "3dm") {
      URL.revokeObjectURL(url);
      document.querySelector("#model-file").value = "";
      showNotice("Impossible de préparer ce fichier 3DM. Vérifiez qu’il contient un maillage Rhino exploitable.");
    } else {
      showNotice("Impossible de charger ce modèle. Vérifiez qu’il s’agit d’un GLB/GLTF valide.");
    }
  } finally {
    if (ext !== "3dm") URL.revokeObjectURL(url);
    if (ext === "3dm" && pendingMeshImport) loaderEl.classList.add("is-hidden");
    else finishLoading();
  }
}

async function confirmPendingMeshImport() {
  if (!pendingMeshImport) return;
  const { file, url } = pendingMeshImport;
  const options = getMeshImportOptions();
  document.querySelector("#mesh-preview-dialog").close();
  startLoading("Import du modèle Rhino 3DM", 3);
  try {
    logDebug("project", "Creation d'un nouveau projet depuis un import 3DM", { name: file.name });
    resetJewelryRoot();
    setCurrentRhinoSource(null);
    updateProductCopy({ copy: `Nouveau projet : ${file.name}. Chargement du modele 3D en cours.` });
    logDebug("import", "Import 3DM confirmé avec réglages de maillage", { name: file.name, options });
    const model = await loadRhinoModel(url, options);
    addUploadedModelToLibrary(model, file.name, {
      type: "3dm",
      url,
      fileName: file.name,
      blob: file,
      meshOptions: options,
    });
    showNotice(`${file.name} chargé. Maillage Rhino post-traité et mat\u00e9riaux convertis en PBR joaillerie.`);
  } catch (error) {
    console.error(error);
    showNotice("Impossible de charger ce modèle 3DM. Vérifiez qu'il contient un mesh de rendu Rhino.");
  } finally {
    pendingMeshImport = null;
    document.querySelector("#model-file").value = "";
    finishLoading();
  }
}

function cancelPendingMeshImport() {
  if (pendingMeshImport?.url) URL.revokeObjectURL(pendingMeshImport.url);
  pendingMeshImport = null;
  document.querySelector("#model-file").value = "";
  const dialog = document.querySelector("#mesh-preview-dialog");
  if (dialog.open) dialog.close();
  loaderEl.classList.add("is-hidden");
  logDebug("import", "Import 3DM annule depuis la previsualisation");
}

async function loadInitialModelFromUrl() {
  const params = new URLSearchParams(window.location.search);
  const modelUrl = params.get("model");
  if (!modelUrl) return;
  startLoading("Chargement du modèle indiqué dans l’adresse", 3);
  try {
    await loadModelFromUrl(modelUrl, modelUrl.split("/").pop() || "modele");
  } catch (error) {
    console.error(error);
    showNotice("Impossible de charger le modèle dans l’URL.");
  } finally {
    finishLoading();
  }
}

async function loadModelFromUrl(url, fileName) {
  const ext = fileName.split(".").pop().toLowerCase();
  let model;
  if (ext === "3dm") model = await loadRhinoModel(url, defaultRhinoMeshOptions);
  else if (ext === "obj") model = await loadObjModel(url);
  else if (ext === "fbx") model = await loadFbxModel(url);
  else if (ext === "ply") model = await loadPlyModel(url);
  else if (ext === "3ds") model = await load3dsModel(url);
  else model = await loadGltfModel(url);
  addUploadedModelToLibrary(model, fileName, ext === "3dm" ? {
    type: "3dm",
    url,
    fileName,
    meshOptions: defaultRhinoMeshOptions,
  } : {});
  return model;
}

function loadGltfModel(url) {
  const draco = new DRACOLoader();
  draco.setDecoderPath("https://unpkg.com/three@0.164.1/examples/jsm/libs/draco/");

  const gltfLoader = new GLTFLoader();
  gltfLoader.setDRACOLoader(draco);
  gltfLoader.setMeshoptDecoder(MeshoptDecoder);

  return new Promise((resolve, reject) => {
    gltfLoader.load(
      url,
      (gltf) => {
        setLoadingProgress(64, "Décodage du modèle GLTF");
        root.clear();
        centerGemMesh = null;
        softStudioShadow.visible = false;
        root.add(reflectionRig);
        const model = gltf.scene;
        model.name = "Imported jewelry model";
        setLoadingProgress(72, "Préparation des géométries et matériaux");
        normalizeImportedModel(model);
        root.add(model);
        setLoadingProgress(88, "Préparation du rendu joaillerie");
        prepareObjectMaterialEditor();
        buildGemOpticalEffect();
        setLoadingProgress(96, "Finalisation de la scène");
        resolve(model);
      },
      (event) => updateLoadingFromProgressEvent(event, "Téléchargement du modèle GLTF"),
      reject,
    );
  });
}

function inspectRhinoModel(url) {
  const loader = new Rhino3dmLoader();
  loader.setLibraryPath("https://unpkg.com/three@0.164.1/examples/jsm/libs/rhino3dm/");

  return new Promise((resolve, reject) => {
    loader.load(
      url,
      (object) => resolve(collectImportStats(object)),
      undefined,
      reject,
    );
  });
}

function applyRhinoCoordinateFrame(object, meshOptions = {}) {
  object.userData.rhinoOriginalFrame = {
    position: object.position.toArray(),
    rotation: [object.rotation.x, object.rotation.y, object.rotation.z],
    scale: object.scale.toArray(),
    rhinoZUp: meshOptions.rhinoZUp !== false,
  };
  if (meshOptions.rhinoZUp === false) return;
  object.rotation.x -= Math.PI / 2;
  object.updateMatrixWorld(true);
}

function loadRhinoModel(url, meshOptions = {}) {
  const loader = new Rhino3dmLoader();
  loader.setLibraryPath("https://unpkg.com/three@0.164.1/examples/jsm/libs/rhino3dm/");
  const effectiveMeshOptions = { ...defaultRhinoMeshOptions, ...meshOptions };

  return new Promise((resolve, reject) => {
    loader.load(
      url,
      (object) => {
        setLoadingProgress(64, "Décodage du document Rhino 3DM");
        clearRhinoMeshPreview();
        resetDiamondRayTraceQueue("chargement Rhino 3DM");
        root.clear();
        stoneShowcaseGroup = null;
        stoneShowcaseMesh = null;
        stoneShowcasePedestal = null;
        stoneShowcaseLockedPosition = null;
        centerGemMesh = null;
        softStudioShadow.visible = false;
        root.add(reflectionRig);
        object.name = "Imported Rhino 3DM jewelry model";
        applyRhinoCoordinateFrame(object, effectiveMeshOptions);
        setLoadingProgress(72, "Analyse du maillage et des volumes");
        normalizeImportedModel(object, effectiveMeshOptions);
        root.add(object);
        if (effectiveMeshOptions.classicPlugGem) settings.stoneShowcaseVisible = false;
        setLoadingProgress(86, "Conversion des matériaux joaillerie");
        prepareObjectMaterialEditor({ ensureStoneShowcase: !effectiveMeshOptions.classicPlugGem });
        setLoadingProgress(93, "Préparation du rendu optique des pierres");
        buildGemOpticalEffect();
        setLoadingProgress(97, "Cadrage et finalisation de la scène");
        resolve(object);
      },
      updateRhinoLoadingProgress,
      reject,
    );
  });
}

function loadObjModel(url) {
  const loader = new OBJLoader();
  return new Promise((resolve, reject) => {
    loader.load(
      url,
      (object) => {
        setLoadingProgress(66, "Décodage du modèle OBJ");
        root.clear();
        centerGemMesh = null;
        softStudioShadow.visible = false;
        root.add(reflectionRig);
        object.name = "Imported OBJ jewelry model";
        setLoadingProgress(74, "Préparation des géométries et matériaux");
        normalizeImportedModel(object);
        root.add(object);
        prepareObjectMaterialEditor();
        buildGemOpticalEffect();
        setLoadingProgress(96, "Finalisation de la scène");
        resolve(object);
      },
      (event) => updateLoadingFromProgressEvent(event, "Téléchargement du modèle OBJ"),
      reject,
    );
  });
}

function loadFbxModel(url) {
  const loader = new FBXLoader();
  return new Promise((resolve, reject) => {
    loader.load(
      url,
      (object) => {
        setLoadingProgress(66, "Décodage du modèle FBX");
        root.clear();
        centerGemMesh = null;
        softStudioShadow.visible = false;
        root.add(reflectionRig);
        object.name = "Imported FBX jewelry model";
        setLoadingProgress(74, "Préparation des géométries et matériaux");
        normalizeImportedModel(object);
        root.add(object);
        prepareObjectMaterialEditor();
        buildGemOpticalEffect();
        setLoadingProgress(96, "Finalisation de la scène");
        resolve(object);
      },
      (event) => updateLoadingFromProgressEvent(event, "Téléchargement du modèle FBX"),
      reject,
    );
  });
}

function loadPlyModel(url) {
  const loader = new PLYLoader();
  return new Promise((resolve, reject) => {
    loader.load(
      url,
      (geometry) => {
        setLoadingProgress(66, "Décodage du maillage PLY");
        geometry.computeVertexNormals();
        root.clear();
        centerGemMesh = null;
        softStudioShadow.visible = false;
        root.add(reflectionRig);
        const mesh = new THREE.Mesh(geometry, makeActiveMetalMaterial("PLY precious material"));
        mesh.name = "Imported PLY jewelry model";
        const object = new THREE.Group();
        object.name = "Imported PLY jewelry group";
        object.add(mesh);
        normalizeImportedModel(object);
        root.add(object);
        prepareObjectMaterialEditor();
        buildGemOpticalEffect();
        setLoadingProgress(96, "Finalisation de la scène");
        resolve(object);
      },
      (event) => updateLoadingFromProgressEvent(event, "Téléchargement du modèle PLY"),
      reject,
    );
  });
}

function load3dsModel(url) {
  const loader = new TDSLoader();
  return new Promise((resolve, reject) => {
    loader.load(
      url,
      (object) => {
        setLoadingProgress(66, "Décodage du modèle 3DS");
        root.clear();
        centerGemMesh = null;
        softStudioShadow.visible = false;
        root.add(reflectionRig);
        object.name = "Imported 3DS jewelry model";
        setLoadingProgress(74, "Préparation des géométries et matériaux");
        normalizeImportedModel(object);
        root.add(object);
        prepareObjectMaterialEditor();
        buildGemOpticalEffect();
        setLoadingProgress(96, "Finalisation de la scène");
        resolve(object);
      },
      (event) => updateLoadingFromProgressEvent(event, "Téléchargement du modèle 3DS"),
      reject,
    );
  });
}

function collectImportedMeshVolumeEntries(model) {
  model.updateWorldMatrix(true, true);
  const entries = [];
  model.traverse((child) => {
    if (!child.isMesh || !child.geometry?.attributes?.position) return;
    if (!child.geometry.boundingBox) child.geometry.computeBoundingBox();
    const box = new THREE.Box3().copy(child.geometry.boundingBox).applyMatrix4(child.matrixWorld);
    if (isBoxEmpty(box)) return;
    const size = box.getSize(new THREE.Vector3());
    const volume = Math.max(size.x * size.y * size.z, 0);
    if (volume <= 0) return;
    entries.push({ mesh: child, box, size, volume, name: String(child.name || child.material?.name || "") });
  });
  return entries.sort((a, b) => b.volume - a.volume);
}

function removeStemDecals(model) {
  const decals = [];
  const sourceUuid = model?.uuid || null;
  const collect = (child) => {
    if (!child.userData?.stemDecal) return;
    if (sourceUuid && child.userData.decalSourceUuid && child.userData.decalSourceUuid !== sourceUuid) return;
    decals.push(child);
  };
  if (model?.traverse) model.traverse(collect);
  if (root?.traverse) root.traverse(collect);
  [...new Set(decals)].forEach((child) => {
    if (stemDecalDragState?.decal === child || selectedStemDecal === child) stemDecalGesture?.cancel();
    if (selectedStemDecal === child) clearStemDecalSelection();
    child.geometry?.dispose?.();
    child.material?.dispose?.();
    child.parent?.remove(child);
  });
}

function getBoxLongestAxis(size) {
  if (size.x >= size.y && size.x >= size.z) return new THREE.Vector3(1, 0, 0);
  if (size.y >= size.x && size.y >= size.z) return new THREE.Vector3(0, 1, 0);
  return new THREE.Vector3(0, 0, 1);
}

function getBoxSecondaryRadius(size, axis) {
  const values = axis.x ? [size.y, size.z] : axis.y ? [size.x, size.z] : [size.x, size.y];
  return Math.max(Math.min(values[0], values[1]) * 0.5, 0.012);
}

function getPerpendicularStemBasis(axis) {
  const reference = Math.abs(axis.y) < 0.88 ? new THREE.Vector3(0, 1, 0) : new THREE.Vector3(0, 0, 1);
  const uAxis = new THREE.Vector3().crossVectors(axis, reference).normalize();
  if (uAxis.lengthSq() < 0.000001) uAxis.set(1, 0, 0);
  const vAxis = new THREE.Vector3().crossVectors(axis, uAxis).normalize();
  return { uAxis, vAxis };
}

function percentile(values, ratio) {
  if (!values.length) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const index = THREE.MathUtils.clamp((sorted.length - 1) * ratio, 0, sorted.length - 1);
  const low = Math.floor(index);
  const high = Math.ceil(index);
  return THREE.MathUtils.lerp(sorted[low], sorted[high], index - low);
}

function scoreStemDecalCandidate(entry, largestVolume) {
  const dims = [entry.size.x, entry.size.y, entry.size.z].sort((a, b) => b - a);
  const elongation = dims[0] / Math.max(dims[1], 1e-6);
  const thinness = dims[1] / Math.max(dims[2], 1e-6);
  const volumeRatio = entry.volume / Math.max(largestVolume, 1e-9);
  const text = `${entry.mesh.name || ""} ${entry.mesh.material?.name || ""}`.toLowerCase();
  let score = elongation * 18 - volumeRatio * 7 - Math.abs(thinness - 1.35) * 1.5;
  if (text.includes("tige") || text.includes("shaft") || text.includes("stem") || text.includes("cyl")) score += 22;
  if (text.includes("disque") || text.includes("assiette") || text.includes("collar")) score -= 12;
  return score;
}

function findStemDecalTarget(model) {
  const entries = collectImportedMeshVolumeEntries(model).filter((entry) => entry.mesh.userData?.classicPlugRole !== "gem" && !entry.mesh.userData?.stemDecal);
  if (!entries.length) return null;
  const largestVolume = entries[0]?.volume || 1;
  const candidate = entries
    .map((entry) => ({ entry, score: scoreStemDecalCandidate(entry, largestVolume) }))
    .sort((a, b) => b.score - a.score)[0]?.entry;
  return candidate || entries[0];
}

function findThinStemDecalPlacement(entry, referenceBox, gemCenter = null) {
  const mesh = entry?.mesh;
  const attribute = mesh?.geometry?.attributes?.position;
  if (!mesh?.isMesh || !attribute?.count) return null;

  mesh.updateWorldMatrix(true, false);
  const axis = getBoxLongestAxis(entry.size).normalize();
  const { uAxis, vAxis } = getPerpendicularStemBasis(axis);
  const entryCenter = entry.box.getCenter(new THREE.Vector3());
  const tMin = Math.min(entry.box.min.dot(axis), entry.box.max.dot(axis));
  const tMax = Math.max(entry.box.min.dot(axis), entry.box.max.dot(axis));
  const span = Math.max(tMax - tMin, 1e-6);
  const gemT = gemCenter?.isVector3 ? gemCenter.dot(axis) : null;
  const gemDirection = gemT === null ? 0 : Math.sign(gemT - entryCenter.dot(axis));
  const binCount = 84;
  const bins = Array.from({ length: binCount }, () => ({ count: 0, sumX: 0, sumY: 0, sumZ: 0, sumU: 0, sumV: 0, samples: [] }));
  const world = new THREE.Vector3();

  for (let i = 0; i < attribute.count; i += 1) {
    world.fromBufferAttribute(attribute, i).applyMatrix4(mesh.matrixWorld);
    const t = world.dot(axis);
    const index = THREE.MathUtils.clamp(Math.floor(((t - tMin) / span) * binCount), 0, binCount - 1);
    const u = world.dot(uAxis);
    const v = world.dot(vAxis);
    const bin = bins[index];
    bin.count += 1;
    bin.sumX += world.x;
    bin.sumY += world.y;
    bin.sumZ += world.z;
    bin.sumU += u;
    bin.sumV += v;
    bin.samples.push([u, v]);
  }

  const measured = bins.map((bin, index) => {
    if (bin.count < 3) return null;
    const meanU = bin.sumU / bin.count;
    const meanV = bin.sumV / bin.count;
    const distances = bin.samples.map(([u, v]) => Math.hypot(u - meanU, v - meanV));
    const radius = percentile(distances, 0.82);
    return {
      index,
      count: bin.count,
      radius,
      center: new THREE.Vector3(bin.sumX / bin.count, bin.sumY / bin.count, bin.sumZ / bin.count),
    };
  });

  const valid = measured.filter(Boolean);
  if (valid.length < 6) return null;
  const radii = valid.map((item) => item.radius).filter((radius) => radius > 0.0001);
  if (!radii.length) return null;
  const lowRadius = percentile(radii, 0.12);
  const highRadius = percentile(radii, 0.86);
  const thinThreshold = Math.max(lowRadius * 1.18, lowRadius + (highRadius - lowRadius) * 0.24);
  const edgeGuard = Math.max(4, Math.floor(binCount * 0.07));
  const thinBins = measured.map((item, index) => Boolean(
    item &&
    index >= edgeGuard &&
    index < binCount - edgeGuard &&
    item.radius <= thinThreshold &&
    item.count >= 3,
  ));

  const groups = [];
  for (let i = 0; i < thinBins.length; i += 1) {
    if (!thinBins[i]) continue;
    const start = i;
    while (i + 1 < thinBins.length && thinBins[i + 1]) i += 1;
    const end = i;
    if (end - start + 1 >= 3) groups.push({ start, end });
  }
  if (!groups.length) return null;

  const scored = groups.map((group) => {
    const items = measured.slice(group.start, group.end + 1).filter(Boolean);
    const avgRadius = items.reduce((sum, item) => sum + item.radius, 0) / Math.max(items.length, 1);
    const avgCount = items.reduce((sum, item) => sum + item.count, 0) / Math.max(items.length, 1);
    const length = ((group.end - group.start + 1) / binCount) * span;
    const centerNorm = (group.start + group.end) / 2 / Math.max(binCount - 1, 1);
    const centerBias = 1 - Math.abs(centerNorm - 0.5);
    const gemSideBias = gemDirection === 0 ? 0 : (gemDirection > 0 ? centerNorm : 1 - centerNorm);
    const radiusVariance = Math.sqrt(items.reduce((sum, item) => sum + (item.radius - avgRadius) ** 2, 0) / Math.max(items.length, 1)) / Math.max(avgRadius, 0.001);
    const constantDiameterScore = Math.max(0, 1 - radiusVariance * 4);
    return {
      group,
      avgRadius,
      avgCount,
      length,
      score: (length / Math.max(avgRadius, 0.001)) + centerBias * 0.9 + gemSideBias * 10.5 + constantDiameterScore * 2.4 + Math.log(avgCount + 1) * 0.08,
    };
  }).sort((a, b) => b.score - a.score)[0];

  const distanceToStart = scored.group.start;
  const distanceToEnd = Math.max(binCount - 1 - scored.group.end, 0);
  const inferredOrnamentDirection = distanceToStart <= distanceToEnd ? -1 : 1;
  const ornamentDirection = gemDirection || inferredOrnamentDirection;
  const centerRatio = ornamentDirection > 0 ? 0.78 : 0.22;
  const centerIndex = Math.round(THREE.MathUtils.lerp(scored.group.start + 1, scored.group.end - 1, centerRatio));
  const centerBin = measured[centerIndex] || measured.slice(scored.group.start, scored.group.end + 1).filter(Boolean)[0];
  if (!centerBin) return null;

  const viewNormal = new THREE.Vector3().subVectors(camera.position, centerBin.center);
  viewNormal.addScaledVector(axis, -viewNormal.dot(axis));
  if (viewNormal.lengthSq() < 0.000001) {
    viewNormal.copy(new THREE.Vector3(0, 1, 0)).addScaledVector(axis, -axis.dot(new THREE.Vector3(0, 1, 0)));
  }
  if (viewNormal.lengthSq() < 0.000001) viewNormal.copy(uAxis);
  viewNormal.normalize();

  const decalNormal = viewNormal.clone();
  let textAxis = axis.clone();
  if (gemDirection !== 0 && textAxis.dot(gemCenter.clone().sub(centerBin.center)) < 0) textAxis.negate();
  let heightAxis = new THREE.Vector3().crossVectors(decalNormal, textAxis).normalize();
  if (heightAxis.lengthSq() < 0.000001) heightAxis.copy(vAxis);
  const projectedCameraUp = camera.up.clone().addScaledVector(decalNormal, -camera.up.dot(decalNormal)).normalize();
  if (projectedCameraUp.lengthSq() > 0.000001 && heightAxis.dot(projectedCameraUp) < 0) {
    textAxis.negate();
    heightAxis.negate();
  }

  const modelSize = isBoxEmpty(referenceBox) ? entry.size : referenceBox.getSize(new THREE.Vector3());
  const stemRadius = Math.max(scored.avgRadius, getBoxSecondaryRadius(entry.size, axis) * 0.18, 0.012);
  const widthWorld = THREE.MathUtils.clamp(scored.length * 0.48, stemRadius * 2.5, Math.min(stemRadius * 6.4, modelSize.length() * 0.16));
  const heightWorld = THREE.MathUtils.clamp(widthWorld * 0.28, stemRadius * 0.42, stemRadius * 0.96);
  const depthWorld = Math.max(stemRadius * 1.35, heightWorld * 1.4, 0.018);
  const meshWorldScale = new THREE.Vector3().setFromMatrixScale(mesh.matrixWorld);
  const worldUnitsPerMillimeter = percentile(
    [meshWorldScale.x, meshWorldScale.y, meshWorldScale.z].filter((value) => Number.isFinite(value) && value > 1e-8),
    0.5,
  ) || 1;
  const halfTextShiftWorld = widthWorld * 0.5;
  const segmentMinT = tMin + (scored.group.start / binCount) * span;
  const segmentMaxT = tMin + ((scored.group.end + 1) / binCount) * span;
  const halfProjectorWidth = widthWorld * 0.5;
  const safeMinT = segmentMinT + halfProjectorWidth;
  const safeMaxT = segmentMaxT - halfProjectorWidth;
  const centerT = centerBin.center.dot(axis);
  const shiftedT = safeMinT <= safeMaxT
    ? (safeMinT + safeMaxT) * 0.5
    : (segmentMinT + segmentMaxT) * 0.5;
  const decalShiftWorld = shiftedT - centerT;
  const decalShiftMillimeters = Math.abs(decalShiftWorld) / Math.max(worldUnitsPerMillimeter, 1e-8);
  const shiftedStemCenter = centerBin.center.clone().addScaledVector(axis, decalShiftWorld);
  const surfaceCenter = shiftedStemCenter.addScaledVector(decalNormal, stemRadius * 0.98);
  const projectorCenter = surfaceCenter.clone().addScaledVector(decalNormal, depthWorld * 0.18);

  return {
    axis: textAxis,
    stemAxis: axis.clone(),
    stemUAxis: uAxis.clone(),
    stemVAxis: vAxis.clone(),
    axisOrigin: centerBin.center.clone().addScaledVector(axis, -centerT),
    heightAxis,
    normal: decalNormal,
    center: projectorCenter,
    size: new THREE.Vector3(widthWorld, heightWorld, depthWorld),
    stemRadius,
    segmentLength: scored.length,
    shiftMillimeters: decalShiftMillimeters,
    shiftWorld: Math.abs(decalShiftWorld),
    ornamentDirection,
    halfTextShiftWorld,
    safeMinT,
    safeMaxT,
    worldUnitsPerMillimeter,
    binRange: [scored.group.start, scored.group.end],
  };
}

function createStemDecalMaterial() {
  const material = new THREE.MeshBasicMaterial({
    name: "Decalcomanie ROSEBUDS tige",
    map: stemDecalTexture,
    color: new THREE.Color("#111111"),
    transparent: true,
    opacity: 0.92,
    alphaTest: 0.12,
    depthWrite: false,
    depthTest: true,
    side: THREE.DoubleSide,
    polygonOffset: true,
    polygonOffsetFactor: -10,
    polygonOffsetUnits: -10,
    toneMapped: false,
  });
  material.userData.decalMaterial = true;
  return material;
}

function makeStemProjectionGeometry(mesh, placement) {
  const zAxis = placement.normal.clone().normalize();
  const yAxis = placement.heightAxis.clone().normalize();
  const xAxis = placement.axis.clone().normalize();
  const basis = new THREE.Matrix4().makeBasis(xAxis, yAxis, zAxis);
  const orientation = new THREE.Euler().setFromRotationMatrix(basis);
  const geometry = new DecalGeometry(mesh, placement.center, orientation, placement.size);
  return geometry;
}

function getEmbeddedClassicGemCenter(model) {
  let gemMesh = null;
  model.traverse((child) => {
    if (!gemMesh && child.isMesh && child.userData?.classicPlugRole === "gem") gemMesh = child;
  });
  if (!gemMesh && centerGemMesh?.isMesh) {
    let belongsToModel = false;
    model.traverse((child) => {
      if (child === centerGemMesh) belongsToModel = true;
    });
    if (belongsToModel) gemMesh = centerGemMesh;
  }
  if (!gemMesh) return null;
  const box = getVisibleMeshBox(gemMesh);
  return isBoxEmpty(box) ? null : box.getCenter(new THREE.Vector3());
}

const STEM_DECAL_POSITION_STORAGE_KEY = "ctva-stem-decal-positions-v1";

function readStoredStemDecalPositions() {
  try {
    const value = JSON.parse(window.localStorage.getItem(STEM_DECAL_POSITION_STORAGE_KEY) || "{}");
    return value && typeof value === "object" ? value : {};
  } catch {
    return {};
  }
}

function writeStoredStemDecalPosition(modelId, placement) {
  if (!modelId || !placement) return;
  const positions = readStoredStemDecalPositions();
  positions[modelId] = {
    axialRatio: THREE.MathUtils.clamp(Number.isFinite(placement.axialRatio) ? placement.axialRatio : 0.5, 0, 1),
    angle: Number(placement.angle) || 0,
  };
  try {
    window.localStorage.setItem(STEM_DECAL_POSITION_STORAGE_KEY, JSON.stringify(positions));
    return true;
  } catch {
    // Le déplacement reste utilisable même si le stockage local est indisponible.
    return false;
  }
}

function clearStoredStemDecalPosition(modelId) {
  if (!modelId) return;
  const positions = readStoredStemDecalPositions();
  delete positions[modelId];
  try {
    window.localStorage.setItem(STEM_DECAL_POSITION_STORAGE_KEY, JSON.stringify(positions));
  } catch {
    // Rien à faire : la position sera tout de même recentrée pour la session.
  }
}

function setStemDecalPlacementCoordinates(placement, axialRatio, angle) {
  if (!placement) return;
  const minT = Math.min(placement.safeMinT, placement.safeMaxT);
  const maxT = Math.max(placement.safeMinT, placement.safeMaxT);
  const normalizedRatio = THREE.MathUtils.clamp(Number.isFinite(Number(axialRatio)) ? Number(axialRatio) : 0.5, 0, 1);
  const normalizedAngle = Number.isFinite(Number(angle)) ? Number(angle) : 0;
  const axialT = THREE.MathUtils.lerp(minT, maxT, normalizedRatio);
  const normal = placement.stemUAxis.clone().multiplyScalar(Math.cos(normalizedAngle))
    .addScaledVector(placement.stemVAxis, Math.sin(normalizedAngle)).normalize();
  const stemCenter = placement.axisOrigin.clone().addScaledVector(placement.stemAxis, axialT);

  placement.normal.copy(normal);
  placement.heightAxis.crossVectors(normal, placement.axis).normalize();
  if (placement.heightAxis.lengthSq() < 0.000001) placement.heightAxis.copy(placement.stemVAxis);
  placement.center.copy(stemCenter)
    .addScaledVector(normal, placement.stemRadius * 0.98 + placement.size.z * 0.18);
  placement.axialRatio = normalizedRatio;
  placement.angle = normalizedAngle;
}

function initializeStemDecalPlacement(modelId, placement) {
  const minT = Math.min(placement.safeMinT, placement.safeMaxT);
  const maxT = Math.max(placement.safeMinT, placement.safeMaxT);
  const centerT = placement.center.dot(placement.stemAxis);
  const defaultRatio = maxT - minT > 1e-8 ? THREE.MathUtils.clamp((centerT - minT) / (maxT - minT), 0, 1) : 0.5;
  const defaultAngle = Math.atan2(placement.normal.dot(placement.stemVAxis), placement.normal.dot(placement.stemUAxis));
  const stored = readStoredStemDecalPositions()[modelId];
  setStemDecalPlacementCoordinates(
    placement,
    Number.isFinite(stored?.axialRatio) ? stored.axialRatio : defaultRatio,
    Number.isFinite(stored?.angle) ? stored.angle : defaultAngle,
  );
}

function rebuildStemDecalGeometry(decal) {
  const target = decal?.stemDecalTarget;
  const model = decal?.stemDecalModel;
  const placement = decal?.stemDecalPlacement;
  if (!target?.isMesh || !model || !placement) return false;
  target.updateWorldMatrix(true, false);
  model.updateWorldMatrix(true, true);
  const geometry = makeStemProjectionGeometry(target, placementInWorld(placement, decal.stemDecalFrameWorld, model.matrixWorld));
  if (!geometry.attributes.position || geometry.attributes.position.count === 0) {
    geometry.dispose();
    return false;
  }
  geometry.applyMatrix4(new THREE.Matrix4().copy(model.matrixWorld).invert());
  geometry.computeBoundingSphere();
  geometry.computeVertexNormals();
  decal.geometry?.dispose?.();
  decal.geometry = geometry;
  return true;
}

function setPointerFromCanvasEvent(event) {
  const bounds = renderer.domElement.getBoundingClientRect();
  if (!bounds.width || !bounds.height) return false;
  pointer.x = ((event.clientX - bounds.left) / bounds.width) * 2 - 1;
  pointer.y = -((event.clientY - bounds.top) / bounds.height) * 2 + 1;
  raycaster.setFromCamera(pointer, camera);
  return true;
}

function getStemDecalAtPointer(event) {
  if (!setPointerFromCanvasEvent(event)) return null;
  root.updateWorldMatrix(true, true);
  const decals = [];
  root.traverse((child) => {
    if (child.isMesh && child.userData?.stemDecal && isObjectVisibleInHierarchy(child)) decals.push(child);
  });
  const hit = raycaster.intersectObjects(decals, false)[0];
  // La zone projetée du logo gagne toujours le hit-test. Le listener en phase de
  // capture bloque ensuite OrbitControls et la sélection du métal placé dessous.
  return hit || null;
}

function clearStemDecalSelection() {
  stemDecalSelectionHelper?.parent?.remove(stemDecalSelectionHelper);
  stemDecalSelectionHelper?.dispose();
  stemDecalSelectionHelper = null;
  selectedStemDecal = null;
  renderer.domElement.classList.remove("is-decal-selected");
}

function selectStemDecal(hit) {
  closeMaterialContextMenu();
  detachManipulator();
  selectSceneObject(null);
  selectedStemDecal = hit.object;
  stemDecalSelectionHelper = new THREE.BoxHelper(selectedStemDecal, 0xdfb352);
  stemDecalSelectionHelper.material.depthTest = false;
  stemDecalSelectionHelper.material.toneMapped = false;
  stemDecalSelectionHelper.renderOrder = 90;
  scene.add(stemDecalSelectionHelper);
  renderer.domElement.classList.add("is-decal-selected");
  const modelId = selectedStemDecal.userData.decalModelId;
  document.querySelector("#selected-object-name").textContent = `Logo ROSEBUDS - ${modelDefaults[modelId]?.title || modelId}`;
}

function syncStemDecalEditMode() {
  const enabled = document.querySelector("#decal-edit-mode")?.checked === true;
  renderer.domElement.classList.toggle("is-decal-editing", enabled);
  if (!enabled) stemDecalGesture?.cancel();
  if (enabled) showNotice("Cliquez sur le logo puis faites-le glisser sur la tige.");
}

function startStemDecalDrag(event, hit) {
  const decal = hit.object;
  if (!decal?.parent) return false;
  decal.stemDecalModel.updateWorldMatrix(true, true);
  const placement = decal.stemDecalPlacement;
  const grabbed = pointInPlacementFrame(hit.point, decal.stemDecalFrameWorld, decal.stemDecalModel.matrixWorld);
  const offset = grabbed.clone().sub(placement.axisOrigin);
  const hitAngle = Math.atan2(offset.dot(placement.stemVAxis), offset.dot(placement.stemUAxis));
  const minT = Math.min(placement.safeMinT, placement.safeMaxT);
  const maxT = Math.max(placement.safeMinT, placement.safeMaxT);
  stemDecalDragState = {
    decal, pointerId: event.pointerId,
    initial: { axialRatio: placement.axialRatio, angle: placement.angle },
    axialOffset: THREE.MathUtils.lerp(minT, maxT, placement.axialRatio) - grabbed.dot(placement.stemAxis),
    angleOffset: placement.angle - hitAngle,
  };
  renderer.domElement.classList.add("is-decal-dragging");
  return true;
}

function handleStemDecalPointerMove(event) {
  if (!stemDecalDragState || event.pointerId !== stemDecalDragState.pointerId) return;
  const { decal } = stemDecalDragState;
  const placement = decal.stemDecalPlacement;
  const target = decal.stemDecalTarget;
  if (!placement || !target?.isMesh || !setPointerFromCanvasEvent(event)) return;
  decal.stemDecalModel.updateWorldMatrix(true, true);
  const hit = raycaster.intersectObject(target, false)[0];
  if (!hit) return;

  const point = pointInPlacementFrame(hit.point, decal.stemDecalFrameWorld, decal.stemDecalModel.matrixWorld);
  const hitT = point.dot(placement.stemAxis);
  const minT = Math.min(placement.safeMinT, placement.safeMaxT);
  const maxT = Math.max(placement.safeMinT, placement.safeMaxT);
  const ratio = maxT - minT > 1e-8 ? THREE.MathUtils.clamp((hitT + stemDecalDragState.axialOffset - minT) / (maxT - minT), 0, 1) : 0.5;
  const axisPoint = placement.axisOrigin.clone().addScaledVector(placement.stemAxis, hitT);
  const radial = point.clone().sub(axisPoint);
  radial.addScaledVector(placement.stemAxis, -radial.dot(placement.stemAxis));
  const angle = radial.lengthSq() > 0.000001
    ? Math.atan2(radial.dot(placement.stemVAxis), radial.dot(placement.stemUAxis)) + stemDecalDragState.angleOffset
    : placement.angle;
  const previous = { axialRatio: placement.axialRatio, angle: placement.angle };
  setStemDecalPlacementCoordinates(placement, ratio, angle);
  if (!rebuildStemDecalGeometry(decal)) setStemDecalPlacementCoordinates(placement, previous.axialRatio, previous.angle);
  stemDecalSelectionHelper?.update();
}

function finishStemDecalDrag(persist = true) {
  if (!stemDecalDragState) return;
  const { decal, initial } = stemDecalDragState;
  const saved = persist && writeStoredStemDecalPosition(decal.userData?.decalModelId, decal.stemDecalPlacement);
  if (!persist) {
    setStemDecalPlacementCoordinates(decal.stemDecalPlacement, initial.axialRatio, initial.angle);
    rebuildStemDecalGeometry(decal);
  }
  renderer.domElement.classList.remove("is-decal-dragging");
  stemDecalDragState = null;
  if (persist) showNotice(saved ? "Position du logo mémorisée pour ce plug." : "Position modifiée ; stockage du navigateur indisponible.");
}

function resetCurrentStemDecalPosition() {
  const modelId = selectedStemDecal?.userData.decalModelId || settings.modelId;
  const selectedModel = selectedStemDecal?.stemDecalModel;
  stemDecalGesture?.cancel();
  clearStoredStemDecalPosition(modelId);
  let model = selectedModel || null;
  root.traverse((child) => {
    if (!model && child.userData?.catalogModelId === modelId && child.userData?.meshOptions?.classicPlugVolumeMaterials) model = child;
  });
  if (!model) {
    root.traverse((child) => {
      if (!model && child.userData?.meshOptions?.classicPlugVolumeMaterials) model = child;
    });
  }
  if (!model) {
    showNotice("Aucun logo de plug à recentrer.");
    return;
  }
  addStemDecalToClassicPlug(model, { ...model.userData.meshOptions, modelId });
  showNotice("Logo recentré sur la tige.");
}

function addStemDecalToClassicPlug(model, meshOptions = {}) {
  if (!meshOptions.classicPlugVolumeMaterials) return;
  const modelId = meshOptions.modelId || model.userData?.catalogModelId || settings.modelId;
  removeStemDecals(model);
  model.updateWorldMatrix(true, true);
  const targetEntry = findStemDecalTarget(model);
  if (!targetEntry) return;
  const modelBox = getModelMeshBox(model, (child) => !child.userData?.stemDecal && child.userData?.classicPlugRole !== "gem");
  const referenceBox = isBoxEmpty(modelBox) ? getVisibleMeshBox(model) : modelBox;
  if (isBoxEmpty(referenceBox)) return;

  const gemCenter = getEmbeddedClassicGemCenter(model);
  const placement = findThinStemDecalPlacement(targetEntry, referenceBox, gemCenter);
  if (!placement) {
    logDebug("decal", "Tige fine introuvable pour projection de decalcomanie", {
      target: targetEntry.mesh.name || targetEntry.mesh.material?.name || "metal",
    });
    return;
  }
  initializeStemDecalPlacement(modelId, placement);

  let geometry = makeStemProjectionGeometry(targetEntry.mesh, placement);
  if (!geometry.attributes.position || geometry.attributes.position.count === 0) {
    geometry.dispose();
    const flipped = {
      ...placement,
      normal: placement.normal.clone().negate(),
      center: placement.center.clone().addScaledVector(placement.normal, -placement.size.z * 0.42),
    };
    geometry = makeStemProjectionGeometry(targetEntry.mesh, flipped);
  }
  if (!geometry.attributes.position || geometry.attributes.position.count === 0) {
    geometry.dispose();
    logDebug("decal", "Projection de decalcomanie vide sur la tige", {
      target: targetEntry.mesh.name || targetEntry.mesh.material?.name || "metal",
    });
    return;
  }

  const modelWorldInverse = new THREE.Matrix4().copy(model.matrixWorld).invert();
  geometry.applyMatrix4(modelWorldInverse);
  geometry.computeBoundingSphere();
  geometry.computeVertexNormals();

  const decal = new THREE.Mesh(geometry, createStemDecalMaterial());
  decal.name = "Decalcomanie ROSEBUDS projetee sur la tige";
  decal.userData.stemDecal = true;
  decal.userData.decalSourceUuid = model.uuid;
  decal.userData.decalModelId = modelId;
  decal.stemDecalModel = model;
  decal.stemDecalTarget = targetEntry.mesh;
  decal.stemDecalPlacement = placement;
  decal.stemDecalFrameWorld = model.matrixWorld.clone();
  decal.userData.nonMaterialEditable = true;
  decal.userData.ignoreRaycastSelection = true;
  decal.renderOrder = 82;
  model.add(decal);
  logDebug("decal", "Decalcomanie ROSEBUDS projetee sur la tige metal", {
    target: targetEntry.mesh.name || targetEntry.mesh.material?.name || "metal",
    vertices: geometry.attributes.position.count,
    width: Number(placement.size.x.toFixed(4)),
    height: Number(placement.size.y.toFixed(4)),
    depth: Number(placement.size.z.toFixed(4)),
    radius: Number(placement.stemRadius.toFixed(4)),
    shiftTowardGemMillimeters: placement.shiftMillimeters,
    shiftTowardGemWorld: Number(placement.shiftWorld.toFixed(4)),
    bins: placement.binRange,
  });
}
function getClassicPlugEntryMaterials(entry) {
  return Array.isArray(entry?.mesh?.material) ? entry.mesh.material.filter(Boolean) : [entry?.mesh?.material].filter(Boolean);
}

function getClassicPlugEntryText(entry) {
  const materials = getClassicPlugEntryMaterials(entry);
  return [
    entry?.mesh?.name || "",
    entry?.mesh?.userData?.attributes?.name || "",
    entry?.mesh?.userData?.attributes?.layer || "",
    entry?.mesh?.userData?.layer || "",
    ...materials.map((material) => material?.name || ""),
  ].join(" ").toLowerCase();
}

function scoreClassicPlugGemCandidate(entry, largestVolume = 1) {
  const materials = getClassicPlugEntryMaterials(entry);
  const text = getClassicPlugEntryText(entry);
  const gemWords = ["gem", "gemstone", "stone", "pierre", "cabochon", "crystal", "cristal", "diamond", "diamant", "ruby", "rubis", "sapphire", "saphir", "emerald", "emeraude", "opal", "quartz", "topaz"];
  const metalWords = ["plug", "metal", "metallic", "metallique", "métallique", "or ", "gold", "argent", "silver", "platine", "platinum", "chrome", "rhodium"];
  let score = 0;
  if (gemWords.some((word) => text.includes(word))) score += 120;
  if (metalWords.some((word) => text.includes(word))) score -= 90;

  materials.forEach((material) => {
    if (isLikelyGemMaterial(material, text)) score += 55;
    if (isLikelyMetalMaterial(material, text)) score -= 58;
    const color = material?.color;
    if (!color?.isColor) return;
    const hsl = {};
    color.getHSL(hsl);
    if (hsl.s > 0.2) score += 42;
    if (hsl.s > 0.42) score += 28;
    if (hsl.s < 0.15 && hsl.l > 0.38) score -= 18;
    if (hsl.h > 0.075 && hsl.h < 0.17 && hsl.s > 0.22) score -= 36;
  });

  const volumeRatio = entry.volume / Math.max(largestVolume, 1e-9);
  score += (1 - THREE.MathUtils.clamp(volumeRatio, 0, 1)) * 24;
  return score;
}

function selectClassicPlugGemEntry(entries, meshOptions = {}) {
  if (!meshOptions.classicPlugGem || entries.length <= 1) return null;
  const largestVolume = entries[0]?.volume || 1;
  // Le corps principal du plug est toujours le plus grand solide et doit rester metallique.
  const gemCandidates = entries.slice(1);
  const scored = gemCandidates
    .map((entry) => ({ entry, score: scoreClassicPlugGemCandidate(entry, largestVolume) }))
    .sort((a, b) => b.score - a.score);
  const best = scored[0];
  const hasMaterialHint = best && best.score >= 42;
  return hasMaterialHint ? best.entry : gemCandidates[gemCandidates.length - 1];
}

function assignClassicPlugMaterialsByVolume(model, meshOptions = {}) {
  if (!meshOptions.classicPlugVolumeMaterials) return new Set();
  const entries = collectImportedMeshVolumeEntries(model);
  const assigned = new Set();
  if (!entries.length) return assigned;
  const largestVolume = entries[0]?.volume || 1;
  const gemEntry = selectClassicPlugGemEntry(entries, meshOptions);
  entries.forEach((entry) => {
    const sourceMaterial = Array.isArray(entry.mesh.material) ? entry.mesh.material[0] : entry.mesh.material;
    if (entry === gemEntry) {
      entry.mesh.material = makeGemMaterialFromSource(sourceMaterial, sourceMaterial?.name || entry.mesh.name || "pierre precieuse plug");
      entry.mesh.userData.classicPlugRole = "gem";
      centerGemMesh = entry.mesh;
    } else {
      entry.mesh.material = makeRhinoPolishedMetalMaterial(sourceMaterial?.name || entry.mesh.name || "plug metal poli");
      entry.mesh.userData.classicPlugRole = "metal";
    }
    assigned.add(entry.mesh);
  });
  logDebug("import", "Materiaux plug attribues par volume", {
    meshes: entries.length,
    gemDetected: Boolean(gemEntry),
    gemMesh: gemEntry?.mesh?.name || null,
    volumes: entries.map((entry) => ({ name: entry.mesh.name || entry.mesh.material?.name || "mesh", role: entry.mesh.userData.classicPlugRole, volume: Number(entry.volume.toPrecision(5)), gemScore: Number(scoreClassicPlugGemCandidate(entry, largestVolume).toFixed(2)) })),
  });
  return assigned;
}
function restoreCachedImportedModelState(model, meshOptions = {}) {
  const stats = collectImportStats(model);
  model.updateWorldMatrix(true, true);
  model.traverse((child) => {
    if (!child.isMesh) return;
    child.castShadow = meshOptions.geometricShadow !== false;
    child.receiveShadow = true;
    const explicitRole = child.userData?.classicPlugRole;
    if (explicitRole === "gem" || (explicitRole !== "metal" && !centerGemMesh && isLikelyGemMaterial(child.material, `${child.name} ${child.material?.name || ""}`.toLowerCase()))) {
      centerGemMesh = child;
    }
    child.userData.assignedMaterialName = Array.isArray(child.material) ?
       child.material.map((mat) => mat.name || mat.type).join(", ")
      : child.material?.name || child.material?.type;
    scheduleDiamondInternalRayTracing(child, "cache modele bibliotheque");
  });
  model.userData.importStats = stats;
  model.userData.meshOptions = meshOptions;
  return stats;
}
function normalizeImportedModel(model, meshOptions = {}) {
  const stats = collectImportStats(model);
  if (meshOptions.ignoreAnnotations !== false) stripNonMeshImportObjects(model);
  applyImportedMeshProcessing(model, meshOptions);
  model.updateWorldMatrix(true, true);
  const box = getVisibleMeshBox(model);
  if (isBoxEmpty(box)) {
    showNotice("Le modele ne contient pas de mesh visible exploitable.");
    return;
  }
  const size = box.getSize(new THREE.Vector3());
  const center = box.getCenter(new THREE.Vector3());
  const maxAxis = Math.max(size.x, size.y, size.z);
  const preserveRhinoFrame = meshOptions.preserveRhinoFrame === true;

  if (!preserveRhinoFrame) {
    const targetSize = 2.7;
    const scale = maxAxis > 0 ? targetSize / maxAxis : 1;

    model.position.sub(center);
    model.scale.setScalar(scale);
    model.updateWorldMatrix(true, true);

    const fittedBox = getVisibleMeshBox(model);
    const fittedCenter = fittedBox.getCenter(new THREE.Vector3());
    const fittedMin = fittedBox.min;
    model.position.x -= fittedCenter.x;
    model.position.z -= fittedCenter.z;
    model.position.y += floor.position.y - fittedMin.y + 0.08;
    model.userData.sceneUnitsPerMillimeter = scale;
    model.updateWorldMatrix(true, true);
  } else {
    model.userData.sceneUnitsPerMillimeter = 1;
  }

  const volumeAssignedMeshes = assignClassicPlugMaterialsByVolume(model, meshOptions);

  model.traverse((child) => {
    if (!child.isMesh) return;
    child.castShadow = meshOptions.geometricShadow !== false;
    child.receiveShadow = true;
    const name = `${child.name} ${child.material?.name || ""}`.toLowerCase();
    if (volumeAssignedMeshes.has(child)) {
      // Materiau deja attribue par volume pour les plugs Rhino classiques.
    } else if (name.includes("diamond") || name.includes("brilliant")) {
      child.material = diamondMaterial;
    } else if (name.includes("gem") || name.includes("sapphire") || name.includes("stone") || name.includes("padparadscha")) {
      child.material = centerGemMaterial;
      centerGemMesh = child;
    } else if (name.includes("pink") || name.includes("ruby")) {
      child.material = pinkPaveMaterial;
    } else if (name.includes("gold") || name.includes("metal") || name.includes("ring")) {
      child.material = makeRhinoPolishedMetalMaterial(child.material?.name || "rhino polished metal");
    } else if (isLikelyMetalMaterial(child.material, name)) {
      child.material = makeRhinoPolishedMetalMaterial(child.material?.name || "rhino precious metal");
    } else if (isLikelyGemMaterial(child.material, name)) {
      child.material = makeGemMaterialFromSource(child.material, name);
      if (!centerGemMesh) centerGemMesh = child;
    } else if (stats.meshes === 1) {
      child.material = makeRhinoPolishedMetalMaterial(child.material?.name || "rhino precious metal");
    }
    child.userData.assignedMaterialName = Array.isArray(child.material) ?
       child.material.map((mat) => mat.name || mat.type).join(", ")
      : child.material?.name || child.material?.type;
    smoothImportedMeshMaterial(child);
    scheduleDiamondInternalRayTracing(child, "import GLTF/OBJ/3DM");
  });

  addStemDecalToClassicPlug(model, meshOptions);
  if (!meshOptions.skipFrame) frameImportedModel(model, meshOptions);
  if (!meshOptions.skipFrame) updateSoftStudioShadow(model, meshOptions.softStudioShadow === true);
  model.userData.importStats = stats;
  model.userData.meshOptions = meshOptions;
  if (stats.meshes > 0) {
    logDebug("import", preserveRhinoFrame ? "Modèle importé avec repère Rhino conservé" : "Modèle importé normalisé", {
      ...stats,
      preserveRhinoFrame,
      rhinoZUp: meshOptions.rhinoZUp !== false,
      bounds: {
        size: { x: size.x, y: size.y, z: size.z },
        center: { x: center.x, y: center.y, z: center.z },
      },
    });
    showNotice(`Import OK : ${stats.meshes} mesh(s), ${stats.lines} ligne(s)/cotation(s) ignorees, ${stats.vertices} sommets.`);
  }
}

function collectImportStats(model) {
  const stats = { meshes: 0, lines: 0, points: 0, vertices: 0, triangles: 0 };
  model.traverse((child) => {
    if (child.isMesh) {
      stats.meshes += 1;
      const positionCount = child.geometry?.getAttribute?.("position")?.count || 0;
      stats.vertices += positionCount;
      stats.triangles += child.geometry?.index ? Math.floor(child.geometry.index.count / 3) : Math.floor(positionCount / 3);
    } else if (child.isLine || child.isLineSegments) {
      stats.lines += 1;
    } else if (child.isPoints) {
      stats.points += 1;
    }
  });
  return stats;
}

function applyImportedMeshProcessing(model, options = {}, meta = {}) {
  const processing = {
    recomputeNormals: options.recomputeNormals === true,
    doubleSided: options.doubleSided === true,
    weldTolerance: Number(options.weldTolerance || 0),
    smoothAngle: Number(options.smoothAngle || 0),
    visualSubdivisions: Math.max(0, Math.min(3, Number(options.visualSubdivisions || 0))),
    surfaceRelaxation: Math.max(0, Math.min(8, Number(options.surfaceRelaxation || 0))),
    relaxationStrength: Math.max(0, Math.min(0.85, Number(options.relaxationStrength ?? 0.42))),
    preserveAngle: Math.max(1, Math.min(89, Number(options.preserveAngle ?? 42))),
    weightedNormals: options.weightedNormals === true,
    creaseNormals: options.creaseNormals !== false,
    chordTolerance: Number(options.chordTolerance || 0),
    angleTolerance: Number(options.angleTolerance || 0),
    maxEdgeLength: Number(options.maxEdgeLength || 0),
  };

  model.traverse((child) => {
    if (!child.isMesh || !child.geometry) return;
    if (processing.weldTolerance > 0 && !Array.isArray(child.material)) {
      child.geometry = weldGeometryVertices(child.geometry, processing.weldTolerance);
    }
    for (let i = 0; i < processing.visualSubdivisions; i += 1) {
      child.geometry = subdivideTriangleGeometry(child.geometry);
    }
    if (processing.surfaceRelaxation > 0 && processing.relaxationStrength > 0) {
      relaxSurfaceGeometry(child.geometry, processing.surfaceRelaxation, processing.relaxationStrength, processing.preserveAngle);
    }
    if (processing.weightedNormals) computeWeightedSmoothNormals(child.geometry, processing.smoothAngle || defaultRhinoMeshOptions.smoothAngle);
    else if (processing.recomputeNormals && processing.creaseNormals) {
      child.geometry = computeCreasedSmoothNormals(child.geometry, processing.smoothAngle || defaultRhinoMeshOptions.smoothAngle);
    } else if (processing.recomputeNormals) {
      child.geometry.computeVertexNormals();
    }
    child.geometry.normalizeNormals();
    if (processing.doubleSided) {
      const materials = Array.isArray(child.material) ? child.material : [child.material];
      materials.forEach((mat) => {
        if (!mat) return;
        mat.side = THREE.DoubleSide;
        mat.flatShading = false;
        mat.needsUpdate = true;
      });
    }
    smoothImportedMeshMaterial(child);
    child.userData.meshProcessing = processing;
  });

  if (Object.keys(options).length > 0 && !meta.quiet) {
    logDebug("import", "Post-traitement maillage appliqué", {
      ...processing,
      note: processing.surfaceRelaxation > 0 ?
         "Relaxation g\u00e9om\u00e9trique expérimentale activ\u00e9e. Si le rendu produit des zones noires/blanches ou déforme la mati\u00e8re, remettre Relaxation surface et Force relaxation à 0."
        : "Les tolérances corde/angle/arête sont conservées comme cible de tessellation BREP externe. Relaxation géométrique désactivée par défaut pour protéger le rendu matière.",
    });
  }
}

function smoothImportedMeshMaterial(mesh) {
  const materials = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
  materials.forEach((mat) => {
    if (!mat) return;
    mat.flatShading = false;
    mat.side = mat.side || THREE.FrontSide;
    mat.needsUpdate = true;
  });
}

function relaxSurfaceGeometry(geometry, iterations = 2, strength = 0.42, preserveAngle = 42) {
  const position = geometry.getAttribute("position");
  if (!position || position.count < 4) return geometry;

  const sourceIndex = geometry.index?.array;
  const triangleCount = sourceIndex ? Math.floor(sourceIndex.length / 3) : Math.floor(position.count / 3);
  if (triangleCount <= 0) return geometry;

  const precision = 100000;
  const keyToUnique = new Map();
  const uniqueToVertices = [];
  const vertexToUnique = new Array(position.count);
  const uniquePositions = [];

  for (let i = 0; i < position.count; i += 1) {
    const key = `${Math.round(position.getX(i) * precision)},${Math.round(position.getY(i) * precision)},${Math.round(position.getZ(i) * precision)}`;
    let uniqueIndex = keyToUnique.get(key);
    if (uniqueIndex === undefined) {
      uniqueIndex = uniquePositions.length;
      keyToUnique.set(key, uniqueIndex);
      uniqueToVertices.push([]);
      uniquePositions.push(new THREE.Vector3(position.getX(i), position.getY(i), position.getZ(i)));
    }
    uniqueToVertices[uniqueIndex].push(i);
    vertexToUnique[i] = uniqueIndex;
  }

  const neighbors = Array.from({ length: uniquePositions.length }, () => new Set());
  const edgeFaces = new Map();
  const frozen = new Set();
  const edgeKey = (a, b) => (a < b ? `${a}:${b}` : `${b}:${a}`);
  const addEdge = (a, b, faceNormal) => {
    if (a === b) return;
    neighbors[a].add(b);
    neighbors[b].add(a);
    const key = edgeKey(a, b);
    if (!edgeFaces.has(key)) edgeFaces.set(key, []);
    edgeFaces.get(key).push(faceNormal.clone());
  };
  const sourceVertex = (triangleVertex) => sourceIndex ? sourceIndex[triangleVertex] : triangleVertex;

  for (let t = 0; t < triangleCount; t += 1) {
    const ia = vertexToUnique[sourceVertex(t * 3)];
    const ib = vertexToUnique[sourceVertex(t * 3 + 1)];
    const ic = vertexToUnique[sourceVertex(t * 3 + 2)];
    if (ia === ib || ib === ic || ic === ia) continue;
    const a = uniquePositions[ia];
    const b = uniquePositions[ib];
    const c = uniquePositions[ic];
    const faceNormal = new THREE.Vector3().subVectors(b, a).cross(new THREE.Vector3().subVectors(c, a)).normalize();
    addEdge(ia, ib, faceNormal);
    addEdge(ib, ic, faceNormal);
    addEdge(ic, ia, faceNormal);
  }

  const preserveCos = Math.cos(THREE.MathUtils.degToRad(preserveAngle));
  edgeFaces.forEach((faces, key) => {
    if (faces.length < 2) {
      key.split(":").forEach((part) => frozen.add(Number(part)));
      return;
    }
    for (let i = 0; i < faces.length; i += 1) {
      for (let j = i + 1; j < faces.length; j += 1) {
        if (faces[i].dot(faces[j]) < preserveCos) {
          key.split(":").forEach((part) => frozen.add(Number(part)));
          return;
        }
      }
    }
  });

  const taubinPass = (lambda) => {
    const next = uniquePositions.map((p) => p.clone());
    uniquePositions.forEach((point, index) => {
      if (frozen.has(index) || neighbors[index].size === 0) return;
      const average = new THREE.Vector3();
      neighbors[index].forEach((neighbor) => average.add(uniquePositions[neighbor]));
      average.multiplyScalar(1 / neighbors[index].size);
      next[index].add(new THREE.Vector3().subVectors(average, point).multiplyScalar(lambda));
    });
    next.forEach((point, index) => uniquePositions[index].copy(point));
  };

  const safeIterations = Math.max(0, Math.min(8, Math.floor(iterations)));
  const lambda = 0.48 * strength;
  const mu = -0.52 * strength;
  for (let i = 0; i < safeIterations; i += 1) {
    taubinPass(lambda);
    taubinPass(mu);
  }

  uniqueToVertices.forEach((vertices, uniqueIndex) => {
    const point = uniquePositions[uniqueIndex];
    vertices.forEach((vertexIndex) => position.setXYZ(vertexIndex, point.x, point.y, point.z));
  });
  position.needsUpdate = true;
  geometry.computeBoundingBox();
  geometry.computeBoundingSphere();
  return geometry;
}

function weldGeometryVertices(geometry, tolerance) {
  const position = geometry.getAttribute("position");
  if (!position || tolerance <= 0) return geometry;

  const sourceIndex = geometry.index?.array;
  const vertexCount = sourceIndex ? sourceIndex.length : position.count;
  const keyToIndex = new Map();
  const positions = [];
  const indices = [];
  const invTolerance = 1 / tolerance;

  for (let i = 0; i < vertexCount; i += 1) {
    const sourceVertex = sourceIndex ? sourceIndex[i] : i;
    const x = position.getX(sourceVertex);
    const y = position.getY(sourceVertex);
    const z = position.getZ(sourceVertex);
    const key = `${Math.round(x * invTolerance)},${Math.round(y * invTolerance)},${Math.round(z * invTolerance)}`;
    let nextIndex = keyToIndex.get(key);
    if (nextIndex === undefined) {
      nextIndex = positions.length / 3;
      keyToIndex.set(key, nextIndex);
      positions.push(x, y, z);
    }
    indices.push(nextIndex);
  }

  const welded = new THREE.BufferGeometry();
  welded.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  welded.setIndex(indices);
  welded.computeVertexNormals();
  welded.computeBoundingBox();
  welded.computeBoundingSphere();
  geometry.dispose();
  return welded;
}

function subdivideTriangleGeometry(geometry) {
  const position = geometry.getAttribute("position");
  if (!position) return geometry;

  const sourceIndex = geometry.index?.array;
  const triangleCount = sourceIndex ? Math.floor(sourceIndex.length / 3) : Math.floor(position.count / 3);
  if (triangleCount <= 0) return geometry;

  const nextPositions = [];
  const nextGroups = [];
  const vertex = (index) => {
    const source = sourceIndex ? sourceIndex[index] : index;
    return new THREE.Vector3(position.getX(source), position.getY(source), position.getZ(source));
  };
  const pushTriangle = (a, b, c) => {
    nextPositions.push(a.x, a.y, a.z, b.x, b.y, b.z, c.x, c.y, c.z);
  };

  const materialIndexForTriangle = (triangleIndex) => {
    if (!geometry.groups?.length) return 0;
    const sourceStart = sourceIndex ? triangleIndex * 3 : triangleIndex * 3;
    const group = geometry.groups.find((item) => sourceStart >= item.start && sourceStart < item.start + item.count);
    return group?.materialIndex || 0;
  };
  let activeGroup = null;
  const addGroupTriangles = (materialIndex, triangleAmount) => {
    const start = (nextPositions.length / 3) - triangleAmount * 3;
    const count = triangleAmount * 3;
    if (activeGroup && activeGroup.materialIndex === materialIndex && activeGroup.start + activeGroup.count === start) {
      activeGroup.count += count;
      return;
    }
    activeGroup = { start, count, materialIndex };
    nextGroups.push(activeGroup);
  };

  for (let i = 0; i < triangleCount; i += 1) {
    const a = vertex(i * 3);
    const b = vertex(i * 3 + 1);
    const c = vertex(i * 3 + 2);
    const ab = a.clone().lerp(b, 0.5);
    const bc = b.clone().lerp(c, 0.5);
    const ca = c.clone().lerp(a, 0.5);
    pushTriangle(a, ab, ca);
    pushTriangle(ab, b, bc);
    pushTriangle(ca, bc, c);
    pushTriangle(ab, bc, ca);
    addGroupTriangles(materialIndexForTriangle(i), 4);
  }

  const subdivided = new THREE.BufferGeometry();
  subdivided.setAttribute("position", new THREE.Float32BufferAttribute(nextPositions, 3));
  nextGroups.forEach((group) => subdivided.addGroup(group.start, group.count, group.materialIndex));
  subdivided.computeVertexNormals();
  subdivided.computeBoundingBox();
  subdivided.computeBoundingSphere();
  geometry.dispose();
  return subdivided;
}

function computeWeightedSmoothNormals(geometry, smoothAngle = 82) {
  const position = geometry.getAttribute("position");
  if (!position) return;

  const source = geometry.index ? geometry.toNonIndexed() : geometry;
  const sourcePosition = source.getAttribute("position");
  const vertexCount = sourcePosition.count;
  const triangleCount = Math.floor(vertexCount / 3);
  const cosLimit = Math.cos(THREE.MathUtils.degToRad(THREE.MathUtils.clamp(smoothAngle, 1, 89)));
  const normals = new Float32Array(vertexCount * 3);
  const faceRecords = [];
  const vertexFace = new Array(vertexCount);
  const buckets = new Map();
  const a = new THREE.Vector3();
  const b = new THREE.Vector3();
  const c = new THREE.Vector3();
  const ab = new THREE.Vector3();
  const ac = new THREE.Vector3();
  const face = new THREE.Vector3();
  const sum = new THREE.Vector3();
  const precision = 100000;
  const keyFor = (i) => {
    const x = Math.round(sourcePosition.getX(i) * precision);
    const y = Math.round(sourcePosition.getY(i) * precision);
    const z = Math.round(sourcePosition.getZ(i) * precision);
    return `${x},${y},${z}`;
  };

  for (let t = 0; t < triangleCount; t += 1) {
    const ia = t * 3;
    const ib = ia + 1;
    const ic = ia + 2;
    a.set(sourcePosition.getX(ia), sourcePosition.getY(ia), sourcePosition.getZ(ia));
    b.set(sourcePosition.getX(ib), sourcePosition.getY(ib), sourcePosition.getZ(ib));
    c.set(sourcePosition.getX(ic), sourcePosition.getY(ic), sourcePosition.getZ(ic));
    ab.subVectors(b, a);
    ac.subVectors(c, a);
    face.crossVectors(ab, ac);
    const area = face.length();
    if (area > 0) face.normalize();
    const record = { normal: face.clone(), weight: Math.max(area, 0.000001) };
    faceRecords[t] = record;
    [ia, ib, ic].forEach((vertexIndex) => {
      vertexFace[vertexIndex] = t;
      const key = keyFor(vertexIndex);
      if (!buckets.has(key)) buckets.set(key, []);
      buckets.get(key).push(vertexIndex);
    });
  }

  for (let i = 0; i < vertexCount; i += 1) {
    const own = faceRecords[vertexFace[i]];
    const bucket = buckets.get(keyFor(i)) || [i];
    sum.set(0, 0, 0);
    bucket.forEach((candidateVertex) => {
      const candidate = faceRecords[vertexFace[candidateVertex]];
      if (!candidate || !own || candidate.normal.dot(own.normal) < cosLimit) return;
      sum.addScaledVector(candidate.normal, candidate.weight);
    });
    if (sum.lengthSq() === 0) sum.copy(own?.normal || new THREE.Vector3(0, 1, 0));
    sum.normalize();
    normals[i * 3] = sum.x;
    normals[i * 3 + 1] = sum.y;
    normals[i * 3 + 2] = sum.z;
  }

  source.setAttribute("normal", new THREE.BufferAttribute(normals, 3));
  source.attributes.normal.needsUpdate = true;
  source.computeBoundingBox();
  source.computeBoundingSphere();
  if (source !== geometry) {
    geometry.copy(source);
    source.dispose();
  }
}

function computeCreasedSmoothNormals(geometry, smoothAngle = 68) {
  const source = geometry.index ? geometry.toNonIndexed() : geometry.clone();
  const position = source.getAttribute("position");
  if (!position) return geometry;

  const vertexCount = position.count;
  const triangleCount = Math.floor(vertexCount / 3);
  const cosLimit = Math.cos(THREE.MathUtils.degToRad(THREE.MathUtils.clamp(smoothAngle, 1, 89)));
  const normals = new Float32Array(vertexCount * 3);
  const faceNormals = [];
  const cornerFaces = new Array(vertexCount);
  const buckets = new Map();
  const a = new THREE.Vector3();
  const b = new THREE.Vector3();
  const c = new THREE.Vector3();
  const edge1 = new THREE.Vector3();
  const edge2 = new THREE.Vector3();
  const face = new THREE.Vector3();
  const sum = new THREE.Vector3();
  const precision = 100000;
  const keyFor = (i) => {
    const x = Math.round(position.getX(i) * precision);
    const y = Math.round(position.getY(i) * precision);
    const z = Math.round(position.getZ(i) * precision);
    return `${x},${y},${z}`;
  };

  for (let t = 0; t < triangleCount; t += 1) {
    const ia = t * 3;
    const ib = ia + 1;
    const ic = ia + 2;
    a.set(position.getX(ia), position.getY(ia), position.getZ(ia));
    b.set(position.getX(ib), position.getY(ib), position.getZ(ib));
    c.set(position.getX(ic), position.getY(ic), position.getZ(ic));
    edge1.subVectors(b, a);
    edge2.subVectors(c, a);
    face.crossVectors(edge1, edge2);
    const area = face.length();
    if (area > 0) face.normalize();
    const record = { normal: face.clone(), weight: Math.max(area, 0.000001) };
    faceNormals[t] = record;
    [ia, ib, ic].forEach((vertexIndex) => {
      cornerFaces[vertexIndex] = t;
      const key = keyFor(vertexIndex);
      if (!buckets.has(key)) buckets.set(key, []);
      buckets.get(key).push(t);
    });
  }

  for (let i = 0; i < vertexCount; i += 1) {
    const own = faceNormals[cornerFaces[i]];
    const bucket = buckets.get(keyFor(i)) || [];
    sum.set(0, 0, 0);
    bucket.forEach((faceIndex) => {
      const candidate = faceNormals[faceIndex];
      if (!candidate || candidate.normal.dot(own.normal) < cosLimit) return;
      sum.addScaledVector(candidate.normal, candidate.weight);
    });
    if (sum.lengthSq() === 0) sum.copy(own.normal);
    sum.normalize();
    normals[i * 3] = sum.x;
    normals[i * 3 + 1] = sum.y;
    normals[i * 3 + 2] = sum.z;
  }

  source.setAttribute("normal", new THREE.BufferAttribute(normals, 3));
  source.attributes.normal.needsUpdate = true;
  source.computeBoundingBox();
  source.computeBoundingSphere();
  if (source !== geometry) geometry.dispose();
  return source;
}

function stripNonMeshImportObjects(model) {
  const removable = [];
  model.traverse((child) => {
    if (child !== model && (child.isLine || child.isLineSegments || child.isPoints)) {
      removable.push(child);
    }
  });
  removable.forEach((child) => child.parent?.remove(child));
}

function getVisibleMeshBox(model) {
  const box = new THREE.Box3();
  let hasMesh = false;
  const childBox = new THREE.Box3();
  model.updateWorldMatrix(true, true);
  model.traverse((child) => {
    if (
      !child.isMesh ||
      !child.geometry ||
      child.parent === reflectionRig ||
      child.userData.customReflection ||
      child.userData.parametricGemEffect ||
      child.userData.spectralOffset ||
      child.userData.stemDecal
    ) {
      return;
    }
    child.geometry.computeBoundingBox();
    childBox.copy(child.geometry.boundingBox).applyMatrix4(child.matrixWorld);
    if (Number.isFinite(childBox.min.x) && Number.isFinite(childBox.max.x)) {
      box.union(childBox);
      hasMesh = true;
    }
  });
  if (!hasMesh) box.makeEmpty();
  return box;
}

function getModelMeshBox(model, predicate = () => true) {
  const box = new THREE.Box3();
  const childBox = new THREE.Box3();
  let hasMesh = false;
  model.updateWorldMatrix(true, true);
  model.traverse((child) => {
    if (!child.isMesh || child.visible === false || child.userData?.stemDecal || !child.geometry?.attributes?.position || !predicate(child)) return;
    if (!child.geometry.boundingBox) child.geometry.computeBoundingBox();
    childBox.copy(child.geometry.boundingBox).applyMatrix4(child.matrixWorld);
    if (Number.isFinite(childBox.min.x) && Number.isFinite(childBox.max.x)) {
      box.union(childBox);
      hasMesh = true;
    }
  });
  if (!hasMesh) box.makeEmpty();
  return box;
}

function frameClassicPlugGemModel(model, modelBox, safeRadius, distance, panelRatio = 0) {
  if (!centerGemMesh?.isMesh) return false;
  let gemBelongsToModel = false;
  model.traverse((child) => {
    if (child === centerGemMesh) gemBelongsToModel = true;
  });
  if (!gemBelongsToModel) return false;

  const gemBox = getVisibleMeshBox(centerGemMesh);
  const metalBox = getModelMeshBox(model, (child) => child !== centerGemMesh && child.userData?.classicPlugRole !== "gem");
  if (isBoxEmpty(gemBox) || isBoxEmpty(metalBox) || isBoxEmpty(modelBox)) return false;

  const gemCenter = gemBox.getCenter(new THREE.Vector3());
  const metalCenter = metalBox.getCenter(new THREE.Vector3());
  const modelCenter = modelBox.getCenter(new THREE.Vector3());
  const frontDirection = new THREE.Vector3().subVectors(gemCenter, metalCenter);
  frontDirection.y *= 0.25;
  if (frontDirection.lengthSq() < 0.000001) frontDirection.set(-1, 0, 0.25);
  frontDirection.normalize();

  const up = new THREE.Vector3(0, 1, 0);
  const sideDirection = new THREE.Vector3().crossVectors(up, frontDirection);
  if (sideDirection.lengthSq() < 0.000001) sideDirection.set(0, 0, 1);
  sideDirection.normalize();

  const viewDirection = frontDirection
    .clone()
    .multiplyScalar(1.0)
    .addScaledVector(up, 0.52)
    .addScaledVector(sideDirection, 0.28)
    .normalize();
  const target = modelCenter.clone().lerp(gemCenter, 0.42);
  const cameraDistance = distance * (1.02 + panelRatio * 0.18);

  controls.target.copy(target);
  camera.position.copy(target).addScaledVector(viewDirection, cameraDistance);
  camera.near = Math.max(0.001, safeRadius / 2000);
  camera.far = Math.max(1000, cameraDistance * 8, target.length() + cameraDistance * 4);
  camera.updateProjectionMatrix();
  controls.minDistance = Math.max(0.01, safeRadius * 0.02);
  controls.maxDistance = Math.max(6, cameraDistance * 6);
  controls.update();

  logDebug("camera", "Cadrage plug avec pierre face camera", {
    gemCenter: { x: gemCenter.x, y: gemCenter.y, z: gemCenter.z },
    metalCenter: { x: metalCenter.x, y: metalCenter.y, z: metalCenter.z },
    target: { x: target.x, y: target.y, z: target.z },
    direction: { x: viewDirection.x, y: viewDirection.y, z: viewDirection.z },
    radius: safeRadius,
  });
  return true;
}

function frameImportedModel(model, meshOptions = {}) {
  const box = getVisibleMeshBox(model);
  if (isBoxEmpty(box)) return;
  const size = box.getSize(new THREE.Vector3());
  const center = box.getCenter(new THREE.Vector3());
  const sidePanel = document.querySelector(".controls");
  const panelWidth = sidePanel && !sidePanel.classList.contains("is-collapsed") ? sidePanel.getBoundingClientRect().width : 0;
  const panelRatio = window.innerWidth > 0 ? THREE.MathUtils.clamp(panelWidth / window.innerWidth, 0, 0.42) : 0;
  const radius = Math.max(size.x, size.y, size.z) * (0.8 + panelRatio * 0.45);
  const safeRadius = Math.max(radius, 0.8);
  const distance = safeRadius * 2.7;

  if (meshOptions.classicPlugGem && frameClassicPlugGemModel(model, box, safeRadius, distance, panelRatio)) return;

  controls.target.copy(center);
  camera.position.set(center.x + safeRadius * 1.65, center.y + safeRadius * 0.9, center.z + safeRadius * 1.9);
  camera.near = Math.max(0.001, safeRadius / 2000);
  camera.far = Math.max(1000, distance * 8, center.length() + distance * 4);
  camera.updateProjectionMatrix();
  controls.minDistance = Math.max(0.01, safeRadius * 0.02);
  controls.maxDistance = Math.max(6, distance * 6);
  controls.update();
  logDebug("camera", "Cadrage modele importe ajuste", {
    size: { x: size.x, y: size.y, z: size.z },
    center: { x: center.x, y: center.y, z: center.z },
    radius: safeRadius,
    near: camera.near,
    far: camera.far,
  });
}function frameSelectedObject(object) {
  if (!object?.isMesh) return false;
  object.updateWorldMatrix(true, false);
  const box = getVisibleMeshBox(object);
  if (isBoxEmpty(box)) return false;
  const size = box.getSize(new THREE.Vector3());
  const center = box.getCenter(new THREE.Vector3());
  const radius = Math.max(size.x, size.y, size.z) * 0.72;
  const safeRadius = Math.max(radius, 0.035);
  const verticalFov = THREE.MathUtils.degToRad(camera.fov);
  const horizontalFov = 2 * Math.atan(Math.tan(verticalFov * 0.5) * camera.aspect);
  const distance = Math.max(
    safeRadius / Math.sin(verticalFov * 0.5),
    safeRadius / Math.sin(horizontalFov * 0.5),
  ) * 1.28;
  const viewDirection = camera.position.clone().sub(controls.target);
  if (viewDirection.lengthSq() < 0.000001) viewDirection.set(1.4, 0.8, 1.6);
  viewDirection.normalize();
  controls.target.copy(center);
  camera.position.copy(center).addScaledVector(viewDirection, distance);
  camera.near = Math.max(0.001, safeRadius / 600);
  camera.far = Math.max(1000, distance * 12, center.length() + distance * 5);
  camera.updateProjectionMatrix();
  controls.minDistance = Math.max(0.005, safeRadius * 0.08);
  controls.maxDistance = Math.max(6, distance * 8);
  controls.update();
  logDebug("camera", "Zoom sélection ajusté", {
    object: object.name || object.uuid,
    size: { x: size.x, y: size.y, z: size.z },
    center: { x: center.x, y: center.y, z: center.z },
    radius: safeRadius,
  });
  return true;
}

function repairCurrentImport() {
  logDebug("repair", "Reparation import demandee");
  const boxBefore = getVisibleMeshBox(root);
  forceImportedVisibility(root);
  const boxAfter = getVisibleMeshBox(root);
  if (!isBoxEmpty(boxAfter)) {
    liftModelAboveFloor(root);
    frameImportedModel(root);
    prepareObjectMaterialEditor();
    const size = boxAfter.getSize(new THREE.Vector3());
    logDebug("repair", "Import réparé", { size: size.toArray(), objects: editableObjects.length });
    showNotice(`Import réparé : taille visible ${size.x.toFixed(2)} x ${size.y.toFixed(2)} x ${size.z.toFixed(2)}.`);
  } else if (!isBoxEmpty(boxBefore)) {
    frameImportedModel(root);
    showNotice("Import recadre sur les meshes visibles.");
  } else {
    showNotice("Aucun mesh visible trouve dans la scene courante.");
  }
}

function forceImportedVisibility(model) {
  model.traverse((child) => {
    if (!child.isMesh) return;
    child.visible = true;
    child.frustumCulled = false;
    child.castShadow = true;
    child.receiveShadow = true;
    const mat = Array.isArray(child.material) ? child.material[0] : child.material;
    if (!mat || mat.opacity < 0.05 || mat.visible === false) {
      child.material = makeMetalMaterialFromPreset(settings.metalPreset, "Métal réparé");
      return;
    }
    mat.visible = true;
    mat.transparent = false;
    mat.opacity = 1;
    mat.side = THREE.DoubleSide;
    mat.depthWrite = true;
    mat.needsUpdate = true;
  });
}

function liftModelAboveFloor(model) {
  const box = getVisibleMeshBox(model);
  if (isBoxEmpty(box)) return;
  const delta = floor.position.y - box.min.y + 0.08;
  model.position.y += delta;
  model.updateWorldMatrix(true, true);
}

function isBoxEmpty(box) {
  return (
    !Number.isFinite(box.min.x) ||
    !Number.isFinite(box.max.x) ||
    box.max.x < box.min.x ||
    box.max.y < box.min.y ||
    box.max.z < box.min.z
  );
}

function isLikelyMetalMaterial(material, name) {
  if (!material) return false;
  const metalWords = ["or ", "gold", "argent", "silver", "platine", "platinum", "metal", "metallic", "métal", "métallique", "rhodium", "chrome"];
  if (metalWords.some((word) => name.includes(word))) return true;
  const color = material.color || new THREE.Color("#ffffff");
  const hsl = {};
  color.getHSL(hsl);
  const brightNeutral = hsl.s < 0.18 && hsl.l > 0.42;
  const yellowMetal = hsl.h > 0.08 && hsl.h < 0.16 && hsl.s > 0.28;
  return Boolean(material.metalness > 0.35 || brightNeutral || yellowMetal);
}

function isLikelyGemMaterial(material, name) {
  if (!material) return false;
  const gemWords = ["gem", "stone", "pierre", "sapphire", "rubis", "ruby", "emerald", "diamant", "diamond", "opal", "perle", "pearl"];
  if (gemWords.some((word) => name.includes(word))) return true;
  const color = material.color || new THREE.Color("#ffffff");
  const hsl = {};
  color.getHSL(hsl);
  return hsl.s > 0.24 || material.transparent || material.opacity < 0.92 || material.transmission > 0.1;
}

function getGemPresetColor(preset = {}, material = null) {
  const source = preset.color || material?.color || settings.gemColor || '#ffffff';
  return source?.isColor ? source.clone() : new THREE.Color(source);
}

function isColorlessGemPreset(preset = {}, material = null) {
  const label = String(preset.label || material?.name || '').toLowerCase();
  const color = getGemPresetColor(preset, material);
  const hsl = {};
  color.getHSL(hsl);
  const mentionsColorless =
    label.includes('diamant') ||
    label.includes('diamond') ||
    label.includes('clear') ||
    label.includes('clair') ||
    label.includes('transparent');
  const mentionsTint = ['noir', 'black', 'cognac', 'champagne', 'rose', 'pink', 'jaune', 'yellow', 'bleu', 'blue', 'vert', 'green', 'aurore', 'boreale'].some((word) => label.includes(word));
  return mentionsColorless && !mentionsTint && hsl.s < 0.26 && hsl.l > 0.62;
}

function isClearGemPreset(preset = {}, material = null) {
  return isColorlessGemPreset(preset, material);
}

function getGemPresetNumber(preset = {}, material = null, key, fallback) {
  const value = preset[key] ?? material?.[key] ?? fallback;
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function isTransparentOpticalGemPreset(preset = {}, material = null) {
  if (preset.opaque || preset.pearl) return false;
  const label = String(preset.label || material?.name || "").toLowerCase();
  const transmission = getGemPresetNumber(preset, material, "transmission", 0);
  const ior = getGemPresetNumber(preset, material, "ior", 1.5);
  return (
    isClearGemPreset(preset, material) ||
    transmission >= 0.16 ||
    ior >= 1.52 ||
    label.includes("saphir") ||
    label.includes("ruby") ||
    label.includes("rubis") ||
    label.includes("topaze") ||
    label.includes("zircon") ||
    label.includes("cristal") ||
    label.includes("quartz")
  );
}

function getGemIorSpread(preset = {}, material = null) {
  const ior = getGemPresetNumber(preset, material, "ior", 1.54);
  const dispersion = getGemPresetNumber(preset, material, "dispersion", settings.dispersion || 0.35);
  const diamondFactor = clamp01((ior - 1.62) / 0.8);
  const spread = 0.006 + dispersion * 0.038 + diamondFactor * 0.018;
  return THREE.MathUtils.clamp(spread, 0.006, 0.078);
}

function getGemOpticalQualityProfile(preset = {}, material = null) {
  const isOpaque = Boolean(preset.opaque);
  const isPearl = Boolean(preset.pearl);
  const isCabochon = Boolean(preset.cabochon);
  const isClearGem = isClearGemPreset(preset, material);
  const isOpticalGem = isTransparentOpticalGemPreset(preset, material);
  const ior = getGemPresetNumber(preset, material, 'ior', settings.gemIor || 1.54);
  const transmission = getGemPresetNumber(preset, material, 'transmission', settings.gemTransmission || 0.6);
  const dispersion = getGemPresetNumber(preset, material, 'dispersion', settings.dispersion || 0.35);
  const bodyColor = getGemPresetColor(preset, material);
  const hsl = {};
  bodyColor.getHSL(hsl);
  const colorDepth = clamp01(1 - hsl.l);
  const baseColorStrength = isClearGem ? 0.04 : isOpaque ? 0.9 : isPearl ? 0.38 : isCabochon ? 0.74 : 0.66;
  const bodyColorStrength = isClearGem ? 0.04 : THREE.MathUtils.clamp(baseColorStrength + hsl.s * 0.38 + colorDepth * 0.18, 0.36, 1.0);
  const bodyBoost = isClearGem ? 1.0 : isOpaque ? 1.08 : isPearl ? 1.04 : isCabochon ? 1.18 : 1.14;
  const micro = getDiamondMicroRoughness();
  const polishRoughness = isClearGem ?
     micro
    : isCabochon ?
       Math.min(0.055, Math.max(0.022, preset.roughness ?? 0.04))
      : Math.min(0.032, Math.max(0.01, preset.roughness ?? 0.024));
  return {
    isOpaque,
    isPearl,
    isCabochon,
    isClearGem,
    isOpticalGem,
    ior,
    iorSpread: getGemIorSpread(preset, material),
    bodyColorStrength,
    bodyBoost,
    pbrTransmission: isOpaque ? Math.min(transmission, 0.08) : isPearl ? Math.min(transmission, 0.26) : isClearGem ? 0.92 : isCabochon ? THREE.MathUtils.clamp(transmission, 0.22, 0.46) : Math.max(transmission, 0.72),
    roughness: isOpaque ? Math.min(preset.roughness ?? 0.11, 0.14) : polishRoughness,
    clearcoatRoughness: isOpaque ? 0.075 : isPearl ? 0.16 : isCabochon ? 0.035 : Math.max(micro, 0.012),
    // The studio environment already has its own intensity. Keep the material
    // multiplier photographic so pale crystal does not clip to pure white.
    envMapIntensity: isOpaque ? 1.35 : isClearGem ? 3.15 : isCabochon ? 1.75 : 2.25,
    thickness: isOpaque ? 0.32 : isPearl ? 0.75 : isClearGem ? 2.15 : isCabochon ? 1.62 : 1.95,
    attenuationDistance: isOpaque ? 0.85 : isClearGem ? 48.0 : isCabochon ? 2.15 : 3.6,
    opacity: isOpaque ? 1.0 : isClearGem ? 0.96 : isCabochon ? 0.985 : 0.94,
    iridescence: isClearGem ? 0.38 : isPearl ? 0.46 : isCabochon ? 0.16 : 0.22,
    firePower: isOpaque ? 0.24 : isClearGem ? 1.58 : isCabochon ? 0.98 : 1.18,
    internalDepth: isOpaque ? 0.28 : isClearGem ? 1.25 : isCabochon ? 0.92 : 1.08,
    facetScale: isClearGem ? 32.0 : isCabochon ? 16.0 : 22.0,
    milky: isClearGem ? 0.0 : isPearl ? 0.5 : isCabochon ? 0.08 : 0.03,
    bouncePower: isOpaque ? 0.34 : isClearGem ? 2.0 : isCabochon ? 1.35 : 1.55,
    clearness: isOpaque ? 0.08 : isClearGem ? 1.0 : isCabochon ? 0.82 : 0.92,
    fresnelBoost: isClearGem ? 1.22 : isCabochon ? 1.08 : 1.14,
    fireStrength: (isClearGem ? 1.75 : isCabochon ? 1.22 : 1.42) + THREE.MathUtils.clamp(dispersion, 0, 1.4) * 0.72,
  };
}

function shouldRenderGemAsSolidOptical(optical = {}) {
  return Boolean(optical.isOpticalGem && !optical.isOpaque && !optical.isPearl && (optical.isClearGem || !optical.isCabochon));
}

function getGemChannelIors(preset = {}, material = null) {
  const base = Math.max(1.001, getGemPresetNumber(preset, material, "ior", 2.417));
  const spread = getGemIorSpread(preset, material);
  return [
    Math.max(1.001, base - spread * 0.34),
    base,
    Math.max(1.001, base + spread * 0.78),
  ];
}

const DIAMOND_RT_DEFAULT_BOUNCES = 8;
const DIAMOND_RT_MAX_BOUNCES = 16;
const DIAMOND_RT_DEFAULT_BEER_ABSORPTION = 0.006;
const DIAMOND_RT_MAX_BEER_ABSORPTION = 0.05;
const DIAMOND_MICRO_ROUGHNESS_MAX = 0.08;
const DIAMOND_HDRI_REFLECTION_MAX = 2.5;
const DIAMOND_CHANNEL_IORS = [2.407, 2.417, 2.451];
function getDiamondInternalBounceCount() {
  return Math.round(THREE.MathUtils.clamp(settings.diamondInternalBounces || DIAMOND_RT_DEFAULT_BOUNCES, 8, DIAMOND_RT_MAX_BOUNCES));
}

function getDiamondBeerAbsorption() {
  const value = Number(settings.diamondBeerAbsorption ?? DIAMOND_RT_DEFAULT_BEER_ABSORPTION);
  return THREE.MathUtils.clamp(Number.isFinite(value) ? value : DIAMOND_RT_DEFAULT_BEER_ABSORPTION, 0, DIAMOND_RT_MAX_BEER_ABSORPTION);
}

function getDiamondMicroRoughness() {
  const value = Number(settings.diamondMicroRoughness ?? 0);
  return THREE.MathUtils.clamp(Number.isFinite(value) ? value : 0, 0, DIAMOND_MICRO_ROUGHNESS_MAX);
}

function getDiamondHdriReflectionStrength() {
  const value = Number(settings.diamondHdriReflectionStrength ?? 1);
  return THREE.MathUtils.clamp(Number.isFinite(value) ? value : 1, 0, DIAMOND_HDRI_REFLECTION_MAX);
}

function getDiamondShaderMode() {
  if (settings.diamondShaderMode === "path-tracing") return 2;
  return settings.diamondShaderMode === "studio-bvh" ? 1 : 0;
}

function getDiamondPathSampleCount() {
  const value = Number(settings.diamondPathSamples ?? 4);
  return Math.round(THREE.MathUtils.clamp(Number.isFinite(value) ? value : 4, 1, 8));
}

function syncDiamondShaderModeControl() {
  const input = document.querySelector("#diamond-shader-mode");
  if (input) input.value = settings.diamondShaderMode || "mesh-bvh";
}

function syncDiamondPathSamplesControl() {
  const value = getDiamondPathSampleCount();
  const input = document.querySelector("#diamond-path-samples");
  const label = document.querySelector("#diamond-path-samples-value");
  if (input) input.value = String(value);
  if (label) label.textContent = String(value);
}
function getDiamondEnvironmentIntensity() {
  const value = Number(scene?.environmentIntensity ?? settings.envIntensity ?? 1);
  return THREE.MathUtils.clamp(Number.isFinite(value) ? value : 1, 0, 4);
}

let diamondBVHModule = null;
let diamondBVHShaderGLSL = null;
let diamondBVHModulePromise = null;
let diamondBVHFailed = false;
let diamondRayTracingBusy = false;
let diamondRayTraceTimer = null;
const diamondRayTraceQueue = new Set();
let diamondRayTraceGeneration = 0;
let diamondRayTraceAbortController = null;
let diamondCalculationHadFailure = false;

function resetDiamondRayTraceQueue(reason = "reset") {
  diamondRayTraceGeneration += 1;
  diamondRayTraceAbortController?.abort();
  diamondRayTraceQueue.clear();
  if (diamondRayTraceTimer) {
    clearTimeout(diamondRayTraceTimer);
    diamondRayTraceTimer = null;
  }
  diamondCalculationProgressActive = false;
  diamondWorkStarted = false;
  diamondCalculationProgressTotal = 0;
  diamondCalculationProgressCompleted = 0;
  diamondCalculationHadFailure = false;
  logDebug("diamond-rt", "File de lancer de rayons du diamant vidée.", { reason, generation: diamondRayTraceGeneration });
}

function isObjectAttachedToScene(object) {
  let node = object;
  while (node) {
    if (node === scene) return true;
    node = node.parent;
  }
  return false;
}

function clamp01(value) {
  return Math.min(1, Math.max(0, value));
}

function shouldUseDiamondRayTracing(material, preset = {}) {
  const storedPresetId = material?.userData?.jewelryMaterial?.preset;
  const storedPreset = storedPresetId && gemPresets[storedPresetId] ? gemPresets[storedPresetId] : null;
  const merged = { ...(storedPreset || {}), ...preset };
  if (!material || !isTransparentOpticalGemPreset(merged, material)) return false;
  const optical = getGemOpticalQualityProfile(merged, material);
  const transmission = getGemPresetNumber(merged, material, "transmission", Number(material.transmission) || 0);
  // The GPU path is cheap enough to serve every transparent optical stone,
  // including cabochons and pressed crystal. Opaque stones and pearls remain
  // on their dedicated PBR materials.
  return Boolean(optical.isOpticalGem && !optical.isOpaque && !optical.isPearl && transmission >= 0.16);
}

function loadDiamondBVHModule() {
  if (diamondBVHModule) return Promise.resolve(diamondBVHModule);
  if (diamondBVHFailed) return Promise.resolve(null);
  if (!diamondBVHModulePromise) {
    showDiamondCalculationProgress("Chargement du moteur de lancer de rayons", 1);
    diamondBVHModulePromise = import("three-mesh-bvh")
      .then((module) => {
        diamondBVHModule = module;
        diamondBVHShaderGLSL = module.BVHShaderGLSL || {
          common_functions: module.common_functions,
          bvh_struct_definitions: module.shaderStructs,
          bvh_ray_functions: module.shaderIntersectFunction,
        };
        THREE.Mesh.prototype.raycast = module.acceleratedRaycast || THREE.Mesh.prototype.raycast;
        showDiamondCalculationProgress("Moteur optique chargé", 3);
        logDebug("diamond-rt", "Module three-mesh-bvh chargé : ray tracing diamant actif.", {
          gpuShader: Boolean(module.MeshBVHUniformStruct && module.shaderStructs && module.shaderIntersectFunction),
          exports: Object.keys(module).filter((key) => /BVH|shader|Raycast/i.test(key)).slice(0, 18),
        });
        requestDiamondRayTraceProcessing();
        return module;
      })
      .catch((error) => {
        diamondBVHFailed = true;
        logDebug("diamond-rt", "BVH indisponible, fallback shader optique conserve.", { error: String(error) });
        diamondRayTraceQueue.clear();
        finishDiamondCalculationProgress("Rendu rapide actif — moteur optique indisponible");
        return null;
      });
  }
  return diamondBVHModulePromise;
}

function getMaterialPresetForGem(material) {
  const presetId = material?.userData?.jewelryMaterial?.preset;
  return presetId && gemPresets[presetId] ? gemPresets[presetId] : null;
}

function getDiamondRayTraceMaterial(mesh) {
  if (!mesh?.isMesh || !mesh.geometry?.attributes?.position) return null;
  const materials = Array.isArray(mesh.material) ? mesh.material.filter(Boolean) : [mesh.material].filter(Boolean);
  return materials.find((material) => shouldUseDiamondRayTracing(material, getMaterialPresetForGem(material) || {})) || null;
}

function isDiamondRayTraceTarget(mesh) {
  return Boolean(getDiamondRayTraceMaterial(mesh));
}

function hasActiveDiamondGpuMaterial(mesh, signature = "") {
  if (!mesh?.isMesh || !mesh.geometry) return false;
  return getObjectMaterialList(mesh.material).some((material) => {
    const data = material?.userData;
    if (!data?.diamondRefractionMaterial || !data.diamondGpuBvhEnabled) return false;
    if (data.diamondBvhGeometryUuid !== mesh.geometry.uuid) return false;
    return !signature || data.diamondRayTraceSignature === signature;
  });
}

function ensureDiamondRayColorAttribute(geometry, seed = 0.035) {
  if (!geometry?.attributes?.position) return;
  const count = geometry.attributes.position.count;
  const current = geometry.getAttribute("diamondRayColor");
  if (current && current.count === count) return;
  const values = new Float32Array(count * 3);
  for (let i = 0; i < count; i += 1) {
    values[i * 3] = seed;
    values[i * 3 + 1] = seed;
    values[i * 3 + 2] = seed;
  }
  geometry.setAttribute("diamondRayColor", new THREE.BufferAttribute(values, 3));
}

function scheduleDiamondInternalRayTracing(mesh, reason = "update") {
  if (!isDiamondRayTraceTarget(mesh)) return;
  const geometry = mesh.geometry;
  ensureDiamondRayColorAttribute(geometry, 0.04);
  const material = getDiamondRayTraceMaterial(mesh) || (Array.isArray(mesh.material) ? mesh.material[0] : mesh.material);
  const presetId = material?.userData?.jewelryMaterial?.preset || "diamond";
  const preset = getMaterialPresetForGem(material) || {};
  const bounceCount = getDiamondInternalBounceCount();
  const beerAbsorption = getDiamondBeerAbsorption();
  const channelIors = getGemChannelIors(preset, material);
  const signature = `${geometry.uuid}:${presetId}:${bounceCount}:${beerAbsorption.toFixed(5)}:${getDiamondMicroRoughness().toFixed(5)}:${getDiamondHdriReflectionStrength().toFixed(4)}:${getDiamondEnvironmentIntensity().toFixed(4)}:${channelIors.map((ior) => ior.toFixed(4)).join("/")}:${geometry.attributes.position.count}:${geometry.index?.count || 0}`;
  if (
    mesh.userData.diamondRayTraceSignature === signature &&
    geometry.userData.diamondRayTraceReady &&
    hasActiveDiamondGpuMaterial(mesh, signature)
  ) {
    return;
  }
  // A material replacement can leave the geometry cache marked as ready even
  // though the BVH shader is no longer attached. Always invalidate that stale
  // state so the shader is rebuilt on the current material.
  geometry.userData.diamondRayTraceReady = false;
  mesh.userData.diamondRayTraceSignature = signature;
  mesh.userData.diamondRayTraceGeneration = diamondRayTraceGeneration;
  const alreadyQueued = diamondRayTraceQueue.has(mesh);
  if (!diamondCalculationProgressActive) showDiamondCalculationProgress("Préparation du lancer de rayons", 0);
  if (!alreadyQueued) diamondCalculationProgressTotal += 1;
  diamondRayTraceQueue.add(mesh);
  loadDiamondBVHModule();
  requestDiamondRayTraceProcessing();
  logDebug("diamond-rt", `Ray tracing interne planifie (${reason}).`, { mesh: mesh.name, vertices: geometry.attributes.position.count, bounces: getDiamondInternalBounceCount(), beerAbsorption: getDiamondBeerAbsorption(), hdriReflection: getDiamondHdriReflectionStrength() });
}

function requestDiamondRayTraceProcessing(delay = 900) {
  if (diamondRayTraceTimer) return;
  diamondRayTraceTimer = setTimeout(() => {
    diamondRayTraceTimer = null;
    processDiamondRayTraceQueue();
  }, delay);
}
async function processDiamondRayTraceQueue() {
  if (!diamondBVHModule || diamondRayTracingBusy || diamondRayTraceQueue.size === 0) return;
  const mesh = diamondRayTraceQueue.values().next().value;
  diamondRayTraceQueue.delete(mesh);
  const generation = diamondRayTraceGeneration;
  const geometry = mesh.geometry;
  const signature = mesh.userData.diamondRayTraceSignature;
  const controller = new AbortController();
  diamondRayTraceAbortController = controller;
  const isCurrent = () => !controller.signal.aborted && generation === diamondRayTraceGeneration
    && mesh.geometry === geometry && mesh.userData.diamondRayTraceSignature === signature
    && isObjectAttachedToScene(mesh) && isDiamondRayTraceTarget(mesh);
  const progress = (stage, fraction) => {
    if (!isCurrent()) return;
    const ratio = (diamondCalculationProgressCompleted + fraction) / Math.max(1, diamondCalculationProgressTotal);
    showDiamondCalculationProgress(stage, 5 + ratio * 94);
  };
  diamondRayTracingBusy = true;
  try {
    if (!isCurrent()) return;
    // The model has its provisional material. Start a separate quality progress phase.
    diamondWorkStarted = true;
    if (diamondCalculationProgressCompleted === 0) loadingProgress = 0;
    progress("Rendu haute qualité : préparation du calcul en arrière-plan", 0);
    await waitForProgressPaint();
    if (!renderer.extensions.has("KHR_parallel_shader_compile")) {
      throw new Error("Compilation GPU parallèle non disponible : rendu rapide conservé");
    }
    const boundsTree = await buildDiamondBoundsTree(geometry, controller.signal, (value) => {
      progress("Construction de l’accélérateur BVH en arrière-plan", 0.05 + value * 0.70);
    });
    if (!isCurrent()) return;
    await waitForViewerIdle(controller.signal, isCurrent, () => {
      progress("Rendu rapide interactif : finalisation en attente", 0.78);
    });
    progress("Compilation du matériau à lancer de rayons en arrière-plan", 0.80);
    await waitForProgressPaint();
    const material = await ensureDiamondGpuBVHMaterial(mesh, boundsTree, isCurrent);
    if (!material) throw new Error("Matériau optique indisponible : rendu rapide conservé");
    if (!isCurrent()) return;
    geometry.userData.diamondRayTraceReady = true;
    geometry.userData.diamondRayTraceBounces = getDiamondInternalBounceCount();
    geometry.userData.diamondRayTraceVertices = geometry.attributes.position.count;
    progress("Rendu optique prêt : affichage de la première image", 0.98);
    await waitForProgressPaint();
  } catch (error) {
    if (error.name !== "AbortError" && isCurrent()) {
      diamondCalculationHadFailure = true;
      logDebug("diamond-rt", "Rendu rapide conservé sans calcul CPU bloquant.", { mesh: mesh?.name, error: String(error) });
      showNotice("Le rendu rapide reste actif. La préparation haute qualité n’a pas pu aboutir sur ce navigateur.");
    }
  } finally {
    if (generation === diamondRayTraceGeneration) diamondCalculationProgressCompleted += 1;
    diamondRayTracingBusy = false;
    if (diamondRayTraceAbortController === controller) diamondRayTraceAbortController = null;
    if (diamondRayTraceQueue.size > 0) {
      requestDiamondRayTraceProcessing(0);
    } else if (generation === diamondRayTraceGeneration) {
      finishDiamondCalculationProgress(diamondCalculationHadFailure
        ? "Rendu rapide actif — haute qualité indisponible"
        : "Rendu à lancer de rayons prêt");
    }
  }
}

async function buildDiamondBoundsTree(geometry, signal, onProgress) {
  if (!diamondBVHModule?.MeshBVH || !geometry?.attributes?.position) return null;
  const position = geometry.attributes.position;
  const index = geometry.index;
  const geometrySignature = [
    geometry.uuid,
    position.count,
    position.version || 0,
    index?.count || 0,
    index?.version || 0,
  ].join(":");
  if (
    geometry.boundsTree &&
    geometry.userData.diamondBvhGeometrySignature === geometrySignature
  ) {
    geometry.userData.diamondBvhReuseCount = (geometry.userData.diamondBvhReuseCount || 0) + 1;
    return geometry.boundsTree;
  }
  const serialized = await buildBVHInWorker(geometry, { signal, onProgress });
  if (signal?.aborted || geometrySignature !== [geometry.uuid, position.count, position.version || 0,
    geometry.index?.count || 0, geometry.index?.version || 0].join(":")) throw abortError();
  geometry.boundsTree = diamondBVHModule.MeshBVH.deserialize(serialized, geometry);
  geometry.userData.diamondBvhGeometrySignature = [geometry.uuid, position.count, position.version || 0,
    geometry.index?.count || 0, geometry.index?.version || 0].join(":");
  geometry.userData.diamondBvhBuildCount = (geometry.userData.diamondBvhBuildCount || 0) + 1;
  return geometry.boundsTree;
}

function getDiamondBVHShaderParts() {
  const module = diamondBVHModule || {};
  const glsl = diamondBVHShaderGLSL || module.BVHShaderGLSL || {};
  return {
    structs: module.shaderStructs || glsl.bvh_struct_definitions || glsl.shaderStructs || "",
    intersect: module.shaderIntersectFunction || [glsl.common_functions, glsl.bvh_ray_functions].filter(Boolean).join("\n"),
  };
}

function canUseDiamondGpuBVHShader() {
  const parts = getDiamondBVHShaderParts();
  return Boolean(
    renderer.capabilities.isWebGL2 &&
      diamondBVHModule?.MeshBVHUniformStruct &&
      parts.structs &&
      parts.intersect &&
      parts.intersect.includes("bvhIntersectFirstHit") &&
      scene.environment
  );
}

function replaceMaterialOnMesh(mesh, sourceMaterial, replacementMaterial) {
  if (!mesh || !sourceMaterial || !replacementMaterial) return false;
  let replaced = false;
  if (Array.isArray(mesh.material)) {
    const nextMaterials = mesh.material.slice();
    const index = nextMaterials.indexOf(sourceMaterial);
    if (index >= 0) {
      nextMaterials[index] = replacementMaterial;
      mesh.material = nextMaterials;
      replaced = true;
    }
  } else if (mesh.material === sourceMaterial) {
    mesh.material = replacementMaterial;
    replaced = true;
  }
  return replaced;
}

function getCubeUvShaderDefines(texture = scene.environment) {
  const image = texture?.image || {};
  const width = Math.max(16, Number(image.width) || 256);
  const height = Math.max(16, Number(image.height) || 256);
  const lodMax = Math.max(4, Math.round(Math.log2(height) - 2));
  return {
    CHROMATIC_ABERRATIONS: "",
    BVH_STACK_DEPTH: "64",
    CUBEUV_TEXEL_WIDTH: String(1 / width),
    CUBEUV_TEXEL_HEIGHT: String(1 / height),
    CUBEUV_MAX_MIP: `${lodMax}.0`,
  };
}
function createDiamondRefractionMaterial(sourceMaterial, preset, bvhUniform) {
  const parts = getDiamondBVHShaderParts();
  const bodyColor = new THREE.Color(preset.color || sourceMaterial?.color || "#ffffff");
  const attenuationColor = new THREE.Color(preset.attenuation || bodyColor);
  const optical = getGemOpticalQualityProfile(preset, sourceMaterial);
  const solidOptical = shouldRenderGemAsSolidOptical(optical);
  const refractionMaterial = new THREE.ShaderMaterial({
    name: `${sourceMaterial?.name || preset.label || "Gemme"} - ray tracing BVH`,
    transparent: !solidOptical && optical.opacity < 0.995,
    depthWrite: solidOptical || optical.opacity >= 0.995,
    depthTest: true,
    side: THREE.DoubleSide,
    glslVersion: THREE.GLSL3,
    defines: getCubeUvShaderDefines(scene.environment),
    uniforms: {
      envMap: { value: scene.environment },
      bounces: { value: getDiamondInternalBounceCount() },
      ior: { value: optical.ior },
      iorSpread: { value: optical.iorSpread },
      aberrationStrength: { value: Math.max(0.012, settings.chromaticShift * 0.032 + settings.spectralRichness * 0.018) },
      beerAbsorption: { value: getDiamondBeerAbsorption() },
      microRoughness: { value: getDiamondMicroRoughness() },
      fresnelBoost: { value: optical.fresnelBoost },
      fireStrength: { value: optical.fireStrength + settings.spectralRichness * 0.64 + getDiamondHdriReflectionStrength() * 0.42 },
      colorStrength: { value: optical.bodyColorStrength },
      bodyBoost: { value: optical.bodyBoost },
      envIntensity: { value: getDiamondEnvironmentIntensity() * getDiamondHdriReflectionStrength() },
      shaderMode: { value: getDiamondShaderMode() },
      pathSamples: { value: getDiamondPathSampleCount() },
      color: { value: bodyColor },
      attenuationColor: { value: attenuationColor },
      opacity: { value: solidOptical ? 1 : optical.opacity },
      resolution: { value: new THREE.Vector2(window.innerWidth, window.innerHeight) },
      viewMatrixInverse: { value: new THREE.Matrix4() },
      projectionMatrixInverse: { value: new THREE.Matrix4() },
      bvh: { value: bvhUniform },
    },
    vertexShader: /* glsl */`
      uniform mat4 viewMatrixInverse;
      varying vec3 vWorldPosition;
      varying vec3 vNormal;
      varying mat4 vModelMatrix;
      varying mat4 vModelMatrixInverse;
      void main() {
        vec4 transformedNormal = vec4(normal, 0.0);
        vec4 transformedPosition = vec4(position, 1.0);
        #ifdef USE_INSTANCING
          transformedNormal = instanceMatrix * transformedNormal;
          transformedPosition = instanceMatrix * transformedPosition;
          vModelMatrix = modelMatrix * instanceMatrix;
          vModelMatrixInverse = inverse(vModelMatrix);
        #else
          vModelMatrix = modelMatrix;
          vModelMatrixInverse = inverse(vModelMatrix);
        #endif
        vWorldPosition = (modelMatrix * transformedPosition).xyz;
        vNormal = normalize((viewMatrixInverse * vec4(normalMatrix * transformedNormal.xyz, 0.0)).xyz);
        gl_Position = projectionMatrix * viewMatrix * modelMatrix * transformedPosition;
      }
    `,
    fragmentShader: /* glsl */`
      #define ENVMAP_TYPE_CUBE_UV
      precision highp float;
      precision highp int;
      precision highp isampler2D;
      precision highp usampler2D;
      out highp vec4 pc_fragColor;
      #define gl_FragColor pc_fragColor
      varying vec3 vWorldPosition;
      varying vec3 vNormal;
      varying mat4 vModelMatrix;
      varying mat4 vModelMatrixInverse;
      uniform sampler2D envMap;
      uniform float bounces;
      uniform float ior;
      uniform float iorSpread;
      uniform float aberrationStrength;
      uniform float beerAbsorption;
      uniform float microRoughness;
      uniform float fresnelBoost;
      uniform float fireStrength;
      uniform float envIntensity;
      uniform float shaderMode;
      uniform float pathSamples;
      uniform float colorStrength;
      uniform float bodyBoost;
      uniform vec3 color;
      uniform vec3 attenuationColor;
      uniform float opacity;
      uniform vec2 resolution;
      uniform mat4 projectionMatrixInverse;
      uniform mat4 viewMatrixInverse;
      ${parts.structs}
      ${parts.intersect}
      uniform BVH bvh;
      #include <common>
      #include <cube_uv_reflection_fragment>
      float diamondFresnelSchlick(float cosTheta, float eta) {
        float f0 = pow((eta - 1.0) / (eta + 1.0), 2.0);
        return clamp(f0 + (1.0 - f0) * pow(1.0 - clamp(cosTheta, 0.0, 1.0), 5.0), 0.0, 1.0);
      }
      float diamondHash(vec3 p) {
        p = fract(p * 0.3183099 + vec3(0.17, 0.31, 0.47));
        p *= 17.0;
        return fract(p.x * p.y * p.z * (p.x + p.y + p.z));
      }
      vec3 diamondPolishedNormal(vec3 normal, vec3 viewDirection) {
        vec3 seed = normalize(vec3(
          diamondHash(normal.xyz + viewDirection.zxy),
          diamondHash(normal.yzx + viewDirection.xyz * 1.37),
          diamondHash(normal.zxy + viewDirection.yzx * 2.11)
        ) - 0.5);
        float haze = clamp(microRoughness * 5.0, 0.0, 0.42);
        return normalize(mix(normal, normalize(normal + seed * 0.18), haze));
      }
      vec3 diamondBeer(vec3 attenuation, float travel) {
        vec3 sigma = max(vec3(0.0008), vec3(1.0) - clamp(attenuation, vec3(0.0), vec3(1.0)));
        return exp(-sigma * max(0.0, travel) * max(beerAbsorption, 0.0));
      }
      vec3 diamondStudioEnv(vec3 rayDirection) {
        vec3 d = normalize(rayDirection);
        float horizon = 1.0 - abs(d.y);
        float overhead = pow(clamp(d.y * 0.55 + 0.62, 0.0, 1.0), 7.0);
        float longSoftbox = pow(clamp(1.0 - abs(d.x * 0.22 + d.z * 0.96), 0.0, 1.0), 26.0) * clamp(horizon + 0.18, 0.0, 1.0);
        float verticalSoftbox = pow(clamp(1.0 - abs(d.x * 0.92 - d.z * 0.18), 0.0, 1.0), 16.0) * clamp(0.95 - abs(d.y), 0.0, 1.0);
        float pinA = pow(clamp(1.0 - length(d.xy - vec2(0.32, 0.28)), 0.0, 1.0), 48.0);
        float pinB = pow(clamp(1.0 - length(d.zy - vec2(-0.38, 0.18)), 0.0, 1.0), 56.0);
        float blackFlagA = pow(clamp(1.0 - abs(d.x * 0.82 - d.z * 0.38), 0.0, 1.0), 10.0) * clamp(0.86 - abs(d.y), 0.0, 1.0);
        float blackFlagB = pow(clamp(1.0 - abs(d.x * 0.46 + d.z * 0.76), 0.0, 1.0), 8.0) * clamp(0.82 - abs(d.y), 0.0, 1.0);
        vec3 whitePanels = vec3(1.0) * (overhead * 0.55 + longSoftbox * 2.7 + verticalSoftbox * 1.75 + pinA * 3.4 + pinB * 2.9);
        vec3 coolFire = vec3(0.35, 0.72, 1.55) * pow(clamp(1.0 - abs(d.x * 0.64 + d.z * 0.54), 0.0, 1.0), 34.0);
        vec3 warmFire = vec3(1.45, 0.42, 0.12) * pow(clamp(1.0 - abs(d.x * 0.34 - d.z * 0.88), 0.0, 1.0), 38.0);
        vec3 negative = vec3(0.86, 0.88, 0.94) * (blackFlagA * 0.62 + blackFlagB * 0.48);
        return max(vec3(0.006, 0.007, 0.010), whitePanels + coolFire + warmFire - negative);
      }
      vec4 diamondSampleEnv(vec3 rayDirection, float lod) {
        vec3 d = normalize(rayDirection);
        vec3 hdri = textureCubeUV(envMap, d, clamp(lod, 0.0, 8.0)).rgb;
        vec3 studio = diamondStudioEnv(d);
        float polish = 1.0 - clamp(lod / 8.0, 0.0, 0.85);
        vec3 sampled = max(hdri * 0.72, hdri * 0.44 + studio * (0.82 + polish * 0.28));
        return vec4(sampled, 1.0);
      }
      vec3 diamondTraceInternal(vec3 rayOriginWorld, vec3 rayDirectionWorld, vec3 normalWorld, float channelIor, out float travel, out float tirCount) {
        vec3 rayDirection = refract(rayDirectionWorld, normalWorld, 1.0 / max(channelIor, 1.001));
        if (length(rayDirection) < 0.0001) rayDirection = reflect(rayDirectionWorld, normalWorld);
        vec3 rayOrigin = vWorldPosition + rayDirection * 0.0012;
        rayOrigin = (vModelMatrixInverse * vec4(rayOrigin, 1.0)).xyz;
        rayDirection = normalize((vModelMatrixInverse * vec4(rayDirection, 0.0)).xyz);
        travel = 0.0;
        tirCount = 0.0;
        float throughput = 1.0;
        vec3 accumulated = vec3(0.0);
        vec3 lastWorldDirection = normalize(rayDirectionWorld);
        float roughLod = microRoughness * 8.0;
        for (int i = 0; i < 16; i++) {
          float bounceActive = step(float(i) + 0.5, bounces);
          if (bounceActive < 0.5) break;
          uvec4 faceIndices = uvec4(0u);
          vec3 faceNormal = vec3(0.0, 0.0, 1.0);
          vec3 barycoord = vec3(0.0);
          float side = 1.0;
          float dist = 0.0;
          bool hit = bvhIntersectFirstHit(bvh, rayOrigin, rayDirection, faceIndices, faceNormal, barycoord, side, dist);
          if (!hit || dist <= 0.00001) {
            accumulated += diamondSampleEnv(lastWorldDirection, roughLod).rgb * throughput * 0.58;
            break;
          }
          vec3 hitPos = rayOrigin + rayDirection * max(dist - 0.001, 0.0);
          travel += dist;
          faceNormal = normalize(faceNormal);
          if (dot(faceNormal, rayDirection) > 0.0) faceNormal = -faceNormal;
          vec3 reflectedLocal = reflect(rayDirection, faceNormal);
          vec3 reflectedWorld = normalize((vModelMatrix * vec4(reflectedLocal, 0.0)).xyz);
          vec3 exitDir = refract(rayDirection, faceNormal, channelIor);
          float cosHit = abs(dot(rayDirection, faceNormal));
          float fresnel = diamondFresnelSchlick(cosHit, channelIor);
          float bounceGain = 0.62 + float(i) * 0.105;
          if (length(exitDir) > 0.0001) {
            vec3 exitWorld = normalize((vModelMatrix * vec4(exitDir, 0.0)).xyz);
            float exitWeight = throughput * (1.0 - fresnel) * bounceGain;
            accumulated += diamondSampleEnv(exitWorld, roughLod).rgb * exitWeight;
            accumulated += diamondSampleEnv(reflectedWorld, roughLod * 0.65).rgb * throughput * fresnel * 0.24;
            rayDirection = normalize(reflectedLocal);
            throughput *= clamp(fresnel * 1.16, 0.035, 0.96);
            if (fresnel < 0.18 && i > 1) break;
          } else {
            tirCount += bounceActive;
            accumulated += diamondSampleEnv(reflectedWorld, roughLod * 0.35).rgb * throughput * (0.18 + 0.035 * float(i));
            rayDirection = normalize(reflectedLocal);
            throughput *= 0.985;
          }
          if (throughput < 0.008) break;
          rayOrigin = hitPos + rayDirection * 0.003;
          lastWorldDirection = reflectedWorld;
        }
        if (dot(accumulated, vec3(0.333333)) < 0.01) {
          accumulated = diamondSampleEnv(lastWorldDirection, roughLod).rgb * max(throughput, 0.2);
        }
        return accumulated;
      }
      vec3 diamondTraceExitDirection(vec3 rayDirectionWorld, vec3 normalWorld, float channelIor, out float travel, out float tirCount) {
        vec3 rayDirection = refract(rayDirectionWorld, normalWorld, 1.0 / max(channelIor, 1.001));
        if (length(rayDirection) < 0.0001) rayDirection = reflect(rayDirectionWorld, normalWorld);
        vec3 rayOrigin = vWorldPosition + rayDirection * 0.0012;
        rayOrigin = (vModelMatrixInverse * vec4(rayOrigin, 1.0)).xyz;
        rayDirection = normalize((vModelMatrixInverse * vec4(rayDirection, 0.0)).xyz);
        travel = 0.0;
        tirCount = 0.0;
        vec3 exitWorld = normalize(rayDirectionWorld);
        for (int i = 0; i < 16; i++) {
          float bounceActive = step(float(i) + 0.5, bounces);
          if (bounceActive < 0.5) break;
          uvec4 faceIndices = uvec4(0u);
          vec3 faceNormal = vec3(0.0, 0.0, 1.0);
          vec3 barycoord = vec3(0.0);
          float side = 1.0;
          float dist = 0.0;
          bool hit = bvhIntersectFirstHit(bvh, rayOrigin, rayDirection, faceIndices, faceNormal, barycoord, side, dist);
          if (!hit || dist <= 0.00001) break;
          travel += dist;
          vec3 hitPos = rayOrigin + rayDirection * max(dist - 0.001, 0.0);
          faceNormal = normalize(faceNormal);
          if (dot(faceNormal, rayDirection) > 0.0) faceNormal = -faceNormal;
          vec3 refractedOut = refract(rayDirection, faceNormal, channelIor);
          if (length(refractedOut) > 0.0001) {
            exitWorld = normalize((vModelMatrix * vec4(refractedOut, 0.0)).xyz);
            break;
          }
          rayDirection = normalize(reflect(rayDirection, faceNormal));
          tirCount += bounceActive;
          rayOrigin = hitPos + rayDirection * 0.003;
          exitWorld = normalize((vModelMatrix * vec4(rayDirection, 0.0)).xyz);
        }
        return exitWorld;
      }
      vec3 diamondMeshBvhRgb(vec3 rayDirection, vec3 normalWorld, out float travelAvg, out float tirAvg) {
        float travelR;
        float travelG;
        float travelB;
        float tirR;
        float tirG;
        float tirB;
        float spread = max(iorSpread, aberrationStrength * 1.35);
        vec3 dirR = diamondTraceExitDirection(rayDirection, normalWorld, max(1.001, ior - spread * 0.28), travelR, tirR);
        vec3 dirG = diamondTraceExitDirection(rayDirection, normalWorld, max(1.001, ior), travelG, tirG);
        vec3 dirB = diamondTraceExitDirection(rayDirection, normalWorld, max(1.001, ior + spread * 0.82), travelB, tirB);
        float lod = microRoughness * 8.0;
        travelAvg = (travelR + travelG + travelB) / 3.0;
        tirAvg = (tirR + tirG + tirB) / 3.0;
        return vec3(
          diamondSampleEnv(dirR, lod).r,
          diamondSampleEnv(dirG, lod).g,
          diamondSampleEnv(dirB, lod).b
        );
      }
      vec3 diamondPathTracePreviewRgb(vec3 rayDirection, vec3 normalWorld, out float travelAvg, out float tirAvg) {
        vec3 tangent = normalize(abs(normalWorld.y) < 0.92 ? cross(normalWorld, vec3(0.0, 1.0, 0.0)) : cross(normalWorld, vec3(1.0, 0.0, 0.0)));
        vec3 bitangent = normalize(cross(normalWorld, tangent));
        vec3 sumColor = vec3(0.0);
        float sumTravel = 0.0;
        float sumTir = 0.0;
        float sumWeight = 0.0;
        for (int i = 0; i < 8; i++) {
          float sampleActive = step(float(i) + 0.5, pathSamples);
          if (sampleActive < 0.5) break;
          float a = diamondHash(vec3(gl_FragCoord.xy * 0.173, float(i) + 1.0)) * 6.28318530718;
          float r = sqrt(diamondHash(vec3(gl_FragCoord.yx * 0.217, float(i) + 9.0)));
          float cone = 0.0045 + microRoughness * 0.052;
          vec3 jitter = (cos(a) * tangent + sin(a) * bitangent) * r * cone;
          float travelSample;
          float tirSample;
          vec3 sampleDirection = normalize(rayDirection + jitter);
          vec3 sampleColor = diamondMeshBvhRgb(sampleDirection, normalWorld, travelSample, tirSample);
          float weight = i == 0 ? 1.45 : 1.0;
          sumColor += sampleColor * weight;
          sumTravel += travelSample * weight;
          sumTir += tirSample * weight;
          sumWeight += weight;
        }
        float safeWeight = max(sumWeight, 0.0001);
        travelAvg = sumTravel / safeWeight;
        tirAvg = sumTir / safeWeight;
        return sumColor / safeWeight;
      }
      vec3 diamondRgbTrace(vec3 rayOrigin, vec3 rayDirection, vec3 normalWorld, out float travelAvg, out float tirAvg) {
        float travelR;
        float travelG;
        float travelB;
        float tirR;
        float tirG;
        float tirB;
        float spread = max(iorSpread, aberrationStrength * 1.25);
        vec3 colorR = diamondTraceInternal(rayOrigin, rayDirection, normalWorld, max(1.001, ior - spread * 0.28), travelR, tirR);
        vec3 colorG = diamondTraceInternal(rayOrigin, rayDirection, normalWorld, max(1.001, ior), travelG, tirG);
        vec3 colorB = diamondTraceInternal(rayOrigin, rayDirection, normalWorld, max(1.001, ior + spread * 0.82), travelB, tirB);
        travelAvg = (travelR + travelG + travelB) / 3.0;
        tirAvg = (tirR + tirG + tirB) / 3.0;
        return vec3(colorR.r, colorG.g, colorB.b);
      }
      void main() {
        vec3 rawNormalWorld = normalize(vNormal);
        rawNormalWorld = gl_FrontFacing ? rawNormalWorld : -rawNormalWorld;
        vec3 normalWorld = diamondPolishedNormal(rawNormalWorld, normalize(vWorldPosition - cameraPosition));
        vec3 rayOrigin = cameraPosition;
        vec3 viewDirection = normalize(vWorldPosition - cameraPosition);
        float facing = clamp(abs(dot(-viewDirection, normalWorld)), 0.0, 1.0);
        float fresnel = diamondFresnelSchlick(facing, max(ior, 1.001)) * fresnelBoost;
        float travel;
        float tir;
        vec3 refracted = shaderMode > 1.5 ? diamondPathTracePreviewRgb(viewDirection, normalWorld, travel, tir) : (shaderMode < 0.5 ? diamondMeshBvhRgb(viewDirection, normalWorld, travel, tir) : diamondRgbTrace(rayOrigin, viewDirection, normalWorld, travel, tir));
        vec3 reflected = diamondSampleEnv(reflect(viewDirection, normalWorld), microRoughness * 6.0).rgb;
        vec3 beer = diamondBeer(attenuationColor, travel);
        float facetSeed = diamondHash(floor(abs(normalWorld) * 64.0 + vec3(3.0, 7.0, 13.0)));
        float shard = pow(abs(sin(dot(normalWorld, vec3(23.0, 41.0, 17.0)) * 11.0)), 11.0);
        float pavilion = smoothstep(0.8, 5.5, tir) * (0.45 + 0.55 * (1.0 - facing));
        float pathTraceMode = step(1.5, shaderMode);
        vec3 spectralFire = vec3(
          pow(abs(sin(dot(refracted, vec3(17.0, 31.0, 11.0)) * 12.0)), 20.0),
          pow(abs(sin(dot(refracted, vec3(29.0, 13.0, 43.0)) * 13.0)), 18.0),
          pow(abs(sin(dot(refracted, vec3(7.0, 37.0, 23.0)) * 15.0)), 16.0)
        ) * fireStrength * (0.28 + pavilion * 0.95);
        vec3 contrastShard = mix(vec3(0.004, 0.005, 0.008), vec3(1.15, 1.22, 1.36), step(0.48, facetSeed));
        vec3 optical = refracted * beer * envIntensity;
        optical = mix(optical, reflected * envIntensity, clamp(fresnel * 0.58 + pavilion * 0.14, 0.0, 0.72));
        optical = mix(optical, contrastShard, shard * (0.14 + pavilion * 0.32) * mix(1.0, 0.56, pathTraceMode));
        optical += spectralFire * (0.72 + tir * 0.18 + pathTraceMode * 0.34);
        float bodyHold = clamp(colorStrength, 0.0, 1.0);
        vec3 bodyTint = mix(vec3(1.0), color, bodyHold);
        optical *= bodyTint * bodyBoost;
        optical += color * bodyHold * (1.0 - fresnel) * 0.08;
        optical += vec3(1.0) * pow(fresnel, 2.25) * mix(0.42, 0.24, bodyHold);
        float opticalLuma = dot(optical, vec3(0.2126, 0.7152, 0.0722));
        float opticalCompression = 1.0 / (1.0 + max(opticalLuma - 1.05, 0.0) * 0.34);
        optical *= opticalCompression;
        gl_FragColor = vec4(optical, opacity);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }
    `,
  });
  refractionMaterial.userData = {
    ...(sourceMaterial?.userData || {}),
    gemOpticalUniforms: null,
    gemOpticalShaderInstalled: false,
    diamondRefractionMaterial: true,
    diamondBvhUniform: bvhUniform,
    jewelryMaterial: { ...(sourceMaterial?.userData?.jewelryMaterial || {}), type: "gem" },
    sourceIor: optical.ior,
  };
  refractionMaterial.customProgramCacheKey = () => "ctva-gem-refraction-bvh-solid-optics-v7";
  return refractionMaterial;
}

function syncDiamondRefractionMaterialUniforms(material) {
  if (!material?.userData?.diamondRefractionMaterial || !material.uniforms) return;
  const preset = getMaterialPresetForGem(material) || {};
  const optical = getGemOpticalQualityProfile(preset, material);
  const solidOptical = shouldRenderGemAsSolidOptical(optical);
  material.uniforms.envMap.value = scene.environment;
  material.uniforms.bounces.value = getDiamondInternalBounceCount();
  material.uniforms.ior.value = optical.ior;
  if (material.uniforms.iorSpread) material.uniforms.iorSpread.value = optical.iorSpread;
  material.uniforms.aberrationStrength.value = Math.max(0.012, settings.chromaticShift * 0.032 + settings.spectralRichness * 0.018);
  material.uniforms.beerAbsorption.value = getDiamondBeerAbsorption();
  material.uniforms.microRoughness.value = getDiamondMicroRoughness();
  if (material.uniforms.fresnelBoost) material.uniforms.fresnelBoost.value = optical.fresnelBoost;
  if (material.uniforms.colorStrength) material.uniforms.colorStrength.value = optical.bodyColorStrength;
  if (material.uniforms.bodyBoost) material.uniforms.bodyBoost.value = optical.bodyBoost;
  material.uniforms.fireStrength.value = optical.fireStrength + settings.spectralRichness * 0.64 + getDiamondHdriReflectionStrength() * 0.42;
  material.uniforms.envIntensity.value = getDiamondEnvironmentIntensity() * getDiamondHdriReflectionStrength();
  if (material.uniforms.shaderMode) material.uniforms.shaderMode.value = getDiamondShaderMode();
  if (material.uniforms.pathSamples) material.uniforms.pathSamples.value = getDiamondPathSampleCount();
  const bodyColor = getGemPresetColor(preset, material);
  material.uniforms.color.value.copy(optical.isClearGem ? new THREE.Color('#f8fcff') : bodyColor);
  material.uniforms.attenuationColor.value.copy(new THREE.Color(preset.attenuation || bodyColor));
  if (material.uniforms.opacity) material.uniforms.opacity.value = solidOptical ? 1 : optical.opacity;
  material.transparent = !solidOptical && optical.opacity < 0.995;
  material.depthWrite = solidOptical || optical.opacity >= 0.995;
  material.uniforms.resolution.value.set(window.innerWidth, window.innerHeight);
  material.uniforms.viewMatrixInverse.value.copy(camera.matrixWorld);
  material.uniforms.projectionMatrixInverse.value.copy(camera.projectionMatrixInverse);
}

async function ensureDiamondGpuBVHMaterial(mesh, boundsTree, isCurrent = () => isObjectAttachedToScene(mesh)) {
  if (!mesh?.isMesh || !boundsTree || !canUseDiamondGpuBVHShader()) return null;
  const sourceMaterial = getDiamondRayTraceMaterial(mesh);
  if (!sourceMaterial) return null;
  if (sourceMaterial.userData?.diamondRefractionMaterial
    && sourceMaterial.userData.diamondBvhSourceMesh === mesh
    && sourceMaterial.userData.diamondBvhGeometryUuid === mesh.geometry.uuid
    && sourceMaterial.userData.diamondBvhGeometrySignature === mesh.geometry.userData.diamondBvhGeometrySignature) {
    syncDiamondRefractionMaterialUniforms(sourceMaterial);
    sourceMaterial.userData.diamondRayTraceSignature = mesh.userData.diamondRayTraceSignature;
    return sourceMaterial;
  }
  const bvhUniform = new diamondBVHModule.MeshBVHUniformStruct();
  try {
    bvhUniform.updateFrom(boundsTree);
  } catch (error) {
    bvhUniform.dispose();
    logDebug("diamond-rt", "BVH GPU indisponible pour ce maillage, rendu rapide conservé.", { mesh: mesh.name, error: String(error) });
    return null;
  }
  const preset = getMaterialPresetForGem(sourceMaterial) || {};
  const nextMaterial = createDiamondRefractionMaterial(sourceMaterial, preset, bvhUniform);
  nextMaterial.userData.diamondBvhUniform = bvhUniform;
  nextMaterial.userData.diamondBvhGeometryUuid = mesh.geometry.uuid;
  nextMaterial.userData.diamondBvhGeometrySignature = mesh.geometry.userData.diamondBvhGeometrySignature;
  nextMaterial.userData.diamondBvhSourceMesh = mesh;
  nextMaterial.userData.diamondGpuBvhEnabled = true;
  nextMaterial.userData.diamondRayTraceSignature = mesh.userData.diamondRayTraceSignature || "";
  if (nextMaterial.uniforms?.bvh) nextMaterial.uniforms.bvh.value = bvhUniform;
  syncDiamondRefractionMaterialUniforms(nextMaterial);
  const candidate = new THREE.Mesh(mesh.geometry, nextMaterial);
  candidate.receiveShadow = mesh.receiveShadow;
  candidate.castShadow = mesh.castShadow;
  const started = performance.now();
  const pendingMessage = window.setInterval(() => {
    if (isCurrent()) showDiamondCalculationProgress(
      `Compilation du matériau à lancer de rayons en arrière-plan (${Math.round((performance.now() - started) / 1000)} s)`,
      loadingProgress,
    );
  }, 1000);
  try {
    await compileBeforeSwap({
      renderer, candidate, camera, scene, renderTarget: composer.readBuffer,
      isCurrent: () => isCurrent() && getObjectMaterialList(mesh.material).includes(sourceMaterial),
      install: () => {
        if (!replaceMaterialOnMesh(mesh, sourceMaterial, nextMaterial)) return false;
        materialRegistry.diamonds.push(nextMaterial);
        return true;
      },
      dispose: () => {
        detachDiamondRuntimeFromMaterial(nextMaterial);
        nextMaterial.dispose();
      },
    });
  } finally {
    window.clearInterval(pendingMessage);
  }
  logDebug("diamond-rt", "Matériau diamant GPU-BVH appliqué.", { mesh: mesh.name, bounces: getDiamondInternalBounceCount(), webgl2: renderer.capabilities.isWebGL2 });
  return nextMaterial;
}

function updateDiamondGpuBvhUniforms() {
  const visited = new Set();
  scene.traverse((object) => {
    if (!object?.isMesh) return;
    const materials = Array.isArray(object.material) ? object.material : [object.material];
    materials.forEach((material) => {
      if (!material?.userData?.diamondRefractionMaterial || visited.has(material.uuid)) return;
      visited.add(material.uuid);
      syncDiamondRefractionMaterialUniforms(material);
    });
  });
}

function ensureDiamondRayTracingForScene() {
  if (stoneShowcaseMesh) scheduleDiamondInternalRayTracing(stoneShowcaseMesh, "pierre temoin");
  if (centerGemMesh) scheduleDiamondInternalRayTracing(centerGemMesh, "gemme centrale");
  if (selectedSceneObject?.isMesh) scheduleDiamondInternalRayTracing(selectedSceneObject, "sélection");
}

function requestDiamondRayTraceRebake(reason = "parametres optiques") {
  const targets = new Set([stoneShowcaseMesh, centerGemMesh, selectedSceneObject, ...editableObjects]);
  targets.forEach((mesh) => {
    if (!mesh?.isMesh || !mesh.geometry) return;
    mesh.userData.diamondRayTraceSignature = "";
    mesh.geometry.userData.diamondRayTraceReady = false;
    scheduleDiamondInternalRayTracing(mesh, reason);
  });
}

function syncDiamondBounceControl() {
  const value = getDiamondInternalBounceCount();
  const input = document.querySelector("#diamond-bounces");
  const label = document.querySelector("#diamond-bounces-value");
  if (input) input.value = String(value);
  if (label) label.textContent = String(value);
}

function syncDiamondBeerAbsorptionControl() {
  const value = getDiamondBeerAbsorption();
  const input = document.querySelector("#diamond-beer-absorption");
  const label = document.querySelector("#diamond-beer-absorption-value");
  if (input) input.value = String(value);
  if (label) label.textContent = value.toFixed(3);
}

function syncDiamondMicroRoughnessControl() {
  const value = getDiamondMicroRoughness();
  const input = document.querySelector("#diamond-micro-roughness");
  const label = document.querySelector("#diamond-micro-roughness-value");
  if (input) input.value = String(value);
  if (label) label.textContent = value.toFixed(3);
}

function syncDiamondHdriReflectionControl() {
  const value = getDiamondHdriReflectionStrength();
  const input = document.querySelector("#diamond-hdri-reflection");
  const label = document.querySelector("#diamond-hdri-reflection-value");
  if (input) input.value = String(value);
  if (label) label.textContent = value.toFixed(2);
}

function applyDiamondHdriReflectionToMaterial(material, preset = {}) {
  if (!material) return;
  const storedPresetId = material.userData?.jewelryMaterial?.preset;
  const storedPreset = storedPresetId && gemPresets[storedPresetId] ? gemPresets[storedPresetId] : null;
  const merged = { ...(storedPreset || {}), ...preset };
  const optical = getGemOpticalQualityProfile(merged, material);
  if (!optical.isOpticalGem && !optical.isOpaque) return;
  material.envMap = scene.environment || material.envMap || null;
  const reflectionBoost = THREE.MathUtils.lerp(0.82, 1.32, THREE.MathUtils.clamp(getDiamondHdriReflectionStrength() / 2.5, 0, 1));
  const studioBoost = Math.sqrt(THREE.MathUtils.clamp(getDiamondEnvironmentIntensity(), 0.45, 2.4));
  material.envMapIntensity = THREE.MathUtils.clamp(optical.envMapIntensity * reflectionBoost * studioBoost, 0.55, 4.8);
  material.needsUpdate = true;
  updateGemOpticalUniforms(material, merged);
}

function updateDiamondEnvironmentReflections() {
  const materials = new Set([centerGemMaterial, diamondMaterial, ...materialRegistry.centerGems, ...materialRegistry.diamonds]);
  [stoneShowcaseMesh, centerGemMesh, selectedSceneObject, ...editableObjects].forEach((mesh) => {
    if (!mesh?.isMesh) return;
    const meshMaterials = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
    meshMaterials.forEach((material) => material && materials.add(material));
  });
  materials.forEach((material) => applyDiamondHdriReflectionToMaterial(material, getMaterialPresetForGem(material) || {}));
}

function applyDiamondMicroRoughnessToMaterial(material, preset = {}) {
  if (!material) return;
  const storedPresetId = material.userData?.jewelryMaterial?.preset;
  const storedPreset = storedPresetId && gemPresets[storedPresetId] ? gemPresets[storedPresetId] : null;
  const merged = { ...(storedPreset || {}), ...preset };
  const optical = getGemOpticalQualityProfile(merged, material);
  if (!optical.isOpticalGem || optical.isPearl) return;
  material.roughness = optical.roughness;
  material.clearcoatRoughness = optical.clearcoatRoughness;
  material.needsUpdate = true;
  updateGemOpticalUniforms(material, merged);
}

function updateDiamondPolishMaterials() {
  const materials = new Set([centerGemMaterial, diamondMaterial, ...materialRegistry.centerGems, ...materialRegistry.diamonds]);
  [stoneShowcaseMesh, centerGemMesh, selectedSceneObject, ...editableObjects].forEach((mesh) => {
    if (!mesh?.isMesh) return;
    const meshMaterials = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
    meshMaterials.forEach((material) => material && materials.add(material));
  });
  materials.forEach((material) => {
    const preset = getMaterialPresetForGem(material) || {};
    applyDiamondMicroRoughnessToMaterial(material, preset);
    applyDiamondHdriReflectionToMaterial(material, preset);
  });
}
function updateGemOpticalUniforms(material, preset = {}) {
  const uniforms = material?.userData?.gemOpticalUniforms;
  if (!uniforms) return;
  const optical = getGemOpticalQualityProfile(preset, material);
  const fireColor = new THREE.Color(preset.fire || settings.reflectionColor || "#ffffff");
  const bodyColor = new THREE.Color(preset.color || material.color || settings.gemColor || "#ffffff");
  const attenuationColor = new THREE.Color(preset.attenuation || bodyColor);
  uniforms.fire.value.copy(fireColor);
  uniforms.body.value.copy(bodyColor);
  uniforms.attenuation.value.copy(attenuationColor);
  uniforms.firePower.value = optical.firePower;
  uniforms.depth.value = optical.internalDepth;
  uniforms.scale.value = optical.facetScale;
  uniforms.milky.value = optical.milky;
  if (uniforms.ior) uniforms.ior.value = optical.ior;
  if (uniforms.bounce) uniforms.bounce.value = optical.bouncePower;
  if (uniforms.bounceCount) uniforms.bounceCount.value = getDiamondInternalBounceCount();
  if (uniforms.beerAbsorption) uniforms.beerAbsorption.value = getDiamondBeerAbsorption();
  if (uniforms.microRoughness) uniforms.microRoughness.value = getDiamondMicroRoughness();
  if (uniforms.hdriReflection) uniforms.hdriReflection.value = getDiamondHdriReflectionStrength() * getDiamondEnvironmentIntensity();
  if (uniforms.clearness) uniforms.clearness.value = optical.clearness;
  if (uniforms.colorStrength) uniforms.colorStrength.value = optical.bodyColorStrength;
  if (uniforms.bodyBoost) uniforms.bodyBoost.value = optical.bodyBoost;
}

function installGemOpticalShader(material, preset = {}) {
  if (!material) return material;
  if (material.userData.gemOpticalShaderInstalled) {
    updateGemOpticalUniforms(material, preset);
    return material;
  }
  material.userData.gemOpticalShaderInstalled = true;
  const optical = getGemOpticalQualityProfile(preset, material);
  const fireColor = new THREE.Color(preset.fire || settings.reflectionColor || "#ffffff");
  const bodyColor = new THREE.Color(preset.color || material.color || settings.gemColor || "#ffffff");
  const attenuationColor = new THREE.Color(preset.attenuation || bodyColor);
  material.defaultAttributeValues = { ...(material.defaultAttributeValues || {}), diamondRayColor: [0, 0, 0] };
  material.onBeforeCompile = (shader) => {
    shader.vertexShader = shader.vertexShader
      .replace("#include <common>", "#include <common>\nattribute vec3 diamondRayColor;\nvarying vec3 vDiamondRayColor;")
      .replace("#include <begin_vertex>", "#include <begin_vertex>\nvDiamondRayColor = diamondRayColor;");
    material.userData.gemOpticalUniforms = {
      fire: shader.uniforms.uGemFireColor = { value: fireColor },
      body: shader.uniforms.uGemBodyColor = { value: bodyColor },
      attenuation: shader.uniforms.uGemAttenuationColor = { value: attenuationColor },
      firePower: shader.uniforms.uGemFirePower = { value: optical.firePower },
      depth: shader.uniforms.uGemInternalDepth = { value: optical.internalDepth },
      scale: shader.uniforms.uGemFacetScale = { value: optical.facetScale },
      milky: shader.uniforms.uGemMilky = { value: optical.milky },
      ior: shader.uniforms.uGemIor = { value: optical.ior },
      bounce: shader.uniforms.uGemBouncePower = { value: optical.bouncePower },
      bounceCount: shader.uniforms.uGemBounceCount = { value: getDiamondInternalBounceCount() },
      beerAbsorption: shader.uniforms.uGemBeerAbsorption = { value: getDiamondBeerAbsorption() },
      microRoughness: shader.uniforms.uGemMicroRoughness = { value: getDiamondMicroRoughness() },
      hdriReflection: shader.uniforms.uGemHdriReflection = { value: getDiamondHdriReflectionStrength() * getDiamondEnvironmentIntensity() },
      clearness: shader.uniforms.uGemClearness = { value: optical.clearness },
      colorStrength: shader.uniforms.uGemColorStrength = { value: optical.bodyColorStrength },
      bodyBoost: shader.uniforms.uGemBodyBoost = { value: optical.bodyBoost },
    };
    shader.fragmentShader = shader.fragmentShader
      .replace(
        "#include <common>",
        `#include <common>
uniform vec3 uGemFireColor;
uniform vec3 uGemBodyColor;
uniform vec3 uGemAttenuationColor;
uniform float uGemFirePower;
uniform float uGemInternalDepth;
uniform float uGemFacetScale;
uniform float uGemMilky;
uniform float uGemIor;
uniform float uGemBouncePower;
uniform float uGemBounceCount;
uniform float uGemBeerAbsorption;
uniform float uGemMicroRoughness;
uniform float uGemHdriReflection;
uniform float uGemClearness;
uniform float uGemColorStrength;
uniform float uGemBodyBoost;
varying vec3 vDiamondRayColor;
float gemSchlickFresnel(float cosTheta, float ior) {
  float safeIor = max(ior, 1.001);
  float f0 = pow((safeIor - 1.0) / (safeIor + 1.0), 2.0);
  float oneMinusCos = clamp(1.0 - clamp(cosTheta, 0.0, 1.0), 0.0, 1.0);
  return clamp(f0 + (1.0 - f0) * pow(oneMinusCos, 5.0), 0.0, 1.0);
}
vec3 gemOrientedNormal(vec3 n, vec3 incoming) {
  return dot(n, incoming) > 0.0 ? -n : n;
}
vec3 gemSurfaceRefraction(vec3 n, vec3 v, float ior) {
  vec3 incoming = normalize(-v);
  vec3 orientedNormal = gemOrientedNormal(normalize(n), incoming);
  vec3 refractedRay = refract(incoming, orientedNormal, 1.0 / max(ior, 1.001));
  float refractedValid = step(0.00001, dot(refractedRay, refractedRay));
  vec3 tirFallback = reflect(incoming, orientedNormal);
  return normalize(mix(tirFallback, refractedRay, refractedValid));
}
float gemTotalInternalReflectionMask(vec3 internalRay, vec3 exitNormal, float ior) {
  vec3 ray = normalize(internalRay);
  vec3 n = normalize(exitNormal);
  float cosTheta = clamp(abs(dot(ray, n)), 0.0, 1.0);
  float etaExit = 1.0 / max(ior, 1.001);
  float sin2Theta = max(0.0, 1.0 - cosTheta * cosTheta);
  float criticalSin2 = etaExit * etaExit;
  return smoothstep(criticalSin2 * 0.94, criticalSin2 * 1.04, sin2Theta);
}
vec3 gemInternalTIRDirection(vec3 internalRay, vec3 exitNormal, float ior) {
  vec3 ray = normalize(internalRay);
  vec3 n = normalize(exitNormal);
  vec3 reflectedRay = reflect(ray, n);
  vec3 refractedOut = refract(ray, -n, max(ior, 1.001));
  float refractedValid = step(0.00001, dot(refractedOut, refractedOut));
  float tir = max(gemTotalInternalReflectionMask(ray, n, ior), 1.0 - refractedValid);
  return normalize(mix(refractedOut, reflectedRay, tir));
}
vec3 gemBeerLambert(vec3 attenuationColor, float distance) {
  vec3 color = clamp(attenuationColor, vec3(0.0), vec3(1.0));
  vec3 sigma = max(vec3(0.0), vec3(1.0) - color);
  sigma = mix(vec3(0.012), sigma, 0.34);
  float opticalDepth = max(distance, 0.0) * max(uGemBeerAbsorption, 0.0);
  return exp(-sigma * opticalDepth);
}
vec3 gemHdriReflectionProbe(vec3 direction) {
  vec3 ray = normalize(direction);
  float horizon = 1.0 - abs(ray.y);
  float overheadSoftbox = pow(clamp(ray.y * 0.5 + 0.62, 0.0, 1.0), 8.0);
  float sideSoftbox = pow(clamp(1.0 - abs(ray.x * 0.72 + ray.z * 0.46), 0.0, 1.0), 5.5) * clamp(horizon + 0.18, 0.0, 1.0);
  float strip = pow(clamp(1.0 - abs(ray.x * 0.18 - ray.z * 0.98), 0.0, 1.0), 18.0);
  float longSoftbox = pow(clamp(1.0 - abs(ray.x * 0.22 + ray.z * 0.96), 0.0, 1.0), 26.0);
  float verticalSoftbox = pow(clamp(1.0 - abs(ray.x * 0.92 - ray.z * 0.18), 0.0, 1.0), 14.0) * clamp(0.92 - abs(ray.y), 0.0, 1.0);
  float warmRim = pow(clamp(ray.z * 0.5 + 0.5, 0.0, 1.0), 9.0) * 0.42;
  float darkPanel = pow(clamp(1.0 - abs(ray.x * 0.9 - ray.z * 0.22), 0.0, 1.0), 7.0) * clamp(0.82 - abs(ray.y), 0.0, 1.0);
  float white = overheadSoftbox * 1.8 + sideSoftbox * 1.25 + strip * 2.4 + longSoftbox * 1.75 + verticalSoftbox * 1.05;
  vec3 probe = vec3(
    0.028 + white + warmRim * 1.08 - darkPanel * 0.42,
    0.030 + white * 0.985 + warmRim * 0.74 - darkPanel * 0.46,
    0.040 + white * 1.055 + strip * 0.25 - darkPanel * 0.50
  );
  return max(probe, vec3(0.002)) * max(uGemHdriReflection, 0.0);
}

vec3 gemSpectralIors(float baseIor, float firePower) {
  float diamondFactor = smoothstep(1.62, 2.40, baseIor);
  float abbeSpread = mix(0.006, 0.044, diamondFactor) * (0.62 + clamp(firePower, 0.0, 1.8) * 0.38);
  return vec3(
    max(1.001, baseIor - abbeSpread * 0.28),
    max(1.001, baseIor),
    max(1.001, baseIor + abbeSpread * 0.72)
  );
}
float gemStudioSpectrumBand(vec3 ray, vec3 axis, float sharpness) {
  vec3 r = normalize(ray);
  vec3 a = normalize(axis);
  return pow(clamp(1.0 - abs(dot(r, a)), 0.0, 1.0), sharpness);
}
vec3 gemSpectralDispersionFire(vec3 n, vec3 v, float phase) {
  vec3 iors = gemSpectralIors(uGemIor, uGemFirePower);
  vec3 rRay = gemSurfaceRefraction(n, v, iors.r);
  vec3 gRay = gemSurfaceRefraction(n, v, iors.g);
  vec3 bRay = gemSurfaceRefraction(n, v, iors.b);
  vec3 exitA = normalize(n.yzx * vec3(0.72, 1.18, 0.93) + n * 0.24);
  vec3 exitB = normalize(n.zxy * vec3(1.05, 0.84, 1.18) - n * 0.16);
  rRay = gemInternalTIRDirection(rRay, exitA, iors.r);
  gRay = gemInternalTIRDirection(gRay, normalize(exitA + exitB), iors.g);
  bRay = gemInternalTIRDirection(bRay, exitB, iors.b);
  vec3 axisA = normalize(vec3(0.26, 0.92, -0.28));
  vec3 axisB = normalize(vec3(-0.72, 0.18, 0.68));
  vec3 axisC = normalize(vec3(0.58, -0.38, 0.72));
  float r = gemStudioSpectrumBand(rRay, axisA, 18.0) + gemStudioSpectrumBand(rRay, axisB, 31.0) * 0.72;
  float g = gemStudioSpectrumBand(gRay, axisB, 20.0) + gemStudioSpectrumBand(gRay, axisC, 29.0) * 0.64;
  float b = gemStudioSpectrumBand(bRay, axisC, 17.0) + gemStudioSpectrumBand(bRay, axisA, 33.0) * 0.82;
  float facetGate = pow(clamp(abs(sin(dot(normalize(n + v * 0.35), vec3(17.0, 41.0, 23.0)) * (uGemFacetScale + phase))), 0.0, 1.0), 8.0);
  float edgeGate = smoothstep(0.10, 0.88, 1.0 - abs(dot(normalize(n), normalize(v))));
  float diamondGate = smoothstep(1.35, 2.42, uGemIor) * (0.34 + uGemClearness * 0.66);
  return vec3(r, g, b) * (0.12 + facetGate * 0.88) * (0.25 + edgeGate * 0.75) * diamondGate;
}
float gemHash(vec3 p) {
  p = fract(p * 0.3183099 + vec3(0.17, 0.31, 0.47));
  p *= 17.0;
  return fract(p.x * p.y * p.z * (p.x + p.y + p.z));
}
float gemFacetSpark(vec3 n, vec3 v) {
  vec3 q = normalize(n * 2.1 + v * 1.35);
  float a = pow(abs(sin(dot(q, vec3(15.7, 31.1, 9.3)) * uGemFacetScale)), 18.0);
  float b = pow(abs(sin(dot(q, vec3(7.4, 19.7, 27.5)) * (uGemFacetScale + 2.0))), 12.0);
  return clamp(a * 0.72 + b * 0.38, 0.0, 1.0);
}
float gemInternalBounce(vec3 n, vec3 v, float phase) {
  vec3 refractedRay = gemSurfaceRefraction(n, v, uGemIor);
  vec3 tirNormalA = normalize(n.yzx * vec3(0.72, 1.18, 0.93) + n * 0.28);
  vec3 tirNormalB = normalize(n.zxy * vec3(1.08, 0.82, 1.16) - n * 0.18);
  float tirA = gemTotalInternalReflectionMask(refractedRay, tirNormalA, uGemIor);
  vec3 bounce1 = normalize(mix(reflect(refractedRay, n), gemInternalTIRDirection(refractedRay, tirNormalA, uGemIor), tirA * 0.82));
  float tirB = gemTotalInternalReflectionMask(bounce1, tirNormalB, uGemIor);
  vec3 bounce2 = normalize(mix(reflect(bounce1, tirNormalA), gemInternalTIRDirection(bounce1, tirNormalB, uGemIor), tirB * 0.72));
  float causticA = pow(abs(sin(dot(bounce1, vec3(21.7, 13.1, 8.6)) * (uGemFacetScale + phase))), 22.0);
  float causticB = pow(abs(sin(dot(bounce2, vec3(9.4, 25.3, 17.8)) * (uGemFacetScale * 0.72 + phase))), 18.0);
  float trap = smoothstep(0.18, 0.92, 1.0 - abs(dot(n, v)));
  float tirBoost = 1.0 + tirA * 0.85 + tirB * 0.55;
  return clamp((causticA * 0.72 + causticB * 0.55) * trap * tirBoost, 0.0, 1.0);
}
float gemInternalMultiBounce(vec3 n, vec3 v) {
  vec3 ray = gemSurfaceRefraction(n, v, uGemIor);
  vec3 axis = normalize(n.yzx + vec3(0.07, 0.13, 0.19));
  float accum = 0.0;
  float energy = 1.0;
  for (int i = 0; i < 16; i++) {
    float fi = float(i);
    float bounceEnabled = step(fi + 0.5, uGemBounceCount);
    vec3 exitNormal = normalize(axis * vec3(0.82 + fi * 0.013, 1.14, 0.91) + n * (0.24 - fi * 0.006));
    float tir = gemTotalInternalReflectionMask(ray, exitNormal, uGemIor);
    ray = gemInternalTIRDirection(ray, exitNormal, uGemIor);
    float shardA = pow(abs(sin(dot(ray, vec3(12.7, 29.3, 47.1)) * (uGemFacetScale * 0.42 + fi * 0.73))), 18.0);
    float shardB = pow(abs(sin(dot(ray, vec3(37.2, 11.9, 23.4)) * (uGemFacetScale * 0.31 + fi * 1.17))), 24.0);
    float trapped = 0.34 + tir * 1.15;
    float travel = 0.68 + fi * 0.32 + (1.0 - abs(dot(ray, n))) * 0.72;
    float beerEnergy = dot(gemBeerLambert(uGemAttenuationColor, travel), vec3(0.3333));
    accum += bounceEnabled * energy * beerEnergy * (shardA * 0.58 + shardB * 0.42) * trapped;
    energy *= mix(1.0, (0.78 + tir * 0.16) * beerEnergy, bounceEnabled);
    axis = normalize(axis.zxy + ray * 0.43 + n * 0.22 + vec3(0.01, 0.03, 0.02) * (fi + 1.0));
  }
  return clamp(accum / max(uGemBounceCount, 1.0) * 2.45, 0.0, 1.0);
}
float gemPavilionReturn(vec3 n, vec3 v) {
  vec3 entry = gemSurfaceRefraction(n, v, uGemIor);
  vec3 pavilion = normalize(vec3(-n.x * 0.7, -abs(n.y) - 0.42, n.z * 0.82));
  float pavilionTir = gemTotalInternalReflectionMask(entry, pavilion, uGemIor);
  vec3 firstBounce = normalize(mix(reflect(entry, pavilion), gemInternalTIRDirection(entry, pavilion, uGemIor), pavilionTir));
  vec3 crownNormal = normalize(pavilion.zxy + n * 0.35);
  float crownTir = gemTotalInternalReflectionMask(firstBounce, crownNormal, uGemIor);
  vec3 secondBounce = normalize(mix(reflect(firstBounce, crownNormal), gemInternalTIRDirection(firstBounce, crownNormal, uGemIor), crownTir));
  float starA = pow(abs(sin(dot(firstBounce, vec3(31.0, 17.0, 11.0)) * (uGemFacetScale * 0.72))), 12.0);
  float starB = pow(abs(sin(dot(secondBounce, vec3(13.0, 29.0, 23.0)) * (uGemFacetScale * 0.58))), 16.0);
  float window = smoothstep(0.12, 0.88, abs(dot(n, v)));
  float rimTrap = smoothstep(0.2, 1.0, 1.0 - abs(dot(firstBounce, n)));
  float tirReturn = 1.0 + pavilionTir * 0.9 + crownTir * 0.65;
  return clamp((starA * 0.68 + starB * 0.82) * mix(rimTrap, window, 0.45) * tirReturn, 0.0, 1.0);
}
float gemRadialFacet(vec3 n, vec3 v, float sectors, float phase) {
  vec3 q = normalize(n * 1.35 + v * 0.75 + vec3(0.001, 0.002, 0.003));
  float a = atan(q.z, q.x) + phase;
  float sector = abs(fract(a / 6.2831853 * sectors) - 0.5) * 2.0;
  float spoke = pow(1.0 - sector, 5.0);
  float crown = smoothstep(0.12, 0.9, length(q.xz));
  float checker = step(0.5, fract(a / 6.2831853 * sectors * 0.5));
  return clamp(spoke * crown * mix(0.62, 1.0, checker), 0.0, 1.0);
}
vec3 gemSpectralSplit(float amount, float phase) {
  return vec3(
    amount * (0.72 + 0.28 * sin(phase)),
    amount * (0.58 + 0.42 * sin(phase + 2.09)),
    amount * (0.74 + 0.26 * sin(phase + 4.18))
  );
}`
      )
      .replace(
        "#include <output_fragment>",
        `vec3 gemN = normalize(normal);
vec3 gemV = normalize(vViewPosition);
float gemFacing = clamp(abs(dot(gemN, gemV)), 0.0, 1.0);
float gemFresnel = gemSchlickFresnel(gemFacing, uGemIor);
float gemMicroHaze = smoothstep(0.0, 0.08, uGemMicroRoughness);
float gemOpticalPolish = 1.0 - gemMicroHaze;
float diamondMode = smoothstep(1.08, 1.55, uGemBouncePower) * uGemClearness;
float gemSpark = gemFacetSpark(gemN, gemV) * uGemFirePower;
float gemMicroFire = gemHash(gemN * uGemFacetScale + gemV * 4.0);
vec3 gemSpectrum = vec3(
  gemSpark * (0.56 + 0.44 * sin(gemMicroFire * 6.2831)),
  gemSpark * (0.48 + 0.52 * sin(gemMicroFire * 6.2831 + 2.1)),
  gemSpark * (0.58 + 0.42 * sin(gemMicroFire * 6.2831 + 4.2))
);
float gemBounceA = gemInternalBounce(gemN, gemV, 0.0) * uGemBouncePower;
float gemBounceB = gemInternalBounce(normalize(gemN.yzx), gemV, 3.2) * uGemBouncePower;
float gemBounceC = gemInternalBounce(normalize(gemN.zxy * vec3(1.12, 0.86, 1.0)), gemV, 6.4) * uGemBouncePower;
float gemMultiBounce = gemInternalMultiBounce(gemN, gemV) * uGemBouncePower;
float gemPavilion = gemPavilionReturn(gemN, gemV) * uGemBouncePower;
float gemStar12 = gemRadialFacet(gemN, gemV, 12.0, 0.15) * uGemClearness;
float gemStar16 = gemRadialFacet(normalize(gemN.yzx), gemV, 16.0, 0.58) * uGemClearness;
float gemTirFresnel = smoothstep(0.16, 0.96, gemFresnel) * smoothstep(1.2, 2.45, uGemIor);
float gemCoreShadow = smoothstep(0.20, 0.90, gemFacing) * uGemInternalDepth;
float gemDarkReturn = smoothstep(0.16, 0.86, gemPavilion + gemStar12 * 0.7) * (0.38 + uGemClearness * 0.72);
float gemMirrorWindow = smoothstep(0.16, 0.88, gemFacing) * (0.42 + 0.58 * uGemClearness);
vec3 reflectDir = reflect(-gemV, gemN);
vec3 refractDir = gemSurfaceRefraction(gemN, gemV, uGemIor);
vec3 gemRGBIors = gemSpectralIors(uGemIor, uGemFirePower);
vec3 gemChromaticFire = gemSpectralDispersionFire(gemN, gemV, gemMicroFire * 6.2831);
float gemTirPhysical = max(
  gemTotalInternalReflectionMask(refractDir, normalize(-gemN + vec3(0.18, -0.62, 0.10)), uGemIor),
  gemTotalInternalReflectionMask(refractDir, normalize(gemN.yzx * vec3(0.75, 1.1, 0.95)), uGemIor)
);
float gemTir = clamp(max(gemTirFresnel, gemTirPhysical) * smoothstep(1.2, 2.45, uGemIor), 0.0, 1.0);
float gemApproxPath = (0.65 + (1.0 - gemFacing) * 1.35 + uGemBounceCount * 0.18) * uGemInternalDepth;
vec3 gemBeerTransmission = gemBeerLambert(uGemAttenuationColor, gemApproxPath);
float refractBandA = pow(smoothstep(0.52, 0.98, abs(refractDir.y)), 2.6);
float refractBandB = pow(smoothstep(0.48, 0.95, abs(refractDir.x * 0.64 - refractDir.z * 0.76)), 3.1);
float studioBandA = pow(smoothstep(0.66, 0.98, abs(reflectDir.y)), 2.0);
float studioBandB = pow(smoothstep(0.58, 0.96, abs(reflectDir.x * 0.78 + reflectDir.z * 0.62)), 2.8);
vec3 gemHdriReflect = gemHdriReflectionProbe(reflectDir);
vec3 gemHdriRefract = gemHdriReflectionProbe(refractDir);
float cutHash = gemHash(floor(abs(gemN) * 47.0 + vec3(1.7, 5.1, 9.3)));
float darkShard = step(0.58, cutHash) * smoothstep(0.12, 0.96, gemPavilion + gemStar12 * 0.42);
float brightShard = step(cutHash, 0.30) * clamp(studioBandA + studioBandB + gemStar16 * 0.42, 0.0, 1.0);
float gemKaleido = gemRadialFacet(normalize(gemN.xzy + vec3(0.03, 0.01, 0.02)), gemV, 32.0, 1.05) * uGemClearness;
float gemReturnMask = clamp(gemKaleido * 0.35 + darkShard * 0.85 + brightShard * 0.72, 0.0, 1.0);
vec3 gemReturnStripe = mix(vec3(0.012, 0.014, 0.019), vec3(0.93, 0.98, 1.0), brightShard);
vec3 gemBounceSpectrum = gemSpectralSplit(gemBounceA + gemBounceB * 0.84 + gemBounceC * 0.66 + gemMultiBounce * 0.72, gemMicroFire * 6.2831);
vec3 gemFacetWhite = vec3(1.0) * pow(max(gemPavilion, gemStar16), 1.35) * (0.22 + uGemClearness * 0.58);
vec3 gemFacetBlack = vec3(0.003, 0.004, 0.006) * (0.86 + uGemClearness * 0.14);
float gemColorHold = clamp(uGemColorStrength, 0.0, 1.0);
float clearDiamondMode = diamondMode * (1.0 - gemColorHold * 0.72);
vec3 gemBodyTint = mix(vec3(1.0), uGemBodyColor, gemColorHold);
vec3 gemOpticalBase = mix(outgoingLight * (0.38 - uGemInternalDepth * 0.08), uGemBodyColor * (0.22 + gemColorHold * 0.34) + vec3(0.025, 0.03, 0.04) * (1.0 - gemColorHold * 0.62), gemCoreShadow * (0.18 - uGemClearness * 0.06));
outgoingLight = mix(gemOpticalBase, outgoingLight * 0.42 + vec3(0.30, 0.34, 0.39), clearDiamondMode * 0.72);
outgoingLight = mix(outgoingLight, gemReturnStripe, gemReturnMask * (0.38 + diamondMode * 0.34));
outgoingLight = mix(outgoingLight, gemFacetBlack, clamp(gemDarkReturn * (0.55 + uGemClearness * 0.85) * gemMirrorWindow, 0.0, 0.78));
outgoingLight += vec3(studioBandA + studioBandB) * diamondMode * 0.32;
outgoingLight += gemHdriReflect * diamondMode * (0.14 + gemFresnel * 0.42) * mix(1.0, 0.68, gemMicroHaze);
outgoingLight += gemHdriRefract * diamondMode * (1.0 - gemFresnel) * 0.16;
vec3 refractedReturn = mix(uGemAttenuationColor, vec3(1.0), 0.62) * (refractBandA * 0.18 + refractBandB * 0.12);
outgoingLight += refractedReturn * diamondMode * (1.0 - gemFresnel) * (0.5 + uGemClearness * 0.5);
outgoingLight += uGemFireColor * gemFresnel * (0.34 + uGemFirePower * 0.48);
outgoingLight += gemSpectrum * (0.14 + uGemFirePower * 0.42);
outgoingLight += gemBounceSpectrum * (0.36 + uGemFirePower * 1.1);
outgoingLight += vec3(0.82, 0.92, 1.0) * gemMultiBounce * diamondMode * (0.18 + uGemBounceCount * 0.018);
outgoingLight += gemChromaticFire * (0.45 + uGemFirePower * 1.15) * (0.74 + gemTir * 0.52);
outgoingLight += gemFacetWhite * mix(1.0, 0.58, gemMicroHaze);
outgoingLight += mix(uGemFireColor, vec3(1.0), mix(0.78, 0.34, gemColorHold)) * gemTir * (0.22 + uGemBouncePower * 0.38);
outgoingLight += mix(vec3(0.006, 0.008, 0.012), vec3(1.0), gemTir) * gemTir * diamondMode * (0.16 + uGemBouncePower * 0.28);
float diamondFacetAngle = atan(gemN.z, gemN.x);
float diamondFacetLatticeA = pow(abs(sin(diamondFacetAngle * 10.0 + gemN.y * 18.0 + gemFacing * 3.1)), 8.0);
float diamondFacetLatticeB = pow(abs(sin(diamondFacetAngle * 17.0 - gemN.y * 11.0 + dot(gemN, gemV) * 4.0)), 11.0);
float diamondMirrorCut = diamondMode * smoothstep(0.50, 0.98, max(diamondFacetLatticeA, diamondFacetLatticeB)) * (0.20 + 0.80 * gemFacing);
float diamondMirrorChoice = step(0.54, gemHash(gemN * 91.0 + gemV * 17.0));
vec3 diamondMirrorColor = mix(vec3(0.008, 0.010, 0.016), vec3(0.92, 0.98, 1.0), diamondMirrorChoice);
outgoingLight = mix(outgoingLight, diamondMirrorColor, diamondMirrorCut * mix(0.30, 0.58, gemOpticalPolish));
float diamondPinFire = diamondMode * pow(abs(sin(dot(reflectDir, vec3(29.0, 41.0, 13.0)) * 17.0 + gemMicroFire * 6.2831)), mix(40.0, 13.0, gemMicroHaze));
vec3 diamondRGBFire = normalize(vec3(
  0.95 + 0.05 * sin(gemMicroFire * 6.2831),
  0.62 + 0.38 * sin(gemMicroFire * 6.2831 + 2.09),
  0.78 + 0.22 * sin(gemMicroFire * 6.2831 + 4.18)
) + gemChromaticFire * vec3(1.18, 0.92, 1.42));
outgoingLight += diamondRGBFire * diamondPinFire * (0.75 + uGemFirePower * 0.85) * mix(0.42, 1.0, gemOpticalPolish);
vec3 diamondRT = clamp(vDiamondRayColor * mix(vec3(1.0), vec3(gemRGBIors.r / gemRGBIors.g, 1.0, gemRGBIors.b / gemRGBIors.g), 0.42) + gemHdriReflect * 0.10 + gemHdriRefract * 0.055, vec3(0.0), vec3(2.65));
float diamondRTLuma = dot(diamondRT, vec3(0.299, 0.587, 0.114));
float diamondRTMask = diamondMode * smoothstep(0.025, 0.55, diamondRTLuma);
vec3 diamondRTContrast = mix(vec3(0.006, 0.007, 0.011), diamondRT, smoothstep(0.10, 0.92, diamondRTLuma));
outgoingLight = mix(outgoingLight, diamondRTContrast, diamondRTMask * 0.72);
outgoingLight += diamondRT * diamondRTMask * (0.28 + uGemFirePower * 0.55) * mix(0.68, 1.0, gemOpticalPolish);
outgoingLight *= mix(vec3(1.0), gemBeerTransmission, clamp(0.34 + clearDiamondMode * 0.42 + gemColorHold * 0.16, 0.0, 0.82));
vec3 gemBodyRecolor = outgoingLight * gemBodyTint * uGemBodyBoost + uGemBodyColor * gemColorHold * (0.07 + (1.0 - gemFresnel) * 0.13);
outgoingLight = mix(outgoingLight, gemBodyRecolor, gemColorHold * 0.82);
outgoingLight = mix(outgoingLight, vec3(dot(outgoingLight, vec3(0.3333))) + outgoingLight * 0.78, gemMicroHaze * clearDiamondMode * 0.16);
outgoingLight = mix(outgoingLight, outgoingLight + vec3(1.0) * 0.08, uGemMilky);
float gemHighlightLuma = dot(outgoingLight, vec3(0.2126, 0.7152, 0.0722));
float gemHighlightCompression = 1.0 / (1.0 + max(gemHighlightLuma - 1.05, 0.0) * 0.30);
outgoingLight *= gemHighlightCompression;
#include <output_fragment>`
      );
  };
  material.customProgramCacheKey = () => `ctva-gem-optics-v26-energy-safe-${optical.isOpaque ? 'opaque' : 'clear'}-${optical.isCabochon ? 'cab' : 'faceted'}-${optical.isPearl ? 'pearl' : 'gem'}`;
  material.needsUpdate = true;
  return material;
}
function applyGemReflectionFinish(material, preset = {}) {
  if (!material) return material;
  const storedPresetId = material.userData?.jewelryMaterial?.preset;
  const storedPreset = storedPresetId && gemPresets[storedPresetId] ? gemPresets[storedPresetId] : null;
  preset = { ...(storedPreset || {}), ...preset };
  const optical = getGemOpticalQualityProfile(preset, material);
  const solidOptical = shouldRenderGemAsSolidOptical(optical);
  const fireColor = new THREE.Color(preset.fire || "#ffffff");
  const bodyColor = new THREE.Color(preset.color || material.color || "#ffffff");
  material.color.copy(optical.isClearGem ? new THREE.Color("#f8fcff") : bodyColor);
  material.attenuationColor = new THREE.Color(preset.attenuation || bodyColor);
  material.ior = optical.ior;
  material.clearcoat = Math.max(material.clearcoat ?? 0, optical.isPearl ? 0.88 : 1);
  material.clearcoatRoughness = optical.clearcoatRoughness;
  material.roughness = optical.roughness;
  material.envMap = scene.environment || material.envMap || null;
  material.envMapIntensity = Math.max(material.envMapIntensity ?? 1, optical.envMapIntensity);
  material.reflectivity = 1;
  material.specularIntensity = 1;
  material.specularColor = fireColor.clone().lerp(new THREE.Color("#ffffff"), optical.isClearGem ? 0.96 : 0.78);
  material.iridescence = Math.max(material.iridescence || 0, optical.iridescence);
  material.iridescenceIOR = Math.max(material.iridescenceIOR || 1.45, 1.62);
  material.thickness = optical.thickness;
  material.attenuationDistance = optical.attenuationDistance;
  material.dispersion = Math.max(material.dispersion || 0, optical.iorSpread * 22);
  if (!optical.isOpaque) {
    material.transmission = optical.pbrTransmission;
    material.opacity = solidOptical ? 1 : optical.opacity;
    material.transparent = !solidOptical && optical.opacity < 0.995;
    material.depthWrite = solidOptical || optical.opacity >= 0.97;
    material.side = THREE.DoubleSide;
    material.shadowSide = THREE.DoubleSide;
  } else {
    material.transmission = Math.min(material.transmission || 0, 0.08);
    material.opacity = 1;
    material.transparent = false;
    material.depthWrite = true;
  }
  material.flatShading = !optical.isCabochon && optical.isOpticalGem;
  applyDiamondHdriReflectionToMaterial(material, preset);
  installGemOpticalShader(material, preset);
  material.needsUpdate = true;
  return material;
}
function makeGemMaterialFromSource(source, name) {
  const lower = name.toLowerCase();
  const presetId =
    Object.keys(gemPresets).find((id) => lower.includes(id) || lower.includes(gemPresets[id].label.toLowerCase())) ||
    guessGemPresetFromColor(source?.color || new THREE.Color(settings.gemColor));
  const preset = gemPresets[presetId] || gemPresets.padparadscha;
  const sourceColor = source?.color || new THREE.Color(preset.color);
  const optical = getGemOpticalQualityProfile(preset, source);
  const mat = new THREE.MeshPhysicalMaterial({
    name: `PBR ${preset.label}`,
    color: sourceColor.clone().lerp(new THREE.Color(preset.color), 0.42),
    roughness: optical.roughness,
    metalness: 0,
    transmission: optical.pbrTransmission,
    thickness: optical.thickness,
    ior: optical.ior,
    attenuationColor: new THREE.Color(preset.attenuation),
    attenuationDistance: optical.attenuationDistance,
    clearcoat: preset.pearl ? 0.85 : 1,
    clearcoatRoughness: optical.clearcoatRoughness,
    iridescence: preset.iridescence || optical.iridescence,
    envMapIntensity: optical.envMapIntensity,
  });
  if (preset.cabochon) {
    mat.side = THREE.DoubleSide;
    mat.shadowSide = THREE.DoubleSide;
    mat.needsUpdate = true;
  }
  applyGemReflectionFinish(mat, preset);
  mat.userData.jewelryMaterial = { type: "gem", preset: presetId };
  return mat;
}

function makeGemMaterialFromPreset(id) {
  const preset = gemPresets[id] || gemPresets.padparadscha;
  const optical = getGemOpticalQualityProfile(preset, null);
  const mat = new THREE.MeshPhysicalMaterial({
    name: preset.label,
    color: new THREE.Color(preset.color),
    roughness: optical.roughness,
    metalness: 0,
    transmission: optical.pbrTransmission,
    thickness: optical.thickness,
    ior: optical.ior,
    attenuationColor: new THREE.Color(preset.attenuation),
    attenuationDistance: optical.attenuationDistance,
    clearcoat: preset.pearl ? 0.85 : 1,
    clearcoatRoughness: optical.clearcoatRoughness,
    iridescence: preset.iridescence || optical.iridescence,
    envMapIntensity: optical.envMapIntensity,
  });
  mat.userData.jewelryMaterial = { type: "gem", preset: id };
  applyGemPresetTexture(mat, preset);
  if (preset.cabochon) {
    mat.side = THREE.DoubleSide;
    mat.shadowSide = THREE.DoubleSide;
    mat.needsUpdate = true;
  }
  applyGemReflectionFinish(mat, preset);
  return mat;
}

function applyGemPresetTexture(material, preset) {
  if (!material) return;
  if (!preset?.texture || (isTransparentOpticalGemPreset(preset, material) && !preset.cabochon && !preset.opaque && !preset.pearl)) {
    material.map = null;
    material.needsUpdate = true;
    return;
  }
  material.map = getGemPresetTexture(preset);
  material.needsUpdate = true;
}

function getGemPresetTexture(preset) {
  if (gemTextureCache.has(preset.texture)) return gemTextureCache.get(preset.texture);
  const texture = gemTextureLoader.load(
    preset.texture,
    () => {
      centerGemMaterial.needsUpdate = true;
    },
    undefined,
    () => logDebug("gem", `Texture de pierre introuvable : ${preset.texture}`)
  );
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.repeat.set(preset.cabochon || preset.opaque || preset.pearl ? 1.15 : 1.45, preset.cabochon || preset.opaque || preset.pearl ? 1.15 : 1.45);
  texture.center.set(0.5, 0.5);
  texture.anisotropy = 12;
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.needsUpdate = true;
  gemTextureCache.set(preset.texture, texture);
  return texture;
}

function guessGemPresetFromColor(color) {
  const hsl = {};
  color.getHSL(hsl);
  if (hsl.s < 0.12 && hsl.l > 0.78) return "diamond";
  if (hsl.h < 0.02 || hsl.h > 0.94) return "ruby";
  if (hsl.h > 0.55 && hsl.h < 0.72) return "sapphire";
  if (hsl.h > 0.28 && hsl.h < 0.48) return "emerald";
  if (hsl.h > 0.72 && hsl.h < 0.84) return "amethyst";
  if (hsl.h > 0.48 && hsl.h < 0.56) return "aquamarine";
  if (hsl.h > 0.06 && hsl.h < 0.16) return "citrine";
  return "padparadscha";
}

function showNotice(message) {
  logDebug("notice", message);
  noticeEl.textContent = message;
  noticeEl.hidden = false;
  clearTimeout(showNotice.timer);
  showNotice.timer = setTimeout(() => {
    noticeEl.hidden = true;
  }, 5200);
}

function animate() {
  const elapsed = clock.getElapsedTime();
  if (!stemDecalGesture?.busy) controls.update();
  if (selectedStemDecal) {
    if (selectedStemDecal.parent) stemDecalSelectionHelper?.update();
    else { stemDecalGesture?.cancel(); clearStemDecalSelection(); }
  }
  reflectionRig.children.forEach((child, index) => {
    if (child.isMesh && centerGemMesh) {
      child.rotation.y = centerGemMesh.rotation.y + Math.sin(elapsed * 0.45 + index) * 0.012;
    }
    if (child.isSprite) {
      if (child.userData.customReflection) return;
      const pulse = 1 + Math.sin(elapsed * 2.7 + child.userData.phase) * 0.16;
      child.scale.setScalar(child.userData.baseScale * pulse * (1 + settings.reflectionIntensity * 0.08) * settings.causticSpread);
    }
  });
  if (selectedManipulatorObject !== causticPlane || !transformControls.dragging) {
    causticPlane.rotation.z = Math.sin(elapsed * 0.18) * 0.1;
  }
  updateGemOpticalEffect();
  updateDiamondGpuBvhUniforms();
  composer.render();
  requestAnimationFrame(animate);
}

window.addEventListener("resize", () => {
  const width = window.innerWidth;
  const height = window.innerHeight;
  camera.aspect = width / height;
  camera.updateProjectionMatrix();
  renderer.setSize(width, height);
  composer.setSize(width, height);
  bloomPass.setSize(width, height);
  updateArVideoTextureTransform();
});



function startJewelryConfigurator() {
  const launchParams = new URLSearchParams(window.location.search);
  const requestedCatalogModel = launchParams.get("catalogModel");
  const requestedMetalFamily = launchParams.get("metalFamily");
  const requestedMetalFinish = launchParams.get("metalFinish");
  if (requestedCatalogModel && modelDefaults[requestedCatalogModel]) {
    settings.modelId = requestedCatalogModel;
    const modelSelect = document.querySelector("#jewel-model");
    if (modelSelect) modelSelect.value = requestedCatalogModel;
  }
  const requestedMeta = getCatalogModelMeta(settings.modelId, modelDefaults[settings.modelId]?.title || "");
  if (requestedMetalFinish && metalPresets[requestedMetalFinish]
    && catalogModelSupportsMetalFinish(requestedMeta, requestedMetalFamily, requestedMetalFinish)) {
    settings.metalPreset = requestedMetalFinish;
  }

  const initialModelLoad = Promise.resolve(loadJewelryExample(settings.modelId, { applyGemDefault: false }));
  buildGemOpticalEffect();
  applyBackground("black");
  applySupportMaterial(settings.supportMaterial);
  wireInterface();
  initialModelLoad
    .then(() => restorePersistentModelLibrary())
    .then(() => loadInitialModelFromUrl())
    .then(() => applyWelcomeLaunchConfiguration(launchParams))
    .then(() => applyThumbnailCaptureComposition(launchParams))
    .then(() => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))))
    .then(() => {
      document.body.dataset.viewerReady = "true";
    })
    .catch((error) => console.error("Initialisation de la bibliothèque impossible", error))
    .finally(() => finishLoading());
  animate();
}

function applyThumbnailCaptureComposition(params) {
  if (params.get("thumbnail") !== "1") return;
  const viewOffset = camera.position.clone().sub(controls.target).multiplyScalar(0.7);
  camera.position.copy(controls.target).add(viewOffset);
  camera.updateProjectionMatrix();
  controls.update();
}

let rosebudsProductUrlsPromise = null;

async function updateViewerProductInformation(params, meta) {
  const plugSize = params.get("plugSize") || meta.size || "";
  const plugSizeParts = plugSize.split("-");
  const metalFinish = params.get("metalFinish") || settings.metalPreset || "";
  const metalFamily = params.get("metalFamily") || (metalFinish.startsWith("aluminum-") ? "alu" : "inox");
  const configuration = {
    catalogModel: settings.modelId,
    modelLabel: String(modelDefaults[settings.modelId]?.title || meta.label || settings.modelId).replace(/\bclassique\b/gi, "Originale"),
    modelFamily: params.get("modelFamily") || meta.modelFamily,
    classicHead: params.get("classicHead") || (normalizeCatalogText(meta.source).includes("sans tete") ? "sans-tete" : "avec-tete"),
    plugSize,
    plugSizeLabel: plugSizeParts[0] || meta.metalSizeClass || "Plug",
    plugDiameterMm: Number(plugSizeParts.at(-1)) || meta.diameterMm || null,
    crystalSize: params.get("crystalSize") || "",
    metalFamily,
    metalFinish,
    ornament: params.get("ornament") || (meta.ornamentFamilies.includes("crystal") ? "crystal" : meta.ornamentFamilies[0] || "none"),
    ornamentFinish: params.get("ornamentFinish") || "",
  };
  const summary = document.querySelector("#viewer-product-summary");
  if (summary) summary.textContent = buildViewerProductSummary(configuration);

  const link = document.querySelector("#viewer-product-link");
  if (!link) return;
  try {
    rosebudsProductUrlsPromise ||= fetch("./assets/data/rosebuds-products.json")
      .then((response) => response.ok ? response.json() : Promise.reject(new Error(`Catalogue HTTP ${response.status}`)))
      .then((payload) => Array.isArray(payload?.urls) ? payload.urls : []);
    const productUrls = await rosebudsProductUrlsPromise;
    const result = resolveRosebudsProductLink(configuration, productUrls);
    link.href = result.url;
    link.textContent = result.label;
    link.dataset.custom = String(result.custom);
  } catch (error) {
    const result = resolveRosebudsProductLink(configuration, []);
    link.href = result.url;
    link.textContent = result.label;
    link.dataset.custom = String(result.custom);
    logDebug("catalog", "Catalogue public Rosebuds indisponible, lien de repli utilisé.", { message: error?.message || String(error) });
  }
}

async function applyWelcomeLaunchConfiguration(params) {
  const meta = getCatalogModelMeta(settings.modelId, modelDefaults[settings.modelId]?.title || "");
  const metalFamily = params.get("metalFamily");
  const metalFinish = params.get("metalFinish");
  if (metalFinish && metalPresets[metalFinish] && catalogModelSupportsMetalFinish(meta, metalFamily, metalFinish)) {
    const preset = metalPresets[metalFinish];
    const metalSelect = document.querySelector("#metal-preset");
    if (metalSelect) metalSelect.value = metalFinish;
    applyMetalPreset(metalFinish);
    root.traverse((child) => {
      if (!child.isMesh) return;
      const materials = Array.isArray(child.material) ? child.material : [child.material];
      const isMetal = child.userData?.classicPlugRole === "metal" || materials.some((material) => material?.userData?.jewelryMaterial?.type === "metal");
      if (!isMetal) return;
      materials.filter(Boolean).forEach((material) => {
        material.color?.set(preset.color);
        material.metalness = 1;
        material.roughness = preset.roughness;
        material.envMapIntensity = preset.env;
        if ("clearcoat" in material) material.clearcoat = 0.72;
        if ("clearcoatRoughness" in material) material.clearcoatRoughness = preset.clearcoatRoughness;
        material.needsUpdate = true;
      });
    });
  }

  const ornamentFamily = params.get("ornament");
  const ornamentFinish = params.get("ornamentFinish");
  if (ornamentFamily && ornamentFinish && ornamentFamily !== "none"
    && catalogModelSupportsOrnament(meta, ornamentFamily, metalFamily)) {
    applyCatalogGemPreset(ornamentFamily, ornamentFinish, { reason: "configuration accueil" });
  }
  await updateViewerProductInformation(params, meta);
}

window.addEventListener("pagehide", () => {
  stopCameraAR(false);
  optimizedRenderWorker?.terminate();
  optimizedRenderWorker = null;
  const imageUrl = document.querySelector("#optimized-render-image")?.dataset.objectUrl;
  if (imageUrl) URL.revokeObjectURL(imageUrl);
});

startJewelryConfigurator();




















































