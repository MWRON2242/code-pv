/* ============================================================================
 * 自动节拍检测 —— 给一首歌生成「打点表初稿」
 * ----------------------------------------------------------------------------
 * 用法：
 *   node tools/auto-beats.mjs input/song.mp3
 *   node tools/auto-beats.mjs input/song.mp3 --bpm 128 --out input/song.beats.json
 *
 * DSP 基础件在 tools/lib/audio.mjs，与「结构分析」工具共用一套，
 * 避免两个工具算出不一样的结果。
 *
 * 需要更深入的结构分析（段落划分、能量曲线、镜头配额建议）请用：
 *   node tools/analyze.mjs input/song.flac
 * ==========================================================================*/
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  SR,
  computeFeatures,
  decodeToWav,
  detectBeats,
  findFfmpeg,
  readWavMono,
} from './lib/audio.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const PROJ = path.join(HERE, '..');

const args = process.argv.slice(2);
if (!args.length || args[0].startsWith('--')) {
  console.error('用法: node tools/auto-beats.mjs <音频文件> [--bpm N] [--out 输出.json]');
  process.exit(1);
}
const inputPath = path.resolve(args[0]);
const argOf = (n, d) => {
  const i = args.indexOf('--' + n);
  return i >= 0 && args[i + 1] ? args[i + 1] : d;
};
const bpmHint = Number(argOf('bpm', NaN)) || null;
const outArg = argOf('out', null);

if (!fs.existsSync(inputPath)) {
  console.error('找不到文件: ' + inputPath);
  process.exit(1);
}

/* ------------------------------------------------------------------ 解码 */
const ff = findFfmpeg(PROJ);
if (!ff) {
  console.error('找不到 Remotion 自带的 ffmpeg.exe —— 请先 npm install');
  process.exit(1);
}
const tmpDir = path.join(PROJ, '.cache');
fs.mkdirSync(tmpDir, { recursive: true });
const wavPath = path.join(tmpDir, 'analysis.wav');

console.log('解码中… ' + path.basename(inputPath));
decodeToWav(ff, inputPath, wavPath, SR);

const { samples, sampleRate } = readWavMono(wavPath);
const duration = samples.length / sampleRate;
console.log(`  时长 ${duration.toFixed(2)} 秒 / ${sampleRate} Hz`);

/* ------------------------------------------------------------------ 分析 */
console.log('分频段提取起音强度…');
const features = computeFeatures(samples, sampleRate);

const result = detectBeats(features, { bpmHint });
console.log(`细化后 BPM ≈ ${result.bpm.toFixed(3)}（周期 ${result.period.toFixed(4)} 帧）`);
if (result.octaveCorrected) console.log('  已做八度修正（锁定到 80–160 BPM）');
if (result.beats.length && result.beats[0] === 0) console.log('  补上开头第 0 拍');

/* ------------------------------------------------- 段落初稿（粗略） */
function autoSections() {
  const win = 8;
  const wins = [];
  for (let t = 0; t < duration; t += win) {
    const s0 = Math.floor(t * sampleRate);
    const s1 = Math.min(samples.length, Math.floor((t + win) * sampleRate));
    let acc = 0;
    for (let i = s0; i < s1; i++) acc += samples[i] * samples[i];
    wins.push({ t: Number(t.toFixed(3)), rms: Math.sqrt(acc / Math.max(1, s1 - s0)) });
  }
  const mids = wins.slice(1, -1).map((w) => w.rms).sort((a, b) => a - b);
  const median = mids.length ? mids[Math.floor(mids.length / 2)] : 0;
  return wins.map((w, i) => {
    let name;
    if (i === 0) name = 'intro';
    else if (i === wins.length - 1) name = 'outro';
    else if (median > 0 && w.rms > median * 1.15) name = 'peak';
    else if (median > 0 && w.rms < median * 0.8) name = 'break';
    else name = 'main';
    return { t: w.t, name, note: '自动粗略检测，建议用 tools/analyze.mjs 做精细分段' };
  });
}

const sections = autoSections();
const base = path.basename(inputPath).replace(/\.[^.]+$/, '');
const out = {
  name: path.basename(inputPath),
  source: 'tools/auto-beats.mjs 自动检测（初稿，请用 tools/tapper 核对或微调）',
  bpm: result.bpm,
  spb: Number((60 / result.bpm).toFixed(6)),
  bars: Math.ceil(result.beats.length / 4),
  duration: Number(duration.toFixed(4)),
  sampleRate,
  beats: result.beats,
  downbeats: result.downbeats,
  phrases: result.phrases,
  sections,
};

const outPath = outArg ? path.resolve(outArg) : path.join(PROJ, 'input', base + '.beats.json');
fs.writeFileSync(outPath, JSON.stringify(out, null, 2));

console.log('');
console.log('写出：' + outPath);
console.log(`  拍点 ${out.beats.length} 个 · 小节约 ${out.bars} · 乐句 ${out.phrases.length} 个`);
console.log('  前 8 拍：' + out.beats.slice(0, 8).map((b) => b.toFixed(3)).join(', '));
console.log('');
console.log('下一步：');
console.log('  node tools/analyze.mjs <音频>   做精细结构分析（段落划分、能量曲线、镜头配额）');
console.log('  或打开 tools/tapper/index.html 人工核对节拍');
