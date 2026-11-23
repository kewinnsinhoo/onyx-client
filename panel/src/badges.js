// Insignias: se ganan jugando y se enseñan en el perfil del launcher (3 favoritas en la vitrina y en la tarjeta).
//   - De Kopi (automáticas): horas jugadas, rachas de días, antigüedad, explorador, juego limpio, secretas…
//   - De eventos: jugar la instancia de un evento mientras está en marcha.
//   - Del studio: las crea cada studio y las da a mano o solas (jugar X horas o jugar una instancia).
//   - Especiales: «Equipo Kopi» y «Beta tester» las da el Creador; «Staff de studio» sale sola.
// Todo se calcula en el servidor con las partidas: nadie puede darse una insignia desde el launcher.
// La primera vez que se cumple una, se guarda la fecha (player_badges): así el launcher sabe cuáles son nuevas.
import { json, fail, now, str, int, readJson, randomToken, NAME_RE } from './util.js';
import { audit } from './onyx.js';

export const RARITIES = ['common', 'rare', 'epic', 'legendary'];
const H = 3600e3, DAY = 864e5;
const PIONEER_UNTIL = Date.UTC(2027, 0, 1); // quien empezó a jugar antes de 2027
const ICONS = ['star', 'trophy', 'crown', 'flame', 'heart', 'shield', 'sword', 'gem', 'zap', 'rocket', 'music', 'gamepad', 'users', 'calendar', 'gift', 'sparkles', 'skull', 'target'];

// Las de Kopi. «max» y «unit» = barra de progreso en el launcher. Los textos son claves de traducción (en español).
export const BUILTIN = [
  { id: 'hours-1', cat: 'time', icon: 'clock', rarity: 'common', name: 'Primer paso', desc: 'Juega 1 hora', max: 1, unit: 'h' },
  { id: 'hours-10', cat: 'time', icon: 'clock', rarity: 'common', name: 'Calentando', desc: 'Juega 10 horas', max: 10, unit: 'h' },
  { id: 'hours-100', cat: 'time', icon: 'clock', rarity: 'rare', name: 'Veterano', desc: 'Juega 100 horas', max: 100, unit: 'h' },
  { id: 'hours-500', cat: 'time', icon: 'clock', rarity: 'epic', name: 'Leyenda viva', desc: 'Juega 500 horas', max: 500, unit: 'h' },
  { id: 'hours-1000', cat: 'time', icon: 'crown', rarity: 'legendary', name: 'Inmortal', desc: 'Juega 1000 horas', max: 1000, unit: 'h' },
  { id: 'streak-7', cat: 'streak', icon: 'flame', rarity: 'rare', name: 'Racha de 7', desc: 'Juega 7 días seguidos', max: 7, unit: 'd' },
  { id: 'streak-30', cat: 'streak', icon: 'flame', rarity: 'epic', name: 'Imparable', desc: 'Juega 30 días seguidos', max: 30, unit: 'd' },
  { id: 'explorer-5', cat: 'explore', icon: 'compass', rarity: 'common', name: 'Explorador', desc: 'Juega 5 instancias distintas', max: 5, unit: 'i' },
  { id: 'explorer-15', cat: 'explore', icon: 'compass', rarity: 'rare', name: 'Trotamundos', desc: 'Juega 15 instancias distintas', max: 15, unit: 'i' },
  { id: 'fair-50', cat: 'fair', icon: 'shield', rarity: 'epic', name: 'Juego limpio', desc: 'Juega 50 horas con KopiGuard sin ninguna sanción', max: 50, unit: 'h' },
  { id: 'supporter', cat: 'community', icon: 'heart', rarity: 'common', name: 'Apoyo a un studio', desc: 'Elige el studio que te trajo a Kopi' },
  { id: 'pioneer', cat: 'seniority', icon: 'rocket', rarity: 'legendary', name: 'Pionero', desc: 'Empezaste a jugar con Kopi antes de 2027' },
  { id: 'anniversary', cat: 'seniority', icon: 'cake', rarity: 'epic', name: 'Aniversario', desc: 'Un año jugando con Kopi', max: 365, unit: 'd' },
  { id: 'night-owl', cat: 'secret', icon: 'moon', rarity: 'rare', name: 'Noctámbulo', desc: 'Juega entre las 3 y las 5 de la madrugada', secret: true },
  { id: 'early-bird', cat: 'secret', icon: 'sunrise', rarity: 'rare', name: 'Madrugador', desc: 'Juega entre las 5 y las 7 de la mañana', secret: true },
  { id: 'studio-staff', cat: 'special', icon: 'badge', rarity: 'rare', name: 'Staff de studio', desc: 'Eres staff de una instancia' },
  { id: 'kopi-beta', cat: 'special', icon: 'flask', rarity: 'epic', name: 'Beta tester', desc: 'Ayudaste a probar Kopi antes que nadie', grant: true },
  { id: 'kopi-team', cat: 'special', icon: 'sparkles', rarity: 'legendary', name: 'Equipo Kopi', desc: 'Forma parte del equipo de Kopi', grant: true },
  // Única: la del creador de Kopi (rareza «mítica», con su propio dibujo)
  { id: 'kopi-creator', cat: 'special', icon: 'crown', rarity: 'mythic', name: 'Creador', desc: 'Creó Kopi Client', grant: true }
];
const BY_ID = Object.fromEntries(BUILTIN.map(b => [b.id, b]));

