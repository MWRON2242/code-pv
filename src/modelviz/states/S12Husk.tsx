import React from 'react';
import type { StateProps } from '../types';
import { prng } from '../../lib/beats';

/* ============================================================================
 * S12 · 空壳（规格 §3）
 * 视觉：半透明薄壳，后面是空白
 * 参数：壳透明度 0.2，**壳上无文字**
 * 触发：196.400s（「这不过是防卫本能」第 3 次）
 *
 * 与 S6 的对照是这一段的重点：同一个壳，S6 上写满「防卫」，
 * 到这里文字全没了 —— 壳还在，里面什么都没有。
 * ==========================================================================*/

const clamp01 = (x: number) => (x < 0 ? 0 : x > 1 ? 1 : x);

export const S12Husk: React.FC<StateProps> = ({ t, local, params, width, height }) => {
  const target = params.shellAlpha ?? 0.2;
  // 从 S11 的乱码里淡出成薄壳
  const alpha = target * clamp01(local / 1.5);

  const cx = width * 0.5;
  const cy = height * 0.52;
  const R = Math.min(width, height) * 0.3;
  const breathe = 1 + 0.010 * Math.sin(t * Math.PI * 2 * 0.4);

  const edge: string[] = [];
  const V = 16;
  for (let i = 0; i < V; i++) {
    const a = (i / V) * Math.PI * 2;
    const r = R * breathe * (0.94 + prng(i * 41 + 7) * 0.12);
    edge.push(`${(cx + Math.cos(a) * r).toFixed(1)},${(cy + Math.sin(a) * r).toFixed(1)}`);
  }

  return (
    <div style={{ position: 'absolute', inset: 0, backgroundColor: '#111214' }}>
      <svg width={width} height={height} style={{ position: 'absolute', inset: 0 }}>
        {/* 极淡的网格残影，暗示背后的系统还在，但已经空了 */}
        {Array.from({ length: 9 }).map((_, i) => (
          <line
            key={`h${i}`}
            x1={0}
            y1={(height / 8) * i}
            x2={width}
            y2={(height / 8) * i}
            stroke="rgba(150,158,170,0.05)"
            strokeWidth={1}
          />
        ))}
        {Array.from({ length: 15 }).map((_, i) => (
          <line
            key={`v${i}`}
            x1={(width / 14) * i}
            y1={0}
            x2={(width / 14) * i}
            y2={height}
            stroke="rgba(150,158,170,0.05)"
            strokeWidth={1}
          />
        ))}
        {/* 薄壳：只有描边，内部完全空白 */}
        <path
          d={'M' + edge.join('L') + 'Z'}
          fill="rgba(180,188,200,0.02)"
          stroke={`rgba(170,180,195,${alpha.toFixed(3)})`}
          strokeWidth={1.4}
        />
      </svg>

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
        <span style={{ color: '#8b949e', letterSpacing: 2 }}>EMPTY SHELL</span>
        <span>alpha {target}</span>
        <span style={{ marginLeft: 'auto' }}>壳上无文字</span>
      </div>
    </div>
  );
};
