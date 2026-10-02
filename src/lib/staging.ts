/* ============================================================================
 * 段落编排（staging）—— 让长片不单调，并且换段落时不硬闪
 * ----------------------------------------------------------------------------
 * 两件事：
 *  1. 每个镜头有**固定基色**（shots）——那是镜头的身份，不随段落变，
 *     否则四个镜头会越长越像，加镜头的意义就被抵消了。
 *  2. 段落控制**强度与构图**（bySection）。chat 额外让主色随音乐漂移。
 *
 * ⚠ 平滑过渡：直接在段落边界切换数值，画面会「啪」地一跳。
 *   stageAt() 因此在边界前后 BLEND 秒内把上下两段插值混合 ——
 *   颜色、密度、缩放、抖动全都渐变。这是「主题色切换自然」的实现方式。
 * ==========================================================================*/

import stagingJson from '../../input/staging.json';
import { SECTIONS, SONG_DURATION } from './song';

export type Stage = {
  accent: string;
  intensity: number;
  worldScale: number;
  gridDensity: number;
  mandalaSpeed: number;
  camera: [number, number];
  shake: number;
};

const DEFAULT: Stage = stagingJson.default as unknown as Stage;
const BY_SECTION = stagingJson.bySection as unknown as Record<string, Stage>;
const SHOT_COLORS = stagingJson.shots as unknown as Record<string, string>;

/** 段落边界两侧各用多长时间做渐变 */
const BLEND = 1.2;

const clamp01 = (x: number) => Math.max(0, Math.min(1, x));
const lerp = (a: number, b: number, k: number) => a + (b - a) * k;
const smoothstep = (k: number) => k * k * (3 - 2 * k);

/** 某个镜头的基色（镜头的身份色，不随段落变） */
export function shotColor(shot: string): string {
  return SHOT_COLORS[shot] || '#1f6feb';
}

/* ------------------------------------------------------------------ 段落 */

export function sectionIndexAt(t: number): number {
  let idx = 0;
  for (let i = 0; i < SECTIONS.length; i++) if (t >= SECTIONS[i].t) idx = i;
  return idx;
}

export function sectionAt(t: number): string {
  return SECTIONS.length ? SECTIONS[sectionIndexAt(t)].name : '';
}

export function sectionRangeAt(t: number): { name: string; start: number; end: number } {
  const idx = sectionIndexAt(t);
  const start = SECTIONS.length ? SECTIONS[idx].t : 0;
  const end = idx + 1 < SECTIONS.length ? SECTIONS[idx + 1].t : SONG_DURATION;
  return { name: SECTIONS.length ? SECTIONS[idx].name : '', start, end };
}

export function sectionProgress(t: number): number {
  const r = sectionRangeAt(t);
  const span = Math.max(0.001, r.end - r.start);
  return clamp01((t - r.start) / span);
}

/* ------------------------------------------------ 数值混合（含颜色） */

/** 把 #rrggbb 或 rgb(r,g,b) 解析成三元组；解析不了就退回灰色 */
function parseColor(c: string): [number, number, number] {
  const s = String(c || '').trim();
  if (s.startsWith('#')) {
    return [
      parseInt(s.slice(1, 3), 16) || 0,
      parseInt(s.slice(3, 5), 16) || 0,
      parseInt(s.slice(5, 7), 16) || 0,
    ];
  }
  const m = /rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)/.exec(s);
  if (m) return [Number(m[1]), Number(m[2]), Number(m[3])];
  return [128, 128, 128];
}

/** 两色之间插值，k=0 取 a，k=1 取 b */
export function mixColor(a: string, b: string, k: number): string {
  const A = parseColor(a);
  const B = parseColor(b);
  const t = clamp01(k);
  const p = A.map((v, i) => Math.round(v + (B[i] - v) * t));
  return `rgb(${p[0]}, ${p[1]}, ${p[2]})`;
}

/** 给任意颜色加透明度（既吃 #rrggbb 也吃 rgb(...)） */
export function withAlpha(color: string, a: number): string {
  const p = parseColor(color);
  return `rgba(${p[0]}, ${p[1]}, ${p[2]}, ${clamp01(a)})`;
}

function blendStage(a: Stage, b: Stage, k: number): Stage {
  return {
    accent: mixColor(a.accent, b.accent, k),
    intensity: lerp(a.intensity, b.intensity, k),
    worldScale: lerp(a.worldScale, b.worldScale, k),
    gridDensity: lerp(a.gridDensity, b.gridDensity, k),
    mandalaSpeed: lerp(a.mandalaSpeed, b.mandalaSpeed, k),
    camera: [lerp(a.camera[0], b.camera[0], k), lerp(a.camera[1], b.camera[1], k)],
    shake: lerp(a.shake, b.shake, k),
  };
}

function stageOfSection(name: string): Stage {
  return BY_SECTION[name] || DEFAULT;
}

/**
 * 当前时刻的段落参数。
 * 在段落边界前后 BLEND 秒内，与**上一段**插值混合 —— 颜色不会硬闪。
 */
export function stageAt(t: number): Stage {
  const idx = sectionIndexAt(t);
  const cur = stageOfSection(SECTIONS.length ? SECTIONS[idx].name : '');
  if (idx === 0 || !SECTIONS.length) return cur;
  const start = SECTIONS[idx].t;
  const since = t - start;
  if (since >= BLEND) return cur;
  const prev = stageOfSection(SECTIONS[idx - 1].name);
  return blendStage(prev, cur, smoothstep(clamp01(since / BLEND)));
}

/** 当前段落强度 0~1：各镜头的密度 / 速度 / 亮度都用它 */
export function intensityAt(t: number): number {
  return stageAt(t).intensity;
}

/** 全画面缩放：在段落内从 camera[0] 平滑过渡到 camera[1]（缓入缓出） */
export function cameraScaleAt(t: number): number {
  const s = stageAt(t);
  const p = sectionProgress(t);
  return s.camera[0] + (s.camera[1] - s.camera[0]) * smoothstep(p);
}
