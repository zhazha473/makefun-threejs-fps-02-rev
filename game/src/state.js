// Dustline Yard — the single source of truth for game state.
// Every module reads and mutates this one object; nothing else keeps a copy
// of round, score, money or phase. Rendering only reads it, simulation writes it.
export const PHASE = {
  MENU: 'menu',       // start overlay, waiting for click
  FREEZE: 'freeze',   // buy time before the round starts
  LIVE: 'live',       // round in progress
  PLANTED: 'planted', // bomb planted, countdown running
  END: 'end',         // round over, showing the result
};

export const TEAM = { ATTACK: 'Vanguard', DEFEND: 'Wardens' };

export function createState() {
  return {
    phase: PHASE.MENU,
    round: 1,
    roundTime: 0,          // seconds left in the current phase
    freezeTime: 12,
    liveTime: 100,
    bombTime: 35,
    score: { attack: 0, defend: 0 },
    money: 800,
    kills: 0,
    deaths: 0,
    roundKills: 0,
    bombPlanted: false,
    bombSite: null,        // 'A' | 'B' | null
    bombPosition: null,    // {x, z} where it was planted
    bombCarrier: true,     // the player carries the charge
    roundResult: null,     // { win: bool, reason: string }
    time: 0,               // total simulation time (fixed-step clock)
    seed: 1,
    // per-frame input snapshot, filled by input.js, consumed by player.js
    input: {
      forward: 0, strafe: 0, crouch: false, jump: false,
      fire: false, reload: false, buy: false,
      weaponSlot: 0, grenade: false, plant: false, defuse: false,
      yawDelta: 0, pitchDelta: 0,
    },
    // transient events the HUD / audio consume once
    events: [],
  };
}

export function pushEvent(state, type, data = {}) {
  state.events.push({ type, ...data, t: state.time });
}

export function drainEvents(state) {
  const out = state.events;
  state.events = [];
  return out;
}
