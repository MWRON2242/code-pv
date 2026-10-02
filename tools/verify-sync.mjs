/* ============================================================================
 * 音画同步验收 —— 用数字证明「音频没有被渲染管线挪动过」
 * ----------------------------------------------------------------------------
 *   node tools/verify-sync.mjs
 *   node tools/verify-sync.mjs --film out/film.mp4 --tolerance 10
 *
 * 为什么不能直接拿「成片音轨的拍点」和「打点表」比：
 *   节拍检测器本身在密集混音上就有约 10 毫秒的系统性偏差。
 *   直接比会把检测器的偏差算到渲染头上。
 *
 * 正确的做法是比「两次检测的差」：
 *   偏移_A = 检测(源音频)      − 打点表   ← 检测器的固有偏差
 *   偏移_B = 检测(成片音轨)    − 打点表   ← 检测器偏差 + 渲染引入的偏移
 *   ────────────────────────────────────
 *   B − A  = 渲染管线引入的偏移  ← 这才是要验收的量，应当接近 0
 *
 * 退出码 0 = 通过；1 = 超出容差。
 * ==========================================================================*/
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const PROJ = path.join(HERE, '..');
const INPUT = path.join(PROJ, 'input');
const CACHE = path.join(PROJ, '.cache');
const TMP = path.join(PROJ, '..', '.tmp-render');

const args = process.argv.slice(2);
const argOf = (name, def) => {
  const i = args.indexOf('--' + name);
  return i >= 0 && args[i + 1] ? args[i + 1] : def;
};
const filmPath = path.resolve(argOf('film', path.join(PROJ, 'out', 'pv.mp4')));
const toleranceMs = Number(argOf('tolerance', 10));

fs.mkdirSync(CACHE, { recursive: true });
fs.mkdirSync(TMP, { recursive: true });
const ENV = { ...process.env, TEMP: TMP, TMP };

function readJson(p) {
  return JSON.parse(fs.readFileSync(p, 'utf8').replace(/^\uFEFF/, ''));
}
function findFfmpeg() {
  const base = path.join(PROJ, 'node_modules', '@remotion');
  if (!fs.existsSync(base)) return null;
  for (const d of fs.readdirSync(base)) {
    if (!d.startsWith('compositor')) continue;
    const p = path.join(base, d, 'ffmpeg.exe');
    if (fs.existsSync(p)) return p;
  }
  return null;
}
const FFMPEG = findFfmpeg();
if (!FFMPEG) {
  console.error('✗ 找不到自带的 ffmpeg');
  process.exit(1);
}
if (!fs.existsSync(filmPath)) {
  console.error('✗ 找不到成片：' + filmPath + '（先跑 node tools/build.mjs delivery）');
  process.exit(1);
}

/* ------------------------------------------------------------------ 前置数据 */
const timeline = readJson(path.join(INPUT, 'timeline.json'));
const beatsPath = path.join(INPUT, 'song.beats.json');
if (!fs.existsSync(beatsPath)) {
  console.error('✗ 找不到 input/song.beats.json');
  process.exit(1);
}
const table = readJson(beatsPath);
const sourceAudio = path.join(PROJ, 'public', timeline.audio);
if (!fs.existsSync(sourceAudio)) {
  console.error('✗ 找不到源音频：public/' + timeline.audio);
  process.exit(1);
}

console.log('音画同步验收');
console.log(`  成片     ${path.relative(PROJ, filmPath)}`);
console.log(`  源音频   public/${timeline.audio}`);
console.log(`  打点表   input/song.beats.json（${table.beats.length} 拍）`);
console.log('');

/* ------------------------------------------------------------------ 工具 */
function durationOf(file) {
  try {
    const out = execFileSync(FFMPEG, ['-hide_banner', '-i', file], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    return parseDur(out);
  } catch (e) {
    return parseDur(String(e.stderr || ''));
  }
}
function parseDur(text) {
  const m = /Duration:\s*(\d+):(\d+):(\d+(?:\.\d+)?)/.exec(text);
  if (!m) return null;
  return Number(m[1]) * 3600 + Number(m[2]) * 60 + Number(m[3]);
}
function extractAudio(src, dst) {
  execFileSync(
    FFMPEG,
    ['-y', '-hide_banner', '-loglevel', 'error', '-i', src, '-vn', '-ac', '1', '-ar', '22050', '-c:a', 'pcm_s16le', dst],
    { stdio: ['ignore', 'inherit', 'inherit'] }
  );
}
function detect(wav, out) {
  execFileSync(process.execPath, [path.join(HERE, 'auto-beats.mjs'), wav, '--out', out], {
    cwd: PROJ,
    env: ENV,
    stdio: ['ignore', 'ignore', 'inherit'],
  });
  return readJson(out).beats;
}
function median(a) {
  if (!a.length) return 0;
  const s = [...a].sort((x, y) => x - y);
  const m = s.length >> 1;
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}
/** 逐个拍点找最近邻，返回「带符号偏差」的中位数（秒） */
function signedOffset(tableBeats, detected) {
  const ds = [...detected].sort((a, b) => a - b);
  const diffs = [];
  for (const t of tableBeats) {
    let best = ds[0];
    let bestD = Math.abs(best - t);
    // 二分
    let lo = 0;
    let hi = ds.length - 1;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if (ds[mid] < t) lo = mid + 1;
      else hi = mid;
    }
    for (const i of [lo, lo - 1, lo + 1]) {
      if (i >= 0 && i < ds.length) {
        const d = Math.abs(ds[i] - t);
        if (d < bestD) {
          bestD = d;
          best = ds[i];
        }
      }
    }
    diffs.push(best - t);
  }
  return {
    median: median(diffs),
    medianAbs: median(diffs.map(Math.abs)),
    max: Math.max(...diffs.map(Math.abs)),
  };
}

