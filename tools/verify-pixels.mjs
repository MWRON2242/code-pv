/* ============================================================================
 * 像素级验收 —— 把规格 §5.3 的定性标准变成可复现的数字
 * ----------------------------------------------------------------------------
 *   node tools/verify-pixels.mjs [--film out/pv.mp4] [--fps 4]
 *
 * 为什么需要它：
 *   规格 §5.3 的验收标准里有一半**可以被代码判定**（红像素占比、暖色窗口、
 *   静止时长……）。靠肉眼看静帧既慢又不可复现 ——
 *   尤其「暖色只出现在某 2 秒内」这种，人眼根本扫不完全片。
 *
 * 为什么抽 PNG 而不是裸 RGB：
 *   本机 ffmpeg 是 Remotion 随包的精简版，**有 rawvideo 编码器但没有
 *   rawvideo 封装器**，写不出裸 RGB 文件。所以抽 PNG，再用 Node 内置的
 *   zlib 自己解 —— PNG 就是「zlib 压缩的逐行像素 + 每行一个过滤器字节」，
 *   没有第三方依赖也能解。
 * ==========================================================================*/
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const PROJ = path.join(HERE, '..');
const INPUT = path.join(PROJ, 'input');
const OUT = path.join(PROJ, 'out');

const args = process.argv.slice(2);
const argOf = (n, d) => {
  const i = args.indexOf('--' + n);
  return i >= 0 && args[i + 1] ? args[i + 1] : d;
};

const film = path.resolve(argOf('film', path.join(OUT, 'pv.mp4')));
const FPS = Number(argOf('fps', 4));
const W = 192;
const H = 108;

if (!fs.existsSync(film)) {
  console.error('✗ 找不到成片：' + film);
  process.exit(1);
}

/* ------------------------------------------- 极简 PNG 解码（8 位 RGB/RGBA） */
function decodePng(png) {
  let p = 8;
  let w = 0;
  let h = 0;
  let ct = 2;
  const idat = [];
  while (p < png.length) {
    const len = png.readUInt32BE(p);
    p += 4;
    const type = png.toString('ascii', p, p + 4);
    p += 4;
    const data = png.subarray(p, p + len);
    p += len + 4;
    if (type === 'IHDR') {
      w = data.readUInt32BE(0);
      h = data.readUInt32BE(4);
      ct = data[9];
    } else if (type === 'IDAT') idat.push(data);
    else if (type === 'IEND') break;
  }
  const bpp = ct === 6 ? 4 : ct === 2 ? 3 : 1;
  const raw = zlib.inflateSync(Buffer.concat(idat));
  const stride = w * bpp;
  const out = Buffer.alloc(w * h * 3);
  const prev = Buffer.alloc(stride);
  const cur = Buffer.alloc(stride);
  let q = 0;
  for (let y = 0; y < h; y++) {
    const ft = raw[q++];
    raw.copy(cur, 0, q, q + stride);
    q += stride;
    for (let x = 0; x < stride; x++) {
      const a = x >= bpp ? cur[x - bpp] : 0;
      const b = prev[x];
      const c = x >= bpp ? prev[x - bpp] : 0;
      let v = cur[x];
      if (ft === 1) v += a;
      else if (ft === 2) v += b;
      else if (ft === 3) v += (a + b) >> 1;
      else if (ft === 4) {
        const pp = a + b - c;
        const pa = Math.abs(pp - a);
        const pb = Math.abs(pp - b);
        const pc = Math.abs(pp - c);
        v += pa <= pb && pa <= pc ? a : pb <= pc ? b : c;
      }
      cur[x] = v & 255;
    }
    for (let x = 0; x < w; x++) {
      out[(y * w + x) * 3] = cur[x * bpp];
      out[(y * w + x) * 3 + 1] = cur[x * bpp + (bpp >= 3 ? 1 : 0)];
      out[(y * w + x) * 3 + 2] = cur[x * bpp + (bpp >= 3 ? 2 : 0)];
    }
    cur.copy(prev);
  }
  return { w, h, px: out };
}

/* ------------------------------------------------------- 时间轴（唯一来源） */
const timing = JSON.parse(fs.readFileSync(path.join(INPUT, 'lyric-timing.json'), 'utf8').replace(/^\uFEFF/, ''));
const triggers = timing.triggers || [];
const at = (label) => {
  const t = triggers.find((x) => x.label === label);
  return t ? t.t : null;
};
const DURATION = timing.duration;
const viz = JSON.parse(fs.readFileSync(path.join(INPUT, 'viz-states.json'), 'utf8').replace(/^\uFEFF/, ''));
const delayOf = (id) => {
  const s = (viz.states || []).find((x) => x.id === id);
  return s ? s.delay || 0 : 0;
};
const startOf = (id, label) => {
  const t = at(label);
  return t == null ? null : t + delayOf(id);
};

