import React from 'react';
import type { StateProps } from '../types';
import { prng } from '../../lib/beats';

/* ============================================================================
 * S6 · 防卫本能（规格 §3）
 * 视觉：怪物蜷缩成壳，壳上密集文字
 * 参数：壳半径 200px，文字密度 20 行/屏，包含「防卫」
 * 触发：131.250s（「这不过是防卫本能」）
 *
 * ⚠ 验收标准：**壳上文字必须可读，包含「防卫」**。
 *   所以字号不能太小、对比度不能太低 —— 这一条要能用一个静帧直接判。
 * ==========================================================================*/

const clamp01 = (x: number) => (x < 0 ? 0 : x > 1 ? 1 : x);

const SHELL_WORDS = [
  '防卫', '防御', '不必了', '我不需要', '别靠近', '没关系的', '我一个人也行',
  '防卫', '不用理解我', '这不是你的错', '防卫', '习惯了', '你别管',
  '我很好', '防卫', '真的', '早就不在意了', '防卫', '没事的', '就这样吧',
  '防卫', '不需要', '我不疼', '防卫', '别再问了', '我没事', '防卫',
];

export const S6Shell: React.FC<StateProps> = ({ t, local, params, width, height }) => {
  const R = Math.min(params.shellRadius ?? 200, Math.min(width, height) * 0.42);
  const lines = Math.min(28, params.textLines ?? 20);
  // 蜷缩过程：从怪物姿态收成壳
  const curl = clamp01(local / 1.5);
  const breathe = 1 + 0.012 * Math.sin(t * Math.PI * 2 * 0.5);

  const cx = width * 0.5;
  const cy = height * 0.52;

  // 壳的外缘：用顶点画一个抖动的圆，暗示这是蜷起来的怪物
  const edge: Array<[number, number]> = [];
  const V = 16;
  for (let i = 0; i < V; i++) {
    const a = (i / V) * Math.PI * 2;
    const r = R * breathe * (0.94 + prng(i * 41 + 7) * 0.12);
    edge.push([cx + Math.cos(a) * r, cy + Math.sin(a) * r]);
  }

  const textLines: React.ReactNode[] = [];
  const lineH = (R * 1.7) / lines;
  for (let i = 0; i < lines; i++) {
    const row: string[] = [];
    let x = 0;
    while (x < R * 1.5) {
      const w = SHELL_WORDS[Math.floor(prng(i * 97 + x * 0.11) * SHELL_WORDS.length) % SHELL_WORDS.length];
      row.push(w);
      x += w.length * 12 + 8;
    }
    textLines.push(
      <div
        key={i}
        style={{
          fontFamily: '"Microsoft YaHei", system-ui, sans-serif',
          fontSize: 11,
          lineHeight: `${lineH}px`,
          color: i % 4 === 0 ? 'rgba(210,215,222,0.62)' : 'rgba(150,158,170,0.40)',
          whiteSpace: 'nowrap',
          paddingLeft: prng(i * 13) * 30,
        }}
      >
        {row.join('  ')}
      </div>
    );
  }

  return (
    <div style={{ position: 'absolute', inset: 0, backgroundColor: '#080a0e' }}>
      <svg width={width} height={height} style={{ position: 'absolute', inset: 0 }}>
        <path
          d={'M' + edge.map((p) => `${p[0].toFixed(1)},${p[1].toFixed(1)}`).join('L') + 'Z'}
          fill="rgba(16,20,27,0.97)"
          stroke={`rgba(120,132,150,${(0.35 + curl * 0.4).toFixed(2)})`}
          strokeWidth={1.6}
        />
      </svg>

      {/* 壳上的文字：裁剪成圆形，保证「在里面」 */}
      <div
        style={{
          position: 'absolute',
          left: cx - R,
          top: cy - R * 0.85,
          width: R * 2,
          height: R * 1.7,
          borderRadius: '50%',
          overflow: 'hidden',
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'center',
          opacity: 0.35 + curl * 0.65,
        }}
      >
        {textLines}
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
        <span style={{ color: '#3fb950', letterSpacing: 2 }}>DEFENSE SHELL</span>
        <span>r {Math.round(R)}px</span>
        <span>{lines} lines</span>
        <span style={{ marginLeft: 'auto', color: '#3fb950' }}>检测到心理防御机制</span>
      </div>
    </div>
  );
};
