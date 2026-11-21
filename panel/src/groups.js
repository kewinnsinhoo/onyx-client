// Grupos de jugadores del studio: «VIP», «Testers», «Equipo rojo»…
// Cada instancia puede dar acceso a grupos enteros (Acceso → Grupos con acceso): quien está en el grupo
// la ve en su launcher y puede jugar, sin código ni lista. Si le sacas del grupo, deja de tener acceso.
//   GET/POST /groups · GET/PATCH/DELETE /groups/<id> · POST/DELETE /groups/<id>/members[/<nombre>]
import { json, fail, now, str, readJson, randomToken, playerKey, NAME_RE } from './util.js';
import { audit } from './onyx.js';

const COLORS = ['#f472b6', '#a78bfa', '#60a5fa', '#34d399', '#fbbf24', '#fb923c', '#f87171', '#94a3b8'];
const MAX_GROUPS = 50, MAX_MEMBERS = 5000;
export const GROUP_ID = /^[a-z0-9]{6,20}$/;

// ¿Está este jugador en alguno de los grupos que dan acceso a la instancia?
export async function inGroups(env, data, key) {
  const ids = ((data.access && data.access.groups) || []).filter(id => GROUP_ID.test(id));
  if (!ids.length) return false;
  const r = await env.DB.prepare(`SELECT 1 FROM group_members m JOIN player_groups g ON g.id = m.group_id
    WHERE m.player_key = ? AND g.deleted_at IS NULL AND m.group_id IN (${ids.map(() => '?').join(',')}) LIMIT 1`).bind(key, ...ids).first();
  return !!r;
}

// Los grupos de un jugador en un studio (para su ficha)
export async function groupsOf(env, studioId, key) {
  return (await env.DB.prepare(`SELECT g.id, g.name, g.color FROM group_members m JOIN player_groups g ON g.id = m.group_id
    WHERE m.player_key = ? AND g.studio_id = ? AND g.deleted_at IS NULL ORDER BY g.name`).bind(key, studioId).all()).results;
}

const cleanColor = (c) => COLORS.includes(String(c || '').toLowerCase()) ? String(c).toLowerCase() : COLORS[0];
const names = (v) => [...new Set(String(Array.isArray(v) ? v.join(',') : v || '').split(/[\s,;]+/).filter(n => NAME_RE.test(n)))].slice(0, 500);

