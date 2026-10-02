/* ============================================================================
 * audio.mjs —— 音频分析的共用基础件
 * ----------------------------------------------------------------------------
 * 从 auto-beats.mjs 里抽出来，供「节拍检测」和「结构分析」共用。
 * 抽出来的原因：两套工具如果各写一份 DSP，早晚会出现结果不一致，
 * 那时候排查成本远高于抽库的成本。
 *
 * 依赖：只用 Remotion 自带的 ffmpeg 做解码，其余全是纯 JS。
 * ==========================================================================*/
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

/* ------------------------------------------------------------------ 参数 */
export const SR = 22050;          // 分析采样率
export const FRAME = 1024;        // 分析窗
export const HOP = 256;           // 步进
export const ENV_RATE = SR / HOP; // 每秒多少个分析帧 ≈ 86.13

/* 分帧带来的时间偏置（很重要的一个坑） ------------------------------------
 * 第 i 帧的能量来自样本区间 [i·HOP, i·HOP+FRAME)。
 * 一个瞬态进入这个窗口时，起音强度峰值出现在 i ≈ T/HOP − FRAME/HOP + 1，
 * 所以「把帧号直接当时间」会**系统性偏早** (FRAME−HOP)/SR ≈ 34.8 毫秒。
 * 换算时必须把这段补回来，否则全片所有卡点都会早半帧到一帧。 */
export const OFFSET_SEC = (FRAME - HOP) / SR;
export const toSec = (frame) => frame / ENV_RATE + OFFSET_SEC;
export const toFrame = (sec) => (sec - OFFSET_SEC) * ENV_RATE;

/* -------------------------------------------------------------- ffmpeg */
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

/** 解码成指定采样率的单声道 16 位 PCM WAV（不依赖系统 ffmpeg） */
export function decodeToWav(ffmpeg, src, dst, sr = SR) {
  execFileSync(
    ffmpeg,
    ['-y', '-hide_banner', '-loglevel', 'error', '-i', src, '-vn', '-ac', '1', '-ar', String(sr), '-c:a', 'pcm_s16le', dst],
    { stdio: ['ignore', 'inherit', 'inherit'] }
  );
}

/* ------------------------------------------------------------------ WAV */
export function readWavMono(file) {
  const buf = fs.readFileSync(file);
  if (buf.toString('ascii', 0, 4) !== 'RIFF') throw new Error('不是合法的 WAV');
  let pos = 12;
  let fmt = null;
  let data = null;
  while (pos + 8 <= buf.length) {
    const id = buf.toString('ascii', pos, pos + 4);
    const size = buf.readUInt32LE(pos + 4);
    const body = pos + 8;
    if (id === 'fmt ') {
      fmt = {
        format: buf.readUInt16LE(body),
        channels: buf.readUInt16LE(body + 2),
        sampleRate: buf.readUInt32LE(body + 4),
        bits: buf.readUInt16LE(body + 14),
      };
    } else if (id === 'data') {
      data = buf.subarray(body, Math.min(body + size, buf.length));
    }
    pos = body + size + (size % 2);
  }
  if (!fmt || !data) throw new Error('WAV 缺少 fmt 或 data 块');
  if (fmt.bits !== 16) throw new Error('只支持 16 位 PCM，收到 ' + fmt.bits + ' 位');

  const n = Math.floor(data.length / 2 / fmt.channels);
  const out = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    let s = 0;
    for (let c = 0; c < fmt.channels; c++) s += data.readInt16LE((i * fmt.channels + c) * 2);
    out[i] = s / fmt.channels / 32768;
  }
  return { samples: out, sampleRate: fmt.sampleRate };
}

/* ------------------------------------------------------------ 滤波器 */
export function lowpass(x, cutoff, sr) {
  const a = 1 - Math.exp((-2 * Math.PI * cutoff) / sr);
  const y = new Float32Array(x.length);
  let prev = 0;
  for (let i = 0; i < x.length; i++) {
    prev += a * (x[i] - prev);
    y[i] = prev;
  }
  return y;
}

/** 带通 = 低通(hi) − 低通(lo) */
export function band(x, lo, hi, sr) {
  const hiS = lowpass(x, hi, sr);
  const loS = lowpass(x, lo, sr);
  const y = new Float32Array(x.length);
  for (let i = 0; i < x.length; i++) y[i] = hiS[i] - loS[i];
  return y;
}

