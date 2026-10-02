/* ============================================================================
 * 结构分析 —— 给一首歌出一份「客观结构报告」
 * ----------------------------------------------------------------------------
 *   node tools/analyze.mjs "input/某首歌.flac"
 *   node tools/analyze.mjs "input/某首歌.flac" --lyrics "input/歌词.txt"
 *
 * 产出两份东西：
 *   1. input/song.beats.json —— 打点表（含精细划分的段落，可直接给正片用）
 *   2. out/analysis.html     —— 结构报告：能量曲线、段落划分、段落相似度、
 *                               速度稳定性、镜头配额建议
 *
 * 它只做「客观结构」：速度、段落、能量、密度。
 * 艺术意图判断不了 —— 那是人的事。
 * ==========================================================================*/
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  SR,
  ENV_RATE,
  buildGrid,
  computeFeatures,
  decodeToWav,
  detectBeats,
  estimatePeriod,
  estimatePhase,
  findFfmpeg,
  readWavMono,
  toFrame,
  toSec,
} from './lib/audio.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const PROJ = path.join(HERE, '..');
const INPUT = path.join(PROJ, 'input');
const OUT = path.join(PROJ, 'out');

const args = process.argv.slice(2);
if (!args.length || args[0].startsWith('--')) {
  console.error('用法: node tools/analyze.mjs <音频文件> [--lyrics 歌词文件] [--shots 4]');
  process.exit(1);
}
const audioPath = path.resolve(args[0]);
const argOf = (n, d) => {
  const i = args.indexOf('--' + n);
  return i >= 0 && args[i + 1] ? args[i + 1] : d;
};
const lyricsPath = argOf('lyrics', null);
const shotCount = Number(argOf('shots', 4));

if (!fs.existsSync(audioPath)) {
  console.error('找不到音频：' + audioPath);
  process.exit(1);
}
const ff = findFfmpeg(PROJ);
if (!ff) {
  console.error('找不到 Remotion 自带的 ffmpeg.exe');
  process.exit(1);
}

/* ------------------------------------------------------------------ 解码 */
const cache = path.join(PROJ, '.cache');
fs.mkdirSync(cache, { recursive: true });
const wav = path.join(cache, 'analyze.wav');
console.log('解码中… ' + path.basename(audioPath));
decodeToWav(ff, audioPath, wav, SR);

const { samples, sampleRate } = readWavMono(wav);
const duration = samples.length / sampleRate;
console.log(`  ${duration.toFixed(2)} 秒 / ${sampleRate} Hz`);

/* ------------------------------------------------------------ 特征与拍点 */
console.log('提取频段能量与起音强度…');
const F = computeFeatures(samples, sampleRate);
console.log('检测节拍…');
const B = detectBeats(F);
console.log(`  BPM ≈ ${B.bpm.toFixed(2)} · ${B.beats.length} 拍 · ${B.downbeats.length} 小节`);

/* ------------------------------------------------- 节拍可信度与候选速度
 * 自相关有「八度歧义」：同一段音乐，125 / 62.5 / 250 BPM 的拍点听起来都可能对。
 * 机器没法替你决定，所以这里把候选列出来，并给出各自的「拍点抬升」，
 * 让你对着听一遍就能选。
 *   抬升 = 拍点处的平均起音强度 ÷ 全曲平均起音强度
 * 抬升明显大于 1 才说明这个网格真的踩在音头上了。 */
function gridLift(nov, period, phase) {
  let acc = 0;
  let c = 0;
  for (let t = phase; t < nov.length; t += period) {
    const i = Math.round(t);
    acc += Math.max(nov[i - 1] || 0, nov[i] || 0, nov[i + 1] || 0);
    c++;
  }
  const meanAtBeats = c ? acc / c : 0;
  let base = 0;
  for (let i = 0; i < nov.length; i++) base += nov[i];
  base = nov.length ? base / nov.length : 1;
  return base > 0 ? meanAtBeats / base : 0;
}
const tempoCandidates = [B.period / 2, B.period, B.period * 2]
  .filter((p) => p > 4 && (60 * ENV_RATE) / p >= 40 && (60 * ENV_RATE) / p <= 320)
  .map((p) => {
    const ph = estimatePhase(F.nov, p);
    return { period: p, bpm: (60 * ENV_RATE) / p, lift: gridLift(F.nov, p, ph), contrast: downbeatContrast(p, ph) };
  });

