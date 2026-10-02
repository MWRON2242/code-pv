/* ============================================================================
 * 缓动函数
 * ----------------------------------------------------------------------------
 * 规格 §3 给每个过渡都指定了缓动：ease-in-out / ease-out / 先快后慢 / ease-in。
 * 「先快后慢」不是标准 CSS 名字，这里单独实现。
 * ==========================================================================*/

export type EasingName = 'linear' | 'easeIn' | 'easeOut' | 'easeInOut' | 'fastSlow';

const clamp01 = (k: number) => (k < 0 ? 0 : k > 1 ? 1 : k);

export function ease(name: EasingName, k: number): number {
  const x = clamp01(k);
  switch (name) {
    case 'easeIn':
      return x * x;
    case 'easeOut':
      return 1 - (1 - x) * (1 - x);
    case 'easeInOut':
      return x * x * (3 - 2 * x); // smoothstep
    case 'fastSlow':
      // 先快后慢：起步就冲出大半，尾巴拖长
      return 1 - Math.pow(1 - x, 3);
    case 'linear':
    default:
      return x;
  }
}

/** 帧驱动的小工具：把秒换算成帧，便于做「每 N 帧一次」的效果 */
export const secToFrames = (sec: number, fps: number) => Math.round(sec * fps);
