// Marcos y fondos de perfil.
//
// Quién tiene qué:
//  - los gratis (free) los tiene todo el mundo;
//  - los de insignia (badge) los tiene quien tenga esa insignia especial (badge_grants);
//  - el resto, quien los recibe: regalo del Creador desde el panel (o, más adelante, la ruleta) → look_owned.
// Lo que lleva puesto cada jugador está en look_worn (marco y fondo). Sale en su perfil del launcher y de la web.
// El dibujo está en public/js/cosmetics.js (el mismo en el launcher y en la web).
import '../public/js/cosmetics.js';
import { json, fail, now, playerKey, NAME_RE, readJson, str } from './util.js';
import { audit } from './onyx.js';
import { checkOwner } from './capes.js';

const ART = globalThis.KopiCosmetics;
const KINDS = { frame: { list: ART.FRAMES, get: ART.getFrame, col: 'frame' }, bg: { list: ART.BGS, get: ART.getBg, col: 'bg' } };
const kindOf = (k) => KINDS[k] || fail(404, 'kind', 'Eso no existe');

// Los ids que tiene un jugador: { frame: [...], bg: [...] }
export async function ownedLooks(env, key) {
  const [rows, badges] = await Promise.all([
    env.DB.prepare('SELECT kind, item_id FROM look_owned WHERE player_key = ? ORDER BY created_at, rowid').bind(key).all(),
    env.DB.prepare('SELECT badge_id FROM badge_grants WHERE player_key = ?').bind(key).all()
  ]);
  const has = new Set(badges.results.map(r => r.badge_id));
  const out = {};
  for (const [k, K] of Object.entries(KINDS)) {
    const got = new Set(rows.results.filter(r => r.kind === k).map(r => r.item_id));
    out[k] = K.list.filter(it => it.free || (it.badge && has.has(it.badge)) || got.has(it.id)).map(it => it.id);
  }
  return out;
}

// Lo que lleva puesto (solo si aún lo tiene): { frame, bg } — null si nada
export async function wornLook(env, key, owned) {
  const w = await env.DB.prepare('SELECT frame, bg FROM look_worn WHERE player_key = ?').bind(key).first();
  if (!w) return { frame: null, bg: null };
  owned = owned || await ownedLooks(env, key);
  return { frame: w.frame && owned.frame.includes(w.frame) && w.frame !== 'none' ? w.frame : null, bg: w.bg && owned.bg.includes(w.bg) && w.bg !== 'none' ? w.bg : null };
}

// ---------------------------------------------------------------- launcher
export async function launcherLooks(env, P, parts, m, req) {
  if (parts[0] === 'looks' && m === 'GET') {
    const owned = await ownedLooks(env, P.key);
    return json({ owned, worn: await wornLook(env, P.key, owned) });
  }
  if (parts[0] === 'look' && m === 'POST') {
    const b = await readJson(req);
    const owner = await checkOwner(env, P, b.key, 'look_worn', 'Esta cuenta es premium: inicia sesión con Microsoft para cambiar tu perfil');
    const owned = await ownedLooks(env, P.key);
    const cur = await wornLook(env, P.key, owned);
    const next = { ...cur };
    for (const k of ['frame', 'bg']) {
      if (!(k in b)) continue;
      const id = b[k] == null || b[k] === '' || b[k] === 'none' ? null : String(b[k]);
      if (id && !KINDS[k].get(id)) fail(404, 'look', 'Eso no existe');
      if (id && !owned[k].includes(id)) fail(403, 'not_owned', 'Todavía no lo tienes');
      next[k] = id;
    }
    await env.DB.prepare(`INSERT INTO look_worn (player_key, player_name, frame, bg, owner_hash, updated_at) VALUES (?, ?, ?, ?, ?, ?)
      ON CONFLICT(player_key) DO UPDATE SET player_name = excluded.player_name, frame = excluded.frame, bg = excluded.bg,
      owner_hash = COALESCE(excluded.owner_hash, look_worn.owner_hash), updated_at = excluded.updated_at`)
      .bind(P.key, P.name, next.frame, next.bg, owner, now()).run();
    return json({ ok: true, worn: next });
  }
  return null;
}

