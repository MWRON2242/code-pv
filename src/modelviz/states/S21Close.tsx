import React from 'react';
import type { StateProps } from '../types';
import { ease } from '../easing';

/* ============================================================================
 * S21 · 关闭（规格 §3）
 * 视觉：窗口关闭，全黑
 * 参数：关闭动画 0.3s，全黑 2s，然后署名
 * 触发：S20 停留 3s 后（242.273s）
 *
 * ⚠ 验收标准：「署名在全黑之后出现，不能在标题停留时出现」。
 *   署名**不在这个组件里** —— 由 MainFilm 在 244.6 秒统一画。
 *   这里只负责：窗口合上 → 全黑。这样两者不可能同时出现。
 *
 * 全片只有到这一刻，左侧聊天窗口才真正消失（用户的裁决：
 * 「全片只有 S21 窗口关闭时，左侧才真正消失」）。
 * ==========================================================================*/

export const S21Close: React.FC<StateProps> = ({ local, params, width, height }) => {
  const closeSec = params.closeSec ?? 0.3;
  const k = ease('easeIn', Math.min(1, local / closeSec));

  // 窗口关闭：像老式显示器一样上下合拢
  const barH = (height / 2) * (1 - k);
  const closed = local >= closeSec;

  if (closed) {
    return <div style={{ position: 'absolute', inset: 0, backgroundColor: '#000000' }} />;
  }

  return (
    <div style={{ position: 'absolute', inset: 0, backgroundColor: '#000000' }}>
      {/* 正在合拢的画面：一条被压扁的亮线 */}
      <div
        style={{
          position: 'absolute',
          left: 0,
          right: 0,
          top: '50%',
          height: Math.max(1, barH * 2),
          marginTop: -Math.max(1, barH * 2) / 2,
          backgroundColor: '#c9d1d9',
          opacity: 0.5 + k * 0.5,
        }}
      />
      {/* 合拢后的余晖 */}
      <div
        style={{
          position: 'absolute',
          left: 0,
          right: 0,
          top: '50%',
          height: 1,
          backgroundColor: '#ffffff',
          opacity: (1 - k) * 0.6,
          boxShadow: `0 0 ${20 * (1 - k)}px rgba(255,255,255,0.5)`,
        }}
      />
      <div
        style={{
          position: 'absolute',
          left: Math.round(width * 0.04),
          bottom: 16,
          fontFamily: 'Consolas, monospace',
          fontSize: 11,
          color: 'rgba(125,133,144,0.6)',
        }}
      >
        CLOSING · {(k * 100).toFixed(0)}%
      </div>
    </div>
  );
};
