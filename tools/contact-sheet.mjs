/* ============================================================================
 * 联系表（contact sheet）—— 一眼看完一整支片
 * ----------------------------------------------------------------------------
 *   node tools/contact-sheet.mjs
 *   node tools/contact-sheet.mjs --count 40 --width 480 --out out/sheet
 *
 * 为什么要它：一支 3~4 分钟的片子，逐帧看太慢，只看几个点又容易漏。
 * 抽 30~40 帧铺成一张表，配合时间码、段落名、当前镜头，能快速审全片。
 *
 * 实现说明：Remotion 自带的 ffmpeg 是精简构建，**没有 tile / select / fps 滤镜**，
 * 所以没法用它直接拼图。这里改成逐帧抽图 + 生成一个 HTML 页面，
 * 用浏览器来拼版 —— 零依赖，而且还能顺带标注段落。
 * ==========================================================================*/
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const PROJ = path.join(HERE, '..');
const INPUT = path.join(PROJ, 'input');

const args = process.argv.slice(2);
const argOf = (n, d) => {
  const i = args.indexOf('--' + n);
  return i >= 0 && args[i + 1] ? args[i + 1] : d;
};
const film = path.resolve(argOf('film', path.join(PROJ, 'out', 'pv.mp4')));
const count = Math.max(4, Math.min(80, Number(argOf('count', 36))));
const width = Number(argOf('width', 480));
const outDir = path.resolve(argOf('out', path.join(PROJ, 'out', 'sheet')));

function readJson(p) {
  return JSON.parse(fs.readFileSync(p, 'utf8').replace(/^\uFEFF/, ''));
}
function findFfmpeg() {
  const base = path.join(PROJ, 'node_modules', '@remotion');
  for (const d of fs.existsSync(base) ? fs.readdirSync(base) : []) {
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
if (!fs.existsSync(film)) {
  console.error('✗ 找不到成片：' + film);
  process.exit(1);
}

const beats = readJson(path.join(INPUT, 'song.beats.json'));
const timeline = readJson(path.join(INPUT, 'timeline.json'));
const duration = beats.duration;
const sections = beats.sections || [];
const scenes = timeline.scenes || [];

const sceneAt = (t) => {
  const s = scenes.find((x) => t >= x.from && t < x.to);
  return s ? s.scene : '—';
};
const sectionAt = (t) => {
  let name = sections.length ? sections[0].name : '—';
  for (const s of sections) if (t >= s.t) name = s.name;
  return name;
};
const beatAt = (t) => {
  let n = 0;
  for (const b of beats.beats) if (b <= t) n++;
  return n;
};

fs.rmSync(outDir, { recursive: true, force: true });
fs.mkdirSync(outDir, { recursive: true });

function fmt(t) {
  const m = Math.floor(t / 60);
  const s = Math.floor(t % 60);
  return `${m}:${String(s).padStart(2, '0')}`;
}

console.log(`联系表：抽 ${count} 帧 / 成片 ${fmt(duration)} / 输出 ${path.relative(PROJ, outDir)}`);
const cards = [];
for (let i = 0; i < count; i++) {
  const t = ((i + 0.5) * duration) / count;
  const name = `frame-${String(i).padStart(3, '0')}.png`;
  const file = path.join(outDir, name);
  execFileSync(
    FFMPEG,
    [
      '-y', '-hide_banner', '-loglevel', 'error',
      '-ss', t.toFixed(3),
      '-i', film,
      '-frames:v', '1',
      '-vf', `scale=${width}:-2`,
      file,
    ],
    { stdio: ['ignore', 'inherit', 'inherit'] }
  );
  cards.push({
    name,
    t,
    time: fmt(t),
    section: sectionAt(t),
    scene: sceneAt(t),
    beat: beatAt(t),
  });
  process.stdout.write(`\r  抽帧 ${i + 1}/${count}`);
}
console.log('\n  写入 HTML…');

const html = `<!doctype html>
<html lang="zh-CN">
<head>
<meta charset="utf-8">
<title>联系表 · ${path.basename(film)}</title>
<style>
  body{margin:0;background:#0d1117;color:#e6edf3;font:14px/1.5 system-ui,"Microsoft YaHei",sans-serif}
  header{padding:16px 20px;border-bottom:1px solid #21262d;position:sticky;top:0;background:#0d1117cc;backdrop-filter:blur(8px)}
  h1{margin:0 0 4px;font-size:15px;font-weight:600}
  .meta{color:#7d8590;font-size:12px;font-family:Consolas,monospace}
  .grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(${width}px,1fr));gap:14px;padding:20px}
  .card{border:1px solid #21262d;border-radius:8px;overflow:hidden;background:#010409}
  .card img{display:block;width:100%;height:auto}
  .cap{display:flex;gap:10px;align-items:baseline;padding:7px 10px;font-family:Consolas,monospace;font-size:12px}
  .t{color:#e6edf3;font-weight:600}
  .sec{color:#58a6ff}
  .sc{color:#7d8590;margin-left:auto}
  .b{color:#3fb950}
</style>
</head>
<body>
<header>
  <h1>联系表 · ${path.basename(film)}</h1>
  <div class="meta">${count} 帧 / 总长 ${fmt(duration)} / ${beats.bpm} BPM / ${sections.length} 个段落 / ${scenes.length} 个镜头</div>
  <div class="meta">段落：${sections.map((s) => `${fmt(s.t)} ${s.name}`).join(' · ')}</div>
</header>
<div class="grid">
${cards
  .map(
    (c) => `  <div class="card">
    <img src="${path.relative(path.dirname(outDir + '.html'), path.join(outDir, c.name)).replace(/\\/g, '/')}" alt="${c.time}">
    <div class="cap"><span class="t">${c.time}</span><span class="sec">${c.section}</span><span class="b">拍 ${c.beat}</span><span class="sc">${c.scene}</span></div>
  </div>`
  )
  .join('\n')}
</div>
</body>
</html>
`;

const htmlPath = path.join(PROJ, 'out', 'sheet.html');
fs.writeFileSync(htmlPath, html, 'utf8');
console.log(`\n写出 ${path.relative(PROJ, htmlPath)}`);
console.log('用浏览器打开它就能一眼看完整支片。');
