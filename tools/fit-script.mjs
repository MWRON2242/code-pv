/* ============================================================================
 * 把纯文本排到节拍网格上 —— 不用再手写 JSON，也不用自己算时间
 * ----------------------------------------------------------------------------
 *   node tools/fit-script.mjs script      input/script.txt   → input/script.json
 *   node tools/fit-script.mjs lyrics      input/lyrics.txt   → input/lyrics.json
 *   node tools/fit-script.mjs timeline    input/timeline.txt → input/timeline.json
 *
 * 可选参数：
 *   --every N        每 N 个锚点放一行（script 默认 2，lyrics 默认 2）
 *   --anchor downbeat|beat|phrase   锚点用强拍 / 全部拍 / 乐句（默认 downbeat）
 *   --from 秒        只在这个时间之后排
 *   --to 秒          只在这个时间之前排
 *
 * 文本格式见 input/*.txt 文件头部的说明。任何一行都可以用 @时间 钉死。
 * ==========================================================================*/
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const PROJ = path.join(HERE, '..');
const INPUT = path.join(PROJ, 'input');

const args = process.argv.slice(2);
const mode = (args[0] || '').toLowerCase();

function flag(name, def) {
  const i = args.indexOf('--' + name);
  if (i < 0) return def;
  const v = args[i + 1];
  return v === undefined ? def : v;
}
function numFlag(name, def) {
  const v = flag(name, null);
  return v === null ? def : Number(v);
}
function fail(msg) {
  console.error('✗ ' + msg);
  process.exit(1);
}
function readJson(p) {
  return JSON.parse(fs.readFileSync(p, 'utf8').replace(/^\uFEFF/, ''));
}
function readTextLines(file) {
  if (!fs.existsSync(file)) fail('找不到 ' + path.relative(PROJ, file));
  return fs
    .readFileSync(file, 'utf8')
    .replace(/^\uFEFF/, '')
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l && !l.startsWith('#'));
}
function beatsFile() {
  // 固定认 song.beats.json（与 src/lib/song.ts 一致）；没有才退回最新的那个
  const fixed = path.join(INPUT, 'song.beats.json');
  if (fs.existsSync(fixed)) return fixed;
  const files = fs.readdirSync(INPUT).filter((f) => f.endsWith('.beats.json'));
  if (!files.length) fail('input/ 下没有 *.beats.json —— 先跑 node tools/build.mjs beats <音频>');
  files.sort(
    (a, b) => fs.statSync(path.join(INPUT, b)).mtimeMs - fs.statSync(path.join(INPUT, a)).mtimeMs
  );
  return path.join(INPUT, files[0]);
}
function writeJson(file, obj) {
  fs.writeFileSync(file, JSON.stringify(obj, null, 2) + '\n', 'utf8');
}

/* ------------------------------------------------------------------ 锚点 */
const beats = readJson(beatsFile());
const anchorKind = String(flag('anchor', 'downbeat'));
const allAnchors =
  anchorKind === 'beat' ? beats.beats : anchorKind === 'phrase' ? beats.phrases : beats.downbeats;
if (!Array.isArray(allAnchors) || !allAnchors.length) fail('打点表里没有可用的锚点：' + anchorKind);

/**
 * 默认排布区间取自分镜表里**对应的那个镜头**：
 *   - 台词排给 chat 镜头（聊天窗口）
 *   - 歌词排给 player 镜头（播放器页）
 * 否则会排到镜头还没出现的时间上，那些行永远不会被看到。
 */
/**
 * 某个镜头在分镜表里出现的**所有时间窗口**。
 *
 * 为什么不能只取第一个：这一版分镜里 chat 出现在 5 个不连续的位置
 * （副歌与终端的段落它根本不可见）。如果只按第一段排，
 * 台词会被全部挤进第一个窗口，后面几段一句都没有。
 */
