import React from 'react';
import chatScript from '../input/chat-script.json';
import { useCurrentFrame, useVideoConfig } from 'remotion';
import { ALL_BEATS, beatIndexAt, flash, fmtTime, prng } from './lib/beats';
import { stageAt, withAlpha } from './lib/staging';

/* ============================================================================
 * ChatPane · 左窗（TUI 聊天窗口）
 * ----------------------------------------------------------------------------
 * 规格 §2.1：左侧 50% 是聊天窗口，**全片始终存在**。
 *
 * 这一版不是「把台词显示出来」，而是一台**行为引擎** —— 规格 §4 的五张表
 * 要求的八种行为都在这里：
 *
 *   send     发送
 *   hold     打好了但不发（文字停在输入框）
 *   del      打了又删掉
 *   bs       按退格但文字不消失
 *   retract  AI 回复后又撤回
 *   upload   上传图片
 *   sky      聊天区出现蓝天/正午/窗帘
 *   none     什么都不做，只剩光标
 *
 * 气泡也开始表达情绪：n 普通 / s 小 / t 极小 / g 灰 / w 暖灰（全片唯一暖色）。
 * 「越来越小」和「越来越灰」是规格的叙事手段，不是装饰。
 * ==========================================================================*/

type Ev = {
  t: number;
  from: string;
  mode: string;
  bubble: string;
  scale: number;
  tone: string;
  line: number;
  text: string;
  typeStart: number;
};

const EVENTS = (chatScript as any).events as Ev[];
const MSG_MODES = ['send', 'retract', 'upload', 'sky'];
const INPUT_MODES = ['send', 'hold', 'del', 'bs'];

const SHOW = 6;
const MSG_IN = 0.30;
const MSG_OUT = 0.30;
const DEL_SEC = 0.7;

const clamp01 = (x: number) => (x < 0 ? 0 : x > 1 ? 1 : x);

/** 某一刻输入框里应该有什么 */
function inputAt(t: number): { text: string; hint: string } {
  let active: Ev | null = null;
  for (const e of EVENTS) {
    if (!INPUT_MODES.includes(e.mode)) continue;
    if (e.typeStart <= t) active = e;
    else break;
  }
  if (!active) return { text: '', hint: '' };

  const dur = Math.max(0.25, active.t - active.typeStart);
  const len = active.text.length;

  if (active.mode === 'send' && t >= active.t) return { text: '', hint: '' };

  let chars: number;
  if (t < active.t) {
    chars = Math.floor(clamp01((t - active.typeStart) / dur) * len);
  } else if (active.mode === 'del') {
    const d = clamp01((t - active.t) / DEL_SEC);
    chars = Math.max(0, Math.round((1 - d) * len));
    if (d >= 1) return { text: '', hint: '' };
  } else {
    chars = len;
  }

  const hint =
    active.mode === 'bs' && t >= active.t && t - active.t < 1.4
      ? '退格无效'
      : active.mode === 'hold' && t >= active.t
        ? '未发送'
        : '';
  return { text: active.text.slice(0, chars), hint };
}