// ---------------------------------------------------------------- cálculo (puro: se prueba sin base de datos)
// plays: [{ instance_id, studio_id, start, end }]; tz: minutos a sumar a UTC para la hora local (p. ej. Madrid = 60)
export function playerFacts(plays, { tz = 0, guarded = new Set(), at = Date.now() } = {}) {
  const off = tz * 60e3;
  let ms = 0, fairMs = 0, first = null, night = false, early = false;
  const days = new Set(), insts = new Set();
  for (const p of plays) {
    const s = p.start, e = Math.max(p.start, Math.min(p.end, p.start + 24 * H)); // una partida «colgada» no cuenta más de 24 h
    ms += e - s;
    if (guarded.has(p.instance_id)) fairMs += e - s;
    insts.add(p.instance_id);
    if (first == null || s < first) first = s;
    for (let d = Math.floor((s + off) / DAY); d <= Math.floor((e + off) / DAY); d++) days.add(d);
    // ¿la partida pasa por las 3–5 o las 5–7 (hora local)? Se mira cada media hora
    for (let x = s; x <= e && !(night && early); x += 30 * 60e3) {
      const h = new Date(x + off).getUTCHours();
      if (h >= 3 && h < 5) night = true;
      else if (h >= 5 && h < 7) early = true;
    }
  }
  // racha: la más larga de días seguidos
  const sorted = [...days].sort((a, b) => a - b);
  let best = 0, run = 0, prev = null;
  for (const d of sorted) { run = prev != null && d === prev + 1 ? run + 1 : 1; best = Math.max(best, run); prev = d; }
  return { hours: ms / H, fairHours: fairMs / H, streak: best, instances: insts.size, first, night, early, ageDays: first ? (at - first) / DAY : 0 };
}

// Las de Kopi según los datos → [{ id, earned, cur }]
export function builtinState(f, extra = {}) {
  const v = {
    'hours-1': f.hours, 'hours-10': f.hours, 'hours-100': f.hours, 'hours-500': f.hours, 'hours-1000': f.hours,
    'streak-7': f.streak, 'streak-30': f.streak, 'explorer-5': f.instances, 'explorer-15': f.instances,
    'fair-50': extra.sanctioned ? 0 : f.fairHours, anniversary: f.ageDays
  };
  return BUILTIN.map(b => {
    let earned;
    if (b.max) earned = (v[b.id] || 0) >= b.max;
    else if (b.id === 'supporter') earned = !!extra.supporter;
    else if (b.id === 'pioneer') earned = !!f.first && f.first < PIONEER_UNTIL;
    else if (b.id === 'night-owl') earned = f.night;
    else if (b.id === 'early-bird') earned = f.early;
    else if (b.id === 'studio-staff') earned = !!extra.staff;
    else earned = !!(extra.granted && extra.granted.has(b.id));
    return { id: b.id, earned, cur: b.max ? Math.min(b.max, Math.floor((v[b.id] || 0) * 10) / 10) : null };
  });
}

// ¿Se cumple la regla de una insignia del studio? rule: { type: 'manual' } | { type: 'hours', instance, hours } | { type: 'played', instance }
export function ruleState(rule, plays) {
  if (!rule || rule.type === 'manual') return null;
  const mine = plays.filter(p => !rule.instance || p.instance_id === rule.instance);
  if (rule.type === 'played') return { earned: mine.length > 0, cur: null, max: null };
  const hours = mine.reduce((n, p) => n + Math.max(0, Math.min(p.end, p.start + 24 * H) - p.start), 0) / H;
  const max = Math.max(1, Number(rule.hours) || 1);
  return { earned: hours >= max, cur: Math.min(max, Math.floor(hours * 10) / 10), max };
}

