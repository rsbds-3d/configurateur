import * as THREE from "three";
import {
  MeshBVH,
  MeshBVHUniformStruct,
  acceleratedRaycast,
  shaderStructs,
  shaderIntersectFunction,
} from "three-mesh-bvh";

THREE.Mesh.prototype.raycast = acceleratedRaycast;

/**
 * Defaults tuned for a colorless diamond in a high-contrast jewellery studio.
 * The shader is intended for closed, watertight gemstone meshes.
 */
export const DEFAULT_DIAMOND_BVH_OPTIONS = Object.freeze({
  color: new THREE.Color(0xffffff),
  attenuationColor: new THREE.Color(0xf8fbff),
  bounces: 10,
  ior: 2.417,
  iorSpread: 0.052,
  aberrationStrength: 1.0,
  beerAbsorption: 0.006,
  microRoughness: 0.0,
  fresnelBoost: 1.18,
  fireStrength: 1.45,
  hdriIntensity: 1.25,
  opacity: 1.0,
  shaderMode: "path-tracing",
  pathSamples: 6,
  maxLeafTris: 3,
});

const MODE_TO_NUMBER = Object.freeze({
  "mesh-bvh": 0,
  "studio-bvh": 1,
  "path-tracing": 2,
});

function clampNumber(value, fallback, min, max) {
  const n = Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, n));
}

function toColor(value, fallback) {
  if (value instanceof THREE.Color) return value.clone();
  if (value !== undefined && value !== null) return new THREE.Color(value);
  return fallback.clone();
}

function shaderModeToNumber(mode) {
  return MODE_TO_NUMBER[mode] ?? MODE_TO_NUMBER[DEFAULT_DIAMOND_BVH_OPTIONS.shaderMode];
}

function getCubeUVDefines(texture) {
  const image = texture?.image || {};
  const width = Math.max(16, image.width || 256);
  const height = Math.max(16, image.height || 128);
  const maxMip = Math.max(1, Math.round(Math.log2(height)) - 2);

  return {
    ENVMAP_TYPE_CUBE_UV: "",
    CUBEUV_TEXEL_WIDTH: (1 / width).toFixed(10),
    CUBEUV_TEXEL_HEIGHT: (1 / height).toFixed(10),
    CUBEUV_MAX_MIP: `${maxMip}.0`,
    BVH_STACK_DEPTH: 48,
  };
}

function buildUniforms(options, bvhUniform) {
  const defaults = DEFAULT_DIAMOND_BVH_OPTIONS;
  const color = toColor(options.color, defaults.color);
  const attenuationColor = toColor(options.attenuationColor, defaults.attenuationColor);

  return {
    envMap: { value: options.environment || null },
    bvh: { value: bvhUniform },
    resolution: { value: new THREE.Vector2(1, 1) },
    viewMatrixInverse: { value: new THREE.Matrix4() },
    projectionMatrixInverse: { value: new THREE.Matrix4() },
    color: { value: color },
    attenuationColor: { value: attenuationColor },
    ior: { value: clampNumber(options.ior, defaults.ior, 1.0, 3.0) },
    iorSpread: { value: clampNumber(options.iorSpread, defaults.iorSpread, 0.0, 0.18) },
    aberrationStrength: { value: clampNumber(options.aberrationStrength, defaults.aberrationStrength, 0.0, 3.0) },
    bounces: { value: Math.round(clampNumber(options.bounces, defaults.bounces, 1, 32)) },
    beerAbsorption: { value: clampNumber(options.beerAbsorption, defaults.beerAbsorption, 0.0, 0.08) },
    microRoughness: { value: clampNumber(options.microRoughness, defaults.microRoughness, 0.0, 0.12) },
    fresnelBoost: { value: clampNumber(options.fresnelBoost, defaults.fresnelBoost, 0.0, 3.0) },
    fireStrength: { value: clampNumber(options.fireStrength, defaults.fireStrength, 0.0, 4.0) },
    envIntensity: { value: clampNumber(options.hdriIntensity, defaults.hdriIntensity, 0.0, 8.0) },
    opacity: { value: clampNumber(options.opacity, defaults.opacity, 0.0, 1.0) },
    shaderMode: { value: shaderModeToNumber(options.shaderMode) },
    pathSamples: { value: Math.round(clampNumber(options.pathSamples, defaults.pathSamples, 1, 16)) },
  };
}

