// Estado de Discord ("Jugando a Kopi Client"): qué se muestra en cada momento.
const { DiscordRPC } = require('./discord-rpc');

const { config } = require('./config');
// Logo para Discord: el icono de la marca (lo deja la fábrica en brand.json) o el de Kopi
const LOGO_URL = (config.brand && /^https:/.test(config.brand.iconUrl || '')) ? config.brand.iconUrl : 'https://onyxclient.site/img/icon.png';
const APP = config.appName || 'Kopi Client';

// Textos en [es, en, ca, fr]
const TXT = {
  menu: ['En el menú', 'In the menu', 'Al menú', 'Dans le menu'],
  instances: ['Eligiendo instancia', 'Choosing an instance', 'Triant instància', 'Choisit une instance'],
  instance: ['Mirando {name}', 'Looking at {name}', 'Mirant {name}', 'Regarde {name}'],
  skins: ['Cambiando de skin', 'Changing skin', 'Canviant de skin', 'Change de skin'],
  gallery: ['Viendo capturas', 'Looking at screenshots', 'Mirant captures', 'Regarde des captures'],
  creators: ['Viendo creadores', 'Browsing creators', 'Mirant creadors', 'Découvre les créateurs'],
  settings: ['En ajustes', 'In settings', 'A la configuració', 'Dans les paramètres'],
  launching: ['Iniciando {name}', 'Starting {name}', 'Iniciant {name}', 'Lance {name}'],
  download: ['Descargar {app}', 'Download {app}', 'Descarrega {app}', 'Télécharger {app}'],
  join: ['Unirse al Discord', 'Join the Discord', 'Uneix-te al Discord', 'Rejoindre le Discord']
};
const LANGS = ['es', 'en', 'ca', 'fr'];

function tr(key, lang, vars = {}) {
  const row = TXT[key];
  const s = row[Math.max(0, LANGS.indexOf(lang))] || row[0];
  return s.replace(/\{(\w+)\}/g, (_, k) => (vars[k] != null ? vars[k] : ''));
}

// Discord pide textos de 2 a 128 caracteres
function fit(s, max = 128) {
  s = String(s || '').trim();
  if (s.length > max) s = s.slice(0, max - 1) + '…';
  return s.length < 2 ? (s + '  ').slice(0, 2) : s;
}

const LOADERS = { fabric: 'Fabric', quilt: 'Quilt', forge: 'Forge', neoforge: 'NeoForge' };
function versionLine(inst) {
  const loader = inst.loader && LOADERS[inst.loader.type];
  return `Minecraft ${inst.minecraft || ''}${loader ? ' · ' + loader : ''}`;
}

const isHttpsImage = (u) => typeof u === 'string' && /^https:\/\//.test(u) && u.length <= 256;

// Construye la actividad que se envía a Discord. Función pura (se prueba en test/).
function buildActivity(state, ctx) {
  const lang = ctx.lang || 'es';
  const buttons = [];
  if (ctx.githubRepo || config.brand) buttons.push({ label: fit(tr('download', lang, { app: APP }).slice(0, 32)), url: config.brand ? `${config.panelUrl || 'https://panel.onyxclient.site'}/l/${config.brand.id}` : 'https://onyxclient.site/download.html' });
  if (ctx.discordInvite) buttons.push({ label: tr('join', lang), url: ctx.discordInvite });

  const act = { instance: false };
  if (state.kind === 'launching' || state.kind === 'playing') {
    const inst = state.instance || {};
    const name = inst.name || inst.id || 'Minecraft';
    act.details = fit(state.kind === 'launching' ? tr('launching', lang, { name }) : name);
    act.state = fit(versionLine(inst));
    act.timestamps = { start: state.startedAt || Date.now() };
    if (isHttpsImage(inst.icon)) {
      act.assets = { large_image: inst.icon, large_text: fit(name), small_image: LOGO_URL, small_text: APP };
    } else {
      act.assets = { large_image: LOGO_URL, large_text: fit(name) };
    }
  } else {
    const section = state.section || 'home';
    const key = TXT[section] ? section : 'menu';
    act.details = fit(key === 'instance' ? tr('instance', lang, { name: state.name || '' }) : tr(key, lang));
    act.state = fit(`${APP} · v${ctx.version || ''}`);
    act.timestamps = { start: ctx.openedAt || Date.now() };
    act.assets = { large_image: LOGO_URL, large_text: APP };
  }
  if (buttons.length) act.buttons = buttons.slice(0, 2).map(b => ({ label: fit(b.label, 32), url: b.url }));
  return act;
}

// ---------- gestor ----------
let rpc = null;
let ctx = {};
let state = { kind: 'menu', section: 'home' };
let lastMenu = { kind: 'menu', section: 'home' };
let enabled = true;
let clientId = null;
let log = null;

function push() {
  if (!rpc) return;
  if (!enabled) rpc.clearActivity();
  else rpc.setActivity(buildActivity(state, ctx));
}

function init(opts) {
  clientId = opts.clientId;
  log = opts.log || null;
  ctx = { version: opts.version, githubRepo: opts.githubRepo || null, discordInvite: opts.discordInvite || null, lang: opts.lang || 'es', openedAt: Date.now() };
  enabled = opts.enabled !== false;
  if (!clientId) { if (log) log.info('[discord] Sin Client ID de Discord: estado desactivado'); return; }
  rpc = new DiscordRPC(clientId, { log });
  if (enabled) rpc.start();
  push();
}

function configure({ lang, enabled: en } = {}) {
  if (lang) ctx.lang = lang;
  if (en !== undefined && en !== enabled) {
    enabled = en;
    if (rpc) { if (enabled) rpc.start(); else { rpc.stop(); return; } }
  }
  push();
}

function menu(section, name) {
  lastMenu = { kind: 'menu', section, name };
  if (state.kind === 'launching' || state.kind === 'playing') return; // mientras juegas manda el juego
  state = lastMenu;
  push();
}
function launching(instance) { state = { kind: 'launching', instance, startedAt: Date.now() }; push(); }
function playing(instance) { state = { kind: 'playing', instance, startedAt: Date.now() }; push(); }
function stopped() { state = lastMenu; ctx.openedAt = Date.now(); push(); }
function shutdown() { if (rpc) rpc.stop(); }

module.exports = { init, configure, menu, launching, playing, stopped, shutdown, buildActivity, tr, LOGO_URL };
