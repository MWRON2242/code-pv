/* ============================================================================
 * 聊天剧本 → JSON
 * ----------------------------------------------------------------------------
 *   node tools/fit-chat.mjs
 *
 * 读 input/chat-script.txt（按歌词逐句写的剧本）与 input/lyric-timing.json，
 * 把 @句号 解析成秒数，写出 input/chat-script.json。
 *
 * 为什么剧本只引用句号、不写秒数：
 *   歌词时间来自用户提供的带时间码歌词表。将来若换音源重打歌词，
 *   时间会变，但**剧本一行都不用改** —— 只要句号还对得上。
 * ==========================================================================*/
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const PROJ = path.join(HERE, '..');
const INPUT = path.join(PROJ, 'input');

const timingFile = path.join(INPUT, 'lyric-timing.json');
const scriptFile = path.join(INPUT, 'chat-script.txt');
const outFile = path.join(INPUT, 'chat-script.json');

for (const f of [timingFile, scriptFile]) {
  if (!fs.existsSync(f)) {
    console.error(`✗ 找不到 ${path.relative(PROJ, f)}`);
    process.exit(1);
  }
}

const timing = JSON.parse(fs.readFileSync(timingFile, 'utf8').replace(/^\uFEFF/, ''));
const times = timing.times || [];
const N = times.length;

/* ------------------------------------------------------------ 气泡样式 */
const BUBBLE = {
  n: { scale: 1.0, tone: 'normal' },
  s: { scale: 0.88, tone: 'normal' },
  t: { scale: 0.76, tone: 'normal' },
  g: { scale: 1.0, tone: 'gray' },
  w: { scale: 1.0, tone: 'warm' },
};
const MODES = ['send', 'hold', 'del', 'bs', 'retract', 'upload', 'sky', 'none'];

/* --------------------------------------------------------------- 解析 */
const lines = fs.readFileSync(scriptFile, 'utf8').replace(/^\uFEFF/, '').split(/\r?\n/);
const events = [];
const problems = [];

lines.forEach((raw, i) => {
  const line = raw.trim();
  if (!line || line.startsWith('#')) return;

  const m = /^(you|ai)\s+(\w+)\s+([nstgw])\s+@(\d+)(?:\+([\d.]+))?\s*(.*)$/.exec(line);
  if (!m) {
    problems.push(`第 ${i + 1} 行格式不对：${line.slice(0, 60)}`);
    return;
  }
  const [, from, mode, bubble, lineNoStr, offStr, text] = m;
  const lineNo = Number(lineNoStr);
  if (!MODES.includes(mode)) {
    problems.push(`第 ${i + 1} 行模式未知「${mode}」（可用：${MODES.join(' / ')}）`);
    return;
  }
  if (lineNo < 1 || lineNo > N) {
    problems.push(`第 ${i + 1} 行句号 ${lineNo} 超出范围 1~${N}`);
    return;
  }
  const off = offStr ? Number(offStr) : 0;
  const t = Number((times[lineNo - 1] + off).toFixed(4));
  const b = BUBBLE[bubble];

  events.push({
    t,
    from,
    mode,
    bubble,
    scale: b.scale,
    tone: b.tone,
    line: lineNo,
    offset: off,
    text: (text || '').trim(),
    /** 打字起点：发送类事件往前推一点，让输入框有「正在打字」的过程 */
    typeStart: Number(
      Math.max(0, t - Math.min(1.7, Math.max(0.5, (text || '').length * 0.075))).toFixed(4)
    ),
  });
});

events.sort((a, b) => a.t - b.t);

/* -------------------------------------------------------------- 校验 */
// 同一时刻不应有两条 AI 消息（会叠在一起）
for (let i = 1; i < events.length; i++) {
  const a = events[i - 1];
  const b = events[i];
  if (a.from === 'ai' && b.from === 'ai' && b.t - a.t < 0.4) {
    problems.push(`两条 AI 消息间隔仅 ${(b.t - a.t).toFixed(2)}s（${a.t}s / ${b.t}s），会挤在一起`);
  }
}
// 剧本里不该出现同一句歌词上 AI 抢在用户前面
const sends = events.filter((e) => e.mode === 'send');
if (!sends.length) problems.push('一条 send 都没有，剧本可能没被解析到');

/* -------------------------------------------------------------- 写出 */
const counts = {};
for (const e of events) counts[e.mode] = (counts[e.mode] || 0) + 1;

fs.writeFileSync(
  outFile,
  JSON.stringify(
    {
      _说明: '聊天剧本（由 tools/fit-chat.mjs 从 input/chat-script.txt 生成，不要手改本文件）',
      _叙事: '僕 = 用户（人类）；君 = AI（冷淡、系统化、复读同一批临床句式）',
      _来源: 'input/总线.txt §4 的五张逐段镜头表',
      eventCount: events.length,
      modeCounts: counts,
      events,
    },
    null,
    2
  ) + '\n',
  'utf8'
);

/* ------------------------------------------------------------ 控制台 */
console.log('聊天剧本');
console.log(`  解析     ${events.length} 条事件（来自 ${path.relative(PROJ, scriptFile)}）`);
console.log(
  '  模式     ' +
    Object.entries(counts)
      .map(([k, v]) => `${k} ${v}`)
      .join(' · ')
);
const aiCount = events.filter((e) => e.from === 'ai').length;
console.log(`  说话     you ${events.length - aiCount} 条 · ai ${aiCount} 条`);
console.log(`  时间范围 ${events[0]?.t}s ~ ${events[events.length - 1]?.t}s`);
console.log(`  写出     ${path.relative(PROJ, outFile)}`);

if (problems.length) {
  console.log('\n⚠ 需要注意：');
  for (const p of problems) console.log('  ' + p);
  process.exitCode = 1;
} else {
  console.log('\n✓ 无告警');
}
