import React from 'react';
import type { StateProps } from '../types';
import { prng } from '../../lib/beats';
import { ease } from '../easing';

/* ============================================================================
 * S19 · 收拢（规格 §3）
 * 视觉：所有元素向中心收拢
 * 参数：收拢时长 3s，ease-in
 * 触发：235.030s（「所以我」）
 *
 * ease-in 是关键：一开始几乎不动，越到后面越快被吸进去。
 * 用 easeOut 会变成"一下子散掉再慢慢聚"，和规格的意象相反。
 * ==========================================================================*/

export const S19Converge: React.FC<StateProps> = ({ local, params, width, height }) => {
  const dur = params.convergeSec ?? 3;
  const k = ease('easeIn', Math.min(1, local / dur));

  const cx = width * 0.5;
  const cy = height * 0.5;

  // 被吸进去的都是前面出现过的东西：灰块、日志点、两条曲线
  const items: React.ReactNode[] = [];
  const N = 42;
  for (let i = 0; i < N; i++) {
    const a = prng(i * 31 + 5) * Math.PI * 2;
    const r0 = (60 + prng(i * 53 + 11) * 420) * (1 - k);
    const x = cx + Math.cos(a) * r0;
    const y = cy + Math.sin(a) * r0 * 0.72;
    const size = (3 + prng(i * 17) * 9) * (1 - k * 0.75);
    const warm = prng(i * 71) > 0.7;
    items.push(
      <div
        key={i}
        style={{
          position: 'absolute',
          left: x,
          top: y,
          width: size,
          height: size,
          backgroundColor: warm ? '#d6b28c' : '#8b949e',
          opacity: (0.25 + prng(i * 29) * 0.5) * (1 - k * 0.35),
          transform: `rotate(${(prng(i * 13) - 0.5) * 120 * (1 - k)}deg)`,
        }}
      />
    );
  }

  // 日志文字也在被吸进去
  const words = ['TRUE', 'WAS TRUE', '0', 'null', '已记录'];
  const texts = words.map((w, i) => {
    const a = (i / words.length) * Math.PI * 2 + 0.6;
    const r0 = 300 * (1 - k);
    return (
      <div
        key={w}
        style={{
          position: 'absolute',
          left: cx + Math.cos(a) * r0,
          top: cy + Math.sin(a) * r0 * 0.6,
          fontFamily: 'Consolas, monospace',
          fontSize: 11,
          color: 'rgba(180,188,200,0.6)',
          opacity: 1 - k * 0.6,
          whiteSpace: 'nowrap',
        }}
      >
        {w}
      </div>
    );
  });

  return (
    <div style={{ position: 'absolute', inset: 0, backgroundColor: '#131417' }}>
      {items}
      {texts}
      {/* 汇聚点：越收越亮 */}
      <div
        style={{
          position: 'absolute',
          left: cx,
          top: cy,
          width: 3 + k * 5,
          height: 3 + k * 5,
          marginLeft: -(3 + k * 5) / 2,
          marginTop: -(3 + k * 5) / 2,
          borderRadius: '50%',
          backgroundColor: '#e6edf3',
          boxShadow: `0 0 ${6 + k * 26}px rgba(230,237,243,${(0.3 + k * 0.6).toFixed(2)})`,
        }}
      />
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
        <span style={{ color: '#8b949e', letterSpacing: 2 }}>CONVERGE</span>
        <span>{dur}s ease-in</span>
        <span style={{ marginLeft: 'auto' }}>{(k * 100).toFixed(0)}%</span>
      </div>
    </div>
  );
};
