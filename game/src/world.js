// Dustline Yard — the map. An original dusk container yard: two lanes (North
// and South) plus a Mid corridor, two bomb sites (A north-east, B south-east),
// crates and containers as cover, and sightlines that reward stopping to aim.
// Collision is AABB-based; every solid box registers a collider and a mesh the
// raycaster can hit, so bullets and line-of-sight agree with what you see.
import * as THREE from 'three';
import { PALETTE } from './palette.js';

const WALL_H = 4.2;

export function createWorld(scene) {
  const colliders = [];   // { minX, maxX, minZ, maxZ, top }
  const shootables = [];  // meshes bullets / sight rays can hit
  const mats = {
    ground: new THREE.MeshStandardMaterial({ color: 0x4d4436, roughness: 0.95 }),
    concrete: new THREE.MeshStandardMaterial({ color: 0x8f8271, roughness: 0.9 }),
    dark: new THREE.MeshStandardMaterial({ color: 0x4a4238, roughness: 0.85 }),
    rust: new THREE.MeshStandardMaterial({ color: 0x8a4a26, roughness: 0.7, metalness: 0.25 }),
    teal: new THREE.MeshStandardMaterial({ color: 0x2f6f66, roughness: 0.7, metalness: 0.25 }),
    amber: new THREE.MeshStandardMaterial({ color: 0xb06a1e, roughness: 0.7, metalness: 0.2 }),
    olive: new THREE.MeshStandardMaterial({ color: 0x5a5a38, roughness: 0.8 }),
    siteA: new THREE.MeshStandardMaterial({ color: 0xe8702a, roughness: 0.6, emissive: 0x7a2f05, emissiveIntensity: 1.0 }),
    siteB: new THREE.MeshStandardMaterial({ color: 0x2a9d8f, roughness: 0.6, emissive: 0x0a4a42, emissiveIntensity: 1.0 }),
    lamp: new THREE.MeshStandardMaterial({ color: 0xffd9a0, emissive: 0xffb85c, emissiveIntensity: 2.2 }),
  };

  function box(x, z, w, d, h, mat, y = 0) {
    const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
    m.position.set(x, y + h / 2, z);
    m.castShadow = true; m.receiveShadow = true;
    scene.add(m);
    colliders.push({ minX: x - w / 2, maxX: x + w / 2, minZ: z - d / 2, maxZ: z + d / 2, top: y + h });
    shootables.push(m);
    return m;
  }

  // Ground
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(64, 48), mats.ground);
  ground.rotation.x = -Math.PI / 2;
  ground.receiveShadow = true;
  scene.add(ground);
  shootables.push(ground);

  // Perimeter walls (x: -28..28, z: -20..20)
  box(0, -20.5, 58, 1, WALL_H, mats.concrete);
  box(0, 20.5, 58, 1, WALL_H, mats.concrete);
  box(-28.5, 0, 1, 42, WALL_H, mats.concrete);
  box(28.5, 0, 1, 42, WALL_H, mats.concrete);

  // Mid wall at x=0 with two gaps (North lane z=-14, South lane z=+14) and a
  // Mid corridor gap at z=0 — three ways through, each a chokepoint.
  box(0, -17.5, 1.2, 5, WALL_H, mats.dark);
  box(0, -7, 1.2, 6, WALL_H, mats.dark);
  box(0, 7, 1.2, 6, WALL_H, mats.dark);
  box(0, 17.5, 1.2, 5, WALL_H, mats.dark);
  // Mid corridor side walls make the centre a real lane, not an open field.
  box(-6, -4.5, 8, 1, 2.6, mats.concrete);
  box(-6, 4.5, 8, 1, 2.6, mats.concrete);
  box(6, -4.5, 8, 1, 2.6, mats.concrete);
  box(6, 4.5, 8, 1, 2.6, mats.concrete);

  // Crates and containers — cover in every lane, corners to peek around.
  box(-18, -12, 3, 3, 1.6, mats.rust);          // west north crate
  box(-18, 12, 3, 3, 1.6, mats.teal);           // west south crate
  box(-12, 0, 2.4, 2.4, 1.2, mats.amber);       // mid west low crate
  box(12, 0, 2.4, 2.4, 1.2, mats.amber);        // mid east low crate
  box(-8, -14, 6, 1.6, 2.4, mats.olive);        // north lane container
  box(-8, 14, 6, 1.6, 2.4, mats.olive);         // south lane container
  box(8, -9, 2, 2, 2.8, mats.rust);             // tall crate near A approach
  box(8, 9, 2, 2, 2.8, mats.teal);              // tall crate near B approach
  box(16, -6, 3, 1.4, 1.4, mats.dark);          // A site cover
  box(16, 6, 3, 1.4, 1.4, mats.dark);           // B site cover
  box(22, -18, 2, 2, 1.8, mats.rust);           // A corner crate
  box(22, 18, 2, 2, 1.8, mats.teal);            // B corner crate
  box(-22, -4, 1.6, 1.6, 1.4, mats.dark);       // spawn cover
  box(-22, 4, 1.6, 1.6, 1.4, mats.dark);

  // Bomb sites: glowing floor pads + a low frame so the site reads at a glance.
  function sitePad(x, z, mat, label) {
    const pad = new THREE.Mesh(new THREE.BoxGeometry(7, 0.08, 7), mat);
    pad.position.set(x, 0.04, z);
    pad.receiveShadow = true;
    scene.add(pad);
    const post = new THREE.Mesh(new THREE.BoxGeometry(0.3, 3.4, 0.3), mat);
    post.position.set(x - 3.2, 1.7, z - 3.2);
    scene.add(post);
    shootables.push(pad);
    return { x, z, r: 3.4, label };
  }
  const siteA = sitePad(21, -14, mats.siteA, 'A');
  const siteB = sitePad(21, 14, mats.siteB, 'B');

  // Site letters: big flat letter panels on the back wall, built from boxes.
  function letterA(x, z) {
    const g = new THREE.Group();
    const m = mats.siteA;
    const bar = (dx, dz, w, d) => {
      const b = new THREE.Mesh(new THREE.BoxGeometry(w, 2.4, d), m);
      b.position.set(dx, 1.2, dz); g.add(b);
    };
    bar(-0.9, 0, 0.5, 0.2); bar(0.9, 0, 0.5, 0.2); bar(0, 0.9, 2.3, 0.2); bar(0, 0, 1.4, 0.2);
    g.position.set(x, 0, z); scene.add(g);
  }
  function letterB(x, z) {
    const g = new THREE.Group();
    const m = mats.siteB;
    const bar = (dx, dz, w, d) => {
      const b = new THREE.Mesh(new THREE.BoxGeometry(w, 2.4, d), m);
      b.position.set(dx, 1.2, dz); g.add(b);
    };
    bar(-1, 0, 0.5, 0.2); bar(0.6, 0.8, 1.2, 0.2); bar(0.6, -0.8, 1.2, 0.2); bar(0.6, 0, 1.2, 0.2);
    g.position.set(x, 0, z); scene.add(g);
  }
  letterA(27.8, -14); letterB(27.8, 14);

  // Lamp posts with warm pools of light at the three chokepoints.
  const lamps = [];
  for (const [x, z] of [[-14, 0], [0, -14], [0, 14], [14, 0], [21, -14], [21, 14]]) {
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.16, 4.6, 8), mats.dark);
    pole.position.set(x, 2.3, z); pole.castShadow = true; scene.add(pole);
    const head = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.25, 0.9), mats.lamp);
    head.position.set(x, 4.7, z); scene.add(head);
    const light = new THREE.PointLight(0xffb85c, 30, 20, 1.6);
    light.position.set(x, 4.4, z); scene.add(light);
    lamps.push(light);
  }

  // Lighting: low amber sun + cool hemisphere so the palette reads at a glance.
  // Lifted from the first version so lanes and sites read in a screenshot.
  const sun = new THREE.DirectionalLight(0xffc98a, 4.4);
  sun.position.set(-18, 26, -12);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  sun.shadow.camera.left = -34; sun.shadow.camera.right = 34;
  sun.shadow.camera.top = 26; sun.shadow.camera.bottom = -26;
  sun.shadow.camera.far = 80;
  scene.add(sun);
  scene.add(new THREE.HemisphereLight(0xa89a80, 0x2a3436, 1.9));
  scene.add(new THREE.AmbientLight(0x8a7a66, 0.7));

  // Dusk skyline: warehouse silhouettes beyond the walls and a low sun disc
  // in the east, so the sky is part of the map instead of an empty backdrop.
  const skyMat = new THREE.MeshStandardMaterial({ color: 0x3a2f24, roughness: 1 });
  const skyline = [
    [-38, -14, 8, 9], [-38, 8, 10, 13], [-34, 22, 7, 7], [36, -18, 9, 11],
    [36, 4, 7, 8], [38, 20, 10, 14], [-12, -30, 12, 10], [10, -32, 8, 12],
    [-16, 30, 9, 8], [14, 30, 11, 15], [40, -2, 6, 6],
  ];
  for (const [x, z, w, h] of skyline) {
    const b = new THREE.Mesh(new THREE.BoxGeometry(w, h, w), skyMat);
    b.position.set(x, h / 2, z);
    scene.add(b);
  }
  const sunDisc = new THREE.Mesh(
    new THREE.CircleGeometry(4.5, 24),
    new THREE.MeshBasicMaterial({ color: 0xff9a3c, fog: false }),
  );
  sunDisc.position.set(44, 13, -18);
  sunDisc.lookAt(0, 2, 0);
  scene.add(sunDisc);
  const sunGlow = new THREE.Mesh(
    new THREE.CircleGeometry(7.5, 24),
    new THREE.MeshBasicMaterial({ color: 0xe8702a, transparent: true, opacity: 0.28, fog: false }),
  );
  sunGlow.position.set(44.2, 13, -18);
  sunGlow.lookAt(0, 2, 0);
  scene.add(sunGlow);

  return {
    colliders,
    shootables,
    sites: { A: siteA, B: siteB },
    playerSpawn: { x: -24, z: 0, yaw: -Math.PI / 2 },
    botSpawns: [
      { x: 24, z: -16, yaw: Math.PI / 2 },
      { x: 24, z: 16, yaw: Math.PI / 2 },
      { x: 18, z: -4, yaw: Math.PI / 2 },
      { x: 18, z: 4, yaw: Math.PI / 2 },
    ],
    // Waypoints: bots patrol along lanes and hold at sites.
    waypoints: {
      north: [{ x: 20, z: -14 }, { x: 8, z: -14 }, { x: -8, z: -14 }, { x: -2, z: -10 }],
      south: [{ x: 20, z: 14 }, { x: 8, z: 14 }, { x: -8, z: 14 }, { x: -2, z: 10 }],
      mid: [{ x: 18, z: 0 }, { x: 6, z: 0 }, { x: -6, z: 0 }, { x: -16, z: 0 }],
      siteA: [{ x: 21, z: -14 }, { x: 16, z: -10 }, { x: 24, z: -17 }],
      siteB: [{ x: 21, z: 14 }, { x: 16, z: 10 }, { x: 24, z: 17 }],
    },
    update(dt, t) {
      // Subtle lamp flicker so the yard feels alive without costing a frame.
      for (let i = 0; i < lamps.length; i++) {
        lamps[i].intensity = 30 + Math.sin(t * 7 + i * 2.1) * 1.0;
      }
    },
  };
}

// AABB collision: circle (player/bot radius r) vs boxes, resolved per axis.
export function collideCircle(colliders, pos, r, height) {
  for (const c of colliders) {
    if (height > c.top) continue;
    const cx = Math.max(c.minX, Math.min(pos.x, c.maxX));
    const cz = Math.max(c.minZ, Math.min(pos.z, c.maxZ));
    const dx = pos.x - cx, dz = pos.z - cz;
    const d2 = dx * dx + dz * dz;
    if (d2 >= r * r || d2 === 0) continue;
    const d = Math.sqrt(d2);
    pos.x = cx + (dx / d) * r;
    pos.z = cz + (dz / d) * r;
  }
  // Clamp to the yard.
  pos.x = Math.max(-27.4, Math.min(27.4, pos.x));
  pos.z = Math.max(-19.4, Math.min(19.4, pos.z));
}
