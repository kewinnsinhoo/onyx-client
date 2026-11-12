// Sistema de referidos: el jugador apoya a un estudio con su código.
// - studios.json (repo onyx-data) define los estudios y sus códigos.
// - Si configuras Supabase (gratis), el conteo y el ranking son automáticos y en vivo.
//   Si no, se muestran los números que pongas a mano en studios.json.
const data = require('./data');
const { config } = require('./config');

function supa() {
  const s = config.supabase || {};
  return s.url && s.anonKey ? { url: s.url.replace(/\/$/, ''), key: s.anonKey } : null;
}

async function studios() {
  const list = await data.getJson('studios.json', { fallback: [] });
  return Array.isArray(list) ? list : (list.studios || []);
}

async function ranking(period = 'all') {
  const list = await studios();
  const s = supa();
  let counts = null;
  if (s) {
    try {
      const view = period === 'month' ? 'referral_ranking_month' : 'referral_ranking_all';
      const res = await fetch(`${s.url}/rest/v1/${view}?select=studio_code,players`, {
        headers: { apikey: s.key, Authorization: `Bearer ${s.key}` }
      });
      if (res.ok) {
        counts = {};
        for (const r of await res.json()) counts[String(r.studio_code).toUpperCase()] = Number(r.players) || 0;
      }
    } catch { /* sin conexión */ }
  }
  return list
    .map(st => ({
      code: String(st.code).toUpperCase(),
      name: st.name,
      logo: st.logo || null,
      players: counts ? (counts[String(st.code).toUpperCase()] || 0) : Number(period === 'month' ? st.monthly || 0 : st.players || 0)
    }))
    .sort((a, b) => b.players - a.players);
}

async function link(code, account) {
  code = String(code || '').trim().toUpperCase();
  const list = await studios();
  const st = list.find(x => String(x.code).toUpperCase() === code);
  if (!st) throw new Error('Ese código de referido no existe');
  const s = supa();
  if (s && account) {
    const res = await fetch(`${s.url}/rest/v1/referrals`, {
      method: 'POST',
      headers: { apikey: s.key, Authorization: `Bearer ${s.key}`, 'Content-Type': 'application/json', Prefer: 'return=minimal' },
      body: JSON.stringify({ player_uuid: account.uuid, player_name: account.name, studio_code: code })
    });
    if (res.status === 409) throw new Error('Esta cuenta ya apoya a un estudio');
    if (!res.ok) throw new Error('No se pudo guardar el referido, inténtalo más tarde');
  }
  return { code, name: st.name, logo: st.logo || null, linkedAt: Date.now() };
}

module.exports = { studios, ranking, link };
