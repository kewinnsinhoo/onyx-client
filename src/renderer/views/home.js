// Inicio, lista de instancias y página de instancia.
(function () {
  const { esc, html, toast, busy } = UI;
  const V = window.Views = window.Views || {};
  const shownNews = new Set(); // instancias cuyas novedades ya se enseñaron solas en esta sesión

  function loaderLabel(l, withVersion) {
    const type = (l && l.type) || 'vanilla';
    const name = { vanilla: 'Vanilla', fabric: 'Fabric', quilt: 'Quilt', forge: 'Forge', neoforge: 'NeoForge' }[type] || type;
    return withVersion && l && l.version && !['latest', 'recommended'].includes(l.version) ? `${name} ${l.version}` : name;
  }
  function initials(name) { return esc(String(name || '?').trim().slice(0, 2).toUpperCase()); }
  const isVideo = (u) => /\.(webm|mp4)(\?|$)/i.test(String(u || ''));
  const cssUrl = (u) => `url('${String(u).replace(/['\\]/g, '\\$&')}')`;
  const okColor = (c) => /^#[0-9a-f]{6}$/i.test(String(c || '')) ? c : null;
  function fmtWhen(ms) {
    return new Date(ms).toLocaleString(I18N.locale(), { weekday: 'long', day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit' });
  }
  function musicMuted() { try { return localStorage.getItem('onyx-music-muted') === '1'; } catch { return false; } }
  function setMusicMuted(v) { try { localStorage.setItem('onyx-music-muted', v ? '1' : '0'); } catch { /* nada */ } }
  // Estado según el panel: bloqueada, aún no abre, cerrada
  function rawState(i) {
    const now = Date.now(), sc = i.schedule || {};
    if (i.state === 'locked') return { k: 'locked', label: t('Bloqueada'), cls: 'danger' };
    if (sc.opensAt && now < sc.opensAt) return { k: 'soon', label: t('Abre el {date}', { date: fmtWhen(sc.opensAt) }), short: t('Próximamente'), cls: 'warn' };
    if (sc.closesAt && now > sc.closesAt) return { k: 'closed', label: t('Cerrada'), cls: 'danger' };
    return null;
  }
  // El staff de la instancia entra igual: se avisa del estado, pero puede jugar
  function stateOf(i) {
    const st = rawState(i);
    return st && i.staff ? { ...st, staff: true, cls: 'staff', short: t('Staff') } : st;
  }
  const blocks = (st) => !!st && !st.staff;

  // Estado de una instancia: sin progreso, preparando o jugando.
  function modeOf(id) {
    const p = S.progress[id];
    return !p ? 'idle' : p.stage === 'running' ? 'running' : 'progress';
  }
  // Escucha el progreso sin redibujar toda la página (evita parpadeos).
  function smoothProgress(render, update) {
    const modes = {};
    let frame = 0;
    const onP = (e) => {
      const id = e.detail && e.detail.id;
      const now = id ? modeOf(id) : null;
      if (!id || modes[id] !== now) { if (id) modes[id] = now; document.getElementById('view').dataset.still = '1'; render(); return; }
      if (!frame) frame = requestAnimationFrame(() => { frame = 0; update(id); });
    };
    document.addEventListener('onyx:progress', onP);
    return () => { cancelAnimationFrame(frame); document.removeEventListener('onyx:progress', onP); };
  }


  // ---------------- Inicio ----------------
  // El logo del studio en grande, con brillo, y un botón JUGAR abajo (como un menú de juego).
  const PICK = 'kopi.homePick';
  function homePick() {
    let id = null;
    try { id = localStorage.getItem(PICK); } catch { /* nada */ }
    const list = S.instances;
    return list.find(i => i.id === id) || list.slice().sort((a, b) => (b.lastPlayed || 0) - (a.lastPlayed || 0))[0] || null;
  }
  function homeLogo() {
    const b = S.info.brand;
    if (!b) return `<img class="kp-logo" src="assets/logo-studio.png" alt="Kopi Studio">`;
    return b.logo ? `<img class="kp-logo" src="${esc(b.logo)}" alt="${esc(b.name)}">` : `<div class="kp-logo kp-logo-text">${esc(b.name)}</div>`;
  }
  V.home = function (root) {
    const render = () => {
      const cur = homePick();
      const p = cur && S.progress[cur.id];
      const st = cur && stateOf(cur);
      root.innerHTML = html`<div class="kp-home">
        <i class="kp-glow"></i><i class="kp-stars"></i>
        <div class="kp-center">${homeLogo()}</div>
        <div class="kp-bottom">
          ${cur ? html`
            <button class="kp-pick" id="kp-pick" title="${t('Cambiar instancia')}">
              <span class="ic" style="${cur.icon || cur.banner ? `background-image:url('${esc(cur.icon || cur.banner)}')` : ''}">${cur.icon || cur.banner ? '' : initials(cur.name)}</span>
              <span class="tx"><b>${esc(cur.name)}</b><small>${p ? esc(App.stageText(p)) : st ? esc(st.short || st.label) : `${esc(cur.minecraft || '')} · ${loaderLabel(cur.loader)}`}</small></span>
              ${S.instances.length > 1 ? icon('chevronDown') : ''}
            </button>
            <button class="kp-play ${p ? 'busy' : ''}" id="kp-play">${p ? icon('refresh', 'spin') : ''}<span>${p ? (p.stage === 'running' ? t('Jugando') : t('Preparando...')) : t('Jugar')}</span></button>`
          : html`<p class="kp-hint">${t('Añade una instancia con el código que te dé tu studio.')}</p>
            <button class="kp-play" id="kp-add">${icon('plus')}<span>${t('Añadir instancia')}</span></button>`}
        </div>
      </div>`;
      const play = root.querySelector('#kp-play');
      if (play) play.onclick = () => { if (!S.progress[cur.id]) App.play(cur.id); };
      const add = root.querySelector('#kp-add');
      if (add) add.onclick = App.addInstanceModal;
      const pick = root.querySelector('#kp-pick');
      if (pick) pick.onclick = (e) => {
        if (S.instances.length < 2) return App.go('instance', { id: cur.id });
        UI.dropdown(e.currentTarget, (dd, close) => {
          dd.innerHTML = html`<div class="dd-title">${t('Cambiar instancia')}</div>${S.instances.map(i => html`<button class="dd-item ${i.id === cur.id ? 'on' : ''}" data-pick="${esc(i.id)}">
            <span class="ic" style="${i.icon || i.banner ? `background-image:url('${esc(i.icon || i.banner)}')` : ''}">${i.icon || i.banner ? '' : initials(i.name)}</span>${esc(i.name)}</button>`).join('')}`;
          dd.querySelectorAll('[data-pick]').forEach(b => b.onclick = () => { try { localStorage.setItem(PICK, b.dataset.pick); } catch { /* nada */ } close(); render(); });
        }, { align: 'left', width: 280 });
      };
    };
    render();
    return smoothProgress(render, () => render());
  };

  // ---------------- Todas las instancias ----------------
  function tile(i) {
    const p = S.progress[i.id], st = stateOf(i), img = i.banner || i.icon;
    return html`<button class="kp-tile" data-id="${esc(i.id)}">
      <span class="img" style="${img ? `background-image:url('${esc(img)}')` : ''}">${img ? '' : `<b>${initials(i.name)}</b>`}
        ${p ? `<span class="badge accent">${icon(p.stage === 'running' ? 'play' : 'refresh', p.stage === 'running' ? '' : 'spin')}${esc(App.stageText(p))}</span>`
          : st ? `<span class="badge ${st.cls}">${icon(st.staff ? 'crown' : st.k === 'soon' ? 'clock' : 'lock')}${esc(st.short || st.label)}</span>` : i.premium ? `<span class="badge premium">${icon('lock')}Premium</span>` : ''}</span>
      <span class="nm">${esc(i.name)}</span>
      <span class="mt">${esc(i.minecraft || '')} · ${loaderLabel(i.loader)}</span>
    </button>`;
  }
  V.instances = function (root) {
    let q = '';
    const render = () => {
      const match = (i) => !q || i.name.toLowerCase().includes(q) || String(i.category || '').toLowerCase().includes(q);
      const all = S.instances.filter(match);
      const open = all.filter(i => !blocks(stateOf(i))), wait = all.filter(i => blocks(stateOf(i)));
      const kept = root.querySelector('#kp-q');
      const focus = kept && document.activeElement === kept;
      root.innerHTML = html`<div class="kp-list">
        <div class="kp-bar"><span class="lbl">${t('Instancias')}</span>
          <label class="kp-search">${icon('search')}<input id="kp-q" placeholder="${t('Buscar')}" value="${esc(q)}" spellcheck="false" autocomplete="off"></label>
          <button class="btn btn-primary btn-sm" id="i-add">${icon('key')}${t('Añadir con código')}</button></div>
        <div class="page">
          <h1 class="kp-h">${t('Instancias <em>disponibles</em>')}</h1>
          ${open.length ? `<div class="kp-grid">${open.map(tile).join('')}</div>`
          : html`<div class="kp-empty">${q ? t('No hay resultados para «{q}».', { q: esc(q) }) : t('Aún no tienes instancias. Pídele un código a tu studio y añádelo aquí.')}</div>`}
          ${wait.length ? html`<h1 class="kp-h kp-h2">${t('Instancias <em>en espera</em>')}</h1><div class="kp-grid">${wait.map(tile).join('')}</div>` : ''}
        </div>
      </div>`;
      root.querySelector('#i-add').onclick = App.addInstanceModal;
      root.querySelectorAll('.kp-tile').forEach(b => b.onclick = () => App.go('instance', { id: b.dataset.id }));
      const inp = root.querySelector('#kp-q');
      inp.oninput = () => { q = inp.value.trim().toLowerCase(); render(); };
      if (focus) { inp.focus(); inp.setSelectionRange(inp.value.length, inp.value.length); }
    };
    render();
    return smoothProgress(render, () => render());
  };

  function fmtTime(ms) {
    const h = Math.floor(ms / 3600e3), m = Math.floor((ms % 3600e3) / 60e3);
    return h ? `${h} h ${m} min` : `${m} min`;
  }

  // ---------------- Página de una instancia ----------------
  V.instance = function (root, { id }) {
    let inst = S.instances.find(i => i.id === id);
    if (!inst) { App.go('instances'); return; }
    let status = undefined; // undefined = cargando, null = sin servidor
    let alive = true;

    // Música de ambiente que pone el studio (se puede silenciar; se recuerda)
    let audio = null;
    function syncMusic() {
      const m = inst.look && inst.look.music;
      const p = S.progress[id];
      const want = alive && m && m.url && !musicMuted() && !(p && p.stage === 'running');
      if (!want) { if (audio) audio.pause(); return; }
      if (!audio || audio.dataset.src !== m.url) {
        if (audio) audio.pause();
        audio = new Audio(m.url);
        audio.dataset.src = m.url;
      }
      audio.loop = m.loop !== false;
      audio.volume = Math.max(0, Math.min(1, (m.volume == null ? 40 : m.volume) / 100));
      if (audio.paused) audio.play().catch(() => {});
    }

    // Directos: quién está emitiendo esta instancia ahora (y «estoy en directo en TikTok» si juegas)
    let live = [], myCh = null;
    const PLATN = { twitch: 'Twitch', tiktok: 'TikTok', kick: 'Kick' };
    const fmtViewers = (n) => n >= 1000 ? (n / 1000).toFixed(n >= 10000 ? 0 : 1).replace('.0', '') + 'K' : String(n);
    function paintLive() {
      const box = root.querySelector('#ins-live');
      if (!box) return;
      const p = S.progress[id];
      const running = p && p.stage === 'running';
      const tk = myCh && myCh.channels && myCh.channels.tiktok;
      const tkOn = !!(myCh && (myCh.manual || []).includes('tiktok'));
      if (!live.length && !(running && tk)) { box.innerHTML = ''; box.hidden = true; return; }
      box.hidden = false;
      box.innerHTML = html`<div class="live-h"><span class="live-pulse"></span><b>${t('En directo ahora')}</b>${live.length ? `<span class="live-n">${live.length}</span>` : ''}
          <span class="grow"></span>
          ${running && tk ? `<button class="btn btn-sm ${tkOn ? 'btn-primary' : 'btn-ghost'}" id="live-tk"><i class="plat-dot tiktok"></i>${tkOn ? t('Estás en directo en TikTok') : t('Estoy en directo en TikTok')}</button>` : ''}</div>
        ${live.length ? html`<div class="live-row">${live.map((x, n) => html`<button class="live-card" data-live="${n}" title="${esc(x.url)}">
            <span class="lc-thumb ${x.thumb ? '' : 'none'}" style="${x.thumb ? `background-image:${esc(cssUrl(x.thumb))}` : ''}">
              <span class="lc-live">${t('EN DIRECTO')}</span>${x.viewers != null ? `<span class="lc-v">${icon('eye')}${fmtViewers(x.viewers)}</span>` : ''}
              <span class="lc-go">${icon('external')}</span></span>
            <span class="lc-body"><i class="plat-dot ${x.platform}"></i><span class="lc-tx"><b>${esc(x.official ? t('Canal oficial') : x.name || x.handle)}</b>
              <small>${PLATN[x.platform]} · ${esc(x.handle)}</small>${x.title ? `<em>${esc(x.title)}</em>` : ''}</span></span></button>`).join('')}</div>`
          : `<p class="live-empty">${t('Si emites, pulsa el botón para salir aquí y en el panel del studio.')}</p>`}`;
      box.querySelectorAll('[data-live]').forEach(b => { b.onclick = () => onyx.app.openExternal(live[Number(b.dataset.live)].url); });
      const tb = box.querySelector('#live-tk');
      if (tb) tb.onclick = async () => {
        busy(tb, true);
        try { myCh = await onyx.streams.markLive('tiktok', !tkOn); toast(tkOn ? t('Ya no sales en directo') : t('Sales en directo en la instancia'), 'success'); await loadLive(); }
        catch (e) { toast(t(e.message, e.vars), 'error'); busy(tb, false); }
      };
    }
    async function loadLive() {
      try { live = await onyx.streams.live(id) || []; } catch { live = []; }
      if (alive) paintLive();
    }

    const playersText = () => {
      if (!inst.server) return '—';
      if (status === undefined) return t('Comprobando...');
      if (!status || status.offline) return t('Sin conexión');
      return `<span class="dot"></span>${status.online} / ${status.max}`;
    };

    const render = () => {
      inst = S.instances.find(i => i.id === id) || inst;
      const p = S.progress[id];
      const pct = p && p.total ? Math.round((p.done / p.total) * 100) : null;
      const running = p && p.stage === 'running';
      const studio = inst.studio || { name: S.info.studio };
      const paragraphs = String(inst.about || inst.description || '').split(/\n\s*\n|\n/).filter(Boolean);
      const look = inst.look || {};
      const st = stateOf(inst);
      // Bloqueada o aún sin abrir, pero el studio deja descargarla antes
      const pre = !!(blocks(st) && (st.k === 'locked' || st.k === 'soon') && inst.schedule && inst.schedule.predownload);
      const pill = st ? (st.staff ? (st.k === 'locked' ? t('Bloqueada · entras como staff') : st.k === 'closed' ? t('Cerrada · entras como staff') : t('Sin abrir · entras como staff'))
        : st.k === 'locked' ? t('Instancia bloqueada') : st.k === 'closed' ? t('Instancia cerrada') : st.label) : '';
      const bg = inst.bannerAnimated && !isVideo(inst.bannerAnimated) ? inst.bannerAnimated : inst.banner;
      const logo = inst.logoAnimated || inst.logo;
      const accent = okColor(look.accent), playColor = okColor(look.playColor);
      const vars = [accent ? `--inst-accent:${accent}` : '', playColor ? `--inst-play:${playColor}` : ''].filter(Boolean).join(';');
      root.innerHTML = html`<div class="page inst-page" style="${vars}">
        <div class="ihero ${look.vignette === false ? 'no-vig' : ''} ${playColor ? 'has-play' : ''}" style="${bg ? `background-image:${esc(cssUrl(bg))}` : ''}">
          ${isVideo(inst.bannerAnimated) ? `<video class="ihero-video" src="${esc(inst.bannerAnimated)}" muted autoplay loop playsinline></video>` : ''}
          ${look.snow ? `<div class="snow" aria-hidden="true">${Array.from({ length: 36 }, (_, n) => `<i style="left:${(n * 37) % 100}%;animation-delay:-${(n * 0.83) % 9}s;animation-duration:${7 + (n % 5)}s;opacity:${0.35 + (n % 4) * 0.15}"></i>`).join('')}</div>` : ''}
          <div class="top">
            ${look.hideAuthor ? '' : `<div class="studio">${studio.logo ? `<img src="${esc(studio.logo)}" alt="">` : `<span class="ph">${initials(studio.name)}</span>`}
              <span>${t('por')} <b>${esc(studio.name || '')}</b></span></div>`}
            <div class="grow"></div>
            ${st ? `<span class="state-pill ${st.cls}">${icon(st.staff ? 'crown' : st.k === 'soon' ? 'clock' : 'lock')}${esc(pill)}</span>` : ''}
            ${look.music && look.music.url ? `<button class="round" id="ins-music" title="${t('Música')}">${icon(musicMuted() ? 'volumeOff' : 'volume')}</button>` : ''}
            <button class="round sq" id="ins-more" title="${t('Más opciones')}">${icon('more')}</button>
          </div>
          <div class="bottom">
            <div class="big-icon" style="${inst.iconAnimated || inst.icon ? `background-image:${esc(cssUrl(inst.iconAnimated || inst.icon))}` : ''}">${inst.iconAnimated || inst.icon ? '' : icon('box')}</div>
            <div class="grow" style="min-width:0">
              ${logo && !look.hideTitle ? `<img class="ihero-logo" src="${esc(logo)}" alt="${esc(inst.name)}">` : look.hideTitle ? '' : `<h1>${esc(inst.name)}</h1>`}
              <div class="tags">
                ${inst.category ? `<span class="badge">${esc(inst.category)}</span>` : ''}
                ${inst.premium ? `<span class="badge premium">${icon('lock')}Premium</span>` : `<span class="badge accent">${icon('user')}${t('Premium y offline')}</span>`}
                ${inst.server && inst.server.address && !look.hideTech ? `<span class="badge">${icon('globe')}${esc(inst.server.address)}</span>` : ''}
                ${inst.guard ? `<span class="badge guard" title="${t('Este studio usa KopiGuard: mientras juegas, el launcher comprueba que no haya trampas, y el studio puede ver en directo la ventana del juego.')}">${icon('shield')}KopiGuard</span>` : ''}
                ${(inst.news || []).length ? `<button class="badge news-b ${App.unseenNews(inst) ? 'new' : ''}" id="ins-news">${icon('megaphone')}${t('Novedades')}${App.unseenNews(inst) ? `<i>${App.unseenNews(inst)}</i>` : ''}</button>` : ''}
                ${inst.perfMode ? `<span class="badge perf" title="${t('Modo rendimiento')}">${icon('zap')}${t('Rendimiento')}</span>` : ''}
                ${inst.friendsMode ? `<button class="badge friends" id="ins-friends-b" title="${t('Jugar con amigos')}">${icon('users')}${t('Con amigos')}</button>` : ''}
              </div>
            </div>
            ${running
              ? `<button class="play-big stop" id="ins-stop">${icon('stop')}${t('Detener')}</button>`
              : pre ? '' : `<button class="play-big" id="ins-play" ${p ? 'disabled' : ''}>${p ? icon('refresh', 'spin') : icon('play')}${p ? t('Preparando...') : t('Jugar')}</button>`}
          </div>
          ${!p && S.bg && S.bg[id] ? html`<div class="bg-upd" title="${t('El launcher descarga lo nuevo de la instancia para que al darle a Jugar no tengas que esperar.')}">
            <span class="spin-dot"></span><span>${t('Poniéndose al día en segundo plano')}${S.bg[id].total ? ` · <b id="bg-pct">${Math.round((S.bg[id].done / S.bg[id].total) * 100)}%</b>` : ''}</span></div>` : ''}
          ${running && S.friends && S.friends[id] ? html`<div class="friends-live">
            <span class="fl-ico">${icon('globe')}</span>
            <div class="fl-txt"><span>${t('Tu mundo está abierto. Pasa esta dirección a tus amigos:')}</span><b id="fl-addr">${esc(S.friends[id])}</b></div>
            <button class="btn btn-primary btn-sm" id="fl-copy">${icon('copy')}${t('Copiar')}</button></div>` : ''}
          ${p && !running ? html`<div class="prog"><div class="progress"><i id="ins-bar" style="width:${pct == null ? 8 : pct}%"></i></div>
            <div class="progress-label"><span id="ins-stage">${esc(App.stageText(p))}</span><span id="ins-pct">${pct == null ? '' : pct + '%'}</span></div></div>` : ''}
        </div>
        ${st && st.k === 'locked' && inst.lockedMessage ? html`<div class="card inst-note">${icon('lock')}<span>${esc(inst.lockedMessage)}</span></div>` : ''}
        ${pre && !running ? html`<div class="pre-wrap">
          <div class="pre-card">
            <span class="pre-ico">${icon('download')}</span>
            <div><b>${t('Pre-descarga abierta')}</b>
              <p>${st.k === 'soon' ? t('Descárgala ya para no esperar colas el día del evento. Abre el {date}.', { date: fmtWhen(inst.schedule.opensAt) }) : t('Descárgala ya para no esperar colas el día del evento. Podrás jugar cuando el studio la abra.')}</p></div>
          </div>
          <button class="btn btn-outline pre-btn" id="ins-play" ${p ? 'disabled' : ''}>${p ? icon('refresh', 'spin') : icon('download')}${p ? t('Descargando...') : t('Descargar ya')}</button>
          <div class="pre-hint">${t('Descarga los archivos antes de la apertura.')}</div>
        </div>` : ''}

        <div class="card ins-live" id="ins-live" hidden></div>

        <div class="stats">
          ${look.hideTech ? '' : html`<div class="stat"><span class="si">${icon('cpu')}</span><div><div class="k">${t('Versión')}</div><div class="v">${esc(inst.minecraft || '?')}</div></div></div>
          <div class="stat"><span class="si">${icon('sliders')}</span><div><div class="k">Loader</div><div class="v">${esc(loaderLabel(inst.loader, true))}</div></div></div>`}
          <div class="stat"><span class="si">${icon('users')}</span><div><div class="k">${t('Jugadores')}</div><div class="v" id="ins-players">${playersText()}</div></div></div>
          <div class="stat"><span class="si">${icon('clock')}</span><div><div class="k">${t('Tiempo jugado')}</div><div class="v">${fmtTime(inst.playTime || 0)}</div></div></div>
        </div>

        ${paragraphs.length || (look.sponsor && look.sponsor.name) ? html`<div class="inst-lower">
          ${paragraphs.length ? html`<div class="card about-inst"><h3>${t('Sobre esta instancia')}</h3>${paragraphs.map(x => `<p>${esc(x)}</p>`).join('')}</div>` : '<div></div>'}
          ${look.sponsor && look.sponsor.name ? html`<button class="card sponsor" id="ins-sponsor" ${look.sponsor.url ? '' : 'disabled'}>
            <span class="k">${t('Patrocinado por')}</span>
            ${look.sponsor.logo ? `<img src="${esc(look.sponsor.logo)}" alt="">` : ''}<b>${esc(look.sponsor.name)}</b>
            ${look.sponsor.url ? `<span class="go">${icon('external')}</span>` : ''}</button>` : ''}
        </div>` : ''}
      </div>`;

      const b = (s) => root.querySelector(s);
      if (b('#ins-play')) b('#ins-play').onclick = () => App.play(id);
      if (b('#ins-news')) b('#ins-news').onclick = () => App.newsModal(id);
      if (b('#ins-friends-b')) b('#ins-friends-b').onclick = friendsModal;
      if (b('#fl-copy')) b('#fl-copy').onclick = () => { navigator.clipboard.writeText(S.friends[id]).then(() => toast(t('Dirección copiada'), 'success')).catch(() => {}); };
      // Novedades sin ver: se enseñan solas una vez al abrir la instancia (no mientras se juega)
      if (App.unseenNews(inst) && !running && !p && !document.querySelector('.news-modal') && !shownNews.has(id)) {
        shownNews.add(id);
        setTimeout(() => { if (S.route && S.route.name === 'instance' && S.route.params.id === id) App.newsModal(id); }, 450);
      }
      if (b('#ins-stop')) b('#ins-stop').onclick = () => onyx.instances.stop(id);
      if (b('#ins-music')) b('#ins-music').onclick = () => { setMusicMuted(!musicMuted()); syncMusic(); render(); };
      if (b('#ins-sponsor') && look.sponsor && look.sponsor.url) b('#ins-sponsor').onclick = () => onyx.app.openExternal(look.sponsor.url);
      syncMusic();
      paintLive();
      b('#ins-more').onclick = (e) => menu(e.currentTarget);
    };

    // Modo rendimiento: mods que hacen que el juego vaya más fluido (solo en este ordenador)
    // Jugar con amigos: abre tu mundo por internet (sin tocar el router) o entra al de un amigo
    function friendsModal() {
      const can = ['fabric', 'forge', 'neoforge', 'quilt'].includes((inst.loader && inst.loader.type) || 'vanilla');
      const on = !!inst.friendsMode;
      const steps = [[t('Activa «Jugar con amigos» aquí'), t('El launcher añade lo necesario a esta instancia. Solo en tu ordenador.')],
        [t('Entra a tu mundo y pulsa «Abrir en LAN»'), t('Pulsa Esc dentro del mundo. Si tus amigos no son premium, pon «Online Mode» en OFF.')],
        [t('Pasa la dirección a tus amigos'), t('El launcher la copia sola y te la enseña aquí. Ellos la ponen en «Conexión directa».')]];
      UI.modal((m, close) => {
        m.classList.add('friends-modal');
        m.innerHTML = html`<div class="m-ico">${icon('users')}</div>
          <h2>${t('Jugar con amigos')}</h2>
          <p class="sub">${t('Abre tu mundo de un jugador a tus amigos por internet. Sin abrir puertos del router ni programas aparte.')}</p>
          <ol class="fr-steps">${steps.map(([a, d], n) => `<li><span class="n">${n + 1}</span><div><b>${esc(a)}</b><span>${esc(d)}</span></div></li>`).join('')}</ol>
          ${can ? '' : `<p class="note">${t('Esta instancia es vanilla: para abrir tu mundo hace falta Fabric, Forge o NeoForge.')}</p>`}
          <div class="fr-join">
            <label>${t('¿Te pasaron una dirección? Únete a tu amigo')}</label>
            <div class="row"><input class="input" id="fr-addr" placeholder="abc123.e4mc.link" spellcheck="false" autocomplete="off">
              <button class="btn btn-outline" id="fr-go" disabled>${icon('play')}${t('Unirme')}</button></div>
          </div>
          <div class="actions"><button class="btn btn-ghost" data-a="no">${t('Cerrar')}</button>
            ${can || on ? `<button class="btn ${on ? 'btn-ghost danger-text' : 'btn-primary'}" data-a="yes">${icon(on ? 'x' : 'users')}${on ? t('Desactivar') : t('Activar')}</button>` : ''}</div>`;
        m.querySelector('[data-a=no]').onclick = close;
        const addr = m.querySelector('#fr-addr'), go = m.querySelector('#fr-go');
        const valid = () => /^[a-z0-9.-]+\.[a-z]{2,}(:\d{2,5})?$/i.test(addr.value.trim());
        addr.oninput = () => { go.disabled = !valid(); };
        addr.onkeydown = (e) => { if (e.key === 'Enter' && valid()) go.click(); };
        go.onclick = () => { const a = addr.value.trim(); close(); App.play(id, { join: a }); };
        const yes = m.querySelector('[data-a=yes]');
        if (yes) yes.onclick = async () => {
          try {
            await onyx.instances.setFriendsMode(id, !on);
            await App.loadInstances();
            close();
            render();
            toast(on ? t('Jugar con amigos desactivado') : t('Jugar con amigos activado. Se aplica la próxima vez que pulses Jugar.'), 'success', 6000);
          } catch (e) { toast(t(e.message, e.vars), 'error'); }
        };
      }, { wide: true });
    }

    function perfModal() {
      const can = ['fabric', 'forge', 'neoforge'].includes((inst.loader && inst.loader.type) || 'vanilla');
      const on = !!inst.perfMode;
      const rows = [['Sodium', t('Más FPS: dibuja el mundo mucho más rápido')], ['Lithium', t('El mundo y los mobs gastan menos')],
        ['FerriteCore', t('Usa menos memoria RAM')], ['EntityCulling', t('No dibuja lo que no se ve')]];
      UI.modal((m, close) => {
        m.classList.add('perf-modal');
        m.innerHTML = html`<div class="m-ico">${icon('zap')}</div>
          <h2>${t('Modo rendimiento')}</h2>
          <p class="sub">${t('Añade mods de optimización para que el juego vaya más fluido. Solo en tu ordenador: el servidor no necesita nada.')}</p>
          <div class="perf-list">${rows.map(([n, d]) => `<div><b>${n}</b><span>${esc(d)}</span></div>`).join('')}</div>
          <p class="note">${can ? t('Si el studio ya trae alguno, se usa el suyo. Se aplica la próxima vez que pulses Jugar.') : t('Esta instancia es vanilla: el modo rendimiento necesita Fabric, Forge o NeoForge.')}</p>
          <div class="actions"><button class="btn btn-ghost" data-a="no">${t('Cancelar')}</button>
            ${can || on ? `<button class="btn ${on ? 'btn-ghost danger-text' : 'btn-primary'}" data-a="yes">${icon(on ? 'x' : 'zap')}${on ? t('Desactivar') : t('Activar')}</button>` : ''}</div>`;
        m.querySelector('[data-a=no]').onclick = close;
        const yes = m.querySelector('[data-a=yes]');
        if (yes) yes.onclick = async () => {
          try {
            await onyx.instances.setPerfMode(id, !on);
            await App.loadInstances();
            close();
            render();
            toast(on ? t('Modo rendimiento desactivado') : t('Modo rendimiento activado'), 'success');
          } catch (e) { toast(t(e.message, e.vars), 'error'); }
        };
      }, { wide: true });
    }

    function menu(anchor) {
      UI.dropdown(anchor, (dd, close) => {
        dd.innerHTML = html`
          <button class="dd-item" data-a="update">${icon('refresh')}${t('Actualizar')}</button>
          <button class="dd-item" data-a="report">${icon('alert')}${t('Reportar un fallo')}</button>
          <button class="dd-item" data-a="pack">${icon('package')}${t('Instalar desde .onyxpack')}</button>
          <button class="dd-item" data-a="shots">${icon('image')}${t('Capturas')}</button>
          <button class="dd-item" data-a="friends">${icon('users')}${t('Jugar con amigos')}<span class="dd-state ${inst.friendsMode ? 'on' : ''}">${inst.friendsMode ? t('Activado') : t('Desactivado')}</span></button>
          <button class="dd-item" data-a="perf">${icon('zap')}${t('Modo rendimiento')}<span class="dd-state ${inst.perfMode ? 'on' : ''}">${inst.perfMode ? t('Activado') : t('Desactivado')}</span></button>
          <div class="dd-sep"></div>
          <button class="dd-item danger" data-a="wipe">${icon('trash')}${t('Borrar archivos')}</button>
          <button class="dd-item danger" data-a="leave">${icon('logout')}${t('Salir de la instancia')}</button>`;
        const on = (a, fn) => { dd.querySelector(`[data-a=${a}]`).onclick = () => { close(); fn(); }; };
        on('update', async () => {
          if (S.progress[id]) return;
          S.progress[id] = { stage: 'files' };
          document.dispatchEvent(new CustomEvent('onyx:progress', { detail: { id } }));
          try { await onyx.instances.update(id); await App.loadInstances(); toast(t('Instancia actualizada'), 'success'); }
          catch (e) { toast(e.message, 'error', 6000); }
          finally { delete S.progress[id]; document.dispatchEvent(new CustomEvent('onyx:progress', { detail: { id } })); }
        });
        on('report', App.reportModal);
        on('perf', perfModal);
        on('friends', friendsModal);
        on('shots', () => App.go('gallery')); // en el launcher: la carpeta de la instancia no se abre (protege los mods)
        on('pack', async () => {
          try { const n = await onyx.instances.importPack(id); if (n != null) toast(t('{n} archivos instalados desde el pack', { n }), 'success'); }
          catch (e) { toast(e.message, 'error', 6000); }
        });
        on('wipe', async () => {
          const ok = await UI.confirmModal({ title: t('¿Borrar los archivos?'), text: t('Se borrarán mundos, capturas, mods y ajustes de esta instancia. Se volverán a descargar al jugar.'), confirm: t('Borrar'), danger: true, ico: 'trash' });
          if (!ok) return;
          try { await onyx.instances.wipe(id); toast(t('Archivos borrados'), 'success'); } catch (e) { toast(e.message, 'error'); }
        });
        on('leave', async () => {
          const ok = await UI.confirmModal({ title: t('¿Salir de {name}?', { name: inst.name }), text: t('La instancia y sus archivos se quitarán de este equipo. Podrás volver con el código.'), confirm: t('Salir'), danger: true, ico: 'logout' });
          if (!ok) return;
          await onyx.instances.remove(id, true);
          await App.loadInstances();
          App.go('home');
        });
      }, { width: 260 });
    }

    render();
    // Jugadores conectados (si la instancia tiene servidor)
    const refreshStatus = async () => {
      if (!inst.server || !inst.server.address) return;
      try { status = await onyx.instances.status(id); } catch { status = null; }
      if (!alive) return;
      const el = root.querySelector('#ins-players');
      if (el) el.innerHTML = playersText();
    };
    refreshStatus();
    const timer = setInterval(refreshStatus, 30000);
    loadLive();
    onyx.streams.channels().then(r => { myCh = r; if (alive) paintLive(); }).catch(() => {});
    const liveTimer = setInterval(() => { if (!document.hidden) loadLive(); }, 60000);

    const update = (pid) => {
      if (pid !== id) return;
      const p = S.progress[id];
      const bar = root.querySelector('#ins-bar');
      if (!p || !bar) return render();
      const pct = p.total ? Math.round((p.done / p.total) * 100) : null;
      bar.style.width = (pct == null ? 8 : pct) + '%';
      root.querySelector('#ins-stage').textContent = App.stageText(p);
      root.querySelector('#ins-pct').textContent = pct == null ? '' : pct + '%';
    };
    const off = smoothProgress(() => render(), update);
    const onNews = (e) => { if (e.detail && e.detail.id === id && alive) render(); }; // vistas: se quita el contador
    document.addEventListener('onyx:news', onNews);
    // Al día en segundo plano: el porcentaje cambia sin volver a dibujar todo
    const onBg = (e) => {
      const b = e.detail || {};
      if (b.id !== id || !alive) return;
      const pct = root.querySelector('#bg-pct');
      if (b.state === 'updating' && pct && b.total) pct.textContent = Math.round((b.done / b.total) * 100) + '%';
      else render();
    };
    document.addEventListener('onyx:bg', onBg);
    const onFr = (e) => { if (e.detail && e.detail.id === id && alive) render(); };
    document.addEventListener('onyx:friends', onFr);
    return () => { alive = false; clearInterval(timer); clearInterval(liveTimer); off(); document.removeEventListener('onyx:news', onNews); document.removeEventListener('onyx:bg', onBg); document.removeEventListener('onyx:friends', onFr); if (audio) { audio.pause(); audio = null; } };
  };
})();
