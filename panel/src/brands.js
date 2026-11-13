// Launchers de marca: el launcher propio de un studio (su nombre, icono, colores y fondo).
// El panel guarda la ficha y le pide a GitHub (repo público de descargas) que lo fabrique.
import { json, fail, now, str, readJson, slugify, url as cleanUrl, color } from './util.js';
import { audit } from './onyx.js';

const ID_RE = /^[a-z][a-z0-9-]{1,31}$/;
const RESERVED = new Set(['onyx', 'onyx-client', 'onyxclient', 'admin', 'panel', 'api', 'www', 'oficial', 'official']);
const repo = (env) => env.RELEASES_REPO || 'kewinnsinhoo/onyx-client-releases';
const httpsOnly = (v) => { const u = cleanUrl(v); return u && /^https:\/\//.test(u) ? u : null; };

export function cleanBrand(b, cur = {}) {
  const d = { ...cur };
  if ('name' in b) d.name = str(b.name, 40).trim();
  if ('icon' in b) d.icon = cleanUrl(b.icon);
  if ('logo' in b) d.logo = cleanUrl(b.logo);
  if ('background' in b) d.background = cleanUrl(b.background);
  if ('accent' in b) d.accent = color(b.accent, '#8e9bff');
  if ('accent2' in b) d.accent2 = color(b.accent2, null);
  if ('tagline' in b) d.tagline = str(b.tagline, 120).trim();
  if ('discord' in b) d.discord = httpsOnly(b.discord);
  if ('web' in b) d.web = httpsOnly(b.web);
  if ('store' in b) d.store = httpsOnly(b.store);
  if ('onlyStudio' in b) d.onlyStudio = b.onlyStudio !== false;
  return d;
}

// Ficha pública (la usan el launcher instalado, la página de descarga y GitHub al fabricar)
function publicBrand(row, studio, origin) {
  const d = JSON.parse(row.data);
  const abs = (u) => (u && u.startsWith('/m/') ? origin + u : u || null);
  return {
    id: row.id, name: row.name, studio: row.studio_id, studioName: studio ? studio.name : null,
    icon: abs(d.icon), logo: abs(d.logo), background: abs(d.background),
    accent: d.accent || '#8e9bff', accent2: d.accent2 || null, tagline: d.tagline || '',
    discord: d.discord || null, web: d.web || null, store: d.store || null, onlyStudio: d.onlyStudio !== false,
    version: row.built_version || null
  };
}

// ---------------------------------------------------------------- GitHub
async function gh(env, path, init = {}) {
  const headers = { 'User-Agent': 'onyx-panel', Accept: 'application/vnd.github+json', 'X-GitHub-Api-Version': '2022-11-28', ...(init.headers || {}) };
  if (env.GITHUB_TOKEN) headers.Authorization = `Bearer ${env.GITHUB_TOKEN}`;
  return (env.GITHUB_FETCH || fetch)(`https://api.github.com${path}`, { ...init, headers });
}

async function dispatch(env, id) {
  if (!env.GITHUB_TOKEN) fail(503, 'github', 'Falta conectar el panel con GitHub (secreto GITHUB_TOKEN en Cloudflare)');
  const r = await gh(env, `/repos/${repo(env)}/actions/workflows/build-brand.yml/dispatches`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ref: 'main', inputs: { brand: id } })
  });
  if (r.status !== 204) {
    const t = await r.text().catch(() => '');
    console.error('dispatch', r.status, t);
    fail(502, 'github', r.status === 404 ? 'GitHub no encuentra la fábrica de launchers (revisa el repo de descargas y el token)' : `GitHub no aceptó la orden (${r.status})`);
  }
}

// Última fabricación de una marca (estado y enlace para ver el progreso)
async function lastRun(env, id) {
  if (!env.GITHUB_TOKEN) return null;
  try {
    const r = await gh(env, `/repos/${repo(env)}/actions/workflows/build-brand.yml/runs?per_page=40`);
    if (!r.ok) return null;
    const runs = (await r.json()).workflow_runs || [];
    const run = runs.find(x => x.display_title === `Marca ${id}`);
    if (!run) return null;
    return { status: run.status, conclusion: run.conclusion, url: run.html_url, at: Date.parse(run.created_at), updated: Date.parse(run.updated_at) };
  } catch { return null; }
}

