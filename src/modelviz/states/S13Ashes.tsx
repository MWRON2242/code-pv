import React from 'react';
import type { StateProps } from '../types';
import { prng } from '../../lib/beats';

/* ============================================================================
 * S13 · 灰烬（规格 §3）
 * 视觉：壳碎，灰白灰烬飘落，**无红色**
 * 参数：灰烬粒子 200-300 个，下落速度 10px/s
 * 触发：201.550s（「怎样都好啦 都是你的错」）
 *
 * ⚠ 验收标准：「本段红色像素占比必须低于上一段高潮的 50%」。
 *   所以这里一个红色像素都不给 —— 只有灰白。
 *
 * 粒子用确定性伪随机分布在屏幕上方之外，按各自速度下落并循环，
 * 这样画面里始终有 200~300 颗，而不是"下完就空了"。
 * ==========================================================================*/

export const S13Ashes: React.FC<StateProps> = ({ t, params, width, height }) => {
  const min = params.particlesMin ?? 200;
  const max = params.particlesMax ?? 300;
  const fall = params.fallPxPerSec ?? 10;

  const count = Math.round(min + (max - min) * 0.6);
  const grains: React.ReactNode[] = [];
  const span = height + 80;

  for (let i = 0; i < count; i++) {
    const x0 = prng(i * 3 + 1) * width;
    const speed = fall * (0.55 + prng(i * 7 + 5) * 1.1);
    // 每个粒子的相位错开，形成连续的灰烬雨
    const y0 = prng(i * 11 + 9) * span;
    const y = ((y0 + t * speed) % span) - 40;
    // 轻微横向飘移，像真的有风
    const drift = Math.sin(t * 0.7 + i) * 6 + prng(i * 13) * 10 - 5;
    const size = prng(i * 17 + 3) > 0.88 ? 2.2 : 1.2;
    const a = 0.12 + prng(i * 19 + 7) * 0.5;

    grains.push(
      <div
        key={i}
        style={{
          position: 'absolute',
          left: x0 + drift,
          top: y,
          width: size,
          height: size,
          borderRadius: '50%',
          backgroundColor: `rgba(206,210,216,${a.toFixed(3)})`,
        }}
      />
    );
  }

  // 壳碎掉后剩下的几块弧
  const shards: React.ReactNode[] = [];
  for (let i = 0; i < 7; i++) {
    const a0 = prng(i * 31 + 11) * Math.PI * 2;
    const spread = 0.1 + prng(i * 41 + 13) * 0.22;
    const r = Math.min(width, height) * (0.26 + prng(i * 53) * 0.12);
    const cx = width * 0.5;
    const cy = height * 0.5;
    shards.push(
      <path
        key={i}
        d={`M ${cx + Math.cos(a0) * r} ${cy + Math.sin(a0) * r} A ${r} ${r} 0 0 1 ${cx + Math.cos(a0 + spread) * r} ${cy + Math.sin(a0 + spread) * r}`}
        fill="none"
        stroke="rgba(170,178,190,0.22)"
        strokeWidth={1.2}
      />
    );
  }

  return (
    <div style={{ position: 'absolute', inset: 0, backgroundColor: '#131417' }}>
      <svg width={width} height={height} style={{ position: 'absolute', inset: 0 }}>
        {shards}
      </svg>
      {grains}

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
        <span style={{ color: '#8b949e', letterSpacing: 2 }}>ASHES</span>
        <span>{count} particles</span>
        <span>{fall}px/s</span>
        <span style={{ marginLeft: 'auto' }}>无红色</span>
      </div>
    </div>
  );
};
