export function attachDecalGesture(element, {
  hitTest, select, begin, move, finish, lock, unlock,
  immediate = () => false, holdMs = 450, tolerance = 8,
  schedule = (callback, delay) => setTimeout(callback, delay),
  unschedule = (timer) => clearTimeout(timer),
  frame = (callback) => requestAnimationFrame(callback),
  cancelFrame = (id) => cancelAnimationFrame(id),
}) {
  let state = null;
  const consume = (event) => {
    event.preventDefault();
    event.stopImmediatePropagation();
  };
  const flush = () => {
    if (!state) return;
    state.frame = null;
    if (state.active && state.lastMove) {
      const event = state.lastMove;
      state.lastMove = null;
      move(event);
    }
  };
  const end = (persist = false) => {
    if (!state) return;
    unschedule(state.timer);
    if (state.frame != null) cancelFrame(state.frame);
    if (persist) flush();
    const previous = state;
    state = null;
    try {
      if (previous.active) finish(persist);
    } finally {
      unlock(previous.saved);
      if (element.hasPointerCapture?.(previous.id)) element.releasePointerCapture(previous.id);
    }
  };
  const activate = () => {
    if (!state || state.cancelled) return;
    state.active = begin(state.event, state.hit) !== false;
  };
  const down = (event) => {
    if (state) { consume(event); return; }
    if (event.button !== 0 || event.isPrimary === false) return;
    const hit = hitTest(event);
    if (!hit) return;
    consume(event);
    select(hit);
    state = { id: event.pointerId, event, hit, saved: lock(), active: false, frame: null };
    element.setPointerCapture?.(event.pointerId);
    if (immediate()) activate();
    else state.timer = schedule(activate, holdMs);
  };
  const drag = (event) => {
    if (!state) return;
    consume(event);
    if (event.pointerId !== state.id) return;
    if (!state.active) {
      if (Math.hypot(event.clientX - state.event.clientX, event.clientY - state.event.clientY) > tolerance) {
        unschedule(state.timer);
        state.cancelled = true;
      }
      return;
    }
    state.lastMove = event;
    if (state.frame == null) state.frame = frame(flush);
  };
  const up = (event) => {
    if (!state) return;
    consume(event);
    if (event.pointerId === state.id) end(event.type === "pointerup");
  };
  const context = (event) => {
    if (state || hitTest(event)) consume(event);
  };
  const key = (event) => { if (event.key === "Escape" && state) { consume(event); end(false); } };
  const listeners = { pointerdown: down, pointermove: drag, pointerup: up, pointercancel: up, lostpointercapture: up, contextmenu: context, dblclick: context, keydown: key };
  // Capture phase wins over OrbitControls and the underlying metal selection.
  for (const [type, handler] of Object.entries(listeners)) element.addEventListener(type, handler, true);
  return {
    get busy() { return state !== null; },
    cancel: () => end(false),
    dispose() {
      end(false);
      for (const [type, handler] of Object.entries(listeners)) element.removeEventListener(type, handler, true);
    },
  };
}
