/* ============================================================================
 * 生成测试音轨 —— 零依赖，纯 Node 写 WAV
 * ----------------------------------------------------------------------------
 * 目的：在还没定歌之前，先造一段「版权完全干净」的音频（本脚本产出，
 *       属于你自己），把整条管线验通。
 *
 * 为什么是 120 BPM：每拍正好 0.5 秒，打点对不对一眼能看出来。
 * 同时输出一份「标准答案」(beats JSON)，用来核对你打点的准确度。
 *
 * 运行： node tools/make-test-track.mjs
 * ==========================================================================*/
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const OUT_DIR = path.join(HERE, '..', 'input');
fs.mkdirSync(OUT_DIR, { recursive: true });

/* ------------------------------------------------------------------ 参数 */
const SR = 44100;
const BPM = 120;
const SPB = 60 / BPM;            // 每拍 0.5 秒
const BEATS_PER_BAR = 4;
const BARS = 12;
const TOTAL_BEATS = BARS * BEATS_PER_BAR;   // 48 拍 = 24 秒
const DUR = TOTAL_BEATS * SPB + 1.5;        // 尾巴留点余量
const N = Math.ceil(DUR * SR);

const L = new Float32Array(N);
const R = new Float32Array(N);

/* 固定种子的伪随机，保证每次生成的噪声完全一样（可复现） */
let seed = 20260930;
function rnd() {
  seed = (seed * 1664525 + 1013904223) >>> 0;
  return (seed / 4294967296) * 2 - 1;
}

function mix(i, l, r) {
  if (i < 0 || i >= N) return;
  L[i] += l;
  R[i] += r;
}

/* ------------------------------------------------------------- 鼓组音色 */

function kick(t0, gain = 1) {
  const i0 = Math.round(t0 * SR);
  const len = Math.round(0.42 * SR);
  for (let i = 0; i < len; i++) {
    const tt = i / SR;
    const env = Math.exp(-tt * 11);
    // 频率从 140Hz 迅速滑到 45Hz
    const ph = 2 * Math.PI * (45 * tt + (95 / 32) * (1 - Math.exp(-tt * 32)));
    const s = Math.sin(ph) * env * gain;
    mix(i0 + i, s, s);
  }
}

function snare(t0, gain = 1, toneHz = 185) {
  const i0 = Math.round(t0 * SR);
  const len = Math.round(0.24 * SR);
  for (let i = 0; i < len; i++) {
    const tt = i / SR;
    const env = Math.exp(-tt * 26);
    const n = rnd();
    const tone = Math.sin(2 * Math.PI * toneHz * tt) * 0.5;
    const s = (n * 0.8 + tone) * env * gain * 0.7;
    mix(i0 + i, s, s);
  }
}

function hat(t0, gain = 1, open = false) {
  const i0 = Math.round(t0 * SR);
  const len = Math.round((open ? 0.18 : 0.05) * SR);
  let prev = 0;
  for (let i = 0; i < len; i++) {
    const tt = i / SR;
    const env = Math.exp(-tt * (open ? 20 : 70));
    const n = rnd();
    const hp = n - prev;          // 简易高通，得到"嘶"声
    prev = n;
    const s = hp * env * gain * 0.36;
    mix(i0 + i, s * 0.88, s);     // 轻微偏右
  }
}

/* --------------------------------------------------------------- 音高音色 */

function note(t0, dur, freq, gain = 1, kind = 'lead') {
  const i0 = Math.round(t0 * SR);
  const len = Math.round((dur + 0.25) * SR);
  let lp = 0;
  for (let i = 0; i < len; i++) {
    const tt = i / SR;
    let env;
    if (tt < dur) env = Math.min(1, tt / 0.012) * Math.exp(-tt * 2.6);
    else env = Math.exp(-tt * 2.6) * Math.exp(-(tt - dur) * 45);

    const ph = 2 * Math.PI * freq * tt;
    let s;
    if (kind === 'bass') {
      const saw = 2 * ((freq * tt) % 1) - 1;
      const raw = saw * 0.45 + Math.sin(ph) * 0.75;
      lp += (raw - lp) * 0.10;     // 一阶低通，让贝斯变厚不刺耳
      s = lp * env * gain;
    } else if (kind === 'lead') {
      s = (Math.sin(ph) * 0.6 + Math.sin(ph * 2) * 0.22 + Math.sin(ph * 3) * 0.1) * env * gain;
    } else {
      const a = Math.min(1, tt / 0.4);   // pad 慢起
      s = ((Math.sin(ph) + Math.sin(ph * 1.004) * 0.7 + Math.sin(ph * 0.996) * 0.7) / 2.4)
        * a * Math.exp(-tt * 0.85) * gain;
    }
    mix(i0 + i, s * 0.95, s);
  }
}