const vertexShader = /* glsl */`
varying vec3 vWorldPosition;
varying vec3 vWorldNormal;
varying mat4 vModelMatrix;
varying mat4 vModelMatrixInverse;

void main() {
  vec4 worldPosition = modelMatrix * vec4(position, 1.0);
  vWorldPosition = worldPosition.xyz;
  vWorldNormal = normalize(mat3(modelMatrix) * normal);
  vModelMatrix = modelMatrix;
  vModelMatrixInverse = inverse(modelMatrix);
  gl_Position = projectionMatrix * viewMatrix * worldPosition;
}
`;

const fragmentShader = /* glsl */`
precision highp isampler2D;
precision highp usampler2D;

#include <common>
#include <cube_uv_reflection_fragment>

${shaderStructs}
${shaderIntersectFunction}

out highp vec4 pc_fragColor;
#define gl_FragColor pc_fragColor

uniform sampler2D envMap;
uniform BVH bvh;
uniform vec2 resolution;
uniform mat4 viewMatrixInverse;
uniform mat4 projectionMatrixInverse;
uniform vec3 color;
uniform vec3 attenuationColor;
uniform float ior;
uniform float iorSpread;
uniform float aberrationStrength;
uniform int bounces;
uniform float beerAbsorption;
uniform float microRoughness;
uniform float fresnelBoost;
uniform float fireStrength;
uniform float envIntensity;
uniform float opacity;
uniform int shaderMode;
uniform int pathSamples;

varying vec3 vWorldPosition;
varying vec3 vWorldNormal;
varying mat4 vModelMatrix;
varying mat4 vModelMatrixInverse;

float saturateFloat(float value) {
  return clamp(value, 0.0, 1.0);
}

float fresnelSchlick(float cosTheta, float etaI, float etaT) {
  float r0 = (etaI - etaT) / (etaI + etaT);
  r0 *= r0;
  return r0 + (1.0 - r0) * pow(1.0 - saturateFloat(cosTheta), 5.0);
}

vec3 sampleStudioEnvironment(vec3 direction) {
  vec3 d = normalize(direction);
  vec3 base = textureCubeUV(envMap, d, 0.0).rgb * envIntensity;

  float verticalSoftbox = pow(saturateFloat(d.y * 0.5 + 0.5), 3.0);
  float sideStrip = pow(saturateFloat(1.0 - abs(d.x)), 16.0) * pow(saturateFloat(d.y * 0.65 + 0.45), 2.0);
  float rimStrip = pow(saturateFloat(1.0 - abs(d.z * 0.9 + 0.15)), 22.0) * 0.9;
  float horizon = pow(1.0 - abs(d.y), 8.0) * 0.35;

  vec3 cards = vec3(1.0) * verticalSoftbox * 0.55;
  cards += vec3(1.0, 0.94, 0.82) * sideStrip * 1.7;
  cards += vec3(0.82, 0.92, 1.0) * rimStrip * 0.65;
  cards += vec3(1.0, 0.82, 0.65) * horizon * 0.6;

  return max(base + cards, vec3(0.0));
}

vec3 jitterDirection(vec3 direction, float amount, float seed) {
  if (amount <= 0.0001) return normalize(direction);
  vec3 basis = normalize(abs(direction.y) < 0.95 ? cross(direction, vec3(0.0, 1.0, 0.0)) : cross(direction, vec3(1.0, 0.0, 0.0)));
  vec3 tangent = normalize(cross(direction, basis));
  float a = fract(sin(seed * 91.345 + dot(gl_FragCoord.xy, vec2(12.9898, 78.233))) * 43758.5453) - 0.5;
  float b = fract(sin(seed * 53.135 + dot(gl_FragCoord.yx, vec2(39.346, 11.135))) * 24634.6345) - 0.5;
  return normalize(direction + (basis * a + tangent * b) * amount);
}

bool intersectDiamond(vec3 rayOrigin, vec3 rayDirection, out uvec4 faceIndices, out vec3 faceNormal, out vec3 barycoord, out float side, out float dist) {
  return bvhIntersectFirstHit(bvh, rayOrigin, rayDirection, faceIndices, faceNormal, barycoord, side, dist);
}

vec3 traceExitDirection(vec3 originLocal, vec3 directionLocal, float componentIor, int channelOffset, out float opticalDepth, out float tirRatio) {
  vec3 rayOrigin = originLocal;
  vec3 rayDirection = normalize(directionLocal);
  opticalDepth = 0.0;
  tirRatio = 0.0;

  for (int bounceIndex = 0; bounceIndex < 32; bounceIndex++) {
    if (bounceIndex >= bounces) break;

    uvec4 faceIndices;
    vec3 faceNormal;
    vec3 barycoord;
    float side;
    float dist;

    if (!intersectDiamond(rayOrigin, rayDirection, faceIndices, faceNormal, barycoord, side, dist)) {
      return rayDirection;
    }

    opticalDepth += max(dist, 0.0);
    vec3 hitPoint = rayOrigin + rayDirection * max(dist - 0.00035, 0.0);
    vec3 n = normalize(faceNormal * side);
    float cosTheta = abs(dot(-rayDirection, n));
    float fresnel = fresnelSchlick(cosTheta, componentIor, 1.0) * fresnelBoost;

    vec3 refracted = refract(rayDirection, n, componentIor / 1.0);
    bool totalInternalReflection = length(refracted) < 0.0001;
    float deterministic = fract(sin(float(bounceIndex + channelOffset) * 34.17 + dot(hitPoint, vec3(13.1, 7.7, 19.3))) * 719.13);

    if (totalInternalReflection || deterministic < saturateFloat(fresnel)) {
      rayDirection = reflect(rayDirection, n);
      tirRatio += 1.0;
      rayOrigin = hitPoint + rayDirection * 0.001;
    } else {
      rayDirection = normalize(refracted);
      rayOrigin = hitPoint + rayDirection * 0.002;
      return rayDirection;
    }
  }

  return rayDirection;
}

vec3 traceDiamondRgb(vec3 cameraDirectionWorld) {
  vec3 normalWorld = normalize(vWorldNormal);
  vec3 entryDirectionWorld = refract(cameraDirectionWorld, normalWorld, 1.0 / ior);

  if (length(entryDirectionWorld) < 0.0001) {
    entryDirectionWorld = reflect(cameraDirectionWorld, normalWorld);
  }

  entryDirectionWorld = jitterDirection(entryDirectionWorld, microRoughness * 0.08, 1.0);

  vec3 originLocal = (vModelMatrixInverse * vec4(vWorldPosition + entryDirectionWorld * 0.004, 1.0)).xyz;
  vec3 baseDirLocal = normalize((vModelMatrixInverse * vec4(entryDirectionWorld, 0.0)).xyz);

  float redIor = ior - iorSpread * 0.42 * aberrationStrength;
  float greenIor = ior;
  float blueIor = ior + iorSpread * 0.65 * aberrationStrength;

  float depthR;
  float depthG;
  float depthB;
  float tirR;
  float tirG;
  float tirB;

  vec3 exitR = traceExitDirection(originLocal, baseDirLocal, redIor, 0, depthR, tirR);
  vec3 exitG = traceExitDirection(originLocal, baseDirLocal, greenIor, 7, depthG, tirG);
  vec3 exitB = traceExitDirection(originLocal, baseDirLocal, blueIor, 13, depthB, tirB);

  vec3 worldR = normalize((vModelMatrix * vec4(exitR, 0.0)).xyz);
  vec3 worldG = normalize((vModelMatrix * vec4(exitG, 0.0)).xyz);
  vec3 worldB = normalize((vModelMatrix * vec4(exitB, 0.0)).xyz);

  float componentR = sampleStudioEnvironment(worldR).r;
  float componentG = sampleStudioEnvironment(worldG).g;
  float componentB = sampleStudioEnvironment(worldB).b;

  vec3 absorption = exp(-beerAbsorption * vec3(depthR, depthG, depthB) * (vec3(1.0) - attenuationColor));
  vec3 internalColor = vec3(componentR, componentG, componentB) * absorption;

  float tirBoost = 1.0 + clamp((tirR + tirG + tirB) / max(float(bounces), 1.0), 0.0, 1.0) * fireStrength;
  return internalColor * color * tirBoost;
}

vec3 traceStudioBounces(vec3 cameraDirectionWorld) {
  vec3 n = normalize(vWorldNormal);
  vec3 rayDirection = refract(cameraDirectionWorld, n, 1.0 / ior);
  if (length(rayDirection) < 0.0001) rayDirection = reflect(cameraDirectionWorld, n);
  rayDirection = jitterDirection(rayDirection, microRoughness * 0.1, 2.0);

  vec3 accum = vec3(0.0);
  vec3 throughput = color;
  float travelled = 0.0;
  vec3 originLocal = (vModelMatrixInverse * vec4(vWorldPosition + rayDirection * 0.004, 1.0)).xyz;
  vec3 directionLocal = normalize((vModelMatrixInverse * vec4(rayDirection, 0.0)).xyz);

  for (int i = 0; i < 32; i++) {
    if (i >= bounces) break;

    uvec4 faceIndices;
    vec3 faceNormal;
    vec3 barycoord;
    float side;
    float dist;

    if (!intersectDiamond(originLocal, directionLocal, faceIndices, faceNormal, barycoord, side, dist)) {
      vec3 worldDirection = normalize((vModelMatrix * vec4(directionLocal, 0.0)).xyz);
      accum += throughput * sampleStudioEnvironment(worldDirection) * (1.0 + float(i) * 0.055);
      break;
    }

    travelled += max(dist, 0.0);
    vec3 hitPoint = originLocal + directionLocal * max(dist - 0.00035, 0.0);
    vec3 faceN = normalize(faceNormal * side);
    float fresnel = fresnelSchlick(abs(dot(-directionLocal, faceN)), ior, 1.0) * fresnelBoost;
    vec3 reflected = reflect(directionLocal, faceN);
    vec3 refracted = refract(directionLocal, faceN, ior / 1.0);
    bool tir = length(refracted) < 0.0001;

    vec3 worldReflection = normalize((vModelMatrix * vec4(reflected, 0.0)).xyz);
    accum += throughput * sampleStudioEnvironment(worldReflection) * (tir ? 0.24 : 0.08) * (1.0 + fresnel);

    if (tir || fresnel > 0.58) {
      directionLocal = reflected;
      throughput *= 0.92;
    } else {
      directionLocal = normalize(mix(refracted, reflected, fresnel * 0.35));
      throughput *= 0.86;
    }

    throughput *= exp(-beerAbsorption * travelled * (vec3(1.0) - attenuationColor));
    originLocal = hitPoint + directionLocal * 0.001;
  }

  return accum * color;
}

vec3 pathTracePreview(vec3 cameraDirectionWorld) {
  vec3 total = vec3(0.0);
  int samples = clamp(pathSamples, 1, 16);

  for (int i = 0; i < 16; i++) {
    if (i >= samples) break;
    vec3 shifted = cameraDirectionWorld;
    shifted = jitterDirection(shifted, microRoughness * 0.05 + float(i) * 0.0008, float(i) + 3.0);
    total += traceDiamondRgb(shifted);
  }

  total /= float(samples);
  return total;
}

void main() {
  vec3 cameraDirectionWorld = normalize(vWorldPosition - cameraPosition);
  vec3 normalWorld = normalize(vWorldNormal);

  float viewFresnel = fresnelSchlick(abs(dot(-cameraDirectionWorld, normalWorld)), 1.0, ior) * fresnelBoost;
  vec3 reflectionDirection = reflect(cameraDirectionWorld, normalWorld);
  vec3 surfaceReflection = sampleStudioEnvironment(reflectionDirection) * viewFresnel;

  vec3 refractedColor;
  if (shaderMode == 2) {
    refractedColor = pathTracePreview(cameraDirectionWorld);
  } else if (shaderMode == 1) {
    refractedColor = traceStudioBounces(cameraDirectionWorld);
  } else {
    refractedColor = traceDiamondRgb(cameraDirectionWorld);
  }

  float rim = pow(1.0 - saturateFloat(abs(dot(-cameraDirectionWorld, normalWorld))), 2.4);
  vec3 finalColor = refractedColor * (1.0 - viewFresnel * 0.25) + surfaceReflection * (1.0 + rim * 0.9);
  finalColor += vec3(1.0, 0.94, 0.82) * rim * 0.08;
  finalColor = max(finalColor, vec3(0.0));

  pc_fragColor = vec4(finalColor, opacity);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}
`;

