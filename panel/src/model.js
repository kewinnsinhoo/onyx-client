// Forma de los datos de una instancia: valores por defecto, limpieza y manifiesto para el launcher.
import { str, bool, color, url, int, NAME_RE } from './util.js';

export const CATEGORIES = ['Evento', 'Torneo', 'Serie', 'Survival', 'Minijuegos', 'Squid Game'];
export const LOADERS = ['vanilla', 'fabric', 'quilt', 'forge', 'neoforge'];
export const SYNC_MODES = ['keep', 'managed', 'reset'];
export const PATH_MODES = ['once', 'player', 'studio'];

export function defaults() {
  return {
    name: 'Nueva instancia',
    category: 'Evento',
    description: '',
    about: '',
    minecraft: '1.21.1',
    loader: { type: 'vanilla', version: 'latest' },
    java: 'auto',
    look: {
      background: null, logo: null, icon: null,
      backgroundAnimated: null, logoAnimated: null, iconAnimated: null,
      accent: '#8e9bff', playColor: '#5b67e8',
      vignette: true, hideTitle: false, hideTech: false, hideAuthor: false, snow: false,
      music: { url: null, volume: 40, loop: true },
      sponsor: { name: '', logo: null, url: null }
    },
    access: { codes: true, list: false, public: false, premiumOnly: false, maxPlayers: null, staff: [] },
    files: [],
    dirs: [],
    sync: { mode: 'keep', playerPaths: [{ path: 'options.txt', mode: 'once' }] },
    schedule: { predownload: false, opensAt: null, closesAt: null, kickOnClose: false },
    server: { address: '', port: 25565, autoJoin: false },
    kopiSkins: true,          // el launcher pone CustomSkinLoader: se ven las skins (premium y de Kopi) en cualquier servidor
    lockedMessage: ''
  };
}

const cleanPath = (p) => {
  const s = String(p || '').replace(/\\/g, '/').replace(/^\/+/, '').trim();
  if (!s || s.length > 200 || s.split('/').some(x => x === '..' || x === '')) return null;
  return s;
};
const names = (list) => [...new Set((Array.isArray(list) ? list : []).map(n => String(n).trim()).filter(n => NAME_RE.test(n)))].slice(0, 500);
const time = (v) => { const n = Number(v); return Number.isFinite(n) && n > 0 ? Math.round(n) : null; };

// Aplica un cambio (patch) sobre los datos actuales y devuelve datos limpios.
export function sanitize(patch, current = defaults()) {
  const d = structuredClone(current);
  const p = patch || {};
  if ('name' in p) d.name = str(p.name, 60).trim() || d.name;
  if ('category' in p) d.category = str(p.category, 30).trim() || 'Evento';
  if ('description' in p) d.description = str(p.description, 200);
  if ('about' in p) d.about = str(p.about, 4000);
  if ('minecraft' in p && /^[A-Za-z0-9._ -]{1,40}$/.test(String(p.minecraft))) d.minecraft = String(p.minecraft);
  if (p.loader) {
    if (LOADERS.includes(p.loader.type)) d.loader.type = p.loader.type;
    if ('version' in p.loader) d.loader.version = /^[A-Za-z0-9._+-]{1,60}$/.test(String(p.loader.version)) ? String(p.loader.version) : 'latest';
    if (d.loader.type === 'vanilla') d.loader.version = 'latest';
  }
  if ('kopiSkins' in p) d.kopiSkins = bool(p.kopiSkins);
  if ('java' in p) d.java = ['auto', '8', '17', '21', '25'].includes(String(p.java)) ? String(p.java) : 'auto';
  if (p.look) {
    const l = p.look, o = d.look;
    for (const k of ['background', 'logo', 'icon', 'backgroundAnimated', 'logoAnimated', 'iconAnimated']) if (k in l) o[k] = url(l[k]);
    if ('accent' in l) o.accent = color(l.accent, o.accent);
    if ('playColor' in l) o.playColor = color(l.playColor, o.playColor);
    for (const k of ['vignette', 'hideTitle', 'hideTech', 'hideAuthor', 'snow']) if (k in l) o[k] = bool(l[k]);
    if (l.music) {
      if ('url' in l.music) o.music.url = url(l.music.url);
      if ('volume' in l.music) o.music.volume = int(l.music.volume, 0, 100, 40);
      if ('loop' in l.music) o.music.loop = bool(l.music.loop);
    }
    if (l.sponsor) {
      if ('name' in l.sponsor) o.sponsor.name = str(l.sponsor.name, 60);
      if ('logo' in l.sponsor) o.sponsor.logo = url(l.sponsor.logo);
      if ('url' in l.sponsor) o.sponsor.url = url(l.sponsor.url);
    }
    // Un fondo/logo/icono animado necesita también su versión fija
    if (o.backgroundAnimated && !o.background) o.backgroundAnimated = null;
    if (o.logoAnimated && !o.logo) o.logoAnimated = null;
    if (o.iconAnimated && !o.icon) o.iconAnimated = null;
  }
  if (p.access) {
    const a = p.access, o = d.access;
    for (const k of ['codes', 'list', 'public', 'premiumOnly']) if (k in a) o[k] = bool(a[k]);
    if ('maxPlayers' in a) o.maxPlayers = int(a.maxPlayers, 1, 100000, null);
    if ('staff' in a) o.staff = names(a.staff);
  }
  if (Array.isArray(p.files)) {
    const seen = new Set();
    d.files = p.files.map(f => ({
      path: cleanPath(f && f.path), url: url(f && f.url),
      sha1: /^[0-9a-f]{40}$/i.test(String(f && f.sha1 || '')) ? String(f.sha1).toLowerCase() : null,
      size: int(f && f.size, 0, 4e9, null), name: str(f && f.name, 120), at: time(f && f.at),
      ...(f && /^[A-Za-z0-9]{8}$/.test(String(f.mr || '')) ? { mr: String(f.mr) } : {})
    })).filter(f => f.path && f.url && !seen.has(f.path) && seen.add(f.path)).slice(0, 5000);
  }
  // Carpetas creadas a mano (aunque estén vacías)
  if (Array.isArray(p.dirs)) d.dirs = [...new Set(p.dirs.map(cleanPath).filter(Boolean))].slice(0, 1000);
  if (!Array.isArray(d.dirs)) d.dirs = [];
  if (p.sync) {
    if (SYNC_MODES.includes(p.sync.mode)) d.sync.mode = p.sync.mode;
    if (Array.isArray(p.sync.playerPaths)) {
      d.sync.playerPaths = p.sync.playerPaths
        .map(x => ({ path: cleanPath(x && x.path), mode: PATH_MODES.includes(x && x.mode) ? x.mode : 'once' }))
        .filter(x => x.path).slice(0, 100);
    }
  }
  if (p.schedule) {
    const s = p.schedule, o = d.schedule;
    if ('predownload' in s) o.predownload = bool(s.predownload);
    if ('kickOnClose' in s) o.kickOnClose = bool(s.kickOnClose);
    if ('opensAt' in s) o.opensAt = time(s.opensAt);
    if ('closesAt' in s) o.closesAt = time(s.closesAt);
  }
  if (p.server) {
    if ('address' in p.server) d.server.address = /^[A-Za-z0-9.-]{0,120}$/.test(String(p.server.address || '')) ? String(p.server.address || '') : d.server.address;
    if ('port' in p.server) d.server.port = int(p.server.port, 1, 65535, 25565);
    if ('autoJoin' in p.server) d.server.autoJoin = bool(p.server.autoJoin);
  }
  if ('lockedMessage' in p) d.lockedMessage = str(p.lockedMessage, 140);
  return d;
}

