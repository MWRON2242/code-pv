import React from 'react';
import type { StateProps } from '../types';
import { ease } from '../easing';

/* ============================================================================
 * S20 · 标题（规格 §3）
 * 视觉：展开成 `だから僕は音楽を辞めた`
 * 参数：字号占屏高 1/8，白色，停留 3s
 * 触发：239.020s（「所以我放弃了音乐」）
 *
 * ⚠ 验收标准：
 *   「最后标题停留时间 ≥ 3s」
 *   「署名在全黑之后出现，不能在标题停留时出现」
 *
 * 所以这里**不能提前淡出**：S21 在 242.273 秒才开始，标题从 239.020 起
 * 有 3.25 秒；展开用掉约 0.6 秒，停留刚好 3 秒以上。
 * 署名由 MainFilm 在 244.6 秒才画 —— 在标题停留期间签名是不可能出现的。
 * ==========================================================================*/

export const S20Title: React.FC<StateProps> = ({ local, params, height }) => {
  const expand = ease('easeOut', Math.min(1, local / 0.6));
  const size = Math.round(height * (params.textHeightRatio ?? 0.125));
  const hold = params.holdSec ?? 3;

  return (
    <div
      style={{
        position: 'absolute',
        inset: 0,
        backgroundColor: '#0d0e10',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      <div
        style={{
          fontFamily: '"Yu Mincho", "Hiragino Mincho ProN", "Microsoft YaHei", serif',
          fontSize: size,
          color: params.color ?? '#FFFFFF',
          letterSpacing: 2,
          opacity: 0.15 + expand * 0.85,
          transform: `scale(${(0.86 + expand * 0.14).toFixed(3)})`,
          textAlign: 'center',
          lineHeight: 1.2,
          padding: '0 40px',
        }}
      >
        だから僕は音楽を辞めた
      </div>

      <div
        style={{
          position: 'absolute',
          left: Math.round(height * 0.4),
          top: height * 0.06,
          fontFamily: 'Consolas, monospace',
          fontSize: 12,
          color: '#7d8590',
          opacity: 0.5,
        }}
      >
        TITLE · hold {hold}s
      </div>
    </div>
  );
};
