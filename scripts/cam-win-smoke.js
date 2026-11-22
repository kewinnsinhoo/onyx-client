// Prueba real en Windows: graba una ventana «Minecraft» con el código del launcher (capture.js), como hace KopiGuard
// con el juego, y manda el vídeo a un «panel». Mientras graba hace una captura de TODA la pantalla para ver si
// Windows pinta el borde amarillo alrededor de la ventana. Guarda: pantalla.png (lo que ve el jugador) y panel.png
// (lo que ve el staff).
const path = require('path');
const fs = require('fs');
const { execFile } = require('child_process');
const { app, BrowserWindow } = require('electron');
// lo mismo que src/main/main.js (sin esto, Windows pinta el borde amarillo)
if (process.platform === 'win32') app.commandLine.appendSwitch('disable-features', 'AllowWgcWindowCapturer,AllowWgcScreenCapturer');
const capture = require('../src/main/capture');

const ICE = [{ urls: ['stun:stun.cloudflare.com:3478'] }];
const OUT = process.env.OUT_DIR || process.cwd();
const end = (ok, msg) => { console.log(`\n[prueba] ${ok ? 'BIEN' : 'MAL'}: ${msg}`); setTimeout(() => app.exit(ok ? 0 : 1), 300); };
const sleep = (ms) => new Promise(r => setTimeout(r, ms));

function screenshot(file) {
  const ps = `Add-Type -AssemblyName System.Windows.Forms,System.Drawing; $b=[System.Windows.Forms.Screen]::PrimaryScreen.Bounds; $bmp=New-Object System.Drawing.Bitmap $b.Width,$b.Height; $g=[System.Drawing.Graphics]::FromImage($bmp); $g.CopyFromScreen($b.Location,[System.Drawing.Point]::Empty,$b.Size); $bmp.Save('${file.replace(/'/g, "''")}'); "$($b.Width)x$($b.Height)"`;
  return new Promise((ok) => execFile('powershell.exe', ['-NoProfile', '-Command', ps], { windowsHide: true }, (e, out, err) => ok(e ? 'error: ' + (err || e.message) : String(out).trim())));
}

app.whenReady().then(async () => {
  setTimeout(() => end(false, 'tiempo agotado'), 120000);
  // «el juego»: ventana visible con el título de Minecraft y mucho movimiento
  const game = new BrowserWindow({ show: true, x: 80, y: 60, width: 1280, height: 720, title: 'Minecraft* 1.21.1', backgroundColor: '#000', webPreferences: { backgroundThrottling: false } });
  await game.loadURL('data:text/html,' + encodeURIComponent(`<title>Minecraft* 1.21.1</title><body style="margin:0;overflow:hidden;background:#000"><canvas id=c></canvas><script>
    const c = document.getElementById('c'), g = c.getContext('2d'); c.width = innerWidth; c.height = innerHeight; let f = 0;
    (function draw() { f++; g.fillStyle = 'hsl(' + (f % 360) + ',55%,30%)'; g.fillRect(0, 0, c.width, c.height);
      for (let i = 0; i < 30; i++) { g.fillStyle = 'hsl(' + (i * 12) + ',80%,60%)'; g.fillRect((f * 6 + i * 91) % c.width, (i * 47 + f * 2) % c.height, 90, 90); }
      g.fillStyle = '#fff'; g.font = 'bold 90px sans-serif'; g.fillText('MINECRAFT ' + f, 60 + (f * 4) % 500, c.height / 2); requestAnimationFrame(draw); })();
  </script>`));
  game.setTitle('Minecraft* 1.21.1');
  await sleep(2500);

  // el launcher busca la ventana como con el juego de verdad
  capture.setTarget({ pid: 0, hint: 'Minecraft' });
  const viewer = new BrowserWindow({ show: false, webPreferences: { backgroundThrottling: false } });
  await viewer.loadURL('data:text/html,<video autoplay muted playsinline></video>');
  const offer = await viewer.webContents.executeJavaScript(`(async () => {
    window.pc = new RTCPeerConnection({ iceServers: ${JSON.stringify(ICE)} });
    pc.addTransceiver('video', { direction: 'recvonly' });
    pc.ontrack = (e) => { document.querySelector('video').srcObject = e.streams[0] || new MediaStream([e.track]); };
    await pc.setLocalDescription(await pc.createOffer());
    await new Promise((ok) => { if (pc.iceGatheringState === 'complete') return ok(); const to = setTimeout(ok, 2500);
      pc.addEventListener('icegatheringstatechange', () => { if (pc.iceGatheringState === 'complete') { clearTimeout(to); ok(); } }); });
    return pc.localDescription.sdp; })()`);
  const answer = await capture.rtc('v1', offer, ICE);
  if (!answer) return end(false, 'el launcher no pudo grabar la ventana');
  await viewer.webContents.executeJavaScript(`pc.setRemoteDescription({ type: 'answer', sdp: ${JSON.stringify(answer)} })`);
  await sleep(8000);

  // lo que ve el jugador (¿borde amarillo?) mientras le están mirando
  console.log('[prueba] captura de pantalla:', await screenshot(path.join(OUT, 'pantalla.png')));
  const samples = [];
  for (let i = 0; i < 5; i++) {
    await sleep(1000);
    samples.push(await viewer.webContents.executeJavaScript(`(async () => { const o = {}; (await pc.getStats()).forEach(x => {
      if (x.type === 'inbound-rtp' && x.kind === 'video') Object.assign(o, { fps: x.framesPerSecond || 0, w: x.frameWidth, h: x.frameHeight }); }); o.state = pc.connectionState; return o; })()`));
  }
  samples.forEach((s, i) => console.log(`[prueba] seg ${i + 1}: ${s.state} ${s.w}x${s.h} ${Math.round(s.fps)} img/s`));
  // lo que ve el staff
  const png = await viewer.webContents.executeJavaScript(`(() => { const v = document.querySelector('video'); const c = document.createElement('canvas'); c.width = v.videoWidth; c.height = v.videoHeight; c.getContext('2d').drawImage(v, 0, 0); return c.toDataURL('image/png').split(',')[1]; })()`);
  fs.writeFileSync(path.join(OUT, 'panel.png'), Buffer.from(png, 'base64'));
  const avg = samples.reduce((a, s) => a + s.fps, 0) / samples.length, last = samples[samples.length - 1];
  if (last.state !== 'connected') return end(false, 'no conectó');
  end(avg >= 20, `${last.w}x${last.h} a ${avg.toFixed(1)} img/s grabando la ventana de verdad`);
});
