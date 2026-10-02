import React from 'react';
import type { StateProps } from '../types';
import { GridField } from '../GridField';
import { NoiseField } from '../NoiseField';
import { prng } from '../../lib/beats';

/* ============================================================================
 * S8 · 去饱和（规格 §3）
 * 视觉：灰粉，网格褪色，噪点变薄
 * 参数：饱和度 100% → 10%，噪点密度 0.4 → 0.05，过渡 6s
 * 前置：S7→S8 红色冷却 —— 红色 #FF3B30 → #8B6B6B，怪物蠕动 2Hz → 0.2Hz，过渡 4s
 * 触发：152.919s（「想了又想也想不明白」第 4 次）开始冷却
 *       154.759s（「光是活着就已经很痛苦了」）开始去饱和
 *
 * ⚠ 验收标准：「本段红色像素占比必须低于上一段高潮的 50%」。
 *   所以红色的消退是**先快后慢**的：前 4 秒就把红压掉大半，
 *   否则这一段的前几秒会在像素统计上和 S7 差不多红。
 * ==========================================================================*/

const clamp01 = (x: number) => (x < 0 ? 0 : x > 1 ? 1 : x);

export const S8Desaturate: React.FC<StateProps> = ({ t, local, params, width, height }) => {
  const s8Start = t - local;
  const coolSec = params.coolSec ?? 4;
  const satAt = params.satAt ?? s8Start + 1.84;

  // 红色冷却：4 秒内从满红退到 #8B6B6B 那一档
  const cool = clamp01(local / coolSec);
  // 去饱和：6 秒内从 100% 到 10%
  const desat = clamp01((t - satAt) / 6);
  // 噪点：0.4 → 0.05
  const density = (params.noiseFrom ?? 0.4) + ((params.noiseTo ?? 0.05) - 0.4) * desat;

  const redRatio = (params.fromRedRatio ?? 0.8) * (1 - cool) * 0.5;

  // 怪物残留：蠕动从 2Hz 降到 0.2Hz，同时整体隐去
  const crawl = (params.crawlFrom ?? 2) + ((params.crawlTo ?? 0.2) - 2) * cool;
  const monsterFade = (1 - cool) * (1 - desat) * 0.5;

  const cx = width * 0.5;
  const cy = height * 0.52;
  const R = Math.min(width, height) * 0.3;

  const pts: string[] = [];
  if (monsterFade > 0.01) {
    const V = 20;
    for (let i = 0; i < V; i++) {
      const a = (i / V) * Math.PI * 2 - Math.PI / 2;
      const wob = 1 + 0.22 * Math.sin(t * Math.PI * 2 * crawl + i * 1.7);
      const r = R * wob * (0.62 + prng(i * 97 + 13) * 0.75);
      pts.push(`${(cx + Math.cos(a) * r).toFixed(1)},${(cy + Math.sin(a) * r).toFixed(1)}`);
    }
  }

  return (
    <div style={{ position: 'absolute', inset: 0, backgroundColor: '#0b0b0c' }}>
      <GridField
        t={t}
        width={width}
        height={height}
        cells={16}
        hueMin={180}
        hueMax={220}
        noise={0.02}
        redRatio={redRatio}
        desat={desat * 0.9}
        alpha={0.4 + (1 - desat) * 0.5}
        boundary={0}
      />

      <NoiseField t={t} width={width} height={height} density={density} speed={0.7} count={700} />

      {monsterFade > 0.01 && (
        <svg width={width} height={height} style={{ position: 'absolute', inset: 0 }}>
          <path
            d={'M' + pts.join('L') + 'Z'}
            fill="none"
            stroke={`rgba(${Math.round(255 - cool * 116)},${Math.round(59 + cool * 48)},${Math.round(48 + cool * 59)},${monsterFade.toFixed(2)})`}
            strokeWidth={1.4}
            strokeDasharray="6 5"
          />
        </svg>
      )}

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
        <span style={{ color: '#8b949e', letterSpacing: 2 }}>DESATURATE</span>
        <span>sat {(100 - desat * 90).toFixed(0)}%</span>
        <span>noise {density.toFixed(2)}</span>
        <span>crawl {crawl.toFixed(1)}Hz</span>
        <span style={{ marginLeft: 'auto' }}>red {(redRatio * 100).toFixed(0)}%</span>
      </div>
    </div>
  );
};
