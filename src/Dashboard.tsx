import React from 'react';
import { AbsoluteFill, Audio, staticFile, useCurrentFrame, useVideoConfig } from 'remotion';
import { ALL_BEATS, beatIndexAt, flash, fmtTime, prng, sinceBeat, SONG_DURATION } from './lib/beats';
import { AUDIO_SRC, BPM } from './lib/song';
import { sectionAt, shotColor, stageAt } from './lib/staging';

/* ============================================================================
 * 方向 C · 仪表盘 / 数据可视化
 * 频谱、示波器、指标环、状态灯。最适合做「跟着音乐抖」的画面。
 * ==========================================================================*/

const AMBER = '#ffbd2e';
const PANEL = '#0a1018';
const LINE = '#1b2735';

const BAR_COUNT = 56;

function Gauge({ cx, cy, label, value, color }: { cx: number; cy: number; label: string; value: number; color: string }) {
  const r = 46;
  const C = 2 * Math.PI * r;
  const v = Math.max(0, Math.min(1, value));
  return (
    <g>
      <circle cx={cx} cy={cy} r={r} fill="none" stroke={LINE} strokeWidth={9} />
      <circle
        cx={cx}
        cy={cy}
        r={r}
        fill="none"
        stroke={color}
        strokeWidth={9}
        strokeDasharray={`${v * C} ${C}`}
        strokeLinecap="round"
        transform={`rotate(-90 ${cx} ${cy})`}
      />
      <text x={cx} y={cy - 2} textAnchor="middle" fill="#e6edf3" fontSize={22} fontFamily="Consolas, monospace">
        {(v * 100).toFixed(0)}
      </text>
      <text x={cx} y={cy + 20} textAnchor="middle" fill="#7d8590" fontSize={12} fontFamily="Consolas, monospace">
        {label}
      </text>
    </g>
  );
}

