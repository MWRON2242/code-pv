import React from 'react';
import { AbsoluteFill, Audio, staticFile, useCurrentFrame, useVideoConfig } from 'remotion';
import { ALL_BEATS, beatIndexAt, flash, fmtTime, prng } from './lib/beats';
import { AUDIO_SRC, CHAT_SCRIPT } from './lib/song';
import { stageAt, withAlpha } from './lib/staging';

/* ============================================================================
 * 方向 A · 聊天窗口（全片主体）
 * 左边是聊天界面，右边是运行着她的那个「世界」。
 *
 * 因为这一支镜头要独自扛住 3~4 分钟，重点不是好看，而是「一直在动、但不烦人」：
 *   - 消息有进场和**退场**动画（满窗后不是突然消失）
 *   - 每条消息带时间码，强化「时间在走」
 *   - 顶栏是一条随拍跳动的迷你波形
 *   - 右侧世界面板有滚动的十六进制数据流
 *   - 每拍有一道扫描线扫过世界面板
 * ==========================================================================*/

const SHOW = 6;        // 聊天区同时可见的消息条数
const MSG_IN = 0.30;   // 进场时长（秒）
const MSG_OUT = 0.30;  // 退场时长（秒）

export const ChatWindow: React.FC<{ audio?: boolean }> = ({ audio = true }) => {
  const frame = useCurrentFrame();
  const { fps, width, height } = useVideoConfig();
  const t = frame / fps;
  const f = flash(t);
  const bi = beatIndexAt(t);
  const local = sinceBeatLocal(t);
  const stage = stageAt(t);

  /* ---------------------------------------------------------- 消息列表
   * 多取一条，让「正要被挤出窗口」的那条有机会做退场动画。 */
  const all = CHAT_SCRIPT.filter((m) => t >= m.t);
  const shown = all.slice(-(SHOW + 1));

  const next = CHAT_SCRIPT.find((m) => t < m.t);
  const typing = !!next && next.from === 'her' && next.t - t < 1.6;

  // 右侧「世界」的格子
  const COLS = 26;
  const ROWS = 15;
  const cellW = (width - Math.round(width * 0.46)) / COLS;
  const cellH = (height * 0.72) / ROWS;

  // 每拍扫过世界面板的一道横向亮线
  const sweepEnv = Math.max(0, 1 - local / 0.5);
  const sweepY = (local / 0.5) * height;

  return (
    <AbsoluteFill
      style={{
        backgroundColor: '#0d1117',
        fontFamily: '"Microsoft YaHei", system-ui, sans-serif',
        display: 'flex',
        flexDirection: 'row',
      }}
    >
      {audio && <Audio src={staticFile(AUDIO_SRC)} />}

      {/* ================= 左：聊天窗口 ================= */}
      <div
        style={{
          width: Math.round(width * 0.46),
          height: '100%',
          borderRight: `1px solid #21262d`,
          display: 'flex',
          flexDirection: 'column',
        }}
      >
        {/* 顶栏：状态点 + 标题 + 迷你波形 + 时间码 */}
        <div
          style={{
            height: 58,
            position: 'relative',
            borderBottom: '1px solid #21262d',
            backgroundColor: '#10151c',
          }}
        >
          <div
            style={{
              position: 'absolute',
              left: 22,
              top: 0,
              height: 34,
              display: 'flex',
              alignItems: 'center',
              gap: 8,
            }}
          >
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
          <span
            style={{
              position: 'absolute',
              right: 22,
              top: 9,
              color: '#7d8590',
              fontSize: 12,
              fontFamily: 'Consolas, monospace',
            }}
          >
            {fmtTime(t, fps)}
          </span>

          {/* 迷你波形：跟着拍跳 */}
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
              opacity: 0.8,
            }}
          >
            {Array.from({ length: 62 }).map((_, i) => {
              const base = prng(i * 17 + bi * 53);
              const env = Math.exp(-local * 3.4);
              const h = 1.5 + 10 * (0.15 + base * 0.85) * env;
              return (
                <div
                  key={i}
                  style={{ flex: 1, height: h, backgroundColor: withAlpha(stage.accent, 0.55 + env * 0.45) }}
                />
              );
            })}
          </div>
        </div>

        {/* 消息区 */}
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
          {/* 一层很淡的顶光，避免大片死黑 */}
          <div
            style={{
              position: 'absolute',
              inset: 0,
              background: `radial-gradient(130% 70% at 50% 0%, ${withAlpha(stage.accent, 0.07)} 0%, transparent 68%)`,
            }}
          />

          {shown.map((m, i) => {
            const age = t - m.t;
            const appear = Math.max(0, Math.min(1, age / MSG_IN));
            // 有比它更新的 SHOW 条时，它该退场了；退场从「第 SHOW 条更新的消息」到达时开始
            const newer = shown.length - 1 - i;
            const exiting = newer >= SHOW && all.length > SHOW;
            const exitStart = exiting && shown[i + SHOW] ? shown[i + SHOW].t : Infinity;
            const outP = exiting && isFinite(exitStart) ? Math.min(1, (t - exitStart) / MSG_OUT) : 0;
            const op = appear * (1 - outP);
            if (op <= 0.001) return null;

            const mine = m.from === 'you';
            const bubbleBg = mine ? stage.accent : '#1c2431';
            return (
              <div
                key={m.t}
                style={{
                  position: 'relative',
                  display: 'flex',
                  justifyContent: mine ? 'flex-end' : 'flex-start',
                  opacity: op,
                  transform: `translateY(${(1 - appear) * 14 - outP * 10}px) scale(${0.96 + appear * 0.04})`,
                  transformOrigin: mine ? 'bottom right' : 'bottom left',
                }}
              >
                <div
                  style={{
                    maxWidth: '78%',
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: mine ? 'flex-end' : 'flex-start',
                  }}
                >
                  <div
                    style={{
                      position: 'relative',
                      padding: '9px 14px',
                      borderRadius: 14,
                      fontSize: 16,
                      lineHeight: 1.5,
                      backgroundColor: bubbleBg,
                      color: mine ? '#ffffff' : '#c9d1d9',
                      borderBottomRightRadius: mine ? 5 : 14,
                      borderBottomLeftRadius: mine ? 14 : 5,
                    }}
                  >
                    {m.text}
                    {/* 气泡小尾巴 */}
                    <div
                      style={{
                        position: 'absolute',
                        bottom: 0,
                        [mine ? 'right' : 'left']: -7,
                        width: 0,
                        height: 0,
                        borderTop: '5px solid transparent',
                        borderBottom: '5px solid transparent',
                        [mine ? 'borderLeft' : 'borderRight']: `8px solid ${bubbleBg}`,
                      }}
                    />
                  </div>
                  <div
                    style={{
                      fontSize: 10,
                      color: '#4a5568',
                      marginTop: 4,
                      fontFamily: 'Consolas, monospace',
                    }}
                  >
                    {fmtTime(m.t, fps)}
                  </div>
                </div>
              </div>
            );
          })}

          {typing && (
            <div style={{ display: 'flex', justifyContent: 'flex-start' }}>
              <div
                style={{
                  padding: '10px 16px',
                  borderRadius: 14,
                  borderBottomLeftRadius: 5,
                  backgroundColor: '#1c2431',
                  color: '#7d8590',
                  fontSize: 15,
                  letterSpacing: 2,
                }}
              >
                {'•'.repeat(1 + (Math.floor(t * 3) % 3))}
              </div>
            </div>
          )}
        </div>

        {/* 输入框 */}
        <div style={{ padding: '14px 14px 20px', borderTop: '1px solid #21262d' }}>
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 8,
              padding: '10px 14px',
              borderRadius: 10,
              border: `1px solid ${f > 0.35 ? stage.accent : '#30363d'}`,
              backgroundColor: '#0b0f14',
            }}
          >
            <span style={{ color: stage.accent, fontSize: 15 }}>&gt;</span>
            <span style={{ color: '#c9d1d9', fontSize: 15 }}>
              {'world.execute(me);'.slice(0, Math.floor(t * 2.4) % 19)}
            </span>
            <span
              style={{
                display: 'inline-block',
                width: 8,
                height: 17,
                backgroundColor: '#c9d1d9',
                opacity: Math.floor(t * 2) % 2 === 0 ? 1 : 0,
              }}
            />
          </div>
        </div>
      </div>

      {/* ================= 右：「她所在的」世界 ================= */}
      <div style={{ flex: 1, position: 'relative', overflow: 'hidden' }}>
        {/* 会随段落推近/拉远的一层；底部标签不参与缩放 */}
        <div
          style={{
            position: 'absolute',
            inset: 0,
            transform: `scale(${stage.worldScale})`,
            transformOrigin: 'center',
          }}
        >
          {/* 格子 */}
          {Array.from({ length: ROWS }).map((_, r) =>
            Array.from({ length: COLS }).map((__, c) => {
              const rnd = prng(r * 97 + c * 31);
              const beatLit = (r + c + bi) % 4 === 0;
              const on = beatLit || rnd < stage.gridDensity * 0.4;
              const a = on ? 0.26 + 0.65 * f * (0.5 + rnd) : 0.025 + rnd * 0.02;
              return (
                <div
                  key={`${r}-${c}`}
                  style={{
                    position: 'absolute',
                    left: c * cellW + 2,
                    top: r * cellH + 44,
                    width: cellW - 4,
                    height: cellH - 4,
                    backgroundColor: withAlpha(stage.accent, a),
                  }}
                />
              );
            })
          )}

          {/* 右侧：滚动的十六进制数据流 */}
          <div
            style={{
              position: 'absolute',
              right: 14,
              top: 70,
              width: 132,
              height: 320,
              overflow: 'hidden',
              opacity: 0.5,
              fontFamily: 'Consolas, monospace',
              fontSize: 10.5,
              lineHeight: '16px',
              color: withAlpha(stage.accent, 0.85),
              WebkitMaskImage: 'linear-gradient(180deg, transparent 0%, #000 18%, #000 82%, transparent 100%)',
              maskImage: 'linear-gradient(180deg, transparent 0%, #000 18%, #000 82%, transparent 100%)',
            }}
          >
            <div
              style={{
                transform: `translateY(${-((t * 6) % 1) * 16}px)`,
              }}
            >
              {Array.from({ length: 22 }).map((_, i) => (
                <div key={i} style={{ whiteSpace: 'pre' }}>
                  {hexToken(Math.floor(t * 6) + i)}
                </div>
              ))}
            </div>
          </div>

          {/* 中心脉冲环 */}
          {[0, 1, 2].map((k) => {
            const ph = (local + k * 0.11) % 0.66;
            const scale = 0.4 + ph * 1.5;
            return (
              <div
                key={k}
                style={{
                  position: 'absolute',
                  left: '50%',
                  top: '52%',
                  width: 360 * scale,
                  height: 360 * scale,
                  marginLeft: -180 * scale,
                  marginTop: -180 * scale,
                  borderRadius: '50%',
                  border: `2px solid ${withAlpha(stage.accent, Math.max(0, 0.5 - ph * 0.75))}`,
                }}
              />
            );
          })}

          {/* 中央：她所在的「世界」——一圈随拍脉动的字符 */}
          <div
            style={{
              position: 'absolute',
              left: '50%',
              top: '50%',
              transform: 'translate(-50%, -50%)',
              color: stage.accent,
              fontSize: 17,
              lineHeight: 1.06,
              fontFamily: 'Consolas, monospace',
              whiteSpace: 'pre',
              textShadow: `0 0 ${8 + f * 26}px ${withAlpha(stage.accent, 0.35 + f * 0.5)}`,
            }}
          >
            {mandala(t * stage.mandalaSpeed, f)}
          </div>

          {/* 每拍扫过一道亮线 */}
          <div
            style={{
              position: 'absolute',
              left: 0,
              right: 0,
              top: sweepY,
              height: 2,
              opacity: sweepEnv * 0.75,
              background: `linear-gradient(90deg, transparent, ${withAlpha(stage.accent, 0.9)}, transparent)`,
            }}
          />
        </div>

        {/* 底部标签 */}
        <div
          style={{
            position: 'absolute',
            left: 0,
            bottom: 0,
            width: '100%',
            padding: '10px 22px 20px',
            display: 'flex',
            gap: 18,
            color: '#7d8590',
            fontSize: 12,
            fontFamily: 'Consolas, monospace',
            borderTop: '1px solid #21262d',
          }}
        >
          <span>BEAT {Math.max(0, bi + 1)}/{ALL_BEATS.length}</span>
          <span>BAR {Math.floor(Math.max(0, bi) / 4) + 1}</span>
          <span>FPS {fps}</span>
          <span style={{ marginLeft: 'auto', color: stage.accent }}>RUNNING</span>
        </div>
      </div>
    </AbsoluteFill>
  );
};