/**
 * Creates the WebGL shader material. The material traces rays inside the mesh BVH,
 * evaluates Fresnel reflection/refraction, handles total internal reflection, and
 * offsets IOR per RGB channel to simulate spectral dispersion.
 */
export function createDiamondBVHMaterial(options = {}) {
  const merged = { ...DEFAULT_DIAMOND_BVH_OPTIONS, ...options };
  const bvhUniform = merged.bvhUniform || new MeshBVHUniformStruct();
  const environment = merged.environment || null;

  const material = new THREE.ShaderMaterial({
    name: merged.name || "Diamond BVH Ray-Traced Material",
    vertexShader,
    fragmentShader,
    glslVersion: THREE.GLSL3,
    uniforms: buildUniforms(merged, bvhUniform),
    defines: getCubeUVDefines(environment),
    transparent: merged.opacity < 1.0,
    depthWrite: merged.opacity >= 0.92,
    side: THREE.DoubleSide,
    toneMapped: true,
  });

  material.userData.isDiamondBVHMaterial = true;
  material.userData.environmentUuid = environment?.uuid || null;
  material.userData.options = { ...merged, color: undefined, attenuationColor: undefined, environment: undefined, bvhUniform: undefined };
  return material;
}

/**
 * Builds a BVH for a closed gemstone mesh and applies the ray-traced material.
 * Keep the mesh geometry fixed; material changes should call updateDiamondBVHMaterial,
 * not rebuild the geometry.
 */
