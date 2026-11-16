// Dustline Yard — weapons. Three guns + one frag grenade, all data-driven:
// fire rate, damage, headshot multiplier, spread, recoil and movement penalty
// live in WEAPONS, so balance is one table, not scattered constants.
// Hits are raycast against body meshes; head meshes take the head multiplier.
import * as THREE from 'three';
import { pushEvent } from './state.js';

export const WEAPONS = {
  rifle: {
    name: 'VK-7 Kestrel', kind: 'rifle', price: 2700, auto: true,
    rate: 0.105, damage: 34, headMult: 2.0, mag: 30, reserve: 90,
    spread: 0.011, moveSpread: 0.035, recoil: 0.011, reloadTime: 2.2,
    range: 90, tracer: 0xe8702a,
  },
  smg: {
    name: 'Hornet-9', kind: 'smg', price: 1500, auto: true,
    rate: 0.075, damage: 22, headMult: 1.8, mag: 32, reserve: 96,
    spread: 0.016, moveSpread: 0.028, recoil: 0.007, reloadTime: 1.7,
    range: 60, tracer: 0xf0b429,
  },
  pistol: {
    name: 'P9 Sidearm', kind: 'pistol', price: 0, auto: false,
    rate: 0.22, damage: 26, headMult: 2.2, mag: 12, reserve: 36,
    spread: 0.009, moveSpread: 0.03, recoil: 0.009, reloadTime: 1.4,
    range: 50, tracer: 0xf2ead8,
  },
};
export const GRENADE_PRICE = 300;
export const GRENADE_DAMAGE = 95;
export const GRENADE_RADIUS = 7;

