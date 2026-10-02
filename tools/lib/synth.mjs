/* ============================================================================
 * synth.mjs —— 极简合成器：纯 Node 生成音频，零依赖
 * ----------------------------------------------------------------------------
 * 用途：造「版权完全干净」的测试音轨，用来验证流水线。
 *
 * 为什么不用现成库：这台机器上没有 Python，也不想为了造测试音频引入
 * 一个带原生扩展的音频库。自己算波形最省事，而且结果完全可复现。
 * ==========================================================================*/
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

export const SR = 44100;

/* ------------------------------------------------------------ 音高速查表 */
export const NOTE = {
  C2: 65.41, D2: 73.42, E2: 82.41, F2: 87.31, G2: 98.0, A2: 110.0, B2: 123.47,
  C3: 130.81, D3: 146.83, E3: 164.81, F3: 174.61, G3: 196.0, A3: 220.0, B3: 246.94,
  C4: 261.63, D4: 293.66, E4: 329.63, F4: 349.23, G4: 392.0, A4: 440.0, B4: 493.88,
  C5: 523.25, D5: 587.33, E5: 659.25, F5: 698.46, G5: 783.99, A5: 880.0,
  C6: 1046.5,
};

/* -------------------------------------------------------------- 立体声轨 */
export class Track {
  constructor(seconds, opts = {}) {
    this.sr = opts.sr || SR;
    this.n = Math.ceil(seconds * this.sr);
    this.L = new Float32Array(this.n);
    this.R = new Float32Array(this.n);
    this.seed = (opts.seed ?? 20260930) >>> 0;
  }

  /** 固定种子的伪随机，保证每次生成的噪声完全一样 */
  rnd() {
    this.seed = (this.seed * 1664525 + 1013904223) >>> 0;
    return (this.seed / 4294967296) * 2 - 1;
  }

  mix(i, l, r) {
    if (i < 0 || i >= this.n) return;
    this.L[i] += l;
    this.R[i] += r;
  }

  /* ------------------------------------------------------------ 鼓组音色 */

  /** 底鼓：正弦 + 频率包络（140Hz 迅速滑到 45Hz） */
  kick(t0, gain = 1) {
    const i0 = Math.round(t0 * this.sr);
    const len = Math.round(0.42 * this.sr);
    for (let i = 0; i < len; i++) {
      const tt = i / this.sr;
      const env = Math.exp(-tt * 11);
      const ph = 2 * Math.PI * (45 * tt + (95 / 32) * (1 - Math.exp(-tt * 32)));
      const s = Math.sin(ph) * env * gain;
      this.mix(i0 + i, s, s);
    }
  }

  /** 军鼓：噪声 + 一点音高 */
  snare(t0, gain = 1, hz = 185) {
    const i0 = Math.round(t0 * this.sr);
    const len = Math.round(0.24 * this.sr);
    for (let i = 0; i < len; i++) {
      const tt = i / this.sr;
      const env = Math.exp(-tt * 26);
      const tone = Math.sin(2 * Math.PI * hz * tt) * 0.5;
      const s = (this.rnd() * 0.8 + tone) * env * gain * 0.7;
      this.mix(i0 + i, s, s);
    }
  }

  /** 踩镲：高通噪声（用相邻样本差近似） */
  hat(t0, gain = 1, open = false) {
    const i0 = Math.round(t0 * this.sr);
    const len = Math.round((open ? 0.18 : 0.05) * this.sr);
    let prev = 0;
    for (let i = 0; i < len; i++) {
      const tt = i / this.sr;
      const env = Math.exp(-tt * (open ? 20 : 70));
      const n = this.rnd();
      const hp = n - prev;
      prev = n;
      const s = hp * env * gain * 0.36;
      this.mix(i0 + i, s * 0.88, s); // 轻微偏右
    }
  }

  /** 擦音：长噪声，收尾用 */
  crash(t0, gain = 1) {
    const i0 = Math.round(t0 * this.sr);
    const len = Math.round(1.6 * this.sr);
    let prev = 0;
    for (let i = 0; i < len; i++) {
      const tt = i / this.sr;
      const env = Math.exp(-tt * 2.4);
      const n = this.rnd();
      const hp = n - prev;
      prev = n;
      const s = hp * env * gain * 0.3;
      this.mix(i0 + i, s, s * 0.85);
    }
  }