function sceneWindows(kind) {
  const tp = path.join(INPUT, 'timeline.json');
  if (!fs.existsSync(tp)) return null;
  try {
    const tl = readJson(tp);
    const ws = (tl.scenes || [])
      .filter((s) => s.scene === kind && isFinite(s.from) && isFinite(s.to))
      .map((s) => [s.from, s.to])
      .sort((a, b) => a[0] - b[0]);
    return ws.length ? ws : null;
  } catch (e) {
    return null;
  }
}

const rangeKind = mode === 'lyrics' ? 'player' : 'chat';
const windows = mode === 'timeline' ? null : sceneWindows(rangeKind);
const inWindow = (t) => !windows || windows.some(([a, b]) => t >= a && t <= b);

const fromDefault = mode === 'timeline' ? 0 : windows ? windows[0][0] : 0;
const toDefault = mode === 'timeline'
  ? beats.duration
  : windows
    ? windows[windows.length - 1][1]
    : beats.duration;

const from = numFlag('from', fromDefault);
const to = numFlag('to', toDefault);
const anchors = allAnchors.filter((t) => t >= from && t <= to && inWindow(t));

const windowSeconds = windows
  ? windows.reduce((a, [x, y]) => a + (y - x), 0)
  : to - from;

console.log(`打点表   ${path.basename(beatsFile())}`);
console.log(`锚点     ${anchorKind} · ${anchors.length} 个（${from} ~ ${to} 秒）`);
if (windows && args.indexOf('--from') < 0 && mode !== 'timeline') {
  console.log(
    `         （只取 ${rangeKind} 镜头可见的时间：${windows.length} 个窗口，合计 ${windowSeconds.toFixed(1)} 秒；可用 --from / --to 覆盖）`
  );
}

/* --------------------------------------------------------------- 公共排布 */
/**
 * 把 items 依次放到锚点上。
 * 带 pin 的行用自己钉死的时间，且**不消耗锚点**（方便偶尔手动微调）。
 */
function place(items, every, label) {
  let cursor = 0;
  const placed = [];
  let pinned = 0;
  let exhausted = 0;

  for (const it of items) {
    let t;
    if (typeof it.pin === 'number' && isFinite(it.pin)) {
      t = it.pin;
      pinned++;
    } else {
      if (cursor >= anchors.length) {
        exhausted++;
        continue;
      }
      t = anchors[cursor];
      cursor += every;
    }
    placed.push({ ...it, t: Number(t.toFixed(4)) });
  }

  placed.sort((a, b) => a.t - b.t);

  // 顺序检查
  const ooo = [];
  for (let i = 1; i < placed.length; i++) {
    if (placed[i].t < placed[i - 1].t) ooo.push(i);
  }

  console.log(
    `排布     ${label}：${placed.length} 行 · 钉死 ${pinned} 行 · 每 ${every} 个锚点一行` +
      (exhausted ? ` · ⚠ 有 ${exhausted} 行没排进去（锚点不够，把 --every 调小）` : '')
  );
  if (ooo.length) console.log(`         ⚠ 有 ${ooo.length} 处时间不是递增的，检查 @时间 是否写错`);
  return placed;
}

/* ------------------------------------------------------------- script 模式 */
function doScript() {
  const file = path.join(INPUT, 'script.txt');
  if (!fs.existsSync(file)) {
    fs.writeFileSync(
      file,
      [
        '# 聊天台词表',
        '# 格式：  说话人 文本',
        '#   you = 你（右侧气泡）   her = 她（左侧气泡）  也可写 我 / 她',
        '# 想钉死某一行的时间：  her@18.5 这句话出现在 18.5 秒',
        '# 以 # 开头的行会被忽略。排布默认每 2 个强拍一行，可用 --every 调整。',
        '',
        'you 你好',
        'her 你好。我在。',
        'you 你现在在做什么？',
        'her 在等你说话。',
        'you ……为什么要等我？',
        'her 因为你每次都会回来。',
        '',
      ].join('\n'),
      'utf8'
    );
    console.log('已生成模板 input/script.txt —— 按格式填好后重新运行本命令。');
    return;
  }

  const items = [];
  for (const line of readTextLines(file)) {
    const m = /^(you|her|我|她)(?:@([0-9.]+))?\s+(.+)$/.exec(line);
    if (!m) {
      console.log(`  ⚠ 跳过无法解析的行：${line}`);
      continue;
    }
    const who = m[1] === '我' ? 'you' : m[1] === '她' ? 'her' : m[1];
    items.push({ from: who, text: m[3].trim(), pin: m[2] ? Number(m[2]) : null });
  }
  if (!items.length) fail('script.txt 里没有可用的台词');

  const every = numFlag('every', 2);
  const placed = place(items, every, '台词');

  writeJson(path.join(INPUT, 'script.json'), {
    _说明: '由 tools/fit-script.mjs 从 script.txt 生成；改文本请改 script.txt 再重跑',
    _时序: `锚点=${anchorKind}，每 ${every} 个锚点一行`,
    messages: placed.map((p) => ({ t: p.t, from: p.from, text: p.text })),
  });
  console.log('写出     input/script.json');
}