// Un evento cuenta si se jugó su instancia mientras estaba en marcha (sin final: 6 horas desde que empieza)
export function playedEvent(ev, plays) {
  const end = ev.ends_at || ev.starts_at + 6 * H;
  return plays.some(p => p.instance_id === ev.instance_id && p.start < end && p.end > ev.starts_at);
}

// ---------------------------------------------------------------- con la base de datos
async function loadPlays(env, key) {
  return (await env.DB.prepare('SELECT instance_id, studio_id, started_at AS start, COALESCE(ended_at, last_seen) AS end FROM plays WHERE player_key = ? ORDER BY started_at DESC LIMIT 20000').bind(key).all()).results;
}

const studioOut = (r, names) => {
  let d = {};
  try { d = JSON.parse(r.data || '{}'); } catch { /* nada */ }
  return { id: 'sb:' + r.id, cat: 'studio', icon: ICONS.includes(d.icon) ? d.icon : 'star', rarity: RARITIES.includes(r.rarity) ? r.rarity : 'rare', color: d.color || null,
    name: r.name, desc: r.description || '', studio: names[r.studio_id] || null, custom: true };
};

// Todas las insignias de un jugador, con las ganadas, su fecha y su progreso
export async function badgesOf(env, key, { tz = 0 } = {}) {
  const t = now();
  const plays = await loadPlays(env, key);
  const instIds = [...new Set(plays.map(p => p.instance_id))];
  const insts = instIds.length ? (await env.DB.prepare(`SELECT id, studio_id, data FROM instances WHERE id IN (${instIds.map(() => '?').join(',')})`).bind(...instIds).all()).results : [];
  const guarded = new Set(insts.filter(r => { try { return JSON.parse(r.data).guard?.enabled; } catch { return false; } }).map(r => r.id));
  const facts = playerFacts(plays, { tz, guarded, at: t });
  const [sanctioned, supporter, staff, grants] = await Promise.all([
    env.DB.prepare("SELECT 1 FROM guard_events WHERE player_key = ? AND (status = 'sanctioned' OR kicked = 1) LIMIT 1").bind(key).first(),
    env.DB.prepare('SELECT 1 FROM referrals WHERE player_key = ?').bind(key).first(),
    env.DB.prepare(`SELECT 1 FROM instances i, json_each(i.data, '$.access.staff') s WHERE i.deleted_at IS NULL AND lower(s.value) = ? LIMIT 1`).bind(key).first(),
    env.DB.prepare('SELECT badge_id FROM badge_grants WHERE player_key = ?').bind(key).all()
  ]);
  const granted = new Set(grants.results.map(g => g.badge_id));
  const list = [];
  for (const s of builtinState(facts, { sanctioned: !!sanctioned, supporter: !!supporter, staff: !!staff, granted })) {
    const b = BY_ID[s.id];
    list.push({ id: b.id, cat: b.cat, icon: b.icon, rarity: b.rarity, name: b.name, desc: b.desc, secret: !!b.secret, earned: s.earned,
      progress: b.max ? { cur: s.cur, max: b.max, unit: b.unit } : null });
  }
  // Eventos de las instancias que jugó (solo los que ganó: no tiene sentido enseñar los que se perdió)
  if (instIds.length) {
    const evs = (await env.DB.prepare(`SELECT id, studio_id, instance_id, title, color, starts_at, ends_at FROM events WHERE deleted_at IS NULL AND starts_at < ? AND instance_id IN (${instIds.map(() => '?').join(',')})`).bind(t, ...instIds).all()).results;
    const names = await studioNames(env, evs.map(e => e.studio_id));
    for (const ev of evs) if (playedEvent(ev, plays)) list.push({ id: 'ev:' + ev.id, cat: 'event', icon: 'calendar', rarity: 'epic', color: ev.color, name: ev.title, desc: 'Jugaste el evento mientras estaba en marcha', studio: names[ev.studio_id] || null, earned: true, at: ev.starts_at });
  }
  // Las del studio: las automáticas de los studios donde juega y las que le dieron a mano
  const sids = [...new Set(insts.map(r => r.studio_id))];
  const manualIds = [...granted].filter(g => g.startsWith('sb:')).map(g => g.slice(3));
  const sb = (sids.length || manualIds.length) ? (await env.DB.prepare(`SELECT * FROM studio_badges WHERE deleted_at IS NULL AND (${[
    sids.length ? `(studio_id IN (${sids.map(() => '?').join(',')}) AND json_extract(data, '$.rule.type') != 'manual')` : null,
    manualIds.length ? `id IN (${manualIds.map(() => '?').join(',')})` : null].filter(Boolean).join(' OR ')})`).bind(...sids, ...manualIds).all()).results : [];
  const snames = await studioNames(env, sb.map(r => r.studio_id));
  for (const r of sb) {
    let rule = null;
    try { rule = JSON.parse(r.data || '{}').rule; } catch { /* nada */ }
    const st = ruleState(rule, plays);
    const earned = granted.has('sb:' + r.id) || !!(st && st.earned);
    if (!earned && !(st && st.max)) continue; // «jugar la instancia» sin jugarla: no se enseña
    list.push({ ...studioOut(r, snames), earned, progress: st && st.max ? { cur: st.cur, max: st.max, unit: 'h' } : null });
  }
  // La fecha en que se ganó cada una (la primera vez que se vio cumplida)
  const prev = Object.fromEntries((await env.DB.prepare('SELECT badge_id, earned_at FROM player_badges WHERE player_key = ?').bind(key).all()).results.map(r => [r.badge_id, r.earned_at]));
  const fresh = list.filter(b => b.earned && !prev[b.id]);
  if (fresh.length) await env.DB.batch(fresh.map(b => env.DB.prepare('INSERT OR IGNORE INTO player_badges (player_key, badge_id, earned_at) VALUES (?, ?, ?)').bind(key, b.id, t)));
  for (const b of list) if (b.earned) b.at = prev[b.id] || t;
  const sc = await env.DB.prepare('SELECT showcase FROM player_showcase WHERE player_key = ?').bind(key).first();
  let showcase = [];
  try { showcase = JSON.parse((sc && sc.showcase) || '[]'); } catch { /* nada */ }
  const earnedIds = new Set(list.filter(b => b.earned).map(b => b.id));
  showcase = showcase.filter(id => earnedIds.has(id)).slice(0, 3);
  if (!showcase.length) showcase = rarest(list).slice(0, 3).map(b => b.id); // sin elegir: las más raras
  if (earnedIds.has('kopi-creator')) showcase = ['kopi-creator', ...showcase.filter(id => id !== 'kopi-creator')].slice(0, 3); // la del creador, siempre la primera
  return { badges: list, showcase, facts: { hours: Math.round(facts.hours * 10) / 10, streak: facts.streak, instances: facts.instances } };
}

