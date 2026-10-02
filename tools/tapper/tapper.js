/* ============================================================================
 * 打点器 (Tapper) —— 为代码渲染 PV 准备「打点表」
 * ----------------------------------------------------------------------------
 * 零依赖、纯本地：音频不会上传到任何地方，全部在你的浏览器里处理。
 * 用法：双击同目录的 index.html
 *
 * 输出的 markers.json 是全片的「地基」：之后所有画面切换、字幕、特效
 * 都从这张表长出来。它是数据，跟用什么工具渲染无关。
 * ==========================================================================*/
'use strict';

const $ = (id) => document.getElementById(id);

/* 四类打点。数字键 1/2/3/4 直接在当前播放位置落一个点。 */
const TYPES = [
  { key: '1', id: 'cut',    name: '切换', color: '#ff5f56', hint: '镜头切换 / 转场' },
  { key: '2', id: 'accent', name: '重音', color: '#ffbd2e', hint: '音乐重音 / 鼓点' },
  { key: '3', id: 'lyric',  name: '唱词', color: '#27c93f', hint: '唱词起音' },
  { key: '4', id: 'note',   name: '标记', color: '#4aa3ff', hint: '随手记一下' },
];
const TYPE_BY_ID = Object.fromEntries(TYPES.map((t) => [t.id, t]));

const audio = new Audio();
audio.preload = 'auto';

const state = {
  song: '',
  duration: 0,
  fps: 24,
  markers: [],      // { id, t, type, label }
  selId: null,
  zoom: 1,
  viewStart: 0,
  follow: true,
  type: 'cut',
  dirty: true,
};

let nextId = 1;
let peaks = null;        // 波形峰值（每个 bucket 的绝对值最大）
let bucket = 256;        // 每个峰值覆盖多少采样点
let peakRate = 48000;    // 解码得到的采样率
let canvas = null;
let ctx = null;
let W = 0;               // 画布宽（设备像素）
let H = 0;               // 画布高（设备像素）
let dpr = 1;

/* ------------------------------------------------------------------ 小工具 */

function fmt(t) {
  if (!isFinite(t) || t < 0) t = 0;
  const m = Math.floor(t / 60);
  const s = Math.floor(t % 60);
  const ms = Math.floor((t - Math.floor(t)) * 1000);
  return String(m).padStart(2, '0') + ':' + String(s).padStart(2, '0') + '.' + String(ms).padStart(3, '0');
}
const frameOf = (t) => Math.round(t * state.fps);
const snap = (t) => Math.round(t * state.fps) / state.fps;
const viewDur = () => (state.zoom > 0 ? state.duration / state.zoom : state.duration);

function clampView() {
  const vd = viewDur();
  const maxStart = Math.max(0, state.duration - vd);
  if (state.viewStart > maxStart) state.viewStart = maxStart;
  if (state.viewStart < 0) state.viewStart = 0;
}

function timeToX(t) {
  const vd = viewDur();
  if (!vd) return 0;
  return ((t - state.viewStart) / vd) * W;
}
function xToTime(x) {
  const vd = viewDur();
  return state.viewStart + (x / Math.max(1, W)) * vd;
}

function toast(msg) {
  const el = $('toast');
  el.textContent = msg;
  el.classList.add('show');
  clearTimeout(toast._t);
  toast._t = setTimeout(() => el.classList.remove('show'), 1800);
}

/* -------------------------------------------------------------- 载入音频 */

async function loadAudio(file) {
  state.song = file.name;
  $('songName').textContent = file.name;
  $('stage').classList.add('loaded');

  const url = URL.createObjectURL(file);
  audio.src = url;
  audio.load();

  await new Promise((resolve, reject) => {
    audio.addEventListener('loadedmetadata', resolve, { once: true });
    audio.addEventListener('error', () => reject(new Error('这个音频浏览器解不开')), { once: true });
  });

  // 解码一份用来画波形，同时拿到精确时长
  let buf = null;
  try {
    const ab = await file.arrayBuffer();
    const AC = window.AudioContext || window.webkitAudioContext;
    const ac = new AC();
    buf = await ac.decodeAudioData(ab);
    ac.close();
  } catch (e) {
    buf = null;
  }

  if (buf) {
    peakRate = buf.sampleRate;
    state.duration = buf.duration;
    const ch = buf.getChannelData(0);
    const n = Math.max(1, Math.floor(ch.length / bucket));
    peaks = new Float32Array(n);
    for (let i = 0; i < n; i++) {
      let m = 0;
      const s0 = i * bucket;
      for (let j = 0; j < bucket; j++) {
        const v = ch[s0 + j];
        const a = v < 0 ? -v : v;
        if (a > m) m = a;
      }
      peaks[i] = m;
    }
  } else {
    peaks = null;
    state.duration = isFinite(audio.duration) ? audio.duration : 0;
  }

  state.zoom = 1;
  state.viewStart = 0;
  state.markers = [];
  state.selId = null;
  nextId = 1;
  restore();
  resize();
  renderList();
  updateHud();
}