export function createWeapons(camera, state, audio) {
  const group = new THREE.Group(); // viewmodel, attached to the camera
  camera.add(group);
  const mats = {
    rifle: new THREE.MeshStandardMaterial({ color: 0x3a3f46, roughness: 0.45, metalness: 0.7 }),
    smg: new THREE.MeshStandardMaterial({ color: 0x2f3a33, roughness: 0.5, metalness: 0.6 }),
    pistol: new THREE.MeshStandardMaterial({ color: 0x46403a, roughness: 0.5, metalness: 0.6 }),
    grip: new THREE.MeshStandardMaterial({ color: 0x1c1a17, roughness: 0.9 }),
    accent: new THREE.MeshStandardMaterial({ color: 0xe8702a, roughness: 0.4, metalness: 0.4 }),
  };

  // One viewmodel per gun, built from boxes — only the active one is visible.
  function buildGun(kind) {
    const g = new THREE.Group();
    const add = (w, h, d, x, y, z, mat) => {
      const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
      m.position.set(x, y, z); g.add(m); return m;
    };
    if (kind === 'rifle') {
      add(0.09, 0.11, 0.62, 0, 0, -0.3, mats.rifle);
      add(0.05, 0.05, 0.3, 0, 0.09, -0.35, mats.rifle);
      add(0.07, 0.16, 0.1, 0, -0.12, 0.02, mats.grip);
      add(0.03, 0.04, 0.12, 0, 0.02, -0.62, mats.accent);
      add(0.06, 0.1, 0.16, 0, -0.1, -0.18, mats.grip);
    } else if (kind === 'smg') {
      add(0.08, 0.1, 0.42, 0, 0, -0.22, mats.smg);
      add(0.06, 0.14, 0.09, 0, -0.11, 0.02, mats.grip);
      add(0.04, 0.04, 0.16, 0, 0.07, -0.3, mats.smg);
      add(0.03, 0.03, 0.08, 0, 0.02, -0.46, mats.accent);
    } else {
      add(0.07, 0.09, 0.3, 0, 0, -0.16, mats.pistol);
      add(0.06, 0.13, 0.08, 0, -0.1, 0.02, mats.grip);
      add(0.02, 0.03, 0.06, 0, 0.06, -0.28, mats.accent);
    }
    g.position.set(0.28, -0.26, -0.55);
    g.visible = false;
    group.add(g);
    return g;
  }
  const models = { rifle: buildGun('rifle'), smg: buildGun('smg'), pistol: buildGun('pistol') };

  // Muzzle flash: one emissive quad at the barrel + a warm point light on
  // the camera, both preallocated and toggled — nothing is built per shot.
  const flash = new THREE.Mesh(
    new THREE.PlaneGeometry(0.24, 0.24),
    new THREE.MeshBasicMaterial({ color: 0xffc25c, transparent: true, opacity: 0.95, side: THREE.DoubleSide }),
  );
  flash.position.set(0.28, -0.18, -1.22);
  flash.visible = false;
  group.add(flash);
  const flashLight = new THREE.PointLight(0xffb85c, 0, 7, 1.8);
  flashLight.position.set(0.28, -0.1, -0.9);
  camera.add(flashLight);
  let flashT = 0;

  const loadout = {
    owned: { pistol: true, rifle: false, smg: false },
    current: 'pistol',
    grenades: 0,
    ammo: {
      pistol: { mag: 12, reserve: 36 },
      rifle: { mag: 30, reserve: 90 },
      smg: { mag: 32, reserve: 96 },
    },
    reloading: 0,       // seconds left, 0 = not reloading
    cooldown: 0,        // seconds until the next shot may fire
    recoilPitch: 0,     // accumulated recoil, decays over time
    spreadBloom: 0,     // grows while firing, decays when still
    triggerHeld: false,
    fired: false,       // semi-auto edge for the pistol
  };

  function currentDef() { return WEAPONS[loadout.current]; }
  function currentAmmo() { return loadout.ammo[loadout.current]; }

  function switchTo(kind) {
    if (!loadout.owned[kind] || loadout.current === kind) return false;
    loadout.current = kind;
    loadout.reloading = 0;
    loadout.cooldown = Math.max(loadout.cooldown, 0.25);
    for (const k of Object.keys(models)) models[k].visible = k === kind;
    pushEvent(state, 'weaponSwitch', { kind });
    return true;
  }
  models.pistol.visible = true;

  function buy(kind) {
    const def = WEAPONS[kind];
    if (!def || loadout.owned[kind]) return false;
    if (state.money < def.price) return false;
    state.money -= def.price;
    loadout.owned[kind] = true;
    loadout.ammo[kind] = { mag: def.mag, reserve: def.reserve };
    audio.buy();
    pushEvent(state, 'buy', { kind, price: def.price });
    return true;
  }
  function buyGrenade() {
    if (state.money < GRENADE_PRICE || loadout.grenades >= 2) return false;
    state.money -= GRENADE_PRICE;
    loadout.grenades += 1;
    audio.buy();
    pushEvent(state, 'buy', { kind: 'grenade', price: GRENADE_PRICE });
    return true;
  }

  function startReload() {
    const def = currentDef();
    const a = currentAmmo();
    if (loadout.reloading > 0 || a.mag >= def.mag || a.reserve <= 0) return;
    loadout.reloading = def.reloadTime;
    audio.reload();
    pushEvent(state, 'reload', { kind: loadout.current });
  }
  function finishReload() {
    const def = currentDef();
    const a = currentAmmo();
    const need = def.mag - a.mag;
    const take = Math.min(need, a.reserve);
    a.mag += take; a.reserve -= take;
  }

  // Called every fixed step. Returns a shot description when a bullet leaves
  // the barrel, or null. The caller (main.js) raycasts it. allowFire is false
  // outside live play (freeze / round end), so holding the trigger then can
  // never waste ammunition on shots that will not be simulated.
  function step(dt, input, playerBody, allowFire = true) {
    loadout.cooldown = Math.max(0, loadout.cooldown - dt);
    loadout.recoilPitch = Math.max(0, loadout.recoilPitch - dt * 0.09);
    loadout.spreadBloom = Math.max(0, loadout.spreadBloom - dt * 0.05);
    if (loadout.reloading > 0) {
      loadout.reloading -= dt;
      if (loadout.reloading <= 0) { loadout.reloading = 0; finishReload(); }
      return null;
    }
    if (input.reload) startReload();
    if (input.weaponSlot === 1) switchTo('rifle');
    if (input.weaponSlot === 2) switchTo('smg');
    if (input.weaponSlot === 3) switchTo('pistol');
    input.weaponSlot = 0;

    const def = currentDef();
    const a = currentAmmo();
    const wantFire = allowFire && input.fire && (def.auto || !loadout.fired);
    loadout.fired = input.fire;
    if (!wantFire || loadout.cooldown > 0) return null;
    if (a.mag <= 0) {
      audio.dryClick();
      loadout.cooldown = 0.3;
      if (a.reserve > 0) startReload();
      return null;
    }
    a.mag -= 1;
    loadout.cooldown = def.rate;
    flashT = 0.05; // muzzle flash on, decayed in render()
    // Spread punishes moving and spraying: base + move + bloom.
    const moveFactor = Math.min(1, playerBody.speed2d / 5.2);
    const crouchFactor = playerBody.crouched ? 0.55 : 1;
    const spread = (def.spread + def.moveSpread * moveFactor + loadout.spreadBloom) * crouchFactor;
    loadout.spreadBloom = Math.min(0.05, loadout.spreadBloom + 0.006);
    loadout.recoilPitch = Math.min(0.09, loadout.recoilPitch + def.recoil);
    audio.shot(def.kind);
    // Muzzle flash: brief emissive kick on the viewmodel.
    models[loadout.current].position.z = -0.5;
    return { def, spread, from: playerBody, kind: loadout.current };
  }

  // Per-render viewmodel motion: recoil recovery, reload dip, walk sway.
  function render(dt, t, playerBody) {
    if (flashT > 0) {
      flashT -= dt;
      const on = flashT > 0;
      flash.visible = on;
      flashLight.intensity = on ? 10 : 0;
      if (on) { flash.rotation.z = (flash.rotation.z + 1.1) % Math.PI; flash.scale.setScalar(0.9 + ((t * 997) % 1) * 0.25); }
    }
    const m = models[loadout.current];
    m.position.z += (-0.55 - m.position.z) * Math.min(1, dt * 14);
    const sway = Math.sin(t * 9) * 0.006 * Math.min(1, playerBody.speed2d / 5);
    m.position.x = 0.28 + sway;
    m.position.y = -0.26 + (loadout.reloading > 0 ? -0.08 : 0) + Math.abs(Math.sin(t * 9)) * 0.004 * Math.min(1, playerBody.speed2d / 5);
    m.rotation.x = loadout.recoilPitch * 2.2;
  }

  function resetRound() {
    loadout.current = 'pistol';
    // Grenades are bought, not refunded: they carry over between rounds (capped at 2).
    loadout.reloading = 0; loadout.cooldown = 0; loadout.recoilPitch = 0; loadout.spreadBloom = 0;
    for (const k of Object.keys(models)) models[k].visible = k === 'pistol';
  }

  return { loadout, models, currentDef, currentAmmo, switchTo, buy, buyGrenade, startReload, step, render, resetRound };
}