function rarest(list) {
  const ORDER = [...RARITIES, 'mythic']; // la mítica, la primera
  return list.filter(b => b.earned).sort((a, b) => (ORDER.indexOf(b.rarity) - ORDER.indexOf(a.rarity)) || (b.at || 0) - (a.at || 0));
}

async function studioNames(env, ids) {
  const u = [...new Set(ids)].filter(Boolean);
  if (!u.length) return {};
  const rows = (await env.DB.prepare(`SELECT id, name FROM studios WHERE id IN (${u.map(() => '?').join(',')})`).bind(...u).all()).results;
  return Object.fromEntries(rows.map(r => [r.id, r.name]));
}

// ---------------------------------------------------------------- launcher: /api/l/badges
export async function launcherBadges(env, P, parts, m, req, q) {
  if (parts[1] === 'showcase' && m === 'POST') {
    const b = await readJson(req);
    const ids = Array.isArray(b.ids) ? [...new Set(b.ids.map(x => str(x, 80)))].slice(0, 3) : [];
    const { badges } = await badgesOf(env, P.key, { tz: int(q.get('tz'), -840, 840, 0) });
    const earned = new Set(badges.filter(x => x.earned).map(x => x.id));
    if (ids.some(id => !earned.has(id))) fail(400, 'badge', 'Solo puedes poner insignias que ya tienes');
    await env.DB.prepare('INSERT INTO player_showcase (player_key, showcase, updated_at) VALUES (?, ?, ?) ON CONFLICT(player_key) DO UPDATE SET showcase = excluded.showcase, updated_at = excluded.updated_at')
      .bind(P.key, JSON.stringify(ids), now()).run();
    return json({ ok: true, showcase: ids });
  }
  if (!parts[1] && m === 'GET') return json(await badgesOf(env, P.key, { tz: int(q.get('tz'), -840, 840, 0) }));
  return null;
}

