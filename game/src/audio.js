// Dustline Yard — all sound is synthesized with WebAudio. No audio files,
// no network: oscillators and filtered noise, shaped per event.
export function createAudio() {
  let ctx = null;
  let master = null;

  function ensure() {
    if (ctx) return true;
    try {
      const AC = window.AudioContext || window.webkitAudioContext;
      ctx = new AC();
      master = ctx.createGain();
      master.gain.value = 0.35;
      master.connect(ctx.destination);
      return true;
    } catch { return false; }
  }

  function tone(freq, dur, type, vol, slideTo) {
    if (!ensure()) return;
    const t = ctx.currentTime;
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.type = type;
    o.frequency.setValueAtTime(freq, t);
    if (slideTo) o.frequency.exponentialRampToValueAtTime(Math.max(20, slideTo), t + dur);
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    o.connect(g); g.connect(master);
    o.start(t); o.stop(t + dur + 0.02);
  }

  function noise(dur, vol, freq, q = 1) {
    if (!ensure()) return;
    const t = ctx.currentTime;
    const len = Math.max(1, Math.floor(ctx.sampleRate * dur));
    const buf = ctx.createBuffer(1, len, ctx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < len; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / len);
    const src = ctx.createBufferSource();
    src.buffer = buf;
    const filter = ctx.createBiquadFilter();
    filter.type = 'bandpass'; filter.frequency.value = freq; filter.Q.value = q;
    const g = ctx.createGain();
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    src.connect(filter); filter.connect(g); g.connect(master);
    src.start(t);
  }

  return {
    unlock() { ensure(); if (ctx && ctx.state === 'suspended') ctx.resume(); },
    shot(kind) {
      if (kind === 'rifle') { noise(0.12, 0.9, 900, 0.7); tone(160, 0.09, 'square', 0.25, 60); }
      else if (kind === 'smg') { noise(0.08, 0.7, 1400, 0.8); tone(220, 0.06, 'square', 0.18, 90); }
      else { noise(0.14, 0.8, 700, 0.7); tone(120, 0.1, 'square', 0.3, 50); }
    },
    enemyShot() { noise(0.1, 0.35, 800, 0.7); },
    dryClick() { tone(1200, 0.03, 'square', 0.15); },
    reload() { tone(500, 0.06, 'square', 0.12); setTimeout(() => tone(700, 0.06, 'square', 0.12), 220); },
    hit() { tone(900, 0.05, 'sine', 0.25); },
    kill() { tone(660, 0.08, 'sine', 0.3); setTimeout(() => tone(990, 0.12, 'sine', 0.3), 90); },
    hurt() { tone(110, 0.18, 'sawtooth', 0.3, 60); },
    explosion() { noise(0.7, 1.0, 180, 0.5); tone(70, 0.6, 'sine', 0.6, 30); },
    plant() { tone(440, 0.15, 'sine', 0.2); setTimeout(() => tone(440, 0.15, 'sine', 0.2), 200); },
    beep() { tone(880, 0.08, 'sine', 0.2); },
    roundWin() { [523, 659, 784].forEach((f, i) => setTimeout(() => tone(f, 0.18, 'triangle', 0.3), i * 140)); },
    roundLose() { [392, 330, 262].forEach((f, i) => setTimeout(() => tone(f, 0.2, 'triangle', 0.25), i * 160)); },
    buy() { tone(780, 0.07, 'triangle', 0.25); setTimeout(() => tone(1040, 0.09, 'triangle', 0.25), 80); },
    step() { noise(0.05, 0.12, 300, 1); },
  };
}