// Manifiesto que descarga el launcher (mismo formato que onyx-data + extras del panel)
export function toManifest(row, studio, origin) {
  const d = JSON.parse(row.data);
  const abs = (u) => (u && u.startsWith('/m/') ? origin + u : u);
  const l = d.look;
  return {
    id: row.id,
    source: 'panel',
    name: d.name,
    category: d.category,
    description: d.description,
    about: d.about,
    icon: abs(l.icon), iconAnimated: abs(l.iconAnimated),
    banner: abs(l.background), bannerAnimated: abs(l.backgroundAnimated),
    logo: abs(l.logo), logoAnimated: abs(l.logoAnimated),
    look: {
      accent: l.accent, playColor: l.playColor, vignette: l.vignette, hideTitle: l.hideTitle,
      hideTech: l.hideTech, hideAuthor: l.hideAuthor, snow: l.snow,
      music: l.music.url ? { url: abs(l.music.url), volume: l.music.volume, loop: l.music.loop } : null,
      sponsor: l.sponsor.name ? { name: l.sponsor.name, logo: abs(l.sponsor.logo), url: l.sponsor.url } : null
    },
    studio: studio ? { id: studio.id, name: studio.name, logo: abs(studio.logo) } : null,
    premium: d.access.premiumOnly,
    maxPlayers: d.access.maxPlayers,
    minecraft: d.minecraft,
    loader: d.loader,
    java: d.java,
    server: d.server.address ? d.server : null,
    kopiSkins: d.kopiSkins !== false,
    files: d.files.map(f => ({ path: f.path, url: abs(f.url), sha1: f.sha1 || undefined, size: f.size || undefined })),
    dirs: d.dirs || [],
    sync: d.sync,
    state: row.state,
    schedule: d.schedule,
    maintenance: row.state === 'locked' ? (d.lockedMessage || true) : null
  };
}

// Puede jugar ahora? (función pura, se prueba en test/)
export function gate({ row, data, player, banned, hasAccess, activeOthers, at }) {
  const isStaff = data.access.staff.some(n => n.toLowerCase() === player.key);
  if (banned) return { ok: false, reason: 'banned' };
  if (!hasAccess && !data.access.public && !isStaff) return { ok: false, reason: 'no_access' };
  if (data.access.premiumOnly && !player.verified) return { ok: false, reason: 'premium' };
  const pre = data.schedule.predownload;
  if (!isStaff) {
    if (row.state === 'locked') return { ok: false, reason: 'locked', message: data.lockedMessage || null, predownload: pre };
    if (data.schedule.opensAt && at < data.schedule.opensAt) return { ok: false, reason: 'not_open', opensAt: data.schedule.opensAt, predownload: pre };
    if (data.schedule.closesAt && at > data.schedule.closesAt) return { ok: false, reason: 'closed' };
    if (data.access.maxPlayers && activeOthers >= data.access.maxPlayers) return { ok: false, reason: 'full', max: data.access.maxPlayers };
  }
  return { ok: true, staff: isStaff };
}