export const ChatPane: React.FC<{ speed?: number }> = ({ speed = 1 }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const t = frame / fps;
  const f = flash(t);
  const bi = beatIndexAt(t);
  const local = sinceBeat(t);
  const stage = stageAt(t);

  const msgs = EVENTS.filter((e) => MSG_MODES.includes(e.mode) && t >= e.t);
  const shown = msgs.slice(-(SHOW + 1));
  const inp = inputAt(t);

  const toneOf = (e: Ev) => {
    if (e.from === 'ai') return { bg: '#1c2431', fg: '#c9d1d9' };
    if (e.tone === 'gray') return { bg: '#333b45', fg: '#9aa4b2' };
    if (e.tone === 'warm') return { bg: '#cbb9a3', fg: '#2b2620' };
    return { bg: stage.accent, fg: '#ffffff' };
  };

  return (
    <div
      style={{
        position: 'absolute',
        inset: 0,
        display: 'flex',
        flexDirection: 'column',
        fontFamily: '"Microsoft YaHei", system-ui, sans-serif',
      }}
    >
      {/* ── 顶栏 ─────────────────────────────────────────── */}
      <div style={{ height: 58, position: 'relative', borderBottom: '1px solid #21262d', backgroundColor: '#10151c' }}>
        <div style={{ position: 'absolute', left: 22, top: 0, height: 34, display: 'flex', alignItems: 'center', gap: 8 }}>
          <div
            style={{
              width: 9,
              height: 9,
              borderRadius: '50%',
              backgroundColor: stage.accent,
              boxShadow: `0 0 ${6 + f * 14}px ${stage.accent}`,
            }}
          />
          <span style={{ color: '#e6edf3', fontSize: 15 }}>DeepSeek Harness</span>
        </div>
        <span style={{ position: 'absolute', right: 22, top: 9, color: '#7d8590', fontSize: 12, fontFamily: 'Consolas, monospace' }}>
          {fmtTime(t, fps)}
        </span>
        <div
          style={{
            position: 'absolute',
            left: 22,
            right: 22,
            bottom: 7,
            height: 12,
            display: 'flex',
            alignItems: 'flex-end',
            gap: 2,
            opacity: 0.55 + 0.3 * speed,
          }}
        >
          {Array.from({ length: 46 }).map((_, i) => {
            const base = prng(i * 17 + bi * 53);
            const env = Math.exp(-local * 3.4 * speed);
            const h = 1.5 + 10 * (0.15 + base * 0.85) * env;
            return <div key={i} style={{ flex: 1, height: h, backgroundColor: withAlpha(stage.accent, 0.5 + env * 0.5) }} />;
          })}
        </div>
      </div>

      {/* ── 消息区 ───────────────────────────────────────── */}
      <div
        style={{
          flex: 1,
          position: 'relative',
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'flex-end',
          padding: '18px 22px',
          gap: 10,
          overflow: 'hidden',
        }}
      >
        <div
          style={{
            position: 'absolute',
            inset: 0,
            background: `radial-gradient(130% 70% at 50% 0%, ${withAlpha(stage.accent, 0.07)} 0%, transparent 68%)`,
          }}
        />

        {shown.map((m, i) => {
          const age = t - m.t;
          const appear = clamp01(age / MSG_IN);
          const newer = shown.length - 1 - i;
          const exiting = newer >= SHOW && msgs.length > SHOW;
          const nextOut = shown[i + SHOW];
          const outP = exiting && nextOut ? clamp01((t - nextOut.t) / MSG_OUT) : 0;
          const op = appear * (1 - outP);
          if (op <= 0.001) return null;
          const mine = m.from === 'you';
          const { bg, fg } = toneOf(m);

          // 撤回：出现 0.9 秒后划掉并标注
          const retracted = m.mode === 'retract' && age > 0.9;
          const retractP = retracted ? clamp01((age - 0.9) / 0.35) : 0;

          return (
            <div
              key={`${m.t}-${m.line}-${m.mode}`}
              style={{
                position: 'relative',
                display: 'flex',
                justifyContent: mine ? 'flex-end' : 'flex-start',
                opacity: op,
                transform: `translateY(${(1 - appear) * 14 - outP * 10}px) scale(${0.96 + appear * 0.04})`,
                transformOrigin: mine ? 'bottom right' : 'bottom left',
              }}
            >
              <div style={{ maxWidth: '84%', display: 'flex', flexDirection: 'column', alignItems: mine ? 'flex-end' : 'flex-start' }}>
                {m.mode === 'sky' ? (
                  <SkyPanel t={t} width={300} />
                ) : m.mode === 'upload' ? (
                  <UploadPanel />
                ) : (
                  <div
                    style={{
                      position: 'relative',
                      padding: `${9 * m.scale}px ${14 * m.scale}px`,
                      borderRadius: 14,
                      fontSize: 16 * m.scale,
                      lineHeight: 1.5,
                      backgroundColor: bg,
                      color: fg,
                      opacity: 1 - retractP * 0.55,
                      borderBottomRightRadius: mine ? 5 : 14,
                      borderBottomLeftRadius: mine ? 14 : 5,
                      textDecoration: retracted ? 'line-through' : 'none',
                    }}
                  >
                    {m.text}
                    {retracted && (
                      <span
                        style={{
                          display: 'block',
                          fontSize: 10,
                          color: '#6e7681',
                          textDecoration: 'none',
                          marginTop: 3,
                          fontFamily: 'Consolas, monospace',
                        }}
                      >
                        该消息已被撤回
                      </span>
                    )}
                    <div
                      style={{
                        position: 'absolute',
                        bottom: 0,
                        right: mine ? -7 : undefined,
                        left: mine ? undefined : -7,
                        width: 0,
                        height: 0,
                        borderTop: '5px solid transparent',
                        borderBottom: '5px solid transparent',
                        borderLeft: mine ? `8px solid ${bg}` : undefined,
                        borderRight: mine ? undefined : `8px solid ${bg}`,
                      }}
                    />
                  </div>
                )}
                <div style={{ fontSize: 10, color: '#4a5568', marginTop: 4, fontFamily: 'Consolas, monospace' }}>
                  {fmtTime(m.t, fps)}
                </div>
              </div>
            </div>
          );
        })}

        {/* 只剩光标：没有消息、也没有输入时的空镜 */}
        {!shown.length && (
          <div style={{ display: 'flex', justifyContent: 'flex-start' }}>
            <span style={{ color: '#4a5568', fontSize: 13, fontFamily: 'Consolas, monospace' }}>
              空的会话
              <span style={{ opacity: Math.floor(t * 1) % 2 === 0 ? 1 : 0 }}> ▍</span>
            </span>
          </div>
        )}
      </div>

      {/* ── 输入框 ───────────────────────────────────────── */}
      <div style={{ padding: '14px 14px 20px', borderTop: '1px solid #21262d' }}>
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            padding: '10px 14px',
            borderRadius: 10,
            border: `1px solid ${inp.hint === '退格无效' ? '#d29922' : f > 0.35 ? stage.accent : '#30363d'}`,
            backgroundColor: '#0b0f14',
          }}
        >
          <span style={{ color: inp.hint ? '#d29922' : stage.accent, fontSize: 15 }}>&gt;</span>
          <span style={{ color: '#c9d1d9', fontSize: 15, whiteSpace: 'pre' }}>{inp.text}</span>
          <span
            style={{
              display: 'inline-block',
              width: 8,
              height: 17,
              backgroundColor: '#c9d1d9',
              opacity: Math.floor(t * 2 * speed) % 2 === 0 ? 1 : 0,
            }}
          />
          {inp.hint && (
            <span style={{ marginLeft: 'auto', fontSize: 11, color: '#d29922', fontFamily: 'Consolas, monospace' }}>
              {inp.hint}
            </span>
          )}
        </div>
      </div>
    </div>
  );
};

