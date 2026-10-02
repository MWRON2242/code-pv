import React from 'react';
import { Composition } from 'remotion';
import { MainFilm } from './MainFilm';
import { BeatTest } from './BeatTest';
import { BeatCheck } from './BeatCheck';
import { ChatWindow } from './ChatWindow';
import { TerminalTUI } from './TerminalTUI';
import { Dashboard } from './Dashboard';
import { PlayerLyrics } from './PlayerLyrics';
import { PREVIEW_SECONDS } from './lib/beats';
import { FPS, SONG_DURATION } from './lib/song';

const W = 1280;
const H = 720;

/** 片尾署名的额外时长：S21 关闭 + 全黑 2 秒 + 署名 */
const OUTRO_EXTRA = 6;

/**
 * 「影片登记处」。
 * 每个 Composition 就是一条可渲染的成片：id + 组件 + 时长 + 画布尺寸。
 * 时长全部从数据算出来 —— 时间是一等公民。
 */
export const RemotionRoot: React.FC = () => {
  const songFrames = Math.round(SONG_DURATION * FPS);
  const filmFrames = Math.round((SONG_DURATION + OUTRO_EXTRA) * FPS);
  const previewFrames = Math.round(PREVIEW_SECONDS * FPS);

  return (
    <>
      {/* 正片：按规格 §2.1 的恒定双窗口布局 + 22 个崩坏状态机 */}
      <Composition id="MainFilm" component={MainFilm} durationInFrames={filmFrames} fps={FPS} width={W} height={H} />

      {/* 同上，但带调试 HUD（状态号 / 段落 / 权重 / 过渡进度），验收用 */}
      <Composition
        id="MainFilmDebug"
        component={MainFilm}
        durationInFrames={filmFrames}
        fps={FPS}
        width={W}
        height={H}
        defaultProps={{ showHud: true }}
      />

      {/* 里程碑 1：把打点表画出来，验证「数据 → 画面」 */}
      <Composition id="BeatTest" component={BeatTest} durationInFrames={songFrames} fps={FPS} width={W} height={H} />

      {/* 诊断：节拍网格对照，用来用人耳解决自相关的八度歧义 */}
      <Composition id="BeatCheck" component={BeatCheck} durationInFrames={songFrames} fps={FPS} width={W} height={H} />

      {/* 旧版四镜头预览（保留作对照，正片已不再使用） */}
      <Composition id="DirA-Chat" component={ChatWindow} durationInFrames={previewFrames} fps={FPS} width={W} height={H} />
      <Composition id="DirB-Term" component={TerminalTUI} durationInFrames={previewFrames} fps={FPS} width={W} height={H} />
      <Composition id="DirC-Dash" component={Dashboard} durationInFrames={previewFrames} fps={FPS} width={W} height={H} />
      <Composition id="DirD-Player" component={PlayerLyrics} durationInFrames={previewFrames} fps={FPS} width={W} height={H} />
    </>
  );
};