// ---------------------------------------------------------------- panel del studio: /badges
const cleanColor = (c) => /^#[0-9a-f]{6}$/i.test(String(c || '')) ? String(c).toLowerCase() : null;
function cleanBadge(b, instanceIds) {
  const name = str(b.name, 40).trim();
  if (!name) fail(400, 'name', 'Ponle un nombre a la insignia');
  const r = b.rule || {};
  let rule = { type: 'manual' };
  if (r.type === 'hours' || r.type === 'played') {
    if (!instanceIds.has(r.instance)) fail(400, 'instance', 'Elige una instancia del studio');
    rule = r.type === 'hours' ? { type: 'hours', instance: r.instance, hours: int(r.hours, 1, 5000, 5) } : { type: 'played', instance: r.instance };
  }
  return { name, description: str(b.description, 120).trim(), rarity: RARITIES.includes(b.rarity) ? b.rarity : 'rare',
    data: { icon: ICONS.includes(b.icon) ? b.icon : 'star', color: cleanColor(b.color), rule } };
}

export async function studioBadges(c, id, m, sub) {
  const { env, studio, user } = c;
  const insts = (await env.DB.prepare('SELECT id, data FROM instances WHERE studio_id = ? AND deleted_at IS NULL').bind(studio.id).all()).results;
  const instanceIds = new Set(insts.map(r => r.id));
  const holders = async (bid) => (await env.DB.prepare(`SELECT player_name AS name, 'manual' AS via, granted_at AS at FROM badge_grants WHERE badge_id = ?
      UNION SELECT COALESCE((SELECT player_name FROM plays WHERE player_key = pb.player_key ORDER BY started_at DESC LIMIT 1), pb.player_key), 'auto', pb.earned_at FROM player_badges pb
      WHERE pb.badge_id = ? AND pb.player_key NOT IN (SELECT player_key FROM badge_grants WHERE badge_id = ?) ORDER BY 3 DESC LIMIT 500`).bind('sb:' + bid, 'sb:' + bid, 'sb:' + bid).all()).results;
  const one = async (bid) => {
    const r = await env.DB.prepare('SELECT * FROM studio_badges WHERE id = ? AND studio_id = ? AND deleted_at IS NULL').bind(str(bid, 40), studio.id).first();
    if (!r) fail(404, 'badge', 'Insignia no encontrada');
    return r;
  };
  const out = (r, n) => { const d = JSON.parse(r.data || '{}'); return { id: r.id, name: r.name, description: r.description || '', rarity: r.rarity, icon: d.icon || 'star', color: d.color || null, rule: d.rule || { type: 'manual' }, holders: n, createdAt: r.created_at }; };

  if (!id && m === 'GET') {
    const rows = (await env.DB.prepare('SELECT * FROM studio_badges WHERE studio_id = ? AND deleted_at IS NULL ORDER BY created_at DESC').bind(studio.id).all()).results;
    const counts = Object.fromEntries((await env.DB.prepare(`SELECT badge_id, COUNT(*) AS n FROM (SELECT badge_id, player_key FROM badge_grants WHERE badge_id LIKE 'sb:%' UNION SELECT badge_id, player_key FROM player_badges WHERE badge_id LIKE 'sb:%') GROUP BY badge_id`).all()).results.map(r => [r.badge_id, r.n]));
    const instances = insts.map(r => ({ id: r.id, name: (() => { try { return JSON.parse(r.data).name; } catch { return r.id; } })() }));
    return json({ badges: rows.map(r => out(r, counts['sb:' + r.id] || 0)), instances, icons: ICONS, rarities: RARITIES });
  }
  if (!id && m === 'POST') {
    c.need('editor');
    const n = await env.DB.prepare('SELECT COUNT(*) AS n FROM studio_badges WHERE studio_id = ? AND deleted_at IS NULL').bind(studio.id).first();
    if (n.n >= 50) fail(400, 'limit', 'Como mucho 50 insignias por studio');
    const b = cleanBadge(await readJson(c.req), instanceIds);
    const bid = randomToken(8);
    await env.DB.prepare('INSERT INTO studio_badges (id, studio_id, name, description, rarity, data, created_by, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)')
      .bind(bid, studio.id, b.name, b.description, b.rarity, JSON.stringify(b.data), user.id, now()).run();
    await audit(env, user, studio.id, 'badge.create', b.name);
    return json(out(await one(bid), 0));
  }
  if (id && !sub && m === 'GET') { const r = await one(id); const h = await holders(r.id); return json({ ...out(r, h.length), list: h }); }
  if (id && !sub && m === 'PATCH') {
    c.need('editor');
    const r = await one(id);
    const b = cleanBadge(await readJson(c.req), instanceIds);
    await env.DB.prepare('UPDATE studio_badges SET name = ?, description = ?, rarity = ?, data = ? WHERE id = ?').bind(b.name, b.description, b.rarity, JSON.stringify(b.data), r.id).run();
    return json(out(await one(r.id), (await holders(r.id)).length));
  }
  if (id && !sub && m === 'DELETE') {
    c.need('editor');
    const r = await one(id);
    await env.DB.batch([
      env.DB.prepare('UPDATE studio_badges SET deleted_at = ? WHERE id = ?').bind(now(), r.id),
      env.DB.prepare('DELETE FROM badge_grants WHERE badge_id = ?').bind('sb:' + r.id),
      env.DB.prepare('DELETE FROM player_badges WHERE badge_id = ?').bind('sb:' + r.id)
    ]);
    await audit(env, user, studio.id, 'badge.delete', r.name);
    return json({ ok: true });
  }
  // dar a mano (varios nombres) o quitar
  if (id && sub === 'grant' && (m === 'POST' || m === 'DELETE')) {
    c.need('editor');
    const r = await one(id);
    const body = await readJson(c.req);
    const names = String(body.names || body.name || '').split(/[\s,;]+/).filter(n => NAME_RE.test(n)).slice(0, 200);
    if (!names.length) fail(400, 'name', 'Escribe al menos un nombre de jugador válido');
    const t = now();
    await env.DB.batch(names.map(n => m === 'POST'
      ? env.DB.prepare('INSERT OR IGNORE INTO badge_grants (badge_id, player_key, player_name, granted_by, granted_at) VALUES (?, ?, ?, ?, ?)').bind('sb:' + r.id, n.toLowerCase(), n, user.id, t)
      : env.DB.prepare('DELETE FROM badge_grants WHERE badge_id = ? AND player_key = ?').bind('sb:' + r.id, n.toLowerCase())));
    if (m === 'DELETE') await env.DB.batch(names.map(n => env.DB.prepare('DELETE FROM player_badges WHERE badge_id = ? AND player_key = ?').bind('sb:' + r.id, n.toLowerCase())));
    await audit(env, user, studio.id, m === 'POST' ? 'badge.grant' : 'badge.revoke', r.name, { names, n: names.length });
    const h = await holders(r.id);
    return json({ ...out(r, h.length), list: h });
  }
  fail(404, 'not_found', 'Ruta no encontrada');
}

