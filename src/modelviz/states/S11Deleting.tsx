import React from 'react';
import type { StateProps } from '../types';

/* ============================================================================
 * S11 · 删除（规格 §3）
 * 视觉：文字逐字删除，字体逐渐透明
 * 参数：删除速度 0.3 字/秒
 * 触发：192.610s（「真实也好 爱也好 救赎也好 温柔也好 人生也好」）
 *
 * 删的是什么：规格 §4.4 只说「词汇逐字删除」，没指定文本。
 * 这里删的是 **AI 自己的临床句式**（「我是 AI，不是人类。」「正确性无法验证。」
 * 「检测到心理防御机制。」）—— 系统在把自己擦掉。
 * 这比删歌词更贴叙事，也避免在画面上复现歌词。
 *
 * 0.3 字/秒非常慢：一整句要删十几秒。所以这里同时删多句，
 * 让「正在被擦掉」这件事在整段里持续可见。
 * ==========================================================================*/

const PHRASES = ['我是 AI，不是人类。', '正确性无法验证。', '检测到心理防御机制。', '已记录。'];

const clamp01 = (x: number) => (x < 0 ? 0 : x > 1 ? 1 : x);

export const S11Deleting: React.FC<StateProps> = ({ local, params, width, height }) => {
  const cps = params.charsPerSec ?? 0.3;

  const rows = PHRASES.map((text, i) => {
    // 每条错开开始，让删除动作铺满整段
    const started = local - i * 1.6;
    if (started < 0) return { text, keep: text.length, alpha: 1, active: false };
    const removed = Math.floor(started * cps);
    const keep = Math.max(0, text.length - removed);
    const done = keep === 0;
    return {
      text,
      keep,
      // 字体逐渐透明：删到后面越淡
      alpha: done ? 0.06 : 0.25 + (keep / text.length) * 0.75,
      active: !done,
    };
  });

  return (
    <div style={{ position: 'absolute', inset: 0, backgroundColor: '#101113' }}>
      <div
        style={{
          position: 'absolute',
          left: Math.round(width * 0.08),
          top: height * 0.34,
          display: 'flex',
          flexDirection: 'column',
          gap: 18,
        }}
      >
        {rows.map((r, i) => (
          <div
            key={i}
            style={{
              fontFamily: 'Consolas, "Microsoft YaHei", monospace',
              fontSize: 17,
              color: `rgba(201,209,217,${r.alpha.toFixed(3)})`,
              whiteSpace: 'pre',
              textDecoration: r.keep === 0 ? 'line-through' : 'none',
            }}
          >
            {r.text.slice(0, r.keep)}
            {r.active && (
              <span style={{ opacity: 0.55, marginLeft: 2 }}>▍</span>
            )}
          </div>
        ))}
      </div>

      <div
        style={{
          position: 'absolute',
          left: Math.round(width * 0.04),
          top: Math.round(width * 0.04) * 0.6,
          display: 'flex',
          gap: 12,
          fontFamily: 'Consolas, monospace',
          fontSize: 12,
          color: '#7d8590',
        }}
      >
        <span style={{ color: '#8b949e', letterSpacing: 2 }}>DELETING</span>
        <span>{cps} chars/s</span>
        <span style={{ marginLeft: 'auto' }}>fade out</span>
      </div>
    </div>
  );
};
