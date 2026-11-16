// Dustline Yard — keyboard + mouse input. Owns pointer lock, key state and
// the per-frame input snapshot in state.input. No game logic lives here.
export function createInput(canvas, onLockChange) {
  const keys = new Set();
  const state = {
    locked: false,
    mouseDX: 0,
    mouseDY: 0,
    pressed: new Set(), // keys pressed since last consume (edge-triggered)
  };

  function onKeyDown(e) {
    if (e.repeat) return;
    keys.add(e.code);
    state.pressed.add(e.code);
    if (e.code === 'Space') e.preventDefault();
  }
  function onKeyUp(e) { keys.delete(e.code); }
  function onMouseMove(e) {
    if (!state.locked) return;
    state.mouseDX += e.movementX || 0;
    state.mouseDY += e.movementY || 0;
  }
  function onMouseDown(e) {
    if (!state.locked) { canvas.requestPointerLock(); return; }
    if (e.button === 0) state.firing = true;
  }
  function onMouseUp(e) { if (e.button === 0) state.firing = false; }
  function onLock() {
    state.locked = document.pointerLockElement === canvas;
    if (onLockChange) onLockChange(state.locked);
  }

  document.addEventListener('keydown', onKeyDown);
  document.addEventListener('keyup', onKeyUp);
  document.addEventListener('mousemove', onMouseMove);
  document.addEventListener('mousedown', onMouseDown);
  document.addEventListener('mouseup', onMouseUp);
  document.addEventListener('pointerlockchange', onLock);
  canvas.addEventListener('click', () => { if (!state.locked) canvas.requestPointerLock(); });

  // Fill state.input for this fixed step, then clear the edge-triggered set.
  function poll(gameState) {
    const inp = gameState.input;
    inp.forward = (keys.has('KeyW') ? 1 : 0) - (keys.has('KeyS') ? 1 : 0);
    inp.strafe = (keys.has('KeyD') ? 1 : 0) - (keys.has('KeyA') ? 1 : 0);
    inp.crouch = keys.has('ControlLeft') || keys.has('ControlRight') || keys.has('KeyC');
    inp.jump = state.pressed.has('Space');
    inp.fire = !!state.firing;
    inp.reload = state.pressed.has('KeyR');
    inp.buy = state.pressed.has('KeyB');
    inp.grenade = state.pressed.has('KeyG');
    inp.plant = keys.has('KeyE');
    inp.defuse = keys.has('KeyE');
    inp.weaponSlot = 0;
    if (state.pressed.has('Digit1')) inp.weaponSlot = 1;
    if (state.pressed.has('Digit2')) inp.weaponSlot = 2;
    if (state.pressed.has('Digit3')) inp.weaponSlot = 3;
    if (state.pressed.has('Digit4')) inp.weaponSlot = 4;
    inp.yawDelta = state.mouseDX;
    inp.pitchDelta = state.mouseDY;
    state.mouseDX = 0;
    state.mouseDY = 0;
    state.pressed.clear();
  }

  function requestLock() { canvas.requestPointerLock(); }
  return { poll, requestLock, keys, state };
}
