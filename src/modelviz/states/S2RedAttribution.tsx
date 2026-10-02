import React from 'react';
import type { StateProps } from '../types';
import { GridField } from '../GridField';
import { prng } from '../../lib/beats';

/* ============================================================================
 * S2 · 红色归因（规格 §3）
 * 网格破碎成块，红色 error 刷屏，指向某个节点。
 * 参数：碎块 8–12 个，红色 #FF3B30，归因箭头闪烁 4Hz。
 * 触发：61.810s（「是错的啊」），立即，0.8s，ease-out
 * ==========================================================================*/

const ERRORS = [
  'FATAL  attribution failed  target unresolved',
  'ERROR  blame assigned to node 0x00  (AI)',
  'FATAL  cannot locate cause  retrying',
  'ERROR  human: unknown  input rejected',
  'FATAL  responsibility overflow',
];

export const S2RedAttribution: React.FC<StateProps> = ({ t, local, params, width, height, intensity }) => {
  const chunks = params.chunks ?? 10;
  const red = params.red ?? '#FF3B30';
  const hz = (params.arrowHz ?? 4) * (0.6 + intensity * 0.8);
  const on = Math.sin(t * Math.PI * 2 * hz) > 0; // 4Hz 闪烁

  const P = Math.round(width * 0.04);
  // 被归因的那个节点
  const nodeX = P + (width - P * 2) * 0.74;
  const nodeY = P * 0.6 + 26 + (height - P * 0.6 - 26 - P) * 0.46;

  // 箭头：从若干碎块指向节点
  const arrows: React.ReactNode[] = [];
  if (on) {
    for (let i = 0; i < 5; i++) {
      const ax = P + (width - P * 2) * (0.08 + prng(i * 71 + 3) * 0.42);
      const ay = P * 0.6 + 26 + (height - P * 0.6 - 26 - P) * (0.12 + prng(i * 37 + 9) * 0.72);
      const dx = nodeX - ax;
      const dy = nodeY - ay;
      const len = Math.sqrt(dx * dx + dy * dy);
      const ang = (Math.atan2(dy, dx) * 180) / Math.PI;
      arrows.push(
        <div
          key={i}
          style={{
            position: 'absolute',
            left: ax,
            top: ay,
            width: len,
            height: 2,
            backgroundColor: red,
            opacity: 0.55 + 0.35 * Math.sin(t * 9 + i),
            transform: `rotate(${ang}deg)`,
            transformOrigin: '0 0',
          }}
        >
          <div
            style={{
              position: 'absolute',
              right: -1,
              top: -5,
              width: 0,
              height: 0,
              borderTop: '6px solid transparent',
              borderBottom: '6px solid transparent',
              borderLeft: `10px solid ${red}`,
            }}
          />
        </div>
      );
    }
  }

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
        <span style={{ color: red, letterSpacing: 2 }}>ATTRIBUTION</span>
        <span>chunks {chunks}</span>
        <span>{hz.toFixed(1)} Hz</span>
        <span style={{ marginLeft: 'auto', color: red }}>target: node 0x00</span>
      </div>

      {/* 破碎的网格 */}
      <GridField
        t={t}
        width={width}
        height={height}
        cells={16}
        hueMin={180}
        hueMax={220}
        noise={0.03}
        chunkBreak={chunks}
        redRatio={Math.min(1, 0.55 + local * 0.35)}
        boundary={0}
        alpha={0.95}
      />

      {/* 红色 error 刷屏 */}
      <div
        style={{
          position: 'absolute',
          left: P,
          bottom: P,
          width: Math.round(width * 0.62),
          fontFamily: 'Consolas, monospace',
          fontSize: 12,
          lineHeight: '16px',
        }}
      >
        {ERRORS.map((m, i) => (
          <div key={i} style={{ color: red, opacity: 0.35 + prng(i * 17 + Math.floor(t * 3)) * 0.6 }}>
            {m}
          </div>
        ))}
      </div>

      {/* 被指向的节点 */}
      <div
        style={{
          position: 'absolute',
          left: nodeX,
          top: nodeY,
          width: 20 + (on ? 8 : 0),
          height: 20 + (on ? 8 : 0),
          marginLeft: -(20 + (on ? 8 : 0)) / 2,
          marginTop: -(20 + (on ? 8 : 0)) / 2,
          borderRadius: '50%',
          border: `2px solid ${red}`,
          backgroundColor: `rgba(255,59,48,${on ? 0.55 : 0.2})`,
          boxShadow: `0 0 ${on ? 26 : 10}px ${red}`,
        }}
      />
    </div>
  );
};
