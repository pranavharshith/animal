// Premium collectible specimen card, rendered to a 900×1260 PNG on a canvas.
import { createElement } from 'react';
import { ELEMENT_INFO, MUTATION_INFO, RARITY_INFO } from '../engine/data';
import { computeStats, creatureRarity } from '../engine/genetics';
import { encodeGenome } from '../engine/genomeCode';
import { hashSeed, mulberry32 } from '../engine/rng';
import type { Creature, Rarity, Stats } from '../engine/types';
import { dominant } from '../engine/behaviour';
import { CreatureSVG } from './CreatureSVG';

export const CARD_W = 900;
export const CARD_H = 1260;

const DISPLAY = "'Fraunces', Georgia, 'Times New Roman', serif";
const BODY = "'Outfit', system-ui, -apple-system, 'Segoe UI', sans-serif";
const MONO = "ui-monospace, 'SFMono-Regular', Menlo, Consolas, monospace";

export const STAT_META: Array<{ key: keyof Stats; label: string; max: number; color: string }> = [
  { key: 'vigor', label: 'VIGOR', max: 160, color: '#9cc48a' },
  { key: 'power', label: 'POWER', max: 40, color: '#d98466' },
  { key: 'guard', label: 'GUARD', max: 20, color: '#7fb1d0' },
  { key: 'speed', label: 'SPEED', max: 30, color: '#dcc068' },
  { key: 'focus', label: 'FOCUS', max: 30, color: '#b6a1d6' },
];

export const RAINBOW = ['#d48ab0', '#6fb0c8', '#ccd07a', '#e4bb86', '#d48ab0'];

/** Frame gradient stops for a creature: element colour → rarity colour, rainbow for anomalies. */
export function frameColors(creature: Creature, rarity: Rarity = creatureRarity(creature)): string[] {
  if (rarity === 'anomaly') return RAINBOW;
  const el = ELEMENT_INFO[creature.genome.element];
  return [el.color, RARITY_INFO[rarity].color, el.color2, el.color];
}

/** Short specimen serial derived from the seed, e.g. "7F3A-09C2". */
export function specimenSerial(creature: Creature): string {
  const hex = (creature.genome.seed >>> 0).toString(16).toUpperCase().padStart(8, '0');
  return `${hex.slice(0, 4)}-${hex.slice(4)}`;
}

export function cardFileName(creature: Creature): string {
  const slug = creature.name
    .normalize('NFKD')
    .replace(/[^\w\s-]/g, '')
    .trim()
    .toLowerCase()
    .replace(/[\s_]+/g, '-')
    .slice(0, 24) || 'specimen';
  return `wildshift-${slug}-${(creature.genome.seed >>> 0).toString(16)}.png`;
}

/** Trigger a browser download for a blob. */
export function downloadBlob(blob: Blob, fileName: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = fileName;
  a.rel = 'noopener';
  document.body.appendChild(a);
  a.click();
  a.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 4000);
}

/** Render the creature SVG to a standalone markup string (static, no animation). */
export async function creatureSvgMarkup(creature: Creature, size = 720): Promise<string> {
  const { renderToStaticMarkup } = await import('react-dom/server');
  const markup = renderToStaticMarkup(
    createElement(CreatureSVG, { genome: creature.genome, stage: creature.stage, size, animated: false, shadow: true, lite: false, framing: 'tight', personality: dominant(creature.tendencies) }),
  );
  return markup.includes('xmlns=') ? markup : markup.replace('<svg', '<svg xmlns="http://www.w3.org/2000/svg"');
}

function loadImage(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('Could not rasterise creature art'));
    img.src = url;
  });
}

async function fontsReady(): Promise<void> {
  if (typeof document === 'undefined' || !document.fonts) return;
  try {
    await Promise.all([
      document.fonts.load(`900 64px ${DISPLAY}`),
      document.fonts.load(`700 28px ${DISPLAY}`),
      document.fonts.load(`600 24px ${BODY}`),
    ]);
  } catch {
    // Fonts are optional; fall back to system faces.
  }
  await document.fonts.ready;
}

