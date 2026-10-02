import React from 'react';
import type { StateProps } from '../types';
import { prng } from '../../lib/beats';

/* ============================================================================
 * S15 · 垃圾念想（规格 §3）
 * 视觉：碎裂成小方块，堆叠
 * 参数：方块 20-30 个，灰色 #666，无红色
 * 触发：220.300s（「我也曾经有过信念」）→ S14→S15 余烬
 *       222.020s（「如今却成了垃圾一样的念想」）→ 碎裂堆叠
 *
 * ⚠ 验收标准：「暖色像素只出现在『我也曾经有过信念』对应 2s 内」。
 *   所以这里的暖色**只在前 2 秒**（用户那个点微微亮起），
 *   之后所有方块一律冷灰 #666，一个暖色像素都不留。
 * ==========================================================================*/

const clamp01 = (x: number) => (x < 0 ? 0 : x > 1 ? 1 : x);

export const S15Trash: React.FC<StateProps> = ({ t, local, params, width, height }) => {
  const warmSec = params.warmUpSec ?? 2.0;
  const fullAt = params.fullAt ?? t - local + 2;
  const s15Start = t - local;

  // 暖色窗口：只在「我也曾经有过信念」之后 2 秒内
  const warmWindow = clamp01((t - s15Start) / warmSec);
  const warm = 1 - warmWindow; // 1 → 0
  const warmPeak = 0.1 + 0.2 * clamp01((t - s15Start) / 1.2); // 亮度 10% → 30%

  // 碎裂进度
  const shatter = clamp01((t - fullAt) / 1.5);

  const cx = width * 0.5;
  const cy = height * 0.5;
  const gap = params.distance ?? 200;

  const blocks: React.ReactNode[] = [];
  const N = 25;
  for (let i = 0; i < N; i++) {
    // 从两点之间的位置散落下来
    const a = prng(i * 31 + 7) * Math.PI * 2;
    const dist = prng(i * 53 + 11) * 190 * shatter;
    const bx = cx + Math.cos(a) * dist + (prng(i * 71) - 0.5) * 60 * shatter;
    const by = cy + Math.sin(a) * dist * 0.7 + prng(i * 91) * 90 * shatter;
    const size = 6 + prng(i * 17) * 10;
    const rot = (prng(i * 13) - 0.5) * 90 * shatter;
    blocks.push(
      <div
        key={i}
        style={{
          position: 'absolute',
          left: bx,
          top: by,
          width: size,
          height: size * (0.6 + prng(i * 23) * 0.8),
          backgroundColor: '#666666',
          opacity: (0.25 + prng(i * 29) * 0.5) * (0.3 + shatter * 0.7),
          transform: `rotate(${rot.toFixed(1)}deg)`,
          // 只有最初那一瞬间允许带一点暖
          boxShadow: warm > 0.01 ? `0 0 ${warm * 10}px rgba(214,178,140,${(warm * 0.5).toFixed(2)})` : 'none',
        }}
      />
    );
  }

  return (
    <div style={{ position: 'absolute', inset: 0, backgroundColor: '#131417' }}>
      {/* 两个点：用户那个点在最初 2 秒里微微亮起（暖灰） */}
      <svg width={width} height={height} style={{ position: 'absolute', inset: 0 }}>
        <circle
          cx={cx - gap / 2}
          cy={cy}
          r={4}
          fill={warm > 0.01 ? `rgba(${Math.round(140 + warm * 74)},${Math.round(140 + warm * 38)},${Math.round(140 - warm * 8)},1)` : '#666'}
          opacity={(0.2 + warmPeak * 3) * (1 - shatter * 0.6)}
        />
        <circle cx={cx + gap / 2} cy={cy} r={4} fill="#666666" opacity={(0.2 + warmPeak * 3) * (1 - shatter * 0.6)} />
      </svg>

      {blocks}

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
        <span style={{ color: '#8b949e', letterSpacing: 2 }}>TRASH</span>
        <span>{N} blocks</span>
        <span>#666</span>
        <span style={{ marginLeft: 'auto', color: warm > 0.01 ? '#d6b28c' : '#7d8590' }}>
          {warm > 0.01 ? `暖色窗口 ${(warmWindow * 100).toFixed(0)}%` : '已无暖色'}
        </span>
      </div>
    </div>
  );
};
