import React from 'react';
import { prng } from '../lib/beats';

/* ============================================================================
 * NoiseField · 灰白噪点层
 * ----------------------------------------------------------------------------
 * S4「空荡」与 S8「去饱和」共用。规格给的参数：
 *   S3→S4：红色占比 90% → 5%，噪点密度 0.1 → 0.4
 *   S8   ：噪点密度 0.4 → 0.05
 *
 * 用确定性伪随机，保证同一帧永远画得一样 —— 渲染才能并行、才能复现。
 * ==========================================================================*/

export const NoiseField: React.FC<{
  t: number;
  width: number;
  height: number;
  /** 0~1 的噪点密度 */
  density: number;
  /** 噪点颜色，默认灰白 */
  color?: string;
  /** 每帧刷新率倍率：太快的噪点会闪，慢了会像蒙尘 */
  speed?: number;
  count?: number;
}> = ({ t, width, height, density, color = '210,215,222', speed = 1, count = 900 }) => {
  const n = Math.round(count * Math.max(0, Math.min(1, density)) * 2.2);
  const grains: React.ReactNode[] = [];
  // 每 1/12 秒换一批，避免逐帧狂闪（逐帧闪的噪点看着像故障，不像空荡）
  const tick = Math.floor(t * 12 * speed);

  for (let i = 0; i < n; i++) {
    const x = prng(i * 3 + tick * 101) * width;
    const y = prng(i * 7 + tick * 211) * height;
    const a = 0.06 + prng(i * 11 + tick * 307) * 0.5;
    const s = prng(i * 13 + tick * 401) > 0.86 ? 2 : 1;
    grains.push(
      <div
        key={i}
        style={{
          position: 'absolute',
          left: x,
          top: y,
          width: s,
          height: s,
          backgroundColor: `rgba(${color},${a.toFixed(3)})`,
        }}
      />
    );
  }
  return <div style={{ position: 'absolute', inset: 0, overflow: 'hidden' }}>{grains}</div>;
};
