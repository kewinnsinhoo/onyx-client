// Sistema de referidos: el jugador apoya a un studio con su código.
// - Con el panel de Onyx: los studios, el código (su id) y el ranking salen del panel, en vivo.
// - Sin panel: studios.json del repo onyx-data (y Supabase si está configurado, como antes).
const data = require('./data');
const panel = require('./panel');
const { config } = require('./config');

function supa() {
  const s = config.supabase || {};
  return s.url && s.anonKey ? { url: s.url.replace(/\/$/, ''), key: s.anonKey } : null;
}

async function githubStudios() {
  const list = await data.getJson('studios.json', { fallback: [] });
  return (Array.isArray(list) ? list : (list.studios || [])).map(st => ({ ...st, code: String(st.code).toUpperCase(), source: 'github' }));
}

async function studios() {
  if (panel.enabled()) {
    const r = await panel.publicGet('studios');
    if (r && Array.isArray(r.studios)) return r.studios.map(st => ({ id: st.id, code: st.code || String(st.id).toUpperCase(), name: st.name, logo: st.logo || null, source: 'panel' }));
  }
  return githubStudios();
}

async function ranking(period = 'all') {
  if (panel.enabled()) {
    const r = await panel.publicGet(`referrals?period=${period === 'month' ? 'month' : 'all'}`);
    if (r && Array.isArray(r.studios)) {
      return r.studios.map(st => ({ code: st.code || String(st.id).toUpperCase(), name: st.name, logo: st.logo || null, players: Number(st.players) || 0 }))
        .sort((a, b) => b.players - a.players);
    }
  }
  const list = await githubStudios();
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
      code: st.code,
      name: st.name,
      logo: st.logo || null,
      players: counts ? (counts[st.code] || 0) : Number(period === 'month' ? st.monthly || 0 : st.players || 0)
    }))
    .sort((a, b) => b.players - a.players);
}

// account: { name, uuid, type, ... } o null (si aún no hay cuenta se envía más tarde)
async function link(code, account) {
  code = String(code || '').trim().toUpperCase();
  if (!code) throw new Error('Ese código de referido no existe');
  const list = await studios();
  const norm = (x) => String(x || '').toUpperCase().replace(/[\s_]+/g, '-');
  const st = list.find(x => x.code === code || norm(x.name) === norm(code));
  if (!st) throw new Error('Ese código de referido no existe');
  const out = { code: st.code, name: st.name, logo: st.logo || null, linkedAt: Date.now() };
  if (st.source === 'panel') {
    out.studio = st.id;
    out.sent = false;
    if (account) {
      const r = await panel.referral(account, st.id);
      if (r && r.already) throw new Error('Esta cuenta ya apoya a un estudio');
      out.sent = true;
    }
    return out;
  }
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
  return out;
}

module.exports = { studios, ranking, link };
