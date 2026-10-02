import { BEATS, BPM, SECTIONS, SONG_DURATION } from './song';

/**
 * 共用的「卡点」工具 —— 所有镜头都从这里取时间数据。
 *
 * 数据本身在 song.ts；这里只放纯函数，方便复用和测试。
 */

export const ALL_BEATS = BEATS;
export const SONG_LENGTH = SONG_DURATION;
export { BPM, SECTIONS, SONG_DURATION };
export const BEATS_PER_BAR = 4;

/** 预览时长：12 秒，覆盖 intro → fill → groove 开头 */
export const PREVIEW_SECONDS = 12;

/** 当前时间落在第几拍上（-1 表示还没到第一拍） */
export function beatIndexAt(t: number): number {
  let idx = -1;
  for (let i = 0; i < ALL_BEATS.length; i++) if (t >= ALL_BEATS[i]) idx = i;
  return idx;
}

/** 距离上一拍过去了多久 */
export function sinceBeat(t: number): number {
  const i = beatIndexAt(t);
  return i >= 0 ? t - ALL_BEATS[i] : 999;
}

/** 击打瞬间 1 → 0 的衰减值，用来做「抖一下」 */
export function flash(t: number, decay = 0.22): number {
  return Math.max(0, 1 - sinceBeat(t) / decay);
}

/** 第几小节 */
export function barAt(t: number): number {
  const i = beatIndexAt(t);
  return Math.floor(Math.max(0, i) / BEATS_PER_BAR) + 1;
}

/** 当前所在段落名 */
export function sectionAt(t: number): string {
  let name = SECTIONS.length ? SECTIONS[0].name : '';
  for (const s of SECTIONS) if (t >= s.t) name = s.name;
  return name;
}

/** 时间码 mm:ss.ff */
export function fmtTime(t: number, fps = 24): string {
  const safe = !isFinite(t) || t < 0 ? 0 : t;
  const m = Math.floor(safe / 60);
  const s = Math.floor(safe % 60);
  const f = Math.floor((safe - Math.floor(safe)) * fps);
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}.${String(f).padStart(2, '0')}`;
}

/** 固定种子的伪随机：同一帧永远得到同一个数，保证可复现 */
export function prng(n: number): number {
  let s = (Math.floor(n) * 1664525 + 1013904223) >>> 0;
  s = (s * 1664525 + 1013904223) >>> 0;
  return s / 4294967296;
}

/** 两个十六进制颜色之间插值，做辉光用 */
export function mixHex(a: string, b: string, k: number): string {
  const pa = [1, 3, 5].map((i) => parseInt(a.slice(i, i + 2), 16));
  const pb = [1, 3, 5].map((i) => parseInt(b.slice(i, i + 2), 16));
  const p = pa.map((v, i) => Math.round(v + (pb[i] - v) * Math.max(0, Math.min(1, k))));
  return `rgb(${p[0]}, ${p[1]}, ${p[2]})`;
}