// Instaladores publicados de una marca
export async function downloads(env, id) {
  try {
    const r = await gh(env, `/repos/${repo(env)}/releases/tags/brand-${id}`);
    if (!r.ok) return { files: [], version: null };
    const rel = await r.json();
    const files = [];
    let version = null;
    for (const a of rel.assets || []) {
      const n = a.name;
      let os = null, label = null;
      if (/\.exe$/i.test(n)) { os = 'windows'; label = 'Windows'; }
      else if (/arm64\.dmg$/i.test(n)) { os = 'mac-arm'; label = 'macOS (Apple Silicon)'; }
      else if (/\.dmg$/i.test(n)) { os = 'mac'; label = 'macOS (Intel)'; }
      else if (/\.AppImage$/i.test(n)) { os = 'linux'; label = 'Linux'; }
      if (!os) continue;
      const v = (n.match(/(\d+\.\d+\.\d+(?:-(?:beta|alpha|rc)[\w.]*)?)(?=[-.])/) || [])[1];
      if (v) version = v;
      files.push({ os, label, name: n, url: a.browser_download_url, size: a.size, at: Date.parse(a.updated_at) });
    }
    return { files, version };
  } catch { return { files: [], version: null }; }
}

// ---------------------------------------------------------------- API del studio (/api/s/:sid/brand)
export async function studioBrandApi(c, sub, m) {
  const { env, studio, user } = c;
  const origin = env.PUBLIC_URL || c.u.origin;
  const row = await env.DB.prepare('SELECT * FROM brands WHERE studio_id = ?').bind(studio.id).first();
  const allowed = !!studio.brand_allowed || c.isCreator;
  if (!sub && m === 'GET') {
    const out = { allowed, brand: null, run: null, downloads: { files: [], version: null }, repo: repo(env), github: !!env.GITHUB_TOKEN };
    if (row) {
      out.brand = { ...JSON.parse(row.data), id: row.id, name: row.name, requestedAt: row.build_requested_at, builtVersion: row.built_version };
      out.public = publicBrand(row, studio, origin);
      [out.run, out.downloads] = await Promise.all([lastRun(env, row.id), downloads(env, row.id)]);
      if (out.downloads.version && out.downloads.version !== row.built_version) {
        await env.DB.prepare('UPDATE brands SET built_version = ? WHERE id = ?').bind(out.downloads.version, row.id).run();
      }
    }
    return json(out);
  }
  c.need('admin');
  if (!allowed) fail(403, 'brand_off', 'Tu studio todavía no tiene launcher propio. Pídeselo a Onyx Studios.');
  if (!sub && m === 'PUT') {
    const b = await readJson(c.req);
    const d = cleanBrand(b, row ? JSON.parse(row.data) : { accent: '#8e9bff', onlyStudio: true });
    if (!d.name || d.name.length < 2) fail(400, 'name', 'Ponle nombre a tu launcher');
    if (/onyx/i.test(d.name) && !c.isCreator) fail(400, 'name', 'El nombre no puede llevar «Onyx»');
    const t = now();
    if (row) {
      await env.DB.prepare('UPDATE brands SET name = ?, data = ?, updated_at = ? WHERE id = ?').bind(d.name, JSON.stringify(d), t, row.id).run();
      await audit(env, user, studio.id, 'brand.update', d.name);
      return json({ ok: true, id: row.id });
    }
    let id = String(b.id || slugify(d.name)).toLowerCase().replace(/[^a-z0-9-]/g, '').replace(/^[^a-z]+/, '').slice(0, 32);
    if (!ID_RE.test(id) || RESERVED.has(id)) id = slugify(studio.name).replace(/^[^a-z]+/, '') || 'launcher';
    if (await env.DB.prepare('SELECT 1 FROM brands WHERE id = ?').bind(id).first()) id = `${id.slice(0, 27)}-${Math.random().toString(36).slice(2, 6)}`;
    await env.DB.prepare('INSERT INTO brands (id, studio_id, name, data, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)')
      .bind(id, studio.id, d.name, JSON.stringify(d), t, t).run();
    await audit(env, user, studio.id, 'brand.create', d.name, { id });
    return json({ ok: true, id }, 201);
  }
  if (sub === 'build' && m === 'POST') {
    if (!row) fail(400, 'brand', 'Primero guarda tu launcher');
    const d = JSON.parse(row.data);
    if (!d.icon) fail(400, 'icon', 'Sube el icono de tu launcher antes de compilar');
    const run = await lastRun(env, row.id);
    if (run && run.status !== 'completed' && now() - run.at < 90 * 60e3) fail(409, 'building', 'Tu launcher ya se está fabricando. Espera a que termine.');
    if (row.build_requested_at && now() - row.build_requested_at < 60e3) fail(429, 'wait', 'Acabas de pedirlo. Espera un minuto.');
    await dispatch(env, row.id);
    await env.DB.prepare('UPDATE brands SET build_requested_at = ? WHERE id = ?').bind(now(), row.id).run();
    await audit(env, user, studio.id, 'brand.build', row.name);
    return json({ ok: true });
  }
  fail(404, 'not_found', 'Ruta no encontrada');
}

