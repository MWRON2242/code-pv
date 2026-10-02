import React from 'react';
import { AbsoluteFill, Audio, staticFile, useCurrentFrame, useVideoConfig } from 'remotion';
import { AUDIO_SRC, SONG_DURATION } from './lib/song';
import { flash, prng } from './lib/beats';
import { cameraScaleAt, stageAt } from './lib/staging';
import { weightsAt, sectionNumberAt } from './lib/shotLabels';
import { ChatPane } from './ChatPane';
import { ModelViz } from './modelviz/ModelViz';
import { resolveAt } from './modelviz/resolver';
import { isImplemented } from './modelviz/states';

/* ============================================================================
 * 全片组装
 * ----------------------------------------------------------------------------
 * 布局按规格 §2.1 **全片恒定**：左 50% 聊天窗口 + 右 50% 模型可视化。
 * player / chat / dash / term 只调**权重**（透明度、饱和度、动画速度），
 * 不做显隐切换 —— 铁律：S21 之前任何一侧 opacity 都不为 0。
 *
 * 叠放顺序（从下到上）：
 *   1. 双窗口（左聊天 / 右可视化，各按权重衰减）
 *   2. 全屏接管层（S3 全屏红、S9 全白、S13 灰烬、S19–S21 收拢与标题）
 *   3. 片尾署名（全黑之后）
 * ==========================================================================*/

/** 片尾署名开始的时间（S21 关闭 + 全黑 2 秒之后） */
const CREDITS_AT = 244.6;

const CREDITS = [
  '音乐：Yorushika - だから僕は音楽を辞めた',
  '原作：n-buna / Yorushika',
  '版权：Universal Music Japan',
  '',
  '本 PV 为非官方同人作品，非商业，不盈利。',
  '视觉风格参考：MisakaZentai/world-execute-me-dsh-pv（代码 MIT，美术 CC BY-NC-SA 4.0）',
  'dsh 前端文件：MIT, Copyright (c) 2026 DeepSeek',
  '字体：SIL OFL 1.1',
  '包含 AI 生成内容。',
  '与 Yorushika、Universal Music、DeepSeek 无隶属关系，未经其认可。',
];

export const MainFilm: React.FC<{ showHud?: boolean }> = ({ showHud = false }) => {
  const frame = useCurrentFrame();
  const { fps, width, height } = useVideoConfig();
  const t = frame / fps;

  const w = weightsAt(t);
  const stage = stageAt(t);
  const env = flash(t, 0.12);
  const scale = cameraScaleAt(t) + env * 0.006;
  const shakeX = stage.shake * env * (prng(frame) * 2 - 1);
  const shakeY = stage.shake * env * (prng(frame + 977) * 2 - 1);

  const paneW = Math.round(width / 2);
  const rightW = width - paneW;
  const creditsOp = Math.max(0, Math.min(1, (t - CREDITS_AT) / 1.5));
  const r = resolveAt(t);

  return (
    <AbsoluteFill style={{ backgroundColor: '#04070c' }}>
      <Audio src={staticFile(AUDIO_SRC)} />

      {/* ── 双窗口 ─────────────────────────────────────────── */}
      <AbsoluteFill
        style={{
          transform: `scale(${scale}) translate(${shakeX.toFixed(2)}px, ${shakeY.toFixed(2)}px)`,
        }}
      >
        <div style={{ display: 'flex', width: '100%', height: '100%' }}>
          {/* 左：聊天窗口。低权重时变暗、去饱和、动画变慢，但不隐藏 */}
          <div
            style={{
              width: paneW,
              height: '100%',
              position: 'relative',
              opacity: w.left,
              filter: `saturate(${w.sat.toFixed(2)})`,
            }}
          >
            <ChatPane speed={w.speed} />
          </div>

          {/* 右：模型可视化 */}
          <div
            style={{
              width: rightW,
              height: '100%',
              position: 'relative',
              opacity: w.right,
              borderLeft: '1px solid #16202c',
              backgroundColor: '#060a10',
              overflow: 'hidden',
            }}
          >
            <ModelViz layer="right" width={rightW} height={height} />
          </div>
        </div>
      </AbsoluteFill>

      {/* ── 全屏接管层 ─────────────────────────────────────── */}
      <ModelViz layer="full" width={width} height={height} />

      {/* ── 调试 HUD（仅在 MainFilmDebug 里打开）───────────── */}
      {showHud && (
        <div
          style={{
            position: 'absolute',
            left: 10,
            bottom: 8,
            fontFamily: 'Consolas, monospace',
            fontSize: 11,
            color: '#58a6ff',
            backgroundColor: 'rgba(0,0,0,0.6)',
            padding: '3px 8px',
            borderRadius: 4,
            letterSpacing: 1,
          }}
        >
          t={t.toFixed(2)} · 段{sectionNumberAt(t)} {w.label} · L{w.left.toFixed(2)} R{w.right.toFixed(2)} ·{' '}
          <span style={{ color: isImplemented(r.current.id) ? '#3fb950' : '#d29922' }}>
            {r.current.id} {r.current.name}
            {isImplemented(r.current.id) ? '' : '（未实现）'}
          </span>
          {r.current.transition > 0 && r.progress < 1 ? ` · 过渡 ${(r.progress * 100).toFixed(0)}%` : ''}
        </div>
      )}

      {/* ── 片尾署名 ───────────────────────────────────────── */}
      {creditsOp > 0.001 && (
        <AbsoluteFill
          style={{
            backgroundColor: '#000000',
            opacity: creditsOp,
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 9,
          }}
        >
          {CREDITS.map((line, i) => (
            <div
              key={i}
              style={{
                fontFamily: '"Microsoft YaHei", system-ui, sans-serif',
                fontSize: line.startsWith('音乐') ? 18 : 13,
                color: line.startsWith('音乐') ? '#e6edf3' : '#7d8590',
                letterSpacing: 1,
              }}
            >
              {line || '\u00A0'}
            </div>
          ))}
        </AbsoluteFill>
      )}
    </AbsoluteFill>
  );
};
