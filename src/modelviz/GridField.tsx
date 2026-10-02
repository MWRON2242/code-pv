import React from 'react';
import { prng } from '../lib/beats';

/* ============================================================================
 * GridField · 向量网格共用层
 * ----------------------------------------------------------------------------
 * S0→S1→S2 是**同一个网格**逐步崩坏：整齐 → 错位 → 碎裂。
 * 如果每个状态各画一套网格，交叉过渡时会看成两张不同的图，崩坏感就断了。
 * 所以网格只写一次，各状态通过参数扭曲它：
 *
 *   jitterPx   每个格子的随机错位（S1 的 ±3px）
 *   hueShift   色相整体偏移（S1 的 +20）
 *   chunkBreak 把网格切成 N 块并各自位移（S2 的碎裂）
 *   redRatio   往红色 #FF3B30 混多少（S2 的红色归因）
 *   desat      去饱和（S8）
 * ==========================================================================*/

export type GridFieldProps = {
  t: number;
  width: number;
  height: number;
  cells?: number;
  hueMin?: number;
  hueMax?: number;
  noise?: number;
  jitterPx?: number;
  hueShift?: number;
  chunkBreak?: number;
  redRatio?: number;
  desat?: number;
  alpha?: number;
  /** 决策边界的高亮强度（S0） */
  boundary?: number;
  /** 决策边界位置随时间摆动；false 则固定在中线 */
  boundaryOsc?: boolean;
  pad?: number;
  padTop?: number;
};

/** 决策边界位置：缓慢摆动 */
function boundaryAt(t: number, osc: boolean): number {
  if (!osc) return 0.5;
  return 0.5 + 0.13 * Math.sin(t * 0.42) + 0.05 * Math.sin(t * 1.13);
}

/** 把 (r,c) 稳定地映射到某个碎块序号 */
function chunkOf(r: number, c: number, chunks: number): number {
  if (chunks <= 1) return 0;
  const h = prng(r * 73856093 + c * 19349663);
  return Math.min(chunks - 1, Math.floor(h * chunks));
}

export const GridField: React.FC<GridFieldProps> = ({
  t,
  width,
  height,
  cells = 16,
  hueMin = 180,
  hueMax = 220,
  noise = 0.02,
  jitterPx = 0,
  hueShift = 0,
  chunkBreak = 0,
  redRatio = 0,
  desat = 0,
  alpha = 1,
  boundary = 0,
  boundaryOsc = true,
  pad,
  padTop,
}) => {
  const P = pad ?? Math.round(width * 0.04);
  const PT = padTop ?? P * 0.6 + 26;
  const innerW = width - P * 2;
  const innerH = height - PT - P;
  const cw = innerW / cells;
  const ch = innerH / cells;
  const bx = boundaryAt(t, boundaryOsc);

  // 碎块位移：每块一个固定偏移，随时间轻微加剧
  const chunkVec: Array<[number, number]> = [];
  for (let i = 0; i < Math.max(1, chunkBreak); i++) {
    const a = prng(i * 9176 + 3) * Math.PI * 2;
    const m = 6 + prng(i * 4421 + 7) * 16;
    chunkVec.push([Math.cos(a) * m, Math.sin(a) * m]);
  }

  const items: React.ReactNode[] = [];
  for (let r = 0; r < cells; r++) {
    for (let c = 0; c < cells; c++) {
      const cx = (c + 0.5) / cells;
      const d = Math.abs(cx - bx);
      const near = boundary > 0 ? Math.max(0, 1 - d / 0.18) * boundary : 0;
      const n = prng(r * 131 + c * 17 + Math.floor(t * 3) * 7) - 0.5;

      let v = 0.16 + 0.34 * near + n * noise * 6;
      v = Math.max(0, Math.min(1, v));

      // 碎块位移
      let dx = 0;
      let dy = 0;
      if (chunkBreak > 0) {
        const [ox, oy] = chunkVec[chunkOf(r, c, chunkBreak)];
        dx = ox;
        dy = oy;
      }
      // 逐格错位
      if (jitterPx > 0) {
        dx += (prng(r * 31 + c * 77 + Math.floor(t * 24) * 5) * 2 - 1) * jitterPx;
        dy += (prng(r * 53 + c * 91 + Math.floor(t * 24) * 11) * 2 - 1) * jitterPx;
      }

      const hue = hueMin + hueMax === 0 ? 0 : hueMin + (hueMax - hueMin) * ((c / cells) * 0.6 + 0.2 * Math.sin(t * 0.2 + r * 0.3)) + hueShift;
      const sat = 78 * (1 - desat);

      // 往红色混。
      // 红色状态下额外抬高一点不透明度 —— 否则验收标准里的「红色占比 > 90%」达不到。
      const red = Math.max(0, Math.min(1, redRatio));
      const light = 16 + v * 42;
      const a = alpha * (0.10 + red * 0.26 + v * 0.72);
      const color =
        red > 0.001
          ? `rgba(${Math.round(255 * red + 40 * (1 - red))}, ${Math.round(59 * red + 160 * (1 - red))}, ${Math.round(48 * red + 255 * (1 - red))}, ${a.toFixed(3)})`
          : `hsla(${hue.toFixed(0)}, ${sat.toFixed(0)}%, ${light.toFixed(0)}%, ${(alpha * (0.10 + v * 0.72)).toFixed(3)})`;

      items.push(
        <div
          key={`${r}-${c}`}
          style={{
            position: 'absolute',
            left: c * cw + 1 + dx,
            top: r * ch + 1 + dy,
            width: cw - 2,
            height: ch - 2,
            borderRadius: 2,
            backgroundColor: color,
            border: near > 0.55 ? `1px solid ${red > 0.3 ? 'rgba(255,90,80,' : 'hsla(' + hue.toFixed(0) + ',90%,70%,'}${(near * 0.35).toFixed(2)})` : 'none',
          }}
        />
      );
    }
  }

  return <div style={{ position: 'absolute', left: P, top: PT, width: innerW, height: innerH }}>{items}</div>;
};