/* ------------------------------------------------------------------ 波形 */

function resize() {
  if (!canvas) return;
  const r = canvas.getBoundingClientRect();
  dpr = window.devicePixelRatio || 1;
  canvas.width = Math.max(1, Math.round(r.width * dpr));
  canvas.height = Math.max(1, Math.round(r.height * dpr));
  W = canvas.width;
  H = canvas.height;
  if (ctx) ctx.setTransform(1, 0, 0, 1, 0, 0);
}

function pickTickStep(vd) {
  const cands = [1 / state.fps, 0.1, 0.2, 0.25, 0.5, 1, 2, 5, 10, 15, 30, 60, 120];
  for (const c of cands) if (vd / c <= 14) return c;
  return 300;
}

function draw() {
  if (!ctx || !W) return;
  const mid = H / 2;

  ctx.fillStyle = '#0d1117';
  ctx.fillRect(0, 0, W, H);

  // 中部基准线
  ctx.strokeStyle = '#1f2937';
  ctx.lineWidth = dpr;
  ctx.beginPath();
  ctx.moveTo(0, mid);
  ctx.lineTo(W, mid);
  ctx.stroke();

  const vd = viewDur();
  const hasSong = state.duration > 0;

  if (hasSong) {
    // ---- 波形 ----
    ctx.fillStyle = '#2b6cb0';
    const perPx = (vd / Math.max(1, W)) * peakRate;   // 每像素覆盖多少采样
    if (peaks) {
      for (let x = 0; x < W; x++) {
        const s0 = (state.viewStart + (x / W) * vd) * peakRate;
        let i0 = Math.floor(s0 / bucket);
        let i1 = Math.ceil((s0 + perPx) / bucket);
        if (i1 <= i0) i1 = i0 + 1;
        if (i1 < 0 || i0 >= peaks.length) continue;
        if (i0 < 0) i0 = 0;
        if (i1 > peaks.length) i1 = peaks.length;
        let m = 0;
        for (let i = i0; i < i1; i++) if (peaks[i] > m) m = peaks[i];
        const h = Math.max(1 * dpr, m * mid * 0.92);
        ctx.fillRect(x, mid - h, 1, h * 2);
      }
    } else {
      ctx.fillStyle = '#243b55';
      ctx.fillRect(0, mid - 6 * dpr, W, 12 * dpr);
    }

    // ---- 时间刻度尺 ----
    const step = pickTickStep(vd);
    ctx.font = `${11 * dpr}px ui-monospace, Consolas, monospace`;
    ctx.textBaseline = 'top';
    const t0 = Math.ceil(state.viewStart / step) * step;
    for (let t = t0; t <= state.viewStart + vd; t += step) {
      const x = timeToX(t);
      ctx.strokeStyle = '#30363d';
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, H);
      ctx.stroke();
      ctx.fillStyle = '#7d8590';
      ctx.fillText(fmt(t).slice(0, 8), x + 3 * dpr, 3 * dpr);
    }

    // ---- 已打的点 ----
    state.markers.forEach((mk, i) => {
      const x = timeToX(mk.t);
      if (x < -20 || x > W + 20) return;
      const ty = TYPE_BY_ID[mk.type] || TYPES[0];
      const isSel = mk.id === state.selId;
      ctx.strokeStyle = ty.color;
      ctx.globalAlpha = isSel ? 1 : 0.72;
      ctx.lineWidth = (isSel ? 3 : 1.6) * dpr;
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, H);
      ctx.stroke();
      ctx.globalAlpha = 1;

      ctx.fillStyle = ty.color;
      ctx.font = `${11 * dpr}px ui-monospace, Consolas, monospace`;
      ctx.fillText(String(i + 1), x + 3 * dpr, H - 15 * dpr);
    });

    // ---- 播放头 ----
    const px = timeToX(audio.currentTime);
    if (px >= -2 && px <= W + 2) {
      ctx.strokeStyle = '#f0f6fc';
      ctx.lineWidth = 1.6 * dpr;
      ctx.beginPath();
      ctx.moveTo(px, 0);
      ctx.lineTo(px, H);
      ctx.stroke();
      ctx.fillStyle = '#f0f6fc';
      ctx.beginPath();
      ctx.moveTo(px - 5 * dpr, 0);
      ctx.lineTo(px + 5 * dpr, 0);
      ctx.lineTo(px, 8 * dpr);
      ctx.closePath();
      ctx.fill();
    }
  } else {
    ctx.fillStyle = '#484f58';
    ctx.font = `${14 * dpr}px system-ui, "Microsoft YaHei", sans-serif`;
    ctx.textAlign = 'center';
    ctx.fillText('把歌曲文件拖进来，或点上面的「选择歌曲」', W / 2, H / 2 - 8 * dpr);
    ctx.textAlign = 'left';
  }

  // 高亮当前的类型
  const ty = TYPE_BY_ID[state.type];
  $('curType').textContent = ty ? ty.name : '';
  $('curType').style.color = ty ? ty.color : '#7d8590';
}

