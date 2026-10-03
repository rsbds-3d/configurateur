const assert = require("node:assert/strict");
(async () => {
  const { getRulerSideOffset } = await import("../assets/js/ruler-reference.js");
  const box = (x0, x1, z0, z1) => ({ min: { x: x0, z: z0 }, max: { x: x1, z: z1 } });
  const offset = getRulerSideOffset(box(-50, 50, -15, 15), box(-100, 100, -5, 5), 0, 12);
  assert.equal(offset.x, 50, "Les debuts des longueurs doivent etre alignes.");
  assert.equal(offset.z, 32, "La regle doit etre sur le cote avec un jeu de 12.");
  const vertical = getRulerSideOffset(box(-15, 15, -50, 50), box(-5, 5, -100, 100), Math.PI / 2, 12);
  assert(Math.abs(vertical.x + 32) < 1e-9);
  assert(Math.abs(vertical.z - 50) < 1e-9);
  assert.equal(vertical.y, 0, "La hauteur sur le sol ne doit pas changer.");
  console.log("Regle laterale parallele et extremites alignees OK");
})().catch(error => { console.error(error); process.exitCode = 1; });
