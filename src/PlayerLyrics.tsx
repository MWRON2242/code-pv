import React from 'react';
import { AbsoluteFill, Audio, staticFile, useCurrentFrame, useVideoConfig } from 'remotion';
import { ALL_BEATS, beatIndexAt, flash, fmtTime, prng, sinceBeat } from './lib/beats';
import { AUDIO_SRC, BPM, SONG_DURATION } from './lib/song';
import { shotColor, stageAt } from './lib/staging';

/* ============================================================================
 * 方向 D · 播放器标题卡（原来的「歌词页」，去掉歌词）
 * ----------------------------------------------------------------------------
 * 叙事框架里它承担「标题 · 间离」：把观众从故事里拉出来。
 * 所以它不显示歌词 —— 只做封面、曲名、进度、随拍脉动。
 *
 * 出现两次：片头（0:00）与 breakdown（2:48，全曲最安静处）。
 * 颜色用它自己的身份色（粉），密度与脉动由段落强度驱动。
 * ==========================================================================*/

export const PlayerLyrics: React.FC<{ audio?: boolean }> = ({ audio = true }) => {
  const frame = useCurrentFrame();
  const { fps, height } = useVideoConfig();
  const t = frame / fps;
  const f = flash(t);
  const bi = beatIndexAt(t);
  const stage = stageAt(t);
  const accent = shotColor('player');
  // 强度影响封面脉动、频谱幅度与光带亮度 —— 安静段落就收敛，爆发段落就张扬
  const k = 0.35 + stage.intensity * 0.65;

  const artSize = Math.round(height * 0.5);
  const progress = t / SONG_DURATION;

  return (
    <AbsoluteFill
      style={{
        background: 'radial-gradient(120% 90% at 20% 10%, #1a0d18 0%, #08060b 55%, #030204 100%)',
        fontFamily: '"Microsoft YaHei", system-ui, sans-serif',
        display: 'flex',
        flexDirection: 'row',
        alignItems: 'center',
        padding: 60,
        gap: 56,
      }}
    >
      {audio && <Audio src={staticFile(AUDIO_SRC)} />}

      {/* 封面 */}
      <div style={{ position: 'relative', width: artSize, height: artSize, flexShrink: 0 }}>
        {[0, 1].map((kk) => {
          const ph = (t * 0.55 + kk * 0.5) % 1;
          const s = artSize * (1 + ph * 0.22 * k);
          return (
            <div
              key={kk}
              style={{
                position: 'absolute',
                left: '50%',
                top: '50%',
                width: s,
                height: s,
                marginLeft: -s / 2,
                marginTop: -s / 2,
                borderRadius: 24,
                border: `2px solid rgba(255,95,158,${Math.max(0, (0.45 - ph * 0.5) * k)})`,
              }}
            />
          );
        })}
        <div
          style={{
            position: 'absolute',
            inset: 0,
            borderRadius: 24,
            background: 'linear-gradient(140deg, #ff5f9e 0%, #7b2ff7 48%, #1f6feb 100%)',
            boxShadow: `0 0 ${18 + f * 60 * k}px rgba(255,95,158,${0.2 + f * 0.4 * k})`,
            display: 'flex',
            flexDirection: 'column',
            justifyContent: 'flex-end',
            padding: 24,
            overflow: 'hidden',
          }}
        >
          {/* 斜向光带 */}
          <div
            style={{
              position: 'absolute',
              left: -artSize * 0.2,
              top: artSize * 0.18 + Math.sin(t * 1.2) * 12,
              width: artSize * 1.4,
              height: 60,
              background:
                'linear-gradient(180deg, rgba(255,255,255,0) 0%, rgba(255,255,255,0.22) 50%, rgba(255,255,255,0) 100%)',
              transform: 'rotate(-18deg)',
              opacity: k,
            }}
          />

          {/* 跟着拍跳的频谱条 */}
          <div style={{ display: 'flex', alignItems: 'flex-end', gap: 2, height: 34, marginBottom: 12 }}>
            {Array.from({ length: 30 }).map((_, i) => {
              const base = prng(i * 19 + bi * 61);
              const env = Math.exp(-sinceBeat(t) * 3.2);
              return (
                <div
                  key={i}
                  style={{
                    flex: 1,
                    height: 2 + 32 * (0.12 + base * 0.88) * env * k,
                    borderRadius: 1,
                    backgroundColor: `rgba(255,255,255,${0.3 + env * 0.6})`,
                  }}
                />
              );
            })}
          </div>

          <div style={{ color: 'rgba(255,255,255,0.92)', fontSize: 15, letterSpacing: 4 }}>SINGLE</div>
          <div style={{ color: '#fff', fontSize: 30, fontWeight: 700, lineHeight: 1.2, marginTop: 6 }}>
            world.execute
            <br />
            (me);
          </div>
          <div style={{ color: 'rgba(255,255,255,0.7)', fontSize: 14, marginTop: 8 }}>
            {BPM.toFixed(1)} BPM · {SONG_DURATION.toFixed(1)}s
          </div>
        </div>
      </div>

      {/* 右侧：曲目信息 + 进度 */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'center', gap: 18, minWidth: 0 }}>
        <div style={{ fontSize: 13, letterSpacing: 6, color: accent, fontFamily: 'Consolas, monospace' }}>
          NOW PLAYING
        </div>
        <div style={{ fontSize: 46, fontWeight: 700, color: '#ffffff', lineHeight: 1.25 }}>
          代码渲染的音乐 PV
        </div>
        <div style={{ fontSize: 15, color: '#7d8590', fontFamily: 'Consolas, monospace' }}>
          每一帧都是歌曲时间 t 的函数
        </div>

        {/* 进度条 */}
        <div style={{ marginTop: 26 }}>
          <div style={{ height: 5, borderRadius: 3, backgroundColor: '#241b26', position: 'relative' }}>
            <div
              style={{
                position: 'absolute',
                left: 0,
                top: 0,
                height: '100%',
                width: `${progress * 100}%`,
                borderRadius: 3,
                background: `linear-gradient(90deg, ${accent}, #7b2ff7)`,
              }}
            />
            <div
              style={{
                position: 'absolute',
                left: `${progress * 100}%`,
                top: -3,
                width: 11,
                height: 11,
                marginLeft: -5,
                borderRadius: '50%',
                backgroundColor: '#ffffff',
                boxShadow: `0 0 ${6 + f * 18 * k}px ${accent}`,
              }}
            />
          </div>
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              marginTop: 10,
              color: '#7d8590',
              fontSize: 13,
              fontFamily: 'Consolas, monospace',
            }}
          >
            <span>{fmtTime(t, fps)}</span>
            <span style={{ color: accent }}>
              第 {Math.max(0, bi + 1)}/{ALL_BEATS.length} 拍
            </span>
            <span>{fmtTime(SONG_DURATION, fps)}</span>
          </div>
        </div>
      </div>

      {/* 暗角，让注意力集中在中间 */}
      <div
        style={{
          position: 'absolute',
          inset: 0,
          pointerEvents: 'none',
          background: 'radial-gradient(110% 80% at 50% 50%, transparent 45%, rgba(0,0,0,0.5) 100%)',
        }}
      />
    </AbsoluteFill>
  );
};