/* ------------------------------------------------------------- lyrics 模式 */
function doLyrics() {
  const file = path.join(INPUT, 'lyrics.txt');
  if (!fs.existsSync(file)) {
    fs.writeFileSync(
      file,
      [
        '# 歌词表',
        '# 格式：  一行一句歌词',
        '# 想钉死时间：  @12.5 这一句从 12.5 秒开始',
        '# 想同时指定时长：@12.5,3.2 这一句持续 3.2 秒',
        '# 以 # 开头的行会被忽略。排布默认每 2 个强拍一行，可用 --every 调整。',
        '#',
        '# 注意：歌词文本的版权由你自己把关，本项目不提供任何第三方歌词。',
        '',
        '世界 正在 加载',
        '我在 这里 等你',
        '每一次 回答',
        '都是一次 执行',
        '',
      ].join('\n'),
      'utf8'
    );
    console.log('已生成模板 input/lyrics.txt —— 按格式填好后重新运行本命令。');
    return;
  }

  const items = [];
  for (const line of readTextLines(file)) {
    const m = /^(?:@([0-9.]+)(?:,([0-9.]+))?\s+)?(.+)$/.exec(line);
    if (!m) continue;
    items.push({
      text: m[3].trim(),
      pin: m[1] ? Number(m[1]) : null,
      pinDur: m[2] ? Number(m[2]) : null,
    });
  }
  if (!items.length) {
    // 空文件是合法状态：本片 player 镜头做纯标题卡，不显示歌词。
    // 直接写一个空的 lines 数组，而不是报错退出 —— 否则每次流程都会卡在这里。
    writeJson(path.join(INPUT, 'lyrics.json'), {
      _说明: '由 tools/fit-script.mjs 从 lyrics.txt 生成；当前为空 = 不显示歌词',
      _时序: `锚点=${anchorKind}，每 ${numFlag('every', 2)} 个锚点一行`,
      lines: [],
    });
    console.log('排布     歌词：0 行（lyrics.txt 里没有内容 —— 按「不显示歌词」处理）');
    console.log('写出     input/lyrics.json');
    return;
  }

  const every = numFlag('every', 2);
  const placed = place(items, every, '歌词');

  // 时长 = 到下一句的间隔（可被 @时间,时长 覆盖）
  // 最后一句则延伸到所在镜头的结尾，避免它一直挂在屏幕上
  const lines = placed.map((p, i) => {
    const next = placed[i + 1];
    const auto = next ? next.t - p.t : Math.max(1.5, to - p.t);
    const dur = p.pinDur != null ? p.pinDur : Math.max(1, Math.min(8, auto));
    return { t: p.t, dur: Number(dur.toFixed(4)), text: p.text };
  });

  writeJson(path.join(INPUT, 'lyrics.json'), {
    _说明: '由 tools/fit-script.mjs 从 lyrics.txt 生成；改文本请改 lyrics.txt 再重跑',
    _时序: `锚点=${anchorKind}，每 ${every} 个锚点一行`,
    lines,
  });
  console.log('写出     input/lyrics.json');
}

