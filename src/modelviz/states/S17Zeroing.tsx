import React from 'react';
import type { StateProps } from '../types';
import { prng } from '../../lib/beats';

/* ============================================================================
 * S17 · 归零（规格 §3）
 * 视觉：流量曲线下跌到 0，归档
 * 参数：曲线 200px → 0px，归档动画 1.5s
 * 触发：225.550s（「能走红这件事」「曾经怎样都好」）
 * ==========================================================================*/

const clamp01 = (x: number) => (x < 0 ? 0 : x > 1 ? 1 : x);

export const S17Zeroing: React.FC<StateProps> = ({ t, local, params, width, height }) => {
  const from = params.curveFromPx ?? 200;
  const drop = clamp01(local / 2.2);
  const h = from * (1 - drop);
  const archive = clamp01((local - 2.2) / (params.archiveSec ?? 1.5));

  const W = Math.min(420, width * 0.62);
  const x0 = (width - W) / 2;
  const baseY = height * 0.62;

  // 曲线：右侧高，被拉到 0
  const pts: string[] = [];
  for (let i = 0; i <= 40; i++) {
    const k = i / 40;
    const x = x0 + k * W;
    const shaped = Math.sin(k * Math.PI) * 0.35 + k * 0.9;
    const y = baseY - shaped * h;
    pts.push(`${x.toFixed(1)},${y.toFixed(1)}`);
  }

  return (
    <div style={{ position: 'absolute', inset: 0, backgroundColor: '#131417' }}>
      <svg width={width} height={height} style={{ position: 'absolute', inset: 0 }}>
        <line x1={x0} y1={baseY} x2={x0 + W} y2={baseY} stroke="rgba(150,158,170,0.35)" strokeWidth={1} />
        <polyline points={pts.join(' ')} fill="none" stroke="rgba(201,209,217,0.75)" strokeWidth={1.6} />

        {/* 归档：曲线折叠成一条扁线，收进一个框 */}
        {archive > 0.01 && (
          <g opacity={archive}>
            <rect
              x={x0 + W * 0.5 - 60}
              y={baseY - 6}
              width={120}
              height={12}
              fill="none"
              stroke="rgba(150,158,170,0.5)"
              strokeWidth={1}
            />
            <text
              x={x0 + W * 0.5}
              y={baseY + 30}
              textAnchor="middle"
              fill="rgba(150,158,170,0.6)"
              fontSize={10}
              fontFamily="Consolas, monospace"
            >
              archived
            </text>
          </g>
        )}

        {/* 归零处的那个点 */}
        <circle cx={x0 + W} cy={baseY - h * 0.9} r={3} fill="rgba(201,209,217,0.9)" />
      </svg>

      {/* 灰尘一样的残余数字 */}
      {Array.from({ length: 14 }).map((_, i) => (
        <div
          key={i}
          style={{
            position: 'absolute',
            left: x0 + prng(i * 13) * W,
            top: baseY + 40 + prng(i * 17) * 60,
            fontFamily: 'Consolas, monospace',
            fontSize: 10,
            color: `rgba(150,158,170,${(0.15 + prng(i * 19) * 0.3) * (1 - archive * 0.7)})`,
          }}
        >
          {prng(i * 23 + Math.floor(t)) > 0.5 ? '0' : '0.0'}
        </div>
      ))}

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
        <span style={{ color: '#8b949e', letterSpacing: 2 }}>ZEROING</span>
        <span>{from}px → 0</span>
        <span style={{ marginLeft: 'auto' }}>流量预测：0</span>
      </div>
    </div>
  );
};
