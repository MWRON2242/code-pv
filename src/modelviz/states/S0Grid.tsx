import React from 'react';
import type { StateProps } from '../types';
import { GridField } from '../GridField';

/* ============================================================================
 * S0 · 整齐向量方格（规格 §3）
 * 规整网格，冷色（青/蓝），低熵，平滑动画。网格 16×16，色相 180–220，噪声 0.02。
 *
 * S0 从 0 秒持续到 S1（46.62 秒）—— 四十多秒，是全片最长的状态。
 * 所以它内部要按歌词推进（规格 §4.1 的右窗栏）：
 *   · 一直：向量在「决策边界」附近震荡，输出「无法分类」
 *   · 5.18 秒起：出现向量计算与权重方格
 *   · 8.31 秒起：进入等待动画
 * ==========================================================================*/

export const S0Grid: React.FC<StateProps> = ({ t, params, width, height }) => {
  const cells = params.grid || 16;
  const computeIn = Math.max(0, Math.min(1, (t - 5.18) / 1.2));
  const waitingIn = Math.max(0, Math.min(1, (t - 8.31) / 1.2));

  // 权重方格：§4.1「右侧出现向量计算、权重方格」
  const weights: React.ReactNode[] = [];
  if (computeIn > 0.01) {
    const P = Math.round(width * 0.04);
    const innerW = width - P * 2;
    const innerH = height - (P * 0.6 + 26) - P;
    const cw = innerW / cells;
    const ch = innerH / cells;
    for (let i = 0; i < 22; i++) {
      const r = Math.floor(prngAt(i * 31 + 5) * cells);
      const c = Math.floor(prngAt(i * 57 + 11) * cells);
      const w = prngAt(i * 91 + Math.floor(t * 2) * 13);
      weights.push(
        <div
          key={`w${i}`}
          style={{
            position: 'absolute',
            left: P + c * cw + 2,
            top: P * 0.6 + 26 + r * ch + 1,
            width: cw - 4,
            height: ch - 2,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontFamily: 'Consolas, monospace',
            fontSize: Math.max(6, cw * 0.32),
            color: `rgba(190,235,255,${(computeIn * (0.32 + w * 0.45)).toFixed(2)})`,
          }}
        >
          {w.toFixed(2)}
        </div>
      );
    }
  }

  const P = Math.round(width * 0.04);

  return (
    <div style={{ position: 'absolute', inset: 0 }}>
      <div
        style={{
          position: 'absolute',
          left: P,
          top: P * 0.6,
          right: P,
          display: 'flex',
          alignItems: 'baseline',
          gap: 12,
          fontFamily: 'Consolas, monospace',
          fontSize: 12,
          color: '#7d8590',
        }}
      >
        <span style={{ color: '#58a6ff', letterSpacing: 2 }}>VECTOR FIELD</span>
        <span>
          grid {cells}×{cells}
        </span>
        <span>
          hue {params.hueMin ?? 180}–{params.hueMax ?? 220}
        </span>
        <span style={{ marginLeft: 'auto', color: waitingIn > 0.5 ? '#d29922' : '#7d8590' }}>
          output: 无法分类{waitingIn > 0.5 ? ' · waiting' : ''}
        </span>
      </div>

      <GridField
        t={t}
        width={width}
        height={height}
        cells={cells}
        hueMin={params.hueMin ?? 180}
        hueMax={params.hueMax ?? 220}
        noise={params.noise ?? 0.02}
        boundary={1}
        boundaryOsc
      />
      {weights}
    </div>
  );
};

/** 与 lib/beats 的 prng 同算法，这里内联一份避免循环依赖 */
function prngAt(n: number): number {
  let s = (Math.floor(n) * 1664525 + 1013904223) >>> 0;
  s = (s * 1664525 + 1013904223) >>> 0;
  return s / 4294967296;
}
