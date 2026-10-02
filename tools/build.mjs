/* ============================================================================
 * 出片流水线 —— 一条命令跑完
 * ----------------------------------------------------------------------------
 *   node tools/build.mjs check      自检：数据文件之间是否自洽
 *   node tools/build.mjs beats      自动节拍检测 → input/<歌名>.beats.json
 *   node tools/build.mjs delivery   渲染交付版 → out/pv.mp4（h264 720p）
 *   node tools/build.mjs verify     音画同步验收（对成片音轨做节拍检测并比对）
 *   node tools/build.mjs master     渲染无损母版 → out/pv-master.mov（ProRes 4444）
 *   node tools/build.mjs master-lite 渲染轻量母版 → out/pv-master-lite.mp4（h264 CRF 1）
 *   node tools/build.mjs 4k         从交付版放大 → out/pv_4k.mp4
 *   node tools/build.mjs all        check → delivery → verify → master
 *
 * ⚠ 输出文件名为什么是 pv.mp4 而不是 film.mp4：
 *   本机 GUI 会持有「展示过的视频文件」的句柄，导致 Remotion 最后的重命名
 *   以 EPERM 失败（白渲染一场）。safeOutput() 会在检测到占用时自动换名，
 *   但为了让交付物名字稳定，规范名统一用 pv.*
 *
 * 它会自己把 TEMP/TMP 指到工作区内的 .tmp-render，
 * 否则 ffmpeg 写系统临时目录会被沙箱拒绝。
 * ==========================================================================*/
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const PROJ = path.join(HERE, '..');
const OUT = path.join(PROJ, 'out');
const INPUT = path.join(PROJ, 'input');
const TMP = path.join(PROJ, '..', '.tmp-render');

const CLI = path.join(PROJ, 'node_modules', '@remotion', 'cli', 'remotion-cli.js');
const FFMPEG = findFfmpeg();

fs.mkdirSync(OUT, { recursive: true });
fs.mkdirSync(TMP, { recursive: true });

const ENV = { ...process.env, TEMP: TMP, TMP };

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

function run(cmd, args, label) {
  process.stdout.write(`\n▶ ${label || cmd + ' ' + args.join(' ')}\n`);
  const t0 = Date.now();
  try {
    execFileSync(cmd, args, { cwd: PROJ, env: ENV, stdio: 'inherit' });
  } catch (e) {
    console.error(`\n✗ 失败：${label || cmd}\n`);
    process.exit(1);
  }
  console.log(`✓ 完成，用时 ${((Date.now() - t0) / 1000).toFixed(1)} 秒`);
}

function remotion(args) {
  run(process.execPath, [CLI, ...args]);
}

/* --------------------------------------------------------------- 工具函数 */

const BEATS_FILE = path.join(INPUT, 'song.beats.json');

function readJson(p) {
  return JSON.parse(fs.readFileSync(p, 'utf8'));
}

/**
 * 当前生效的打点表。
 * 固定用 input/song.beats.json —— 这样换歌不用改代码
 * （src/lib/song.ts 里 import 的就是这个固定文件名）。
 */
function findBeatsFile() {
  if (fs.existsSync(BEATS_FILE)) return BEATS_FILE;
  const files = fs.readdirSync(INPUT).filter((f) => f.endsWith('.beats.json'));
  if (!files.length) return null;
  files.sort(
    (a, b) =>
      fs.statSync(path.join(INPUT, b)).mtimeMs - fs.statSync(path.join(INPUT, a)).mtimeMs
  );
  return path.join(INPUT, files[0]);
}

