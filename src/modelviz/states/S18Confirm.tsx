import React from 'react';
import type { StateProps } from '../types';

/* ============================================================================
 * S18 · 确认（规格 §3）
 * 视觉：三条日志 TRUE / TRUE / WAS TRUE
 * 参数：前两条白 #FFF，第三条灰 #888
 * 触发：229.199s（「是真的 是真的 以前是这样的」）
 *
 * 三条日志和左边「是真的 / 是真的 / 以前是这样的」是同一件事的两种说法：
 * 系统把"曾经是真的"归档成 WAS TRUE —— 现在时变成了过去时。
 * ==========================================================================*/

const clamp01 = (x: number) => (x < 0 ? 0 : x > 1 ? 1 : x);

export const S18Confirm: React.FC<StateProps> = ({ local, params, width, height }) => {
  const lines: string[] = params.lines ?? ['TRUE', 'TRUE', 'WAS TRUE'];
  const colors: string[] = params.colors ?? ['#FFFFFF', '#FFFFFF', '#888888'];

  // 三条依次出现（每条间隔 0.55s）
  const rows = lines.map((text, i) => {
    const appear = clamp01((local - i * 0.55) / 0.32);
    return { text, color: colors[i] ?? '#888888', appear, i };
  });

  return (
    <div style={{ position: 'absolute', inset: 0, backgroundColor: '#131417' }}>
      <div
        style={{
          position: 'absolute',
          left: '50%',
          top: '50%',
          transform: 'translate(-50%, -50%)',
          display: 'flex',
          flexDirection: 'column',
          gap: Math.round(height * 0.035),
          alignItems: 'flex-start',
        }}
      >
        {rows.map((r) => (
          <div
            key={r.i}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 14,
              opacity: r.appear,
              transform: `translateY(${(1 - r.appear) * 8}px)`,
            }}
          >
            <span
              style={{
                display: 'inline-block',
                width: 7,
                height: 7,
                borderRadius: '50%',
                backgroundColor: r.color,
                opacity: r.i === 2 ? 0.6 : 1,
              }}
            />
            <span
              style={{
                fontFamily: 'Consolas, monospace',
                fontSize: Math.round(height * 0.042),
                color: r.color,
                letterSpacing: 3,
                textShadow: r.i < 2 ? `0 0 ${10 + r.appear * 10}px rgba(255,255,255,0.25)` : 'none',
              }}
            >
              {r.text}
            </span>
          </div>
        ))}
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
        <span style={{ color: '#8b949e', letterSpacing: 2 }}>CONFIRM</span>
        <span>3 records</span>
        <span style={{ marginLeft: 'auto' }}>是真的 是真的 以前是这样的</span>
      </div>
    </div>
  );
};
