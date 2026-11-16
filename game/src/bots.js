// Dustline Yard — the Wardens: 4 defender bots. Each bot runs a small state
// machine: PATROL along a lane route, HOLD at a site, ENGAGE when it sees the
// player (line of sight + range + a reaction delay), DEFUSE when the bomb is
// planted, and INVESTIGATE the last gunshot it heard. They shoot in bursts
// with distance-based accuracy, take cover by strafing between shots, and
// their head is a separate mesh so headshots pay more.
import * as THREE from 'three';
import { collideCircle } from './world.js';
import { pushEvent } from './state.js';

const BOT_SPEED = 3.4;
const BOT_HEALTH = 100;
const EYE = 1.55;
const RADIUS = 0.42;
const SEE_RANGE = 42;
const HEAR_RANGE = 26;

const MODES = { PATROL: 'patrol', HOLD: 'hold', ENGAGE: 'engage', DEFUSE: 'defuse', INVESTIGATE: 'investigate' };

export function createBots(scene, world, state, audio) {
  const bodyMat = new THREE.MeshStandardMaterial({ color: 0x3fa08d, roughness: 0.55, metalness: 0.25 });
  const headMat = new THREE.MeshStandardMaterial({ color: 0x2f7a6c, roughness: 0.55, metalness: 0.25 });
  const visorMat = new THREE.MeshStandardMaterial({ color: 0xe8702a, roughness: 0.3, emissive: 0x8a2f05, emissiveIntensity: 0.8 });
  const gunMat = new THREE.MeshStandardMaterial({ color: 0x22201d, roughness: 0.5, metalness: 0.6 });
  const hitMeshes = [];
  const bots = [];
  const tmpDir = new THREE.Vector3();
  const tmpTarget = new THREE.Vector3();
  const tmpEye = new THREE.Vector3();

  function buildMesh(bot) {
    const g = new THREE.Group();
    const body = new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.85, 0.38), bodyMat);
    body.position.y = 1.05; body.castShadow = true;
    body.userData = { bot, part: 'body' };
    const head = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.4, 0.4), headMat);
    head.position.y = 1.72; head.castShadow = true;
    head.userData = { bot, part: 'head' };
    const visor = new THREE.Mesh(new THREE.BoxGeometry(0.36, 0.09, 0.05), visorMat);
    visor.position.set(0, 1.74, 0.21);
    // Legs, arms and shoulder pads so the silhouette reads as a person.
    const legMat = new THREE.MeshStandardMaterial({ color: 0x1f2a28, roughness: 0.8 });
    for (const sx of [-0.15, 0.15]) {
      const leg = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.62, 0.24), legMat);
      leg.position.set(sx, 0.31, 0); leg.castShadow = true; g.add(leg);
      const arm = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.6, 0.2), bodyMat);
      arm.position.set(sx * 2.3, 1.05, 0.05); arm.castShadow = true; g.add(arm);
      const pad = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.1, 0.3),
        new THREE.MeshStandardMaterial({ color: 0xe8702a, roughness: 0.5 }));
      pad.position.set(sx * 2.1, 1.52, 0); g.add(pad);
    }
    const gun = new THREE.Mesh(new THREE.BoxGeometry(0.09, 0.12, 0.7), gunMat);
    gun.position.set(0.3, 1.15, 0.3);
    const tag = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.08, 0.05),
      new THREE.MeshStandardMaterial({ color: 0xf0b429, emissive: 0x8a6a00, emissiveIntensity: 0.5 }));
    tag.position.set(0, 1.35, 0.2);
    g.add(body, head, visor, gun, tag);
    hitMeshes.push(body, head);
    scene.add(g);
    return { group: g, body, head, gun };
  }

  function spawn(i, spawn, route) {
    const bot = {
      id: i, name: ['Rook', 'Vale', 'Ibis', 'Sable'][i],
      pos: new THREE.Vector3(spawn.x, 0, spawn.z),
      yaw: spawn.yaw, health: BOT_HEALTH, alive: true,
      mode: MODES.PATROL, route, wpIndex: i % route.length,
      holdUntil: 0, reaction: 0, burstLeft: 0, burstTimer: 0,
      shootCooldown: 0, strafeDir: i % 2 === 0 ? 1 : -1, strafeTimer: 0,
      lastSeen: null, lastHeard: null, defuseProgress: 0,
      speed: BOT_SPEED, mesh: null,
    };
    bot.mesh = buildMesh(bot);
    bots.push(bot);
    return bot;
  }

  function resetAll() {
    const routes = [
      world.waypoints.north, world.waypoints.south,
      world.waypoints.mid, world.waypoints.siteA,
    ];
    for (let i = 0; i < bots.length; i++) {
      const b = bots[i];
      const s = world.botSpawns[i];
      b.pos.set(s.x, 0, s.z); b.yaw = s.yaw;
      b.health = BOT_HEALTH; b.alive = true;
      b.mode = i < 2 ? MODES.PATROL : MODES.HOLD;
      b.route = routes[i]; b.wpIndex = 0;
      b.defuseProgress = 0; b.lastSeen = null; b.lastHeard = null;
      b.mesh.group.visible = true;
    }
  }

  function init() {
    const routes = [
      world.waypoints.north, world.waypoints.south,
      world.waypoints.mid, world.waypoints.siteA,
    ];
    for (let i = 0; i < 4; i++) spawn(i, world.botSpawns[i], routes[i]);
    resetAll();
  }

  function canSee(bot, playerBody, raycaster, shootables) {
    if (!playerBody.alive) return false;
    tmpDir.set(playerBody.pos.x - bot.pos.x, 1.5 - EYE, playerBody.pos.z - bot.pos.z);
    const dist = tmpDir.length();
    if (dist > SEE_RANGE) return false;
    tmpDir.normalize();
    tmpEye.set(bot.pos.x, EYE, bot.pos.z);
    raycaster.set(tmpEye, tmpDir);
    raycaster.far = dist;
    const hits = raycaster.intersectObjects(shootables, false);
    return hits.length === 0;
  }

  function faceToward(bot, x, z, dt) {
    const target = Math.atan2(-(x - bot.pos.x), -(z - bot.pos.z));
    let d = target - bot.yaw;
    while (d > Math.PI) d -= Math.PI * 2;
    while (d < -Math.PI) d += Math.PI * 2;
    bot.yaw += THREE.MathUtils.clamp(d, -3.2 * dt, 3.2 * dt);
  }

  function moveToward(bot, x, z, dt, speed) {
    const dx = x - bot.pos.x, dz = z - bot.pos.z;
    const d = Math.hypot(dx, dz);
    if (d < 0.15) return true;
    bot.pos.x += (dx / d) * speed * dt;
    bot.pos.z += (dz / d) * speed * dt;
    collideCircle(world.colliders, bot.pos, RADIUS, 1.8);
    faceToward(bot, x, z, dt);
    return d < 0.6;
  }

  // One fixed step for all bots. ctx carries the player, raycaster and a
  // damagePlayer(amount, bot) callback owned by main.js.
  function step(dt, ctx) {
    const { playerBody, raycaster, shootables, damagePlayer } = ctx;
    // Bomb planted: the two nearest living bots run to defuse it. Computed
    // once per step, not once per bot.
    let defusers = null;
    if (state.bombPlanted) {
      const alive = bots.filter((b) => b.alive);
      alive.sort((a, b) =>
        Math.hypot(a.pos.x - state.bombPosition.x, a.pos.z - state.bombPosition.z) -
        Math.hypot(b.pos.x - state.bombPosition.x, b.pos.z - state.bombPosition.z));
      defusers = alive.slice(0, 2);
    }
    for (const bot of bots) {
      if (!bot.alive) continue;
      bot.shootCooldown = Math.max(0, bot.shootCooldown - dt);
      const sees = canSee(bot, playerBody, raycaster, shootables);

      if (sees) {
        bot.lastSeen = { x: playerBody.pos.x, z: playerBody.pos.z, t: state.time };
        if (bot.mode !== MODES.ENGAGE) { bot.mode = MODES.ENGAGE; bot.reaction = 0.45 + Math.random() * 0.3; }
      } else if (bot.mode === MODES.ENGAGE && bot.lastSeen && state.time - bot.lastSeen.t > 3) {
        bot.mode = MODES.INVESTIGATE;
      }

      if (defusers && (defusers[0] === bot || defusers[1] === bot)) bot.mode = MODES.DEFUSE;

      if (bot.mode === MODES.PATROL) {
        const wp = bot.route[bot.wpIndex];
        if (moveToward(bot, wp.x, wp.z, dt, bot.speed)) {
          bot.wpIndex = (bot.wpIndex + 1) % bot.route.length;
          bot.holdUntil = state.time + 1.2;
        }
      } else if (bot.mode === MODES.HOLD) {
        const wp = bot.route[bot.wpIndex % bot.route.length];
        moveToward(bot, wp.x, wp.z, dt, bot.speed * 0.8);
        // Holders scan: slow yaw sweep while waiting.
        bot.yaw += Math.sin(state.time * 0.7 + bot.id) * 0.35 * dt;
      } else if (bot.mode === MODES.INVESTIGATE) {
        const target = bot.lastSeen || bot.lastHeard;
        if (target && moveToward(bot, target.x, target.z, dt, bot.speed * 1.1)) {
          bot.mode = MODES.PATROL;
        }
      } else if (bot.mode === MODES.DEFUSE) {
        const bp = state.bombPosition;
        if (moveToward(bot, bp.x, bp.z, dt, bot.speed * 1.15)) {
          bot.defuseProgress += dt;
          pushEvent(state, 'defusing', { bot: bot.name, progress: bot.defuseProgress });
          if (bot.defuseProgress >= 5) {
            pushEvent(state, 'defused', { bot: bot.name });
            bot.defuseProgress = 0;
          }
        }
      } else if (bot.mode === MODES.ENGAGE && bot.lastSeen) {
        faceToward(bot, bot.lastSeen.x, bot.lastSeen.z, dt);
        // Strafe between bursts so the player must track a moving target.
        bot.strafeTimer -= dt;
        if (bot.strafeTimer <= 0) { bot.strafeDir *= -1; bot.strafeTimer = 0.8 + Math.random() * 0.8; }
        const fx = -Math.sin(bot.yaw), fz = -Math.cos(bot.yaw);
        const rx = Math.cos(bot.yaw), rz = -Math.sin(bot.yaw);
        bot.pos.x += rx * bot.strafeDir * 1.4 * dt;
        bot.pos.z += rz * bot.strafeDir * 1.4 * dt;
        collideCircle(world.colliders, bot.pos, RADIUS, 1.8);
        // Fire in bursts after the reaction delay.
        bot.reaction -= dt;
        if (bot.reaction <= 0 && bot.shootCooldown <= 0 && sees) {
          if (bot.burstLeft <= 0) { bot.burstLeft = 3 + Math.floor(Math.random() * 3); bot.burstTimer = 0; }
          if (bot.burstLeft > 0) {
            bot.burstLeft -= 1;
            bot.shootCooldown = 0.13;
            const dist = Math.hypot(playerBody.pos.x - bot.pos.x, playerBody.pos.z - bot.pos.z);
            const hitChance = THREE.MathUtils.clamp(0.62 - dist * 0.012, 0.12, 0.6);
            audio.enemyShot();
            pushEvent(state, 'botShot', { bot: bot.name, dist });
            if (Math.random() < hitChance) {
              const dmg = 9 + Math.random() * 9;
              damagePlayer(dmg, bot.name);
            }
            if (bot.burstLeft === 0) bot.shootCooldown = 0.9 + Math.random() * 0.7;
          }
        }
      }

      // Sync the mesh to the simulated body.
      bot.mesh.group.position.set(bot.pos.x, 0, bot.pos.z);
      bot.mesh.group.rotation.y = bot.yaw;
      const bob = Math.sin(state.time * 8 + bot.id * 2) * 0.02;
      bot.mesh.group.position.y = bob;
    }
  }

  function hearShot(x, z) {
    for (const bot of bots) {
      if (!bot.alive) continue;
      const d = Math.hypot(bot.pos.x - x, bot.pos.z - z);
      if (d < HEAR_RANGE && bot.mode !== MODES.ENGAGE) {
        bot.lastHeard = { x, z, t: state.time };
        if (bot.mode === MODES.PATROL || bot.mode === MODES.HOLD) bot.mode = MODES.INVESTIGATE;
      }
    }
  }

  function damage(bot, amount, part) {
    if (!bot.alive) return false;
    bot.health -= amount;
    pushEvent(state, 'botHit', { bot: bot.name, amount, part, health: Math.max(0, bot.health) });
    if (bot.health <= 0) {
      bot.alive = false;
      bot.health = 0;
      bot.mesh.group.visible = false;
      pushEvent(state, 'botDown', { bot: bot.name });
      return true;
    }
    // Being shot snaps the bot toward the shooter.
    if (bot.mode !== MODES.ENGAGE) bot.mode = MODES.INVESTIGATE;
    return false;
  }

  function aliveCount() { return bots.filter((b) => b.alive).length; }

  return { bots, hitMeshes, init, resetAll, step, hearShot, damage, aliveCount };
}
