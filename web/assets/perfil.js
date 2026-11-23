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
      common: 'Común', rare: 'Rara', epic: 'Épica', legendary: 'Legendaria', mythic: 'Mítica', watching: '{n} viendo'
    },
    en: {
      kicker: 'Kopi Client player', premium: 'Premium', online: 'Playing now', live: 'Live on {p}',
      hours: 'Hours played', badges: 'Badges', streak: 'Longest streak', since: 'Playing since',
      days: '{n} days', day: '1 day', vitrina: 'Showcase', all: 'All their badges', none: 'No badges yet.',
      copy: 'Copy link', copied: 'Link copied', cape: '{n} cape', of: 'by {s}',
      ctaT: 'Want your own profile?', ctaP: 'Download Kopi Client, play and turn it on in My profile → Your profile on the web.', ctaB: 'Download Kopi Client',
      nfT: 'This profile doesn’t exist or is private', nfP: 'Each player decides whether their profile is shown on the web. If it’s yours, turn it on in the launcher: My profile → Your profile on the web.',
      errT: 'Couldn’t load the profile', errP: 'Try again in a moment.', retry: 'Try again',
      common: 'Common', rare: 'Rare', epic: 'Epic', legendary: 'Legendary', watching: '{n} watching'
    }
  };
  // Insignias de Kopi en inglés (en el panel están en español)
  const BADGE_EN = {"Primer paso": "First step", "Juega 1 hora": "Play 1 hour", "Calentando": "Warming up", "Juega 10 horas": "Play 10 hours", "Veterano": "Veteran", "Juega 100 horas": "Play 100 hours", "Leyenda viva": "Living legend", "Juega 500 horas": "Play 500 hours", "Inmortal": "Immortal", "Juega 1000 horas": "Play 1000 hours", "Racha de 7": "7-day streak", "Juega 7 días seguidos": "Play 7 days in a row", "Imparable": "Unstoppable", "Juega 30 días seguidos": "Play 30 days in a row", "Explorador": "Explorer", "Juega 5 instancias distintas": "Play 5 different instances", "Trotamundos": "Globetrotter", "Juega 15 instancias distintas": "Play 15 different instances", "Juego limpio": "Fair play", "Juega 50 horas con KopiGuard sin ninguna sanción": "Play 50 hours with KopiGuard and no sanctions", "Apoyo a un studio": "Studio supporter", "Elige el studio que te trajo a Kopi": "Pick the studio that brought you to Kopi", "Pionero": "Pioneer", "Empezaste a jugar con Kopi antes de 2027": "You started playing with Kopi before 2027", "Aniversario": "Anniversary", "Un año jugando con Kopi": "One year playing with Kopi", "Noctámbulo": "Night owl", "Juega entre las 3 y las 5 de la madrugada": "Play between 3 and 5 a.m.", "Madrugador": "Early bird", "Juega entre las 5 y las 7 de la mañana": "Play between 5 and 7 a.m.", "Staff de studio": "Studio staff", "Eres staff de una instancia": "You’re staff on an instance", "Beta tester": "Beta tester", "Ayudaste a probar Kopi antes que nadie": "You helped test Kopi before anyone else", "Equipo Kopi": "Kopi Team", "Forma parte del equipo de Kopi": "Part of the Kopi team", "Jugaste el evento mientras estaba en marcha": "You played the event while it was running"};
  const PLAT = { twitch: 'Twitch', tiktok: 'TikTok', kick: 'Kick' };
  const CAPE_EN = { Kopi: 'Kopi', TACHAMANIKA: 'TACHAMANIKA', Vacío: 'Void', Tinta: 'Ink', Aurora: 'Aurora', Fuego: 'Fire' };

  const lang = () => (window.KopiLang === 'en' ? 'en' : 'es');
  const t = (k, v = {}) => (T[lang()][k] || T.es[k] || k).replace(/\{(\w+)\}/g, (_, n) => v[n] ?? '');
  const bt = (s) => (lang() === 'en' && BADGE_EN[s]) || s;
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const fmtNum = (n) => Number(n || 0).toLocaleString(lang(), { maximumFractionDigits: n < 10 ? 1 : 0 });
  const bName = (b) => (b.custom || b.cat === 'event' ? b.name : bt(b.name));
  const bDesc = (b) => (b.custom ? b.desc : bt(b.desc));

  let data, viewer = null, capeTimer = 0;

  function notFound(err) {
    document.title = (err ? t('errT') : t('nfT')) + ' · Kopi Client';
    root.innerHTML = `<section class="pf-vacio"><img src="/img/logo-mark.png" alt="" width="96" height="96">
      <h1>${esc(err ? t('errT') : t('nfT'))}</h1><p>${esc(err ? t('errP') : t('nfP'))}</p>
      <div class="pf-cta-b">${err ? `<button class="btn btn-sec" id="pf-retry">${esc(t('retry'))}</button>` : ''}
        <a class="btn btn-pri" href="/#descargas"><svg><use href="#i-bajar"/></svg>${esc(t('ctaB'))}</a></div></section>`;
    const r = document.getElementById('pf-retry');
    if (r) r.onclick = () => { root.innerHTML = '<div class="pf-carga"><div class="pf-skel pf-skel-card"></div></div>'; load(true); };
  }

  function stat(ico, label, value) {
    return `<div class="pf-stat"><span class="pf-si"><svg><use href="#${ico}"/></svg></span><div><span>${esc(label)}</span><b>${value}</b></div></div>`;
  }

  function render() {
    if (!data) return;
    const p = data;
    document.title = `${p.name} · Kopi Client`;
    const live = p.channels.find(c => c.live);
    const since = p.stats.since ? new Date(p.stats.since).toLocaleDateString(lang(), { month: 'short', year: 'numeric' }) : '—';
    const capeName = p.cape ? (lang() === 'en' ? CAPE_EN[p.cape.name] || p.cape.name : p.cape.name) : '';
    root.innerHTML = `
      <section class="pf-card ${p.cape ? 'r-' + esc(p.cape.rarity) : ''}">
        <div class="pf-glow"></div>
        <div class="pf-3d" id="pf-3d"></div>
        <div class="pf-info">
          <span class="pf-kicker">${esc(t('kicker'))}</span>
          <h1 class="pf-name">${esc(p.name)}</h1>
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
        <img class="pf-brand" src="/img/logo-wordmark.png" alt="Kopi Client" width="1077" height="300">
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
        <img src="/img/logo-mark.png" alt="" width="64" height="64">
        <div><h3>${esc(t('ctaT'))}</h3><p>${esc(t('ctaP'))}</p></div>
        <a class="btn btn-pri" href="/#descargas"><svg><use href="#i-bajar"/></svg>${esc(t('ctaB'))}</a>
      </section>`;

    document.getElementById('pf-copy').onclick = (e) => {
      const b = e.currentTarget;
      navigator.clipboard.writeText(p.url || location.href).then(() => {
        b.lastChild.textContent = t('copied'); b.classList.add('ok');
        setTimeout(() => { b.lastChild.textContent = t('copy'); b.classList.remove('ok'); }, 1800);
      }).catch(() => {});
    };
    mountViewer();
  }

  // La skin en 3D, andando, con la capa de Kopi animada (o la oficial si no lleva de Kopi)
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

  async function load(fresh) {
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
  document.addEventListener('kopi:lang', () => { if (data) render(); });
  load();
})();
