// KopiGuard: fotos, vídeos cortos e imágenes para las cámaras en directo. Solo la ventana de Minecraft:
// nunca la pantalla entera ni el sonido. Se usa una ventana oculta del launcher que mira esa ventana
// (desktopCapturer + getUserMedia) y la dibuja en un lienzo (fotos) o la graba (MediaRecorder, WebM).
// Si algo falla (sin permiso en macOS, Wayland, el juego no tiene ventana…), devuelve null y ya está.
const log = require('./logger');

const electron = () => require('electron'); // solo dentro de Electron (las pruebas no lo cargan)
let win = null, ready = null, source = null, sourceAt = 0, recording = null;

// El script de la ventana oculta
const PAGE = `
window.K = {
  async open(id) {
    if (K.s && K.id === id && K.s.active) return true;
    K.close(); K.id = id;
    K.s = await navigator.mediaDevices.getUserMedia({ audio: false, video: { mandatory: { chromeMediaSource: 'desktop', chromeMediaSourceId: id, maxWidth: 1280, maxHeight: 720, maxFrameRate: 20 } } });
    K.v = document.createElement('video'); K.v.muted = true; K.v.srcObject = K.s;
    await K.v.play();
    for (let i = 0; i < 20 && !K.v.videoWidth; i++) await new Promise(r => setTimeout(r, 50));
    return true;
  },
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
  close() { if (K.s) K.s.getTracks().forEach(t => t.stop()); K.s = null; K.v = null; K.id = null; }
};
true;`;

function supported() {
  if (process.platform === 'linux' && /wayland/i.test(process.env.XDG_SESSION_TYPE || '')) return false; // pediría permiso cada vez
  if (process.platform === 'darwin') {
    try { const st = electron().systemPreferences.getMediaAccessStatus('screen'); if (st === 'denied' || st === 'restricted') return false; } catch { /* nada */ }
  }
  return true;
}

// La ventana de Minecraft (por su título: «Minecraft 1.21.1», «Minecraft* 1.21.1 - Multijugador…»)
async function findSource() {
  if (source && Date.now() - sourceAt < 30e3) return source;
  const list = await electron().desktopCapturer.getSources({ types: ['window'], thumbnailSize: { width: 0, height: 0 }, fetchWindowIcons: false });
  const mc = list.filter(s => /^minecraft\*?(\s|$)/i.test(String(s.name).trim()) && !/launcher/i.test(s.name));
  source = mc.length ? mc[0].id : null; sourceAt = Date.now();
  return source;
}

async function page() {
  if (win && !win.isDestroyed() && ready) return ready;
  const { BrowserWindow, session } = electron();
  const ses = session.fromPartition('kopi-capture');
  ses.setPermissionRequestHandler((wc, perm, cb) => cb(perm === 'media'));
  ses.setPermissionCheckHandler((wc, perm) => perm === 'media');
  win = new BrowserWindow({ show: false, width: 320, height: 200, skipTaskbar: true, webPreferences: { partition: 'kopi-capture', backgroundThrottling: false, contextIsolation: true, nodeIntegration: false, sandbox: true } });
  ready = win.loadURL('data:text/html,<meta charset="utf-8"><title>Kopi</title>').then(() => win.webContents.executeJavaScript(PAGE));
  win.on('closed', () => { win = null; ready = null; });
  return ready;
}

let opening = null; // la foto y el vídeo piden la ventana a la vez: una sola apertura
function open() {
  if (opening) return opening;
  opening = (async () => {
    if (!supported()) return false;
    const id = await findSource();
    if (!id) return false;
    await page();
    try { return await win.webContents.executeJavaScript(`K.open(${JSON.stringify(id)})`); }
    catch (e) { source = null; throw e; }
  })().finally(() => { opening = null; });
  return opening;
}

const quiet = (what) => (e) => { log.warn(`[KopiGuard] ${what}:`, e && e.message); return null; };

// Foto de la detección (JPEG, hasta 1280 px). null si no se ve el juego.
async function shot() {
  try {
    if (!(await open())) return null;
    const b64 = await win.webContents.executeJavaScript('K.frame(1280, 0.82)');
    return b64 ? Buffer.from(b64, 'base64') : null;
  } catch (e) { return quiet('captura')(e); }
}

// Imagen para las cámaras: pequeña para la cuadrícula, más nítida si alguien mira en grande.
// '' = ventana minimizada; null = no se puede capturar.
async function frame(hd) {
  try {
    if (!(await open())) return null;
    return await win.webContents.executeJavaScript(hd ? 'K.frame(1280, 0.68)' : 'K.frame(480, 0.55)');
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

module.exports = { shot, frame, video, close, destroy };