// ---------------------------------------------------------------- Creador
export async function creatorBrandsApi(c, sub, m) {
  const { env, user } = c;
  if (!sub && m === 'GET') {
    const rows = (await env.DB.prepare('SELECT b.*, s.name AS studio_name FROM brands b JOIN studios s ON s.id = b.studio_id WHERE s.deleted_at IS NULL ORDER BY b.created_at').all()).results;
    const out = [];
    for (const r of rows) out.push({ id: r.id, name: r.name, studio: r.studio_id, studioName: r.studio_name, builtVersion: r.built_version, run: await lastRun(env, r.id) });
    return json({ brands: out, repo: repo(env), github: !!env.GITHUB_TOKEN });
  }
  if (sub === 'rebuild' && m === 'POST') {
    const rows = (await env.DB.prepare("SELECT b.id, b.data FROM brands b JOIN studios s ON s.id = b.studio_id WHERE s.deleted_at IS NULL AND s.brand_allowed = 1").all()).results;
    let n = 0;
    for (const r of rows) { if (JSON.parse(r.data).icon) { await dispatch(env, r.id); n++; } }
    await env.DB.prepare('UPDATE brands SET build_requested_at = ?').bind(now()).run();
    await audit(env, user, null, 'brand.rebuild', null, { n });
    return json({ ok: true, n });
  }
  fail(404, 'not_found', 'Ruta no encontrada');
}

// ---------------------------------------------------------------- público
export async function publicBrandsApi(env, u, parts) {
  const origin = env.PUBLIC_URL || u.origin;
  const CORS = { 'Access-Control-Allow-Origin': '*', 'Cache-Control': 'public, max-age=60' };
  if (!parts[1]) {
    const rows = (await env.DB.prepare('SELECT b.id, b.name, b.studio_id FROM brands b JOIN studios s ON s.id = b.studio_id WHERE s.deleted_at IS NULL AND s.brand_allowed = 1 AND b.built_version IS NOT NULL').all()).results;
    return json({ brands: rows.map(r => ({ id: r.id, name: r.name, studio: r.studio_id })) }, 200, CORS);
  }
  const id = String(parts[1]);
  if (!ID_RE.test(id)) fail(404, 'brand', 'Launcher no encontrado');
  const row = await env.DB.prepare('SELECT b.*, s.name AS sname, s.brand_allowed, s.suspended_at FROM brands b JOIN studios s ON s.id = b.studio_id WHERE b.id = ? AND s.deleted_at IS NULL').bind(id).first();
  if (!row) fail(404, 'brand', 'Launcher no encontrado');
  const brand = publicBrand(row, { name: row.sname }, origin);
  if (parts[2] === 'build') { // lo pide GitHub al fabricar
    if (!row.brand_allowed) fail(403, 'brand_off', 'Este studio no tiene launcher propio');
    if (!brand.icon) fail(400, 'icon', 'La marca no tiene icono');
    return json({ brand }, 200, { 'Cache-Control': 'no-store' });
  }
  if (parts[2] === 'downloads') return json({ brand, ...(await downloads(env, id)) }, 200, CORS);
  return json({ brand }, 200, CORS);
}
