import React from 'react';
import type { StateProps } from '../types';
import { NoiseField } from '../NoiseField';
import { prng } from '../../lib/beats';

/* ============================================================================
 * S4 · 空荡（规格 §3）
 * 视觉：灰白噪点，胸腔空洞旋转
 * 参数：色相 0，饱和度 0，空洞旋转 0.5Hz
 * 触发：91.349s（「想了又想也想不明白」第 3 次），立即，过渡 2s
 *
 * 另外按规格 §4.3 的右窗栏补了几个逐步出现的元素：
 *   · 生命时间线 80% 处标红（93.34 秒起）
 *   · 数据坍缩成一个黑点（101.07 秒起）
 *   · 黑点放大，output: null（103.47 秒起）
 *   · 幸福表情被红叉标记（106.62 秒起）
 * ==========================================================================*/

const clamp01 = (x: number) => (x < 0 ? 0 : x > 1 ? 1 : x);
const fadeIn = (t: number, from: number, dur = 1.2) => clamp01((t - from) / dur);

export const S4Empty: React.FC<StateProps> = ({ t, local, params, width, height }) => {
  const hz = params.cavityHz ?? 0.5;
  // 红色占比 90% → 5%，噪点 0.1 → 0.4（规格 S3→S4）
  const red = (params.fromRedRatio ?? 0.9) + ((params.toRedRatio ?? 0.05) - 0.9) * clamp01(local / 2);
  const density = 0.1 + ((params.noiseTo ?? 0.4) - 0.1) * clamp01(local / 2);

  const timeline = fadeIn(t, 93.34);
  const dotIn = fadeIn(t, 101.069, 1.0);
  const dotGrow = fadeIn(t, 103.470, 1.6);
  const hateIn = fadeIn(t, 106.620, 1.2);

  const cx = width * 0.5;
  const cy = height * 0.48;
  const rot = t * 360 * hz;

  // 胸腔轮廓
  const rib = (i: number, side: number) => {
    const y0 = cy - 96 + i * 26;
    const w = 74 + i * 15;
    const bow = 26 + i * 4;
    return `M ${cx + side * 8} ${y0} Q ${cx + side * w} ${y0 + bow * 0.4} ${cx + side * (w - 6)} ${y0 + bow}`;
  };
  const ribs: React.ReactNode[] = [];
  for (let i = 0; i < 6; i++) {
    for (const side of [-1, 1]) {
      ribs.push(
        <path key={`${i}-${side}`} d={rib(i, side)} stroke="rgba(150,160,175,0.30)" strokeWidth={1.2} fill="none" />
      );
    }
  }

  return (
    <div style={{ position: 'absolute', inset: 0, backgroundColor: '#0a0b0d' }}>
      {/* 残留的红：从 90% 退到 5% */}
      <div style={{ position: 'absolute', inset: 0, backgroundColor: `rgba(255,59,48,${(red * 0.16).toFixed(3)})` }} />

      <NoiseField t={t} width={width} height={height} density={density} speed={1} />

      <svg width={width} height={height} style={{ position: 'absolute', inset: 0 }}>
        {ribs}
        {/* 空洞：旋转的同心弧 */}
        <g transform={`rotate(${rot.toFixed(1)} ${cx} ${cy})`}>
          {[0, 1, 2, 3, 4].map((i) => (
            <circle
              key={i}
              cx={cx}
              cy={cy}
              r={18 + i * 13}
              fill="none"
              stroke={`rgba(120,132,150,${(0.34 - i * 0.05).toFixed(2)})`}
              strokeWidth={1}
              strokeDasharray={`${4 + i * 3} ${9 + i * 4}`}
            />
          ))}
        </g>
        <circle cx={cx} cy={cy} r={5} fill="rgba(0,0,0,0.9)" />

        {/* 生命时间线：80% 处标红 */}
        {timeline > 0.01 && (
          <g opacity={timeline}>
            <line x1={cx - 150} y1={cy + 150} x2={cx + 150} y2={cy + 150} stroke="rgba(150,160,175,0.35)" strokeWidth={1.5} />
            <line
              x1={cx - 150}
              y1={cy + 150}
              x2={cx - 150 + 300 * 0.8}
              y2={cy + 150}
              stroke="#FF3B30"
              strokeWidth={2}
            />
            <text x={cx - 150} y={cy + 142} fill="rgba(150,160,175,0.6)" fontSize={10} fontFamily="Consolas, monospace">
              life 80%
            </text>
            <text x={cx + 158} y={cy + 154} fill="#FF3B30" fontSize={13} fontFamily="Consolas, monospace">
              ×
            </text>
          </g>
        )}

        {/* 黑点：数据堆积后坍缩，再放大 */}
        {dotIn > 0.01 && (
          <circle
            cx={cx + 196}
            cy={cy - 118}
            r={(3 + dotGrow * 30) * dotIn}
            fill="#000"
            stroke="rgba(150,160,175,0.4)"
            strokeWidth={1}
          />
        )}
      </svg>

      {dotGrow > 0.5 && (
        <div
          style={{
            position: 'absolute',
            right: 24,
            top: height * 0.18,
            fontFamily: 'Consolas, monospace',
            fontSize: 12,
            color: 'rgba(210,215,222,0.55)',
            opacity: Math.min(1, (dotGrow - 0.5) * 2),
          }}
        >
          output: null
        </div>
      )}

      {/* 幸福表情被红叉标记（规格 §4.3） */}
      {hateIn > 0.01 && (
        <div
          style={{
            position: 'absolute',
            left: 26,
            bottom: 54,
            opacity: hateIn,
            display: 'grid',
            gridTemplateColumns: 'repeat(4, 1fr)',
            gap: 8,
          }}
        >
          {Array.from({ length: 8 }).map((_, i) => {
            const crossed = prng(i * 31 + 5) > 0.35;
            return (
              <div
                key={i}
                style={{
                  width: 30,
                  height: 30,
                  borderRadius: 6,
                  backgroundColor: 'rgba(242,244,247,0.10)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontSize: 15,
                  position: 'relative',
                  filter: 'grayscale(1)',
                }}
              >
                {['🙂', '😊', '😄', '🙃'][i % 4]}
                {crossed && (
                  <svg width={30} height={30} style={{ position: 'absolute', inset: 0 }}>
                    <line x1={4} y1={4} x2={26} y2={26} stroke="#FF3B30" strokeWidth={2.5} />
                    <line x1={26} y1={4} x2={4} y2={26} stroke="#FF3B30" strokeWidth={2.5} />
                  </svg>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* 顶栏 */}
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
        <span style={{ color: '#8b949e', letterSpacing: 2 }}>EMPTY</span>
        <span>hue 0 · sat 0</span>
        <span>cavity {hz}Hz</span>
        <span>noise {density.toFixed(2)}</span>
      </div>
    </div>
  );
};
