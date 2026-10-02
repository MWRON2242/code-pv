# code-pv · 代码渲染音乐 PV

一支用代码逐帧渲染的音乐 PV。**核心原则：每一帧都是歌曲时间 `t` 的函数** —— 没有剪辑软件，没有手工关键帧。

> 完整的思路、路线图和决策记录见 [PLAN.md](PLAN.md)。
> 知识点笔记在 `knowledge/代码渲染PV/`（也同步进了 Obsidian）。

## ⚠️ 本仓库不包含什么（重要）

这是一支**非商业同人作品**，仓库里只有**代码、文档、以及由代码生成的画面**。

| 不包含 | 原因 |
|---|---|
| 歌曲音频（`*.flac` / `*.wav`） | 版权归 Yorushika / n-buna / Universal Music Japan |
| 歌词原文与中文翻译 | 翻译本身也是演绎作品，公开使用需原歌词授权 |
| 渲染成片（`out/`） | 构建产物，且含上述音频 |

**想跑通全片**，你需要自备音源，然后：

```bash
# 1. 把音源放到两处（input/ 是源数据，public/audio/ 是渲染时读得到的位置）
#    input/song.flac  →  public/audio/song.flac

# 2. 重新打点（打点器可人工微调：tools/tapper/index.html）
node tools/build.mjs beats input/song.flac

# 3. 重新对齐歌词时间轴（input/lyric-timing.json 里的时间会变）
#    聊天剧本与状态机触发点都只引用「第几句」，所以剧本一行都不用改

# 4. 出片
node tools/build.mjs all
```

> 画面本身不依赖任何外部素材：22 个状态全部由代码绘制，
> 没有图片、没有位图、没有第三方美术资源。

## 快速开始

```bash
# 1. 造一段无版权测试音轨（25.5 秒 / 120 BPM，含标准答案）
node tools/make-test-track.mjs

# 2. 实时预览（可拖时间轴，像剪辑软件）
npm run dev

# 3. 自检 + 出片（交付版 + 无损母版）
node tools/build.mjs check
node tools/build.mjs all
```

正式歌曲到位后的流程（**文本驱动，不用手写 JSON**）：

```bash
# 1. 自动节拍检测 → input/<歌名>.beats.json
node tools/build.mjs beats input/你的歌.mp3

# 2. 编辑三个纯文本文件（格式见文件头部说明）
#    input/timeline.txt   分镜：哪段用哪个镜头、转场秒数
#    input/script.txt     聊天台词：you / her + 文本
#    input/lyrics.txt     歌词：一行一句，可用 @时间 钉死

# 3. 文本 → JSON，自动排到节拍网格上
node tools/fit-script.mjs timeline
node tools/fit-script.mjs script --every 1
node tools/fit-script.mjs lyrics --every 1

# 4. 自检 + 出片
node tools/build.mjs check
node tools/build.mjs all        # check → delivery → verify → master
```

### 出片后的两道验收

```bash
node tools/build.mjs verify   # 音画同步：证明渲染管线没有挪动音频
node tools/build.mjs sheet    # 联系表：抽 36 帧生成 out/sheet.html，一眼审全片
```

`verify` 的巧妙之处：它不直接拿「成片音轨的拍点」和打点表比——那样会把**节拍检测器自身
约 10 毫秒的固有偏差**算到渲染头上。它做一次对照实验，比较「经过渲染」和「不经过渲染」
两次检测的差，检测器的偏差被抵消掉，剩下的才是渲染真正引入的偏移。

**不要只看自己设计的那个时刻。** 事故往往发生在段落交界、转场那一秒、画面边缘、时长末尾——
所以 `sheet` 是均匀抽样，而不是挑关键时刻。

`fit-script.mjs` 会把每一行排到**强拍**上（可用 `--anchor beat|phrase` 换），
默认区间自动取自分镜里对应的镜头 —— 台词排进 `chat` 段、歌词排进 `player` 段，
避免排到镜头还没出现的时间上。锚点不够会告警，用 `--every` 调小即可。

## 全片

`MainFilm` 按 `input/timeline.json` 组装：**D 播放器歌词页引入 → 黑场过渡 → A 聊天窗口主体**。

```powershell
$env:TEMP = 'D:\deepseek工作区\.tmp-render'; $env:TMP = $env:TEMP
node node_modules\@remotion\cli\remotion-cli.js render MainFilm out/main-film.mp4
```

### 换歌要改的东西（代码零改动）

| 改什么 | 文件 |
|---|---|
| 拍点 / 时长 / 段落 | `input/song.beats.json`（**文件名固定**，由 `build.mjs beats` 生成，换歌不用改代码） |
| 聊天台词 | `input/script.txt` → `input/script.json` |
| 歌词 | `input/lyrics.txt` → `input/lyrics.json` |
| 分镜（哪段用哪个镜头、转场秒数） | `input/timeline.txt` → `input/timeline.json` |
| 段落视觉（主色、世界面板推近、格子疏密、随拍抖动） | `input/staging.json` |
| 音频 | `input/` 与 `public/audio/` 各放一份相同文件 |

### 想先彩排一遍？

不用等真歌——造一条真实长度的无版权音轨，把全流程走一遍：

```bash
node tools/make-rehearsal-track.mjs   # 3 分 30 秒 / 128 BPM / 8 段落，同时出 WAV + MP3
```

它会顺带验证 MP3 解码路径、长片渲染耗时，以及段落编排在真实长度下的观感。

