// Prueba real del vídeo de las cámaras (WebRTC) dentro de Electron, con el código de verdad del launcher (capture.js)
// y la misma forma de conectar que el panel (cameras.js). Una ventana hace de juego (1080p en movimiento) y otra
// de navegador del staff. Pasa si llegan 20+ imágenes por segundo a 720p.
const path = require('path');
const { app, BrowserWindow } = require('electron');
const { PAGE } = require('../src/main/capture');

app.commandLine.appendSwitch('disable-renderer-backgrounding');
app.commandLine.appendSwitch('disable-background-timer-throttling');
const ICE = [{ urls: ['stun:stun.cloudflare.com:3478', 'stun:stun.l.google.com:19302'] }];
const win = () => new BrowserWindow({ show: false, width: 400, height: 300, webPreferences: { backgroundThrottling: false, contextIsolation: true, sandbox: true } });
const end = (ok, msg) => { console.log(`\n[prueba] ${ok ? 'BIEN' : 'MAL'}: ${msg}`); app.exit(ok ? 0 : 1); };

app.whenReady().then(async () => {
  setTimeout(() => end(false, 'tiempo agotado'), 90000);
  // «el juego»: la página de captura del launcher, con un vídeo de prueba en vez de la ventana de Minecraft
  const game = win();
  await game.loadFile(path.join(__dirname, '..', 'src', 'renderer', 'capture.html'));
  await game.webContents.executeJavaScript(PAGE);
  await game.webContents.executeJavaScript(`(() => {
    const c = document.createElement('canvas'); c.width = 1280; c.height = 720; const g = c.getContext('2d'); let f = 0;
    setInterval(() => { f++; g.fillStyle = 'hsl(' + (f * 3 % 360) + ',60%,35%)'; g.fillRect(0, 0, 1280, 720);
      for (let i = 0; i < 40; i++) { g.fillStyle = 'hsl(' + (i * 9) + ',80%,60%)'; g.fillRect((f * 7 + i * 97) % 1280, (i * 53 + f * 3) % 720, 120, 120); }
      g.fillStyle = '#fff'; g.font = 'bold 120px sans-serif'; g.fillText('KOPI ' + f, 100 + (f * 5) % 600, 380); }, 1000 / 60);
    K.s = c.captureStream(30); K.id = 'prueba'; K.hd = true; return true; })()`);

  // «el panel»: igual que cameras.js
  const viewer = win();
  await viewer.loadURL('data:text/html,<video autoplay muted playsinline></video>');
  const offer = await viewer.webContents.executeJavaScript(`(async () => {
    window.pc = new RTCPeerConnection({ iceServers: ${JSON.stringify(ICE)} });
    pc.addTransceiver('video', { direction: 'recvonly' });
    pc.ontrack = (e) => { const v = document.querySelector('video'); v.srcObject = e.streams[0] || new MediaStream([e.track]); };
    await pc.setLocalDescription(await pc.createOffer());
    await new Promise((ok) => { if (pc.iceGatheringState === 'complete') return ok(); const to = setTimeout(ok, 2500);
      pc.addEventListener('icegatheringstatechange', () => { if (pc.iceGatheringState === 'complete') { clearTimeout(to); ok(); } }); });
    return pc.localDescription.sdp; })()`);
  console.log('[prueba] propuesta del panel:', offer.length, 'bytes');

  console.log('[prueba] códecs del launcher:', await game.webContents.executeJavaScript("RTCRtpSender.getCapabilities('video').codecs.map(c => c.mimeType).filter((x, i, a) => a.indexOf(x) === i).join(' ')"), '·', await game.webContents.executeJavaScript('navigator.userAgent'));
  const answer = await game.webContents.executeJavaScript(`K.rtc('v1', ${JSON.stringify(offer)}, ${JSON.stringify(ICE)})`);
  console.log('[prueba] códec elegido en la respuesta:', (/^m=video \S+ \S+ (\d+)/m.exec(answer) || [])[1], (answer.match(/^a=rtpmap:\d+ [^\r\n]+/gm) || []).slice(0, 3).join(' | '));
  if (!answer) return end(false, 'el launcher no contestó');
  console.log('[prueba] respuesta del launcher:', answer.length, 'bytes');
  await viewer.webContents.executeJavaScript(`pc.setRemoteDescription({ type: 'answer', sdp: ${JSON.stringify(answer)} })`);

  // se deja calentar (la calidad sube en los primeros segundos) y se mide 5 s
  await new Promise(r => setTimeout(r, 9000));
  const samples = [];
  for (let i = 0; i < 5; i++) {
    await new Promise(r => setTimeout(r, 1000));
    samples.push(await viewer.webContents.executeJavaScript(`(async () => { const out = {}; (await pc.getStats()).forEach(x => {
      if (x.type === 'inbound-rtp' && x.kind === 'video') Object.assign(out, { fps: x.framesPerSecond || 0, w: x.frameWidth || 0, h: x.frameHeight || 0, bytes: x.bytesReceived, codecId: x.codecId, decoded: x.framesDecoded });
    }); (await pc.getStats()).forEach(x => { if (x.type === 'codec' && x.id === out.codecId) out.codec = x.mimeType;
    }); out.state = pc.connectionState; return out; })()`));
  }
  const live = await game.webContents.executeJavaScript('K.live()');
  samples.forEach((s, i) => console.log(`[prueba] seg ${i + 1}: ${s.state} ${s.w}x${s.h} ${Math.round(s.fps)} img/s, ${(s.bytes / 1e6).toFixed(1)} MB recibidos (${s.codec || '?'})`));
  const last = samples[samples.length - 1];
  const kbps = Math.round((last.bytes - samples[0].bytes) * 8 / 4 / 1000);
  console.log(`[prueba] ~${kbps} kbit/s · mirando: ${live}`);
  const avgFps = samples.reduce((a, s) => a + s.fps, 0) / samples.length;
  if (last.state !== 'connected') return end(false, 'no conectó (' + last.state + ')');
  if (avgFps < 20) return end(false, `pocas imágenes por segundo (${avgFps.toFixed(1)})`);
  if (last.h < 720) return end(false, `poca resolución (${last.h}p)`);
  // cerrar: el launcher suelta la conexión
  await game.webContents.executeJavaScript("K.rtcClose('v1')");
  if ((await game.webContents.executeJavaScript('K.live()')) !== 0) return end(false, 'no se cerró la conexión');
  end(true, `vídeo fluido: ${last.w}x${last.h} a ${avgFps.toFixed(1)} img/s`);
});
