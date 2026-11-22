// Ventana que hace de Minecraft (en otro proceso, como el juego de verdad) para las pruebas de las cámaras.
const { app, BrowserWindow } = require('electron');
app.whenReady().then(async () => {
  const w = new BrowserWindow({ show: true, x: 60, y: 40, width: 900, height: 560, title: 'Minecraft* 1.21.1', backgroundColor: '#000', webPreferences: { backgroundThrottling: false } });
  await w.loadURL('data:text/html,' + encodeURIComponent(`<title>Minecraft* 1.21.1</title><body style="margin:0;overflow:hidden;background:#000"><canvas id=c></canvas><script>
    const c = document.getElementById('c'), g = c.getContext('2d'); c.width = innerWidth; c.height = innerHeight; let f = 0;
    (function draw() { f++; g.fillStyle = 'hsl(' + (f % 360) + ',55%,30%)'; g.fillRect(0, 0, c.width, c.height);
      for (let i = 0; i < 30; i++) { g.fillStyle = 'hsl(' + (i * 12) + ',80%,60%)'; g.fillRect((f * 6 + i * 91) % c.width, (i * 47 + f * 2) % c.height, 80, 80); }
      g.fillStyle = '#fff'; g.font = 'bold 70px sans-serif'; g.fillText('MINECRAFT ' + f, 40 + (f * 4) % 300, c.height / 2); requestAnimationFrame(draw); })();
  </script>`));
  w.setTitle('Minecraft* 1.21.1');
  setTimeout(() => app.exit(0), 100000);
});
