// KopiGuard: fotos, vídeos cortos e imágenes para las cámaras en directo. Solo la ventana de Minecraft:
// nunca la pantalla entera ni el sonido. Se usa una ventana oculta del launcher que mira esa ventana
// (desktopCapturer + getUserMedia) y la dibuja en un lienzo (fotos) o la graba (MediaRecorder, WebM).
// Si algo falla (sin permiso en macOS, Wayland, el juego no tiene ventana…), devuelve null y ya está.
const path = require('path');
const { execFile } = require('child_process');
const log = require('./logger');

const electron = () => require('electron'); // solo dentro de Electron (las pruebas no lo cargan)
let win = null, ready = null, source = null, sourceAt = 0, recording = null;
let target = { pid: 0, hint: '' }, hwnd = null; // el proceso del juego (para encontrar su ventana)

// El script de la ventana oculta
const PAGE = `
window.K = {
  pcs: {},
  // hd: para el vídeo en directo (720p a 30 imágenes por segundo); si no, 720p a 20 (fotos y vídeos cortos)
  async open(id, hd) {
    if (K.s && K.id === id && K.s.active && (K.hd || !hd)) return true;
    const old = K.s;
    K.id = id; K.hd = !!hd;
    const max = hd ? { maxWidth: 1280, maxHeight: 720, maxFrameRate: 30 } : { maxWidth: 1280, maxHeight: 720, maxFrameRate: 20 };
    K.s = await navigator.mediaDevices.getUserMedia({ audio: false, video: { mandatory: { chromeMediaSource: 'desktop', chromeMediaSourceId: id, ...max } } });
    const tr = K.s.getVideoTracks()[0];
    try { tr.contentHint = 'motion'; } catch (e) { /* nada */ }
    for (const pc of Object.values(K.pcs)) for (const x of pc.getSenders()) x.replaceTrack(tr).catch(() => {}); // los que ya miran siguen viendo
    if (old) old.getTracks().forEach(t => t.stop());
    K.v = document.createElement('video'); K.v.muted = true; K.v.srcObject = K.s;
    await K.v.play();
    for (let i = 0; i < 20 && !K.v.videoWidth; i++) await new Promise(r => setTimeout(r, 50));
    return true;
  },
  // Vídeo en directo (WebRTC): contesta a la propuesta del navegador del staff y le manda el juego
  async rtc(id, offer, ice) {
    const tr = K.s && K.s.getVideoTracks()[0];
    if (!tr) return null;
    K.rtcClose(id);
    const pc = new RTCPeerConnection({ iceServers: ice || [] });
    K.pcs[id] = pc;
    pc.onconnectionstatechange = () => {
      const st = pc.connectionState;
      if (st === 'failed' || st === 'closed') K.rtcClose(id);
      if (st === 'disconnected') setTimeout(() => { if (pc.connectionState !== 'connected') K.rtcClose(id); }, 8000);
    };
    // que empiece ya con buena calidad (si no, arranca muy bajo y tarda en subir)
    const HINT = 'x-google-start-bitrate=2500;x-google-min-bitrate=1200;x-google-max-bitrate=5000';
    let src = String(offer);
    // Mac: H.264 primero (lo hace el chip de vídeo del Mac, mucho más fluido). Se envía con el primero de la propuesta.
    if (/Mac/.test(navigator.userAgent)) {
      const h264 = (src.match(/^a=rtpmap:(\\d+) H264\\/90000/gm) || []).map(l => l.split(':')[1].split(' ')[0]);
      if (h264.length) src = src.replace(/^(m=video \\S+ \\S+) ([\\d ]+)$/m, (l, head, pts) => head + ' ' + [...h264, ...pts.trim().split(' ').filter(p => !h264.includes(p))].join(' '));
    }
    const sdp = src.replace(/^(a=fmtp:\\d+ .*)$/gm, (l) => /x-google-/.test(l) ? l : l + ';' + HINT)
      .replace(/^(a=rtpmap:(\\d+) (VP8|VP9|H264|AV1)\\/90000)$/gm, (l, a, pt) => new RegExp('^a=fmtp:' + pt + ' ', 'm').test(src) ? l : l + '\\r\\na=fmtp:' + pt + ' ' + HINT);
    await pc.setRemoteDescription({ type: 'offer', sdp });
    const tx = pc.getTransceivers().find(t => t.receiver && t.receiver.track && t.receiver.track.kind === 'video');
    if (!tx) { K.rtcClose(id); return null; }
    tx.direction = 'sendonly';
    await tx.sender.replaceTrack(tr);
    await pc.setLocalDescription(await pc.createAnswer());
    await new Promise((ok) => {
      if (pc.iceGatheringState === 'complete') return ok();
      const to = setTimeout(ok, 2500);
      pc.addEventListener('icegatheringstatechange', () => { if (pc.iceGatheringState === 'complete') { clearTimeout(to); ok(); } });
    });
    try { // nítido: la imagen no se hace pequeña; si la conexión no da, baja antes las imágenes por segundo
      const p = tx.sender.getParameters();
      if (!p.encodings || !p.encodings.length) p.encodings = [{}];
      p.encodings[0].maxBitrate = 5000000; p.encodings[0].maxFramerate = 30; p.encodings[0].scaleResolutionDownBy = 1;
      p.degradationPreference = 'maintain-resolution';
      await tx.sender.setParameters(p);
    } catch (e) { /* nada */ }
    return pc.localDescription.sdp;
  },
  rtcClose(id) { const pc = K.pcs[id]; if (pc) { try { pc.close(); } catch (e) { /* nada */ } delete K.pcs[id]; } },
  // cuántos están viendo el vídeo ahora (o conectándose)
  live() { return Object.values(K.pcs).filter(p => p.connectionState === 'connected' || p.connectionState === 'connecting' || p.connectionState === 'new').length; },
  frame(w, q) {
    const v = K.v;
    if (!v || !v.videoWidth) return null;
    const s = Math.min(1, w / v.videoWidth), c = document.createElement('canvas');
    c.width = Math.round(v.videoWidth * s); c.height = Math.round(v.videoHeight * s);
    const g = c.getContext('2d'); g.drawImage(v, 0, 0, c.width, c.height);
    // ventana minimizada: todo negro
    const px = g.getImageData(0, 0, c.width, c.height).data; let sum = 0, n = 0;
    for (let i = 0; i < px.length; i += 4 * 97) { sum += px[i] + px[i + 1] + px[i + 2]; n++; }
    if (sum / n < 6) return '';
    return c.toDataURL('image/jpeg', q).split(',')[1];
  },
  record(ms) {
    return new Promise((res) => {
      if (!K.s) return res(null);
      const mime = ['video/webm;codecs=vp9', 'video/webm;codecs=vp8', 'video/webm'].find(m => MediaRecorder.isTypeSupported(m));
      const r = new MediaRecorder(K.s, { mimeType: mime, videoBitsPerSecond: 1200000 });
      const parts = [];
      r.ondataavailable = (e) => { if (e.data && e.data.size) parts.push(e.data); };
      r.onstop = async () => {
        if (!parts.length) return res(null);
        const buf = new Uint8Array(await new Blob(parts, { type: 'video/webm' }).arrayBuffer());
        let s = ''; for (let i = 0; i < buf.length; i += 32768) s += String.fromCharCode.apply(null, buf.subarray(i, i + 32768));
        res(btoa(s));
      };
      const stop = () => { try { if (r.state !== 'inactive') r.stop(); } catch { res(null); } };
      r.start(1000);
      setTimeout(stop, ms);
      const tr = K.s.getVideoTracks()[0]; if (tr) tr.addEventListener('ended', stop);
    });
  },
  close() { Object.keys(K.pcs).forEach(K.rtcClose); if (K.s) K.s.getTracks().forEach(t => t.stop()); K.s = null; K.v = null; K.id = null; K.hd = false; }
};
true;`;

