// «Enviar informe» del launcher → canal de Discord del equipo de Kopi.
//
// El launcher manda el informe aquí (POST /api/l/report) y el panel lo reenvía al webhook de
// Discord guardado como secreto en Cloudflare (DISCORD_REPORT_WEBHOOK). Así el enlace del webhook
// nunca va dentro del launcher (si fuera dentro, cualquiera podría sacarlo y llenar el canal de spam).
// Cada jugador puede mandar un informe por minuto.
import { json, fail, now } from './util.js';

const WAIT = 60e3;
const MAX_IMG = 8 * 1024 * 1024;
const WEBHOOK_RE = /^https:\/\/(?:ptb\.|canary\.)?discord(?:app)?\.com\/api\/webhooks\/\d+\/[\w-]+$/;

const clip = (v, n) => String(v == null ? '' : v).slice(0, n);
const field = (name, value) => ({ name, value: clip(value, 1000) || '—', inline: true });

function image(b64) {
  if (!b64 || typeof b64 !== 'string') return null;
  let bytes;
  try { bytes = Uint8Array.from(atob(b64), c => c.charCodeAt(0)); } catch { return null; }
  if (!bytes.length || bytes.length > MAX_IMG) return null;
  if (bytes[0] === 0xff && bytes[1] === 0xd8) return { bytes, type: 'image/jpeg', name: 'captura.jpg' };
  if (bytes[0] === 0x89 && bytes[1] === 0x50) return { bytes, type: 'image/png', name: 'captura.png' };
  return null;
}

export async function sendReport(env, P, b) {
  const hook = String(env.DISCORD_REPORT_WEBHOOK || '').trim();
  if (!WEBHOOK_RE.test(hook)) fail(503, 'no_webhook', 'Los informes no están configurados en el panel');

  const rl = 'rl:report:' + P.key;
  const last = Number(String((await env.MEDIA.get(rl)) || '0'));
  if (now() - last < WAIT) fail(429, 'slow', 'Espera un minuto antes de enviar otro informe');
  await env.MEDIA.put(rl, String(now()), { expirationTtl: 120 });

  const s = b && typeof b.status === 'object' && b.status ? b.status : {};
  const shot = image(b && b.screenshot);
  const form = new FormData();
  form.append('payload_json', JSON.stringify({
    username: 'Kopi Client · Informes',
    allowed_mentions: { parse: [] }, // que nadie pueda hacer @everyone desde el texto
    embeds: [{
      title: '📝 Nuevo informe',
      description: clip((b && b.message || '').trim() || '(sin descripción)', 3500),
      color: 0xff5fa2,
      fields: [
        field('Jugador', `${P.name} ${P.verified ? '✅ premium' : '(no premium)'}`),
        field('Versión', s.version),
        field('Sistema', s.os),
        field('RAM', s.ramGb ? `${s.ramGb} GB` : ''),
        field('Instancias', s.instances),
        field('Jugando', s.instance)
      ],
      image: shot ? { url: 'attachment://' + shot.name } : undefined,
      timestamp: new Date().toISOString()
    }]
  }));
  if (shot) form.append('files[0]', new Blob([shot.bytes], { type: shot.type }), shot.name);
  form.append('files[1]', new Blob([clip(b && b.logs, 400000)], { type: 'text/plain' }), 'registros.txt');

  let r;
  try { r = await (env.DISCORD_FETCH || fetch)(hook, { method: 'POST', body: form }); }
  catch { r = null; }
  if (!r || !r.ok) {
    await env.MEDIA.delete(rl); // no se ha enviado: que pueda volver a intentarlo
    fail(502, 'discord', 'Discord no ha aceptado el informe. Inténtalo más tarde.');
  }
  return json({ ok: true });
}
