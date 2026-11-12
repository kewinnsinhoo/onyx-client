// Inicio + lista de instancias + detalle de instancia
(function () {
  const { esc, html, toast } = UI;
  const V = window.Views = window.Views || {};

  function greeting() {
    const h = new Date().getHours();
    return h < 6 ? t('Buenas noches') : h < 12 ? t('Buenos días') : h < 20 ? t('Buenas tardes') : t('Buenas noches');
  }

  function loaderLabel(l) {
    const type = (l && l.type) || 'vanilla';
    return { vanilla: 'Vanilla', fabric: 'Fabric', quilt: 'Quilt', forge: 'Forge', neoforge: 'NeoForge' }[type] || type;
  }

  function instanceCard(i) {
    const p = S.progress[i.id];
    return html`<div class="inst-card" data-id="${esc(i.id)}">
      <div class="banner" style="${i.banner ? `background-image:url('${esc(i.banner)}')` : ''}">
        ${i.premium ? `<span class="badge premium">${icon('lock')}Premium</span>` : ''}
      </div>
      <div class="body">
        <div class="icon" style="${i.icon ? `background-image:url('${esc(i.icon)}')` : ''}">${i.icon ? '' : icon('box')}</div>
        <div class="grow" style="min-width:0">
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

  V.home = function (root) {
    const acc = S.account;
    const render = () => {
      const list = S.instances;
      root.innerHTML = html`<div class="page">
        <div class="greet">${Skin3D.head(App.skinOf(acc), 48, 8)}<h1>${greeting()}, ${esc(acc ? acc.name : '')}</h1></div>
        <div class="row">
          <button class="btn btn-outline btn-sm" id="h-discord" style="height:36px">${icon('link')}Discord</button>
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
      root.querySelector('#h-discord').onclick = () => {
        if (S.info.discordInvite) onyx.app.openExternal(S.info.discordInvite);
        else toast(t('El enlace de Discord aún no está configurado'), 'info');
      };
      const add = root.querySelector('#h-add');
      if (add) add.onclick = App.addInstanceModal;
      bindCards(root);
    };
    render();
    const onP = () => render();
    document.addEventListener('onyx:progress', onP);
    return () => document.removeEventListener('onyx:progress', onP);
  };

  V.instances = function (root) {
    const render = () => {
      root.innerHTML = html`<div class="page">
        <div class="page-head"><h1 class="title">${t('Instancias')}</h1>
          <button class="btn btn-outline" id="i-add">${icon('key')}${t('Añadir con código')}</button></div>
        ${S.instances.length ? `<div class="inst-grid">${S.instances.map(instanceCard).join('')}</div>`
        : html`<div class="center-empty"><div class="ico">${icon('box')}</div><div class="t">${t('Aún no hay instancias')}</div>
          <div class="s">${t('Añade una con un código de acceso.')}</div></div>`}
      </div>`;
      root.querySelector('#i-add').onclick = App.addInstanceModal;
      bindCards(root);
    };
    render();
    const onP = () => render();
    document.addEventListener('onyx:progress', onP);
    return () => document.removeEventListener('onyx:progress', onP);
  };

  function fmtTime(ms) {
    const h = Math.floor(ms / 3600e3), m = Math.floor((ms % 3600e3) / 60e3);
    return h ? `${h} h ${m} min` : `${m} min`;
  }

  V.instance = function (root, { id }) {
    let inst = S.instances.find(i => i.id === id);
    if (!inst) { App.go('instances'); return; }
    const render = () => {
      inst = S.instances.find(i => i.id === id) || inst;
      const p = S.progress[id];
      const pct = p && p.total ? Math.round((p.done / p.total) * 100) : null;
      const running = p && p.stage === 'running';
      root.innerHTML = html`<div class="page">
        <div class="inst-hero" style="${inst.banner ? `background-image:url('${esc(inst.banner)}')` : ''}">
          <div class="content">
            <div class="icon" style="${inst.icon ? `background-image:url('${esc(inst.icon)}')` : ''}"></div>
            <div class="grow">
              <h1>${esc(inst.name)}</h1>
              <div class="meta">
                <span class="badge">Minecraft ${esc(inst.minecraft || '?')}</span>
                <span class="badge">${loaderLabel(inst.loader)}</span>
                ${inst.premium ? `<span class="badge premium">${icon('lock')}Premium</span>` : ''}
                ${inst.server ? `<span class="badge">${icon('globe')}${esc(inst.server.address)}</span>` : ''}
              </div>
            </div>
            ${running
              ? `<button class="btn btn-danger btn-lg" id="ins-stop">${icon('stop')}${t('Detener')}</button>`
              : `<button class="btn btn-primary btn-lg" id="ins-play" ${p ? 'disabled' : ''}>${p ? icon('refresh', 'spin') : icon('play')}${p ? t('Preparando...') : t('Jugar')}</button>`}
          </div>
        </div>
        ${p && !running ? html`<div class="progress-box"><div class="progress"><i style="width:${pct == null ? 8 : pct}%"></i></div>
          <div class="progress-label"><span>${esc(App.stageText(p))}</span><span>${pct == null ? '' : pct + '%'}</span></div></div>` : ''}
        ${inst.description ? `<p class="muted" style="margin:22px 2px 0;line-height:1.6;user-select:text">${esc(inst.description)}</p>` : ''}
        <h2 class="section">${t('Detalles')}</h2>
        <div class="card">
          <div class="setting-row"><div class="lbl">${t('Tiempo jugado')}</div><span class="muted">${fmtTime(inst.playTime || 0)}</span></div>
          <div class="setting-row"><div class="lbl">${t('Última vez')}</div><span class="muted">${inst.lastPlayed ? UI.timeAgo(inst.lastPlayed) : t('Nunca')}</span></div>
          <div class="setting-row"><div class="lbl">${t('Memoria para esta instancia')}<div class="desc">${t('Vacío = usar la de Ajustes > Juego')}</div></div>
            <input class="input" id="ins-mem" style="width:120px;text-align:center" placeholder="${Math.round((S.settings.memoryMb || 4096) / 1024)} GB" value="${inst.memoryMb ? Math.round(inst.memoryMb / 1024) : ''}"></div>
        </div>
        <div class="row" style="margin-top:16px">
          <button class="btn btn-outline" id="ins-folder">${icon('folder')}${t('Abrir carpeta')}</button>
          <button class="btn btn-outline" id="ins-shots">${icon('image')}${t('Capturas')}</button>
          <div class="grow"></div>
          <button class="btn btn-danger" id="ins-del">${icon('trash')}${t('Eliminar')}</button>
        </div>
      </div>`;
      const b = (s) => root.querySelector(s);
      if (b('#ins-play')) b('#ins-play').onclick = () => App.play(id);
      if (b('#ins-stop')) b('#ins-stop').onclick = () => onyx.instances.stop(id);
      b('#ins-folder').onclick = () => onyx.app.openPath('instance', id);
      b('#ins-shots').onclick = () => onyx.app.openPath('screenshots', id);
      b('#ins-mem').onchange = async (e) => {
        const gb = parseFloat(e.target.value);
        await onyx.instances.setMemory(id, gb > 0 ? Math.round(gb * 1024) : null);
        await App.loadInstances();
        toast(t('Guardado'), 'success', 1800);
      };
      b('#ins-del').onclick = async () => {
        const ok = await UI.confirmModal({ title: t('¿Eliminar {name}?', { name: inst.name }), text: t('Se borrarán sus mundos, capturas y ajustes de esta instancia.'), confirm: t('Eliminar'), danger: true, ico: 'trash' });
        if (!ok) return;
        await onyx.instances.remove(id, true);
        await App.loadInstances();
        App.go('home');
      };
    };
    render();
    const onP = (e) => { if (!e.detail || !e.detail.id || e.detail.id === id) render(); };
    document.addEventListener('onyx:progress', onP);
    return () => document.removeEventListener('onyx:progress', onP);
  };
})();