// ---------------------------------------------------------------- Creador: «Equipo Kopi» y «Beta tester»
export async function creatorBadges(env, user, m, req) {
  const SPECIAL = BUILTIN.filter(b => b.grant).map(b => b.id);
  if (m === 'POST' || m === 'DELETE') {
    const b = await readJson(req);
    if (!SPECIAL.includes(b.badge)) fail(400, 'badge', 'Insignia no válida');
    const names = String(b.names || '').split(/[\s,;]+/).filter(n => NAME_RE.test(n)).slice(0, 200);
    if (!names.length) fail(400, 'name', 'Escribe al menos un nombre de jugador válido');
    const t = now();
    await env.DB.batch(names.map(n => m === 'POST'
      ? env.DB.prepare('INSERT OR IGNORE INTO badge_grants (badge_id, player_key, player_name, granted_by, granted_at) VALUES (?, ?, ?, ?, ?)').bind(b.badge, n.toLowerCase(), n, user.id, t)
      : env.DB.prepare('DELETE FROM badge_grants WHERE badge_id = ? AND player_key = ?').bind(b.badge, n.toLowerCase())));
    if (m === 'DELETE') await env.DB.batch(names.map(n => env.DB.prepare('DELETE FROM player_badges WHERE badge_id = ? AND player_key = ?').bind(b.badge, n.toLowerCase())));
    await audit(env, user, null, m === 'POST' ? 'badge.grant' : 'badge.revoke', BY_ID[b.badge].name, { names, n: names.length });
  }
  const rows = (await env.DB.prepare(`SELECT badge_id, player_name, granted_at FROM badge_grants WHERE badge_id IN (${SPECIAL.map(() => '?').join(',')}) ORDER BY granted_at DESC`).bind(...SPECIAL).all()).results;
  return json({ special: BUILTIN.filter(b => b.grant).map(b => ({ id: b.id, name: b.name, desc: b.desc, icon: b.icon, rarity: b.rarity, players: rows.filter(r => r.badge_id === b.id).map(r => ({ name: r.player_name, at: r.granted_at })) })) });
}