/* ------------------------------------------------------------------ HUD */

function updateHud() {
  $('curTime').textContent = fmt(audio.currentTime);
  $('curFrame').textContent = '第 ' + frameOf(audio.currentTime) + ' 帧';
  const total = state.duration || 0;
  $('totalTime').textContent = total ? fmt(total) : '--:--.---';
  $('counts').textContent = TYPES.map((t) => `${t.name} ${state.markers.filter((m) => m.type === t.id).length}`).join('  ·  ');
}

/* ------------------------------------------------------------------ 打点 */

function tap(type) {
  if (!state.duration) return;
  const t = snap(audio.currentTime);
  const mk = { id: nextId++, t, type: type || state.type, label: '' };
  state.markers.push(mk);
  state.markers.sort((a, b) => a.t - b.t);
  state.selId = mk.id;
  state.dirty = true;
  renderList();
  updateHud();
  save();
  beep(mk.type);
}

/* 落点时给一个很轻的反馈音，方便"盲打" */
let beepCtx = null;
function beep(typeId) {
  try {
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!beepCtx) beepCtx = new AC();
    if (beepCtx.state === 'suspended') beepCtx.resume();
    const o = beepCtx.createOscillator();
    const g = beepCtx.createGain();
    const f = { cut: 880, accent: 1320, lyric: 660, note: 440 }[typeId] || 880;
    o.frequency.value = f;
    g.gain.value = 0.05;
    o.connect(g).connect(beepCtx.destination);
    o.start();
    g.gain.exponentialRampToValueAtTime(0.0001, beepCtx.currentTime + 0.06);
    o.stop(beepCtx.currentTime + 0.07);
  } catch (e) { /* 没声音也无所谓 */ }
}

function undo() {
  if (!state.markers.length) return;
  // 撤销"最后打的"那个（按 id 最大）
  let max = state.markers[0];
  for (const m of state.markers) if (m.id > max.id) max = m;
  state.markers = state.markers.filter((m) => m.id !== max.id);
  if (state.selId === max.id) state.selId = null;
  state.dirty = true;
  renderList();
  updateHud();
  save();
  toast('撤销了一个点');
}

function delSelected() {
  if (state.selId == null) return;
  state.markers = state.markers.filter((m) => m.id !== state.selId);
  state.selId = null;
  state.dirty = true;
  renderList();
  updateHud();
  save();
}

function nudge(frames) {
  const mk = state.markers.find((m) => m.id === state.selId);
  if (!mk) {
    audio.currentTime = Math.max(0, Math.min(state.duration, audio.currentTime + frames / state.fps));
    return;
  }
  mk.t = Math.max(0, snap(mk.t + frames / state.fps));
  state.markers.sort((a, b) => a.t - b.t);
  state.dirty = true;
  renderList();
  save();
}

/* ------------------------------------------------------------------ 列表 */

