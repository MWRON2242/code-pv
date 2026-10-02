import React from 'react';
import type { StateProps } from '../types';
import { prng } from '../../lib/beats';

/* ============================================================================
 * S5 · 怪物劣等感（规格 §3）
 * 视觉：向量纠合成生物，残差骨骼，错误皮肤，红色×眼睛
 * 参数：怪物顶点数 12-20，蠕动频率 2Hz，眼睛 4Hz 闪烁
 * 触发：116.370s（「无法被满足的脑海深处」）开始变形
 *       120.359s（「像怪物一样的劣等感」）完全体
 *
 * ⚠ 验收标准：**怪物必须是向量/代码构成，不能写实**。
 *   所以整个怪物只用多边形顶点 + 连线 + 十字标记画出来，
 *   连"皮肤"都是虚线路径，不用任何位图或渐变塑形。
 * ==========================================================================*/

const clamp01 = (x: number) => (x < 0 ? 0 : x > 1 ? 1 : x);

/** 用 N 个顶点生成怪物轮廓；蠕动让每个顶点按正弦前后推拉 */
function monsterPoints(
  t: number,
  verts: number,
  radius: number,
  cx: number,
  cy: number,
  crawlHz: number,
  spread: number
): Array<[number, number]> {
  const pts: Array<[number, number]> = [];
  for (let i = 0; i < verts; i++) {
    const a = (i / verts) * Math.PI * 2 - Math.PI / 2;
    const wob = 1 + 0.22 * Math.sin(t * Math.PI * 2 * crawlHz + i * 1.7);
    const jag = 0.62 + prng(i * 97 + 13) * 0.75;
    const r = radius * wob * jag * spread;
    pts.push([cx + Math.cos(a) * r, cy + Math.sin(a) * r]);
  }
  return pts;
}

const toPath = (pts: Array<[number, number]>, close = true) =>
  'M' + pts.map((p) => `${p[0].toFixed(1)},${p[1].toFixed(1)}`).join('L') + (close ? 'Z' : '');

export const S5Monster: React.FC<StateProps> = ({ t, local, params, width, height }) => {
  const verts = Math.max(12, Math.min(20, Math.round(params.verticesMin ?? 12) + Math.round(local * 1.6)));
  const crawlHz = params.crawlHz ?? 2;
  const eyeHz = params.eyeHz ?? 4;
  const eyeOn = Math.sin(t * Math.PI * 2 * eyeHz) > 0;

  const s5Start = t - local;
  const fullAt = params.fullAt ?? s5Start + 4;
  const form = clamp01((t - s5Start) / Math.max(0.2, fullAt - s5Start));
  const chestAt = params.chestAt;
  const chestIn = chestAt ? clamp01((t - chestAt) / 1.2) : 0;

  const cx = width * 0.5;
  const cy = height * 0.52;
  const R = Math.min(width, height) * 0.30;

  const pts = monsterPoints(t, verts, R, cx, cy, crawlHz, 0.55 + form * 0.45);
  const skinPts = monsterPoints(t, verts, R * 1.12, cx, cy, crawlHz, 0.5 + form * 0.5);

  const eyes: React.ReactNode[] = [];
  for (const sx of [-1, 1]) {
    const ex = cx + sx * R * 0.34;
    const ey = cy - R * 0.20;
    const s = 11;
    eyes.push(
      <g key={sx} opacity={eyeOn ? 1 : 0.28}>
        <line x1={ex - s} y1={ey - s} x2={ex + s} y2={ey + s} stroke="#FF3B30" strokeWidth={2.6} />
        <line x1={ex + s} y1={ey - s} x2={ex - s} y2={ey + s} stroke="#FF3B30" strokeWidth={2.6} />
        <circle cx={ex} cy={ey} r={13} fill="none" stroke="rgba(255,59,48,0.35)" strokeWidth={1} />
      </g>
    );
  }

  // 残差骨骼：从中心连到每个顶点
  const bones = pts.map((p, i) => (
    <line
      key={i}
      x1={cx}
      y1={cy}
      x2={p[0]}
      y2={p[1]}
      stroke={`rgba(88,166,255,${(0.10 + prng(i * 7) * 0.22).toFixed(2)})`}
      strokeWidth={1}
    />
  ));

  return (
    <div style={{ position: 'absolute', inset: 0, backgroundColor: '#080a0e' }}>
      <svg width={width} height={height} style={{ position: 'absolute', inset: 0 }}>
        {/* 错误皮肤：外面一圈虚线抖动轮廓 */}
        <path
          d={toPath(skinPts)}
          fill="none"
          stroke="rgba(255,59,48,0.42)"
          strokeWidth={1.4}
          strokeDasharray="5 4"
          opacity={0.35 + form * 0.55}
        />
        {/* 怪物本体 */}
        <path d={toPath(pts)} fill="rgba(18,24,34,0.94)" stroke="rgba(120,170,230,0.55)" strokeWidth={1.5} />
        {bones}
        {pts.map((p, i) => (
          <circle key={i} cx={p[0]} cy={p[1]} r={2.4} fill="rgba(160,200,255,0.85)" />
        ))}
        {eyes}
        {/* 胸口：规格 §4.3「怪物胸口亮起『没有错』」 */}
        {chestIn > 0.01 && (
          <g opacity={chestIn}>
            <circle cx={cx} cy={cy + R * 0.22} r={26 + chestIn * 6} fill="rgba(255,59,48,0.10)" stroke="rgba(255,59,48,0.5)" strokeWidth={1} />
            <text
              x={cx}
              y={cy + R * 0.22 + 5}
              textAnchor="middle"
              fill="rgba(255,120,110,0.95)"
              fontSize={13}
              fontFamily='"Microsoft YaHei", system-ui, sans-serif'
            >
              没有错
            </text>
          </g>
        )}
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
        <span style={{ color: '#58a6ff', letterSpacing: 2 }}>RESIDUAL BODY</span>
        <span>vertices {verts}</span>
        <span>crawl {crawlHz}Hz</span>
        <span>eyes {eyeHz}Hz</span>
        <span style={{ marginLeft: 'auto', color: form < 1 ? '#d29922' : '#FF3B30' }}>
          {form < 1 ? `forming ${(form * 100).toFixed(0)}%` : '劣等感：完全体'}
        </span>
      </div>
    </div>
  );
};
