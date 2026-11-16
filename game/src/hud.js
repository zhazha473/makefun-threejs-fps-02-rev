// Dustline Yard — the HUD. All DOM updates live here, driven from state:
// health bar, ammo, round timer, score, money, kill feed, buy menu, plant
// progress, and the start / round-end overlays. The crosshair spreads with
// the weapon's live spread so the player can see accuracy at a glance.
import { PHASE } from './state.js';
import { WEAPONS, GRENADE_PRICE } from './weapons.js';

export function createHud(state) {
  const $ = (id) => document.getElementById(id);
  const el = {
    healthFill: $('health-fill'), healthNum: $('health-num'),
    ammoMag: $('ammo-mag'), ammoReserve: $('ammo-reserve'), ammo: $('ammo'),
    weaponName: $('weapon-name'), timer: $('timer'), score: $('score-value'),
    money: $('money-value'), round: $('round-value'), kills: $('kills-value'),
    crosshair: $('crosshair'), hitmarker: $('hitmarker'),
    feed: $('feed'), plant: $('plant'), plantFill: $('plant-fill'), plantLabel: $('plant-label'),
    buy: $('buy'), overlay: $('overlay'), overlayTitle: $('overlay-title'),
    overlayCopy: $('overlay-copy'), play: $('play'),
    bombStatus: $('bomb-status'), grenades: $('grenades-value'),
  };

  let hitTimer = 0;
  let lastHealth = 100;

  function setOverlay(title, copy, button, show) {
    el.overlayTitle.textContent = title;
    el.overlayCopy.textContent = copy;
    el.play.textContent = button;
    el.overlay.hidden = !show;
  }

  function showStart() {
    setOverlay('DUSTLINE YARD',
      'Vanguard vs Wardens — plant the charge at Site A or B, or eliminate all four Wardens. Buy in freeze time with B. Click to play.',
      'Click to play', true);
  }

  function showRoundEnd(result) {
    const title = result.win ? 'ROUND WON' : 'ROUND LOST';
    setOverlay(title, `${result.reason}. Vanguard ${state.score.attack} — ${state.score.defend} Wardens. Next round starts soon.`, 'Continue', true);
  }

  function update(dt, playerBody, weapons) {
    const s = state;
    el.healthFill.style.width = `${Math.max(0, playerBody.health)}%`;
    el.healthNum.textContent = Math.ceil(Math.max(0, playerBody.health));
    el.healthFill.classList.toggle('low', playerBody.health <= 30);
    const a = weapons.currentAmmo();
    const def = weapons.currentDef();
    el.ammoMag.textContent = a.mag;
    el.ammoReserve.textContent = `/ ${a.reserve}`;
    el.ammo.classList.toggle('empty', a.mag === 0);
    el.ammo.classList.toggle('reloading', weapons.loadout.reloading > 0);
    el.weaponName.textContent = weapons.loadout.reloading > 0 ? 'RELOADING…' : def.name;
    el.timer.textContent = formatTime(Math.max(0, s.roundTime));
    el.timer.classList.toggle('urgent', s.roundTime <= 10 && (s.phase === PHASE.LIVE || s.phase === PHASE.PLANTED));
    el.score.textContent = `${s.score.attack} — ${s.score.defend}`;
    el.money.textContent = `$${s.money}`;
    el.round.textContent = `ROUND ${s.round}`;
    el.kills.textContent = `${s.kills} KILLS`;
    el.grenades.textContent = `◉ ×${weapons.loadout.grenades}`;
    el.bombStatus.textContent = s.bombPlanted
      ? `CHARGE PLANTED — SITE ${s.bombSite}`
      : (s.bombCarrier ? 'CARRYING CHARGE — HOLD E AT A SITE' : 'CHARGE LOST');
    el.bombStatus.classList.toggle('planted', s.bombPlanted);

    // Crosshair spread follows live weapon spread + movement.
    const spread = (def.spread + def.moveSpread * Math.min(1, playerBody.speed2d / 5.2) + weapons.loadout.spreadBloom) * 900;
    el.crosshair.style.setProperty('--gap', `${6 + spread}px`);
    if (hitTimer > 0) { hitTimer -= dt; if (hitTimer <= 0) el.hitmarker.classList.remove('on'); }
    if (playerBody.health < lastHealth) {
      document.body.classList.add('hurt');
      setTimeout(() => document.body.classList.remove('hurt'), 160);
    }
    lastHealth = playerBody.health;
  }

  function formatTime(t) {
    const m = Math.floor(t / 60);
    const sec = Math.floor(t % 60);
    return `${m}:${String(sec).padStart(2, '0')}`;
  }

  function hitmarker(kill) {
    el.hitmarker.classList.add('on');
    el.hitmarker.classList.toggle('kill', !!kill);
    hitTimer = kill ? 0.35 : 0.12;
  }

  function feed(text, cls) {
    const div = document.createElement('div');
    div.className = `feed-item ${cls || ''}`;
    div.textContent = text;
    el.feed.prepend(div);
    while (el.feed.children.length > 4) el.feed.removeChild(el.feed.lastChild);
    setTimeout(() => div.remove(), 6000);
  }

  function setPlant(progress, siteLabel) {
    if (progress > 0) {
      el.plant.hidden = false;
      el.plantFill.style.width = `${Math.min(100, progress * 33.3)}%`;
      el.plantLabel.textContent = `PLANTING AT SITE ${siteLabel}…`;
    } else el.plant.hidden = true;
  }

  function renderBuy(weapons) {
    const rows = Object.entries(WEAPONS).map(([key, def]) => {
      const owned = weapons.loadout.owned[key];
      const can = !owned && state.money >= def.price;
      return `<div class="buy-row ${owned ? 'owned' : ''} ${can ? '' : 'poor'}">
        <span class="buy-key">${key === 'rifle' ? '1' : key === 'smg' ? '2' : '3'}</span>
        <span class="buy-name">${def.name}</span>
        <span class="buy-stat">${def.damage} dmg · ${def.mag} rnd</span>
        <span class="buy-price">${owned ? (weapons.loadout.current === key ? 'EQUIPPED' : 'OWNED') : '$' + def.price}</span>
      </div>`;
    }).join('');
    el.buy.innerHTML = `<h2>BUY — FREEZE TIME</h2>
      <p>Money <b>$${state.money}</b> · Press 1 / 2 / 3 to buy, G for grenade ($${GRENADE_PRICE}), B to close.</p>
      ${rows}
      <div class="buy-row"><span class="buy-key">G</span><span class="buy-name">Spark-9 Frag Grenade</span>
      <span class="buy-stat">area damage</span><span class="buy-price">$${GRENADE_PRICE} ×${weapons.loadout.grenades}</span></div>`;
  }

  function setBuy(open, weapons) {
    el.buy.hidden = !open;
    if (open) renderBuy(weapons);
  }

  return { update, hitmarker, feed, setPlant, setBuy, renderBuy, showStart, showRoundEnd, setOverlay, el };
}