export const Dashboard: React.FC<{ audio?: boolean }> = ({ audio = true }) => {
  const frame = useCurrentFrame();
  const { fps, width, height } = useVideoConfig();
  const t = frame / fps;
  const f = flash(t);
  const bi = beatIndexAt(t);
  const beat = Math.max(0, bi);
  const local = sinceBeat(t);
  // 镜头的身份色固定为青；段落强度驱动频谱、示波器与数值的「劲头」
  const CYAN = shotColor('dash');
  const stage = stageAt(t);
  const k = 0.4 + stage.intensity * 0.6;

  const step = 100000 + beat * 137;
  const loss = 0.9 - (beat % 40) * 0.018 + prng(beat * 7) * 0.03;
  const lr = 3e-4 * (1 + prng(beat * 11) * 0.4);

  // 示波器折线
  const scopeW = width * 0.30;
  const scopePts: string[] = [];
  for (let i = 0; i <= 60; i++) {
    const p = i / 60;
    const amp = (16 + 26 * Math.exp(-local * 6)) * k;
    const y = 60 + Math.sin(p * 15 + t * 9) * amp * Math.sin(p * 3.1 + t * 1.7);
    scopePts.push(`${(p * scopeW).toFixed(1)},${y.toFixed(1)}`);
  }

  // 损失曲线：一路下滑 + 噪声，看着像真在训练
  const curveW = width * 0.62;
  const lossPts: string[] = [];
  for (let i = 0; i <= 63; i++) {
    const v = 0.95 - (i / 63) * 0.35 + (prng(i * 7 + 3) - 0.5) * 0.05;
    const x = (i / 63) * curveW;
    const y = 80 - (0.95 - v) * 200;
    lossPts.push(`${x.toFixed(1)},${Math.max(8, Math.min(84, y)).toFixed(1)}`);
  }

  return (
    <AbsoluteFill style={{ backgroundColor: '#04070c', fontFamily: 'Consolas, monospace', padding: 26 }}>
      {audio && <Audio src={staticFile(AUDIO_SRC)} />}

      {/* 背景网格 */}
      {Array.from({ length: 24 }).map((_, i) => (
        <div key={'v' + i} style={{ position: 'absolute', left: (i * width) / 24, top: 0, width: 1, height: '100%', backgroundColor: '#0b1220' }} />
      ))}
      {Array.from({ length: 14 }).map((_, i) => (
        <div key={'h' + i} style={{ position: 'absolute', top: (i * height) / 14, left: 0, height: 1, width: '100%', backgroundColor: '#0b1220' }} />
      ))}

      {/* 顶栏 */}
      <div style={{ position: 'absolute', left: 26, right: 26, top: 22, height: 46, display: 'flex', alignItems: 'center', gap: 16, borderBottom: `1px solid ${LINE}` }}>
        <div style={{ width: 10, height: 10, borderRadius: '50%', backgroundColor: f > 0.4 ? AMBER : '#3a4655', boxShadow: f > 0.4 ? `0 0 16px ${AMBER}` : 'none' }} />
        <span style={{ color: '#e6edf3', fontSize: 17, letterSpacing: 3 }}>TRAINING TELEMETRY</span>
        <span style={{ color: '#7d8590', fontSize: 13 }}>run · world-execute-me</span>
        <span style={{ marginLeft: 'auto', color: CYAN, fontSize: 20 }}>{fmtTime(t, fps)}</span>
      </div>

      {/* 左侧指标环 */}
      <div style={{ position: 'absolute', left: 26, top: 92 }}>
        <svg width={340} height={200}>
          <Gauge cx={80} cy={86} label="LOSS" value={loss} color={AMBER} />
          <Gauge cx={200} cy={86} label="LR" value={0.35 + f * 0.5} color={CYAN} />
          <Gauge cx={300} cy={86} label="SEQ" value={(beat % 12) / 12} color="#3fb950" />
        </svg>
      </div>

      {/* 右上示波器 */}
      <div style={{ position: 'absolute', right: 26, top: 92, width: width * 0.30, height: 150, border: `1px solid ${LINE}`, backgroundColor: PANEL }}>
        <div style={{ padding: '6px 10px', color: '#7d8590', fontSize: 12, borderBottom: `1px solid ${LINE}` }}>SCOPE · activations</div>
        <svg width={width * 0.30} height={110} style={{ display: 'block' }}>
          <polyline points={scopePts.join(' ')} fill="none" stroke={CYAN} strokeWidth={2} />
        </svg>
      </div>

      {/* 中央大数字 */}
      <div style={{ position: 'absolute', left: '50%', top: '40%', transform: 'translate(-50%, -50%)', textAlign: 'center' }}>
        <div style={{ color: '#7d8590', fontSize: 13, letterSpacing: 4 }}>GLOBAL STEP</div>
        <div style={{ color: '#e6edf3', fontSize: 92, lineHeight: 1.05, fontWeight: 700, textShadow: `0 0 ${12 + f * 40}px rgba(88,166,255,${0.35 + f * 0.5})` }}>
          {step}
        </div>
        <div style={{ color: CYAN, fontSize: 18 }}>loss {loss.toFixed(4)}   lr {lr.toExponential(2)}</div>
        <div style={{ color: '#3fb950', fontSize: 15, marginTop: 6 }}>
          beat {beat + 1}/{ALL_BEATS.length} · bar {Math.floor(beat / 4) + 1}
        </div>
      </div>

      {/* 中部：损失曲线 */}
      <div style={{ position: 'absolute', left: 26, top: 396, width: curveW, height: 128, border: `1px solid ${LINE}`, backgroundColor: PANEL }}>
        <div style={{ padding: '6px 10px', color: '#7d8590', fontSize: 12, borderBottom: `1px solid ${LINE}` }}>
          LOSS CURVE · rolling 64 steps
        </div>
        <svg width={curveW} height={92} style={{ display: 'block' }}>
          <polyline points={lossPts.join(' ')} fill="none" stroke={AMBER} strokeWidth={2} />
        </svg>
      </div>

      {/* 中部右侧：实时指标块 */}
      <div
        style={{
          position: 'absolute',
          left: 26 + curveW + 16,
          right: 26,
          top: 396,
          height: 128,
          border: `1px solid ${LINE}`,
          backgroundColor: PANEL,
          display: 'flex',
          flexDirection: 'column',
        }}
      >
        <div style={{ padding: '6px 10px', color: '#7d8590', fontSize: 12, borderBottom: `1px solid ${LINE}` }}>
          LIVE METRICS
        </div>
        <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'space-around' }}>
          {[
            { k: 'TOK/S', v: String(1200 + Math.round(prng(beat * 3) * 900)) },
            { k: 'GRAD', v: (0.4 + prng(beat * 5) * 1.6).toFixed(2) },
            { k: 'TEMP', v: (0.6 + f * 0.5).toFixed(2) },
            { k: 'MEM', v: (12 + prng(beat * 9) * 8).toFixed(1) + 'G' },
          ].map((m) => (
            <div key={m.k} style={{ textAlign: 'center' }}>
              <div style={{ color: CYAN, fontSize: 26 }}>{m.v}</div>
              <div style={{ color: '#7d8590', fontSize: 11 }}>{m.k}</div>
            </div>
          ))}
        </div>
      </div>

      {/* 频谱条 */}
      <div style={{ position: 'absolute', left: 26, right: 26, bottom: 44, height: 120, display: 'flex', alignItems: 'flex-end', gap: 3 }}>
        {Array.from({ length: BAR_COUNT }).map((_, i) => {
          const base = prng(i * 13 + beat * 101);
          const env = Math.exp(-local * (2.2 + (i / BAR_COUNT) * 5));
          const h = 6 + 118 * (0.16 + base * 0.84) * env * k;
          const hue = CYAN;
          return (
            <div
              key={i}
              style={{
                flex: 1,
                height: h,
                backgroundColor: hue,
                opacity: 0.35 + env * 0.65,
                boxShadow: env > 0.55 ? `0 0 12px ${hue}` : 'none',
              }}
            />
          );
        })}
      </div>

      {/* 底部状态 */}
      <div style={{ position: 'absolute', left: 26, right: 26, bottom: 14, display: 'flex', gap: 20, color: '#7d8590', fontSize: 12 }}>
        {['PRE', 'SFT', 'RLHF', 'DEPLOY'].map((s, i) => (
          <span key={s} style={{ color: i === 2 && f > 0.3 ? AMBER : '#7d8590' }}>
            ● {s}
          </span>
        ))}
        <span style={{ marginLeft: 'auto' }}>
          total {SONG_DURATION.toFixed(2)}s · {BPM.toFixed(1)} BPM · {sectionAt(t)}
        </span>
      </div>
    </AbsoluteFill>
  );
};