/**
 * 「强拍对比度」——比拍点抬升更能分辨八度。
 * 音乐里每 4 拍有一个强拍（底鼓落点）。如果某个周期是对的，
 * 那么按 4 分组之后，「强拍上的低频能量」应当明显高于其余拍。
 * 对比度接近 1 说明这个周期下 4/4 的分组是假的。
 */
function downbeatContrast(period, phase) {
  const beats = buildGrid(period, phase, duration)
    .map((g) => toSec(g.frame))
    .filter((t) => t >= 0 && t <= duration);
  if (beats.length < 16) return 0;
  const at = (t) => F.low[Math.round(toFrame(t))] || 0;
  let best = 0;
  for (let off = 0; off < 4; off++) {
    let on = 0;
    let onc = 0;
    let other = 0;
    let otherc = 0;
    beats.forEach((t, k) => {
      if ((k - off) % 4 === 0) {
        on += at(t);
        onc++;
      } else {
        other += at(t);
        otherc++;
      }
    });
    const ratio = on / Math.max(1, onc) / ((other / Math.max(1, otherc)) || 1);
    if (ratio > best) best = ratio;
  }
  return best;
}

/* ----------------------------------------------------- 小节级特征向量 */
const barStart = B.downbeats;
const nBars = Math.max(1, barStart.length - 1);
const fr = (t) => Math.max(0, Math.round(toFrame(t)));

function meanIn(arr, i0, i1) {
  let s = 0;
  let c = 0;
  for (let i = Math.max(0, i0); i < Math.min(arr.length, i1); i++) {
    s += arr[i];
    c++;
  }
  return c ? s / c : 0;
}

const bars = [];
for (let b = 0; b < nBars; b++) {
  const i0 = fr(barStart[b]);
  const i1 = fr(barStart[b + 1]);
  const low = meanIn(F.low, i0, i1);
  const mid = meanIn(F.mid, i0, i1);
  const high = meanIn(F.high, i0, i1);
  const rms = meanIn(F.full, i0, i1);

  // 起音密度：这一小节里起音强度超过阈值的帧数
  let onsets = 0;
  for (let i = i0; i < Math.min(i1, F.nov.length); i++) if (F.nov[i] > 0.28) onsets++;
  const span = Math.max(0.001, barStart[b + 1] - barStart[b]);

  const tot = low + mid + high || 1;
  bars.push({
    t: barStart[b],
    rms,
    lowRatio: low / tot,
    midRatio: mid / tot,
    highRatio: high / tot,
    onsetRate: onsets / span,
  });
}

/* 特征标准化（z-score），避免量纲差异让某一维主导 */
const FEATS = ['rms', 'lowRatio', 'midRatio', 'highRatio', 'onsetRate'];
const norm = {};
for (const f of FEATS) {
  const vals = bars.map((b) => b[f]);
  const m = vals.reduce((a, b) => a + b, 0) / vals.length;
  const sd = Math.sqrt(vals.reduce((a, b) => a + (b - m) ** 2, 0) / vals.length) || 1;
  norm[f] = bars.map((b) => (b[f] - m) / sd);
}

/* ---------------------------------------------------------- 段落划分 */
const K = 4; // 两侧各看 4 小节
const segScore = new Array(nBars).fill(0);
for (let i = K; i <= nBars - K; i++) {
  let acc = 0;
  for (const f of FEATS) {
    let a = 0;
    let b = 0;
    for (let j = i - K; j < i; j++) a += norm[f][j];
    for (let j = i; j < i + K; j++) b += norm[f][j];
    acc += ((a - b) / K) ** 2 * 2;
  }
  segScore[i] = Math.sqrt(acc);
}

// 目标段数：按「平均每段约 24 秒」估，夹在 6~12 段
const targetSegs = Math.max(6, Math.min(12, Math.round(duration / 24)));
const maxSegs = 14;
const minGap = 6; // 段落最短 6 小节

const candidates = [];
for (let i = K; i <= nBars - K; i++) if (segScore[i] > 0) candidates.push(i);
candidates.sort((a, b) => segScore[b] - segScore[a]);
let cuts = [];
for (const c of candidates) {
  if (cuts.length >= targetSegs - 1) break;
  if (cuts.some((x) => Math.abs(x - c) < minGap)) continue;
  cuts.push(c);
}
cuts.sort((a, b) => a - b);

