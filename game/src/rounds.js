// Dustline Yard — rounds. Freeze (buy) -> Live -> Planted -> End, then the
// next round. Win: eliminate all Wardens, or the planted charge detonates.
// Lose: the player dies, time runs out, or a Warden defuses the charge.
// Money: +$300 round win, +$150 loss, +$300 per kill, +$800 for a plant.
import { PHASE, pushEvent } from './state.js';

export function createRounds(state, audio) {
  function startRound() {
    state.phase = PHASE.FREEZE;
    state.roundTime = state.freezeTime;
    state.bombPlanted = false;
    state.bombSite = null;
    state.bombPosition = null;
    state.roundKills = 0;
    state.roundResult = null;
    pushEvent(state, 'roundStart', { round: state.round });
  }

  function endRound(win, reason) {
    if (state.phase === PHASE.END) return;
    state.phase = PHASE.END;
    state.roundResult = { win, reason };
    state.roundTime = 5;
    if (win) { state.score.attack += 1; state.money += 300; audio.roundWin(); }
    else { state.score.defend += 1; state.money += 150; audio.roundLose(); }
    pushEvent(state, 'roundEnd', { win, reason, round: state.round });
  }

  function nextRound() {
    state.round += 1;
    startRound();
  }

  // Called every fixed step while the round is live.
  function step(dt, ctx) {
    if (state.phase === PHASE.FREEZE) {
      state.roundTime -= dt;
      if (state.roundTime <= 0) {
        state.phase = PHASE.LIVE;
        state.roundTime = state.liveTime;
        pushEvent(state, 'roundLive', { round: state.round });
      }
      return;
    }
    if (state.phase === PHASE.END) {
      state.roundTime -= dt;
      if (state.roundTime <= 0) nextRound();
      return;
    }
    // LIVE or PLANTED
    state.roundTime -= dt;
    if (state.phase === PHASE.PLANTED && state.roundTime <= 0) {
      endRound(true, 'Charge detonated — Site cleared');
      return;
    }
    if (state.phase === PHASE.LIVE && state.roundTime <= 0) {
      endRound(false, 'Time expired — Wardens held the yard');
      return;
    }
    if (!ctx.playerBody.alive) {
      endRound(false, state.bombPlanted ? 'You fell — the charge was defused' : 'You were eliminated');
      return;
    }
    if (ctx.bots.aliveCount() === 0) {
      endRound(true, state.bombPlanted ? 'Wardens eliminated — charge will detonate' : 'All Wardens eliminated');
      return;
    }
  }

  // Plant progress: hold E inside a site for 3 s while carrying the charge.
  function plantStep(dt, ctx, plantProgress) {
    if (state.phase !== PHASE.LIVE || !state.bombCarrier || !ctx.playerBody.alive) return plantProgress;
    const site = ctx.nearSite();
    if (!site || !ctx.input.plant) return 0;
    const next = plantProgress + dt;
    if (next >= 3) {
      state.bombPlanted = true;
      state.bombSite = site.label;
      state.bombPosition = { x: ctx.playerBody.pos.x, z: ctx.playerBody.pos.z };
      state.bombCarrier = false;
      state.phase = PHASE.PLANTED;
      state.roundTime = state.bombTime;
      state.money += 800;
      audio.plant();
      pushEvent(state, 'planted', { site: site.label });
      return 0;
    }
    return next;
  }

  return { startRound, endRound, nextRound, step, plantStep };
}
