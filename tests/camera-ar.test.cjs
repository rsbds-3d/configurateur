const fs = require("fs");
const path = require("path");

const root = path.resolve(__dirname, "..");
const app = fs.readFileSync(path.join(root, "app.js"), "utf8");
const html = fs.readFileSync(path.join(root, "index.html"), "utf8");
const css = fs.readFileSync(path.join(root, "style.css"), "utf8");

function assert(condition, message) {
  if (!condition) {
    console.error(message);
    process.exit(1);
  }
}

assert(html.includes('id="ar-camera-feed"'), "Le viewer doit contenir le flux vidéo AR.");
assert(html.includes('id="toggle-ar"'), "Le viewer doit proposer un bouton AR.");
assert(html.includes("playsinline"), "La caméra AR doit fonctionner sans plein écran forcé sur mobile.");
assert(app.includes("navigator.mediaDevices.getUserMedia"), "Le mode AR doit demander l'accès à la caméra.");
assert(app.includes('facingMode: { ideal: "environment" }'), "Le téléphone doit préférer sa caméra arrière.");
assert(app.includes("new THREE.VideoTexture(video)"), "La vidéo AR doit être intégrée au rendu Three.js.");
assert(app.includes("scene.background = arVideoTexture"), "Le flux caméra doit devenir le fond de la scène sans modifier le pipeline PBR.");
assert(app.includes("arVideoTexture.colorSpace = THREE.SRGBColorSpace"), "La vidéo AR doit conserver une colorimétrie correcte.");
assert(app.includes("updateArVideoTextureTransform()"), "Le flux caméra doit conserver son cadrage sur ordinateur et téléphone.");
assert(!app.includes("scene.fog = null"), "Le mode AR ne doit pas modifier le brouillard qui participe au rendu habituel.");
assert(app.includes("floor.visible = false"), "Le sol 3D doit être masqué devant la vidéo.");
assert(app.includes("track.stop()"), "La caméra doit être libérée à la fermeture du mode AR.");
assert(css.includes(".ar-camera-feed") && css.includes("object-fit: cover"), "Le flux filmé doit couvrir l'écran.");
assert(css.includes("body.is-ar-mode #app::before"), "Les décors de page doivent disparaître en AR.");

console.log("Camera AR regression test OK");
