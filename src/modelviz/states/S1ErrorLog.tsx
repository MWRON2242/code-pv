import React from 'react';
import type { StateProps } from '../types';
import { GridField } from '../GridField';
import { prng } from '../../lib/beats';

/* ============================================================================
 * S1 · 错误日志（规格 §3）
 * 网格错位 ±3px，黄色 warning 文本滚动（5 行/秒），色相偏移 +20。
 * 触发：46.620s（「即使在心里划下一条线」），延迟 0.5s，过渡 1.2s，ease-in-out
 *
 * 这一状态很长（46.6 → 61.8 秒，约 15 秒），所以日志要持续滚动，
 * 而且滚动速度受段落强度影响。
 * ==========================================================================*/

const MSGS = [
  'boundary unstable  margin 0.004',
  'unclassified vector  cluster 0x1f',
  'gradient descent stalled  step 000000',
  'loss not decreasing  plateau detected',
  'ambiguous input  refusing to answer',
  'memory write deferred  slot full',
  'line drawn  cannot be erased',
  'attention drift  head 07',
  'tokenizer warning  byte-level fallback',
];

export const S1ErrorLog: React.FC<StateProps> = ({ t, local, params, width, height, intensity }) => {
  const jitter = (params.jitterPx ?? 3) * Math.min(1, local / 0.6);
  const hueShift = (params.hueShift ?? 20) * Math.min(1, local / 1.2);
  const perSec = (params.warnPerSec ?? 5) * (0.55 + intensity * 0.75);

  const P = Math.round(width * 0.04);
  const lineH = 15;

  // 滚动日志：行数从 **S1 自己开始的那一刻** 起算。
  // 曾经写成 Math.floor(t * perSec)（从全片 0 秒起算），
  // 结果 t=48.5s 时时间戳已经跑到 95 秒去了。
  const s1Start = 46.62;
  const sinceS1 = Math.max(0, t - s1Start);
  const total = Math.floor(sinceS1 * perSec);
  const rows = 14;
  const lines: React.ReactNode[] = [];
  for (let k = 0; k < rows; k++) {
    const idx = total - k;
    if (idx < 0) continue;
    const m = MSGS[Math.floor(prng(idx * 13) * MSGS.length) % MSGS.length];
    const bright = k === 0;
    lines.push(
      <div
        key={k}
        style={{
          fontFamily: 'Consolas, monospace',
          fontSize: 12,
          lineHeight: `${lineH}px`,
          color: bright ? '#ffffff' : '#d29922',
          opacity: bright ? 1 : 0.30 + (1 - k / rows) * 0.5,
          whiteSpace: 'pre',
        }}
      >
        {`[${(s1Start + idx / perSec).toFixed(2).padStart(7, '0')}] WARN  ${m}`}
      </div>
    );
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
        <span style={{ color: '#d29922', letterSpacing: 2 }}>WARN STREAM</span>
        <span>jitter ±{jitter.toFixed(1)}px</span>
        <span>hue +{hueShift.toFixed(0)}</span>
        <span style={{ marginLeft: 'auto' }}>{perSec.toFixed(1)} lines/s</span>
      </div>

      {/* 错位并偏黄的网格 */}
      <GridField
        t={t}
        width={width}
        height={height}
        cells={16}
        hueMin={180}
        hueMax={220}
        noise={0.02}
        jitterPx={jitter}
        hueShift={hueShift}
        boundary={0.45}
        alpha={0.82}
      />

      {/* 日志面板：压在网格右侧，半透明底 */}
      <div
        style={{
          position: 'absolute',
          right: P,
          top: P * 0.6 + 26 + Math.round(height * 0.10),
          width: Math.round(width * 0.46),
          padding: '8px 10px',
          background: 'rgba(6,10,16,0.72)',
          border: '1px solid rgba(210,153,34,0.35)',
          borderRadius: 6,
          overflow: 'hidden',
        }}
      >
        {lines}
      </div>
    </div>
  );
};
