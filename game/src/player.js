// Dustline Yard — the player body. Acceleration-based movement, crouch,
// AABB collision, mouse look, health and fall-free gravity. The camera is the
// player's head; the viewmodel lives on it (see weapons.js).
import * as THREE from 'three';
import { collideCircle } from './world.js';
import { pushEvent } from './state.js';

const EYE_STAND = 1.62;
const EYE_CROUCH = 1.05;
const RADIUS = 0.42;
const WALK_SPEED = 5.2;
const CROUCH_SPEED = 2.6;
const ACCEL = 42;
const FRICTION = 10;

export function createPlayer(scene, camera, colliders, state) {
  const body = {
    pos: new THREE.Vector3(-24, 0, 0),
    vel: new THREE.Vector3(),
    yaw: -Math.PI / 2,
    pitch: 0,
    health: 100,
    alive: true,
    crouched: false,
    eyeHeight: EYE_STAND,
    onGround: true,
    speed2d: 0,      // horizontal speed, drives spread + footsteps
    moving: false,
  };

  function reset(spawn) {
    body.pos.set(spawn.x, 0, spawn.z);
    body.vel.set(0, 0, 0);
    body.yaw = spawn.yaw;
    body.pitch = 0;
    body.health = 100;
    body.alive = true;
    body.crouched = false;
    body.eyeHeight = EYE_STAND;
  }

  // One fixed step. Returns true when a footstep should sound.
  function step(dt, input) {
    if (!body.alive) return false;
    // Mouse look.
    body.yaw -= input.yawDelta * 0.0021;
    body.pitch -= input.pitchDelta * 0.0021;
    body.pitch = Math.max(-1.5, Math.min(1.5, body.pitch));

    body.crouched = input.crouch;
    const targetEye = body.crouched ? EYE_CROUCH : EYE_STAND;
    body.eyeHeight += (targetEye - body.eyeHeight) * Math.min(1, dt * 12);

    const maxSpeed = body.crouched ? CROUCH_SPEED : WALK_SPEED;
    const sin = Math.sin(body.yaw), cos = Math.cos(body.yaw);
    // Forward is -z rotated by yaw; right is +x rotated by yaw.
    const fwdX = -sin, fwdZ = -cos;
    const rightX = cos, rightZ = -sin;
    let wishX = fwdX * input.forward + rightX * input.strafe;
    let wishZ = fwdZ * input.forward + rightZ * input.strafe;
    const len = Math.hypot(wishX, wishZ);
    if (len > 0) { wishX /= len; wishZ /= len; }
    body.moving = len > 0;

    // Accelerate toward the wish direction, friction when idle.
    body.vel.x += wishX * ACCEL * dt;
    body.vel.z += wishZ * ACCEL * dt;
    const damp = body.moving ? Math.max(0, 1 - FRICTION * 0.35 * dt) : Math.max(0, 1 - FRICTION * dt);
    body.vel.x *= damp; body.vel.z *= damp;
    const sp = Math.hypot(body.vel.x, body.vel.z);
    if (sp > maxSpeed) { body.vel.x *= maxSpeed / sp; body.vel.z *= maxSpeed / sp; }
    body.speed2d = Math.hypot(body.vel.x, body.vel.z);

    body.pos.x += body.vel.x * dt;
    body.pos.z += body.vel.z * dt;
    collideCircle(colliders, body.pos, RADIUS, body.eyeHeight);

    // Head bob + footstep timing from distance travelled.
    camera.position.set(body.pos.x, body.eyeHeight + bobOffset(dt), body.pos.z);
    camera.rotation.set(body.pitch, body.yaw, 0, 'YXZ');
    stepAccum += body.speed2d * dt;
    if (stepAccum > 2.2 && body.speed2d > 1) { stepAccum = 0; return true; }
    return false;
  }

  let bobPhase = 0;
  let stepAccum = 0;
  function bobOffset(dt) {
    bobPhase += body.speed2d * dt * 1.6;
    return body.speed2d > 0.5 ? Math.sin(bobPhase * 2) * 0.03 : 0;
  }

  function damage(amount, from) {
    if (!body.alive) return;
    body.health -= amount;
    pushEvent(state, 'hurt', { amount, from });
    if (body.health <= 0) {
      body.health = 0;
      body.alive = false;
      pushEvent(state, 'playerDown', { from });
    }
  }

  function heal(amount) { body.health = Math.min(100, body.health + amount); }

  return { body, reset, step, damage, heal };
}