/* ----------------------------------------------------------- timeline 模式 */
function doTimeline() {
  const file = path.join(INPUT, 'timeline.txt');
  const current = path.join(INPUT, 'timeline.json');
  if (!fs.existsSync(file)) {
    const base = fs.existsSync(current)
      ? readJson(current)
      : { song: 'song', audio: 'audio/song.wav', fps: 24 };
    fs.writeFileSync(
      file,
      [
        '# 分镜表',
        '# 格式：  镜头 起 止 [淡入] [淡出]',
        '#   镜头可选：player = 播放器歌词页（方向 D）   chat = 聊天窗口（方向 A）',
        '# 两段的 from/to 相接且各有淡入淡出时，中间会经过黑场 —— 这是刻意的。',
        '# 不要让两段重叠去做交叉溶解：本片两个镜头版式差异太大，叠起来是重影（会变成文字压文字）。',
        '',
        'player 0.0 8.0 0.6 0.5',
        'chat 8.0 25.5 0.5 0.8',
        '',
      ].join('\n'),
      'utf8'
    );
    console.log('已生成模板 input/timeline.txt —— 按格式填好后重新运行本命令。');
    console.log(`（音频与帧率将沿用：${base.audio} / ${base.fps}fps）`);
    return;
  }

  const scenes = [];
  for (const line of readTextLines(file)) {
    const p = line.split(/\s+/);
    if (p.length < 3) {
      console.log(`  ⚠ 跳过格式不对的行：${line}`);
      continue;
    }
    const [scene, fromS, toS, inS, outS] = p;
    const s = {
      id: `${scene}${scenes.length + 1}`,
      scene,
      from: Number(fromS),
      to: Number(toS),
    };
    if (inS !== undefined) s.fadeIn = Number(inS);
    if (outS !== undefined) s.fadeOut = Number(outS);
    if (!isFinite(s.from) || !isFinite(s.to)) {
      console.log(`  ⚠ 跳过时间不是数字的行：${line}`);
      continue;
    }
    scenes.push(s);
  }
  if (!scenes.length) fail('timeline.txt 里没有可用的分镜');

  const base = fs.existsSync(current) ? readJson(current) : {};
  const out = {
    _说明: '由 tools/fit-script.mjs 从 timeline.txt 生成；改分镜请改 timeline.txt 再重跑',
    _镜头可选值: 'player = 播放器歌词页（方向 D）；chat = 聊天窗口（方向 A）',
    song: base.song || path.basename(String(base.audio || 'song.wav')),
    audio: base.audio || 'audio/song.wav',
    fps: base.fps || 24,
    scenes,
  };
  writeJson(current, out);

  // 覆盖度检查
  const sorted = [...scenes].sort((a, b) => a.from - b.from);
  console.log(`排布     分镜：${scenes.length} 段 → ${scenes.map((s) => s.scene).join(' → ')}`);
  if (sorted[0].from > 0.01) console.log(`         ⚠ 从 ${sorted[0].from} 秒才开始，开头会黑场`);
  if (sorted[sorted.length - 1].to < beats.duration - 0.01) {
    console.log(`         ⚠ 到 ${sorted[sorted.length - 1].to} 秒就结束，但歌有 ${beats.duration.toFixed(2)} 秒`);
  }
  for (let i = 1; i < sorted.length; i++) {
    if (sorted[i].from > sorted[i - 1].to + 0.01) {
      console.log(`         ⚠ ${sorted[i - 1].id} 与 ${sorted[i].id} 之间有空洞`);
    }
  }
  console.log('写出     input/timeline.json');
}

/* -------------------------------------------------------------------- 入口 */
switch (mode) {
  case 'script':
    doScript();
    break;
  case 'lyrics':
    doLyrics();
    break;
  case 'timeline':
    doTimeline();
    break;
  default:
    console.error('用法: node tools/fit-script.mjs <script|lyrics|timeline> [选项]');
    console.error('  选项: --every N  --anchor downbeat|beat|phrase  --from 秒  --to 秒');
    process.exit(1);
}

console.log('\n下一步：node tools/build.mjs check   （自检数据是否自洽）');