/* 段落过长就再切一刀 ------------------------------------------------------
 * 只按「突变强度」取前 N 个切点，会留下特别长的段（那段里可能有真实的结构变化，
 * 只是突变没那么强）。这里再按「长度均匀」补切，避免出现 58 秒的"outro"。 */
for (let guard = 0; guard < maxSegs; guard++) {
  const bounds0 = [0, ...cuts, nBars];
  const lens = [];
  for (let i = 0; i < bounds0.length - 1; i++) lens.push(bounds0[i + 1] - bounds0[i]);
  const med = lens.slice().sort((a, b) => a - b)[Math.floor(lens.length / 2)] || 1;
  let best = -1;
  let bestScore = 0;
  for (let i = 0; i < bounds0.length - 1; i++) {
    if (bounds0[i + 1] - bounds0[i] <= med * 1.6) continue;
    for (let j = bounds0[i] + minGap; j <= bounds0[i + 1] - minGap; j++) {
      if (cuts.includes(j)) continue;
      if (segScore[j] > bestScore) {
        bestScore = segScore[j];
        best = j;
      }
    }
  }
  if (best < 0 || cuts.length >= maxSegs - 1) break;
  cuts.push(best);
  cuts.sort((a, b) => a - b);
}

const bounds = [0, ...cuts, nBars];
const sections = [];
for (let s = 0; s < bounds.length - 1; s++) {
  const b0 = bounds[s];
  const b1 = bounds[s + 1];
  const slice = bars.slice(b0, b1);
  const avg = (k) => slice.reduce((a, x) => a + x[k], 0) / slice.length;
  sections.push({
    start: barStart[b0],
    end: b1 < barStart.length ? barStart[b1] : duration,
    bars: b1 - b0,
    rms: avg('rms'),
    lowRatio: avg('lowRatio'),
    midRatio: avg('midRatio'),
    highRatio: avg('highRatio'),
    onsetRate: avg('onsetRate'),
  });
}

/* 命名：按位置与能量分位 */
// 第一段强制从 0 开始 —— 否则 0 到第一个强拍之间没有归属
sections[0].start = 0;
const rmsVals = sections.map((s) => s.rms).slice().sort((a, b) => a - b);
const q = (p) => rmsVals[Math.min(rmsVals.length - 1, Math.floor(rmsVals.length * p))];
const hiCut = q(0.7);
const loCut = q(0.3);
const nameCount = {};
for (let i = 0; i < sections.length; i++) {
  const s = sections[i];
  let base;
  if (i === 0) base = 'intro';
  else if (i === sections.length - 1) base = 'outro';
  else if (s.rms >= hiCut) base = 'chorus';
  else if (s.rms <= loCut) base = 'break';
  else base = 'verse';
  nameCount[base] = (nameCount[base] || 0) + 1;
  s.baseName = base;
}
const seen = {};
for (const s of sections) {
  seen[s.baseName] = (seen[s.baseName] || 0) + 1;
  s.name = nameCount[s.baseName] > 1 ? `${s.baseName}${seen[s.baseName]}` : s.baseName;
}

/* 名字覆盖：input/section-names.txt -----------------------------------------
 * 自动名只按能量分位给，分不出主歌与副歌（报告里已经说明过）。
 * 人听一遍把名字写进这个文件，比改代码好：名字是可再生的数据，不是代码。 */
const namesFile = path.join(INPUT, 'section-names.txt');
if (fs.existsSync(namesFile)) {
  const names = fs
    .readFileSync(namesFile, 'utf8')
    .replace(/^\uFEFF/, '')
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l && !l.startsWith('#'));
  if (names.length === sections.length) {
    sections.forEach((s, i) => {
      s.name = names[i];
    });
    console.log(`段落名已按 input/section-names.txt 覆盖（${names.length} 段）`);
  } else {
    console.log(
      `⚠ input/section-names.txt 有 ${names.length} 行，但分了 ${sections.length} 段 —— 退回自动命名`
    );
  }
}

/* ------------------------------------------------------ 段落相似度矩阵
 * 用**标准化后**的小节特征来算相似度，而不是原始值。
 * 原因：RMS 与三个频段占比全是正数，原始值的余弦相似度彼此都在 0.95 以上，
 * 根本分不出差异。标准化之后有正有负，重复段才会明显凸出来。 */