// ---------- drawing helpers ----------

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  const rr = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + rr, y);
  ctx.arcTo(x + w, y, x + w, y + h, rr);
  ctx.arcTo(x + w, y + h, x, y + h, rr);
  ctx.arcTo(x, y + h, x, y, rr);
  ctx.arcTo(x, y, x + w, y, rr);
  ctx.closePath();
}

function hexToRgba(hex: string, alpha: number): string {
  const h = hex.replace('#', '');
  const full = h.length === 3 ? h.split('').map((c) => c + c).join('') : h;
  const n = parseInt(full.slice(0, 6), 16);
  return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${alpha})`;
}

/** Draw text with manual letter spacing (canvas letterSpacing is not universal). */
function spacedText(ctx: CanvasRenderingContext2D, text: string, cx: number, y: number, spacing: number) {
  const chars = [...text];
  const widths = chars.map((c) => ctx.measureText(c).width);
  const total = widths.reduce((s, w) => s + w, 0) + spacing * (chars.length - 1);
  const prevAlign = ctx.textAlign;
  ctx.textAlign = 'left';
  let x = cx - total / 2;
  chars.forEach((c, i) => {
    ctx.fillText(c, x, y);
    x += widths[i] + spacing;
  });
  ctx.textAlign = prevAlign;
}

/** Shrink a font until text fits; truncate with an ellipsis as a last resort. Returns the final text. */
function fitText(ctx: CanvasRenderingContext2D, text: string, maxW: number, font: (px: number) => string, start: number, min: number): string {
  let px = start;
  ctx.font = font(px);
  while (ctx.measureText(text).width > maxW && px > min) {
    px -= 2;
    ctx.font = font(px);
  }
  if (ctx.measureText(text).width <= maxW) return text;
  let t = text;
  while (t.length > 1 && ctx.measureText(t + '…').width > maxW) t = t.slice(0, -1);
  return t + '…';
}

function hexGrid(ctx: CanvasRenderingContext2D, color: string) {
  const r = 34;
  const w = Math.sqrt(3) * r;
  const h = 1.5 * r;
  ctx.save();
  ctx.strokeStyle = hexToRgba(color, 0.07);
  ctx.lineWidth = 1.2;
  for (let row = -1; row * h < CARD_H + r; row++) {
    for (let col = -1; col * w < CARD_W + w; col++) {
      const cx = col * w + (row % 2 ? w / 2 : 0);
      const cy = row * h;
      ctx.beginPath();
      for (let k = 0; k < 6; k++) {
        const a = (Math.PI / 3) * k + Math.PI / 6;
        const px = cx + r * Math.cos(a);
        const py = cy + r * Math.sin(a);
        if (k === 0) ctx.moveTo(px, py);
        else ctx.lineTo(px, py);
      }
      ctx.closePath();
      ctx.stroke();
    }
  }
  ctx.restore();
}

function particles(ctx: CanvasRenderingContext2D, seed: number, colors: string[]) {
  const rng = mulberry32(hashSeed(seed, 'card-particles'));
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  for (let i = 0; i < 70; i++) {
    const x = 40 + rng() * (CARD_W - 80);
    const y = 40 + rng() * (CARD_H - 80);
    const r = 0.8 + rng() * rng() * 4.5;
    const col = colors[Math.floor(rng() * colors.length)];
    const g = ctx.createRadialGradient(x, y, 0, x, y, r * 4);
    g.addColorStop(0, hexToRgba(col, 0.55 + rng() * 0.4));
    g.addColorStop(0.3, hexToRgba(col, 0.25));
    g.addColorStop(1, hexToRgba(col, 0));
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(x, y, r * 4, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
}

/** Organic vein lines drifting behind the art window. */
function veins(ctx: CanvasRenderingContext2D, seed: number, color: string) {
  const rng = mulberry32(hashSeed(seed, 'card-veins'));
  ctx.save();
  ctx.strokeStyle = hexToRgba(color, 0.12);
  ctx.lineWidth = 2;
  ctx.lineCap = 'round';
  for (let i = 0; i < 7; i++) {
    let x = rng() * CARD_W;
    let y = rng() < 0.5 ? 0 : CARD_H;
    ctx.beginPath();
    ctx.moveTo(x, y);
    for (let k = 0; k < 6; k++) {
      const nx = x + (rng() - 0.5) * 320;
      const ny = y + (y > CARD_H / 2 ? -1 : 1) * (80 + rng() * 140);
      ctx.quadraticCurveTo(x + (rng() - 0.5) * 200, (y + ny) / 2, nx, ny);
      x = nx;
      y = ny;
    }
    ctx.stroke();
  }
  ctx.restore();
}

/** Decorative barcode derived from the code characters: bars as [offset, width] in 0..1 units. */
export function barcodeBars(code: string): Array<[number, number]> {
  const runs: Array<[number, boolean]> = [];
  for (const ch of code) {
    const c = ch.charCodeAt(0);
    runs.push([1 + (c & 3), true], [1 + ((c >> 2) & 1), false], [1 + ((c >> 3) & 3), true], [1 + ((c >> 5) & 1), false]);
  }
  const units = runs.reduce((s, [u]) => s + u, 0) || 1;
  const out: Array<[number, number]> = [];
  let at = 0;
  for (const [u, dark] of runs) {
    if (dark) out.push([at / units, u / units]);
    at += u;
  }
  return out;
}

function barcode(ctx: CanvasRenderingContext2D, code: string, x: number, y: number, w: number, h: number, color: string) {
  ctx.save();
  ctx.fillStyle = color;
  for (const [o, bw] of barcodeBars(code)) ctx.fillRect(x + o * w, y, Math.max(0.8, bw * w - 0.2), h);
  ctx.restore();
}

// ---------- main ----------

export async function renderSpecimenCard(creature: Creature): Promise<Blob> {
  const g = creature.genome;
  const el = ELEMENT_INFO[g.element];
  const rarity = creatureRarity(creature);
  const rar = RARITY_INFO[rarity];
  const stats = computeStats(creature);
  const code = encodeGenome(g, creature.stage, creature.name);
  const frame = frameColors(creature, rarity);

  const canvas = document.createElement('canvas');
  canvas.width = CARD_W;
  canvas.height = CARD_H;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Canvas is not supported');

  // Kick off art rasterisation and font loading together.
  const svg = await creatureSvgMarkup(creature, 720);
  const svgUrl = URL.createObjectURL(new Blob([svg], { type: 'image/svg+xml;charset=utf-8' }));
  let art: HTMLImageElement;
  try {
    [art] = await Promise.all([loadImage(svgUrl), fontsReady()]);
  } finally {
    // Revoke after the image has decoded (or failed).
    window.setTimeout(() => URL.revokeObjectURL(svgUrl), 0);
  }

  // --- Card shape clip ---
  const M = 22;
  const R = 46;
  ctx.save();
  roundRect(ctx, M, M, CARD_W - M * 2, CARD_H - M * 2, R);
  ctx.clip();

  // Background gradient
  const bg = ctx.createLinearGradient(0, 0, CARD_W * 0.4, CARD_H);
  bg.addColorStop(0, el.dark);
  bg.addColorStop(0.45, '#0d0f14');
  bg.addColorStop(0.78, el.dark);
  bg.addColorStop(1, hexToRgba(el.color, 0.35));
  ctx.fillStyle = '#121619';
  ctx.fillRect(0, 0, CARD_W, CARD_H);
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, CARD_W, CARD_H);

  const topGlow = ctx.createRadialGradient(CARD_W / 2, -80, 10, CARD_W / 2, -80, 700);
  topGlow.addColorStop(0, hexToRgba(el.color2, 0.28));
  topGlow.addColorStop(1, hexToRgba(el.color2, 0));
  ctx.fillStyle = topGlow;
  ctx.fillRect(0, 0, CARD_W, CARD_H);

  hexGrid(ctx, el.color);
  veins(ctx, g.seed, el.color);
  particles(ctx, g.seed, [el.color, el.color2, rar.color]);

  // --- Art window ---
  const ax = 66;
  const ay = 150;
  const aw = CARD_W - ax * 2;
  const ah = 610;
  ctx.save();
  roundRect(ctx, ax, ay, aw, ah, 34);
  const win = ctx.createLinearGradient(0, ay, 0, ay + ah);
  win.addColorStop(0, 'rgba(255,255,255,0.06)');
  win.addColorStop(1, 'rgba(0,0,0,0.35)');
  ctx.fillStyle = win;
  ctx.fill();
  ctx.clip();
  const glow = ctx.createRadialGradient(CARD_W / 2, ay + ah * 0.55, 20, CARD_W / 2, ay + ah * 0.55, 380);
  glow.addColorStop(0, hexToRgba(el.color, 0.55));
  glow.addColorStop(0.45, hexToRgba(el.color, 0.16));
  glow.addColorStop(1, hexToRgba(el.color, 0));
  ctx.fillStyle = glow;
  ctx.fillRect(ax, ay, aw, ah);
  // Concentric scan rings
  ctx.strokeStyle = hexToRgba(el.color2, 0.12);
  ctx.lineWidth = 1.5;
  for (let i = 1; i <= 4; i++) {
    ctx.beginPath();
    ctx.ellipse(CARD_W / 2, ay + ah * 0.86, 90 * i, 18 * i, 0, 0, Math.PI * 2);
    ctx.stroke();
  }
  // Creature
  const artSize = 640;
  ctx.shadowColor = hexToRgba(el.color, 0.55);
  ctx.shadowBlur = 40;
  ctx.drawImage(art, CARD_W / 2 - artSize / 2, ay + ah / 2 - artSize / 2 + 6, artSize, artSize);
  ctx.shadowBlur = 0;
  ctx.restore();
  // Window border + corner ticks (lab reticle)
  ctx.save();
  roundRect(ctx, ax, ay, aw, ah, 34);
  ctx.strokeStyle = hexToRgba(el.color, 0.35);
  ctx.lineWidth = 2;
  ctx.stroke();
  ctx.strokeStyle = hexToRgba(el.color2, 0.8);
  ctx.lineWidth = 3;
  const t = 26;
  const corners: Array<[number, number, number, number]> = [
    [ax + 14, ay + 14, 1, 1],
    [ax + aw - 14, ay + 14, -1, 1],
    [ax + 14, ay + ah - 14, 1, -1],
    [ax + aw - 14, ay + ah - 14, -1, -1],
  ];
  for (const [cx, cy, dx, dy] of corners) {
    ctx.beginPath();
    ctx.moveTo(cx, cy + t * dy);
    ctx.lineTo(cx, cy);
    ctx.lineTo(cx + t * dx, cy);
    ctx.stroke();
  }
  ctx.restore();

  // Art window labels
  ctx.save();
  ctx.font = `600 18px ${MONO}`;
  ctx.fillStyle = hexToRgba(el.color2, 0.75);
  ctx.textAlign = 'left';
  ctx.fillText(`No. ${specimenSerial(creature)}`, ax + 30, ay + 46);
  ctx.textAlign = 'right';
  ctx.fillText(el.name.toUpperCase(), ax + aw - 30, ay + 46);
  ctx.restore();

  // --- Header ---
  ctx.save();
  ctx.textAlign = 'center';
  ctx.textBaseline = 'alphabetic';
  ctx.fillStyle = '#ece6da';
  ctx.shadowColor = hexToRgba(el.color, 0.8);
  ctx.shadowBlur = 18;
  ctx.font = `900 40px ${DISPLAY}`;
  spacedText(ctx, 'WILDSHIFT', CARD_W / 2, 92, 12);
  ctx.shadowBlur = 0;
  ctx.font = `600 16px ${BODY}`;
  ctx.fillStyle = hexToRgba(el.color2, 0.85);
  spacedText(ctx, 'FIELD SPECIMEN', CARD_W / 2, 124, 6);
  // Divider lines either side of eyebrow
  ctx.strokeStyle = hexToRgba(el.color2, 0.35);
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.moveTo(ax + 40, 118);
  ctx.lineTo(CARD_W / 2 - 120, 118);
  ctx.moveTo(CARD_W / 2 + 120, 118);
  ctx.lineTo(ax + aw - 40, 118);
  ctx.stroke();
  ctx.restore();

  // --- Name + identity line ---
  ctx.save();
  ctx.textAlign = 'center';
  ctx.fillStyle = '#ffffff';
  ctx.shadowColor = hexToRgba(rar.color, 0.6);
  ctx.shadowBlur = 24;
  const name = fitText(ctx, creature.name.toUpperCase(), aw - 40, (px) => `900 ${px}px ${DISPLAY}`, 66, 34);
  ctx.fillText(name, CARD_W / 2, 838);
  ctx.shadowBlur = 0;

  // Identity chips: element · rarity · stage/gen
  const chips: Array<{ text: string; color: string }> = [
    { text: el.name, color: el.color },
    { text: rarity === 'anomaly' ? `✧ ${rar.name}` : rar.name, color: rar.color },
    { text: `Stage ${creature.stage} · Gen ${creature.generation}`, color: '#b3ad9f' },
  ];
  ctx.font = `600 22px ${BODY}`;
  const padX = 18;
  const gap = 12;
  const chipW = chips.map((c) => ctx.measureText(c.text).width + padX * 2);
  const totalW = chipW.reduce((s, w) => s + w, 0) + gap * (chips.length - 1);
  let cx = CARD_W / 2 - totalW / 2;
  const cy = 868;
  chips.forEach((c, i) => {
    roundRect(ctx, cx, cy, chipW[i], 40, 20);
    ctx.fillStyle = hexToRgba(c.color, 0.12);
    ctx.fill();
    ctx.strokeStyle = hexToRgba(c.color, 0.55);
    ctx.lineWidth = 1.5;
    ctx.stroke();
    ctx.fillStyle = c.color;
    ctx.textAlign = 'center';
    ctx.fillText(c.text, cx + chipW[i] / 2, cy + 28);
    cx += chipW[i] + gap;
  });
  ctx.restore();

  // --- Stats (left) + mutations (right) panel ---
  const py = 930;
  const ph = 152;
  ctx.save();
  roundRect(ctx, ax, py, aw, ph, 24);
  ctx.fillStyle = 'rgba(16, 19, 26, 0.6)';
  ctx.fill();
  ctx.strokeStyle = 'rgba(236, 228, 210, 0.14)';
  ctx.lineWidth = 1.5;
  ctx.stroke();

  const sx = ax + 28;
  const barX = sx + 92;
  const barW = 260;
  ctx.font = `700 15px ${BODY}`;
  ctx.textBaseline = 'middle';
  STAT_META.forEach((s, i) => {
    const y = py + 24 + i * 26;
    const v = stats[s.key];
    ctx.fillStyle = '#b3ad9f';
    ctx.textAlign = 'left';
    ctx.fillText(s.label, sx, y);
    roundRect(ctx, barX, y - 5, barW, 10, 5);
    ctx.fillStyle = 'rgba(255,255,255,0.08)';
    ctx.fill();
    const fw = Math.max(10, Math.min(1, v / s.max) * barW);
    roundRect(ctx, barX, y - 5, fw, 10, 5);
    ctx.fillStyle = s.color;
    ctx.shadowColor = s.color;
    ctx.shadowBlur = 10;
    ctx.fill();
    ctx.shadowBlur = 0;
    ctx.fillStyle = '#ece6da';
    ctx.textAlign = 'right';
    ctx.fillText(String(v), barX + barW + 46, y);
  });

  // Divider
  const mx = ax + aw / 2 + 52;
  ctx.strokeStyle = 'rgba(236, 228, 210, 0.14)';
  ctx.beginPath();
  ctx.moveTo(mx - 24, py + 22);
  ctx.lineTo(mx - 24, py + ph - 22);
  ctx.stroke();

  ctx.textAlign = 'left';
  ctx.font = `600 13px ${BODY}`;
  ctx.fillStyle = '#807b70';
  spacedLeft(ctx, 'MUTATIONS', mx, py + 26, 3);
  const muts = g.mutations.slice(0, 3);
  const mw = ax + aw - 24 - mx;
  if (muts.length === 0) {
    ctx.font = `500 19px ${BODY}`;
    ctx.fillStyle = '#807b70';
    ctx.fillText('None recorded', mx, py + 62);
  } else {
    muts.forEach((m, i) => {
      const y = py + 58 + i * 30;
      ctx.fillStyle = el.color;
      ctx.shadowColor = el.color;
      ctx.shadowBlur = 8;
      ctx.beginPath();
      ctx.arc(mx + 6, y, 5, 0, Math.PI * 2);
      ctx.fill();
      ctx.shadowBlur = 0;
      ctx.fillStyle = '#ece6da';
      const label = fitText(ctx, MUTATION_INFO[m].name, mw - 24, (px) => `600 ${px}px ${BODY}`, 21, 15);
      ctx.fillText(label, mx + 22, y);
    });
    if (g.mutations.length > 3) {
      ctx.font = `500 15px ${BODY}`;
      ctx.fillStyle = '#807b70';
      ctx.fillText(`+${g.mutations.length - 3} more`, mx + 22, py + ph - 8);
    }
  }
  ctx.restore();

  // --- Genome strip ---
  const by = 1100;
  const bh = 88;
  ctx.save();
  roundRect(ctx, ax, by, aw, bh, 20);
  ctx.fillStyle = 'rgba(236, 230, 218, 0.92)';
  ctx.fill();
  barcode(ctx, code, ax + 22, by + 12, aw - 44, 38, '#192026');
  ctx.textAlign = 'center';
  ctx.textBaseline = 'alphabetic';
  ctx.fillStyle = '#192026';
  const codeText = fitText(ctx, code, aw - 44, (px) => `700 ${px}px ${MONO}`, 17, 9);
  ctx.fillText(codeText, CARD_W / 2, by + bh - 14);
  ctx.restore();

  ctx.save();
  ctx.textAlign = 'center';
  ctx.font = `500 15px ${BODY}`;
  ctx.fillStyle = 'rgba(179, 173, 159, 0.7)';
  ctx.fillText('Paste this genome code into WILDSHIFT to grow an exact copy', CARD_W / 2, 1212);
  ctx.restore();

  ctx.restore(); // card clip

  // --- Holographic frame ---
  const fg = ctx.createLinearGradient(0, 0, CARD_W, CARD_H);
  frame.forEach((c, i) => fg.addColorStop(i / (frame.length - 1), c));
  ctx.save();
  roundRect(ctx, M + 3, M + 3, CARD_W - (M + 3) * 2, CARD_H - (M + 3) * 2, R - 3);
  ctx.strokeStyle = fg;
  ctx.lineWidth = 6;
  ctx.shadowColor = rarity === 'anomaly' ? '#d48ab0' : hexToRgba(el.color, 0.8);
  ctx.shadowBlur = 22;
  ctx.stroke();
  ctx.shadowBlur = 0;
  roundRect(ctx, M + 14, M + 14, CARD_W - (M + 14) * 2, CARD_H - (M + 14) * 2, R - 12);
  ctx.globalAlpha = 0.45;
  ctx.lineWidth = 1.5;
  ctx.stroke();
  ctx.restore();

  // Holo sheen across the card
  ctx.save();
  roundRect(ctx, M, M, CARD_W - M * 2, CARD_H - M * 2, R);
  ctx.clip();
  ctx.globalCompositeOperation = 'screen';
  const sheen = ctx.createLinearGradient(0, CARD_H * 0.15, CARD_W, CARD_H * 0.55);
  sheen.addColorStop(0, 'rgba(255,255,255,0)');
  sheen.addColorStop(0.45, 'rgba(255,255,255,0)');
  sheen.addColorStop(0.5, hexToRgba(rar.color, 0.1));
  sheen.addColorStop(0.55, 'rgba(255,255,255,0)');
  sheen.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = sheen;
  ctx.fillRect(0, 0, CARD_W, CARD_H);
  ctx.restore();

  return new Promise<Blob>((resolve, reject) => {
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('PNG export failed'))), 'image/png');
  });
}

function spacedLeft(ctx: CanvasRenderingContext2D, text: string, x: number, y: number, spacing: number) {
  let cx = x;
  for (const c of text) {
    ctx.fillText(c, cx, y);
    cx += ctx.measureText(c).width + spacing;
  }
}
