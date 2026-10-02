/* ============================================================================
 * 歌词逐句时间草稿 —— 状态机触发点的前置
 * ----------------------------------------------------------------------------
 *   node tools/draft-lyric-timing.mjs
 *   node tools/draft-lyric-timing.mjs --from 16.562 --to 242.97
 *
 * 为什么需要它：
 *   规格（input/总线.txt）里 22 个崩坏状态的触发点全部钉在**某一句歌词**上。
 *   而目前项目里根本没有歌词时间轴。这份草稿先给出可用的大致时间，
 *   让引擎可以开工；再由用户用耳朵修正规格里点名的约 23 个**触发句**。
 *
 * 方法：
 *   1. 读 input/歌词与翻译.txt，按「中文翻译：」分成日语原文与中文两段
 *      —— 实测两段都是 67 行，一一对应（这很重要，它让中文匹配可靠）
 *   2. 把 67 行按时间**均匀铺开**在 [vocals, duration] 区间
 *   3. 按规格 §3/§4 列出的触发句，在中文行里做归一化匹配，标出触发点
 *
 * ⚠ 这是**草稿**：均匀铺开不考虑间奏、不考虑重复段落，会有累积漂移。
 *   触发句必须由用户核对；非触发句用草稿即可。
 *
 * ⚠ 歌词文本只写进 input/ 下的两个本地文件，不打印到控制台、不进笔记。
 * ==========================================================================*/
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const PROJ = path.join(HERE, '..');
const INPUT = path.join(PROJ, 'input');

const args = process.argv.slice(2);
const argOf = (n, d) => {
  const i = args.indexOf('--' + n);
  return i >= 0 && args[i + 1] ? args[i + 1] : d;
};

const lyricsFile = path.resolve(argOf('lyrics', path.join(INPUT, '歌词与翻译.txt')));
const beatsFile = path.join(INPUT, 'song.beats.json');
if (!fs.existsSync(lyricsFile)) {
  console.error('✗ 找不到歌词文件：' + lyricsFile);
  process.exit(1);
}
if (!fs.existsSync(beatsFile)) {
  console.error('✗ 找不到 input/song.beats.json');
  process.exit(1);
}
const beats = JSON.parse(fs.readFileSync(beatsFile, 'utf8').replace(/^\uFEFF/, ''));
const duration = beats.duration;
const sections = beats.sections || [];

/* ------------------------------------------------------------ 解析歌词 */
const raw = fs.readFileSync(lyricsFile, 'utf8').replace(/^\uFEFF/, '');
const allLines = raw.split(/\r?\n/);

const splitAt = allLines.findIndex((l) => /中文翻译|翻譯|translation/i.test(l));
if (splitAt < 0) {
  console.error('✗ 歌词文件里找不到「中文翻译：」分隔行，无法分成原文与译文两段');
  process.exit(1);
}