const secVec = sections.map((_, si) => {
  const b0 = bounds[si];
  const b1 = bounds[si + 1];
  return FEATS.map((f) => {
    let acc = 0;
    for (let j = b0; j < b1; j++) acc += norm[f][j];
    return acc / Math.max(1, b1 - b0);
  });
});
const sim = secVec.map((a) =>
  secVec.map((b) => {
    let dot = 0;
    let na = 0;
    let nb = 0;
    for (let i = 0; i < a.length; i++) {
      dot += a[i] * b[i];
      na += a[i] * a[i];
      nb += b[i] * b[i];
    }
    return dot / (Math.sqrt(na) * Math.sqrt(nb) || 1);
  })
);

/* 重复组：相似度高的段落归为一组 ------------------------------------------
 * 这是整份报告里最有用的一列 —— 它告诉你「第 4、8、12 段其实是同一段」，
 * 也就是歌曲的曲式。名字（verse/chorus）是猜的，分组是算出来的。 */
const GROUP_THRESHOLD = 0.72;
const groupOf = new Array(sections.length).fill(-1);
let nextGroup = 0;
for (let i = 0; i < sections.length; i++) {
  if (groupOf[i] >= 0) continue;
  groupOf[i] = nextGroup;
  for (let j = i + 1; j < sections.length; j++) {
    if (groupOf[j] >= 0) continue;
    if (sim[i][j] > GROUP_THRESHOLD) groupOf[j] = nextGroup;
  }
  nextGroup++;
}
const LETTERS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
sections.forEach((s, i) => {
  s.group = LETTERS[groupOf[i]] || '?';
  s.groupSize = groupOf.filter((g) => g === groupOf[i]).length;
});

/* --------------------------------------------------------- 速度稳定性 */
const tempoWindows = [];
const win = 30;
const step = 15;
for (let t0 = 0; t0 + win <= duration; t0 += step) {
  const i0 = fr(t0);
  const i1 = fr(t0 + win);
  const slice = F.nov.slice(i0, Math.min(i1, F.nov.length));
  if (slice.length < 200) continue;
  const p = estimatePeriod(slice);
  const bpm = (60 * ENV_RATE) / p;
  // 折算到 80~160 便于比较
  let b = bpm;
  while (b < 80) b *= 2;
  while (b > 160) b /= 2;
  tempoWindows.push({ t: t0, bpm: b });
}

/* --------------------------------------------------- 镜头配额建议 */
function proposeShots() {
  const idx = sections.map((_, i) => i);
  const hiIdx = new Set(
    [...idx].sort((a, b) => sections[b].rms - sections[a].rms).slice(0, Math.max(1, Math.round(sections.length * 0.25)))
  );
  const loIdx = new Set(
    [...idx].sort((a, b) => sections[a].rms - sections[b].rms).slice(0, Math.max(1, Math.round(sections.length * 0.2)))
  );
  return sections.map((s, i) => {
    if (i === 0) return 'player';
    if (i === sections.length - 1) return 'player';
    if (hiIdx.has(i)) return 'dash';
    if (loIdx.has(i)) return 'term';
    return 'chat';
  });
}
const shotPlan = proposeShots();
const shotTotals = {};
sections.forEach((s, i) => {
  const k = shotPlan[i];
  shotTotals[k] = (shotTotals[k] || 0) + (s.end - s.start);
});

/* ------------------------------------------------------------ 歌词结构 */
let lyricInfo = null;
if (lyricsPath && fs.existsSync(path.resolve(lyricsPath))) {
  const raw = fs.readFileSync(path.resolve(lyricsPath), 'utf8').replace(/^\uFEFF/, '');
  const lines = raw.split(/\r?\n/);
  // 译文部分以「中文翻译」之类的标记开头，只统计原文部分的结构
  const cutAt = lines.findIndex((l) => /中文翻译|翻譯|translation/i.test(l));
  const orig = (cutAt >= 0 ? lines.slice(0, cutAt) : lines).map((l) => l.trim());
  // 前两行通常是标题与艺人
  const body = orig.filter((l) => l && !l.startsWith('#'));
  const content = body.slice(cutAt >= 0 ? 2 : 2);
  const stanzas = [];
  let cur = 0;
  for (const l of orig) {
    if (!l) {
      if (cur > 0) stanzas.push(cur);
      cur = 0;
    } else cur++;
  }
  if (cur > 0) stanzas.push(cur);
  lyricInfo = {
    file: path.basename(path.resolve(lyricsPath)),
    lineCount: content.length,
    stanzas: stanzas.filter((n) => n > 1),
    hasTranslation: cutAt >= 0,
  };
}