function renderList() {
  const box = $('list');
  box.innerHTML = '';
  if (!state.markers.length) {
    box.innerHTML = '<div class="empty">还没有点。播放歌曲，听到位置就按 1 / 2 / 3 / 4。</div>';
    return;
  }
  state.markers.forEach((mk, i) => {
    const ty = TYPE_BY_ID[mk.type] || TYPES[0];
    const row = document.createElement('div');
    row.className = 'row' + (mk.id === state.selId ? ' sel' : '');

    const idx = document.createElement('span');
    idx.className = 'idx';
    idx.textContent = i + 1;

    const badge = document.createElement('button');
    badge.className = 'badge';
    badge.textContent = ty.name;
    badge.style.background = ty.color;
    badge.title = '点一下换类型';
    badge.onclick = (ev) => {
      ev.stopPropagation();
      const k = TYPES.findIndex((t) => t.id === mk.type);
      mk.type = TYPES[(k + 1) % TYPES.length].id;
      renderList();
      updateHud();
      save();
    };

    const tm = document.createElement('span');
    tm.className = 'tm';
    tm.textContent = fmt(mk.t) + '  ·  ' + frameOf(mk.t);

    const label = document.createElement('input');
    label.className = 'label';
    label.placeholder = '备注…';
    label.value = mk.label || '';
    label.oninput = () => { mk.label = label.value; save(); };
    label.onclick = (ev) => ev.stopPropagation();

    row.append(idx, badge, tm, label);
    row.onclick = () => {
      state.selId = mk.id;
      audio.currentTime = mk.t;
      renderList();
      draw();
    };
    box.appendChild(row);
  });
}

/* ---------------------------------------------------------- 存 / 取 / 导出 */

function storageKey() {
  return 'tapper:' + state.song + ':' + state.duration.toFixed(2);
}
function save() {
  try {
    localStorage.setItem(storageKey(), JSON.stringify({
      fps: state.fps,
      markers: state.markers.map((m) => ({ t: m.t, type: m.type, label: m.label })),
    }));
  } catch (e) { /* file:// 下可能不可用，忽略 */ }
}
function restore() {
  try {
    const raw = localStorage.getItem(storageKey());
    if (!raw) return;
    const d = JSON.parse(raw);
    if (d.fps) { state.fps = d.fps; $('fps').value = String(d.fps); }
    if (Array.isArray(d.markers)) {
      state.markers = d.markers
        .filter((m) => typeof m.t === 'number')
        .map((m) => ({ id: nextId++, t: m.t, type: m.type || 'cut', label: m.label || '' }))
        .sort((a, b) => a.t - b.t);
      toast('已恢复上次的 ' + state.markers.length + ' 个点');
    }
  } catch (e) { /* 忽略 */ }
}

function buildJson() {
  const counts = {};
  TYPES.forEach((t) => { counts[t.id] = 0; });
  state.markers.forEach((m) => { counts[m.type] = (counts[m.type] || 0) + 1; });
  return {
    song: state.song,
    duration: Number(state.duration.toFixed(4)),
    fps: state.fps,
    exportedAt: new Date().toISOString(),
    counts,
    markers: state.markers.map((m, i) => ({
      i: i + 1,
      t: Number(m.t.toFixed(4)),
      frame: frameOf(m.t),
      type: m.type,
      label: m.label || '',
    })),
  };
}

function download(name, text) {
  const blob = new Blob([text], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 3000);
}

function exportJson() {
  if (!state.markers.length) { toast('还没有点可导出'); return; }
  const base = (state.song || 'song').replace(/\.[^.]+$/, '');
  download(base + '.markers.json', JSON.stringify(buildJson(), null, 2));
  toast('已导出 ' + state.markers.length + ' 个点');
}

function importJson(file) {
  const fr = new FileReader();
  fr.onload = () => {
    try {
      const d = JSON.parse(String(fr.result));
      if (!Array.isArray(d.markers)) throw new Error('格式不对');
      state.fps = d.fps || state.fps;
      $('fps').value = String(state.fps);
      state.markers = d.markers
        .filter((m) => typeof m.t === 'number')
        .map((m) => ({ id: nextId++, t: m.t, type: m.type || 'cut', label: m.label || '' }))
        .sort((a, b) => a.t - b.t);
      state.dirty = true;
      renderList();
      updateHud();
      save();
      toast('导入 ' + state.markers.length + ' 个点');
    } catch (e) {
      toast('导入失败：' + e.message);
    }
  };
  fr.readAsText(file);
}

/* ------------------------------------------------------------------ 播放 */

function togglePlay() {
  if (!state.duration) return;
  if (audio.paused) audio.play().catch(() => toast('浏览器不让自动播放，再点一下'));
  else audio.pause();
}

/* ------------------------------------------------------------------ 循环 */

let lastPlaying = null;
function loop() {
  // 播放头位置变了就重画
  draw();

  if (state.follow && state.zoom > 1 && !audio.paused) {
    const vd = viewDur();
    const t = audio.currentTime;
    const margin = vd * 0.18;
    if (t < state.viewStart + margin) state.viewStart = Math.max(0, t - margin);
    else if (t > state.viewStart + vd - margin) state.viewStart = Math.min(state.duration - vd, t - vd + margin);
    clampView();
  }

  updateHud();

  if (lastPlaying !== !audio.paused) {
    lastPlaying = !audio.paused;
    $('playBtn').textContent = lastPlaying ? '⏸ 暂停' : '▶ 播放';
  }
  requestAnimationFrame(loop);
}