export function frameEnergy(sig, frame = FRAME, hop = HOP) {
  const n = Math.max(1, Math.floor((sig.length - frame) / hop) + 1);
  const out = new Float32Array(n);
  for (let f = 0; f < n; f++) {
    const s0 = f * hop;
    let acc = 0;
    for (let i = 0; i < frame; i++) {
      const v = sig[s0 + i] || 0;
      acc += v * v;
    }
    out[f] = Math.sqrt(acc / frame);
  }
  return out;
}

/** 正向增量 + 对数压缩，再归一化到最大 1 */
export function novelty(energy) {
  const n = energy.length;
  const nov = new Float32Array(n);
  const logE = new Float32Array(n);
  for (let i = 0; i < n; i++) logE[i] = Math.log(1 + 40 * energy[i]);
  for (let i = 1; i < n; i++) nov[i] = Math.max(0, logE[i] - logE[i - 1]);
  let max = 0;
  for (let i = 0; i < n; i++) if (nov[i] > max) max = nov[i];
  if (max > 0) for (let i = 0; i < n; i++) nov[i] /= max;
  return nov;
}

/* -------------------------------------------------- 一次算好全部特征 */
/**
 * 返回各频段能量与起音强度。analyze 与 auto-beats 都用这一份，
 * 保证两个工具看到的「音频」完全一致。
 */
export function computeFeatures(samples, sampleRate) {
  const low = frameEnergy(lowpass(samples, 150, sampleRate));
  const mid = frameEnergy(band(samples, 200, 1200, sampleRate));
  const high = frameEnergy(band(samples, 3000, 8000, sampleRate));
  const full = frameEnergy(samples);

  const nLow = novelty(low);
  const nMid = novelty(mid);
  const nHigh = novelty(high);
  const len = Math.min(nLow.length, nMid.length, nHigh.length);
  const nov = new Float32Array(len);
  for (let i = 0; i < len; i++) nov[i] = nLow[i] + nMid[i] + nHigh[i] * 0.8;

  return { low, mid, high, full, nov, duration: samples.length / sampleRate };
}

/* -------------------------------------------------------- 周期与相位 */
export function estimatePeriod(nov) {
  const minLag = Math.max(2, Math.round(ENV_RATE * (60 / 200)));
  const maxLag = Math.round(ENV_RATE * (60 / 60));
  let best = { lag: minLag, score: -Infinity };
  const scores = [];
  for (let lag = minLag; lag <= maxLag; lag++) {
    let s = 0;
    let c = 0;
    for (let i = 0; i + lag < nov.length; i++) {
      s += nov[i] * nov[i + lag];
      c++;
    }
    const v = c ? s / c : 0;
    scores.push({ lag, score: v });
    if (v > best.score) best = { lag, score: v };
  }
  // 抛物线插值：自相关曲线平坦时修正量会发散，必须用相对阈值 + 范围检查夹住
  const i = scores.findIndex((s) => s.lag === best.lag);
  let lag = best.lag;
  if (i > 0 && i < scores.length - 1) {
    const y0 = scores[i - 1].score;
    const y1 = scores[i].score;
    const y2 = scores[i + 1].score;
    const denom = y0 - 2 * y1 + y2;
    const scale = Math.max(Math.abs(y0), Math.abs(y1), Math.abs(y2), 1e-9);
    if (Math.abs(denom) > scale * 1e-2) {
      const refined = best.lag + (0.5 * (y0 - y2)) / denom;
      if (isFinite(refined) && refined >= minLag - 1 && refined <= maxLag + 1) lag = refined;
    }
  }
  return lag;
}

export function estimatePhase(nov, period) {
  let best = { phase: 0, score: -Infinity };
  const steps = Math.min(2000, Math.max(40, Math.round(period * 8)));
  for (let s = 0; s < steps; s++) {
    const phase = (s / steps) * period;
    let acc = 0;
    for (let t = phase; t < nov.length; t += period) {
      const idx = Math.round(t);
      acc += Math.max(nov[idx - 1] || 0, nov[idx] || 0, nov[idx + 1] || 0);
    }
    if (acc > best.score) best = { phase, score: acc };
  }
  return best.phase;
}

export function buildGrid(p, ph, dur) {
  const out = [];
  const k0 = Math.ceil((0 - ph) / p);
  for (let k = k0; ; k++) {
    const frame = ph + k * p;
    if (frame / ENV_RATE > dur) break;
    out.push({ k, frame });
  }
  return out;
}

