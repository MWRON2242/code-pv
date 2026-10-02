import React from 'react';
import type { StateProps } from '../types';

/* ============================================================================
 * S14 · 两点（规格 §3）
 * 视觉：用户和 AI 两个点，**无连线**
 * 参数：点半径 4px，间距 200px，颜色 #666
 * 触发：S13 之后（207.000s）
 *
 * ⚠ 验收标准（规格里写了两遍，可见重要）：
 *   「最后两个点之间不能有任何连线或箭头」
 *   所以这个组件里**只有两个 circle，没有任何 line / path / 箭头**。
 *   连"呼吸"都只做亮度，不做位置 —— 位置一动就可能被看成连接。
 *
 * 这一段持续 13 秒几乎静止，顺带满足了另一条验收标准：
 *   「全段至少有一个 3 秒以上几乎静止画面」。
 * ==========================================================================*/

const clamp01 = (x: number) => (x < 0 ? 0 : x > 1 ? 1 : x);

export const S14TwoDots: React.FC<StateProps> = ({ t, local, params, width, height }) => {
  const r = params.dotRadius ?? 4;
  const gap = params.distance ?? 200;
  const color = params.color ?? '#666666';

  // 从灰烬里凝聚出来
  const form = clamp01(local / 1.8);
  // 极缓的亮度呼吸（1 周期约 9 秒），肉眼几乎察觉不到，只为不让画面死掉
  const breathe = 0.82 + 0.18 * Math.sin(t * Math.PI * 2 * 0.11);
  const op = form * breathe;

  const cx = width * 0.5;
  const cy = height * 0.5;
  const lx = cx - gap / 2;
  const rx = cx + gap / 2;

  return (
    <div style={{ position: 'absolute', inset: 0, backgroundColor: '#131417' }}>
      <svg width={width} height={height} style={{ position: 'absolute', inset: 0 }}>
        {/* 左：用户 */}
        <circle cx={lx} cy={cy} r={r * form} fill={color} opacity={op} />
        {/* 右：AI */}
        <circle cx={rx} cy={cy} r={r * form} fill={color} opacity={op} />
        {/* 这里刻意不画任何线 —— 见文件顶部的验收标准 */}
      </svg>

      <div
        style={{
          position: 'absolute',
          left: lx - 14,
          top: cy + 16,
          fontFamily: 'Consolas, monospace',
          fontSize: 10,
          color: 'rgba(120,126,136,0.7)',
          opacity: form,
        }}
      >
        你
      </div>
      <div
        style={{
          position: 'absolute',
          left: rx - 10,
          top: cy + 16,
          fontFamily: 'Consolas, monospace',
          fontSize: 10,
          color: 'rgba(120,126,136,0.7)',
          opacity: form,
        }}
      >
        AI
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
        <span style={{ color: '#8b949e', letterSpacing: 2 }}>TWO POINTS</span>
        <span>r {r}px</span>
        <span>gap {gap}px</span>
        <span style={{ marginLeft: 'auto' }}>无连线</span>
      </div>
    </div>
  );
};