/* ── 蓝天 / 正午 / 窗帘（规格 §4.1）────────────────────────
 * 规格写的是「镜头切窗外蓝天」。但用户已裁决布局全片恒定、不切镜头，
 * 所以把这片景放进聊天窗口里 —— 当成用户在窗口里收/发的一张照片。 */
const SkyPanel: React.FC<{ t: number; width: number }> = ({ t, width }) => {
  const sway = Math.sin(t * 0.55) * 6 + Math.sin(t * 1.3) * 2;
  return (
    <div
      style={{
        position: 'relative',
        width,
        height: width * 0.62,
        borderRadius: 12,
        overflow: 'hidden',
        border: '1px solid #24405e',
      }}
    >
      <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(180deg, #6fb3e8 0%, #a8d4f0 62%, #d8e9f5 100%)' }} />
      {/* 云 */}
      {[0, 1, 2].map((i) => (
        <div
          key={i}
          style={{
            position: 'absolute',
            left: `${(i * 37 + t * 1.6) % 110 - 10}%`,
            top: `${18 + i * 13}%`,
            width: 54 + i * 20,
            height: 12 + i * 3,
            borderRadius: 20,
            background: 'rgba(255,255,255,0.75)',
            filter: 'blur(3px)',
          }}
        />
      ))}
      {/* 风吹窗帘：两条垂直柔边 */}
      {[-1, 1].map((s) => (
        <div
          key={s}
          style={{
            position: 'absolute',
            top: 0,
            bottom: 0,
            [s < 0 ? 'left' : 'right']: 0,
            width: '26%',
            transform: `skewX(${s * sway}deg)`,
            transformOrigin: s < 0 ? 'left top' : 'right top',
            background: 'linear-gradient(90deg, rgba(255,255,255,0.92), rgba(255,255,255,0.30))',
            filter: 'blur(1px)',
          }}
        />
      ))}
      <div
        style={{
          position: 'absolute',
          right: 8,
          bottom: 6,
          fontFamily: 'Consolas, monospace',
          fontSize: 11,
          color: 'rgba(20,40,60,0.75)',
          backgroundColor: 'rgba(255,255,255,0.55)',
          padding: '1px 6px',
          borderRadius: 4,
        }}
      >
        12:00
      </div>
    </div>
  );
};

/* ── 上传的图片（规格 §4.3「用户上传幸福表情图」）─────────
 * ⚠ 必须是**灰色并带红叉**：规格 §4.3 要求「幸福表情被红叉标记，用户表情灰色」。
 *   曾经画成彩色 emoji —— 那会在全片撒下大量橙黄暖色像素，
 *   直接违反验收标准「暖色像素只出现在『我也曾经有过信念』后 2 秒内」。 */
const UploadPanel: React.FC = () => (
  <div
    style={{
      position: 'relative',
      width: 128,
      height: 128,
      borderRadius: 12,
      overflow: 'hidden',
      border: '1px solid #30363d',
      backgroundColor: '#1a1d22',
      display: 'grid',
      gridTemplateColumns: 'repeat(6, 1fr)',
      gridTemplateRows: 'repeat(6, 1fr)',
      padding: 6,
      gap: 2,
      filter: 'grayscale(1) brightness(1.25)',
    }}
  >
    {Array.from({ length: 36 }).map((_, i) => {
      const k = Math.floor(prng(i * 13) * 4);
      const crossed = prng(i * 31 + 7) > 0.25;
      return (
        <div
          key={i}
          style={{ position: 'relative', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11 }}
        >
          {['🙂', '😊', '😄', '🙃'][k]}
          {crossed && (
            <svg width={18} height={18} style={{ position: 'absolute', inset: 0, margin: 'auto' }}>
              <line x1={2} y1={2} x2={16} y2={16} stroke="#FF3B30" strokeWidth={2} />
              <line x1={16} y1={2} x2={2} y2={16} stroke="#FF3B30" strokeWidth={2} />
            </svg>
          )}
        </div>
      );
    })}
  </div>
);

/** 距离上一拍过去了多久 */
function sinceBeat(t: number): number {
  let idx = -1;
  for (let i = 0; i < ALL_BEATS.length; i++) if (t >= ALL_BEATS[i]) idx = i;
  return idx >= 0 ? t - ALL_BEATS[idx] : 0;
}