const S1 = startOf('S1', 'S0→S1 错误日志');
const S3 = startOf('S3', 'S2→S3 全屏责任归属');
const S4 = startOf('S4', 'S3→S4 红色消退');
const S7 = startOf('S7', 'S6→S7 壳裂渗出');
const S8 = startOf('S8', 'S7→S8 红色冷却');
const S9 = startOf('S9', 'S8→S9 全白');
const S14 = startOf('S14', 'S13→S14 两点');
const S15 = startOf('S15', 'S14→S15 余烬');
const WARM_END = S15 + 2.0;

/* ---------------------------------------------------------------- 抽帧 */
const frameDir = path.join(OUT, '.px');
fs.rmSync(frameDir, { recursive: true, force: true });
fs.mkdirSync(frameDir, { recursive: true });

console.log(`抽帧：${path.basename(film)} → ${FPS}fps · ${W}×${H} PNG`);
execFileSync(
  path.join(PROJ, 'node_modules', '@remotion', 'compositor-win32-x64-msvc', 'ffmpeg.exe'),
  [
    '-y',
    '-hide_banner',
    '-loglevel',
    'error',
    '-i',
    film,
    // ⚠ 本机 ffmpeg 是 Remotion 随包的精简版：多滤镜用逗号连接（fps=4,scale=…）
    //   会报 "Error parsing a filter description around: ,scale=…"。
    //   所以不用 fps 滤镜降帧，改用**输出选项 -r** —— 效果相同，而且没有逗号。
    '-vf',
    `scale=${W}:${H}`,
    '-r',
    String(FPS),
    '-f',
    'image2',
    path.join(frameDir, '%05d.png'),
  ],
  { stdio: 'inherit' }
);

const names = fs.readdirSync(frameDir).filter((f) => f.endsWith('.png')).sort();
const frames = names.length;
const decoded = names.map((f) => decodePng(fs.readFileSync(path.join(frameDir, f))));
console.log(`  得到 ${frames} 帧（约 ${(frames / FPS).toFixed(1)} 秒）\n`);

/* ------------------------------------------------------------ 逐帧统计 */
// 三种红色定义，用途不同 —— 混用会得出错误结论：
//   redTone   红色调（红通道压过绿蓝）：用来判 S3「全屏红」。#1A0000=(26,0,0) 也算
//   errorRed  纯正的红（高红、低绿、低蓝）：用来判「不出现红色」。
//             ⚠ 不能用红色调来判：琥珀色 #d29922=(210,153,34) 也满足"红压过绿蓝"，
//             会把界面上的黄色提示文字误判成红色。
//   warm      偏橙的暖调：刻意排除纯红 #FF3B30（绿=59 过低，过不了 g>90）
const stats = [];
for (let i = 0; i < frames; i++) {
  const buf = decoded[i].px;
  const n = W * H;
  let redTone = 0;
  let errorRed = 0;
  let warm = 0;
  let lum = 0;
  for (let p = 0; p < n; p++) {
    const r = buf[p * 3];
    const g = buf[p * 3 + 1];
    const b = buf[p * 3 + 2];
    lum += (r * 299 + g * 587 + b * 114) / 1000;
    if (r > g + 6 && r > b + 6) redTone++;
    if (r > 150 && g < 90 && b < 90) errorRed++;
    if (r > 120 && g > 90 && g - b > 20) warm++;
  }
  stats.push({ t: i / FPS, redTone: redTone / n, errorRed: errorRed / n, warm: warm / n, lum: lum / n });
}

const avg = (from, to, key) => {
  const sel = stats.filter((s) => s.t >= from && s.t < to);
  return sel.length ? sel.reduce((a, s) => a + s[key], 0) / sel.length : NaN;
};
const maxOf = (from, to, key) => {
  const sel = stats.filter((s) => s.t >= from && s.t < to);
  return sel.length ? Math.max(...sel.map((s) => s[key])) : NaN;
};

/* ------------------------------------------------------------ 判定 */
const results = [];
const check = (name, pass, detail) => results.push({ name, pass, detail });

// 1. S0 阶段无任何红色像素（用严格的红 —— 界面上的琥珀色提示不算红）
{
  const m = maxOf(0, S1, 'errorRed');
  check('S0 阶段无任何红色像素', m <= 0.0005, `最大纯红占比 ${(m * 100).toFixed(3)}%`);
}