/** 去掉空白与常见标点，便于匹配 */
const norm = (s) =>
  String(s || '')
    .replace(/[\s\u3000]/g, '')
    .replace(/[，。、！？；：「」『』（）()\[\]…—―·~～!?.,;:'"“”‘’]/g, '');

function contentLines(arr) {
  return arr.map((l) => l.trim()).filter((l) => l && !l.startsWith('#'));
}

// 原文段：去掉开头的标题与艺人两行
const jpAll = contentLines(allLines.slice(0, splitAt));
const jp = jpAll.slice(2);
// 译文段：同样去掉开头的标题与艺人两行
const cnAll = contentLines(allLines.slice(splitAt + 1));
const cn = cnAll.slice(2);

console.log(`歌词解析：日语原文 ${jp.length} 行 / 中文翻译 ${cn.length} 行`);
if (jp.length !== cn.length) {
  console.log(
    `⚠ 两段行数不一致（${jp.length} vs ${cn.length}）—— 按较短的一方对齐，请人工核对`
  );
}
const n = Math.min(jp.length, cn.length);

/* ------------------------------------------------------- 时间：均匀铺开 */
const vocStart = Number(argOf('from', sections.length > 1 ? sections[1].t : 0));
const vocEnd = Number(argOf('to', duration));
const span = vocEnd - vocStart;
const per = span / n;

/* ------------------------------------------------------------ 锚点插值
 * 均匀铺开会有累积漂移（实测中段可能差几十秒）。
 * 但只要用户核对**少数几个锚点**，就能按锚点分段线性插值，
 * 精度远高于均匀铺开，而用户的听力成本从 23 次降到 7 次。
 *
 * 锚点有两个来源，优先级从高到低：
 *
 *   A) input/anchors.markers.json —— **推荐**
 *      直接用 tools/tapper/index.html 导出的文件，不用手抄数字。
 *      打法：打开打点器 → 拖入歌曲 → 照 lyric-anchors.txt 列的 7 句，
 *            听到每句开口时按 3（唱词）落点 → 导出 →
 *            把导出的 markers.json 放到 input/anchors.markers.json
 *      工具按**时间顺序**把打到的点依次对应到那 7 句上。
 *
 *   B) input/lyric-anchors.txt —— 手填
 *      格式：  行号  秒数        （行号是第几句歌词，纯数字）
 *
 * 两者都没有、或只有 1 个锚点时，退回均匀铺开。
 */
const ANCHOR_COUNT = 7;

/** 均匀挑出 ANCHOR_COUNT 句作为锚点（返回 1 起的行号） */
function anchorPickIndices() {
  const out = [];
  for (let k = 0; k < ANCHOR_COUNT; k++) {
    const idx = k === ANCHOR_COUNT - 1 ? n - 1 : Math.round((k * (n - 1)) / (ANCHOR_COUNT - 1));
    out.push(idx + 1);
  }
  return out;
}

const anchorFile = path.join(INPUT, 'lyric-anchors.txt');
const markersFile = path.resolve(argOf('markers', path.join(INPUT, 'anchors.markers.json')));

let anchors = [];
let anchorSource = '';

// A) 打点器导出的文件（免手抄）
if (fs.existsSync(markersFile)) {
  try {
    const m = JSON.parse(fs.readFileSync(markersFile, 'utf8').replace(/^\uFEFF/, ''));
    const arr = m.markers || m.beats || [];
    const times = arr
      .map((x) => (typeof x === 'number' ? x : x.t))
      .filter((x) => typeof x === 'number' && isFinite(x))
      .sort((a, b) => a - b);
    const picks = anchorPickIndices();
    const k = Math.min(times.length, picks.length);
    anchors = picks.slice(0, k).map((lineNo, idx) => ({ i: lineNo, t: times[idx] }));
    anchorSource = `${path.basename(markersFile)}（${times.length} 个打点）`;
    if (times.length !== picks.length) {
      console.log(
        `⚠ ${path.basename(markersFile)} 里有 ${times.length} 个点，锚点需要 ${picks.length} 个 —— ` +
          `按前 ${k} 个对应（请确认你是照 lyric-anchors.txt 的顺序打的）`
      );
    }
  } catch (e) {
    console.log(`⚠ 读 ${path.basename(markersFile)} 失败：${e.message} —— 改用 lyric-anchors.txt`);
  }
}

// B) 手填的锚点文件
if (!anchors.length && fs.existsSync(anchorFile)) {
  anchors = fs
    .readFileSync(anchorFile, 'utf8')
    .replace(/^\uFEFF/, '')
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l && !l.startsWith('#'))
    .map((l) => l.split(/\s+/))
    .filter((p) => p.length >= 2)
    .map((p) => ({ i: Number(p[0]), t: Number(p[1]) }))
    .filter((a) => isFinite(a.i) && isFinite(a.t) && a.i >= 1 && a.i <= n)
    .sort((a, b) => a.i - b.i);
  if (anchors.length) anchorSource = path.basename(anchorFile);
}

/** 第 i 句（1 起）的时间：有锚点就分段线性插值，否则均匀铺开 */
function timeForLine(i) {
  if (anchors.length < 2) return vocStart + (i - 0.5) * per;
  // 两端用整体区间的边界兜底；用户给了同号锚点则以用户的为准
  const pts = [{ i: 1, t: vocStart }, ...anchors, { i: n, t: vocEnd }].sort((a, b) => a.i - b.i);
  const dedup = [];
  for (const p of pts) {
    const last = dedup[dedup.length - 1];
    if (last && last.i === p.i) dedup[dedup.length - 1] = p; // 同号后者覆盖
    else dedup.push(p);
  }
  for (let k = 0; k < dedup.length - 1; k++) {
    const a = dedup[k];
    const b = dedup[k + 1];
    if (i >= a.i && i <= b.i) {
      const r = b.i === a.i ? 0 : (i - a.i) / (b.i - a.i);
      return a.t + (b.t - a.t) * r;
    }
  }
  return dedup[dedup.length - 1].t;
}

console.log(
  anchors.length >= 2
    ? `排布方法：按 ${anchorSource} 的 ${anchors.length} 个锚点分段线性插值`
    : `排布方法：均匀铺开（还没有锚点，见下）`
);

/* ------------------------------------------------------------ 触发句表
 * 摘自规格 §3 状态机总表 与 §4 逐段镜头表。
 * occurrence：同一句在歌词里出现多次时，取第几次（1 起）。 */
const TRIGGERS = [
  { phrase: '即使在心里划下一条线', occ: 1, label: 'S0→S1 错误日志' },
  { phrase: '是错的啊', occ: 1, label: 'S1→S2 红色归因' },
  { phrase: '都是你的错', occ: 1, label: 'S2→S3 全屏责任归属' },
  { phrase: '想了又想也想不明白', occ: 3, label: 'S3→S4 红色消退' },
  { phrase: '无法被满足的脑海深处', occ: 1, label: 'S4→S5 怪物开始变形' },
  { phrase: '像怪物一样的劣等感', occ: 1, label: 'S5 怪物完全体' },
  { phrase: '这不过是防卫本能', occ: 1, label: 'S5→S6 蜷缩成壳' },
  { phrase: '怎样都好吗都是你的错', occ: 1, label: 'S6→S7 壳裂渗出' },
  { phrase: '想了又想也想不明白', occ: 4, label: 'S7→S8 红色冷却' },
  { phrase: '光是活着就已经很痛苦了', occ: 1, label: 'S8 去饱和' },
  { phrase: '没有错啊', occ: 3, label: 'S8→S9 全白' },
  { phrase: '是错的啊我知道的啊', occ: 1, label: 'S9→S10 回光返照' },
  { phrase: '真实也好爱也好救赎也好温柔也好人生也好', occ: 1, label: 'S10→S11 逐字删除' },
  { phrase: '这不过是防卫本能', occ: 3, label: 'S11→S12 空壳' },
  { phrase: '怎样都好啦都是你的错', occ: 1, label: 'S12→S13 灰烬' },
  { phrase: '我也曾经有过信念', occ: 1, label: 'S14→S15 余烬' },
  { phrase: '如今却成了垃圾一样的念想', occ: 1, label: 'S15 碎裂堆叠' },
  { phrase: '无论多少次都想写下你', occ: 1, label: 'S16 写「君」循环' },
  { phrase: '能走红这件事', occ: 1, label: 'S17 流量归零' },
  { phrase: '曾经怎样都好', occ: 1, label: 'S17 归档' },
  { phrase: '是真的' , occ: 1, label: 'S18 三条日志' },
  { phrase: '所以我', occ: 1, label: 'S19 收拢' },
  { phrase: '所以我放弃了音乐', occ: 1, label: 'S20 标题展开' },
];

// 归一化后的中文行，供匹配
const cnNorm = cn.slice(0, n).map(norm);

const lines = [];
for (let i = 0; i < n; i++) {
  lines.push({
    i: i + 1,
    t: Number(timeForLine(i + 1).toFixed(4)),
    jp: jp[i] || '',
    cn: cn[i] || '',
    trigger: null,
  });
}

const problems = [];
for (const tr of TRIGGERS) {
  const key = norm(tr.phrase);
  const hits = [];
  for (let i = 0; i < n; i++) if (cnNorm[i].includes(key)) hits.push(i);
  if (!hits.length) {
    problems.push(`找不到触发句：${tr.label}`);
    continue;
  }
  const idx = hits[Math.min(tr.occ, hits.length) - 1];
  const line = lines[idx];
  if (line.trigger) line.trigger += ' / ' + tr.label;
  else line.trigger = tr.label;
  line.triggerIdx = idx + 1;
  if (hits.length < tr.occ) {
    problems.push(`${tr.label}：只找到 ${hits.length} 次，但需要第 ${tr.occ} 次`);
  }
}

lines.sort((a, b) => a.t - b.t);

/* ---------------------------------------------------------------- 写出 */
const outJson = path.join(INPUT, 'lyric-timing.json');
fs.writeFileSync(
  outJson,
  JSON.stringify(
    {
      _说明:
        '歌词逐句时间草稿。由 tools/draft-lyric-timing.mjs 生成。' +
        '非触发句按均匀铺开估算；带 trigger 标记的句子必须由用户用耳朵核对后修正。',
      _方法: `均匀铺开在 [${vocStart}, ${vocEnd}]，每行约 ${per.toFixed(3)} 秒`,
      _注意: '这是草稿，有累积漂移。修正时只改 t 字段即可，不需要动任何代码。',
      duration,
      vocalStart: Number(vocStart.toFixed(4)),
      vocalEnd: Number(vocEnd.toFixed(4)),
      lineCount: n,
      lines,
    },
    null,
    2
  ) + '\n',
  'utf8'
);
console.log(`\n写出 ${path.relative(PROJ, outJson)}`);

/* 触发句清单（给用户在打点器里核对用） */
const secAt = (t) => {
  let name = sections.length ? sections[0].name : '—';
  for (const s of sections) if (t >= s.t) name = s.name;
  return name;
};

const rows = lines.filter((l) => l.trigger);
const checklist = [
  '# 触发句核对清单',
  '',
  '用途：规格里 22 个崩坏状态的触发点都钉在这些歌词上。',
  '下面是**草稿估计**的时间。请用 tools/tapper/index.html 核对，把不对的时间改掉。',
  '',
  '核对方法：',
  '  1. 浏览器打开 tools/tapper/index.html，拖入同一首歌',
  '  2. 听歌，听到某一句开口时按 3（唱词类型）落点',
  '  3. 打完导出，把时间填回 input/lyric-timing.json 里对应行的 t 字段',
  '',
  '注意：t 是**这一句的起音时间**，不是「听到的时候」——要卡住第一个字。',
  '',
  `共 ${rows.length} 个触发点（草稿方法：${per.toFixed(2)} 秒/行均匀铺开，会有累积漂移）`,
  '',
  '─'.repeat(78),
  '',
];
for (const l of rows) {
  checklist.push(
    `第 ${String(l.i).padStart(2)} 句   草稿 ${l.t.toFixed(2).padStart(7)}s   落在段落 ${secAt(l.t).padEnd(10)}   ${l.trigger}`
  );
  checklist.push(`    原文：${l.jp}`);
  checklist.push(`    译文：${l.cn}`);
  checklist.push('');
}
checklist.push('─'.repeat(78));
checklist.push('');
checklist.push('改完之后：把 input/lyric-timing.json 里对应行的 t 改成你打的时间即可。');
checklist.push('不需要动任何代码——触发时间是数据。');

const outTxt = path.join(INPUT, 'trigger-checklist.txt');
fs.writeFileSync(outTxt, checklist.join('\n'), 'utf8');
console.log(`写出 ${path.relative(PROJ, outTxt)}`);

/* ---------------------------------------------------------- 锚点模板
 * 与其让用户核对全部 23 个触发点，不如只核对 7 个均匀分布的锚点，
 * 由工具分段插值。听力成本降到三分之一，而且精度更高（漂移不会累积）。 */
const anchorTemplate = path.join(INPUT, 'lyric-anchors.txt');
if (!fs.existsSync(anchorTemplate)) {
  const byI = [...lines].sort((a, b) => a.i - b.i);
  const picks = anchorPickIndices()
    .map((no) => byI[no - 1])
    .filter(Boolean);
  const body = [
    '# 歌词锚点',
    '#',
    '# ── 方法 A（推荐，不用手抄数字）──────────────────────────',
    '#   1. 浏览器打开 tools/tapper/index.html，拖入歌曲',
    '#   2. 照下面列出的句子，听到每句**第一个字**开口时按 3（唱词）落点',
    '#   3. 导出 markers.json，放到 input/anchors.markers.json',
    '#   4. 重跑：node tools/draft-lyric-timing.mjs',
    '#   工具会按时间顺序，把这些点依次对应到下面这几句上。',
    '#',
    '# ── 方法 B（手填）────────────────────────────────────',
    '#   把下面每行右边的秒数改成你听到的时间，然后重跑同一个命令。',
    '#',
    '# 格式说明：左边是**第几句歌词**（纯数字，不是标点符号），右边是秒数。',
    '#           # 开头的是注释，别删。',
    '#',
    `# 下面是按位置均匀挑的 ${picks.length} 句。`,
    '# 为什么是这 7 句：均匀铺开会有累积漂移，但分段插值后误差不再累积。',
    '# 如果听的时候发现某一段明显插错了（比如间奏之后），在那个位置多加一个锚点即可。',
    '',
  ];
  for (const l of picks) {
    body.push(`# 第 ${l.i} 句：${l.cn}`);
    body.push(`${l.i}  ${l.t.toFixed(2)}`);
    body.push('');
  }
  fs.writeFileSync(anchorTemplate, body.join('\n'), 'utf8');
  console.log(
    `写出 ${path.relative(PROJ, anchorTemplate)}（**建议先做这个**：改这 ${picks.length} 个数字，比核对全部 23 个触发点省事，而且更准）`
  );
}

/* ------------------------------------------------------------ 控制台摘要 */
console.log(`\n──────────────── 触发点摘要（${rows.length} 个）────────────────`);
console.log('  句号   草稿时间    所在段落      状态切换');
for (const l of rows) {
  console.log(
    `  ${String(l.i).padStart(3)}  ${l.t.toFixed(2).padStart(8)}s   ${secAt(l.t).padEnd(12)}  ${l.trigger}`
  );
}
if (problems.length) {
  console.log('\n⚠ 需要人工确认的：');
  problems.forEach((p) => console.log('  ' + p));
}
console.log(
  '\n歌词文本只写进了 input/lyric-timing.json 与 input/trigger-checklist.txt（本地），未打印到控制台。'
);
console.log('\n下一步：用户核对触发点后，引擎可以建在这份草稿上——触发时间是数据，改它不用改代码。');
