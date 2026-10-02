import React from 'react';
import { AbsoluteFill, Audio, staticFile, useCurrentFrame, useVideoConfig } from 'remotion';
import { ALL_BEATS, beatIndexAt, flash, fmtTime, prng, SONG_DURATION } from './lib/beats';
import { AUDIO_SRC } from './lib/song';
import { sectionAt, shotColor, stageAt, withAlpha } from './lib/staging';

/* ============================================================================
 * 方向 B · 全屏终端 TUI
 * 把参考工程右半边的语言放大到全屏：等宽字体、ASCII 框图、进度条、日志流。
 * ==========================================================================*/

const VISIBLE_LINES = 19;

const VERBS = [
  'load  weights/shard_0007.safetensors',
  'warmup  cuda graphs (cpu fallback)',
  'forward  attn 96x96  heads 12',
  'kv_cache  hit   len=0512',
  'sample  top_p=0.95  temp=0.70',
  'backward  grad_norm 0.83',
  'optim   step applied  lr 3.0e-04',
  'eval   perplexity check',
  'checkpoint  write  000123',
  'align  tokenizer byte-level',
  'rlhf  reward  +0.42',
  'emit  token  "你"',
];

function lineFor(beat: number): string {
  const v = VERBS[Math.floor(prng(beat) * VERBS.length) % VERBS.length];
  const loss = (0.9 - (beat % 40) * 0.018 + prng(beat * 7) * 0.03).toFixed(4);
  const warn = prng(beat * 13) > 0.88;
  const tag = warn ? 'WARN' : ' ok ';
  // 时间戳取这一拍在歌里的**真实秒数**。
  // 曾经写成 beat * 0.5（那是 120 BPM 的假设），换到 125 BPM 后会一路漂移，
  // 日志上的时间和画面上的时间码对不上。
  const bt = ALL_BEATS[Math.min(Math.max(0, beat), ALL_BEATS.length - 1)] || 0;
  return `[${bt.toFixed(2).padStart(6, '0')}] ${tag}  ${v}  loss ${loss}`;
}

function bar(frac: number, width: number): string {
  const n = Math.round(Math.max(0, Math.min(1, frac)) * width);
  return '█'.repeat(n) + '░'.repeat(Math.max(0, width - n));
}

