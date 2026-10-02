/* ============================================================================
 * 彩排音轨 —— 一条「真实长度」的无版权测试歌
 * ----------------------------------------------------------------------------
 * 为什么需要它：
 *   原来那条测试音轨只有 25.5 秒、120 BPM、WAV 格式。
 *   真实歌曲会带来三个没验证过的变量：
 *     1. MP3 解码路径（编码器可能引入延迟，会让所有卡点整体偏移）
 *     2. 3~4 分钟的渲染长度（10 倍帧数，看会不会出问题）
 *     3. 不同的 BPM
 *   这条音轨把这三点一次性验掉，顺便让你看到真实长度下到底闷不闷。
 *
 * 用法：
 *   node tools/make-rehearsal-track.mjs
 * ==========================================================================*/
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Track, findFfmpeg, encodeMp3, NOTE } from './lib/synth.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const PROJ = path.join(HERE, '..');
const OUT = path.join(PROJ, 'input');

/* ------------------------------------------------------------------ 参数 */
const BPM = 128;
const SPB = 60 / BPM;
const BEATS_PER_BAR = 4;
const BAR = SPB * BEATS_PER_BAR; // 1.875 秒
const TAIL = 1.5; // 尾巴留给混响与收尾

/* 曲式：8 个段落，合计 112 小节 = 210 秒 = 3 分 30 秒 */
const PLAN = [
  { name: 'intro',   bars: 8,  drums: 1, bass: 0, lead: 0, pad: 0 },
  { name: 'verse1',  bars: 16, drums: 2, bass: 1, lead: 0, pad: 0 },
  { name: 'pre',     bars: 8,  drums: 3, bass: 1, lead: 0, pad: 1 },
  { name: 'chorus1', bars: 16, drums: 3, bass: 1, lead: 1, pad: 1 },
  { name: 'verse2',  bars: 16, drums: 2, bass: 1, lead: 0, pad: 1 },
  { name: 'break',   bars: 8,  drums: 0, bass: 0, lead: 1, pad: 1 },
  { name: 'chorus2', bars: 24, drums: 3, bass: 1, lead: 1, pad: 1 },
  { name: 'outro',   bars: 16, drums: 1, bass: 0, lead: 0, pad: 1 },
];
const TOTAL_BARS = PLAN.reduce((a, p) => a + p.bars, 0);

/* 和声：Am - F - C - G，一小节一个和弦 */
const PROG = [
  { root: NOTE.A2, chord: [NOTE.A3, NOTE.C4, NOTE.E4] },
  { root: NOTE.F2, chord: [NOTE.F3 * 2, NOTE.A3, NOTE.C4] },
  { root: NOTE.C3, chord: [NOTE.C4, NOTE.E4, NOTE.G4] },
  { root: NOTE.G2, chord: [NOTE.G3 * 2, NOTE.B3, NOTE.D4] },
];

/* 8 小节的主旋律动机（A 小调五声） */
const RIFF = [
  [0, 1, NOTE.A4], [1, 0.5, NOTE.C5], [1.5, 0.5, NOTE.E5], [2, 1, NOTE.D5], [3, 1, NOTE.C5],
  [4, 1, NOTE.A4], [5, 0.5, NOTE.C5], [5.5, 0.5, NOTE.D5], [6, 2, NOTE.E5],
  [8, 1, NOTE.F5], [9, 0.5, NOTE.E5], [9.5, 0.5, NOTE.D5], [10, 1, NOTE.C5], [11, 1, NOTE.A4],
  [12, 1, NOTE.G4], [13, 0.5, NOTE.A4], [13.5, 0.5, NOTE.C5], [14, 2, NOTE.D5],
  [16, 1, NOTE.E5], [17, 0.5, NOTE.D5], [17.5, 0.5, NOTE.C5], [18, 1, NOTE.A4], [19, 1, NOTE.C5],
  [20, 1, NOTE.D5], [21, 0.5, NOTE.C5], [21.5, 0.5, NOTE.A4], [22, 2, NOTE.G4],
  [24, 1, NOTE.A4], [25, 1, NOTE.C5], [26, 1, NOTE.E5], [27, 1, NOTE.G5],
  [28, 1, NOTE.E5], [29, 1, NOTE.D5], [30, 2, NOTE.C5],
];

/* ---------------------------------------------------------------- 生成 */
const totalSec = TOTAL_BARS * BAR + TAIL;
const track = new Track(totalSec);
const barT = (bar) => bar * BAR;

console.log(`生成彩排音轨：${BPM} BPM · ${TOTAL_BARS} 小节 · ${(TOTAL_BARS * BAR).toFixed(1)} 秒`);