function audioDuration(file) {
  if (!FFMPEG || !fs.existsSync(file)) return null;
  try {
    const out = execFileSync(FFMPEG, ['-hide_banner', '-i', file], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    return parseDur(out);
  } catch (e) {
    // ffmpeg 把信息写在 stderr 并以非 0 退出，属正常
    return parseDur(String(e.stderr || ''));
  }
}

function parseDur(text) {
  const m = /Duration:\s*(\d+):(\d+):(\d+(?:\.\d+)?)/.exec(text);
  if (!m) return null;
  return Number(m[1]) * 3600 + Number(m[2]) * 60 + Number(m[3]);
}

/* ------------------------------------------------------------------ check */
function check() {
  console.log('自检开始…\n');
  const problems = [];
  const warnings = [];

  const timelinePath = path.join(INPUT, 'timeline.json');
  const scriptPath = path.join(INPUT, 'script.json');
  const lyricsPath = path.join(INPUT, 'lyrics.json');

  for (const [p, name] of [
    [timelinePath, 'timeline.json'],
    [scriptPath, 'script.json'],
    [lyricsPath, 'lyrics.json'],
  ]) {
    if (!fs.existsSync(p)) problems.push(`缺少 ${name}`);
  }
  const beatsPath = findBeatsFile();
  if (!beatsPath) problems.push('input/ 下没有 *.beats.json（先跑 node tools/build.mjs beats）');
  if (problems.length) {
    problems.forEach((p) => console.log('  ✗ ' + p));
    process.exit(1);
  }

  const timeline = readJson(timelinePath);
  const beats = readJson(beatsPath);
  const script = readJson(scriptPath);
  const lyrics = readJson(lyricsPath);
  const duration = beats.duration;

  console.log(`  打点表     ${path.basename(beatsPath)}`);
  console.log(`  时长       ${duration.toFixed(2)} 秒 · ${beats.beats.length} 拍 · ${beats.bpm} BPM`);

  // 音频：public/ 下必须有，input/ 下有副本更保险
  const audioPublic = path.join(PROJ, 'public', timeline.audio);
  if (!fs.existsSync(audioPublic)) {
    problems.push(`public/${timeline.audio} 不存在（Remotion 的 staticFile 只认 public/）`);
  } else {
    const d = audioDuration(audioPublic);
    console.log(`  音频       public/${timeline.audio}${d ? ` · 实际时长 ${d.toFixed(2)} 秒` : ''}`);
    if (d && Math.abs(d - duration) > 0.15) {
      warnings.push(
        `音频实际时长 ${d.toFixed(2)} 秒与打点表 ${duration.toFixed(2)} 秒相差 ${Math.abs(d - duration).toFixed(2)} 秒 —— 确认是不是换了歌没更新打点表`
      );
    }
  }

  // 分镜表覆盖度
  const scenes = timeline.scenes || [];
  if (!scenes.length) problems.push('timeline.json 里没有 scenes');
  scenes.forEach((s, i) => {
    if (typeof s.from !== 'number' || typeof s.to !== 'number') {
      problems.push(`scenes[${i}] (${s.id}) 缺 from/to`);
    } else if (s.from >= s.to) {
      problems.push(`scenes[${i}] (${s.id}) 的 from 不小于 to`);
    }
    if (!['chat', 'player', 'term', 'dash'].includes(s.scene)) {
      warnings.push(`scenes[${i}] 的 scene="${s.scene}" 不在已知镜头表（chat / player / term / dash）里`);
    }
  });
  const sorted = [...scenes].sort((a, b) => a.from - b.from);
  if (sorted.length) {
    if (sorted[0].from > 0.01) warnings.push(`分镜从 ${sorted[0].from} 秒才开始，开头会有黑场`);
    const last = sorted[sorted.length - 1];
    if (last.to < duration - 0.01) {
      warnings.push(`分镜到 ${last.to} 秒就结束了，但歌有 ${duration.toFixed(2)} 秒 —— 结尾会黑屏`);
    }
    for (let i = 1; i < sorted.length; i++) {
      if (sorted[i].from > sorted[i - 1].to + 0.01) {
        warnings.push(
          `分镜之间有空洞：${sorted[i - 1].id} 结束于 ${sorted[i - 1].to}，${sorted[i].id} 从 ${sorted[i].from} 才开始`
        );
      }
      // 时间重叠且镜头不同 → 两层同时渲染。版式差异大时就是文字压文字的重影。
      if (sorted[i].from < sorted[i - 1].to - 0.01 && sorted[i].scene !== sorted[i - 1].scene) {
        warnings.push(
          `${sorted[i - 1].id}(${sorted[i - 1].scene}) 与 ${sorted[i].id}(${sorted[i].scene}) 时间重叠 ` +
            `${(sorted[i - 1].to - sorted[i].from).toFixed(2)} 秒 —— 不同镜头之间只能硬切或黑场，` +
            `溶解只允许同镜头用（否则会重影）`
        );
      }
    }
  }

  // 台词与歌词是否落在时长内
  const lateMsgs = script.messages.filter((m) => m.t > duration);
  if (lateMsgs.length) warnings.push(`${lateMsgs.length} 条台词超出歌曲时长，永远不会出现`);
  const lateLyrics = lyrics.lines.filter((l) => l.t + l.dur > duration + 0.01);
  if (lateLyrics.length) warnings.push(`${lateLyrics.length} 行歌词超出歌曲时长`);

  console.log(`  分镜       ${scenes.length} 段 · ${scenes.map((s) => s.id + ':' + s.scene).join(' → ')}`);
  console.log(`  台词       ${script.messages.length} 条`);
  console.log(`  歌词       ${lyrics.lines.length} 行`);

  console.log('');
  if (warnings.length) {
    warnings.forEach((w) => console.log('  ⚠ ' + w));
    console.log('');
  }
  if (problems.length) {
    problems.forEach((p) => console.log('  ✗ ' + p));
    console.log('\n自检未通过。');
    process.exit(1);
  }
  console.log('自检通过。' + (warnings.length ? `（${warnings.length} 条提醒）` : ''));
}

/* ------------------------------------------------------------------ 各步骤 */
function beats() {
  const arg = process.argv[3];
  if (!arg) {
    console.error('用法: node tools/build.mjs beats <音频文件，例如 input/song.mp3>');
    process.exit(1);
  }
  run(process.execPath, [path.join(HERE, 'auto-beats.mjs'), arg], '自动节拍检测');

  // 把结果固化成固定的 song.beats.json —— src/lib/song.ts 认的就是这个名字，
  // 这样换歌不需要改任何代码。
  const base = path.basename(arg).replace(/\.[^.]+$/, '');
  const produced = path.join(INPUT, base + '.beats.json');
  if (fs.existsSync(produced) && produced !== BEATS_FILE) {
    fs.copyFileSync(produced, BEATS_FILE);
    console.log(`\n已固化为 ${path.relative(PROJ, BEATS_FILE)}（src/lib/song.ts 读取的就是它）`);
  }
}

/**
 * 挑一个能写的输出路径。
 *
 * 为什么需要：Remotion 渲染完会把临时文件**重命名**成目标文件名。
 * 如果目标正被别的进程打开（在播放器里放着、或被编辑器/GUI 预览持有句柄），
 * 这个重命名会以 EPERM 失败 —— 整条渲染白跑，而且报错发生在最后一步，
 * 前面几十秒到十几分钟的渲染全浪费。
 *
 * 所以这里先试着自己独占打开一下；打不开就换一个带序号的名字，
 * 并明确告诉用户最终写到了哪里。
 */
function safeOutput(preferred) {
  if (!fs.existsSync(preferred)) return preferred;

  // ⚠ 不能用「能不能打开」来判断：Node 在 Windows 上打开文件时会带上
  //   FILE_SHARE_DELETE，即使别的进程正占用也能打开成功 —— 但 Remotion
  //   最后要做的 rename 需要 DELETE 权限，照样会 EPERM。
  //   唯一可靠的判断是**自己试着重命名一次**。
  const probe = preferred + '.lockprobe';
  try {
    fs.rmSync(probe, { force: true });
    fs.renameSync(preferred, probe); // 能重命名 → 没被锁
    fs.renameSync(probe, preferred); // 立刻改回来
    return preferred;
  } catch (e) {
    try {
      if (fs.existsSync(probe)) fs.renameSync(probe, preferred);
    } catch (e2) {
      /* 改不回来也没关系，下面会换名字 */
    }
    const m = /^(.*?)(-\d+)?(\.[^.]+)$/.exec(preferred);
    const stem = m ? m[1] : preferred;
    const ext = m ? m[3] : '';
    let i = 2;
    let alt = `${stem}-${i}${ext}`;
    while (fs.existsSync(alt)) {
      i++;
      alt = `${stem}-${i}${ext}`;
    }
    console.log(
      `⚠ ${path.basename(preferred)} 正被其他进程占用（多半是在播放器/GUI 里开着），` +
        `本次改写到 ${path.basename(alt)}`
    );
    return alt;
  }
}

function delivery() {
  remotion(['render', 'MainFilm', safeOutput(path.join(OUT, 'pv.mp4')), '--log=error']);
}

function master() {
  const target = safeOutput(path.join(OUT, 'pv-master.mov'));
  remotion([
    'render',
    'MainFilm',
    target,
    '--codec=prores',
    '--prores-profile=4444',
    '--image-format=png',
    '--log=error',
  ]);
  if (fs.existsSync(target)) {
    const mb = fs.statSync(target).size / 1048576;
    const secs = SONG_SECONDS();
    const perMin = mb / (secs / 60);
    const fourMin = mb * (240 / secs);
    console.log(
      `  母版体积 ${mb.toFixed(0)} MB（约 ${perMin.toFixed(0)} MB/分钟；` +
        `一首 4 分钟的歌约 ${(fourMin / 1024).toFixed(2)} GB，注意磁盘）`
    );
  }
}

/** 轻量母版：视觉无损的 h264，体积约为 ProRes 的 1/8，适合日常归档与二次剪辑 */
function masterLite() {
  remotion([
    'render',
    'MainFilm',
    safeOutput(path.join(OUT, 'pv-master-lite.mp4')),
    '--crf=1',
    '--log=error',
  ]);
}

/** 联系表：抽帧 + HTML，用来快速审全片 */
function sheet() {
  run(process.execPath, [path.join(HERE, 'contact-sheet.mjs')], '生成联系表');
}

/** 音画同步验收：用数字证明渲染管线没有挪动音频 */
function verify() {
  // 允许透传参数，例如：node tools/build.mjs verify --film out/film-2.mp4
  const extra = process.argv.slice(3);
  run(process.execPath, [path.join(HERE, 'verify-sync.mjs'), ...extra], '音画同步验收');
}

/** 当前歌长（秒）：从打点表读，读不到就按 25.5 估 */
function SONG_SECONDS() {
  try {
    const b = readJson(findBeatsFile());
    return b.duration || 25.5;
  } catch (e) {
    return 25.5;
  }
}

function fourK() {
  if (!FFMPEG) {
    console.error('找不到自带的 ffmpeg');
    process.exit(1);
  }
  const src = path.join(OUT, 'pv.mp4');
  if (!fs.existsSync(src)) {
    console.error('先跑 delivery 生成 out/pv.mp4');
    process.exit(1);
  }
  run(
    FFMPEG,
    [
      '-y', '-hide_banner', '-loglevel', 'error',
      '-i', src,
      '-vf', 'scale=3840:2160:flags=lanczos',
      '-c:v', 'libx264', '-crf', '18', '-preset', 'veryfast',
      '-c:a', 'copy',
      path.join(OUT, 'film_4k.mp4'),
    ],
    '4K 放大（lanczos）'
  );
}

/* -------------------------------------------------------------------- 入口 */
const step = (process.argv[2] || 'all').toLowerCase();

if (!fs.existsSync(CLI) && step !== 'check' && step !== 'beats') {
  console.error('依赖没装：先跑 node <npm-cli> install');
  process.exit(1);
}

switch (step) {
  case 'check':
    check();
    break;
  case 'beats':
    beats();
    break;
  case 'delivery':
    delivery();
    break;
  case 'verify':
    verify();
    break;
  case 'sheet':
    sheet();
    break;
  case 'master':
    master();
    break;
  case 'master-lite':
    masterLite();
    break;
  case '4k':
    fourK();
    break;
  case 'all':
    check();
    delivery();
    verify();
    master();
    console.log('\n全部完成：');
    console.log('  交付版 out/film.mp4');
    console.log('  无损母版 out/film-master.mov');
    console.log('  想再出 4K：node tools/build.mjs 4k');
    break;
  default:
    console.error('未知步骤：' + step);
    console.error('可用：check | beats | delivery | verify | sheet | master | master-lite | 4k | all');
    process.exit(1);
}