export function refineGrid(nov, p, ph, dur) {
  const tol = Math.max(1, Math.round(p * 0.18));
  const grid = buildGrid(p, ph, dur);
  const pts = [];
  for (const g of grid) {
    const idx = Math.round(g.frame);
    let bestI = idx;
    let bestV = -1;
    for (let d = -tol; d <= tol; d++) {
      const i = idx + d;
      if (i < 1 || i >= nov.length - 1) continue;
      if (nov[i] > bestV) {
        bestV = nov[i];
        bestI = i;
      }
    }
    pts.push({ k: g.k, frame: bestI, w: Math.max(0.0001, bestV) });
  }
  if (pts.length < 8) return { period: p, phase: ph };
  let sw = 0, sk = 0, st = 0, skk = 0, skt = 0;
  for (const q of pts) {
    sw += q.w;
    sk += q.w * q.k;
    st += q.w * q.frame;
    skk += q.w * q.k * q.k;
    skt += q.w * q.k * q.frame;
  }
  const den = sw * skk - sk * sk;
  if (Math.abs(den) < 1e-9) return { period: p, phase: ph };
  const np = (sw * skt - sk * st) / den;
  const nph = (st - np * sk) / sw;
  if (!isFinite(np) || np <= 2 || np > ENV_RATE * 2) return { period: p, phase: ph };
  return { period: np, phase: nph };
}

/* ------------------------------------------------------ 完整节拍检测 */
/**
 * @param features computeFeatures 的返回值
 * @param opts.bpmHint 指定 BPM（跳过自相关）
 * @param opts.lowEnergy 低频能量数组，用来判断哪一拍是强拍
 * @returns { bpm, period, phase, beats, downbeats, phrases, confident }
 */
export function detectBeats(features, opts = {}) {
  const { nov, duration, low, full } = features;
  const bpmOf = (p) => (60 * ENV_RATE) / p;
  let period = opts.bpmHint ? ENV_RATE * (60 / opts.bpmHint) : estimatePeriod(nov);

  // 八度修正：自相关常把周期识别成 2 倍或 1/2 倍。
  // ⚠ 方向：周期减半 → BPM 加倍。写反会死循环（这个坑踩过）。
  let corrected = false;
  if (!opts.bpmHint) {
    const before = period;
    let gA = 0;
    while (bpmOf(period) < 80 && gA++ < 8) period /= 2;
    let gB = 0;
    while (bpmOf(period) > 160 && gB++ < 8) period *= 2;
    corrected = Math.abs(before - period) > 1e-6;
  }
  if (!isFinite(period) || period < 2) period = ENV_RATE * 0.5;

  const phase0 = estimatePhase(nov, period);
  let ref = { period, phase: phase0 };
  for (let it = 0; it < 3; it++) ref = refineGrid(nov, ref.period, ref.phase, duration);
  const finalPeriod = ref.period;
  const finalPhase = ref.phase;
  const bpm = bpmOf(finalPeriod);

  const k0 = Math.ceil((0 - finalPhase) / finalPeriod);
  const beats = [];
  for (let k = k0; ; k++) {
    const sec = toSec(finalPhase + k * finalPeriod);
    if (sec > duration) break;
    beats.push(Number(Math.max(0, sec).toFixed(4)));
    if (beats.length > 100000) break; // 防御：绝不让它无限增长
  }

  // 开头那一拍常常检测不到（novelty[0] 按定义为 0）
  const headE = Math.max(full[1] || 0, full[2] || 0, full[3] || 0, full[4] || 0);
  const sortedFull = Array.from(full).sort((a, b) => a - b);
  const medFull = sortedFull[Math.floor(sortedFull.length / 2)] || 0;
  if (beats.length && beats[0] > (finalPeriod / ENV_RATE) * 0.35 && headE > medFull * 0.5) {
    beats.unshift(0);
  }

  // 强拍相位：用低频能量决定哪一拍是「1」
  let bestOff = 0;
  let bestE = -Infinity;
  for (let off = 0; off < 4; off++) {
    let acc = 0;
    let c = 0;
    for (let k = off; k < beats.length; k += 4) {
      acc += low[Math.round(toFrame(beats[k]))] || 0;
      c++;
    }
    const v = c ? acc / c : 0;
    if (v > bestE) {
      bestE = v;
      bestOff = off;
    }
  }
  const downbeats = beats.filter((_, k) => (k - bestOff) % 4 === 0);
  const phrases = downbeats.filter((_, i) => i % 2 === 0);

  return {
    bpm: Number(bpm.toFixed(4)),
    period: finalPeriod,
    phase: finalPhase,
    beats,
    downbeats,
    phrases,
    octaveCorrected: corrected,
  };
}
