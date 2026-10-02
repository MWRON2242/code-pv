import React from 'react';
import type { StateProps } from '../types';
import { prng } from '../../lib/beats';

/* ============================================================================
 * S7 · 二次归因（规格 §3）
 * 视觉：壳裂，红色渗出，箭头从怪物胸口射出指向 AI
 * 参数：裂缝 6-8 条，红色 #FF3B30，箭头闪烁 4Hz
 * 触发：136.310s（「怎样都好吗 都是你的错」），延迟 0.5s，过渡 1.0s
 *
 * ⚠ 验收标准：**箭头起点在怪物胸口，终点在 AI 节点**。
 *   所以箭头是从壳内部画到右侧的 AI 节点，不是从外面指进来。
 * ==========================================================================*/

const clamp01 = (x: number) => (x < 0 ? 0 : x > 1 ? 1 : x);

export const S7SecondAttribution: React.FC<StateProps> = ({ t, local, params, width, height }) => {
  const cracks = Math.max(6, Math.min(8, params.cracks ?? 7));
  const red = params.red ?? '#FF3B30';
  const hz = params.arrowHz ?? 4;
  const on = Math.sin(t * Math.PI * 2 * hz) > 0;
  const open = clamp01(local / 1.2);

  const cx = width * 0.46;
  const cy = height * 0.52;
  const R = Math.min(width, height) * 0.27;

  // 壳：上一状态的延续
  const edge: Array<[number, number]> = [];
  const V = 16;
  for (let i = 0; i < V; i++) {
    const a = (i / V) * Math.PI * 2;
    const r = R * (0.94 + prng(i * 41 + 7) * 0.12);
    edge.push([cx + Math.cos(a) * r, cy + Math.sin(a) * r]);
  }

  // 裂缝：从中心附近向外，末端分叉
  const crackPaths: React.ReactNode[] = [];
  for (let i = 0; i < cracks; i++) {
    const a = (i / cracks) * Math.PI * 2 + prng(i * 19) * 0.5;
    const len = R * (0.62 + prng(i * 53) * 0.5) * open;
    const x1 = cx + Math.cos(a) * R * 0.12;
    const y1 = cy + Math.sin(a) * R * 0.12;
    const x2 = cx + Math.cos(a) * len;
    const y2 = cy + Math.sin(a) * len;
    const mx = (x1 + x2) / 2 + Math.cos(a + 1.4) * 9;
    const my = (y1 + y2) / 2 + Math.sin(a + 1.4) * 9;
    crackPaths.push(
      <g key={i}>
        <path d={`M${x1},${y1} Q${mx},${my} ${x2},${y2}`} stroke="rgba(0,0,0,0.85)" strokeWidth={3.4} fill="none" />
        <path d={`M${x1},${y1} Q${mx},${my} ${x2},${y2}`} stroke={red} strokeWidth={1.3} fill="none" opacity={0.55 + open * 0.4} />
      </g>
    );
  }

  // 渗出：裂缝外侧的红色晕
  const seeps = Array.from({ length: cracks }).map((_, i) => {
    const a = (i / cracks) * Math.PI * 2 + prng(i * 19) * 0.5;
    const d = R * (1.0 + prng(i * 71) * 0.35) * open;
    return (
      <circle
        key={i}
        cx={cx + Math.cos(a) * d}
        cy={cy + Math.sin(a) * d}
        r={5 + prng(i * 23) * 9 * open}
        fill={red}
        opacity={0.16 + prng(i * 31 + Math.floor(t * 3)) * 0.22}
      />
    );
  });

  // 箭头：起点在胸口，终点在 AI 节点
  const nodeX = width * 0.86;
  const nodeY = height * 0.30;
  const dx = nodeX - cx;
  const dy = nodeY - cy;
  const ang = (Math.atan2(dy, dx) * 180) / Math.PI;
  const arrows: React.ReactNode[] = [];
  if (on) {
    for (let i = 0; i < 3; i++) {
      const off = (i - 1) * 0.11;
      arrows.push(
        <div
          key={i}
          style={{
            position: 'absolute',
            left: cx,
            top: cy,
            width: Math.sqrt(dx * dx + dy * dy),
            height: 2,
            backgroundColor: red,
            opacity: 0.5 + 0.4 * Math.sin(t * 9 + i),
            transform: `rotate(${(ang + off * 16).toFixed(2)}deg)`,
            transformOrigin: '0 0',
          }}
        >
          <div
            style={{
              position: 'absolute',
              right: -2,
              top: -5,
              width: 0,
              height: 0,
              borderTop: '6px solid transparent',
              borderBottom: '6px solid transparent',
              borderLeft: `11px solid ${red}`,
            }}
          />
        </div>
      );
    }
  }

  return (
    <div style={{ position: 'absolute', inset: 0, backgroundColor: '#080a0e' }}>
      <svg width={width} height={height} style={{ position: 'absolute', inset: 0 }}>
        <path
          d={'M' + edge.map((p) => `${p[0].toFixed(1)},${p[1].toFixed(1)}`).join('L') + 'Z'}
          fill="rgba(16,20,27,0.97)"
          stroke="rgba(150,158,170,0.5)"
          strokeWidth={1.6}
        />
        {seeps}
        {crackPaths}
      </svg>

      {arrows}

      {/* 被指向的 AI 节点 */}
      <div
        style={{
          position: 'absolute',
          left: nodeX,
          top: nodeY,
          width: 46,
          height: 46,
          marginLeft: -23,
          marginTop: -23,
          borderRadius: 8,
          border: `2px solid ${red}`,
          backgroundColor: `rgba(255,59,48,${on ? 0.28 : 0.10})`,
          boxShadow: `0 0 ${on ? 30 : 10}px ${red}`,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          fontFamily: 'Consolas, monospace',
          fontSize: 13,
          color: red,
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
        <span style={{ color: red, letterSpacing: 2 }}>ATTRIBUTION II</span>
        <span>cracks {cracks}</span>
        <span>{hz}Hz</span>
        <span style={{ marginLeft: 'auto', color: red }}>chest → node AI</span>
      </div>
    </div>
  );
};
