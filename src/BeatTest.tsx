import React from 'react';
import { AbsoluteFill, Audio, staticFile, useCurrentFrame, useVideoConfig } from 'remotion';
import answer from '../input/test-track.beats.json';

/**
 * 里程碑 1 —— 把打点表画出来。
 *
 * 这个组件只做一件事：证明「打点表 → 画面」这条链路通了。
 * 画面里每一个元素的位置，都是从 markers/beats 数据算出来的，
 * 没有一处是手写的固定时间。
 */

const beats: number[] = answer.beats;
const sections = answer.sections as Array<{ t: number; name: string; note: string }>;
const DUR: number = answer.duration;
const BEATS_PER_BAR = 4;

function fmt(t: number, fps: number) {
  const m = Math.floor(t / 60);
  const s = Math.floor(t % 60);
  const f = Math.floor((t - Math.floor(t)) * fps);
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}.${String(f).padStart(2, '0')}`;
}

export const BeatTest: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps, width, durationInFrames } = useVideoConfig();
  const t = frame / fps;

  // 当前落在第几拍上
  let idx = -1;
  for (let i = 0; i < beats.length; i++) if (t >= beats[i]) idx = i;

  const sinceBeat = idx >= 0 ? t - beats[idx] : 999;
  const flash = Math.max(0, 1 - sinceBeat / 0.22);          // 击打瞬间 1 → 0
  const barNo = Math.floor((idx < 0 ? 0 : idx) / BEATS_PER_BAR) + 1;

  const toX = (tt: number) => (tt / DUR) * width;
  const pulse = 120 + flash * 130;

  return (
    <AbsoluteFill style={{ backgroundColor: '#0d1117', fontFamily: 'Consolas, "Courier New", monospace' }}>
      <Audio src={staticFile('audio/test-track.wav')} />

      {/* 拍网格背景 */}
      {beats.map((b, i) => (
        <div
          key={'g' + i}
          style={{
            position: 'absolute',
            left: toX(b),
            top: 0,
            width: 1,
            height: '100%',
            backgroundColor: i % BEATS_PER_BAR === 0 ? '#30363d' : '#191e26',
          }}
        />
      ))}

      {/* 段落色带 */}
      {sections.map((s, i) => {
        const next = i + 1 < sections.length ? sections[i + 1].t : DUR;
        return (
          <div
            key={'s' + i}
            style={{
              position: 'absolute',
              left: toX(s.t),
              top: 200,
              width: Math.max(0, toX(next) - toX(s.t)),
              height: 44,
              backgroundColor: 'rgba(31,111,235,0.10)',
              borderLeft: '2px solid #1f6feb',
              display: 'flex',
              alignItems: 'center',
              paddingLeft: 10,
              color: '#58a6ff',
              fontSize: 14,
            }}
          >
            {s.name}
          </div>
        );
      })}

      {/* 随拍脉冲的圆 */}
      <div
        style={{
          position: 'absolute',
          left: '50%',
          top: '62%',
          width: pulse,
          height: pulse,
          marginLeft: -pulse / 2,
          marginTop: -pulse / 2,
          borderRadius: '50%',
          border: `${2 + flash * 4}px solid #1f6feb`,
          backgroundColor: `rgba(31,111,235,${0.05 + flash * 0.35})`,
        }}
      />

      {/* 底部拍点刻度 */}
      <div style={{ position: 'absolute', left: 0, bottom: 88, width: '100%', height: 2, backgroundColor: '#30363d' }} />
      {beats.map((b, i) => (
        <div
          key={'t' + i}
          style={{
            position: 'absolute',
            left: toX(b) - (i % BEATS_PER_BAR === 0 ? 1.5 : 0.5),
            bottom: 84,
            width: i % BEATS_PER_BAR === 0 ? 3 : 1,
            height: i % BEATS_PER_BAR === 0 ? 26 : 14,
            backgroundColor: i === idx ? '#f0f6fc' : i % BEATS_PER_BAR === 0 ? '#8b949e' : '#484f58',
          }}
        />
      ))}

      {/* 播放头 */}
      <div style={{ position: 'absolute', left: toX(t), top: 0, width: 2, height: '100%', backgroundColor: '#f0f6fc' }} />

      {/* 左上信息 */}
      <div style={{ position: 'absolute', left: 48, top: 40, color: '#e6edf3' }}>
        <div style={{ fontSize: 13, color: '#7d8590', letterSpacing: 3 }}>打点表 → 画面</div>
        <div style={{ fontSize: 58, fontWeight: 700, lineHeight: 1.15 }}>{fmt(t, fps)}</div>
        <div style={{ fontSize: 16, color: '#58a6ff' }}>
          第 {Math.max(1, barNo)} 小节 · 第 {idx < 0 ? 0 : idx + 1} 拍 / 共 {beats.length} 拍
        </div>
      </div>

      {/* 右上信息 */}
      <div style={{ position: 'absolute', right: 48, top: 40, textAlign: 'right', color: '#7d8590', fontSize: 14, lineHeight: 1.7 }}>
        <div>BPM {answer.bpm}</div>
        <div>总长 {DUR.toFixed(2)} 秒</div>
        <div>{durationInFrames} 帧 @ {fps}fps</div>
        <div style={{ color: '#3fb950' }}>数据驱动 · 无手工关键帧</div>
      </div>
    </AbsoluteFill>
  );
};
