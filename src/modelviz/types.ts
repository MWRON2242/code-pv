/* ============================================================================
 * 状态机的类型定义
 * ==========================================================================*/

import type { EasingName } from './easing';

export type VizMode = 'right' | 'full';

export type VizStateDef = {
  id: string;
  name: string;
  /** 触发时间（秒），来自 input/lyric-timing.json */
  at: number;
  /** 触发后延迟多少秒才真正开始 */
  delay: number;
  /** 过渡时长（秒） */
  transition: number;
  easing: EasingName;
  /** right = 只作用于右窗；full = 接管全屏 */
  mode: VizMode;
  params: Record<string, any>;
};

/** 每个状态组件拿到的输入 */
export type StateProps = {
  /** 全局时间（秒） */
  t: number;
  /** 本状态已经放映了多久（秒），已扣掉 delay */
  local: number;
  /** 本状态的过渡进度 0~1（已缓动）；稳态恒为 1 */
  progress: number;
  /** 上一个状态的过渡退出进度 0~1（用于交叉淡出）；无上一状态时为 1 */
  prevFade: number;
  /** 本状态的参数（来自 viz-states.json） */
  params: Record<string, any>;
  /** 当前段落强度 0~1（来自 staging） */
  intensity: number;
  /** 画布尺寸 */
  width: number;
  height: number;
};