let bar = 0;
const sections = [];
for (const sec of PLAN) {
  sections.push({
    t: Number(barT(bar).toFixed(4)),
    name: sec.name,
    note: `彩排音轨段落（${sec.bars} 小节）`,
  });

  for (let b = 0; b < sec.bars; b++, bar++) {
    const t0 = barT(bar);
    const chord = PROG[bar % 4];
    const lastBar = b === sec.bars - 1;

    /* 鼓 */
    if (sec.drums >= 1) {
      for (let k = 0; k < 4; k++) {
        // 最后一小节做个断奏，让段落边界听得出来
        if (lastBar && sec.drums >= 2 && k === 3) continue;
        track.kick(t0 + k * SPB, 0.95);
      }
    }
    if (sec.drums >= 2) {
      track.snare(t0 + 1 * SPB, 0.85);
      track.snare(t0 + 3 * SPB, 0.85);
    }
    if (sec.drums >= 2) {
      const div = sec.drums >= 3 ? 4 : 2;
      for (let e = 0; e < 4 * div; e++) {
        track.hat(t0 + (e * BEATS_PER_BAR * SPB) / (4 * div), e % div === 0 ? 0.8 : 0.45, e === 4 * div - 1 && lastBar);
      }
    }
    /* 加花：段落最后一小节的后半 */
    if (lastBar && sec.drums >= 2) {
      for (let s = 8; s < 16; s++) track.snare(t0 + (s * BEATS_PER_BAR * SPB) / 16, 0.3 + (s - 8) * 0.05);
    }
    /* 段落第一小节开头来一记擦音 */
    if (b === 0 && (sec.name === 'chorus1' || sec.name === 'chorus2' || sec.name === 'verse1')) {
      track.crash(t0, 0.8);
    }

    /* 贝斯：八分音符 */
    if (sec.bass) {
      for (let e = 0; e < 8; e++) {
        const f = e === 6 ? chord.root * 1.5 : chord.root;
        track.note(t0 + (e * SPB) / 2, SPB * 0.4, f, 0.8, 'bass');
      }
    }

    /* 铺底：整小节 */
    if (sec.pad) {
      chord.chord.forEach((f) => track.note(t0, BEATS_PER_BAR * SPB, f, sec.drums === 0 ? 0.62 : 0.42, 'pad'));
    }

    /* 主旋律：8 小节一循环 */
    if (sec.lead) {
      const base = (b % 8) * 4; // 本小节在动机里的拍偏移
      for (const [off, dur, f] of RIFF) {
        if (off < base || off >= base + 4) continue;
        track.note(t0 + (off - base) * SPB, dur * SPB, f, 0.4, 'lead');
      }
    }
  }
}

track.normalize(0.92);

const wavPath = path.join(OUT, 'rehearsal.wav');
const mp3Path = path.join(OUT, 'rehearsal.mp3');
const wavBytes = track.writeWav(wavPath);
console.log(`  WAV  ${(wavBytes / 1048576).toFixed(1)} MB`);

const ff = findFfmpeg(PROJ);
let mp3Bytes = 0;
if (ff) {
  mp3Bytes = encodeMp3(ff, wavPath, mp3Path, 192);
  console.log(`  MP3  ${(mp3Bytes / 1048576).toFixed(1)} MB（用来验证真实歌曲的解码路径）`);
} else {
  console.log('  ⚠ 找不到自带 ffmpeg，跳过 MP3');
}

/* ------------------------------------------------------- 标准答案（打点表） */
const totalBeats = TOTAL_BARS * BEATS_PER_BAR;
const beats = [];
for (let b = 0; b < totalBeats; b++) beats.push(Number((b * SPB).toFixed(4)));
const downbeats = beats.filter((_, i) => i % BEATS_PER_BAR === 0);
const phrases = downbeats.filter((_, i) => i % 2 === 0);

const answer = {
  name: 'rehearsal.wav',
  source: 'tools/make-rehearsal-track.mjs 生成（版权归你，随便用）',
  bpm: BPM,
  spb: Number(SPB.toFixed(6)),
  bars: TOTAL_BARS,
  // 时长取音频的真实长度（含收尾尾巴）—— 否则自检会报「音频与打点表时长不一致」
  duration: Number(track.duration.toFixed(4)),
  sampleRate: track.sr,
  beats,
  downbeats,
  phrases,
  sections,
};
const jsonPath = path.join(OUT, 'rehearsal.beats.json');
fs.writeFileSync(jsonPath, JSON.stringify(answer, null, 2));

console.log('');
console.log(`写出 ${jsonPath}`);
console.log(`  ${beats.length} 拍 · ${TOTAL_BARS} 小节 · ${sections.length} 个段落`);
console.log(`  段落：${sections.map((s) => s.name).join(' → ')}`);
console.log('');
console.log('验证：');
console.log(`  node tools/auto-beats.mjs input/rehearsal.wav --out .cache/reh-wav.json`);
console.log(`  node tools/auto-beats.mjs input/rehearsal.mp3 --out .cache/reh-mp3.json`);
console.log(`  node tools/compare-beats.mjs input/rehearsal.beats.json .cache/reh-wav.json`);
console.log(`  node tools/compare-beats.mjs input/rehearsal.beats.json .cache/reh-mp3.json`);