/* ------------------------------------------------------------------ 编排 */

const A2 = 110.00, C3 = 130.81, D3 = 146.83, E3 = 164.81, F3 = 174.61, G3 = 196.00;
const A3 = 220.00, C4 = 261.63, E4 = 329.63, A4 = 440.00, C5 = 523.25, D5 = 587.33, E5 = 659.25, G5 = 783.99;

const sections = [];
const beatTimes = [];
for (let b = 0; b < TOTAL_BEATS; b++) beatTimes.push(+(b * SPB).toFixed(4));

const barT = (bar) => bar * BEATS_PER_BAR * SPB;

/* 第 1–3 小节：只有底鼓 + 八分音符 hi-hat，像"开机" */
sections.push({ t: 0, name: 'intro', note: '只有鼓，画面可以很简单' });
for (let bar = 0; bar < 3; bar++) {
  for (let b = 0; b < 4; b++) kick(barT(bar) + b * SPB, 0.95);
  for (let e = 0; e < 8; e++) hat(barT(bar) + e * SPB / 2, e % 2 ? 0.5 : 0.85);
}

/* 第 4 小节：加花，为进入做准备（这是第一个自然的"切换点"） */
sections.push({ t: barT(3), name: 'fill', note: '加花，适合做镜头切换' });
for (let b = 0; b < 4; b++) kick(barT(3) + b * SPB, 0.9);
for (let s16 = 8; s16 < 16; s16++) snare(barT(3) + s16 * SPB / 4, 0.35 + (s16 - 8) * 0.045);

/* 第 5–8 小节：进贝斯 + 军鼓打 2、4 拍 */
sections.push({ t: barT(4), name: 'groove', note: '主体段落，节奏最清楚' });
const bassRoots = [A2, A2, F3 / 2, G3 / 2];   // Am - Am - F - G
for (let bar = 4; bar < 8; bar++) {
  const root = bassRoots[(bar - 4) % 4];
  for (let b = 0; b < 4; b++) kick(barT(bar) + b * SPB, 0.95);
  snare(barT(bar) + 1 * SPB, 0.85);
  snare(barT(bar) + 3 * SPB, 0.85);
  for (let e = 0; e < 8; e++) hat(barT(bar) + e * SPB / 2, e % 2 ? 0.45 : 0.8);
  for (let b = 0; b < 8; b++) {
    const f = b === 6 ? root * 1.5 : root;
    note(barT(bar) + b * SPB / 2, SPB * 0.4, f, 0.8, 'bass');
  }
}

/* 第 9–12 小节：加旋律 + 铺底，情绪抬起来 */
sections.push({ t: barT(8), name: 'melody', note: '旋律进来，适合做"高光"画面' });
const chords = [[A3, C4, E4], [A3, C4, E4], [F3, A3, C4], [G3, C3 * 2, D3 * 2]];
const riff = [
  [0, 1, A4], [1, 0.5, C5], [1.5, 0.5, E5], [2, 1, D5], [3, 0.5, C5], [3.5, 0.5, A4],
  [4, 1, G5], [5, 0.5, E5], [5.5, 0.5, D5], [6, 2, C5],
];
for (let bar = 8; bar < 12; bar++) {
  const idx = bar - 8;
  for (let b = 0; b < 4; b++) kick(barT(bar) + b * SPB, 0.95);
  snare(barT(bar) + 1 * SPB, 0.85);
  snare(barT(bar) + 3 * SPB, 0.85);
  for (let e = 0; e < 8; e++) hat(barT(bar) + e * SPB / 2, e % 2 ? 0.45 : 0.8);
  for (let b = 0; b < 8; b++) {
    const root = bassRoots[idx % 4];
    note(barT(bar) + b * SPB / 2, SPB * 0.4, root, 0.75, 'bass');
  }
  chords[idx % 4].forEach((f) => note(barT(bar), BEATS_PER_BAR * SPB, f, 0.5, 'pad'));
  if (idx >= 2) riff.forEach(([off, d, f]) => note(barT(idx < 2 ? bar : bar) + off * SPB, d * SPB, f, 0.42, 'lead'));
}
sections.push({ t: barT(11) + 3 * SPB, name: 'end', note: '收尾' });