  /* -------------------------------------------------------------- 音高类 */
  /**
   * kind: 'bass' | 'lead' | 'pad'
   */
  note(t0, dur, freq, gain = 1, kind = 'lead') {
    const i0 = Math.round(t0 * this.sr);
    const len = Math.round((dur + 0.3) * this.sr);
    let lp = 0;
    for (let i = 0; i < len; i++) {
      const tt = i / this.sr;
      let env;
      if (tt < dur) env = Math.min(1, tt / 0.012) * Math.exp(-tt * 2.6);
      else env = Math.exp(-tt * 2.6) * Math.exp(-(tt - dur) * 45);

      const ph = 2 * Math.PI * freq * tt;
      let s;
      if (kind === 'bass') {
        const saw = 2 * ((freq * tt) % 1) - 1;
        const raw = saw * 0.45 + Math.sin(ph) * 0.75;
        lp += (raw - lp) * 0.1;
        s = lp * env * gain;
      } else if (kind === 'lead') {
        s = (Math.sin(ph) * 0.6 + Math.sin(ph * 2) * 0.22 + Math.sin(ph * 3) * 0.1) * env * gain;
      } else {
        const a = Math.min(1, tt / 0.4);
        s =
          ((Math.sin(ph) + Math.sin(ph * 1.004) * 0.7 + Math.sin(ph * 0.996) * 0.7) / 2.4) *
          a *
          Math.exp(-tt * 0.85) *
          gain;
      }
      this.mix(i0 + i, s * 0.95, s);
    }
  }

  /* ---------------------------------------------------------------- 输出 */

  /** 归一化 + 软削波，避免削顶失真 */
  normalize(target = 0.92) {
    let peak = 0;
    for (let i = 0; i < this.n; i++) {
      const a = Math.abs(this.L[i]);
      const b = Math.abs(this.R[i]);
      if (a > peak) peak = a;
      if (b > peak) peak = b;
    }
    const g = peak > 0 ? target / peak : 1;
    for (let i = 0; i < this.n; i++) {
      this.L[i] = Math.tanh(this.L[i] * g * 1.05);
      this.R[i] = Math.tanh(this.R[i] * g * 1.05);
    }
  }

  get duration() {
    return this.n / this.sr;
  }

  writeWav(file) {
    fs.mkdirSync(path.dirname(file), { recursive: true });
    const n = this.n;
    const buf = Buffer.alloc(44 + n * 4);
    buf.write('RIFF', 0, 'ascii');
    buf.writeUInt32LE(36 + n * 4, 4);
    buf.write('WAVE', 8, 'ascii');
    buf.write('fmt ', 12, 'ascii');
    buf.writeUInt32LE(16, 16);
    buf.writeUInt16LE(1, 20); // PCM
    buf.writeUInt16LE(2, 22); // 立体声
    buf.writeUInt32LE(this.sr, 24);
    buf.writeUInt32LE(this.sr * 4, 28);
    buf.writeUInt16LE(4, 32);
    buf.writeUInt16LE(16, 34);
    buf.write('data', 36, 'ascii');
    buf.writeUInt32LE(n * 4, 40);
    let o = 44;
    for (let i = 0; i < n; i++) {
      buf.writeInt16LE(Math.round(Math.max(-1, Math.min(1, this.L[i])) * 32767), o);
      o += 2;
      buf.writeInt16LE(Math.round(Math.max(-1, Math.min(1, this.R[i])) * 32767), o);
      o += 2;
    }
    fs.writeFileSync(file, buf);
    return buf.length;
  }
}

/* --------------------------------------------------------------- 工具函数 */

/** 在 node_modules/@remotion 下找自带的 ffmpeg */
export function findFfmpeg(projDir) {
  const base = path.join(projDir, 'node_modules', '@remotion');
  if (!fs.existsSync(base)) return null;
  for (const d of fs.readdirSync(base)) {
    if (!d.startsWith('compositor')) continue;
    const p = path.join(base, d, 'ffmpeg.exe');
    if (fs.existsSync(p)) return p;
  }
  return null;
}

/** 用自带的 ffmpeg 把 WAV 转成 MP3 —— 用来测试真实歌曲的 mp3 解码路径 */
export function encodeMp3(ffmpeg, wavFile, mp3File, kbps = 192) {
  if (!ffmpeg) throw new Error('找不到自带的 ffmpeg');
  execFileSync(
    ffmpeg,
    ['-y', '-hide_banner', '-loglevel', 'error', '-i', wavFile, '-c:a', 'libmp3lame', '-b:a', `${kbps}k`, mp3File],
    { stdio: ['ignore', 'inherit', 'inherit'] }
  );
  return fs.statSync(mp3File).size;
}
