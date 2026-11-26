// Synthesised sound effects (WebAudio). No audio files needed.

export type Sfx =
  | 'click'
  | 'hover'
  | 'select'
  | 'fuse_charge'
  | 'fuse_burst'
  | 'reveal'
  | 'attack'
  | 'hit'
  | 'dodge'
  | 'special'
  | 'enemy_windup'
  | 'victory'
  | 'defeat'
  | 'evolve_charge'
  | 'evolve_burst'
  | 'achievement'
  | 'error'
  | 'coin';

let ctx: AudioContext | null = null;
let master: GainNode | null = null;
let muted = false;
let volume = 0.6;

function ac(): AudioContext | null {
  if (typeof window === 'undefined') return null;
  if (!ctx) {
    const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctor) return null;
    ctx = new Ctor();
    master = ctx.createGain();
    master.gain.value = muted ? 0 : volume * 0.5;
    master.connect(ctx.destination);
  }
  if (ctx.state === 'suspended') void ctx.resume();
  return ctx;
}

export function configureAudio(opts: { muted: boolean; volume: number }) {
  muted = opts.muted;
  volume = opts.volume;
  if (master && ctx) master.gain.setTargetAtTime(muted ? 0 : volume * 0.5, ctx.currentTime, 0.02);
}

function tone(freq: number, dur: number, type: OscillatorType = 'sine', gain = 0.3, slideTo?: number, delay = 0) {
  const c = ac();
  if (!c || !master || muted) return;
  const t0 = c.currentTime + delay;
  const osc = c.createOscillator();
  const g = c.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, t0);
  if (slideTo) osc.frequency.exponentialRampToValueAtTime(Math.max(20, slideTo), t0 + dur);
  g.gain.setValueAtTime(0.0001, t0);
  g.gain.exponentialRampToValueAtTime(gain, t0 + 0.012);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  osc.connect(g).connect(master);
  osc.start(t0);
  osc.stop(t0 + dur + 0.05);
}

function noise(dur: number, gain = 0.2, filterFreq = 1200, delay = 0, q = 0.8) {
  const c = ac();
  if (!c || !master || muted) return;
  const t0 = c.currentTime + delay;
  const len = Math.floor(c.sampleRate * dur);
  const buf = c.createBuffer(1, len, c.sampleRate);
  const data = buf.getChannelData(0);
  for (let i = 0; i < len; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / len);
  const src = c.createBufferSource();
  src.buffer = buf;
  const f = c.createBiquadFilter();
  f.type = 'bandpass';
  f.frequency.value = filterFreq;
  f.Q.value = q;
  const g = c.createGain();
  g.gain.setValueAtTime(gain, t0);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  src.connect(f).connect(g).connect(master);
  src.start(t0);
}

export function play(s: Sfx) {
  if (muted) return;
  switch (s) {
    case 'click':
      tone(660, 0.07, 'triangle', 0.12, 880);
      break;
    case 'hover':
      tone(1200, 0.04, 'sine', 0.03);
      break;
    case 'select':
      tone(520, 0.09, 'sine', 0.15, 780);
      tone(780, 0.12, 'sine', 0.08, 1040, 0.05);
      break;
    case 'coin':
      tone(988, 0.08, 'square', 0.06);
      tone(1319, 0.16, 'square', 0.06, undefined, 0.07);
      break;
    case 'fuse_charge':
      tone(110, 1.6, 'sawtooth', 0.08, 880);
      tone(220, 1.6, 'sine', 0.1, 1320);
      noise(1.6, 0.05, 2400, 0, 2);
      break;
    case 'fuse_burst':
      noise(0.7, 0.35, 600);
      tone(880, 0.6, 'sine', 0.2, 220);
      tone(1320, 0.9, 'triangle', 0.1, 660, 0.05);
      break;
    case 'reveal':
      [523, 659, 784, 1047].forEach((f, i) => tone(f, 0.5, 'sine', 0.14, undefined, i * 0.09));
      break;
    case 'attack':
      noise(0.12, 0.25, 1800);
      tone(320, 0.1, 'square', 0.06, 140);
      break;
    case 'hit':
      noise(0.18, 0.3, 400);
      tone(160, 0.18, 'sawtooth', 0.12, 60);
      break;
    case 'dodge':
      noise(0.2, 0.12, 3200, 0, 3);
      tone(700, 0.15, 'sine', 0.06, 1400);
      break;
    case 'special':
      tone(220, 0.5, 'sawtooth', 0.12, 1760);
      noise(0.5, 0.25, 900, 0.1);
      tone(1760, 0.4, 'sine', 0.1, 440, 0.15);
      break;
    case 'enemy_windup':
      tone(180, 0.35, 'square', 0.05, 360);
      break;
    case 'victory':
      [392, 523, 659, 784].forEach((f, i) => tone(f, 0.35, 'triangle', 0.14, undefined, i * 0.12));
      tone(1047, 0.8, 'sine', 0.12, undefined, 0.5);
      break;
    case 'defeat':
      [392, 330, 262].forEach((f, i) => tone(f, 0.4, 'triangle', 0.12, f * 0.9, i * 0.18));
      break;
    case 'evolve_charge':
      tone(80, 3, 'sawtooth', 0.07, 640);
      tone(160, 3, 'sine', 0.1, 1280);
      noise(3, 0.04, 3000, 0, 4);
      break;
    case 'evolve_burst':
      noise(1.2, 0.4, 500);
      [262, 330, 392, 523, 659, 784, 1047].forEach((f, i) => tone(f, 1.2, 'sine', 0.1, undefined, i * 0.06));
      break;
    case 'achievement':
      [659, 784, 988, 1319].forEach((f, i) => tone(f, 0.25, 'square', 0.05, undefined, i * 0.08));
      break;
    case 'error':
      tone(220, 0.15, 'square', 0.08, 160);
      break;
  }
}
