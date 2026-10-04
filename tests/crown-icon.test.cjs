const fs = require("node:fs");
const path = require("node:path");
const assert = require("node:assert/strict");
const root = path.join(__dirname, "..");
const icon = fs.readFileSync(path.join(root, "assets/icons/rosebuds-launcher.ico"));
assert.equal(icon.readUInt16LE(2), 1);
assert.equal(icon.readUInt16LE(4), 7);
for (let i = 0; i < 7; i++) {
  const entry = 6 + i * 16;
  const offset = icon.readUInt32LE(entry + 12);
  assert(icon.subarray(offset, offset + 8).equals(Buffer.from([137,80,78,71,13,10,26,10])));
}
for (const file of ["index.html", "online/login.html"]) {
  assert(fs.readFileSync(path.join(root, file), "utf8").includes('rel="icon" href="./assets/icons/rosebuds-launcher.ico?v=20261004-crown"'));
}
console.log("Couronne ICO multi-tailles et favicons OK");
