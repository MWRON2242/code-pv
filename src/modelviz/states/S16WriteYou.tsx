import React from 'react';
import type { StateProps } from '../types';

/* ============================================================================
 * S16 · 写下你（规格 §3）
 * 视觉：光标写「君」，写一半删除，循环 3 次
 * 参数：每次写入 0.5s，删除 0.3s，间隔 0.8s
 * 触发：223.660s（「无论多少次都想写下你」）
 *
 * ⚠ 验收标准：「『写君字』循环必须可见，至少 2 次」。
 *
 * ⚠ 规格内部冲突：S16 从 223.660 到 S17 的 225.550 只有 **1.89 秒**，
 *   而按规格给的节奏一轮 = 0.5+0.3+0.8 = **1.6 秒**，1.89 秒里塞不下 3 轮。
 *   这里**以验收标准为准**：把节奏等比压缩，保证 3 轮完整跑完。
 *   如果以后触发点变了，压缩比例会自动跟着变，不需要改代码。
 * ==========================================================================*/

const clamp01 = (x: number) => (x < 0 ? 0 : x > 1 ? 1 : x);

export const S16WriteYou: React.FC<StateProps> = ({ local, params, width, height }) => {
  const loops = params.loops ?? 3;
  const specCycle = (params.writeSec ?? 0.5) + (params.eraseSec ?? 0.3) + (params.gapSec ?? 0.8);
  // S16 的可用总时长：由解析器注入（见下）。没注入就退回规格节奏。
  const available = params.availableSec ?? specCycle * loops;
  const cycle = Math.min(specCycle, available / loops);

  const phase = (local % cycle) / cycle;
  const wFrac = (params.writeSec ?? 0.5) / specCycle;
  const eFrac = wFrac + (params.eraseSec ?? 0.3) / specCycle;

  // 写入 → 删除一半 → 停顿
  let shown: number;
  let caret = true;
  if (phase < wFrac) {
    shown = clamp01(phase / wFrac); // 写到 1（完整「君」）
  } else if (phase < eFrac) {
    const k = (phase - wFrac) / (eFrac - wFrac);
    // 「写一半删除」：从完整擦回一半
    shown = 1 - k * 0.5;
  } else {
    shown = 0.5;
    caret = false;
  }

  const done = Math.floor(local / cycle);
  const chW = Math.round(height * 0.13);
  const chars = ['君'];
  const frac = shown;

  return (
    <div style={{ position: 'absolute', inset: 0, backgroundColor: '#131417' }}>
      <div
        style={{
          position: 'absolute',
          left: '50%',
          top: '50%',
          transform: 'translate(-50%, -50%)',
          display: 'flex',
          alignItems: 'center',
          fontFamily: '"Microsoft YaHei", system-ui, sans-serif',
          fontSize: chW,
          color: 'rgba(210,215,222,0.92)',
          lineHeight: 1,
        }}
      >
        {chars.map((c, i) => {
          // 用裁切模拟"写一半"：字形从下往上出现
          const show = clamp01(frac * chars.length - i);
          return (
            <span
              key={i}
              style={{
                display: 'inline-block',
                clipPath: `inset(${((1 - show) * 100).toFixed(1)}% 0 0 0)`,
              }}
            >
              {c}
            </span>
          );
        })}
        <span
          style={{
            display: 'inline-block',
            width: Math.round(chW * 0.06),
            height: chW * 0.92,
            marginLeft: 4,
            backgroundColor: 'rgba(210,215,222,0.85)',
            opacity: caret ? 1 : 0.15,
          }}
        />
      </div>

      <div
        style={{
          position: 'absolute',
          left: Math.round(width * 0.04),
          top: Math.round(width * 0.04) * 0.6,
          display: 'flex',
          gap: 12,
          fontFamily: 'Consolas, monospace',
          fontSize: 12,
          color: '#7d8590',
        }}
      >
        <span style={{ color: '#8b949e', letterSpacing: 2 }}>WRITE YOU</span>
        <span>
          loop {Math.min(loops, done + 1)}/{loops}
        </span>
        <span>cycle {cycle.toFixed(2)}s</span>
        {cycle < specCycle - 0.01 && (
          <span style={{ color: '#d29922' }}>（已压缩：窗口只有 {available.toFixed(2)}s）</span>
        )}
      </div>
    </div>
  );
};