export async function groupsApi(c, id, m, sub, extra) {
  const { env, studio, user } = c;
  // instancias que dan acceso a cada grupo
  const insts = async () => (await env.DB.prepare('SELECT id, data FROM instances WHERE studio_id = ? AND deleted_at IS NULL').bind(studio.id).all()).results
    .map(r => { try { const d = JSON.parse(r.data); return { id: r.id, name: d.name, groups: (d.access && d.access.groups) || [] }; } catch { return null; } }).filter(Boolean);
  const one = async (gid) => {
    const g = await env.DB.prepare('SELECT * FROM player_groups WHERE id = ? AND studio_id = ? AND deleted_at IS NULL').bind(str(gid, 20), studio.id).first();
    if (!g) fail(404, 'group', 'Grupo no encontrado');
    return g;
  };
  const out = (g, n, list) => ({ id: g.id, name: g.name, color: g.color, members: n, instances: list.filter(i => i.groups.includes(g.id)).map(i => ({ id: i.id, name: i.name })), createdAt: g.created_at });

  if (!id && m === 'GET') {
    const rows = (await env.DB.prepare(`SELECT g.*, (SELECT COUNT(*) FROM group_members m WHERE m.group_id = g.id) AS n FROM player_groups g
      WHERE g.studio_id = ? AND g.deleted_at IS NULL ORDER BY g.created_at`).bind(studio.id).all()).results;
    const list = await insts();
    return json({ groups: rows.map(g => out(g, g.n, list)), colors: COLORS });
  }
  if (!id && m === 'POST') {
    c.need('editor');
    const b = await readJson(c.req);
    const name = str(b.name, 32).trim();
    if (!name) fail(400, 'name', 'Ponle un nombre al grupo');
    const count = await env.DB.prepare('SELECT COUNT(*) AS n FROM player_groups WHERE studio_id = ? AND deleted_at IS NULL').bind(studio.id).first();
    if (count.n >= MAX_GROUPS) fail(400, 'limit', 'Como mucho 50 grupos por studio');
    const gid = randomToken(6); // 12 letras y números
    await env.DB.prepare('INSERT INTO player_groups (id, studio_id, name, color, created_by, created_at) VALUES (?, ?, ?, ?, ?, ?)').bind(gid, studio.id, name, cleanColor(b.color), user.id, now()).run();
    if (b.names) await addMembers(env, gid, names(b.names), user.id);
    await audit(env, user, studio.id, 'group.create', name);
    const n = await env.DB.prepare('SELECT COUNT(*) AS n FROM group_members WHERE group_id = ?').bind(gid).first();
    return json(out(await one(gid), n.n, await insts()), 201);
  }
  const g = await one(id);
  if (!sub && m === 'GET') {
    const members = (await env.DB.prepare(`SELECT m.player_name AS name, m.added_at AS at,
        (SELECT MAX(p.last_seen) FROM plays p WHERE p.player_key = m.player_key AND p.studio_id = ?) AS last
      FROM group_members m WHERE m.group_id = ? ORDER BY m.player_name COLLATE NOCASE`).bind(studio.id, g.id).all()).results;
    return json({ ...out(g, members.length, await insts()), list: members });
  }
  c.need('editor');
  if (!sub && m === 'PATCH') {
    const b = await readJson(c.req);
    const name = 'name' in b ? str(b.name, 32).trim() : g.name;
    if (!name) fail(400, 'name', 'Ponle un nombre al grupo');
    await env.DB.prepare('UPDATE player_groups SET name = ?, color = ? WHERE id = ?').bind(name, 'color' in b ? cleanColor(b.color) : g.color, g.id).run();
    const n = await env.DB.prepare('SELECT COUNT(*) AS n FROM group_members WHERE group_id = ?').bind(g.id).first();
    return json(out(await one(g.id), n.n, await insts()));
  }
  if (!sub && m === 'DELETE') {
    await env.DB.batch([
      env.DB.prepare('UPDATE player_groups SET deleted_at = ? WHERE id = ?').bind(now(), g.id),
      env.DB.prepare('DELETE FROM group_members WHERE group_id = ?').bind(g.id)
    ]);
    await audit(env, user, studio.id, 'group.delete', g.name);
    return json({ ok: true });
  }
  if (sub === 'members' && m === 'POST') {
    const list = names((await readJson(c.req)).names);
    if (!list.length) fail(400, 'name', 'Escribe nombres de Minecraft válidos (3-16 letras, números o _)');
    const n = await env.DB.prepare('SELECT COUNT(*) AS n FROM group_members WHERE group_id = ?').bind(g.id).first();
    if (n.n + list.length > MAX_MEMBERS) fail(400, 'limit', 'Como mucho 5000 jugadores por grupo');
    await addMembers(env, g.id, list, user.id);
    await audit(env, user, studio.id, 'group.add', g.name, { names: list.slice(0, 20), n: list.length });
    return json({ ok: true, added: list.length });
  }
  if (sub === 'members' && m === 'DELETE' && extra) {
    if (!NAME_RE.test(extra)) fail(400, 'name', 'Nombre de jugador no válido');
    await env.DB.prepare('DELETE FROM group_members WHERE group_id = ? AND player_key = ?').bind(g.id, playerKey(extra)).run();
    await audit(env, user, studio.id, 'group.remove', g.name, { names: [extra], n: 1 });
    return json({ ok: true });
  }
  fail(404, 'not_found', 'Ruta no encontrada');
}

async function addMembers(env, gid, list, by) {
  const t = now();
  for (let i = 0; i < list.length; i += 50) {
    await env.DB.batch(list.slice(i, i + 50).map(n => env.DB.prepare('INSERT OR IGNORE INTO group_members (group_id, player_key, player_name, added_by, added_at) VALUES (?, ?, ?, ?, ?)').bind(gid, playerKey(n), n, by, t)));
  }
}
