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
        ${i.premium ? `<span class="badge premium">${icon('lock')}Premium</span>` : ''}
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
            <p class="home-sub">${list.length ? t('Elige una instancia y a jugar.') : t('Añade tu primera instancia con un código de acceso.')}</p>
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
      root.innerHTML = html`<div class="page">
        <div class="ihero" style="${inst.banner ? `background-image:url('${esc(inst.banner)}')` : ''}">
          <div class="top">
            <div class="studio">${studio.logo ? `<img src="${esc(studio.logo)}" alt="">` : `<span class="ph">${initials(studio.name)}</span>`}
              <span>${t('por')} <b>${esc(studio.name || '')}</b></span></div>
            <div class="grow"></div>
            <button class="round" id="ins-folder" title="${t('Abrir carpeta')}">${icon('folder')}</button>
            <button class="round sq" id="ins-more" title="${t('Más opciones')}">${icon('more')}</button>
          </div>
          <div class="bottom">
            <div class="big-icon" style="${inst.icon ? `background-image:url('${esc(inst.icon)}')` : ''}">${inst.icon ? '' : icon('box')}</div>
            <div class="grow" style="min-width:0">
              <h1>${esc(inst.name)}</h1>
              <div class="tags">
                ${inst.premium ? `<span class="badge premium">${icon('lock')}Premium</span>` : `<span class="badge accent">${icon('user')}${t('Premium y offline')}</span>`}
                ${inst.server && inst.server.address ? `<span class="badge">${icon('globe')}${esc(inst.server.address)}</span>` : ''}
              </div>
            </div>
            ${running
              ? `<button class="play-big stop" id="ins-stop">${icon('stop')}${t('Detener')}</button>`
              : `<button class="play-big" id="ins-play" ${p ? 'disabled' : ''}>${p ? icon('refresh', 'spin') : icon('play')}${p ? t('Preparando...') : t('Jugar')}</button>`}
          </div>
          ${p && !running ? html`<div class="prog"><div class="progress"><i id="ins-bar" style="width:${pct == null ? 8 : pct}%"></i></div>
            <div class="progress-label"><span id="ins-stage">${esc(App.stageText(p))}</span><span id="ins-pct">${pct == null ? '' : pct + '%'}</span></div></div>` : ''}
        </div>

        <div class="stats">
          <div class="stat"><span class="si">${icon('cpu')}</span><div><div class="k">${t('Versión')}</div><div class="v">${esc(inst.minecraft || '?')}</div></div></div>
          <div class="stat"><span class="si">${icon('sliders')}</span><div><div class="k">Loader</div><div class="v">${esc(loaderLabel(inst.loader, true))}</div></div></div>
          <div class="stat"><span class="si">${icon('users')}</span><div><div class="k">${t('Jugadores')}</div><div class="v" id="ins-players">${playersText()}</div></div></div>
          <div class="stat"><span class="si">${icon('clock')}</span><div><div class="k">${t('Tiempo jugado')}</div><div class="v">${fmtTime(inst.playTime || 0)}</div></div></div>
        </div>

        ${paragraphs.length ? html`<div class="card about-inst"><h3>${t('Sobre esta instancia')}</h3>${paragraphs.map(x => `<p>${esc(x)}</p>`).join('')}</div>` : ''}
      </div>`;

      const b = (s) => root.querySelector(s);
      if (b('#ins-play')) b('#ins-play').onclick = () => App.play(id);
      if (b('#ins-stop')) b('#ins-stop').onclick = () => onyx.instances.stop(id);
      b('#ins-folder').onclick = () => onyx.app.openPath('instance', id);
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
    let alive = true;
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
    return () => { alive = false; clearInterval(timer); off(); };
  };
})();