function supported() {
  if (process.platform === 'linux' && /wayland/i.test(process.env.XDG_SESSION_TYPE || '')) return false; // pediría permiso cada vez
  if (process.platform === 'darwin') {
    try { const st = electron().systemPreferences.getMediaAccessStatus('screen'); if (st === 'denied' || st === 'restricted') return false; } catch { /* nada */ }
  }
  return true;
}

// Qué partida se vigila: { pid del proceso de Java, nombre de la instancia }
function setTarget(t) { target = { pid: Number(t && t.pid) || 0, hint: String((t && t.hint) || '') }; source = null; hwnd = null; }

// Windows: la ventana principal del proceso del juego (su número, igual que en los id «window:<número>:0»)
function windowOfPid(pid) {
  return new Promise((resolve) => {
    if (process.platform !== 'win32' || !pid) return resolve(null);
    execFile('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', `(Get-Process -Id ${pid}).MainWindowHandle`], { windowsHide: true, timeout: 10000 },
      (err, out) => { const n = Number(String(out || '').trim()); resolve(!err && n > 0 ? String(n) : null); });
  });
}

// La ventana de Minecraft: por el proceso del juego (Windows) o por el título
// («Minecraft* 1.21.1», «Minecraft* 1.21.1 - Multijugador…», o uno que lleve el nombre de la instancia)
async function sources(size) {
  return electron().desktopCapturer.getSources({ types: ['window'], thumbnailSize: size || { width: 0, height: 0 }, fetchWindowIcons: false });
}
function pick(list) {
  if (hwnd) { const s = list.find(x => String(x.id).startsWith(`window:${hwnd}:`)); if (s) return s; }
  const name = (s) => String(s.name || '').trim();
  const other = /launcher|kopi client|chrome|edge|firefox|opera|brave|safari|discord|youtube|twitch|obs/i; // nunca el navegador, el chat o el launcher
  const ok = list.filter(s => !other.test(name(s)));
  return ok.find(s => /^minecraft\*?(\s+\d|$)/i.test(name(s)))  // «Minecraft* 1.21.1 - …»
    || (target.hint.length > 2 ? ok.find(s => name(s).toLowerCase().includes(target.hint.toLowerCase())) : null)
    || ok.find(s => /minecraft/i.test(name(s)))
    || null;
}
async function findSource() {
  if (source && Date.now() - sourceAt < 30e3) return source;
  if (!hwnd) hwnd = await windowOfPid(target.pid);
  const s = pick(await sources());
  source = s ? s.id : null; sourceAt = Date.now();
  if (!source) log.warn('[KopiGuard] No se encuentra la ventana del juego');
  return source;
}

