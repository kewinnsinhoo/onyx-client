// Ajustes: Cuentas, Cliente, Juego, Referidos, Acerca de, Términos.
(function () {
  const { esc, html, toast, busy } = UI;
  const V = window.Views = window.Views || {};

  const THEMES = [
    { id: 'onyx', name: 'Noche Índigo', bg: 'linear-gradient(135deg,#0b0e1b,#070912 60%,#1c2050)', s: 'rgba(160,172,255,.16)', a: 'linear-gradient(135deg,#9aa6ff,#5260dc)' },
    { id: 'oled', name: 'OLED', bg: '#000', s: 'rgba(160,172,255,.12)', a: 'linear-gradient(135deg,#9aa6ff,#5260dc)' },
    { id: 'amethyst', name: 'Amatista', bg: 'linear-gradient(135deg,#120b20,#0b0714 60%,#2f1652)', s: 'rgba(200,160,255,.16)', a: 'linear-gradient(135deg,#d3afff,#7c3aed)' },
    { id: 'aurora', name: 'Aurora', bg: 'linear-gradient(135deg,#071816,#04100f 60%,#0d3b36)', s: 'rgba(120,240,220,.16)', a: 'linear-gradient(135deg,#7ff0dc,#0f8f84)' }
  ];
  const LANGS = [['es', 'Español'], ['ca', 'Català'], ['en', 'English'], ['fr', 'Français']];

  V.settings = function (root, params = {}) {
    let tab = params.tab || 'accounts';
    root.innerHTML = html`<div class="page narrow">
      <h1 class="title">${t('Ajustes')}</h1>
      <div class="tabs" id="st-tabs">
        <button data-tab="accounts">${t('Cuentas')}</button><button data-tab="client">${t('Cliente')}</button>
        <button data-tab="game">${t('Juego')}</button><button data-tab="referrals">${t('Referidos')}</button>
        <button data-tab="about">${t('Acerca de')}</button><button data-tab="terms">${t('Términos y condiciones')}</button>
      </div><div id="st-body"></div></div>`;
    const body = root.querySelector('#st-body');
    const setTab = (name) => {
      tab = name;
      S.route.params = { tab };
      root.querySelectorAll('#st-tabs button').forEach(b => b.classList.toggle('on', b.dataset.tab === tab));
      body.innerHTML = '';
      TABS[tab](body);
    };
    root.querySelectorAll('#st-tabs button').forEach(b => b.onclick = () => setTab(b.dataset.tab));
    setTab(tab);
  };

  const TABS = {};

  // ---------- Cuentas ----------
  TABS.accounts = function (body) {
    const list = S.accounts.accounts;
    const d = S.settings.discord;
    body.innerHTML = html`<div class="card"><h3>${t('Cuentas')}</h3>
      ${list.map(a => html`<div class="list-item">
        ${Skin3D.head(App.skinOf(a), 40, 6)}
        <div class="grow"><div class="name">${esc(a.name)}</div><div class="sub">${a.type === 'msa' ? 'Microsoft' : t('Offline')}</div></div>
        ${a.id === S.accounts.active ? `<span class="badge">${t('Activa')}</span>` : `<button class="btn btn-outline btn-sm" data-use="${esc(a.id)}">${t('Usar')}</button>`}
        <button class="icon-btn" data-rm="${esc(a.id)}" title="${t('Quitar')}">${icon('trash')}</button></div>`).join('')}
      <div class="list-item" style="margin-top:12px;background:linear-gradient(90deg,rgba(88,101,242,.10),transparent);border-color:#262a46">
        <span class="ic" style="width:36px;height:36px;border-radius:8px;background:#22264a;display:flex;align-items:center;justify-content:center;color:#a5adff">${icon('discord')}</span>
        <div class="grow"><div class="name" style="font-size:14px">Discord</div><div class="sub">${d ? esc('@' + (d.username || d.globalName)) : t('Sin vincular')}</div></div>
        ${d ? `<button class="btn btn-ghost btn-sm" id="dc-un">${t('Desvincular')}</button>` : `<button class="btn btn-discord" id="dc-link">${t('Vincular')}</button>`}
      </div>
      <div class="list-item clickable" id="go-skins" style="margin-top:12px">${icon('user')}<div class="grow name" style="font-size:14px">${t('Skins')}</div>${icon('chevronRight')}</div>
      <button class="btn btn-primary" id="acc-add" style="margin-top:16px">${icon('plus')}${t('Añadir cuenta')}</button>
    </div>`;
    body.querySelectorAll('[data-use]').forEach(b => b.onclick = async () => { await onyx.accounts.setActive(b.dataset.use); await App.refreshAccountUi(); });
    body.querySelectorAll('[data-rm]').forEach(b => b.onclick = async () => {
      const a = list.find(x => x.id === b.dataset.rm);
      if (!(await UI.confirmModal({ title: t('¿Quitar {name}?', { name: a.name }), text: t('Podrás volver a añadirla cuando quieras.'), confirm: t('Quitar'), danger: true, ico: 'trash' }))) return;
      await onyx.accounts.remove(a.id);
      await App.refreshAccountUi();
    });
    const link = body.querySelector('#dc-link');
    if (link) link.onclick = async () => {
      busy(link, true);
      try { const r = await onyx.discord.link(); S.settings.discord = r; toast(t('Discord vinculado: @{u}', { u: r.username }), 'success'); TABS.accounts(body); }
      catch (e) { toast(e.message, 'error', 6000); busy(link, false); }
    };
    const un = body.querySelector('#dc-un');
    if (un) un.onclick = async () => { await onyx.discord.unlink(); S.settings.discord = null; TABS.accounts(body); };
    body.querySelector('#go-skins').onclick = () => App.go('skins');
    body.querySelector('#acc-add').onclick = App.addAccountModal;
  };

  // ---------- Cliente ----------
  TABS.client = function (body) {
    const s = S.settings;
    const toggle = (key, on) => `<button class="toggle ${on ? 'on' : ''}" data-tg="${key}"></button>`;
    body.innerHTML = html`
      <div class="card"><h3>${t('Idioma')}</h3><div class="lang-grid">
        ${LANGS.map(([id, name]) => `<button class="lang-opt ${s.language === id ? 'on' : ''}" data-lang="${id}">${flag(id)}${name}${s.language === id ? `<span class="check">${icon('check')}</span>` : ''}</button>`).join('')}
      </div></div>
      <div class="card"><h3>${t('Apariencia')}</h3><div class="field-label">${t('Temas')}</div><div class="theme-grid">
        ${THEMES.map(th => html`<button class="theme-opt ${(s.theme || 'onyx') === th.id ? 'on' : ''}" data-theme="${th.id}">
          <span class="theme-prev" style="background:${th.bg}">
            <i style="left:6px;top:6px;right:6px;height:6px;background:${th.s}"></i>
            <i style="left:6px;top:17px;width:36px;height:30px;background:${th.s}"></i>
            <i style="left:46px;top:17px;width:40px;height:30px;background:${th.s}"></i>
            <i style="right:10px;bottom:13px;width:22px;height:7px;background:${th.a}"></i></span>
          <span><div class="t">${esc(th.name)}</div><div class="s">${(s.theme || 'onyx') === th.id ? t('En uso') : t('Aplicar tema')}</div></span></button>`).join('')}
      </div></div>
      <div class="card"><h3>${t('Rendimiento')}</h3>
        <div class="setting-row"><div class="lbl"><div>${t('Aceleración por hardware')}<div class="desc">${t('Desactívala si ves fallos gráficos en el launcher. Requiere reiniciar.')}</div></div></div>${toggle('hardwareAcceleration', s.hardwareAcceleration !== false)}</div>
        <div class="setting-row"><div class="lbl"><div>${t('Reducir animaciones')}</div></div>${toggle('reduceMotion', s.reduceMotion)}</div>
      </div>
      <div class="card"><h3>${t('Estado en Discord')}</h3>
        <div class="setting-row"><div class="lbl"><div>${t('Mostrar mi actividad en Discord')}<div class="desc">${t('Tus amigos verán «Jugando a Onyx Client», la instancia a la que juegas y el tiempo. Necesitas tener Discord abierto en este PC.')}</div></div></div>${toggle('discordPresence', s.discordPresence !== false)}</div>
        <div class="dc-preview ${s.discordPresence !== false ? '' : 'off'}" id="dc-preview">
          <div class="dc-k">${t('Jugando')}</div>
          <div class="dc-row"><img src="assets/icon.png" alt=""><div>
            <div class="dc-n">Onyx Client</div>
            <div class="dc-l">${t('En el menú')}</div>
            <div class="dc-l">Onyx Client · v${esc(S.info.version || '')}</div>
            <div class="dc-t">${icon('gamepad')}0:14</div></div></div>
        </div>
      </div>
      <div class="card"><h3>${t('Al iniciar el juego')}</h3>
        <div class="segmented" id="after">
          ${[['keep', 'Mantener abierto'], ['minimize', 'Minimizar'], ['hide', 'Ocultar'], ['close', 'Cerrar launcher']].map(([v, l]) =>
            `<button data-v="${v}" class="${(s.afterLaunch || 'minimize') === v ? 'on' : ''}">${t(l)}</button>`).join('')}
        </div></div>
      <div class="card"><h3>${t('Almacenamiento')}</h3>
        <div class="setting-row"><div class="lbl"><div>${t('Carpeta de datos')}<div class="desc mono" style="user-select:text">${esc(S.info.gameDir || '')}</div></div></div>
          <button class="btn btn-outline btn-sm" id="open-game">${icon('folder')}${t('Abrir')}</button></div>
        <div class="setting-row"><div class="lbl"><div>${t('Limpiar caché')}<div class="desc">${t('Borra datos temporales del launcher (no borra tus mundos).')}</div></div></div>
          <button class="btn btn-outline btn-sm" id="clear-cache">${t('Limpiar')}</button></div>
      </div>`;
    body.querySelectorAll('[data-lang]').forEach(b => b.onclick = async () => { await App.saveSettings({ language: b.dataset.lang }); App.go('settings', { tab: 'client' }); });
    body.querySelectorAll('[data-theme]').forEach(b => b.onclick = async () => { await App.saveSettings({ theme: b.dataset.theme }); TABS.client(body); });
    body.querySelectorAll('[data-tg]').forEach(b => b.onclick = async () => {
      const key = b.dataset.tg; const val = !b.classList.contains('on');
      b.classList.toggle('on', val);
      await App.saveSettings({ [key]: val });
      if (key === 'discordPresence') body.querySelector('#dc-preview').classList.toggle('off', !val);
      if (key === 'hardwareAcceleration') {
        if (await UI.confirmModal({ title: t('Reiniciar ahora'), text: t('El cambio se aplica al reiniciar el launcher.'), confirm: t('Reiniciar'), ico: 'refresh' })) onyx.app.relaunch();
      }
    });
    body.querySelectorAll('#after button').forEach(b => b.onclick = async () => { await App.saveSettings({ afterLaunch: b.dataset.v }); TABS.client(body); });
    body.querySelector('#open-game').onclick = () => onyx.app.openPath('game');
    body.querySelector('#clear-cache').onclick = async () => { await onyx.app.clearCache(); toast(t('Caché limpiada'), 'success'); };
  };

  // ---------- Juego ----------
  TABS.game = function (body) {
    const s = S.settings;
    const totalGb = Math.max(2, Math.floor((S.info.totalMemMb || 8192) / 1024));
    const recGb = Math.max(2, Math.floor(totalGb * 0.72));
    let gb = Math.min(totalGb, Math.max(2, Math.round((s.memoryMb || 4096) / 1024)));
    body.innerHTML = html`
      <div class="card">
        <div class="mem-head"><h3>${t('Memoria')} <span class="info-i" title="${t('RAM que puede usar Minecraft. Más no siempre es mejor: 4-8 GB suele bastar.')}">i</span></h3>
          <div class="stepper"><button id="m-minus">${icon('minimize')}</button><span class="val" id="m-val"></span><button id="m-plus">${icon('plus')}</button></div></div>
        <div class="mem-slider"><div class="track"><div class="fill" id="m-fill"></div><div class="danger" style="width:${((totalGb - recGb) / (totalGb - 2)) * 100}%"></div></div>
          <div class="thumb" id="m-thumb"></div><input type="range" id="m-range" min="2" max="${totalGb}" step="1" value="${gb}"></div>
        <div class="mem-scale"><span>2 GB</span><span>${totalGb} GB</span></div>
        <div class="hint">${t('{t} GB en este equipo · recomendado hasta {r} GB', { t: totalGb, r: recGb })}</div>
      </div>
      <div class="card"><h3>${t('Tamaño de ventana')}</h3>
        <div class="row"><input class="input" id="w-w" style="text-align:center" placeholder="${t('Ancho')}" value="${esc(s.windowWidth)}">
        <span class="muted">×</span><input class="input" id="w-h" style="text-align:center" placeholder="${t('Alto')}" value="${esc(s.windowHeight)}">
        <button class="btn btn-ghost" id="w-reset">${t('Restablecer')}</button></div>
        <div class="hint">${t('Vacío: la ventana se queda como la dejes en el juego.')}</div>
        <div class="setting-row" style="margin-top:8px"><div class="lbl">${t('Pantalla completa')}</div><button class="toggle ${s.fullscreen ? 'on' : ''}" data-tg="fullscreen"></button></div>
      </div>
      <div class="card"><h3>${t('Descargas')}</h3>
        <div class="setting-row"><div class="lbl">${t('Descarga rápida')} <span class="info-i" title="${t('Descarga varios archivos a la vez. Desactívala si tu conexión es inestable.')}">i</span></div>
          <button class="toggle ${s.fastDownload !== false ? 'on' : ''}" data-tg="fastDownload"></button></div>
      </div>
      <div class="card"><h3>Java</h3>
        <div class="setting-row"><div class="lbl"><div>${t('Ruta de Java')}<div class="desc">${t('Vacío = Onyx descarga automáticamente el Java correcto (recomendado).')}</div></div></div></div>
        <input class="input mono" id="j-path" placeholder="${t('Automático')}" value="${esc(s.javaPath)}" spellcheck="false">
        <div class="setting-row" style="margin-top:6px"><div class="lbl">${t('Argumentos de Java (avanzado)')}</div></div>
        <input class="input mono" id="j-args" placeholder="-XX:+UseG1GC" value="${esc(s.jvmArgs)}" spellcheck="false">
      </div>`;
    const range = body.querySelector('#m-range');
    const draw = () => {
      const pct = ((gb - 2) / (totalGb - 2 || 1)) * 100;
      body.querySelector('#m-val').textContent = gb + ' GB';
      body.querySelector('#m-fill').style.width = pct + '%';
      body.querySelector('#m-thumb').style.left = pct + '%';
      range.value = gb;
    };
    let saveT;
    const set = (v) => { gb = Math.max(2, Math.min(totalGb, v)); draw(); clearTimeout(saveT); saveT = setTimeout(() => App.saveSettings({ memoryMb: gb * 1024 }), 250); };
    range.oninput = () => set(Number(range.value));
    body.querySelector('#m-minus').onclick = () => set(gb - 1);
    body.querySelector('#m-plus').onclick = () => set(gb + 1);
    draw();
    const saveWin = () => App.saveSettings({ windowWidth: body.querySelector('#w-w').value.replace(/\D/g, ''), windowHeight: body.querySelector('#w-h').value.replace(/\D/g, '') });
    body.querySelector('#w-w').onchange = saveWin;
    body.querySelector('#w-h').onchange = saveWin;
    body.querySelector('#w-reset').onclick = async () => { await App.saveSettings({ windowWidth: '', windowHeight: '' }); TABS.game(body); };
    body.querySelectorAll('[data-tg]').forEach(b => b.onclick = async () => { const v = !b.classList.contains('on'); b.classList.toggle('on', v); await App.saveSettings({ [b.dataset.tg]: v }); });
    body.querySelector('#j-path').onchange = (e) => App.saveSettings({ javaPath: e.target.value.trim() });
    body.querySelector('#j-args').onchange = (e) => App.saveSettings({ jvmArgs: e.target.value.trim() });
  };

  // ---------- Referidos ----------
  function studioLogo(st) {
    return st.logo ? `<span class="studio-logo" style="background-image:url('${esc(st.logo)}')"></span>`
      : `<span class="studio-logo">${esc(String(st.name || st.code).slice(0, 2).toUpperCase())}</span>`;
  }
  TABS.referrals = async function (body) {
    const ref = S.settings.referral;
    body.innerHTML = html`<div class="card"><h3>${icon('gift')}${t('Código de referido')}</h3><div id="ref-top"></div></div>
      <div class="card"><div class="mem-head"><h3>${icon('trophy')}${t('Ranking de studios')}</h3>
        <div class="segmented" id="rk-period"><button data-p="month">${t('Mensual')}</button><button data-p="all" class="on">All-Time</button></div></div>
        <div id="rk-list"><div class="muted">${t('Cargando...')}</div></div></div>`;
    const top = body.querySelector('#ref-top');
    let ranking = [];
    const drawTop = () => {
      if (ref) {
        const me = ranking.find(r => r.code === ref.code);
        top.innerHTML = html`<div class="ref-card">${studioLogo(ref)}
          <div class="grow"><div class="name" style="font-weight:700;font-size:17px">${esc(ref.name)}</div>
          <div class="sub muted" style="font-size:12px;margin-top:3px"><b style="color:var(--text-2)">${esc(ref.code)}</b> · ${t('Vinculada el {d}', { d: new Date(ref.linkedAt).toLocaleDateString(I18N.locale()) })}</div></div>
          <span class="badge success">${icon('check')}${t('Vinculada')}</span></div>
          <div class="ref-stat">${icon('users')}<span><b>${me ? me.players : '—'}</b> ${t('jugadores apoyan a {s}.', { s: esc(ref.name) })}</span></div>`;
      } else {
        top.innerHTML = html`<p class="muted" style="margin:0 0 14px;font-size:13px">${t('Apoya a tu estudio favorito con su código. Solo puedes vincular uno.')}</p>
          <div class="row"><input class="input" id="ref-code" placeholder="${t('Código del estudio')}" style="text-transform:uppercase" spellcheck="false">
          <button class="btn btn-primary" id="ref-go" style="height:44px">${t('Vincular')}</button></div>`;
        const go = top.querySelector('#ref-go');
        go.onclick = async () => {
          busy(go, true);
          try { const r = await onyx.referrals.link(top.querySelector('#ref-code').value); S.settings.referral = r; toast(t('¡Ahora apoyas a {s}!', { s: r.name }), 'success'); TABS.referrals(body); }
          catch (e) { toast(e.message, 'error'); busy(go, false); }
        };
      }
    };
    const drawRank = async (period) => {
      body.querySelectorAll('#rk-period button').forEach(b => b.classList.toggle('on', b.dataset.p === period));
      try { ranking = await onyx.referrals.ranking(period); } catch { ranking = []; }
      const list = body.querySelector('#rk-list');
      list.innerHTML = ranking.length ? ranking.slice(0, 20).map((r, i) => html`<div class="rank-row ${ref && ref.code === r.code ? 'me' : ''}">
        <span class="pos">${i + 1}</span>${studioLogo(r)}<span class="nm">${esc(r.name)}</span><span class="ct">${r.players}</span></div>`).join('')
        : `<div class="muted" style="font-size:13px">${t('Todavía no hay estudios en el ranking.')}</div>`;
      drawTop();
    };
    body.querySelectorAll('#rk-period button').forEach(b => b.onclick = () => drawRank(b.dataset.p));
    drawTop();
    drawRank('all');
  };

  // ---------- Acerca de ----------
  TABS.about = function (body) {
    const i = S.info;
    const B = i.brand;
    body.innerHTML = html`<div class="card"><div class="about">${brandMark('wordmark')}
        <div class="ver mono">${t('Versión')} v${esc(i.version)} · ${t('Compilación')} ${esc(i.build)} · Core ${esc(i.core)}</div>
        <div class="by">${B ? t('Launcher de {s} · con la tecnología de Onyx Client', { s: esc(B.studioName || B.name) }) : t('Hecho por {s}', { s: esc(i.studio) })}</div>
        ${B && (B.web || B.store) ? `<div class="row" style="justify-content:center;margin:4px 0 6px">${B.web ? `<button class="btn btn-outline btn-sm" data-ext="${esc(B.web)}">${icon('globe')}${t('Web')}</button>` : ''}${B.store ? `<button class="btn btn-outline btn-sm" data-ext="${esc(B.store)}">${icon('external')}${t('Tienda')}</button>` : ''}</div>` : ''}
        <button class="btn btn-primary btn-lg" id="ab-up">${icon('refresh')}${t('Buscar actualizaciones')}</button></div></div>
      <div class="card"><h3>${t('Canal de actualizaciones')} <span class="info-i" title="${t('Beta recibe novedades antes, pero puede tener fallos.')}">i</span></h3>
        <div class="segmented" id="ab-ch"><button data-c="stable">${t('Estable')}</button><button data-c="beta">Beta</button></div>
        <div class="hint" id="ab-ch-d"></div></div>
      <div class="card"><h3>${t('Enlaces')}</h3><div class="row">
        <button class="btn btn-outline" id="ab-dc">${icon('discord')}Discord</button>
        ${i.githubRepo ? `<button class="btn btn-outline" id="ab-gh">${icon('github')}GitHub</button>` : ''}
        <button class="btn btn-outline" id="ab-logs">${icon('folder')}${t('Registros')}</button></div></div>
      <p class="muted" style="font-size:11.5px;text-align:center;margin-top:22px">${t('PRODUCTO NO OFICIAL DE MINECRAFT. NO ESTÁ APROBADO NI ASOCIADO CON MOJANG O MICROSOFT.')}</p>`;
    const drawCh = () => {
      const c = S.settings.updateChannel || 'stable';
      body.querySelectorAll('#ab-ch button').forEach(b => b.classList.toggle('on', b.dataset.c === c));
      body.querySelector('#ab-ch-d').textContent = c === 'beta' ? t('Novedades antes que nadie (puede fallar).') : t('Versiones probadas.');
    };
    body.querySelectorAll('[data-ext]').forEach(x => x.onclick = () => onyx.app.openExternal(x.dataset.ext));
    body.querySelectorAll('#ab-ch button').forEach(b => b.onclick = async () => { await App.saveSettings({ updateChannel: b.dataset.c }); drawCh(); });
    drawCh();
    body.querySelector('#ab-up').onclick = async (e) => {
      const b = e.currentTarget;
      busy(b, true, t('Buscando...'));
      try {
        const r = await onyx.updater.check();
        if (r.status === 'downloaded') {
          if (await UI.confirmModal({ title: t('Actualización lista'), text: t('Se instalará la versión {v} y el launcher se reiniciará.', { v: r.version }), confirm: t('Instalar ahora'), ico: 'refresh' })) onyx.updater.install();
        } else if (r.status === 'latest') toast(t('Ya tienes la última versión'), 'success');
        else if (r.status === 'dev') toast(t('Las actualizaciones solo funcionan en la versión instalada'), 'info');
        else toast(t('No se pudo comprobar ahora mismo'), 'error');
      } finally { busy(b, false); }
    };
    body.querySelector('#ab-dc').onclick = () => i.discordInvite ? onyx.app.openExternal(i.discordInvite) : toast(t('El enlace de Discord aún no está configurado'));
    const gh = body.querySelector('#ab-gh');
    if (gh) gh.onclick = () => onyx.app.openExternal(`https://github.com/${i.githubRepo}`);
    body.querySelector('#ab-logs').onclick = () => onyx.app.openPath('logs');
  };

  // ---------- Términos ----------
  TABS.terms = async function (body) {
    body.innerHTML = html`<div class="card"><h3>${t('Términos y condiciones')}</h3><div class="terms-box" id="terms">${t('Cargando...')}</div></div>`;
    try {
      const md = await onyx.data.terms(S.settings.language || 'es');
      body.querySelector('#terms').innerHTML = UI.markdown(md);
    } catch (e) { body.querySelector('#terms').textContent = e.message; }
  };
})();
