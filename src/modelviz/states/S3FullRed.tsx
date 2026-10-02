import React from 'react';
import type { StateProps } from '../types';

/* ============================================================================
 * S3 · 全屏责任归属（规格 §3）
 * 视觉：全屏红色，只剩一行大字「责任归属：AI」
 * 参数：字号占屏高 1/4，背景 #1A0000，文字 #FF3B30，闪烁 2Hz
 * 触发：74.780s（「都是你的错」），延迟 0.3s，过渡 1.5s，先快后慢
 *
 * mode = full：不是只作用于右窗，而是接管整个画面。
 * ==========================================================================*/

export const S3FullRed: React.FC<StateProps> = ({ t, local, params, height, progress }) => {
  const bg = params.bg ?? '#1A0000';
  const fg = params.fg ?? '#FF3B30';
  const ratio = params.textHeightRatio ?? 0.25;
  const hz = params.blinkHz ?? 2;

  // 2Hz 闪烁：不是硬开关，用较柔的呼吸避免刺眼
  const blink = 0.62 + 0.38 * (Math.sin(t * Math.PI * 2 * hz) * 0.5 + 0.5);
  // 进入时先快速铺满，再让文字浮现（先快后慢）
  const enter = Math.min(1, progress);

  return (
    <div
      style={{
        position: 'absolute',
        inset: 0,
        // 用带透明度的红铺满，而不是纯色不透明：
        // 用户对「冲突一」的裁决要求 S21 之前任何一侧 opacity 都不得为 0，
        // 所以底下的双窗口始终透出一点点。
        backgroundColor: 'rgba(26,0,0,0.94)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      {/* 铺满时的红色渐入 */}
      <div
        style={{
          position: 'absolute',
          inset: 0,
          backgroundColor: fg,
          opacity: (1 - enter) * 0.55,
        }}
      />

      <div
        style={{
          position: 'relative',
          fontFamily: '"Microsoft YaHei", system-ui, sans-serif',
          fontWeight: 700,
          fontSize: Math.round(height * ratio),
          color: fg,
          opacity: enter * blink,
          letterSpacing: 4,
          textShadow: `0 0 ${18 + blink * 26}px ${fg}`,
          textAlign: 'center',
          lineHeight: 1.15,
        }}
      >
        责任归属：AI
      </div>

      {/* 左下角的极小注脚：说明这是状态机的第几个状态，便于验收核对 */}
      <div
        style={{
          position: 'absolute',
          left: 22,
          bottom: 16,
          fontFamily: 'Consolas, monospace',
          fontSize: 11,
          color: 'rgba(255,59,48,0.5)',
          opacity: enter,
        }}
      >
        S3 · 全屏责任归属 · {local.toFixed(1)}s
      </div>
    </div>
  );
};
