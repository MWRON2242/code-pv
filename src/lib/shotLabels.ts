/* ============================================================================
 * 镜头权重（shot labels）
 * ----------------------------------------------------------------------------
 * 规格 §2.3 的 player / chat / dash / term 是**权重与语气**，不是显隐开关。
 * 用户对「冲突一」的修正说明把它落成四个可测参数：
 *
 *   left / right  → 两侧的 opacity（低权重侧 0.35~0.42，绝不为 0）
 *   sat           → 低权重侧去饱和
 *   speed         → 动画频率与消息密度的倍率
 *
 * 与 staging 一样，段落边界前后做平滑插值，避免硬跳。
 * ==========================================================================*/

import labelsJson from '../../input/shot-labels.json';
import { SECTIONS, SONG_DURATION } from './song';

export type WeightDef = { left: number; right: number; sat: number; speed: number; note?: string };
export type Weights = WeightDef & { label: string };

const LABELS = labelsJson.labels as unknown as Record<string, WeightDef>;
const BY_SECTION = labelsJson.bySection as unknown as Record<string, string>;
const DEFAULT_LABEL = (labelsJson.default as unknown as string) || 'chat';
const BLEND = 1.2;

const clamp01 = (x: number) => (x < 0 ? 0 : x > 1 ? 1 : x);
const lerp = (a: number, b: number, k: number) => a + (b - a) * k;
const smoothstep = (k: number) => k * k * (3 - 2 * k);

function sectionIndexOf(t: number): number {
  let idx = 0;
  for (let i = 0; i < SECTIONS.length; i++) if (t >= SECTIONS[i].t) idx = i;
  return idx;
}

function labelForSection(name: string): string {
  return BY_SECTION[name] || DEFAULT_LABEL;
}

function defOf(label: string): WeightDef {
  return LABELS[label] || LABELS[DEFAULT_LABEL] || { left: 1, right: 0.62, sat: 1, speed: 1 };
}

function blend(a: WeightDef, b: WeightDef, k: number): WeightDef {
  return {
    left: lerp(a.left, b.left, k),
    right: lerp(a.right, b.right, k),
    sat: lerp(a.sat, b.sat, k),
    speed: lerp(a.speed, b.speed, k),
  };
}

/** 当前时刻的镜头权重；段落边界前后 BLEND 秒内与上一段插值 */
export function weightsAt(t: number): Weights {
  const idx = sectionIndexOf(t);
  const name = SECTIONS.length ? SECTIONS[idx].name : '';
  const label = labelForSection(name);
  const cur = defOf(label);
  if (idx === 0 || !SECTIONS.length) return { ...cur, label };

  const start = SECTIONS[idx].t;
  const since = t - start;
  if (since >= BLEND) return { ...cur, label };

  const prevLabel = labelForSection(SECTIONS[idx - 1].name);
  const prev = defOf(prevLabel);
  const k = smoothstep(clamp01(since / BLEND));
  return { ...blend(prev, cur, k), label };
}

/** 段落序号（1 起），便于在画面上标注 */
export function sectionNumberAt(t: number): number {
  return sectionIndexOf(t) + 1;
}

/** 静音检查：整段是否处在某个片段里（用于调试） */
export function sectionEndAt(t: number): number {
  const idx = sectionIndexOf(t);
  return idx + 1 < SECTIONS.length ? SECTIONS[idx + 1].t : SONG_DURATION;
}
