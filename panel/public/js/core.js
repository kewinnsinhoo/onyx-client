// Kopi Panel — núcleo: iconos, API, avisos, ventanas, rutas y estructura.
(function () {
  const S = window.S = { me: null, studio: null, route: null, dirty: null };
  const Views = window.Views = {};

  // ---------- iconos (trazo) ----------
  const P = {
    home: '<path d="M3 10.5 12 3l9 7.5V20a1.5 1.5 0 0 1-1.5 1.5H15v-6h-6v6H4.5A1.5 1.5 0 0 1 3 20z"/>',
    grid: '<rect x="3" y="3" width="7.5" height="7.5" rx="2"/><rect x="13.5" y="3" width="7.5" height="7.5" rx="2"/><rect x="3" y="13.5" width="7.5" height="7.5" rx="2"/><rect x="13.5" y="13.5" width="7.5" height="7.5" rx="2"/>',
    calendar: '<rect x="3" y="5" width="18" height="16" rx="2.5"/><path d="M3 10h18M8 3v4M16 3v4"/>',
    rocket: '<path d="M5 15c-1.5 1.5-2 5-2 5s3.5-.5 5-2M9 15l-3-3a13 13 0 0 1 9-8l4-1-1 4a13 13 0 0 1-8 9z"/><circle cx="14.5" cy="9.5" r="1.5"/>',
    users: '<circle cx="9" cy="8" r="3.5"/><path d="M2.5 20a6.5 6.5 0 0 1 13 0M16 4.5a3.5 3.5 0 0 1 0 7M18 14.5a6.5 6.5 0 0 1 3.5 5.5"/>',
    user: '<circle cx="12" cy="8" r="4"/><path d="M4 21a8 8 0 0 1 16 0"/>',
    history: '<path d="M3 12a9 9 0 1 0 3-6.7L3 8"/><path d="M3 3v5h5M12 7v5l3 2"/>',
    link: '<path d="M10 13a5 5 0 0 0 7 0l3-3a5 5 0 0 0-7-7l-1 1M14 11a5 5 0 0 0-7 0l-3 3a5 5 0 0 0 7 7l1-1"/>',
    trash: '<path d="M4 7h16M10 11v6M14 11v6M5 7l1 13a1.5 1.5 0 0 0 1.5 1.4h9A1.5 1.5 0 0 0 18 20l1-13M9 7V4h6v3"/>',
    settings: '<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.6 1.6 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.6 1.6 0 0 0-2.7 1.1V21a2 2 0 0 1-4 0v-.1a1.6 1.6 0 0 0-2.7-1.1l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1A1.6 1.6 0 0 0 3.6 15H3a2 2 0 0 1 0-4h.1a1.6 1.6 0 0 0 1.1-2.7l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1A1.6 1.6 0 0 0 9.7 4V3a2 2 0 0 1 4 0v.1a1.6 1.6 0 0 0 2.7 1.1l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.6 1.6 0 0 0 1.1 2.7H21a2 2 0 0 1 0 4h-.1a1.6 1.6 0 0 0-1.5 1z"/>',
    activity: '<path d="M3 12h4l3-8 4 16 3-8h4"/>',
    building: '<rect x="4" y="3" width="16" height="18" rx="2"/><path d="M9 7h.01M15 7h.01M9 11h.01M15 11h.01M10 21v-4h4v4"/>',
    plus: '<path d="M12 5v14M5 12h14"/>',
    gift: '<rect x="3" y="8" width="18" height="4" rx="1"/><path d="M12 8v13M19 12v7a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2v-7"/><path d="M7.5 8a2.5 2.5 0 0 1 0-5C10 3 12 8 12 8s2-5 4.5-5a2.5 2.5 0 0 1 0 5"/>',
    megaphone: '<path d="M3 11v2a1 1 0 0 0 1 1h2l5 4V6L6 10H4a1 1 0 0 0-1 1z"/><path d="M15.5 8.5a5 5 0 0 1 0 7M18.5 5.5a9 9 0 0 1 0 13"/>',
    hardDrive: '<rect x="3" y="13" width="18" height="7" rx="2"/><path d="M5.5 13 8 5h8l2.5 8M7 16.5h.01M11 16.5h.01"/>',
    wrench: '<path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.8-3.8a6 6 0 0 1-7.9 7.9l-6.9 6.9a2.1 2.1 0 0 1-3-3l6.9-6.9a6 6 0 0 1 7.9-7.9z"/>',
    download: '<path d="M12 3v12M7 10l5 5 5-5M5 21h14"/>',
    more: '<circle cx="5" cy="12" r="1.3"/><circle cx="12" cy="12" r="1.3"/><circle cx="19" cy="12" r="1.3"/>',
    move: '<path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><path d="M10 13h6M13 10l3 3-3 3"/>',
    folderPlus: '<path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><path d="M12 10v6M9 13h6"/>',
    filePlus: '<path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z"/><path d="M14 3v5h5M12 11v6M9 14h6"/>',
    package: '<path d="m12 3 8 4.5v9L12 21l-8-4.5v-9z"/><path d="m4 7.5 8 4.5 8-4.5M12 12v9M8 5.3l8 4.4"/>',
    modrinth: '<circle cx="12" cy="12" r="9"/><path d="M8 15.5 10.5 8l3 5 2-3.5"/>',

    search: '<circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/>',
    chevDown: '<path d="m6 9 6 6 6-6"/>', chevRight: '<path d="m9 6 6 6-6 6"/>', chevLeft: '<path d="m15 6-6 6 6 6"/>',
    updown: '<path d="m7 9 5-5 5 5M7 15l5 5 5-5"/>',
    x: '<path d="M6 6l12 12M18 6 6 18"/>', check: '<path d="M5 12.5l4.5 4.5L19 7.5"/>',
    edit: '<path d="M4 20h4L19 9a2.8 2.8 0 0 0-4-4L4 16v4z"/><path d="m13.5 6.5 4 4"/>',
    copy: '<rect x="8" y="8" width="13" height="13" rx="2"/><path d="M16 8V5a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h3"/>',
    refresh: '<path d="M20 11a8 8 0 0 0-14.6-4.5L3 9M3 4v5h5M4 13a8 8 0 0 0 14.6 4.5L21 15M21 20v-5h-5"/>',
    eye: '<path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/>',
    eyeOff: '<path d="M3 3l18 18M10.6 5.1A10 10 0 0 1 12 5c6.5 0 10 7 10 7a17 17 0 0 1-3.2 4.2M6.6 6.6A17 17 0 0 0 2 12s3.5 7 10 7a9.6 9.6 0 0 0 5.4-1.6M9.9 9.9a3 3 0 0 0 4.2 4.2"/>',
    lock: '<rect x="4.5" y="10.5" width="15" height="10" rx="2.5"/><path d="M8 10.5V7.5a4 4 0 0 1 8 0v3"/>',
    unlock: '<rect x="4.5" y="10.5" width="15" height="10" rx="2.5"/><path d="M8 10.5V7.5a4 4 0 0 1 7.7-1.5"/>',
    upload: '<path d="M12 16V4M7 9l5-5 5 5M4 20h16"/>', download: '<path d="M12 4v12M7 11l5 5 5-5M4 20h16"/>',
    key: '<circle cx="8" cy="15" r="4.5"/><path d="m11.2 11.8 8.3-8.3M16.5 6.5l2.5 2.5M14 9l2 2"/>',
    ban: '<circle cx="12" cy="12" r="9"/><path d="m5.6 5.6 12.8 12.8"/>',
    play: '<path d="M7 4.5v15a1 1 0 0 0 1.5.9l12-7.5a1 1 0 0 0 0-1.8l-12-7.5A1 1 0 0 0 7 4.5z"/>',
    cpu: '<rect x="6" y="6" width="12" height="12" rx="2"/><path d="M9 2v4M15 2v4M9 18v4M15 18v4M2 9h4M2 15h4M18 9h4M18 15h4"/>',
    sliders: '<path d="M4 21v-7M4 10V3M12 21v-9M12 8V3M20 21v-5M20 12V3M1 14h6M9 8h6M17 16h6"/>',
    clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
    image: '<rect x="3" y="4" width="18" height="16" rx="2.5"/><circle cx="9" cy="10" r="2"/><path d="m21 16-5-5-9 9"/>',
    film: '<rect x="3" y="4" width="18" height="16" rx="2.5"/><path d="M7 4v16M17 4v16M3 9h4M3 15h4M17 9h4M17 15h4"/>',
    music: '<path d="M9 18V5l12-2v13"/><circle cx="6" cy="18" r="3"/><circle cx="18" cy="16" r="3"/>',
    sparkles: '<path d="M12 3l1.8 4.7L18.5 9.5l-4.7 1.8L12 16l-1.8-4.7L5.5 9.5l4.7-1.8z"/><path d="M19 15l.8 2.2L22 18l-2.2.8L19 21l-.8-2.2L16 18l2.2-.8z"/>',
    puzzle: '<path d="M10 4a2 2 0 1 1 4 0v2h4v4h2a2 2 0 1 1 0 4h-2v4h-4v-2a2 2 0 1 0-4 0v2H6v-4H4a2 2 0 1 1 0-4h2V6h4z"/>',
    folder: '<path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/>',
    file: '<path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z"/><path d="M14 3v5h5"/>',
    gamepad: '<path d="M7 7h10a5 5 0 0 1 4.9 6l-.6 3.2a2.6 2.6 0 0 1-4.5 1.2L14.5 15h-5l-2.3 2.4a2.6 2.6 0 0 1-4.5-1.2L2.1 13A5 5 0 0 1 7 7z"/><path d="M8 10v3M6.5 11.5h3"/>',
    globe: '<circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3a14 14 0 0 1 0 18M12 3a14 14 0 0 0 0 18"/>',
    info: '<circle cx="12" cy="12" r="9"/><path d="M12 11v5M12 8h.01"/>',
    alert: '<path d="M12 3 2 20h20L12 3z"/><path d="M12 10v4M12 17h.01"/>',
    logout: '<path d="M15 4h3a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2h-3M10 17l-5-5 5-5M5 12h11"/>',
    sun: '<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/>',
    moon: '<path d="M20 14.5A8 8 0 1 1 9.5 4 6.5 6.5 0 0 0 20 14.5z"/>',
    monitor: '<rect x="2" y="3" width="20" height="14" rx="2"/><path d="M8 21h8M12 17v4"/>',
    menu: '<path d="M4 6h16M4 12h16M4 18h16"/>',
    star: '<path d="m12 3 2.8 5.8 6.2.9-4.5 4.4 1 6.2L12 17.4l-5.5 2.9 1-6.2L3 9.7l6.2-.9z"/>',
    crown: '<path d="m3 8 4.5 4L12 5l4.5 7L21 8l-2 11H5z"/>',
    external: '<path d="M15 3h6v6M10 14 21 3M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/>',
    shield: '<path d="M12 3 4 6v6c0 5 3.5 8 8 9 4.5-1 8-4 8-9V6z"/>',
    chart: '<path d="M4 20h16"/><path d="M7 16v-5M12 16V6M17 16v-8"/>',
    list: '<path d="M9 6h11M9 12h11M9 18h11"/><path d="M4.5 6h.01M4.5 12h.01M4.5 18h.01"/>',
    video: '<rect x="2.5" y="6" width="13" height="12" rx="2.5"/><path d="m15.5 10.5 6-3.5v10l-6-3.5"/>',
    camera: '<path d="M4 8h3l2-3h6l2 3h3a1 1 0 0 1 1 1v10a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V9a1 1 0 0 1 1-1z"/><circle cx="12" cy="13.5" r="3.5"/>',
    maximize: '<path d="M8 3H5a2 2 0 0 0-2 2v3M21 8V5a2 2 0 0 0-2-2h-3M3 16v3a2 2 0 0 0 2 2h3M16 21h3a2 2 0 0 0 2-2v-3"/>',
    box: '<path d="m12 3 8 4.5v9L12 21l-8-4.5v-9L12 3z"/><path d="m4 7.5 8 4.5 8-4.5M12 12v9"/>',
    leaf: '<path d="M5 19c0-8 5-14 15-14 0 10-6 15-14 15"/><path d="M5 19 14 10"/>',
    hammer: '<path d="m14 7 6 6-3 3-6-6M11 10l-7 7 3 3 7-7M14 4l3-1 4 4-1 3"/>',
    flame: '<path d="M12 21c-4 0-7-3-7-7 0-4 4-6 4-10 3 2 5 5 5 8 1-1 2-2 2-4 2 2 3 4 3 6 0 4-3 7-7 7z"/>',
    layers: '<path d="m12 3 9 5-9 5-9-5 9-5z"/><path d="m3 13 9 5 9-5"/>',
    discord: '<path fill="currentColor" stroke="none" d="M19.3 5.3A17 17 0 0 0 15 4l-.2.4c1.6.4 2.4 1 3.1 1.6a12 12 0 0 0-11.8 0C6.8 5.4 7.7 4.8 9.2 4.4L9 4a17 17 0 0 0-4.3 1.3C2 9.3 1.3 13.2 1.6 17a17 17 0 0 0 5.2 2.6l1.1-1.7c-.6-.2-1.2-.5-1.8-.9l.4-.3a12.2 12.2 0 0 0 11 0l.4.3c-.6.4-1.2.7-1.8.9l1.1 1.7a17 17 0 0 0 5.2-2.6c.4-4.4-.7-8.2-3.1-11.7zM8.7 14.7c-1 0-1.9-1-1.9-2.2s.8-2.2 1.9-2.2 1.9 1 1.9 2.2-.8 2.2-1.9 2.2zm6.6 0c-1 0-1.9-1-1.9-2.2s.8-2.2 1.9-2.2 1.9 1 1.9 2.2-.8 2.2-1.9 2.2z"/>'
  };
  window.icon = (n) => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">${P[n] || ''}</svg>`;

  // ---------- texto ----------
  const esc = window.esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  window.html = (strings, ...vals) => strings.reduce((a, s, i) => a + s + (i < vals.length ? (vals[i] == null || vals[i] === false ? '' : vals[i]) : ''), '');
  window.$ = (sel, root = document) => root.querySelector(sel);
  window.$$ = (sel, root = document) => [...root.querySelectorAll(sel)];
  window.initials = (n) => esc(String(n || '?').trim().slice(0, 2).toUpperCase());
  window.fmtDate = (ts, opts = { day: 'numeric', month: 'short' }) => ts ? new Date(ts).toLocaleDateString(I18N.locale(), opts) : '—';
  window.fmtDateTime = (ts) => ts ? new Date(ts).toLocaleString(I18N.locale(), { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) : '—';
  window.fmtSize = (b) => !b ? '—' : b < 1024 * 1024 ? `${Math.max(1, Math.round(b / 1024))} KB` : `${(b / 1048576).toFixed(1)} MB`;
  window.timeAgo = (ts) => {
    if (!ts) return '—';
    const s = Math.round((Date.now() - ts) / 1000);
    if (s < 60) return t('ahora mismo');
    if (s < 3600) return t('hace {n} min', { n: Math.floor(s / 60) });
    if (s < 86400) return t('hace {n} h', { n: Math.floor(s / 3600) });
    const d = Math.floor(s / 86400);
    return d === 1 ? t('ayer') : t('hace {n} días', { n: d });
  };
  window.loaderName = (l) => ({ vanilla: 'Vanilla', fabric: 'Fabric', quilt: 'Quilt', forge: 'Forge', neoforge: 'NeoForge' }[(l && l.type) || 'vanilla']);
  window.mediaUrl = (u) => u || '';

  // ---------- API ----------
  window.api = async function (method, path, body, opts = {}) {
    const init = { method, credentials: 'same-origin', headers: {} };
    if (opts.raw) { init.body = opts.raw; init.headers['Content-Type'] = opts.type || 'application/octet-stream'; }
    else if (body !== undefined) { init.body = JSON.stringify(body); init.headers['Content-Type'] = 'application/json'; }
    let res;
    try { res = await fetch('/api' + path, init); } catch { throw Object.assign(new Error(t('No hay conexión con el servidor')), { code: 'offline' }); }
    const data = await res.json().catch(() => ({}));
    if (res.status === 401 && !opts.quiet) { go('/login'); }
    if (!res.ok) throw Object.assign(new Error(t(data.message || 'Algo salió mal')), { code: data.error, status: res.status, data });
    return data;
  };
  window.sapi = (method, path, body, opts) => api(method, `/s/${encodeURIComponent(S.studio.id)}${path}`, body, opts);
  // Subir un archivo: de una vez si es pequeño; en trozos de 20 MB si es grande (hasta 500 MB).
  // onProgress(0..1) se llama mientras sube.
  window.MAX_UPLOAD_MB = 500;
  window.uploadBlob = async (blob, name, type, onProgress) => {
    type = type || blob.type || 'application/octet-stream';
    if (blob.size > MAX_UPLOAD_MB * 1048576) throw new Error(t('El archivo pasa de {n} MB', { n: MAX_UPLOAD_MB }));
    if (blob.size <= 20 * 1048576) {
      const r = await sapi('POST', `/media?name=${encodeURIComponent(name)}`, undefined, { raw: blob, type });
      if (onProgress) onProgress(1);
      return r;
    }
    const up = await sapi('POST', '/media/upload', { name, type, size: blob.size });
    let done = 0, next = 0;
    const one = async () => {
      while (next < up.parts) {
        const n = next++;
        const part = blob.slice(n * up.chunk, Math.min(blob.size, (n + 1) * up.chunk));
        for (let tries = 0; ; tries++) {
          try { await sapi('PUT', `/media/upload/${up.id}/${n}`, undefined, { raw: part, type: 'application/octet-stream' }); break; }
          catch (e) { if (tries >= 2 || e.status === 404) throw e; await new Promise(r => setTimeout(r, 1500 * (tries + 1))); }
        }
        done++;
        if (onProgress) onProgress(done / up.parts * 0.97);
      }
    };
    await Promise.all([one(), one(), one()]); // tres trozos a la vez
    const r = await sapi('POST', `/media/upload/${up.id}/done`);
    if (onProgress) onProgress(1);
    return r;
  };
  window.upload = (file, onProgress) => uploadBlob(file, file.name, file.type, onProgress);
  window.pickFile = (accept) => new Promise((resolve) => {
    const i = document.createElement('input');
    i.type = 'file'; if (accept) i.accept = accept; i.multiple = accept === '*';
    i.onchange = () => resolve(i.multiple ? [...i.files] : i.files[0] || null);
    i.click();
  });
  window.can = (role) => ({ viewer: 1, editor: 2, admin: 3, owner: 4 }[S.studio && S.studio.role] || 0) >= ({ viewer: 1, editor: 2, admin: 3, owner: 4 }[role]);

  // ---------- avisos / ventanas ----------
  window.toast = (msg, type = 'ok') => {
    let box = $('.toasts');
    if (!box) { box = document.createElement('div'); box.className = 'toasts'; document.body.appendChild(box); }
    const el = document.createElement('div');
    el.className = 'toast ' + type;
    el.innerHTML = `${icon(type === 'err' ? 'alert' : 'check')}<span>${esc(msg)}</span>`;
    box.appendChild(el);
    setTimeout(() => { el.style.opacity = '0'; el.style.transition = 'opacity .3s'; setTimeout(() => el.remove(), 300); }, type === 'err' ? 5200 : 3200);
  };
  window.fail = (e) => toast(e && e.message ? e.message : String(e), 'err');
  window.busy = (btn, on) => { if (btn) { btn.classList.toggle('busy', on); btn.disabled = on; } };
  window.copy = async (text) => { try { await navigator.clipboard.writeText(text); toast(t('Copiado')); } catch { prompt(t('Copia esto:'), text); } };

  window.modal = (build, { wide = false, closable = true } = {}) => {
    const back = document.createElement('div');
    back.className = 'backdrop';
    const m = document.createElement('div');
    m.className = 'modal' + (wide ? ' wide' : '');
    back.appendChild(m);
    document.body.appendChild(back);
    const onKey = (e) => { if (e.key === 'Escape' && closable) close(); };
    const close = () => { back.remove(); document.removeEventListener('keydown', onKey); };
    document.addEventListener('keydown', onKey);
    back.addEventListener('mousedown', (e) => { if (e.target === back && closable) close(); });
    build(m, close);
    const f = m.querySelector('input:not([type=checkbox]), textarea');
    if (f) setTimeout(() => f.focus(), 40);
    return close;
  };
  window.confirmBox = ({ title, text, ok = t('Confirmar'), danger = false, ico = 'alert' }) => new Promise((resolve) => {
    modal((m, close) => {
      m.innerHTML = html`<div class="mh"><h3>${icon(ico)}${esc(title)}</h3></div><div class="mb"><p style="margin:0">${esc(text)}</p></div>
        <div class="mf"><button class="btn" data-a="no">${t('Cancelar')}</button><button class="btn ${danger ? 'danger solid' : 'primary'}" data-a="yes">${esc(ok)}</button></div>`;
      m.querySelector('[data-a=no]').onclick = () => { close(); resolve(false); };
      m.querySelector('[data-a=yes]').onclick = () => { close(); resolve(true); };
    });
  });

  // ---------- barra de "Cambios sin guardar" ----------
  window.savebar = ({ onSave, onDiscard }) => {
    let bar = $('.savebar');
    if (!bar) { bar = document.createElement('div'); bar.className = 'savebar'; document.body.appendChild(bar); }
    bar.innerHTML = `<span>${icon('edit')}${t('Cambios sin guardar')}</span><button class="btn sm" data-a="d">${t('Descartar')}</button><button class="btn sm primary" data-a="s">${icon('check')}${t('Guardar')}</button>`;
    const set = (v) => { S.dirty = v ? true : null; bar.classList.toggle('show', !!v); };
    bar.querySelector('[data-a=d]').onclick = () => { set(false); onDiscard && onDiscard(); };
    bar.querySelector('[data-a=s]').onclick = async (e) => {
      busy(e.currentTarget, true);
      try { await onSave(); set(false); toast(t('Cambios guardados')); } catch (err) { fail(err); } finally { busy(e.currentTarget, false); }
    };
    return { set, hide: () => set(false) };
  };
  window.addEventListener('beforeunload', (e) => { if (S.dirty) { e.preventDefault(); e.returnValue = ''; } });

  // ---------- rutas (#/ruta/a/b) ----------
  const go = window.go = (path) => { location.hash = '#' + path; };
  function parse() {
    const h = location.hash.replace(/^#/, '') || '/';
    const [p, q] = h.split('?');
    return { path: p, parts: p.split('/').filter(Boolean), query: new URLSearchParams(q || '') };
  }
  let cleanup = null;
  async function render() {
    if (S.dirty && !(await confirmBox({ title: t('Hay cambios sin guardar'), text: t('Si sales ahora, se perderán.'), ok: t('Salir sin guardar'), danger: true }))) {
      history.back(); return;
    }
    S.dirty = null;
    const bar = $('.savebar'); if (bar) bar.classList.remove('show');
    if (cleanup) { try { cleanup(); } catch { /* nada */ } cleanup = null; }
    const r = S.route = parse();
    const name = r.parts[0] || 'home';
    // Páginas sin estructura
    if (name === 'login') return Views.login(r);
    if (name === 'invite') return Views.invite(r);
    if (!S.me) {
      try { S.me = await api('GET', '/me', undefined, { quiet: true }); }
      catch (e) { if (e.status === 401) return go('/login?next=' + encodeURIComponent(location.hash)); return Views.offline(e); }
    }
    if (!S.me.studios.length) return Views.noStudio();
    const saved = (() => { try { return localStorage.getItem('onyx-studio'); } catch { return null; } })();
    S.studio = S.me.studios.find(s => s.id === (S.studio && S.studio.id)) || S.me.studios.find(s => s.id === saved) || S.me.studios[0];
    renderShell(name);
    const view = $('#view');
    view.innerHTML = '';
    // Studio suspendido por el Creador: solo se puede mirar
    const sb = $('.susp-bar');
    if (sb) sb.remove();
    if (S.studio.suspended) view.insertAdjacentHTML('beforebegin', `<div class="susp-bar">${icon('ban')}<span><b>${esc(t('Este studio está suspendido.'))}</b> ${esc(S.studio.suspendReason ? t('Motivo: {r}', { r: S.studio.suspendReason.replace(/[.\s]+$/, '') }) + '.' : '')} ${esc(t('Puedes mirar, pero no cambiar nada.'))}</span></div>`);
    const fn = Views[name] || Views.notFound;
    try { const c = await fn(view, r); if (typeof c === 'function') cleanup = c; }
    catch (e) { view.innerHTML = `<div class="page"><div class="card empty"><div class="ic">${icon('alert')}</div><h4>${t('No se pudo cargar')}</h4><p>${esc(e.message)}</p></div></div>`; }
  }
  window.rerender = render;
  window.addEventListener('hashchange', render);

  // ---------- estructura ----------
  const NAV = [
    { h: 'Launcher' },
    { id: 'home', i: 'home', t: 'Inicio' },
    { id: 'instances', i: 'grid', t: 'Instancias', match: ['instances', 'instance'] },
    { id: 'events', i: 'calendar', t: 'Eventos' },
    { id: 'launchers', i: 'rocket', t: 'Launchers' },
    { h: 'Jugadores' },
    { id: 'stats', i: 'chart', t: 'Estadísticas' },
    { id: 'guard', i: 'shield', t: 'KopiGuard' },
    { id: 'cameras', i: 'video', t: 'Cámaras' },
    { h: 'Studio' },
    { id: 'team', i: 'users', t: 'Equipo' },
    { id: 'notices', i: 'megaphone', t: 'Avisos' },
    { id: 'activity', i: 'activity', t: 'Actividad', admin: true },
    { id: 'history', i: 'history', t: 'Histórico' },
    { id: 'referrals', i: 'link', t: 'Referidos' },
    { id: 'trash', i: 'trash', t: 'Papelera' },
    { id: 'settings', i: 'settings', t: 'Ajustes' },
    { h: 'Kopi' },
    { id: 'onyx', i: 'crown', t: 'Resumen de Kopi', creator: true },
    { id: 'studios', i: 'building', t: 'Studios', creator: true },
    { id: 'users', i: 'shield', t: 'Usuarios', creator: true },
    { id: 'players', i: 'user', t: 'Jugadores', creator: true },
    { id: 'capes', i: 'sparkles', t: 'Capas de Kopi', creator: true },
    { id: 'broadcast', i: 'megaphone', t: 'Avisos del launcher', creator: true },
    { id: 'moderation', i: 'ban', t: 'Moderación', creator: true },
    { id: 'audit', i: 'history', t: 'Actividad de Kopi', creator: true },
    { id: 'status', i: 'activity', t: 'Estado de los servicios', href: '/status' }
  ];
  window.roleName = (r) => ({ owner: t('Dueño'), admin: t('Administrador'), editor: t('Editor'), viewer: t('Lector') }[r] || r);
  window.userRoleLine = () => S.me.user.role === 'creator' ? t('Creador') : `${roleName(S.studio.role)} · ${S.studio.name}`;

  function renderShell(active) {
    let shell = $('.shell');
    if (!shell) {
      document.body.innerHTML = '<div class="shell"><aside class="side"></aside><div class="main"><header class="top"></header><div id="view"></div></div></div>';
      shell = $('.shell');
    }
    const isCreator = S.me.user.role === 'creator';
    const side = $('.side');
    side.innerHTML = html`
      <div class="brand"><img src="/img/icon.png" alt=""><b>Kopi Panel</b></div>
      <nav class="nav">${NAV.filter(n => (!n.creator || isCreator) && (!n.admin || can('admin'))).map(n => n.h
        ? `<h6>${esc(t(n.h))}</h6>`
        : `<a href="${n.href || '#/' + (n.id === 'home' ? '' : n.id)}" ${n.href ? 'target="_blank" rel="noopener"' : ''} class="${(n.match || [n.id]).includes(active) ? 'on' : ''}">${icon(n.i)}<span>${esc(t(n.t))}</span>${n.soon ? `<span class="soon">${t('Pronto')}</span>` : ''}</a>`).join('')}
      </nav>
      <div class="side-foot">
        <button class="pick" id="studio-pick"><span class="av">${S.studio.logo ? `<img src="${esc(S.studio.logo)}" alt="">` : initials(S.studio.name)}</span>
          <span><small>${t('Studio')}</small><b>${esc(S.studio.name)}</b></span>${S.me.studios.length > 1 ? icon('updown') : ''}</button>
        <a class="pick" href="#/settings"><span class="av" style="border-radius:50%">${S.me.user.avatar ? `<img src="${esc(S.me.user.avatar)}" alt="">` : initials(S.me.user.name)}</span>
          <span><b>${esc(S.me.user.name)}</b><small>${esc(userRoleLine())}</small></span>${icon('chevRight')}</a>
      </div>`;
    $('#studio-pick').onclick = () => {
      if (S.me.studios.length < 2) return;
      modal((m, close) => {
        m.innerHTML = html`<div class="mh"><h3>${icon('building')}${t('Cambiar de studio')}</h3></div><div class="mb" style="display:grid;gap:8px">
          ${S.me.studios.map(s => `<button class="option ${s.id === S.studio.id ? 'on' : ''}" data-s="${esc(s.id)}"><span class="ic">${initials(s.name)}</span><span><b>${esc(s.name)}</b><small>${esc(roleName(s.role))}</small></span><span class="radio"></span></button>`).join('')}</div>`;
        $$('[data-s]', m).forEach(b => b.onclick = () => {
          S.studio = S.me.studios.find(s => s.id === b.dataset.s);
          try { localStorage.setItem('onyx-studio', S.studio.id); } catch { /* nada */ }
          close(); go('/');  render();
        });
      });
    };
    $('.top').innerHTML = html`<button class="btn ghost icon menu-btn" id="menu">${icon('menu')}</button>
      <label class="search">${icon('search')}<input id="q" placeholder="${t('Buscar instancias…')}" autocomplete="off"><kbd>Ctrl K</kbd></label>
      <span class="grow"></span><button class="btn ghost icon" id="reload" title="${t('Actualizar')}">${icon('refresh')}</button>`;
    $('#menu').onclick = () => side.classList.toggle('open');
    side.onclick = (e) => { if (e.target.closest('a')) side.classList.remove('open'); };
    $('#reload').onclick = () => render();
    const q = $('#q');
    q.onkeydown = (e) => { if (e.key === 'Enter') go('/instances?q=' + encodeURIComponent(q.value.trim())); };
  }
  document.addEventListener('keydown', (e) => { if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k' && $('#q')) { e.preventDefault(); $('#q').focus(); } });

  // Arranque
  window.addEventListener('DOMContentLoaded', () => { Theme.apply(); render(); });
})();
