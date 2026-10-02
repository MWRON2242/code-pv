import React from 'react';
import type { StateProps } from '../types';

/* ============================================================================
 * S9 · 全白（规格 §3）
 * 视觉：几乎全白，只剩光标
 * 参数：亮度 90%，对比度 5%，光标闪烁 1Hz
 * 触发：175.819s（「没有错啊」三次递减的最后一次）
 *
 * mode = full：接管整个画面，但按用户的裁决保留约 6% 透出，
 * 这样 S21 之前两侧窗口永远不会真正消失。
 *
 * ⚠ 验收标准：「最后一次『没有错啊』不能有消息气泡，只有光标」。
 *   光标闪烁必须在，而且是全片最慢的 1Hz —— 前面都是 2Hz。
 * ==========================================================================*/

export const S9Whiteout: React.FC<StateProps> = ({ t, local, params, height }) => {
  const hz = params.cursorHz ?? 1;
  const bright = params.brightness ?? 0.9;
  const on = Math.sin(t * Math.PI * 2 * hz) > 0;

  // 全白：进入时迅速提亮，避免从 S8 的深色硬跳
  const whiten = Math.min(1, local / 2.5);
  const lum = Math.round(232 * bright + 16 * (1 - whiten));

  return (
    <div
      style={{
        position: 'absolute',
        inset: 0,
        backgroundColor: `rgb(${lum},${lum},${Math.min(255, lum + 3)})`,
      }}
    >
      {/* 只剩一个光标 */}
      <div
        style={{
          position: 'absolute',
          left: '50%',
          top: '50%',
          width: 3,
          height: Math.round(height * 0.052),
          marginLeft: -1.5,
          marginTop: -Math.round(height * 0.026),
          backgroundColor: `rgb(40,44,52)`,
          opacity: on ? 0.85 : 0.06,
        }}
      />
    </div>
  );
};