/* ------------------------------------------------------------------ 执行 */
console.log('1/4 抽出成片音轨…');
const filmWav = path.join(CACHE, 'sync-film.wav');
extractAudio(filmPath, filmWav);

console.log('2/4 抽出源音频…');
const srcWav = path.join(CACHE, 'sync-source.wav');
extractAudio(sourceAudio, srcWav);

console.log('3/4 两边各做一次节拍检测…');
const filmBeats = detect(filmWav, path.join(CACHE, 'sync-film.beats.json'));
const srcBeats = detect(srcWav, path.join(CACHE, 'sync-source.beats.json'));

console.log('4/4 比对…\n');

const offSrc = signedOffset(table.beats, srcBeats);
const offFilm = signedOffset(table.beats, filmBeats);

/* 时长核对 */
const dFilm = durationOf(filmPath);
const dFilmAudio = durationOf(filmWav);
const dSrc = durationOf(srcWav);

const fmtMs = (s) => (s * 1000).toFixed(1).padStart(7) + ' ms';

console.log('  ── 检测器固有偏差（源音频 vs 打点表）──');
console.log(`     中位绝对偏差 ${fmtMs(offSrc.medianAbs)}   系统偏移 ${fmtMs(offSrc.median)}`);
console.log('  ── 检测器偏差 + 渲染偏移（成片音轨 vs 打点表）──');
console.log(`     中位绝对偏差 ${fmtMs(offFilm.medianAbs)}   系统偏移 ${fmtMs(offFilm.median)}`);
console.log('');

const renderShift = offFilm.median - offSrc.median;
const renderShiftMs = renderShift * 1000;

console.log('  ── 结论 ──');
console.log(`     渲染管线引入的偏移 = ${renderShiftMs >= 0 ? '+' : ''}${renderShiftMs.toFixed(2)} ms`);
console.log('     （这是两次检测之差，检测器自身的偏差被抵消掉了）');
console.log('');

/* 时长核对 */
console.log('  ── 时长核对 ──');
console.log(`     成片总长       ${dFilm ? dFilm.toFixed(2) : '?'} 秒`);
console.log(`     成片音轨长度   ${dFilmAudio ? dFilmAudio.toFixed(2) : '?'} 秒`);
console.log(`     源音频长度     ${dSrc ? dSrc.toFixed(2) : '?'} 秒`);
console.log(`     打点表时长     ${table.duration.toFixed(2)} 秒`);
console.log('');

const problems = [];
if (Math.abs(renderShiftMs) > toleranceMs) {
  problems.push(
    `渲染引入的偏移 ${renderShiftMs.toFixed(2)} ms 超出容差 ${toleranceMs} ms —— 音画可能不同步`
  );
}
if (dSrc && dFilmAudio && dFilmAudio < dSrc - 0.15) {
  problems.push(`成片音轨比源音频短 ${(dSrc - dFilmAudio).toFixed(2)} 秒 —— 音频可能被截断`);
}
// 成片比源音频**长**是允许的：片尾署名需要在歌结束后留几秒无声画面。
// 但长太多说明时间轴出了问题，仍然报错。
if (dSrc && dFilmAudio && dFilmAudio > dSrc + 0.15) {
  const extra = dFilmAudio - dSrc;
  if (extra > 15) {
    problems.push(`成片音轨比源音频长 ${extra.toFixed(2)} 秒 —— 超出片尾署名的合理留白`);
  } else {
    console.log(`  ℹ 成片比源音频长 ${extra.toFixed(2)} 秒 —— 片尾署名的合法留白，不计为问题`);
    console.log('');
  }
}
if (dFilm && dFilmAudio && Math.abs(dFilm - dFilmAudio) > 0.1) {
  problems.push(`成片总长与音轨长度相差 ${Math.abs(dFilm - dFilmAudio).toFixed(2)} 秒`);
}

if (problems.length) {
  problems.forEach((p) => console.log('  ✗ ' + p));
  console.log('\n验收未通过。');
  process.exit(1);
}

console.log(`  ✓ 通过。渲染没有挪动音频（容差 ${toleranceMs} ms）`);
console.log('    一帧 @24fps = 41.7 ms，所以这个量级远小于人眼可辨。');