**`staging.json` 是让长片不单调的关键**：段落边界来自打点表的 `sections`，每段一套视觉参数，
改数值就能改画面。注意 `camera`（全画面缩放）**上限建议不超过 1.02** —— 缩放会按比例裁切四周，
过大会切掉界面上的文字，详见 Obsidian 笔记《14 段落编排 - 让长片不单调》。

**转场注意**：两个镜头版式差异大时（本片就是），务必走**黑场过渡**（`to` 等于下段 `from`，各自 fade），
不要用交叉溶解 —— 会变成文字压文字的重影。

| | 交付版 | 无损母版 | 轻量母版 |
|---|---|---|---|
| 编码 | h264 + AAC | **ProRes 4444** + PCM | h264 CRF 1 + AAC |
| 色度 | yuv420p | yuv422p12le | yuv420p |
| 体积（25 秒） | 13.5 MB | 252 MB | ≈ 15 MB |
| 用途 | 发布 | 底片，二次处理从它出 | 日常归档、快速二次剪辑 |

> ⚠️ **一首 4 分钟的歌，ProRes 母版约 2.4 GB。** 磁盘吃紧就用 `master-lite`。

```powershell
node tools/build.mjs master       # ProRes 4444 无损母版
node tools/build.mjs master-lite  # h264 CRF 1 轻量母版
node tools/build.mjs 4k           # 从交付版 lanczos 放大到 3840×2160
```

## 视觉方向预览

四个方向**共用同一套取数逻辑**（`src/lib/beats.ts`），只有样式不同 —— 这就是「打点表是地基、换风格不用换时间轴」的验证。

| Composition | 方向 | 成片 |
|---|---|---|
| `DirA-Chat` | 聊天窗口 | `out/DirA-Chat.mp4` |
| `DirB-Term` | 全屏终端 TUI | `out/DirB-Term.mp4` |
| `DirC-Dash` | 仪表盘 / 数据可视化 | `out/DirC-Dash.mp4` |
| `DirD-Player` | 播放器歌词页 | `out/DirD-Player.mp4` |

渲染（**务必先重定向 TEMP**，否则 ffmpeg 写系统临时目录会被拒）：

```powershell
$env:TEMP = 'D:\deepseek工作区\.tmp-render'; $env:TMP = $env:TEMP
$cli = 'node_modules\@remotion\cli\remotion-cli.js'
foreach ($c in 'DirA-Chat','DirB-Term','DirC-Dash','DirD-Player') {
  node $cli render $c "out/$c.mp4" --log=error
}
```

## 目录

| 路径 | 内容 |
|---|---|
| `src/Root.tsx` | 「影片登记处」：每个 `Composition` 是一条可渲染的成片 |
| `src/MainFilm.tsx` | **全片组装**：按分镜表把镜头排起来并做转场 |
| `src/lib/song.ts` | **全片唯一数据入口** —— 换歌只改这里引用的 JSON |
| `src/lib/staging.ts` | **段落编排**：按段落给主色、推近、抖动等参数 |
| `src/lib/beats.ts` | 共用的取数逻辑（拍点、衰减、确定性随机） |
| `src/BeatTest.tsx` | 里程碑 1：把打点表画出来，验证「数据 → 画面」链路 |
| `src/ChatWindow.tsx` · `src/TerminalTUI.tsx` · `src/Dashboard.tsx` · `src/PlayerLyrics.tsx` | 四个方向预览 |
| `input/` | 源数据：打点表、台词、歌词、分镜、段落编排 |
| `public/audio/` | Remotion 渲染时能读到的音频（`staticFile()` 只认这里） |
| `tools/tapper/` | 打点器，零依赖，双击 `index.html` 即用 |
| `tools/make-test-track.mjs` | 测试音轨生成器（纯 Node 写 WAV，无依赖） |
| `tools/auto-beats.mjs` | **自动节拍检测**，生成打点表初稿（实测中位偏差 2.2 毫秒） |
| `tools/compare-beats.mjs` | 对比两份打点表，报告偏差分布与系统偏移 |
| `tools/build.mjs` | **出片流水线**：check / beats / delivery / verify / sheet / master / master-lite / 4k / all |
| `tools/verify-sync.mjs` | **音画同步验收**：用对照实验证明渲染没挪动音频（实测偏移 +0.20 毫秒） |
| `tools/contact-sheet.mjs` | **联系表**：抽 30~40 帧生成 HTML，一眼审全片 |
| `tools/fit-script.mjs` | **文本 → JSON**：把台词/歌词/分镜按节拍网格排布 |
| `tools/make-rehearsal-track.mjs` | 造真实长度的无版权彩排音轨（3.5 分钟，含 MP3） |
| `tools/lib/synth.mjs` | 极简合成器：纯 Node 生成音频，零依赖 |
| `knowledge/代码渲染PV/` | Obsidian 笔记源 |
| `out/` | 成片与母版 |

## 注意

- **音频要放两份**：`input/` 是源数据，`public/audio/` 是渲染时读取的位置。换歌记得同步。
- **npm 缓存已重定向**到 `../.npm-cache`（工作区沙箱不允许写用户目录）。若手动跑 npm 报 EPERM，加上：
  ```powershell
  $env:npm_config_cache = 'D:\deepseek工作区\.npm-cache'
  ```
- 素材授权逐项登记在 [ASSETS.md](ASSETS.md)，出片前核对。
