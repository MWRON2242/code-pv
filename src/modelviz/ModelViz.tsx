import React from 'react';
import { AbsoluteFill, useCurrentFrame, useVideoConfig } from 'remotion';
import { resolveAt } from './resolver';
import { componentFor, isImplemented } from './states';
import { intensityAt } from '../lib/staging';

/* ============================================================================
 * ModelViz · 模型可视化层
 * ----------------------------------------------------------------------------
 * 分两层渲染，因为它们的作用范围不同：
 *   layer="right"  只画在右窗里（S0/S1/S2 这类）
 *   layer="full"   接管整个画面（S3/S9/S13/S14/S19–S21）
 *
 * 过渡处理：同时画「上一个状态」和「当前状态」，按过渡进度交叉。
 *   · 因为 S0→S1→S2 共用同一个 GridField（几何完全一致），
 *     交叉过渡看起来就是「同一个网格开始错位」，而不是两张不同的图叠在一起。
 *
 * ⚠ 铁律：full 层不是完全不透明 —— 保留约 6% 的透出，
 *   这样 S21 之前两侧窗口永远不会真正「消失」。
 * ==========================================================================*/

const FULL_BLEED = 0.94;

export const ModelViz: React.FC<{ layer: 'right' | 'full'; width: number; height: number }> = ({
  layer,
  width,
  height,
}) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const t = frame / fps;

  const r = resolveAt(t);
  const intensity = intensityAt(t);

  const cur = r.current.mode === layer ? r.current : null;
  const prev = r.prev && r.prev.mode === layer ? r.prev : null;

  const curOp = cur ? r.progress : 0;
  const prevOp = prev ? 1 - r.progress : 0;

  const renderOne = (
    def: NonNullable<typeof cur>,
    opacity: number,
    localOverride?: number
  ) => {
    if (opacity <= 0.002) return null;
    const Comp = componentFor(def.id);
    const local = localOverride ?? Math.max(0, t - (def.at + def.delay));
    const progress = def.transition > 0 ? Math.min(1, local / def.transition) : 1;
    return (
      <AbsoluteFill key={def.id + (localOverride == null ? '' : '-prev')} style={{ opacity }}>
        <Comp
          t={t}
          local={local}
          progress={progress}
          prevFade={r.prevFade}
          params={def.params}
          intensity={intensity}
          width={width}
          height={height}
        />
      </AbsoluteFill>
    );
  };

  if (!cur && !prev) return null;

  return (
    <AbsoluteFill style={{ opacity: layer === 'full' ? FULL_BLEED : 1 }}>
      {prev && renderOne(prev, prevOp, Math.max(0, t - (prev.at + prev.delay)))}
      {cur && renderOne(cur, curOp)}
    </AbsoluteFill>
  );
};
