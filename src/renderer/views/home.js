// Inicio, lista de instancias y página de instancia.
(function () {
  const { esc, html, toast } = UI;
  const V = window.Views = window.Views || {};

  function greeting() {
    const h = new Date().getHours();
    return h < 6 ? t('Buenas noches') : h < 12 ? t('Buenos días') : h < 20 ? t('Buenas tardes') : t('Buenas noches');
  }
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
  function stateOf(i) {
    const now = Date.now(), sc = i.schedule || {};
    if (i.state === 'locked') return { k: 'locked', label: t('Bloqueada'), cls: 'danger' };
    if (sc.opensAt && now < sc.opensAt) return { k: 'soon', label: t('Abre el {date}', { date: fmtWhen(sc.opensAt) }), short: t('Próximamente'), cls: 'warn' };
    if (sc.closesAt && now > sc.closesAt) return { k: 'closed', label: t('Cerrada'), cls: 'danger' };
    return null;
  }

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
  function updateCardText(root, id) {
    const meta = root.querySelector(`.inst-card[data-id="${CSS.escape(id)}"] .meta`);
    const p = S.progress[id];
    if (meta && p) meta.textContent = App.stageText(p);
  }

  function instanceCard(i) {
    const p = S.progress[i.id];
    return html`<div class="inst-card" data-id="${esc(i.id)}">
      <div class="banner" style="${i.banner ? `background-image:url('${esc(i.banner)}')` : ''}">
        ${(() => { const st = stateOf(i); return st ? `<span class="badge ${st.cls}">${icon(st.k === 'soon' ? 'clock' : 'lock')}${esc(st.short || st.label)}</span>` : i.premium ? `<span class="badge premium">${icon('lock')}Premium</span>` : ''; })()}
      </div>
      <div class="body">
        <div class="icon" style="${i.icon ? `background-image:url('${esc(i.icon)}')` : ''}">${i.icon ? '' : `<b>${initials(i.name)}</b>`}</div>
        <div class="grow" style="min-width:0;padding-bottom:4px">
          <div class="name">${esc(i.name)}</div>
          <div class="meta">${p ? esc(App.stageText(p)) : `${esc(i.minecraft || '')} · ${loaderLabel(i.loader)}`}</div>
        </div>
        <button class="play-btn" data-play="${esc(i.id)}" title="${t('Jugar')}">${p ? icon('refresh', 'spin') : icon('play')}</button>
      </div></div>`;
  }
  function bindCards(root) {
    root.querySelectorAll('.inst-card[data-id]').forEach(c => c.onclick = (e) => {
      if (e.target.closest('[data-play]')) return;
      App.go('instance', { id: c.dataset.id });
    });
    root.querySelectorAll('[data-play]').forEach(b => b.onclick = () => { if (!S.progress[b.dataset.play]) App.play(b.dataset.play); });
    const add = root.querySelector('.inst-card.add');
    if (add) add.onclick = App.addInstanceModal;
  }

  // ---------------- Inicio ----------------
  V.home = function (root) {
    const acc = S.account;
    const render = () => {
      const list = S.instances;
      root.innerHTML = html`<div class="page">
        <div class="home-head">
          ${Skin3D.head(App.skinOf(acc), 54, 14)}
          <div class="grow">
            <h1>${greeting()}, <span class="accent">${esc(acc ? acc.name : '')}</span></h1>
            <p class="home-sub">${!list.length ? t('Añade tu primera instancia con un código de acceso.') : S.info.brand && S.info.brand.tagline ? esc(S.info.brand.tagline) : t('Elige una instancia y a jugar.')}</p>
          </div>
          <div class="promo" id="h-promo">
            <img src="assets/logo-mark.png" alt="">
            <div><div class="tag">${t('Comunidad')}</div><div class="t">${t('Únete a nuestro Discord')}</div><div class="s">${t('Novedades, eventos y soporte')}</div></div>
          </div>
        </div>
        <h2 class="section">${t('Continúa jugando')}</h2>
        ${list.length ? `<div class="inst-grid">${list.slice(0, 6).map(instanceCard).join('')}
          <div class="inst-card add">${icon('plus')}${t('Añadir instancia')}</div></div>`
        : html`<div class="card empty-card">
            <div class="ico">${icon('sparkles')}</div>
            <div class="grow"><div class="t">${t('Aún no hay instancias')}</div><div class="s">${t('Añade una con un código de acceso.')}</div></div>
            <button class="add-big" id="h-add">${icon('plus')}${t('Añadir instancia')}</button>
          </div>`}
      </div>`;
      root.querySelector('#h-promo').onclick = () => {
        if (S.info.discordInvite) onyx.app.openExternal(S.info.discordInvite);
        else toast(t('El enlace de Discord aún no está configurado'), 'info');
      };
      const add = root.querySelector('#h-add');
      if (add) add.onclick = App.addInstanceModal;
      bindCards(root);
    };
    render();
    return smoothProgress(render, (id) => updateCardText(root, id));
  };

  // ---------------- Todas las instancias ----------------
  V.instances = function (root) {
    const render = () => {
      root.innerHTML = html`<div class="page">
        <div class="page-head"><h1 class="title" style="margin:0">${t('Instancias')}</h1>
          <button class="btn btn-primary" id="i-add">${icon('key')}${t('Añadir con código')}</button></div>
        ${S.instances.length ? `<div class="inst-grid">${S.instances.map(instanceCard).join('')}</div>`
        : html`<div class="center-empty"><div class="ico">${icon('grid')}</div><div class="t">${t('Aún no hay instancias')}</div>
          <div class="s">${t('Añade una con un código de acceso.')}</div></div>`}
      </div>`;
      root.querySelector('#i-add').onclick = App.addInstanceModal;
      bindCards(root);
    };
    render();
    return smoothProgress(render, (id) => updateCardText(root, id));
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
            ${look.music && look.music.url ? `<button class="round" id="ins-music" title="${t('Música')}">${icon(musicMuted() ? 'volumeOff' : 'volume')}</button>` : ''}
            <button class="round" id="ins-folder" title="${t('Abrir carpeta')}">${icon('folder')}</button>
            <button class="round sq" id="ins-more" title="${t('Más opciones')}">${icon('more')}</button>
          </div>
          <div class="bottom">
            <div class="big-icon" style="${inst.iconAnimated || inst.icon ? `background-image:${esc(cssUrl(inst.iconAnimated || inst.icon))}` : ''}">${inst.iconAnimated || inst.icon ? '' : icon('box')}</div>
            <div class="grow" style="min-width:0">
              ${logo && !look.hideTitle ? `<img class="ihero-logo" src="${esc(logo)}" alt="${esc(inst.name)}">` : look.hideTitle ? '' : `<h1>${esc(inst.name)}</h1>`}
              <div class="tags">
                ${st ? `<span class="badge ${st.cls}">${icon(st.k === 'soon' ? 'clock' : 'lock')}${esc(st.label)}</span>` : ''}
                ${inst.category ? `<span class="badge">${esc(inst.category)}</span>` : ''}
                ${inst.premium ? `<span class="badge premium">${icon('lock')}Premium</span>` : `<span class="badge accent">${icon('user')}${t('Premium y offline')}</span>`}
                ${inst.server && inst.server.address && !look.hideTech ? `<span class="badge">${icon('globe')}${esc(inst.server.address)}</span>` : ''}
              </div>
            </div>
            ${running
              ? `<button class="play-big stop" id="ins-stop">${icon('stop')}${t('Detener')}</button>`
              : `<button class="play-big" id="ins-play" ${p ? 'disabled' : ''}>${p ? icon('refresh', 'spin') : icon(st && st.k === 'soon' && inst.schedule.predownload ? 'download' : 'play')}${p ? t('Preparando...') : st && st.k === 'soon' && inst.schedule.predownload ? t('Descargar ya') : t('Jugar')}</button>`}
          </div>
          ${p && !running ? html`<div class="prog"><div class="progress"><i id="ins-bar" style="width:${pct == null ? 8 : pct}%"></i></div>
            <div class="progress-label"><span id="ins-stage">${esc(App.stageText(p))}</span><span id="ins-pct">${pct == null ? '' : pct + '%'}</span></div></div>` : ''}
        </div>
        ${st && st.k === 'locked' && inst.lockedMessage ? html`<div class="card inst-note">${icon('lock')}<span>${esc(inst.lockedMessage)}</span></div>` : ''}

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
      if (b('#ins-stop')) b('#ins-stop').onclick = () => onyx.instances.stop(id);
      b('#ins-folder').onclick = () => onyx.app.openPath('instance', id);
      if (b('#ins-music')) b('#ins-music').onclick = () => { setMusicMuted(!musicMuted()); syncMusic(); render(); };
      if (b('#ins-sponsor') && look.sponsor && look.sponsor.url) b('#ins-sponsor').onclick = () => onyx.app.openExternal(look.sponsor.url);
      syncMusic();
      b('#ins-more').onclick = (e) => menu(e.currentTarget);
    };

    function menu(anchor) {
      UI.dropdown(anchor, (dd, close) => {
        dd.innerHTML = html`
          <button class="dd-item" data-a="update">${icon('refresh')}${t('Actualizar')}</button>
          <button class="dd-item" data-a="report">${icon('alert')}${t('Reportar un fallo')}</button>
          <button class="dd-item" data-a="pack">${icon('package')}${t('Instalar desde .onyxpack')}</button>
          <button class="dd-item" data-a="shots">${icon('image')}${t('Capturas')}</button>
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
        on('shots', () => onyx.app.openPath('screenshots', id));
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
    return () => { alive = false; clearInterval(timer); off(); if (audio) { audio.pause(); audio = null; } };
  };
})();