// Plan B (si no se puede abrir el vídeo de la ventana): la miniatura que da el sistema. Solo fotos, sin vídeo.
async function thumb(w, q) {
  const s = pick(await sources({ width: w, height: Math.round(w * 9 / 16) }));
  if (!s || !s.thumbnail || s.thumbnail.isEmpty()) return null;
  const { width, height } = s.thumbnail.getSize();
  if (!width || !height) return null;
  const bmp = s.thumbnail.toBitmap(); let sum = 0, n = 0;
  for (let i = 0; i < bmp.length; i += 4 * 97) { sum += bmp[i] + bmp[i + 1] + bmp[i + 2]; n++; }
  if (n && sum / n < 6) return ''; // negro: minimizado
  return s.thumbnail.toJPEG(Math.round(q * 100));
}

async function page() {
  if (win && !win.isDestroyed() && ready) return ready;
  const { BrowserWindow, session } = electron();
  const ses = session.fromPartition('kopi-capture');
  ses.setPermissionRequestHandler((wc, perm, cb) => cb(perm === 'media'));
  ses.setPermissionCheckHandler((wc, perm) => perm === 'media');
  win = new BrowserWindow({ show: false, width: 320, height: 200, skipTaskbar: true, webPreferences: { partition: 'kopi-capture', backgroundThrottling: false, contextIsolation: true, nodeIntegration: false, sandbox: true } });
  // Una página del propio launcher (file://): la captura solo funciona en páginas seguras (una data: no lo es)
  ready = win.loadFile(path.join(__dirname, '..', 'renderer', 'capture.html')).then(() => win.webContents.executeJavaScript(PAGE));
  win.on('closed', () => { win = null; ready = null; });
  return ready;
}