/* ------------------------------------------------------------------ 事件 */

function bind() {
  canvas = $('wave');
  ctx = canvas.getContext('2d');

  // 歌曲输入
  $('file').addEventListener('change', (e) => {
    const f = e.target.files && e.target.files[0];
    if (f) loadAudio(f).catch((err) => toast(err.message));
  });
  // 拖拽
  const drop = $('stage');
  ['dragenter', 'dragover'].forEach((ev) =>
    drop.addEventListener(ev, (e) => { e.preventDefault(); drop.classList.add('over'); }));
  ['dragleave', 'drop'].forEach((ev) =>
    drop.addEventListener(ev, (e) => { e.preventDefault(); drop.classList.remove('over'); }));
  drop.addEventListener('drop', (e) => {
    const f = e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files[0];
    if (!f) return;
    if (/\.json$/i.test(f.name)) importJson(f);
    else loadAudio(f).catch((err) => toast(err.message));
  });

  // 标注导入导出
  $('exportBtn').onclick = exportJson;
  $('importFile').addEventListener('change', (e) => {
    const f = e.target.files && e.target.files[0];
    if (f) importJson(f);
  });

  $('playBtn').onclick = togglePlay;

  // 类型按钮（点一下切换"当前笔"）
  const tf = $('typeBar');
  TYPES.forEach((t) => {
    const b = document.createElement('button');
    b.className = 'typeBtn';
    b.innerHTML = `<kbd>${t.key}</kbd> ${t.name}`;
    b.style.borderColor = t.color;
    b.onclick = () => { state.type = t.id; draw(); };
    tf.appendChild(b);
  });

  // 缩放
  $('zoom').addEventListener('input', (e) => {
    const center = audio.currentTime;
    state.zoom = Number(e.target.value);
    state.viewStart = Math.max(0, Math.min(Math.max(0, state.duration - viewDur()), center - viewDur() / 2));
    clampView();
  });
  $('follow').addEventListener('change', (e) => { state.follow = e.target.checked; });
  $('fps').addEventListener('change', (e) => {
    state.fps = Number(e.target.value);
    state.markers = state.markers.map((m) => ({ ...m, t: Math.round(m.t * state.fps) / state.fps }));
    renderList();
    save();
  });

  // 点波形定位
  canvas.addEventListener('mousedown', (e) => {
    if (!state.duration) return;
    const r = canvas.getBoundingClientRect();
    const x = (e.clientX - r.left) * dpr;
    audio.currentTime = Math.max(0, Math.min(state.duration, snap(xToTime(x))));
    draw();
  });

  // 快捷键
  document.addEventListener('keydown', (e) => {
    const tag = (e.target.tagName || '').toLowerCase();
    if (tag === 'input' && e.key !== 'Escape') return;   // 在备注框里打字时不抢键

    const k = e.key;
    if (k === ' ') { e.preventDefault(); togglePlay(); return; }
    const ty = TYPES.find((t) => t.key === k);
    if (ty) { e.preventDefault(); state.type = ty.id; tap(ty.id); return; }

    if (k === 'Backspace' || k === 'Delete') { e.preventDefault(); delSelected(); return; }
    if ((e.ctrlKey || e.metaKey) && (k === 'z' || k === 'Z')) { e.preventDefault(); undo(); return; }
    if (k === 'ArrowLeft') { e.preventDefault(); nudge(e.shiftKey ? -state.fps : -1); return; }
    if (k === 'ArrowRight') { e.preventDefault(); nudge(e.shiftKey ? state.fps : 1); return; }
    if (k === 'Home') { e.preventDefault(); audio.currentTime = 0; return; }
    if (k === '+' || k === '=') {
      state.zoom = Math.min(40, state.zoom * 1.5);
      $('zoom').value = String(state.zoom);
      clampView(); return;
    }
    if (k === '-' || k === '_') {
      state.zoom = Math.max(1, state.zoom / 1.5);
      $('zoom').value = String(state.zoom);
      clampView(); return;
    }
  });

  window.addEventListener('resize', () => { resize(); draw(); });
  audio.addEventListener('seeked', () => draw());
}

window.addEventListener('DOMContentLoaded', () => {
  bind();
  resize();
  draw();
  loop();
});