export function prepareDiamondMesh(mesh, options = {}) {
  if (!mesh?.isMesh || !mesh.geometry) {
    throw new Error("prepareDiamondMesh expects a THREE.Mesh with BufferGeometry.");
  }

  const merged = { ...DEFAULT_DIAMOND_BVH_OPTIONS, ...options };
  const geometry = mesh.geometry;

  if (!geometry.attributes.normal) {
    geometry.computeVertexNormals();
  }

  if (geometry.boundsTree && typeof geometry.boundsTree.dispose === "function") {
    geometry.boundsTree.dispose();
  }

  geometry.computeBoundingBox();
  geometry.computeBoundingSphere();
  geometry.boundsTree = new MeshBVH(geometry, { maxLeafTris: merged.maxLeafTris });

  const bvhUniform = new MeshBVHUniformStruct();
  bvhUniform.updateFrom(geometry.boundsTree);

  const material = createDiamondBVHMaterial({ ...merged, bvhUniform });
  mesh.material = material;
  mesh.userData.diamondBVHMaterial = material;
  mesh.userData.diamondBVHBoundsTree = geometry.boundsTree;
  return material;
}

/**
 * Updates uniforms every frame. Call this before renderer.render/composer.render.
 */
export function updateDiamondBVHMaterial(material, options = {}) {
  if (!material?.userData?.isDiamondBVHMaterial) return;

  const uniforms = material.uniforms;
  const { camera, renderer, environment } = options;

  if (camera) {
    uniforms.viewMatrixInverse.value.copy(camera.matrixWorld);
    uniforms.projectionMatrixInverse.value.copy(camera.projectionMatrixInverse);
  }

  if (renderer?.domElement) {
    uniforms.resolution.value.set(renderer.domElement.width || 1, renderer.domElement.height || 1);
  }

  if (environment && uniforms.envMap.value !== environment) {
    uniforms.envMap.value = environment;
    const defines = getCubeUVDefines(environment);
    let needsUpdate = false;
    for (const key of Object.keys(defines)) {
      if (material.defines[key] !== defines[key]) {
        material.defines[key] = defines[key];
        needsUpdate = true;
      }
    }
    material.userData.environmentUuid = environment.uuid;
    material.needsUpdate = material.needsUpdate || needsUpdate;
  }

  if (options.color !== undefined) uniforms.color.value.copy(toColor(options.color, DEFAULT_DIAMOND_BVH_OPTIONS.color));
  if (options.attenuationColor !== undefined) uniforms.attenuationColor.value.copy(toColor(options.attenuationColor, DEFAULT_DIAMOND_BVH_OPTIONS.attenuationColor));
  if (options.ior !== undefined) uniforms.ior.value = clampNumber(options.ior, uniforms.ior.value, 1.0, 3.0);
  if (options.iorSpread !== undefined) uniforms.iorSpread.value = clampNumber(options.iorSpread, uniforms.iorSpread.value, 0.0, 0.18);
  if (options.aberrationStrength !== undefined) uniforms.aberrationStrength.value = clampNumber(options.aberrationStrength, uniforms.aberrationStrength.value, 0.0, 3.0);
  if (options.bounces !== undefined) uniforms.bounces.value = Math.round(clampNumber(options.bounces, uniforms.bounces.value, 1, 32));
  if (options.beerAbsorption !== undefined) uniforms.beerAbsorption.value = clampNumber(options.beerAbsorption, uniforms.beerAbsorption.value, 0.0, 0.08);
  if (options.microRoughness !== undefined) uniforms.microRoughness.value = clampNumber(options.microRoughness, uniforms.microRoughness.value, 0.0, 0.12);
  if (options.fresnelBoost !== undefined) uniforms.fresnelBoost.value = clampNumber(options.fresnelBoost, uniforms.fresnelBoost.value, 0.0, 3.0);
  if (options.fireStrength !== undefined) uniforms.fireStrength.value = clampNumber(options.fireStrength, uniforms.fireStrength.value, 0.0, 4.0);
  if (options.hdriIntensity !== undefined) uniforms.envIntensity.value = clampNumber(options.hdriIntensity, uniforms.envIntensity.value, 0.0, 8.0);
  if (options.opacity !== undefined) uniforms.opacity.value = clampNumber(options.opacity, uniforms.opacity.value, 0.0, 1.0);
  if (options.shaderMode !== undefined) uniforms.shaderMode.value = shaderModeToNumber(options.shaderMode);
  if (options.pathSamples !== undefined) uniforms.pathSamples.value = Math.round(clampNumber(options.pathSamples, uniforms.pathSamples.value, 1, 16));
}

export function disposeDiamondBVHMaterial(mesh) {
  if (!mesh?.isMesh) return;
  if (mesh.geometry?.boundsTree?.dispose) mesh.geometry.boundsTree.dispose();
  if (mesh.geometry) mesh.geometry.boundsTree = null;
  if (mesh.material?.userData?.isDiamondBVHMaterial) mesh.material.dispose();
  mesh.userData.diamondBVHMaterial = null;
  mesh.userData.diamondBVHBoundsTree = null;
}