// ---------------------------------------------------------------- Creador: regalar y quitar
// GET    /api/onyx/looks                      → { frame: [{ id, owners, wearing }], bg: [...] }
// GET    /api/onyx/looks/<kind>/<id>          → { owners: [{ name, at, by, wearing }] }
// POST   /api/onyx/looks/<kind>/<id> {names}  → regalar
// DELETE /api/onyx/looks/<kind>/<id>/<name>   → quitar
export async function creatorLooks(c, kind, id, name, m) {
  const { env, user } = c;
  if (!kind && m === 'GET') {
    const counts = (await env.DB.prepare('SELECT kind, item_id, COUNT(*) AS n FROM look_owned GROUP BY kind, item_id').all()).results;
    const wearing = (await env.DB.prepare(`SELECT 'frame' AS kind, frame AS item_id, COUNT(*) AS n FROM look_worn WHERE frame IS NOT NULL GROUP BY frame
      UNION ALL SELECT 'bg', bg, COUNT(*) FROM look_worn WHERE bg IS NOT NULL GROUP BY bg`).all()).results;
    const n = (list, k, i) => (list.find(r => r.kind === k && r.item_id === i) || {}).n || 0;
    const out = {};
    for (const [k, K] of Object.entries(KINDS)) out[k] = K.list.map(it => ({ id: it.id, owners: n(counts, k, it.id), wearing: n(wearing, k, it.id) }));
    return json(out);
  }
  const K = kindOf(kind);
  const item = K.get(id);
  if (!item) fail(404, 'look', 'Eso no existe');
  if ((item.free || item.badge) && m !== 'GET') fail(400, 'auto', item.free ? 'Este lo tiene todo el mundo' : 'Este se consigue con su insignia');
  if (!name && m === 'GET') {
    const rows = (await env.DB.prepare(`SELECT o.player_name AS name, o.created_at, o.granted_by_name AS by_name, (w.player_key IS NOT NULL) AS wearing
      FROM look_owned o LEFT JOIN look_worn w ON w.player_key = o.player_key AND w.${K.col} = o.item_id
      WHERE o.kind = ? AND o.item_id = ? ORDER BY o.created_at DESC, o.rowid DESC`).bind(kind, id).all()).results;
    return json({ owners: rows.map(r => ({ name: r.name, at: r.created_at, by: r.by_name || null, wearing: !!r.wearing })) });
  }
  if (!name && m === 'POST') {
    const b = await readJson(c.req);
    const names = [...new Set((Array.isArray(b.names) ? b.names : String(b.name || '').split(/[\s,;]+/)).map(s => str(s, 32).trim()).filter(Boolean))];
    if (!names.length) fail(400, 'name', 'Escribe el nombre de un jugador');
    if (names.length > 50) fail(400, 'name', 'Como mucho 50 jugadores a la vez');
    if (names.some(x => !NAME_RE.test(x))) fail(400, 'name', 'Ese nombre de Minecraft no es válido');
    const t = now();
    const res = await env.DB.batch(names.map(x => env.DB.prepare(`INSERT INTO look_owned (player_key, kind, item_id, player_name, source, granted_by, granted_by_name, created_at)
      VALUES (?, ?, ?, ?, 'gift', ?, ?, ?) ON CONFLICT(player_key, kind, item_id) DO NOTHING`).bind(playerKey(x), kind, id, x, user.id, user.name, t)));
    const added = names.filter((x, i) => res[i] && res[i].meta && res[i].meta.changes);
    if (added.length) await audit(env, user, null, 'look.give', item.name, { names: added.slice(0, 10), n: added.length, kind, item: id });
    return json({ ok: true, added: added.length, already: names.length - added.length });
  }
  if (name && m === 'DELETE') {
    const key = playerKey(name);
    const r = await env.DB.prepare('DELETE FROM look_owned WHERE player_key = ? AND kind = ? AND item_id = ? RETURNING player_name').bind(key, kind, id).first();
    if (!r) fail(404, 'owner', 'Ese jugador no lo tiene');
    await env.DB.prepare(`UPDATE look_worn SET ${K.col} = NULL WHERE player_key = ? AND ${K.col} = ?`).bind(key, id).run();
    await audit(env, user, null, 'look.take', item.name, { name: r.player_name, kind, item: id });
    return json({ ok: true });
  }
  fail(404, 'not_found', 'Ruta no encontrada');
}
