/* ============================================================================
 * 对比两份打点表 —— 用途：核对「你手打的」和「自动检测的」差多少
 * ----------------------------------------------------------------------------
 * 用法：
 *   node tools/compare-beats.mjs input/song.beats.json input/song.markers.json
 *
 * 两份文件只要有 beats 或 markers 数组即可（打点器导出的 markers 也认）。
 * 报告：BPM、拍数、每个拍点到对方最近拍点的偏差分布。
 * ==========================================================================*/
import fs from 'node:fs';
import path from 'node:path';

const args = process.argv.slice(2);
if (args.length < 2) {
  console.error('用法: node tools/compare-beats.mjs <表A.json> <表B.json>');
  process.exit(1);
}

function loadTimes(file) {
  const j = JSON.parse(fs.readFileSync(path.resolve(file), 'utf8'));
  const arr = j.beats || j.markers;
  if (!Array.isArray(arr)) throw new Error('文件里没有 beats 或 markers 数组: ' + file);
  return arr
    .map((x) => (typeof x === 'number' ? x : x.t))
    .filter((x) => typeof x === 'number')
    .sort((a, b) => a - b);
}

function nearest(t, sorted) {
  // 二分找最近的
  let lo = 0;
  let hi = sorted.length - 1;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (sorted[mid] < t) lo = mid + 1;
    else hi = mid;
  }
  let best = sorted[lo];
  let bestD = Math.abs(best - t);
  for (const i of [lo - 1, lo + 1]) {
    if (i >= 0 && i < sorted.length) {
      const d = Math.abs(sorted[i] - t);
      if (d < bestD) {
        bestD = d;
        best = sorted[i];
      }
    }
  }
  return { value: best, dist: bestD };
}

function median(a) {
  if (!a.length) return 0;
  const s = [...a].sort((x, y) => x - y);
  const m = s.length >> 1;
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

const A = loadTimes(args[0]);
const B = loadTimes(args[1]);

console.log(`A = ${path.basename(args[0])}   ${A.length} 个点`);
console.log(`B = ${path.basename(args[1])}   ${B.length} 个点`);

if (A.length > 2) {
  const span = A[A.length - 1] - A[0];
  if (span > 0) console.log(`  A 平均间隔 ${(span / (A.length - 1)).toFixed(4)} 秒 → ${(60 / (span / (A.length - 1))).toFixed(2)} BPM`);
}
if (B.length > 2) {
  const span = B[B.length - 1] - B[0];
  if (span > 0) console.log(`  B 平均间隔 ${(span / (B.length - 1)).toFixed(4)} 秒 → ${(60 / (span / (B.length - 1))).toFixed(2)} BPM`);
}

// 以点少的一方为基准，逐点找对方最近的
const [base, other, baseName, otherName] =
  A.length <= B.length ? [A, B, 'A', 'B'] : [B, A, 'B', 'A'];

const dists = [];
const signed = [];
for (const t of base) {
  const { value, dist } = nearest(t, other);
  dists.push(dist);
  signed.push(value - t);
}

const mean = dists.reduce((a, b) => a + b, 0) / Math.max(1, dists.length);
const max = Math.max(...dists);
const within = (x) => dists.filter((d) => d <= x).length;

console.log('');
console.log(`以 ${baseName} 为基准逐点匹配 ${otherName}：`);
console.log(`  平均偏差 ${(mean * 1000).toFixed(1)} 毫秒`);
console.log(`  中位偏差 ${(median(dists) * 1000).toFixed(1)} 毫秒`);
console.log(`  最大偏差 ${(max * 1000).toFixed(1)} 毫秒`);
console.log(`  系统偏移（中位带符号） ${(median(signed) * 1000).toFixed(1)} 毫秒`);
console.log('');
console.log('  容差分布：');
for (const tol of [0.01, 0.02, 0.03, 0.05, 0.1]) {
  const n = within(tol);
  const pct = ((n / dists.length) * 100).toFixed(0);
  const barN = Math.round((n / dists.length) * 30);
  console.log(`    ≤ ${(tol * 1000).toString().padStart(3)} ms : ${String(n).padStart(4)}/${dists.length}  ${pct.padStart(3)}%  ${'#'.repeat(barN)}`);
}

console.log('');
console.log('判读：一帧 @24fps = 41.7 毫秒。中位偏差在半帧以内就算合格；');
console.log('      若系统偏移明显（比如总是 +30ms），说明其中一份有整体相位差，需要统一。');