export const TerminalTUI: React.FC<{ audio?: boolean }> = ({ audio = true }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const t = frame / fps;
  const f = flash(t);
  const bi = beatIndexAt(t);
  const beat = Math.max(0, bi);
  // 镜头的身份色固定为绿；段落强度只改它的密度与亮度，不改色相 ——
  // 四个镜头各有基色，才不会越长越像。
  const GREEN = shotColor('term');
  const DIM = withAlpha(GREEN, 0.42);
  const WARN = '#d29922';
  const stage = stageAt(t);
  const k = 0.45 + stage.intensity * 0.55;

  const lines: string[] = [];
  for (let b = Math.max(0, beat - VISIBLE_LINES + 1); b <= beat; b++) lines.push(lineFor(b));
  while (lines.length < VISIBLE_LINES) lines.unshift('');

  const step = 100000 + beat * 137;
  const loss = (0.9 - (beat % 40) * 0.018 + prng(beat * 7) * 0.03).toFixed(4);
  const cursorOn = Math.floor(t * 2) % 2 === 0;

  const glyphRows = 8;
  const glyphCols = 22;

  return (
    <AbsoluteFill
      style={{
        backgroundColor: '#01060a',
        fontFamily: 'Consolas, "Courier New", monospace',
        padding: 34,
      }}
    >
      {audio && <Audio src={staticFile(AUDIO_SRC)} />}

      <div
        style={{
          width: '100%',
          height: '100%',
          border: `2px solid ${f > 0.3 ? GREEN : DIM}`,
          boxShadow: `0 0 ${(8 + f * 34) * k}px ${withAlpha(GREEN, (0.18 + f * 0.3) * k)} inset`,
          display: 'flex',
          flexDirection: 'column',
          padding: 18,
          gap: 14,
        }}
      >
        {/* 标题栏 */}
        <div style={{ display: 'flex', color: GREEN, fontSize: 18, letterSpacing: 1 }}>
          <span>┌─ world.execute(me) </span>
          <span style={{ color: DIM }}>{'─'.repeat(28)}</span>
          <span> tty0 ─ {fps}fps ─ {fmtTime(t, fps)} </span>
          <span style={{ color: DIM }}>{'─'.repeat(8)}</span>
          <span>┐</span>
        </div>

        {/* 主体两列 */}
        <div style={{ flex: 1, display: 'flex', gap: 20, minHeight: 0 }}>
          {/* 左：日志流 */}
          <div style={{ flex: 1.45, display: 'flex', flexDirection: 'column', gap: 4 }}>
            <div style={{ color: WARN, fontSize: 14 }}>── stdout ──────────────────────────────</div>
            {/* 日志底部对齐：像真终端一样，新的从下面顶上来 */}
            <div style={{ flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'flex-end', gap: 4 }}>
              {lines.map((l, i) => {
                const isLast = i === lines.length - 1;
                const isWarn = l.includes('WARN');
                return (
                  <div
                    key={i}
                    style={{
                      fontSize: 15.5,
                      lineHeight: 1.45,
                      color: !l ? 'transparent' : isWarn ? WARN : isLast ? '#ffffff' : GREEN,
                      opacity: l ? (isLast ? 1 : 0.42 + (i / lines.length) * 0.5) : 0,
                      whiteSpace: 'pre',
                    }}
                  >
                    {l || '.'}
                  </div>
                );
              })}
              <div style={{ color: GREEN, fontSize: 15.5 }}>
                {'> '}
                <span style={{ opacity: cursorOn ? 1 : 0, backgroundColor: GREEN, color: '#01060a' }}>
                  {' '}
                </span>
              </div>
            </div>
          </div>

          {/* 右：面板 */}
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 12 }}>
            <div style={{ color: WARN, fontSize: 14 }}>── attention ───────────────────────────</div>
            <div style={{ fontSize: 13, lineHeight: 1.15, color: GREEN, whiteSpace: 'pre' }}>
              {Array.from({ length: glyphRows }).map((_, r) => {
                let row = '';
                for (let c = 0; c < glyphCols; c++) {
                  const v = prng(r * 131 + c * 17 + Math.floor(t * 6) * 3);
                  const hot = (r + c + beat) % 5 === 0;
                  row += v > 0.82 ? '█' : hot && f > 0.4 ? '▓' : v > 0.5 ? '▒' : v > 0.24 ? '░' : '·';
                }
                return row + '\n';
              })}
            </div>

            <div style={{ color: WARN, fontSize: 14, marginTop: 4 }}>── metrics ─────────────────────────────</div>
            <div style={{ fontSize: 15, color: GREEN, lineHeight: 1.9 }}>
              <div>step   {step}</div>
              <div>loss   {loss}</div>
              <div>sect   {sectionAt(t)}</div>
              <div>pbar   [{bar(beat / ALL_BEATS.length, 20)}]</div>
              <div>kv     [{bar((beat % 16) / 16, 20)}]</div>
            </div>
          </div>
        </div>

        {/* 底部总进度 */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, fontSize: 15, color: GREEN }}>
          <span>total</span>
          <span>[{bar(t / SONG_DURATION, 64)}]</span>
          <span>{(t / SONG_DURATION * 100).toFixed(2)}%</span>
          <span style={{ marginLeft: 'auto', color: f > 0.5 ? '#ffffff' : DIM }}>
            {String(Math.max(0, bi + 1)).padStart(2, '0')} / {ALL_BEATS.length}
          </span>
        </div>
      </div>
    </AbsoluteFill>
  );
};