/** 距离上一拍过去了多久 */
function sinceBeatLocal(t: number): number {
  let idx = -1;
  for (let i = 0; i < ALL_BEATS.length; i++) if (t >= ALL_BEATS[i]) idx = i;
  return idx >= 0 ? t - ALL_BEATS[idx] : 0;
}

/* 中心那团字符：按「到中心的距离」决定密度，再叠一层向外扩散的波 */
const RAMP = ' .:-=+*#%@';
const M_ROWS = 17;
const M_COLS = 34;

function mandala(t: number, f: number): string {
  const rows: string[] = [];
  for (let r = 0; r < M_ROWS; r++) {
    let s = '';
    for (let c = 0; c < M_COLS; c++) {
      const dx = (c - (M_COLS - 1) / 2) / (M_COLS / 2);
      const dy = (r - (M_ROWS - 1) / 2) / (M_ROWS / 2);
      const d = Math.sqrt(dx * dx + dy * dy);
      const wave = Math.sin(d * 7 - t * 4.2) * 0.5 + 0.5;
      const v = Math.max(0, 1 - d * 0.62) * wave * (0.4 + f * 0.85);
      s += RAMP[Math.min(RAMP.length - 1, Math.floor(v * RAMP.length))];
    }
    rows.push(s);
  }
  return rows.join('\n');
}

/** 确定性伪随机的十六进制片段：同一帧永远得到同一串 */
function hexToken(n: number): string {
  let s = (Math.floor(n) * 2654435761) >>> 0;
  const parts: string[] = [];
  for (let k = 0; k < 4; k++) {
    s = (s * 1664525 + 1013904223) >>> 0;
    parts.push((s % 65536).toString(16).padStart(4, '0'));
  }
  return parts.join(' ');
}