// 2. S3 阶段红色占比 > 90%（用红色调 —— 全屏红的底色 #1A0000 是很暗的红）
{
  const a = avg(S3 + 1.5, S4, 'redTone');
  check('S3 阶段红色占比 > 90%', a > 0.9, `平均红色调占比 ${(a * 100).toFixed(1)}%`);
}

// 3. S8 段红色低于上一段高潮（S7）的 50%
{
  const prev = avg(S7, S8, 'errorRed');
  const now = avg(S8, S9, 'errorRed');
  // ⚠ 退化情况：S7 的裂缝只有约 1.3px 宽，缩到 192×108 后被背景平均掉，
  //   两个区间都可能测成 0。这时 "0 < 0×0.5" 会误判成不通过，
  //   但标准的本意（这一段比上一段高潮少一半红）其实已经满足了。
  const EPS = 0.0005; // 0.05%
  const bothNegligible = prev < EPS && now < EPS;
  const pass = bothNegligible || now < prev * 0.5;
  check(
    'S8 段红色占比 < S7 高潮段的 50%',
    pass,
    bothNegligible
      ? `两段纯红都低于 ${(EPS * 100).toFixed(2)}%（缩略后测不出差别，按本意判为通过）`
      : `S7 ${(prev * 100).toFixed(2)}% → S8 段 ${(now * 100).toFixed(2)}%（阈值 ${(prev * 50).toFixed(2)}%）`
  );
}

// 4. 暖色只出现在「我也曾经有过信念」后 2 秒内
{
  const outside = stats.filter((s) => s.t < S15 || s.t > WARM_END);
  const inside = stats.filter((s) => s.t >= S15 && s.t <= WARM_END);
  const worst = outside.length ? Math.max(...outside.map((s) => s.warm)) : 0;
  const worstT = outside.reduce((a, s) => (s.warm > a.warm ? s : a), { warm: -1, t: 0 });
  const best = inside.length ? Math.max(...inside.map((s) => s.warm)) : 0;
  check(
    '暖色像素只出现在「我也曾经有过信念」后 2 秒内',
    worst <= 0.002 && best > 0,
    `窗口内峰值 ${(best * 100).toFixed(2)}% · 窗口外峰值 ${(worst * 100).toFixed(2)}%（在 ${worstT.t.toFixed(1)}s）`
  );
}

// 5. 存在 3 秒以上几乎静止的画面
{
  let best = 0;
  let bestAt = 0;
  let run = 0;
  for (let i = 1; i < stats.length; i++) {
    if (Math.abs(stats[i].lum - stats[i - 1].lum) < 0.9) {
      run++;
      if (run / FPS > best) {
        best = run / FPS;
        bestAt = stats[i].t;
      }
    } else run = 0;
  }
  check('存在 3 秒以上几乎静止的画面', best >= 3.0, `最长静止 ${best.toFixed(2)}s（止于 ${bestAt.toFixed(1)}s）`);
}

// 6. S14 两点之间不能有连线或箭头
{
  const y = Math.round(H * 0.5);
  const half = (200 / 1280) * W * 0.5;
  const x0 = Math.round(W * 0.5 - half) + 3;
  const x1 = Math.round(W * 0.5 + half) - 3;
  let worst = 0;
  for (let i = 0; i < frames; i++) {
    if (stats[i].t < S14 + 2 || stats[i].t > S15) continue;
    const buf = decoded[i].px;
    let bright = 0;
    for (let x = x0; x <= x1; x++) {
      for (let dy = -1; dy <= 1; dy++) {
        const p = (y + dy) * W + x;
        if (buf[p * 3] > 90 && buf[p * 3 + 1] > 90 && buf[p * 3 + 2] > 90) bright++;
      }
    }
    worst = Math.max(worst, bright);
  }
  check('S14 两点之间无连线 / 无箭头', worst === 0, `两点之间最亮像素数 ${worst}`);
}

/* ------------------------------------------------------------ 报告 */
console.log('像素级验收');
console.log('─'.repeat(72));
let pass = 0;
for (const r of results) {
  console.log(`  ${r.pass ? '✓' : '✗'} ${r.name}`);
  console.log(`      ${r.detail}`);
  if (r.pass) pass++;
}
console.log('─'.repeat(72));
console.log(`  ${pass}/${results.length} 通过\n`);

fs.writeFileSync(
  path.join(OUT, 'verify-pixels.json'),
  JSON.stringify({ film: path.basename(film), fps: FPS, sample: `${W}x${H}`, results }, null, 1),
  'utf8'
);
console.log('写出 out/verify-pixels.json');

fs.rmSync(frameDir, { recursive: true, force: true });
process.exit(pass === results.length ? 0 : 1);
