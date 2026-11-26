// Perfil público de un jugador (onyxclient.site/u/<nombre>): su skin en 3D con su capa de Kopi, sus insignias,
// sus horas y sus directos. Los datos vienen del panel (solo si el jugador activó «Perfil público» en el launcher).
// La página ya trae los datos dentro (#pdata, los pone web/worker.js); si no, los pide al panel.
(function () {
  const API = 'https://panel.onyxclient.site';
  const root = document.getElementById('perfil');
  const qs = new URLSearchParams(location.search);
  const name = (location.pathname.match(/^\/u\/([A-Za-z0-9_]{2,16})\/?$/) || [])[1] || qs.get('u') || '';

  const T = {
    es: {
      kicker: 'Jugador de Kopi Client', premium: 'Premium', online: 'Jugando ahora', live: 'En directo en {p}',
      hours: 'Horas jugadas', badges: 'Insignias', streak: 'Racha más larga', since: 'Juega desde',
      days: '{n} días', day: '1 día', vitrina: 'Vitrina', all: 'Todas sus insignias', none: 'Todavía no tiene insignias.',
      copy: 'Copiar enlace', copied: 'Enlace copiado', cape: 'Capa {n}', of: 'de {s}',
      ctaT: '¿Quieres tu propio perfil?', ctaP: 'Descarga Kopi Client, juega y actívalo en Mi perfil → Tu perfil en la web.', ctaB: 'Descargar Kopi Client',
      nfT: 'Este perfil no existe o es privado', nfP: 'Cada jugador decide si su perfil se ve en la web. Si es el tuyo, actívalo en el launcher: Mi perfil → Tu perfil en la web.',
      errT: 'No se pudo cargar el perfil', errP: 'Prueba otra vez en un momento.', retry: 'Reintentar',
      common: 'Común', rare: 'Rara', epic: 'Épica', legendary: 'Legendaria', mythic: 'Mítica', watching: '{n} viendo',
      dl: 'Descargas', web: 'Web', powered: 'Con la tecnología de Kopi Client', aviso: 'Kopi Client no es un producto oficial de Minecraft. No está aprobado ni asociado con Mojang ni con Microsoft.'
    },
    en: {
      kicker: 'Kopi Client player', premium: 'Premium', online: 'Playing now', live: 'Live on {p}',
      hours: 'Hours played', badges: 'Badges', streak: 'Longest streak', since: 'Playing since',
      days: '{n} days', day: '1 day', vitrina: 'Showcase', all: 'All their badges', none: 'No badges yet.',
      copy: 'Copy link', copied: 'Link copied', cape: '{n} cape', of: 'by {s}',
      ctaT: 'Want your own profile?', ctaP: 'Download Kopi Client, play and turn it on in My profile → Your profile on the web.', ctaB: 'Download Kopi Client',
      nfT: 'This profile doesn’t exist or is private', nfP: 'Each player decides whether their profile is shown on the web. If it’s yours, turn it on in the launcher: My profile → Your profile on the web.',
      errT: 'Couldn’t load the profile', errP: 'Try again in a moment.', retry: 'Try again',
      common: 'Common', rare: 'Rare', epic: 'Epic', legendary: 'Legendary', mythic: 'Mythic', watching: '{n} watching',
      dl: 'Downloads', web: 'Website', powered: 'Powered by Kopi Client', aviso: 'Kopi Client is not an official Minecraft product. Not approved by or associated with Mojang or Microsoft.'
    }
  };
  // Insignias de Kopi en inglés (en el panel están en español)
  const BADGE_EN = {"Primer paso": "First step", "Juega 1 hora": "Play 1 hour", "Calentando": "Warming up", "Juega 10 horas": "Play 10 hours", "Veterano": "Veteran", "Juega 100 horas": "Play 100 hours", "Leyenda viva": "Living legend", "Juega 500 horas": "Play 500 hours", "Inmortal": "Immortal", "Juega 1000 horas": "Play 1000 hours", "Racha de 7": "7-day streak", "Juega 7 días seguidos": "Play 7 days in a row", "Imparable": "Unstoppable", "Juega 30 días seguidos": "Play 30 days in a row", "Explorador": "Explorer", "Juega 5 instancias distintas": "Play 5 different instances", "Trotamundos": "Globetrotter", "Juega 15 instancias distintas": "Play 15 different instances", "Juego limpio": "Fair play", "Juega 50 horas con KopiGuard sin ninguna sanción": "Play 50 hours with KopiGuard and no sanctions", "Apoyo a un studio": "Studio supporter", "Elige el studio que te trajo a Kopi": "Pick the studio that brought you to Kopi", "Pionero": "Pioneer", "Empezaste a jugar con Kopi antes de 2027": "You started playing with Kopi before 2027", "Aniversario": "Anniversary", "Un año jugando con Kopi": "One year playing with Kopi", "Noctámbulo": "Night owl", "Juega entre las 3 y las 5 de la madrugada": "Play between 3 and 5 a.m.", "Madrugador": "Early bird", "Juega entre las 5 y las 7 de la mañana": "Play between 5 and 7 a.m.", "Staff de studio": "Studio staff", "Eres staff de una instancia": "You’re staff on an instance", "Beta tester": "Beta tester", "Ayudaste a probar Kopi antes que nadie": "You helped test Kopi before anyone else", "Equipo Kopi": "Kopi Team", "Forma parte del equipo de Kopi": "Part of the Kopi team", "Jugaste el evento mientras estaba en marcha": "You played the event while it was running"};
  const PLAT = { twitch: 'Twitch', tiktok: 'TikTok', kick: 'Kick' };
  const CAPE_EN = { Kopi: 'Kopi', TACHAMANIKA: 'TACHAMANIKA', Vacío: 'Void', Tinta: 'Ink', Aurora: 'Aurora', Fuego: 'Fire' };

  const lang = () => (window.KopiLang === 'en' ? 'en' : 'es');
  // Enlace desde un launcher de marca (?b=nova-launcher): la página sale con el nombre, el logo y los colores de esa marca
  const BID = (qs.get('b') || '').toLowerCase();
  let BR = null;
  const brandP = /^[a-z][a-z0-9-]{1,31}$/.test(BID)
    ? Promise.race([fetch(`${API}/api/public/brands/${BID}`).then(r => (r.ok ? r.json() : null)).then(j => (j && j.brand) || null).catch(() => null), new Promise(r => setTimeout(() => r(null), 4000))])
    : Promise.resolve(null);
  if (/^[a-z][a-z0-9-]{1,31}$/.test(BID)) document.body.classList.add('brand-wait'); // sin enseñar Kopi mientras llega la marca
  const rb = (s) => (BR ? s.replace(/Kopi Client/g, BR.name).replace(/\bKopi\b/g, BR.short) : s);
  const t = (k, v = {}) => (k === 'powered' ? T[lang()][k] : rb(T[lang()][k] || T.es[k] || k)).replace(/\{(\w+)\}/g, (_, n) => v[n] ?? '');
  const LOGO = () => (BR ? BR.logo : '/img/logo-wordmark.png');
  const MARK = () => (BR ? BR.icon : '/img/logo-mark.png');
  const DL = () => (BR ? BR.dl : '/#descargas');
  const bt = (s) => (lang() === 'en' && BADGE_EN[s]) || s;
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const fmtNum = (n) => Number(n || 0).toLocaleString(lang(), { maximumFractionDigits: n < 10 ? 1 : 0 });
  const bName = (b) => (b.custom || b.cat === 'event' ? b.name : bt(b.name));
  const bDesc = (b) => (b.custom ? b.desc : bt(b.desc));

  let data, viewer = null, capeTimer = 0;

  function notFound(err) {
    document.title = (err ? t('errT') : t('nfT')) + ' · ' + (BR ? BR.name : 'Kopi Client');
    root.innerHTML = `<section class="pf-vacio"><img src="${esc(MARK())}" alt="" width="96" height="96">
      <h1>${esc(err ? t('errT') : t('nfT'))}</h1><p>${esc(err ? t('errP') : t('nfP'))}</p>
      <div class="pf-cta-b">${err ? `<button class="btn btn-sec" id="pf-retry">${esc(t('retry'))}</button>` : ''}
        <a class="btn btn-pri" href="${esc(DL())}"><svg><use href="#i-bajar"/></svg>${esc(t('ctaB'))}</a></div></section>`;
    const r = document.getElementById('pf-retry');
    if (r) r.onclick = () => { root.innerHTML = '<div class="pf-carga"><div class="pf-skel pf-skel-card"></div></div>'; load(true); };
  }

  function stat(ico, label, value) {
    return `<div class="pf-stat"><span class="pf-si"><svg><use href="#${ico}"/></svg></span><div><span>${esc(label)}</span><b>${value}</b></div></div>`;
  }

  function render() {
    if (!data) return;
    const p = data;
    document.title = `${p.name} · ${BR ? BR.name : 'Kopi Client'}`;
    const live = p.channels.find(c => c.live);
    const since = p.stats.since ? new Date(p.stats.since).toLocaleDateString(lang(), { month: 'short', year: 'numeric' }) : '—';
    const capeName = p.cape ? (lang() === 'en' ? CAPE_EN[p.cape.name] || p.cape.name : p.cape.name) : '';
    // Marco y fondo de perfil (solo si los dibujos cargaron)
    const LOOK = window.KopiCosmetics && p.look ? { frame: window.KopiCosmetics.getFrame(p.look.frame) ? p.look.frame : null, bg: window.KopiCosmetics.getBg(p.look.bg) ? p.look.bg : null } : {};
    root.innerHTML = `
      <section class="pf-card ${p.cape ? 'r-' + esc(p.cape.rarity) : ''} ${LOOK.bg ? 'has-bg' : ''}">
        ${LOOK.bg ? window.KopiCosmetics.bgLayer(LOOK.bg) : ''}
        <div class="pf-glow"></div>
        <div class="pf-3d" id="pf-3d"></div>
        <div class="pf-info">
          <span class="pf-kicker">${esc(t('kicker'))}</span>
          ${LOOK.frame ? `<div class="pf-namerow">${window.KopiCosmetics.wrap(`<img class="pf-face" id="pf-face" src="${esc(faceFallback(p.name))}" alt="">`, LOOK.frame, 58)}<h1 class="pf-name">${esc(p.name)}</h1></div>` : `<h1 class="pf-name">${esc(p.name)}</h1>`}
          <div class="pf-tags">
            ${p.premium ? `<span class="pf-tag prem"><svg><use href="#i-ok"/></svg>${esc(t('premium'))}</span>` : ''}
            ${p.stats.online ? `<span class="pf-tag on"><i></i>${esc(t('online'))}</span>` : ''}
            ${p.cape ? `<span class="pf-tag cape r-${esc(p.cape.rarity)}">${esc(t('cape', { n: capeName }))}</span>` : ''}
            ${live ? `<a class="pf-tag live" href="${esc(live.url)}" target="_blank" rel="noopener"><i></i>${esc(t('live', { p: PLAT[live.platform] }))}${live.viewers != null ? ` · ${esc(t('watching', { n: fmtNum(live.viewers) }))}` : ''}</a>` : ''}
          </div>
          ${p.showcase.length ? `<div class="pf-vit" aria-label="${esc(t('vitrina'))}">${p.showcase.map(b => `<div class="pf-vb" title="${esc(bDesc(b))}">${Badge.medal({ ...b, earned: true }, 62)}<small>${esc(bName(b))}</small></div>`).join('')}</div>` : ''}
          <div class="pf-stats">
            ${stat('i-reloj', t('hours'), `${fmtNum(p.stats.hours)} h`)}
            ${stat('i-insignia', t('badges'), `${p.badges.length}<small> / ${p.total}</small>`)}
            ${stat('i-fuego', t('streak'), esc(p.stats.streak === 1 ? t('day') : t('days', { n: p.stats.streak || 0 })))}
            ${stat('i-calendario', t('since'), esc(since))}
          </div>
          <div class="pf-links">
            ${p.channels.map(c => `<a class="pf-chan ${c.live ? 'live' : ''}" href="${esc(c.url)}" target="_blank" rel="noopener"><i class="plat ${esc(c.platform)}"></i>${esc(PLAT[c.platform])}<span>${esc(c.platform === 'tiktok' ? '@' + c.handle : c.handle)}</span></a>`).join('')}
            <button class="pf-chan pf-copy" id="pf-copy" type="button"><svg><use href="#i-copiar"/></svg>${esc(t('copy'))}</button>
          </div>
        </div>
        <img class="pf-brand" src="${esc(LOGO())}" alt="${esc(BR ? BR.name : 'Kopi Client')}">
      </section>

      <section class="pf-sec">
        <h2>${esc(t('all'))} <span>${p.badges.length}</span></h2>
        ${p.badges.length ? `<div class="pf-grid">${p.badges.map(b => `<div class="pf-b r-${esc(b.rarity)}" title="${esc(bDesc(b))}">
            ${Badge.medal({ ...b, earned: true }, 58)}
            <b>${esc(bName(b))}</b><span class="pf-r r-${esc(b.rarity)}">${esc(t(b.rarity))}</span>
            ${b.studio ? `<small>${esc(t('of', { s: b.studio }))}</small>` : ''}</div>`).join('')}</div>`
          : `<p class="pf-nada">${esc(t('none'))}</p>`}
      </section>

      <section class="pf-cta">
        <img src="${esc(MARK())}" alt="" width="64" height="64">
        <div><h3>${esc(t('ctaT'))}</h3><p>${esc(t('ctaP'))}</p></div>
        <a class="btn btn-pri" href="${esc(DL())}"><svg><use href="#i-bajar"/></svg>${esc(t('ctaB'))}</a>
      </section>`;

    document.getElementById('pf-copy').onclick = (e) => {
      const b = e.currentTarget;
      navigator.clipboard.writeText(p.url || location.href).then(() => {
        b.lastChild.textContent = t('copied'); b.classList.add('ok');
        setTimeout(() => { b.lastChild.textContent = t('copy'); b.classList.remove('ok'); }, 1800);
      }).catch(() => {});
    };
    mountViewer();
    paintFace(p.skin && p.skin.url);
  }

  // La skin en 3D, andando, con la capa de Kopi animada (o la oficial si no lleva de Kopi)
  const faceFallback = (n) => `https://mc-heads.net/avatar/${encodeURIComponent(n)}/64`;
  // La cara (8×8 + la capa de encima) sacada de su skin, para el marco
  function paintFace(url) {
    const el = document.getElementById('pf-face');
    if (!el || !url) return;
    const im = new Image();
    im.crossOrigin = 'anonymous';
    im.onload = () => {
      try {
        const cv = document.createElement('canvas'); cv.width = cv.height = 64;
        const c = cv.getContext('2d'); c.imageSmoothingEnabled = false;
        c.drawImage(im, 8, 8, 8, 8, 0, 0, 64, 64);
        c.drawImage(im, 40, 8, 8, 8, 0, 0, 64, 64);
        el.src = cv.toDataURL();
      } catch { /* se queda la de mc-heads */ }
    };
    im.src = url;
  }
  function mountViewer() {
    const box = document.getElementById('pf-3d');
    if (viewer) { clearInterval(capeTimer); try { viewer.destroy(); } catch { /* nada */ } }
    try {
      viewer = new Skin3D.SkinViewer(box, { scale: 7, rotY: -30, rotX: -4, walk: true, zoom: 0.82 });
      viewer.setSkin(data.skin ? data.skin.url : Skin3D.DEFAULT_DATA, data.skin && data.skin.slim ? 'slim' : 'classic');
      const kc = data.cape && window.KopiCapes && KopiCapes.get(data.cape.id);
      if (kc) {
        let f = 0;
        const show = () => viewer.setCape(KopiCapes.texture(kc, f++).toDataURL());
        show();
        if (kc.frames > 1) capeTimer = setInterval(show, 1000 / kc.fps);
      } else if (data.cape && data.cape.texture) viewer.setCape(data.cape.texture);
    } catch { box.innerHTML = `<img class="pf-flat" src="${esc(data.skin ? data.skin.url : '')}" alt="">`; }
  }

  const hex = (h) => { const n = parseInt(String(h).replace('#', ''), 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255]; };
  const lum = ([r, g, b]) => (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;
  function setBrand(b) {
    const short = b.name.replace(/\s+(launcher|client|cliente|mc|minecraft|studios?)$/i, '').trim() || b.name;
    BR = { id: b.id, name: b.name, short, studio: b.studioName || b.name, logo: b.logo || b.icon || '/img/logo-wordmark.png', icon: b.icon || b.logo || '/img/logo-mark.png',
      dl: `${API}/l?${b.id}`, discord: /^https:\/\//.test(b.discord || '') ? b.discord : null, web: /^https:\/\//.test(b.web || '') ? b.web : null };
    const ok = (c) => /^#[0-9a-f]{6}$/i.test(c || '');
    const a = hex(ok(b.accent) ? b.accent : '#f58ee0');
    // el segundo color, cerca del primero (blanco + negro daría un degradado feo), como en el launcher
    let a2 = ok(b.accent2) ? hex(b.accent2) : null;
    if (!a2 || Math.abs(lum(a) - lum(a2)) > 0.35) a2 = a.map(v => Math.round(v * 0.74));
    const st = document.body.style;
    st.setProperty('--ba', `rgb(${a.join(' ')})`); st.setProperty('--ba2', `rgb(${a2.join(' ')})`); st.setProperty('--bk', a.join(' '));
    st.setProperty('--on', lum(a) > 0.6 ? '#121214' : '#ffffff');
    document.body.classList.add('brand');
    const fav = document.querySelector('link[rel="icon"]'); if (fav) fav.href = BR.icon;
  }
  // Cabecera y pie con la marca (se vuelven a pintar al cambiar de idioma)
  function paintChrome() {
    if (!BR) return;
    const links = () => [`<a href="${esc(BR.dl)}">${esc(t('dl'))}</a>`, BR.discord ? `<a href="${esc(BR.discord)}" target="_blank" rel="noopener">Discord</a>` : '', BR.web ? `<a href="${esc(BR.web)}" target="_blank" rel="noopener">${esc(t('web'))}</a>` : ''].join('');
    const top = document.querySelector('.top');
    if (top) {
      const nav = top.querySelector('.top-nav');
      if (nav) nav.innerHTML = links();
      const lg = top.querySelector('.top-logo');
      if (lg) { lg.href = BR.dl; lg.setAttribute('aria-label', BR.name); lg.innerHTML = `<img src="${esc(BR.logo)}" alt="${esc(BR.name)}">`; }
      const bt = top.querySelector('.top-right .btn');
      if (bt) { bt.removeAttribute('data-dl'); bt.href = BR.dl; bt.removeAttribute('title'); const sp = bt.querySelector('span'); if (sp) { sp.removeAttribute('data-t'); sp.textContent = t('ctaB'); } }
    }
    const foot = document.querySelector('.foot');
    if (foot) foot.innerHTML = `<div class="foot-in"><div class="foot-brand"><img src="${esc(BR.logo)}" alt="${esc(BR.name)}"></div>
      <div class="foot-cols"><div><h4>${esc(BR.name)}</h4>${links()}</div></div></div>
      <div class="foot-bottom"><span>© ${new Date().getFullYear()} ${esc(BR.studio)} · ${esc(t('powered'))}</span><span>${esc(t('aviso'))}</span></div>`;
  }

  async function load(fresh) {
    if (!BR) { const b = await brandP; if (b && b.name) { setBrand(b); paintChrome(); } requestAnimationFrame(() => document.body.classList.remove('brand-wait')); }
    if (!name) return notFound();
    const el = document.getElementById('pdata');
    if (el && !fresh) {
      try { data = JSON.parse(el.textContent); } catch { data = null; }
      if (data && data.name) return render();
      if (data === null) return notFound();
    }
    try {
      const r = await fetch(`${API}/api/public/player/${encodeURIComponent(name)}`);
      if (r.status === 404) return notFound();
      if (!r.ok) throw new Error(r.status);
      data = await r.json();
      render();
    } catch { notFound(true); }
  }

  // Al cambiar de idioma se vuelve a pintar (sin perder la skin)
  document.addEventListener('kopi:lang', () => { paintChrome(); if (data) render(); });
  load();
})();
