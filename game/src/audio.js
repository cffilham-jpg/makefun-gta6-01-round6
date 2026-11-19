// Tidewater Heat — audio.js
// Pure WebAudio synthesis: no audio files, no network. Every sound is
// built from oscillators and filtered noise at runtime.

let ctx = null;
let master = null;
let muted = false;
let sirenNodes = null;
let engineNodes = null;

function ensureCtx() {
  if (ctx) return ctx;
  try {
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return null;
    ctx = new AC();
    master = ctx.createGain();
    master.gain.value = muted ? 0 : 0.35;
    master.connect(ctx.destination);
  } catch (e) {
    ctx = null;
  }
  return ctx;
}

export function initAudio() {
  ensureCtx();
  if (ctx && ctx.state === "suspended") ctx.resume().catch(() => {});
}

export function setMuted(m) {
  muted = m;
  if (master && ctx) master.gain.setValueAtTime(m ? 0 : 0.35, ctx.currentTime);
}
export function isMuted() { return muted; }

// Short filtered-noise burst, the base of every gunshot and thud.
function noiseBurst(duration, filterFreq, volume, type = "lowpass") {
  const c = ensureCtx();
  if (!c || !master) return;
  const len = Math.max(1, Math.floor(c.sampleRate * duration));
  const buffer = c.createBuffer(1, len, c.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < len; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / len);
  const src = c.createBufferSource();
  src.buffer = buffer;
  const filter = c.createBiquadFilter();
  filter.type = type;
  filter.frequency.value = filterFreq;
  const gain = c.createGain();
  gain.gain.setValueAtTime(volume, c.currentTime);
  gain.gain.exponentialRampToValueAtTime(0.001, c.currentTime + duration);
  src.connect(filter).connect(gain).connect(master);
  src.start();
}

function tone(freq, duration, volume, type = "sine", slideTo = null) {
  const c = ensureCtx();
  if (!c || !master) return;
  const osc = c.createOscillator();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, c.currentTime);
  if (slideTo) osc.frequency.exponentialRampToValueAtTime(slideTo, c.currentTime + duration);
  const gain = c.createGain();
  gain.gain.setValueAtTime(volume, c.currentTime);
  gain.gain.exponentialRampToValueAtTime(0.001, c.currentTime + duration);
  osc.connect(gain).connect(master);
  osc.start();
  osc.stop(c.currentTime + duration + 0.02);
}

export function playShoot(weapon) {
  if (weapon === "shotgun") { noiseBurst(0.28, 900, 0.9); tone(120, 0.18, 0.5, "sawtooth", 40); }
  else if (weapon === "smg") { noiseBurst(0.09, 1800, 0.45); tone(220, 0.06, 0.2, "square", 90); }
  else { noiseBurst(0.14, 1400, 0.6); tone(180, 0.09, 0.3, "square", 70); }
}

export function playEnemyShoot() { noiseBurst(0.1, 1100, 0.25); }
export function playClick() { tone(880, 0.07, 0.25, "sine"); }
export function playPickup() { tone(660, 0.12, 0.3, "sine"); setTimeout(() => tone(990, 0.18, 0.3, "sine"), 90); }
export function playHurt() { tone(90, 0.2, 0.5, "sawtooth", 45); }
export function playCrash() { noiseBurst(0.3, 500, 0.7); }
export function playMissionComplete() {
  [523, 659, 784, 1047].forEach((f, i) => setTimeout(() => tone(f, 0.22, 0.3, "triangle"), i * 110));
}
export function playReload() { tone(440, 0.06, 0.2, "square"); setTimeout(() => tone(330, 0.08, 0.2, "square"), 120); }

// Two-tone police siren, driven by an LFO on the oscillator frequency.
export function startSiren() {
  const c = ensureCtx();
  if (!c || !master || sirenNodes) return;
  const osc = c.createOscillator();
  osc.type = "triangle";
  osc.frequency.value = 750;
  const lfo = c.createOscillator();
  lfo.type = "square";
  lfo.frequency.value = 0.55;
  const lfoGain = c.createGain();
  lfoGain.gain.value = 180;
  const gain = c.createGain();
  gain.gain.value = 0.05;
  lfo.connect(lfoGain).connect(osc.frequency);
  osc.connect(gain).connect(master);
  osc.start();
  lfo.start();
  sirenNodes = { osc, lfo, gain };
}

export function stopSiren() {
  if (!sirenNodes) return;
  try { sirenNodes.osc.stop(); sirenNodes.lfo.stop(); } catch (e) {}
  sirenNodes = null;
}

// Engine hum: a sawtooth whose pitch follows the car's speed.
export function setEngine(running, speedRatio) {
  const c = ensureCtx();
  if (!c || !master) return;
  if (!running) {
    if (engineNodes) {
      try { engineNodes.osc.stop(); } catch (e) {}
      engineNodes = null;
    }
    return;
  }
  if (!engineNodes) {
    const osc = c.createOscillator();
    osc.type = "sawtooth";
    osc.frequency.value = 70;
    const filter = c.createBiquadFilter();
    filter.type = "lowpass";
    filter.frequency.value = 400;
    const gain = c.createGain();
    gain.gain.value = 0.06;
    osc.connect(filter).connect(gain).connect(master);
    osc.start();
    engineNodes = { osc, gain };
  }
  engineNodes.osc.frequency.setValueAtTime(60 + speedRatio * 160, c.currentTime);
}