/* ------------------------------------------------------------- 写出 JSON */
const outBeats = {
  name: path.basename(audioPath),
  source: 'tools/analyze.mjs 结构分析（含精细段落划分）',
  bpm: B.bpm,
  spb: Number((60 / B.bpm).toFixed(6)),
  bars: B.downbeats.length,
  duration: Number(duration.toFixed(4)),
  sampleRate,
  beats: B.beats,
  downbeats: B.downbeats,
  phrases: B.phrases,
  sections: sections.map((s) => ({
    t: Number(s.start.toFixed(4)),
    name: s.name,
    note: `${s.bars} 小节 · RMS ${s.rms.toFixed(4)} · 低频占比 ${(s.lowRatio * 100).toFixed(0)}% · 起音密度 ${s.onsetRate.toFixed(1)}/秒`,
  })),
};
const beatsOut = path.join(INPUT, 'song.beats.json');
fs.writeFileSync(beatsOut, JSON.stringify(outBeats, null, 2));
console.log(`\n写出 ${path.relative(PROJ, beatsOut)}`);

/* ------------------------------------------------------------- HTML 报告 */
const SHOT_COLORS = {
  player: '#ff5f9e',
  chat: '#1f6feb',
  term: '#3fb950',
  dash: '#ffbd2e',
};

const W = 1200;
const H = 220;
const PAD = 8;
// 能量曲线：把 full 抽成约 1400 点
const N = 1400;
const env = [];
for (let i = 0; i < N; i++) {
  const i0 = Math.floor((i / N) * F.full.length);
  const i1 = Math.max(i0 + 1, Math.floor(((i + 1) / N) * F.full.length));
  let m = 0;
  for (let j = i0; j < i1 && j < F.full.length; j++) if (F.full[j] > m) m = F.full[j];
  env.push(m);
}
const envMax = Math.max(...env) || 1;
const xOf = (t) => (t / duration) * W;
const envPath =
  `M0,${H} ` +
  env.map((v, i) => `L${((i / (N - 1)) * W).toFixed(1)},${(H - (v / envMax) * (H - PAD * 2)).toFixed(1)}`).join(' ') +
  ` L${W},${H} Z`;

const rmsMax = Math.max(...sections.map((s) => s.rms)) || 1;
const barsSvg = bars
  .map((b, i) => {
    const x = xOf(b.t);
    const w = Math.max(0.6, xOf(bars[i + 1] ? bars[i + 1].t : duration) - x);
    const h = (b.rms / rmsMax) * 90;
    return `<rect x="${x.toFixed(1)}" y="${(150 - h).toFixed(1)}" width="${w.toFixed(1)}" height="${h.toFixed(1)}" fill="#1f6feb" opacity="0.5"/>`;
  })
  .join('');

const secBands = sections
  .map((s, i) => {
    const x = xOf(s.start);
    const w = xOf(s.end) - x;
    const col = SHOT_COLORS[shotPlan[i]] || '#30363d';
    return `<rect x="${x.toFixed(1)}" y="0" width="${w.toFixed(1)}" height="${H}" fill="${col}" opacity="0.13"/>`;
  })
  .join('');

const secLabels = sections
  .map((s, i) => {
    const x = xOf(s.start) + 4;
    const w = xOf(s.end) - xOf(s.start);
    const label = w > 46 ? s.name : '';
    return label
      ? `<text x="${x.toFixed(1)}" y="${H - 6}" fill="#7d8590" font-size="11" font-family="Consolas,monospace">${label}</text>`
      : '';
  })
  .join('');

const secTicks = sections
  .map((s) => `<line x1="${xOf(s.start).toFixed(1)}" y1="0" x2="${xOf(s.start).toFixed(1)}" y2="${H}" stroke="#58a6ff" stroke-width="1" opacity="0.5"/>`)
  .join('');

const simCells = sim
  .map((row, i) =>
    row
      .map((v, j) => {
        const a = Math.max(0, Math.min(1, (v - 0.5) / 0.5));
        return `<rect x="${j * 26}" y="${i * 26}" width="24" height="24" fill="#1f6feb" opacity="${(a * 0.9 + 0.03).toFixed(2)}"/>`;
      })
      .join('') +
    `<text x="-4" y="${i * 26 + 17}" text-anchor="end" fill="#7d8590" font-size="10" font-family="Consolas,monospace">${sections[i].group} ${sections[i].name}</text>`
  )
  .join('');
