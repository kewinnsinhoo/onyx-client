// "Enviar informe": captura + logs + estado. Se envía a un webhook de Discord (gratis).
// Si no hay webhook configurado, se guarda en una carpeta y se abre.
const fs = require('fs');
const path = require('path');
const os = require('os');
const { config } = require('./config');
const log = require('./logger');

async function send({ message, screenshot, status, gameLog }, reportsDir) {
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const logs = [
    '===== ESTADO =====', JSON.stringify(status, null, 2), '',
    '===== LAUNCHER =====', log.tail(400), '',
    '===== JUEGO (últimas líneas) =====', gameLog || '(sin registros del juego)'
  ].join('\n');

  if (config.reportWebhook) {
    const form = new FormData();
    form.append('payload_json', JSON.stringify({
      username: 'Kopi Client · Informes',
      embeds: [{
        title: 'Nuevo informe',
        description: (message || '(sin descripción)').slice(0, 3500),
        color: 0x8b8b94,
        fields: [
          { name: 'Jugador', value: String(status.account || '—'), inline: true },
          { name: 'Versión', value: String(status.version), inline: true },
          { name: 'Sistema', value: `${status.os}`, inline: true }
        ],
        timestamp: new Date().toISOString()
      }]
    }));
    if (screenshot) form.append('files[0]', new Blob([screenshot], { type: 'image/png' }), 'captura.png');
    form.append('files[1]', new Blob([logs], { type: 'text/plain' }), 'registros.txt');
    const res = await fetch(config.reportWebhook, { method: 'POST', body: form });
    if (!res.ok) throw new Error('No se pudo enviar el informe (' + res.status + ')');
    return { sent: true };
  }

  const dir = path.join(reportsDir, `informe-${stamp}`);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, 'mensaje.txt'), message || '');
  fs.writeFileSync(path.join(dir, 'registros.txt'), logs);
  if (screenshot) fs.writeFileSync(path.join(dir, 'captura.png'), screenshot);
  return { sent: false, dir };
}

function statusInfo(app, account, instancesCount) {
  return {
    version: app.getVersion(),
    os: `${os.type()} ${os.release()} (${process.arch})`,
    ramGb: Math.round(os.totalmem() / 1073741824),
    electron: process.versions.electron,
    account: account ? `${account.name} (${account.type === 'msa' ? 'Microsoft' : 'Offline'})` : null,
    instances: instancesCount
  };
}

module.exports = { send, statusInfo };