let opening = null; // la foto y el vídeo piden la ventana a la vez: una sola apertura
function open(hd = false) {
  if (opening) return opening.then((ok) => (ok && hd ? open(true) : ok));
  opening = (async () => {
    if (!supported()) return false;
    const id = await findSource();
    if (!id) return false;
    await page();
    try { return await win.webContents.executeJavaScript(`K.open(${JSON.stringify(id)}, ${hd ? 'true' : 'false'})`); }
    catch (e) { source = null; throw e; }
  })().finally(() => { opening = null; });
  return opening;
}

// Vídeo en directo para el panel: contesta a la propuesta (offer) → la respuesta (answer) o null si no se puede
async function rtc(id, offer, ice) {
  try {
    if (!(await open(true))) return null;
    return await win.webContents.executeJavaScript(`K.rtc(${JSON.stringify(String(id))}, ${JSON.stringify(String(offer))}, ${JSON.stringify(ice || [])})`);
  } catch (e) { return quiet('vídeo en directo')(e); }
}
// ¿Cuántos miran el vídeo ahora? (mientras alguien lo vea, sobran las imágenes seguidas)
async function streaming() {
  if (!win || win.isDestroyed() || !ready) return 0;
  try { return Number(await win.webContents.executeJavaScript('K.live()')) || 0; } catch { return 0; }
}

let lastWarn = '';
const quiet = (what) => (e) => { const msg = `[KopiGuard] ${what}: ${e && e.message}`; if (msg !== lastWarn) log.warn(msg); lastWarn = msg; return null; }; // sin repetir el mismo aviso

// Foto de la detección (JPEG, hasta 1280 px). null si no se ve el juego.
async function shot() {
  try {
    if (await open().catch(quiet('abrir la ventana'))) {
      const b64 = await win.webContents.executeJavaScript('K.frame(1280, 0.82)');
      if (b64 !== null) return b64 ? Buffer.from(b64, 'base64') : null;
    }
    if (!supported()) return null;
    const j = await thumb(1280, 0.82);
    return j || null;
  } catch (e) { return quiet('captura')(e); }
}

// Imagen para las cámaras: pequeña para la cuadrícula, más nítida si alguien mira en grande.
// '' = ventana minimizada; null = no se puede capturar.
async function frame(hd) {
  try {
    if (await open().catch(quiet('abrir la ventana'))) {
      const b64 = await win.webContents.executeJavaScript(hd ? 'K.frame(1280, 0.68)' : 'K.frame(480, 0.55)');
      if (b64 !== null) return b64;
    }
    if (!supported()) return null;
    const j = await thumb(hd ? 1280 : 480, hd ? 0.68 : 0.55);
    return j === '' ? '' : j ? j.toString('base64') : null;
  } catch (e) { return quiet('cámara')(e); }
}

// Vídeo corto (WebM). Si ya se está grabando uno, se comparte (detecciones seguidas = mismo vídeo).
function video(ms = 10e3) {
  if (recording) return recording;
  recording = (async () => {
    try {
      if (!(await open())) return null;
      const b64 = await win.webContents.executeJavaScript(`K.record(${Math.round(ms)})`);
      return b64 ? Buffer.from(b64, 'base64') : null;
    } catch (e) { return quiet('vídeo')(e); }
    finally { setTimeout(() => { recording = null; }, 0); }
  })();
  return recording;
}

// Al acabar la partida: se suelta la ventana del juego
function close() {
  source = null;
  Promise.resolve(recording).catch(() => {}).finally(() => {
    if (win && !win.isDestroyed()) win.webContents.executeJavaScript('K.close()').catch(() => {});
  });
}

// Al cerrar el launcher
function destroy() { if (win && !win.isDestroyed()) win.destroy(); win = null; ready = null; }

module.exports = { shot, frame, video, rtc, streaming, close, destroy, setTarget, pick: (list) => pick(list), PAGE };