const simLabels = sections
  .map((s, j) => `<text x="${j * 26 + 12}" y="-6" text-anchor="middle" fill="#7d8590" font-size="10" font-family="Consolas,monospace">${s.group}</text>`)
  .join('');

const fmt = (t) => `${Math.floor(t / 60)}:${String(Math.floor(t % 60)).padStart(2, '0')}`;
const pct = (x) => (x * 100).toFixed(0) + '%';

const html = `<!doctype html>
<html lang="zh-CN"><head><meta charset="utf-8">
<title>结构分析 · ${path.basename(audioPath)}</title>
<style>
 body{margin:0;background:#0d1117;color:#e6edf3;font:14px/1.6 system-ui,"Microsoft YaHei",sans-serif}
 .wrap{max-width:1280px;margin:0 auto;padding:28px 22px 80px}
 h1{font-size:19px;margin:0 0 6px}
 h2{font-size:15px;margin:34px 0 12px;color:#58a6ff;font-weight:600}
 .sub{color:#7d8590;font-size:12px;font-family:Consolas,monospace}
 .cards{display:flex;flex-wrap:wrap;gap:12px;margin:18px 0}
 .card{border:1px solid #21262d;border-radius:9px;padding:12px 16px;background:#0b0f14;min-width:126px}
 .card b{display:block;font-size:22px;font-family:Consolas,monospace;color:#e6edf3}
 .card span{color:#7d8590;font-size:11px}
 table{width:100%;border-collapse:collapse;font-size:12.5px;font-family:Consolas,monospace}
 th,td{padding:6px 9px;border-bottom:1px solid #21262d;text-align:left}
 th{color:#7d8590;font-weight:400}
 .pill{display:inline-block;padding:1px 8px;border-radius:9px;font-size:11px;color:#0d1117;font-weight:700}
 .note{border-left:3px solid #d29922;background:#161b22;padding:11px 15px;margin:14px 0;font-size:13px;color:#c9d1d9}
 .warn{border-left-color:#f85149}
 svg{display:block;background:#010409;border:1px solid #21262d;border-radius:8px}
</style></head><body><div class="wrap">

<h1>结构分析 · ${path.basename(audioPath)}</h1>
<div class="sub">由 tools/analyze.mjs 生成 · 只含客观测量，不含艺术判断</div>

<div class="cards">
  <div class="card"><b>${fmt(duration)}</b><span>总长</span></div>
  <div class="card"><b>${B.bpm.toFixed(1)}</b><span>BPM（约）</span></div>
  <div class="card"><b>${B.downbeats.length}</b><span>小节</span></div>
  <div class="card"><b>${sections.length}</b><span>段落</span></div>
  <div class="card"><b>${(rmsMax / (bars.reduce((a, b) => a + b.rms, 0) / bars.length)).toFixed(1)}×</b><span>峰值/平均能量</span></div>
  ${lyricInfo ? `<div class="card"><b>${lyricInfo.lineCount}</b><span>歌词句数</span></div>` : ''}
</div>

<h2>全曲时间轴</h2>
<div class="sub" style="margin-bottom:8px">底色＝建议镜头（<span class="pill" style="background:${SHOT_COLORS.player}">player</span>
<span class="pill" style="background:${SHOT_COLORS.chat}">chat</span>
<span class="pill" style="background:${SHOT_COLORS.term}">term</span>
<span class="pill" style="background:${SHOT_COLORS.dash}">dash</span>）· 蓝柱＝每小节能量 · 白线＝段落边界</div>
<svg width="${W}" height="${H + 26}" viewBox="0 0 ${W} ${H + 26}">
  <g>${secBands}</g>
  <g transform="translate(0,26)">${barsSvg}</g>
  <g transform="translate(0,26)">${secTicks}</g>
  <g>${secLabels}</g>
  <path d="${envPath}" transform="translate(0,26)" fill="#1f6feb" opacity="0.22" stroke="#58a6ff" stroke-width="1"/>
  ${[0, 0.25, 0.5, 0.75, 1].map((p) => `<text x="${(p * W).toFixed(0)}" y="${H + 22}" fill="#7d8590" font-size="10" font-family="Consolas,monospace" text-anchor="${p === 0 ? 'start' : p === 1 ? 'end' : 'middle'}">${fmt(p * duration)}</text>`).join('')}
</svg>

<h2>段落明细</h2>
<table>
<tr><th>#</th><th>组</th><th>暂定名</th><th>起</th><th>止</th><th>时长</th><th>小节</th><th>能量</th><th>低频</th><th>中频</th><th>高频</th><th>起音密度</th><th>建议镜头</th></tr>
${sections
  .map(
    (s, i) => `<tr>
  <td>${i + 1}</td><td><b>${s.group}</b></td><td>${s.name}</td>
  <td>${fmt(s.start)}</td><td>${fmt(s.end)}</td>
  <td>${(s.end - s.start).toFixed(1)}s</td><td>${s.bars}</td>
  <td>${(s.rms / rmsMax * 100).toFixed(0)}%</td>
  <td>${pct(s.lowRatio)}</td><td>${pct(s.midRatio)}</td><td>${pct(s.highRatio)}</td>
  <td>${s.onsetRate.toFixed(1)}/s</td>
  <td><span class="pill" style="background:${SHOT_COLORS[shotPlan[i]]}">${shotPlan[i]}</span></td>
