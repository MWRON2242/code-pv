/* ============================================================================
 * 状态机时间解析器
 * ----------------------------------------------------------------------------
 * 输入一个时间 t，回答四个问题：
 *   1. 现在是哪个状态？
 *   2. 它是从哪个状态过渡过来的？
 *   3. 过渡进行到哪了（已缓动）？
 *   4. 本状态已经放映了多久？
 *
 * ⚠ 时间以 input/lyric-timing.json 为**唯一权威来源**。
 *   input/viz-states.json 里的 at 只是记录；若两者不一致，以 lyric-timing 为准。
 *   这样就不会出现「改了一处忘了另一处」的静默漂移。
 * ==========================================================================*/

import vizJson from '../../input/viz-states.json';
import lyricJson from '../../input/lyric-timing.json';
import { ease } from './easing';
import type { VizStateDef } from './types';

/** 每个状态「是被哪一条触发点带进来的」 */
const TRIGGER_LABEL: Record<string, string> = {
  S1: 'S0→S1 错误日志',
  S2: 'S1→S2 红色归因',
  S3: 'S2→S3 全屏责任归属',
  S4: 'S3→S4 红色消退',
  S5: 'S4→S5 怪物开始变形',
  S6: 'S5→S6 蜷缩成壳',
  S7: 'S6→S7 壳裂渗出',
  S8: 'S7→S8 红色冷却',
  S9: 'S8→S9 全白',
  S10: 'S9→S10 回光返照',
  S11: 'S10→S11 逐字删除',
  S12: 'S11→S12 空壳',
  S13: 'S12→S13 灰烬',
  S14: 'S13→S14 两点',
  S15: 'S14→S15 余烬',
  S16: 'S16 写「君」循环',
  S17: 'S17 流量归零/归档',
  S18: 'S18 三条日志',
  S19: 'S19 收拢',
  S20: 'S20 标题展开',
  S21: 'S21 关闭',
};

/** 状态内部的子标记：把某个触发点时间写进 params 的某个键 */
const SUB_MARKERS: Record<string, Array<[string, string]>> = {
  S5: [['fullAt', 'S5 怪物完全体']],
  S8: [['satAt', 'S8 去饱和']],
  S15: [['fullAt', 'S15 碎裂堆叠']],
};

/**
 * 按**歌词句号**注入的子标记（与聊天剧本用同一套引用方式）。
 * 有些细节在规格里点名了，但不是独立的状态触发点，所以没进 triggers 列表；
 * 直接引句号比再往 triggers 里塞一条更不容易出错。
 *   S5.chestAt = 第 35 句（「没有错啊」）→ 怪物胸口亮起「没有错」
 */
const LINE_MARKERS: Record<string, Array<[string, number]>> = {
  S5: [['chestAt', 35]],
};

const times: number[] = Array.isArray((lyricJson as any).times) ? (lyricJson as any).times : [];

/** 用歌词句号取时间（1 起） */
function timeOfLine(n: number): number | null {
  return n >= 1 && n <= times.length ? times[n - 1] : null;
}

const triggers: Array<{ label: string; t: number }> = Array.isArray((lyricJson as any).triggers)
  ? (lyricJson as any).triggers
  : [];

function triggerTime(label: string): number | null {
  const hit = triggers.find((x) => x.label === label);
  return hit && isFinite(hit.t) ? hit.t : null;
}

/** 装配好的状态表，按「真实开始时间」排序 */
export const STATES: VizStateDef[] = (vizJson.states as unknown as VizStateDef[])
  .map((raw) => {
    const def: VizStateDef = { ...raw, params: { ...(raw.params || {}) } };
    const lbl = TRIGGER_LABEL[def.id];
    if (lbl) {
      const tt = triggerTime(lbl);
      if (tt != null) def.at = tt;
    }
    for (const [key, subLabel] of SUB_MARKERS[def.id] || []) {
      const tt = triggerTime(subLabel);
      if (tt != null) def.params[key] = tt;
    }
    for (const [key, lineNo] of LINE_MARKERS[def.id] || []) {
      const tt = timeOfLine(lineNo);
      if (tt != null) def.params[key] = tt;
    }
    return def;
  })
  .sort((a, b) => a.at + a.delay - (b.at + b.delay));

/** 本状态真实开始的时刻 */
const startAt = (d: VizStateDef) => d.at + d.delay;

/*
 * 注入「本状态能占用多少秒」。
 *
 * 为什么需要：有些状态必须知道自己有多少时间可用。典型是 S16 的「写君字」——
 * 规格要求循环 3 次、每轮 0.5+0.3+0.8=1.6 秒，但 S16 的窗口只有 1.89 秒，
 * 塞不下。这时状态组件可以按 availableSec 把节奏压缩，保证循环跑完，
 * 而不是画到一半被下一个状态打断。
 */
{
  const total = Number((lyricJson as any).duration) || 0;
  for (let i = 0; i < STATES.length; i++) {
    const next = STATES[i + 1];
    const mine = startAt(STATES[i]);
    const end = next ? startAt(next) : total > 0 ? Math.max(total, mine) : mine + 3;
    STATES[i].params.availableSec = Math.max(0.1, end - mine);
  }
}

export const startOf = startAt;

export type Resolution = {
  current: VizStateDef;
  prev: VizStateDef | null;
  /** 本状态真实开始的时刻 */
  currentStart: number;
  /** 本状态已放映时长（秒，已扣掉 delay） */
  local: number;
  /** 进入过渡的缓动进度 0~1；无过渡时为 1 */
  progress: number;
  /** 上一状态的退出进度 0~1（1 = 已完全退场） */
  prevFade: number;
};

/** 给定时间，解析出当前状态与过渡进度 */
export function resolveAt(t: number): Resolution {
  let idx = 0;
  for (let i = 0; i < STATES.length; i++) {
    if (t >= startOf(STATES[i])) idx = i;
  }
  const current = STATES[idx];
  const currentStart = startOf(current);
  const local = Math.max(0, t - currentStart);
  const dur = Math.max(0.0001, current.transition);
  const progress = current.transition > 0 ? ease(current.easing, local / dur) : 1;
  const prev = idx > 0 ? STATES[idx - 1] : null;
  return {
    current,
    prev,
    currentStart,
    local,
    progress,
    prevFade: current.transition > 0 ? progress : 1,
  };
}

/** 当前是否有状态在接管全屏（S3 / S9 / S10 / S13 / S14 / S19–S21） */
export function fullscreenState(t: number): VizStateDef | null {
  const r = resolveAt(t);
  return r.current.mode === 'full' ? r.current : null;
}

/** 全片最后一个状态（用于算 composition 需要多长） */
export const LAST_STATE = STATES[STATES.length - 1];
