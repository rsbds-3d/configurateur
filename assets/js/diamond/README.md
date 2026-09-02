# Module DiamondBVHMaterial

Ce module fournit un materiau diamant temps reel pour Three.js base sur `three-mesh-bvh`.
Il lance des rayons a l'interieur du maillage de la pierre, au lieu de se limiter a un materiau PBR classique.

## Ce qui est implemente

- Reflexion Fresnel physiquement plausible via Schlick.
- Refraction avec `refract()`.
- Reflection totale interne quand la refraction n'est plus possible.
- Dispersion spectrale RGB avec IOR different pour rouge, vert et bleu.
- Rebonds internes configurables, par defaut 10.
- Absorption Beer-Lambert tres faible, reglable.
- Surface polie avec micro-rugosite optionnelle.
- Reflexions issues de la texture HDRI/PMREM de Three.js.
- Acceleration des intersections internes avec `three-mesh-bvh`.
- Compatible avec tout `THREE.Mesh` charge depuis GLTF/GLB ou OBJ.

## Important

Le rendu fonctionne surtout avec une geometrie fermee et propre : diamant, cristal ou cabochon watertight.
Si le maillage est ouvert ou que les normales sont incoherentes, le lancer de rayons interne ne peut pas donner un resultat physique stable.

## Exemple GLTF/GLB

```js
import * as THREE from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { RGBELoader } from "three/addons/loaders/RGBELoader.js";
import { prepareDiamondMesh, updateDiamondBVHMaterial } from "./assets/js/diamond/DiamondBVHMaterial.js";

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.05;

document.body.appendChild(renderer.domElement);

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(40, innerWidth / innerHeight, 0.01, 100);
camera.position.set(3, 1.5, 4);

const pmrem = new THREE.PMREMGenerator(renderer);
const hdr = await new RGBELoader().loadAsync("./assets/hdri/studio.hdr");
const environment = pmrem.fromEquirectangular(hdr).texture;
hdr.dispose();
scene.environment = environment;
scene.background = new THREE.Color(0x050505);

const gltf = await new GLTFLoader().loadAsync("./assets/models/diamond.glb");
scene.add(gltf.scene);

let diamondMesh = null;
gltf.scene.traverse((object) => {
  if (object.isMesh && !diamondMesh) diamondMesh = object;
});

const diamondMaterial = prepareDiamondMesh(diamondMesh, {
  renderer,
  camera,
  environment,
  shaderMode: "path-tracing",
  bounces: 10,
  pathSamples: 6,
  ior: 2.417,
  iorSpread: 0.052,
  beerAbsorption: 0.006,
  fireStrength: 1.45,
  microRoughness: 0.0,
  hdriIntensity: 1.25,
  color: 0xffffff,
  attenuationColor: 0xf8fbff,
});

function animate() {
  requestAnimationFrame(animate);
  updateDiamondBVHMaterial(diamondMaterial, { camera, renderer, environment });
  renderer.render(scene, camera);
}
animate();
```

## Exemple OBJ

```js
import { OBJLoader } from "three/addons/loaders/OBJLoader.js";
import { prepareDiamondMesh } from "./assets/js/diamond/DiamondBVHMaterial.js";

const root = await new OBJLoader().loadAsync("./assets/models/diamond.obj");
scene.add(root);

let diamondMesh = null;
root.traverse((object) => {
  if (object.isMesh && !diamondMesh) diamondMesh = object;
});

prepareDiamondMesh(diamondMesh, { renderer, camera, environment, bounces: 12 });
```

## Fichiers fournis

- `DiamondBVHMaterial.js` : module reutilisable.
- `../../examples/diamond-gltf-viewer.html` : exemple complet avec GLTF, HDRI et controles.

## Reglages conseilles

Pour un diamant incolore :

- `ior`: 2.417
- `iorSpread`: 0.045 a 0.065
- `bounces`: 8 a 14
- `beerAbsorption`: 0.002 a 0.008
- `microRoughness`: 0.0 a 0.015
- `fireStrength`: 1.2 a 2.0
- `shaderMode`: `path-tracing` pour le rendu le plus riche, `mesh-bvh` pour la performance.