</tr>`
  )
  .join('')}
</table>
<div class="note"><b>「组」是算出来的，「暂定名」是猜的。</b>
同一组的段落特征高度相似 —— 那通常就是「同一段落的重复」（副歌再现、主歌再现）。
暂定名（intro/verse/chorus/break）只按能量分位给，<b>很可能与真实曲式不符</b>，请对着听一遍再改名。
${sections.map((s) => `${s.group}=${sections.filter((x) => x.group === s.group).map((x) => sections.indexOf(x) + 1).join(',')}`).filter((v, i, a) => a.indexOf(v) === i).join(' · ')}</div>

<h2>镜头配额建议</h2>
<div class="sub" style="margin-bottom:8px">按「片头片尾用 player、能量最高处用 dash、最安静处用 term、其余交给 chat」的规则自动分配</div>
<table>
<tr><th>镜头</th><th>段落数</th><th>总时长</th><th>占比</th></tr>
${Object.entries(shotTotals)
  .sort((a, b) => b[1] - a[1])
  .map(
    ([k, v]) => `<tr><td><span class="pill" style="background:${SHOT_COLORS[k] || '#30363d'}">${k}</span></td>
  <td>${shotPlan.filter((x) => x === k).length}</td><td>${v.toFixed(1)}s</td><td>${((v / duration) * 100).toFixed(1)}%</td></tr>`
  )
  .join('')}
</table>
<div class="note">这份配额是**规则生成的草稿**，不是结论。它给你的作用是：一眼看出「某个镜头是不是只分到十几秒」
或者「某个镜头独占了三分之二时长」——那才是需要调整的地方。</div>

<h2>段落相似度</h2>
<div class="sub" style="margin-bottom:8px">越亮越相似。成块的亮区通常意味着「这是同一段落的重复」（副歌再现）</div>
<svg width="${sections.length * 26 + 90}" height="${sections.length * 26 + 24}" viewBox="-70 -14 ${sections.length * 26 + 90} ${sections.length * 26 + 24}">
  ${simCells}${simLabels}
</svg>

<h2>速度稳定性</h2>
<div class="sub" style="margin-bottom:8px">每 15 秒开一个 30 秒窗估计速度。基本平直＝节奏稳定，不用特殊处理</div>
<table>
<tr><th>起始</th>${tempoWindows.map((w) => `<th>${fmt(w.t)}</th>`).join('')}</tr>
<tr><td>BPM</td>${tempoWindows.map((w) => `<td>${w.bpm.toFixed(1)}</td>`).join('')}</tr>
</table>

${
  lyricInfo
    ? `<h2>歌词结构（只统计、不引用内容）</h2><table>
