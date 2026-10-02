import React from 'react';
import type { StateProps } from '../types';
import { S5Monster } from './S5Monster';

/* ============================================================================
 * S10 · 回光返照（规格 §3）
 * 视觉：短暂闪回 S5 怪物一帧
 * 参数：持续 0.1s，然后消失
 * 触发：188.919s（「是错的啊 我知道的啊」）
 *
 * 实现上不是"截一帧旧画面"，而是**用同一个组件按同样的参数再渲染 0.1 秒**。
 * 这样闪回的内容永远和 S5 一致，不会因为以后改 S5 而忘了同步闪回。
 * ==========================================================================*/

const clamp01 = (x: number) => (x < 0 ? 0 : x > 1 ? 1 : x);

export const S10Flashback: React.FC<StateProps> = ({ t, local, params, width, height }) => {
  const flashSec = params.flashSec ?? 0.1;
  const inFlash = local < flashSec;
  // 全白底：继承 S9 的状态，只在闪回那一瞬被盖住
  const lum = 232;

  return (
    <div style={{ position: 'absolute', inset: 0, backgroundColor: `rgb(${lum},${lum},${lum + 2})` }}>
      {inFlash && (
        <div style={{ position: 'absolute', inset: 0, opacity: 1 - clamp01(local / flashSec) * 0.15 }}>
          {/* 复用 S5 的组件，参数取完全体那一档 */}
          <S5Monster
            t={t}
            local={10}
            progress={1}
            prevFade={1}
            intensity={1}
            params={{ verticesMin: 20, crawlHz: 2, eyeHz: 4 }}
            width={width}
            height={height}
          />
        </div>
      )}
    </div>
  );
};
