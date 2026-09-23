const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");
const path = require("node:path");
const { pathToFileURL } = require("node:url");
const root = path.resolve(__dirname, "..");

(async () => {
  const { attachDecalGesture } = await import(pathToFileURL(path.join(root, "assets/js/decal-gesture.js")));
  const { pointInPlacementFrame, placementInWorld } = await import(pathToFileURL(path.join(root, "assets/js/decal-placement.js")));
  const THREE = await import(pathToFileURL(path.join(root, "assets/vendor/three.module.js")));
  const handlers = {};
  let captured = null, clockId = 0, selected = 0, began = 0, moved = 0, locked = false;
  const timers = new Map(), frames = new Map(), finishes = [];
  const element = {
    addEventListener(type, handler, capture) { assert.equal(capture, true); handlers[type] = handler; },
    removeEventListener(type) { delete handlers[type]; },
    setPointerCapture(id) { captured = id; },
    hasPointerCapture(id) { return captured === id; },
    releasePointerCapture() { captured = null; },
  };
  const gesture = attachDecalGesture(element, {
    hitTest: (event) => event.clientX < 100 ? { object: "logo" } : null,
    select: () => selected++, begin: () => { began++; }, move: () => moved++,
    finish: (persist) => finishes.push(persist),
    lock: () => { locked = true; return "prior controls"; },
    unlock: (saved) => { assert.equal(saved, "prior controls"); locked = false; },
    schedule: (fn, delay) => { assert.equal(delay, 450); timers.set(++clockId, fn); return clockId; },
    unschedule: (id) => timers.delete(id),
    frame: (fn) => { frames.set(++clockId, fn); return clockId; },
    cancelFrame: (id) => frames.delete(id),
  });
  const event = (type, x = 20, id = 1, pointerType = "mouse") => {
    const e = { type, button: 0, pointerId: id, pointerType, clientX: x, clientY: 10, prevented: false, stopped: false,
      preventDefault() { this.prevented = true; }, stopImmediatePropagation() { this.stopped = true; } };
    handlers[type](e); return e;
  };
  const hold = () => { for (const [id, fn] of timers) { timers.delete(id); fn(); } };
  assert.equal(event("pointerdown", 200).stopped, false, "Normal orbit remains available outside logo");
  assert.equal(event("pointerdown").stopped, true);
  assert.equal(selected, 1); assert.equal(locked, true); assert.equal(began, 0);
  event("pointerup"); hold();
  assert.equal(began, 0); assert.equal(locked, false); assert.equal(finishes.length, 0, "Short click selects only");
  event("pointerdown", 20, 1, "touch"); event("pointermove", 45, 1, "touch"); hold(); event("pointerup", 45, 1, "touch");
  assert.equal(began, 0, "Touch motion before hold threshold cancels long press");
  event("pointerdown"); hold();
  assert.equal(began, 1);
  event("pointermove", 40); event("pointermove", 50);
  assert.equal(frames.size, 1, "Projection runs at most once per frame");
  event("pointerup", 50);
  assert.equal(moved, 1, "Last motion flushed before saving");
  assert.deepEqual(finishes, [true]); assert.equal(gesture.busy, false); assert.equal(captured, null);
  event("pointerdown"); event("pointermove", 45);
  assert.equal(began, 2, "Mouse drag starts immediately after threshold, without long press");
  assert.equal(locked, true, "Orbit and underlying selection stay blocked during mouse drag");
  event("pointerup", 45);
  assert.equal(moved, 2); assert.equal(finishes.at(-1), true);
  event("pointerdown", 20, 1, "touch"); hold(); event("pointermove", 45, 1, "touch"); event("pointerup", 45, 1, "touch");
  assert.equal(began, 3, "Touch long press still starts surface dragging");
  for (const reason of ["pointercancel", "lostpointercapture"]) {
    event("pointerdown"); hold(); event(reason);
    assert.equal(finishes.at(-1), false); assert.equal(locked, false);
  }
  event("pointerdown"); hold(); gesture.cancel();
  assert.equal(finishes.at(-1), false);
  event("pointerdown"); gesture.cancel(); hold();
  assert.equal(gesture.busy, false); assert.equal(timers.size, 0);
  gesture.dispose(); assert.equal(Object.keys(handlers).length, 0);

  // Coordinates remain attached to the model after translation, rotation and scaling.
  const initial = new THREE.Matrix4().makeTranslation(2, 3, -1);
  const current = new THREE.Matrix4().compose(new THREE.Vector3(-5, 2, 7), new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), 0.9), new THREE.Vector3(2, 2, 2));
  const point = new THREE.Vector3(2.3, 3.4, -1);
  const world = point.clone().applyMatrix4(initial.clone().invert()).applyMatrix4(current);
  assert.ok(pointInPlacementFrame(world, initial, current).distanceTo(point) < 1e-10);
  const projection = placementInWorld({ center: point, axis: new THREE.Vector3(1, 0, 0), heightAxis: new THREE.Vector3(0, 1, 0), normal: new THREE.Vector3(0, 0, 1), size: new THREE.Vector3(1, 2, 3) }, initial, current);
  assert.ok(projection.center.distanceTo(world) < 1e-10);
  assert.ok(projection.size.distanceTo(new THREE.Vector3(2, 4, 6)) < 1e-10);

  const app = fs.readFileSync(path.join(root, "app.js"), "utf8");
  const store = new Map();
  const context = vm.createContext({ THREE, window: { localStorage: { getItem: (k) => store.get(k), setItem: (k, v) => store.set(k, v) } } });
  vm.runInContext(app.slice(app.indexOf('const STEM_DECAL_POSITION_STORAGE_KEY'), app.indexOf('function setStemDecalPlacementCoordinates')), context);
  vm.runInContext('writeStoredStemDecalPosition("model-a", {axialRatio:0,angle:0.7}); writeStoredStemDecalPosition("model-b", {axialRatio:0.8,angle:-1});', context);
  const restored = JSON.parse(store.values().next().value);
  assert.equal(restored["model-a"].axialRatio, 0, "Endpoint zero survives save");
  assert.equal(restored["model-b"].axialRatio, 0.8, "Models have independent positions");
  assert.equal(vm.runInContext('readStoredStemDecalPositions()["model-a"].angle', context), 0.7);
  assert.ok(app.includes("if (!stemDecalGesture?.busy) controls.update()"), "Camera stays still during decal gesture");
  console.log("Decal long-press, cancellation, transforms and persistence OK");
})().catch((error) => { console.error(error); process.exitCode = 1; });