<tr><th>项</th><th>值</th></tr>
<tr><td>文件</td><td>${lyricInfo.file}</td></tr>
<tr><td>歌词句数（原文）</td><td>${lyricInfo.lineCount}</td></tr>
<tr><td>是否含译文</td><td>${lyricInfo.hasTranslation ? '是' : '否'}</td></tr>
<tr><td>分节（按空行）</td><td>${lyricInfo.stanzas.join(' / ')} 句</td></tr>
<tr><td>平均每句可用时长</td><td>${(duration / Math.max(1, lyricInfo.lineCount)).toFixed(2)} 秒</td></tr>
</table>
<div class="note">歌词与画面的对位需要**逐句时间**，而时间不会自己出现：
要么人工打点（${lyricInfo.lineCount} 句，用 tools/tapper 大约十几分钟），
要么接受「按段落均分」的近似。本报告不猜时间。</div>`
    : ''
}

<h2>速度候选（八度歧义）</h2>
<div class="sub" style="margin-bottom:8px">
自相关分不清「倍速」与「半速」——同一段音乐，下面这些速度的拍点听起来都可能对。
机器无法替你决定，请对着听一遍。
<b>抬升</b>＝拍点处的平均起音强度 ÷ 全曲平均，接近 1 说明拍点没踩在音头上。
</div>
<table>
<tr><th>BPM</th><th>拍点抬升</th><th>强拍对比度</th><th>判断</th></tr>
${tempoCandidates
  .map(
    (c) => `<tr><td>${c.bpm.toFixed(1)}</td><td>${c.lift.toFixed(2)}×</td><td>${c.contrast.toFixed(2)}×</td><td>${
      Math.abs(c.period - B.period) < 1e-6 ? '← 当前采用' : ''
    }</td></tr>`
  )
  .join('')}
</table>
<div class="note"><b>怎么读这张表</b>：<br>
<b>拍点抬升</b>＝拍点处的平均起音强度 ÷ 全曲平均。接近 1 说明拍点没踩在音头上。<br>
<b>强拍对比度</b>＝（强拍上的低频能量）÷（其余拍上的低频能量）。音乐每 4 拍有一个底鼓，
所以正确速度下这个值应当明显 &gt; 1；接近 1 说明 4/4 的分组是假的。<br>
两者都高才是「既踩在音头上、又能按 4 拍分组」的那个速度。</div>

<h2>这份报告没做什么</h2>
<div class="note warn">
<b>它只测量，不创作。</b> 段落划分是算法按「能量与音色的突变」切出来的，
名字（intro/verse/chorus/break）是按能量分位猜的，**很可能与歌曲真实的曲式不符**，
需要你对着听一遍再改名。<br><br>
速度是全局自相关的估计值，对变速、自由节奏的歌会失准；
歌词时间、和声、调性都没有涉及。
</div>

</div></body></html>
`;

const htmlOut = path.join(OUT, 'analysis.html');
fs.writeFileSync(htmlOut, html, 'utf8');
console.log(`写出 ${path.relative(PROJ, htmlOut)}`);

/* --------------------------------------------------------------- 控制台摘要 */
console.log('\n──────────────── 结构摘要 ────────────────');
console.log('  #  组 段落        起      止     时长   能量  低频  起音   建议镜头');
sections.forEach((s, i) => {
  console.log(
    `  ${String(i + 1).padStart(2)}  ${s.group} ${s.name.padEnd(10)} ${fmt(s.start).padStart(6)} ${fmt(s.end).padStart(6)} ` +
      `${(s.end - s.start).toFixed(0).padStart(5)}s ${((s.rms / rmsMax) * 100).toFixed(0).padStart(4)}% ` +
      `${(s.lowRatio * 100).toFixed(0).padStart(4)}% ${s.onsetRate.toFixed(1).padStart(5)}/s   ${shotPlan[i]}`
  );
});
console.log('\n  重复组（算出来的，比名字可靠）：');
[...new Set(sections.map((s) => s.group))].forEach((g) => {
  const idxs = sections.map((s, i) => (s.group === g ? i + 1 : null)).filter(Boolean);
  console.log(`    ${g}  第 ${idxs.join('、')} 段  共 ${idxs.length} 段`);
});
console.log('\n  镜头配额：');
Object.entries(shotTotals)
  .sort((a, b) => b[1] - a[1])
  .forEach(([k, v]) => {
    console.log(`    ${k.padEnd(7)} ${v.toFixed(0).padStart(4)}s  ${((v / duration) * 100).toFixed(1)}%`);
  });
console.log('\n  速度候选（自相关有八度歧义，机器无法替你决定）：');
console.log('     BPM    拍点抬升  强拍对比度');
tempoCandidates.forEach((c) => {
  const mark = Math.abs(c.period - B.period) < 1e-6 ? '  ← 当前采用' : '';
  console.log(
    `    ${c.bpm.toFixed(1).padStart(6)}   ${c.lift.toFixed(2).padStart(6)}×   ${c.contrast.toFixed(2).padStart(6)}×${mark}`
  );
});
console.log('    抬升接近 1 = 拍点没踩在音头上；强拍对比度接近 1 = 4/4 分组是假的。');

console.log('\n  打开 out/analysis.html 看完整报告。');
