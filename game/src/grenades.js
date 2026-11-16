// Dustline Yard — the Spark-9 frag grenade. Thrown on an arc with gravity,
// bounces once off the ground, then detonates after a fuse: area damage that
// falls off with distance, a flash, and a shockwave ring. Bots and the player
// both take the blast.
import * as THREE from 'three';
import { GRENADE_DAMAGE, GRENADE_RADIUS } from './weapons.js';
import { pushEvent } from './state.js';

const FUSE = 1.6;
const GRAVITY = 12;

export function createGrenades(scene, state, audio) {
  const active = [];
  const geo = new THREE.SphereGeometry(0.16, 12, 10);
  const mat = new THREE.MeshStandardMaterial({ color: 0x3d5a3a, roughness: 0.5, metalness: 0.5 });
  const flashGeo = new THREE.SphereGeometry(1, 16, 12);
  const flashMat = new THREE.MeshBasicMaterial({ color: 0xffc25c, transparent: true, opacity: 0.9 });

  function throwGrenade(from, dir) {
    const mesh = new THREE.Mesh(geo, mat);
    mesh.position.copy(from);
    mesh.castShadow = true;
    scene.add(mesh);
    active.push({
      mesh,
      vel: dir.clone().multiplyScalar(11).add(new THREE.Vector3(0, 4.5, 0)),
      fuse: FUSE,
      bounced: false,
    });
    pushEvent(state, 'grenadeThrown', {});
  }

  function explode(g, ctx) {
    const p = g.mesh.position;
    const flash = new THREE.Mesh(flashGeo, flashMat.clone());
    flash.position.copy(p);
    flash.scale.setScalar(0.5);
    scene.add(flash);
    ctx.flashes.push({ mesh: flash, life: 0.35, max: 0.35 });
    audio.explosion();
    pushEvent(state, 'explosion', { x: p.x, z: p.z });
    // Player damage.
    const pd = Math.hypot(ctx.playerBody.pos.x - p.x, ctx.playerBody.pos.z - p.z);
    if (pd < GRENADE_RADIUS && ctx.playerBody.alive) {
      ctx.damagePlayer(GRENADE_DAMAGE * (1 - pd / GRENADE_RADIUS) + 15, 'grenade');
    }
    // Bot damage.
    for (const bot of ctx.bots.bots) {
      if (!bot.alive) continue;
      const bd = Math.hypot(bot.pos.x - p.x, bot.pos.z - p.z);
      if (bd < GRENADE_RADIUS) {
        const killed = ctx.bots.damage(bot, GRENADE_DAMAGE * (1 - bd / GRENADE_RADIUS) + 15, 'blast');
        if (killed) ctx.onBotKilled(bot);
      }
    }
    scene.remove(g.mesh);
  }

  function step(dt, ctx) {
    for (let i = active.length - 1; i >= 0; i--) {
      const g = active[i];
      g.vel.y -= GRAVITY * dt;
      g.mesh.position.addScaledVector(g.vel, dt);
      if (g.mesh.position.y <= 0.16) {
        g.mesh.position.y = 0.16;
        if (!g.bounced) { g.vel.y *= -0.45; g.vel.x *= 0.7; g.vel.z *= 0.7; g.bounced = true; }
        else { g.vel.set(0, 0, 0); }
      }
      g.fuse -= dt;
      if (g.fuse <= 0) { explode(g, ctx); active.splice(i, 1); }
    }
  }

  function clear() {
    for (const g of active) scene.remove(g.mesh);
    active.length = 0;
  }

  return { throwGrenade, step, clear, active };
}