/* ---------------------------------------------------- 归一化 + 软削波 */
let peak = 0;
for (let i = 0; i < N; i++) {
  const a = Math.abs(L[i]);
  const b = Math.abs(R[i]);
  if (a > peak) peak = a;
  if (b > peak) peak = b;
}
const g = peak > 0 ? 0.92 / peak : 1;
for (let i = 0; i < N; i++) {
  L[i] = Math.tanh(L[i] * g * 1.05);
  R[i] = Math.tanh(R[i] * g * 1.05);
}

/* ---------------------------------------------------------------- 写 WAV */
function writeWav(file, l, r, sr) {
  const n = l.length;
  const buf = Buffer.alloc(44 + n * 4);
  buf.write('RIFF', 0, 'ascii');
  buf.writeUInt32LE(36 + n * 4, 4);
  buf.write('WAVE', 8, 'ascii');
  buf.write('fmt ', 12, 'ascii');
  buf.writeUInt32LE(16, 16);
  buf.writeUInt16LE(1, 20);          // PCM
  buf.writeUInt16LE(2, 22);          // 立体声
  buf.writeUInt32LE(sr, 24);
  buf.writeUInt32LE(sr * 4, 28);     // 字节率
  buf.writeUInt16LE(4, 32);          // 块对齐
  buf.writeUInt16LE(16, 34);         // 位深
  buf.write('data', 36, 'ascii');
  buf.writeUInt32LE(n * 4, 40);
  let o = 44;
  for (let i = 0; i < n; i++) {
    buf.writeInt16LE(Math.round(Math.max(-1, Math.min(1, l[i])) * 32767), o); o += 2;
    buf.writeInt16LE(Math.round(Math.max(-1, Math.min(1, r[i])) * 32767), o); o += 2;
  }
  fs.writeFileSync(file, buf);
}

const wavPath = path.join(OUT_DIR, 'test-track.wav');
writeWav(wavPath, L, R, SR);

/* --------------------------------------------------- 标准答案（打点核对用） */
const beats = beatTimes;
const downbeats = beatTimes.filter((_, i) => i % BEATS_PER_BAR === 0);
const phrases = downbeats.filter((_, i) => i % 2 === 0);   // 每 2 小节一个"唱词"位

const answer = {
  name: 'test-track.wav',
  source: '本仓库 tools/make-test-track.mjs 生成（版权归你，随便用）',
  bpm: BPM,
  spb: +SPB.toFixed(6),
  bars: BARS,
  duration: +(N / SR).toFixed(4),
  sampleRate: SR,
  beats,
  downbeats,
  phrases,
  sections,
};
const jsonPath = path.join(OUT_DIR, 'test-track.beats.json');
fs.writeFileSync(jsonPath, JSON.stringify(answer, null, 2));

console.log('已生成：');
console.log('  ' + wavPath + '   ' + (fs.statSync(wavPath).size / 1048576).toFixed(2) + ' MB, ' + (N / SR).toFixed(2) + ' 秒');
console.log('  ' + jsonPath + '   ' + beats.length + ' 拍 / ' + BARS + ' 小节 / ' + phrases.length + ' 个乐句位');
console.log('标准答案：每拍间隔 ' + SPB.toFixed(3) + ' 秒（' + BPM + ' BPM）。打点时若偏离超过 ±0.03 秒就要注意。');
