// Ruleta diaria: una tirada al día por jugador. El premio lo decide el servidor.
//
// Qué puede tocar: una capa, un marco o un fondo que el jugador aún NO tenga, de la rareza que salga
// (los exclusivos —TACHAMANIKA, los gratis y los de insignia— nunca salen). Si ya los tiene todos de
// esa rareza, baja a la siguiente; si no le queda nada, «¡Casi!».
// Una tirada por día del jugador (con su zona horaria) y, como mínimo, 6 horas entre una y otra.
import '../public/js/cape-art.js';
import '../public/js/cosmetics.js';
import { json, fail, now, readJson } from './util.js';
import { checkOwner } from './capes.js';
import { ownedLooks } from './looks.js';

const CAPES = globalThis.KopiCapeArt, LOOKS = globalThis.KopiCosmetics;
export const SPIN_ODDS = [['none', 35], ['rare', 33], ['epic', 22], ['legendary', 10]]; // %, suman 100
const NO_CAPES = new Set(['tachamanika']); // capas de una persona: no salen en la ruleta
const MIN_GAP = 6 * 3600e3;
const TIERS = ['legendary', 'epic', 'rare'];
const tierOf = (r) => (r === 'common' ? 'rare' : r);

// Todo lo que puede salir: [{ kind: 'cape'|'frame'|'bg', id, rarity }]
export function spinPool() {
  return [
    ...CAPES.CAPES.filter(c => !NO_CAPES.has(c.id)).map(c => ({ kind: 'cape', id: c.id, rarity: tierOf(c.rarity) })),
    ...LOOKS.FRAMES.filter(f => !f.free && !f.badge).map(f => ({ kind: 'frame', id: f.id, rarity: tierOf(f.rarity) })),
    ...LOOKS.BGS.filter(b => !b.free && !b.badge).map(b => ({ kind: 'bg', id: b.id, rarity: tierOf(b.rarity) }))
  ];
}

// Día del jugador según su zona horaria (minutos respecto a UTC, como -300 en Colombia)
const tzOf = (v) => { const n = Math.round(Number(v)); return Number.isFinite(n) ? Math.max(-14 * 60, Math.min(14 * 60, n)) : 0; };
const dayOf = (t, tz) => Math.floor((t + tz * 60e3) / 864e5);
function nextAt(last, tz) {
  if (!last) return 0;
  const startNextDay = (dayOf(last, tz) + 1) * 864e5 - tz * 60e3;
  return Math.max(startNextDay, last + MIN_GAP);
}

async function state(env, key, tz) {
  const last = await env.DB.prepare('SELECT at FROM spins WHERE player_key = ? ORDER BY at DESC LIMIT 1').bind(key).first();
  const next = nextAt(last && last.at, tz);
  return { last: last ? last.at : null, next, ready: now() >= next };
}

async function ownedAll(env, key) {
  const capes = (await env.DB.prepare('SELECT cape_id FROM cape_owned WHERE player_key = ?').bind(key).all()).results.map(r => r.cape_id);
  const looks = await ownedLooks(env, key);
  return new Set([...capes.map(id => 'cape:' + id), ...looks.frame.map(id => 'frame:' + id), ...looks.bg.map(id => 'bg:' + id)]);
}

// Un número al azar de 0 a 1 (en las pruebas se puede fijar con env.SPIN_ROLL)
const roll = (env) => {
  if (env.SPIN_ROLL != null) return Number(typeof env.SPIN_ROLL === 'function' ? env.SPIN_ROLL() : env.SPIN_ROLL);
  return crypto.getRandomValues(new Uint32Array(1))[0] / 2 ** 32;
};

export async function launcherSpin(env, P, parts, m, req, u) {
  if (parts[0] !== 'spin') return null;
  if (m === 'GET') {
    const tz = tzOf(u.searchParams.get('tz'));
    const s = await state(env, P.key, tz);
    const owned = await ownedAll(env, P.key);
    const pool = spinPool();
    const recent = (await env.DB.prepare('SELECT at, kind, item_id, rarity FROM spins WHERE player_key = ? ORDER BY at DESC LIMIT 6').bind(P.key).all()).results
      .map(r => ({ at: r.at, kind: r.kind || null, id: r.item_id || null, rarity: r.rarity || null }));
    return json({ ...s, now: now(), odds: SPIN_ODDS, left: pool.filter(p => !owned.has(p.kind + ':' + p.id)).length, total: pool.length, recent });
  }
  if (m === 'POST') {
    const b = await readJson(req);
    const tz = tzOf(b.tz);
    await checkOwner(env, P, b.key, 'look_worn', 'Esta cuenta es premium: inicia sesión con Microsoft para girar la ruleta');
    const s = await state(env, P.key, tz);
    if (!s.ready) fail(429, 'spin_wait', 'Ya has girado la ruleta hoy');
    // ¿qué rareza sale?
    let r = roll(env) * 100, tier = 'none';
    for (const [k, p] of SPIN_ODDS) { if (r < p) { tier = k; break; } r -= p; }
    let prize = null;
    if (tier !== 'none') {
      const owned = await ownedAll(env, P.key);
      const free = spinPool().filter(p => !owned.has(p.kind + ':' + p.id));
      // si ya tiene todo lo de esa rareza, baja a la siguiente
      for (const t of TIERS.slice(TIERS.indexOf(tier))) {
        const list = free.filter(p => p.rarity === t);
        if (list.length) { prize = list[Math.min(list.length - 1, Math.floor(roll(env) * list.length))]; break; }
      }
    }
    const t = now();
    // apuntar la tirada (si dos llegan a la vez, solo vale una)
    const ins = await env.DB.prepare(`INSERT INTO spins (player_key, player_name, at, day, kind, item_id, rarity)
      SELECT ?, ?, ?, ?, ?, ?, ? WHERE NOT EXISTS (SELECT 1 FROM spins WHERE player_key = ? AND at > ?)`)
      .bind(P.key, P.name, t, dayOf(t, tz), prize ? prize.kind : null, prize ? prize.id : null, prize ? prize.rarity : null, P.key, t - MIN_GAP).run();
    if (!ins.meta || !ins.meta.changes) fail(429, 'spin_wait', 'Ya has girado la ruleta hoy');
    if (prize && prize.kind === 'cape') {
      await env.DB.prepare(`INSERT INTO cape_owned (player_key, cape_id, player_name, source, granted_by, granted_by_name, created_at)
        VALUES (?, ?, ?, 'spin', NULL, 'Ruleta', ?) ON CONFLICT(player_key, cape_id) DO NOTHING`).bind(P.key, prize.id, P.name, t).run();
    } else if (prize) {
      await env.DB.prepare(`INSERT INTO look_owned (player_key, kind, item_id, player_name, source, granted_by, granted_by_name, created_at)
        VALUES (?, ?, ?, ?, 'spin', NULL, 'Ruleta', ?) ON CONFLICT(player_key, kind, item_id) DO NOTHING`).bind(P.key, prize.kind, prize.id, P.name, t).run();
    }
    return json({ ok: true, tier: prize ? prize.rarity : 'none', prize, next: nextAt(t, tz) });
  }
  return null;
}

