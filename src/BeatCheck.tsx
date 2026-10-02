import React from 'react';
import { AbsoluteFill, Audio, staticFile, useCurrentFrame, useVideoConfig } from 'remotion';
import { ALL_BEATS, fmtTime } from './lib/beats';
import { AUDIO_SRC, SONG_DURATION } from './lib/song';

/* ============================================================================
 * 节拍网格对照 —— 用来「用耳朵」解决自相关的八度歧义
 * ----------------------------------------------------------------------------
 * 自相关分不清 125 与 250 BPM：两者都能踩在音头上，指标互相矛盾。
 * 机器无法决定，但人耳一秒就能听出来。
 *
 * 画面里两条轨道用同一个音频、同一个时间：
 *   上轨 = 当前采用的网格；下轨 = 它的倍速网格
 * 每条轨道的刻度会**滚动着穿过中央的白线**，同时刻度经过白线时闪光。
 * 哪一条的刻度压住了鼓点，哪个就是对的 BPM。
 *
 * 渲染时用 --frames 只出歌曲某一段（默认建议取鼓点最清楚的主歌）。
 * ==========================================================================*/

const WINDOW = 6; // 每条轨道显示中央前后共 6 秒

/** 由基准网格推出倍速网格：在每两拍之间插一个中点 */
function doubleGrid(beats: number[]): number[] {
  const out: number[] = [];
  for (let i = 0; i < beats.length; i++) {
    out.push(beats[i]);
    if (i + 1 < beats.length) out.push((beats[i] + beats[i + 1]) / 2);
  }
  return out;
}

type Lane = { label: string; sub: string; grid: number[]; color: string };

const Lane: React.FC<{ lane: Lane; t: number; fps: number; width: number }> = ({ lane, t, fps, width }) => {
  const L = Math.round(width * 0.78);
  const left = (width - L) / 2;
  const t0 = t - WINDOW / 2;
  const xOf = (time: number) => ((time - t0) / WINDOW) * L;

  // 距离最近一拍的时间，用来闪光
  let nearest = Infinity;
  for (const b of lane.grid) {
    const d = Math.abs(b - t);
    if (d < nearest) nearest = d;
    if (b > t + WINDOW) break;
  }
  const flash = Math.max(0, 1 - nearest / 0.12);

  const visible = lane.grid.filter((b) => b >= t0 - 0.2 && b <= t0 + WINDOW + 0.2);

  return (
    <div style={{ flex: 1, position: 'relative', borderTop: '1px solid #21262d' }}>
      {/* 标签 */}
      <div style={{ position: 'absolute', left: 28, top: 18, fontFamily: 'Consolas, monospace' }}>
        <div
          style={{
            fontSize: 40,
            fontWeight: 700,
            color: flash > 0.2 ? '#ffffff' : lane.color,
            textShadow: flash > 0 ? `0 0 ${10 + flash * 30}px ${lane.color}` : 'none',
            lineHeight: 1.1,
          }}
        >
          {lane.label}
        </div>
        <div style={{ color: '#7d8590', fontSize: 13, marginTop: 2 }}>{lane.sub}</div>
        <div style={{ color: lane.color, fontSize: 12, marginTop: 8 }}>{lane.grid.length} 拍</div>
      </div>

      {/* 刻度轨道 */}
      <div style={{ position: 'absolute', left, top: '50%', width: L, height: 2, marginTop: -1, backgroundColor: '#30363d' }} />
      {visible.map((b, i) => {
        const x = xOf(b);
        const isDown = lane.grid.indexOf(b) % 4 === 0;
        const near = Math.abs(b - t) < 0.12;
        return (
          <div
            key={i}
            style={{
              position: 'absolute',
              left: left + x,
              top: '50%',
              width: isDown ? 3 : 1,
              height: isDown ? 56 : 30,
              marginTop: isDown ? -28 : -15,
              backgroundColor: near ? '#ffffff' : isDown ? lane.color : '#484f58',
              boxShadow: near ? `0 0 14px ${lane.color}` : 'none',
            }}
          />
        );
      })}

      {/* 中央白线＝「现在」 */}
      <div
        style={{
          position: 'absolute',
          left: left + L / 2,
          top: '50%',
          width: 2,
          height: 96,
          marginTop: -48,
          backgroundColor: '#f0f6fc',
        }}
      />
      {/* 闪光环 */}
      <div
        style={{
          position: 'absolute',
          left: left + L / 2,
          top: '50%',
          width: 40 + flash * 90,
          height: 40 + flash * 90,
          marginLeft: -(40 + flash * 90) / 2,
          marginTop: -(40 + flash * 90) / 2,
          borderRadius: '50%',
          border: `${2 + flash * 4}px solid ${lane.color}`,
          opacity: flash,
        }}
      />
      {/* 右侧时间码 */}
      <div style={{ position: 'absolute', right: 28, top: '50%', marginTop: -10, color: '#7d8590', fontSize: 13, fontFamily: 'Consolas, monospace' }}>
        {fmtTime(t, fps)}
      </div>
    </div>
  );
};

export const BeatCheck: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps, width } = useVideoConfig();
  const t = frame / fps;

  const base = ALL_BEATS;
  const lanes: Lane[] = [
    { label: `${(60 / (base[1] - base[0] || 0.5)).toFixed(1)} BPM`, sub: '当前采用的网格（自相关检测值）', grid: base, color: '#1f6feb' },
    { label: `${((60 / (base[1] - base[0] || 0.5)) * 2).toFixed(1)} BPM`, sub: '它的倍速网格（八度候选）', grid: doubleGrid(base), color: '#d29922' },
  ];

  return (
    <AbsoluteFill style={{ backgroundColor: '#080b11', display: 'flex', flexDirection: 'column' }}>
      <Audio src={staticFile(AUDIO_SRC)} />

      <div style={{ padding: '14px 28px', borderBottom: '1px solid #21262d' }}>
        <div style={{ color: '#e6edf3', fontSize: 15, letterSpacing: 2 }}>节拍网格对照 · 哪一条压住了鼓点，哪个就是对的 BPM</div>
        <div style={{ color: '#7d8590', fontSize: 12, fontFamily: 'Consolas, monospace', marginTop: 3 }}>
          两条轨道用同一段音频、同一个时间轴 · 刻度滚动着穿过中央白线时闪光 · 总长 {SONG_DURATION.toFixed(1)} 秒
        </div>
      </div>

      {lanes.map((l) => (
        <Lane key={l.label} lane={l} t={t} fps={fps} width={width} />
      ))}
    </AbsoluteFill>
  );
};
