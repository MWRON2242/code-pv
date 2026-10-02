/* ============================================================================
 * song.ts —— 全片唯一的「数据入口」
 * ----------------------------------------------------------------------------
 * 换歌时只需要动这几样（都在 input/ 和 public/audio/ 里，代码一行不改）：
 *   1. input/song.beats.json   → 打点表（拍点、时长、段落）
 *   2. input/script.json       → 聊天台词（由 script.txt 生成）
 *   3. input/lyrics.json       → 歌词（由 lyrics.txt 生成）
 *   4. input/timeline.json     → 分镜表（由 timeline.txt 生成）
 *   5. input/staging.json      → 段落视觉参数
 *   6. public/audio/<歌>        → 音频本体
 *
 * 注意打点表的文件名是**固定的 song.beats.json**：
 * 这样换歌不必改代码，只需让工具把新歌的打点表写成这个名字。
 * `node tools/build.mjs beats <音频>` 会自动做这一步。
 * ==========================================================================*/

import beatsJson from '../../input/song.beats.json';
import scriptJson from '../../input/script.json';
import lyricsJson from '../../input/lyrics.json';
import timelineJson from '../../input/timeline.json';

export type ChatMessage = { t: number; from: 'you' | 'her'; text: string };
export type LyricLine = { t: number; dur: number; text: string };
export type SceneSpec = {
  id: string;
  scene: string;
  from: number;
  to: number;
  fadeIn?: number;
  fadeOut?: number;
};

/* ---------------------------------------------------------- 打点表 / 歌曲 */

export const BEATS: number[] = beatsJson.beats as number[];
export const SONG_DURATION: number = beatsJson.duration as number;
export const BPM: number = beatsJson.bpm as number;
export const BARS: number = beatsJson.bars as number;
export const SECTIONS = beatsJson.sections as Array<{ t: number; name: string; note: string }>;

/* ---------------------------------------------------------------- 分镜表 */

export const AUDIO_SRC: string = timelineJson.audio as string;
export const FPS: number = timelineJson.fps as number;
export const SCENES = timelineJson.scenes as unknown as SceneSpec[];

/* -------------------------------------------------------------- 内容数据 */

export const CHAT_SCRIPT = scriptJson.messages as unknown as ChatMessage[];
export const LYRIC_LINES = lyricsJson.lines as unknown as LyricLine[];
