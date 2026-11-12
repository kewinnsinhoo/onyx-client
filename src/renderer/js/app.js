// Aplicación: arranque, barra superior, rutas, login y modales globales.
(function () {
  const { esc, $, html, toast, modal, dropdown, busy } = UI;
  const S = window.S = { info: {}, settings: {}, accounts: { accounts: [], active: null }, account: null, instances: [], progress: {}, route: null, notifications: [] };
  const Views = window.Views = window.Views || {};
  let cleanup = null;

  // ---------- utilidades de estado ----------
  function applySettings() {
    document.documentElement.dataset.theme = S.settings.theme || 'oled';
    document.body.classList.toggle('reduce-motion', !!S.settings.reduceMotion);
    I18N.set(S.settings.language || 'es');
  }
  async function saveSettings(patch) {
    S.settings = await onyx.settings.set(patch);
    applySettings();
    return S.settings;
  }
  async function loadAccounts() {
    S.accounts = await onyx.accounts.list();
    S.account = S.accounts.accounts.find(a => a.id === S.accounts.active) || S.accounts.accounts[0] || null;
    return S.account;
  }
  async function loadInstances() {
    S.instances = await onyx.instances.list();
    return S.instances;
  }
  function skinOf(acc) {
    if (!acc) return Skin3D.STEVE;
    if (acc.localSkin && acc.localSkin.data) return acc.localSkin.data;
    return acc.skin ? acc.skin.replace(/^http:/, 'https:') : Skin3D.STEVE;
  }
  function variantOf(acc) {
    if (!acc) return 'classic';
    if (acc.localSkin && acc.localSkin.data) return acc.localSkin.variant || 'classic';
    return acc.skinVariant || 'classic';
  }

  // ---------- splash + actualizaciones ----------
  async function splash() {
    const label = $('#splash .label');
    const bar = $('#splash .bar');
    const fill = $('#splash .bar > i');
    label.textContent = t('Buscando actualizaciones...');
    let fake = 6;
    const timer = setInterval(() => { fake = Math.min(fake + 4, 38); fill.style.width = fake + '%'; }, 260);
    const off = onyx.updater.onEvent((e) => {
      if (e.type === 'available') { label.textContent = t('Descargando actualización {v}...', { v: e.version }); clearInterval(timer); }
      if (e.type === 'progress') { fill.style.width = Math.max(4, e.percent) + '%'; }
    });
    let r = { status: 'error' };
    try { r = await onyx.updater.check(); } catch { /* sin conexión */ }
    clearInterval(timer);
    off && off();
    if (r.status === 'downloaded') {
      label.textContent = t('Instalando actualización...');
      bar.classList.add('indeterminate');
      await onyx.updater.install();
      return false;
    }
    fill.style.width = '100%';
    label.textContent = t('Cargando...');
    await new Promise(res => setTimeout(res, 350));
    return true;
  }

  // ---------- login ----------
  function showLogin({ adding = false } = {}) {
    const el = $('#login');
    el.classList.remove('hidden');
    $('#shell').classList.add('hidden');
    el.innerHTML = html`
      ${S.info.platform !== 'darwin' ? `<div class="winctl">
        <button data-w="min">${icon('minimize')}</button><button data-w="max">${icon('maximize')}</button><button class="close" data-w="close">${icon('close')}</button></div>` : ''}
      <div class="box">
        ${onyxMark('logo')}
        <h1>${t('Inicia sesión para continuar')}</h1>
        <p class="sub">${t('Necesitas una cuenta para jugar.')}</p>
        <button class="login-opt" data-l="ms">
          <span class="ico"><span class="ms-logo"><i></i><i></i><i></i><i></i></span></span>
          <span><div class="t">${t('Iniciar sesión con Microsoft')}</div><div class="s">${t('Recomendado')}</div></span>
        </button>
        <button class="login-opt" data-l="off">
          <span class="ico">${icon('user')}</span>
          <span><div class="t">${t('Cuenta offline')}</div><div class="s">${t('Sin licencia · no disponible en instancias Premium')}</div></span>
        </button>
        <button class="quit">${adding ? t('Volver') : t('Salir del launcher')}</button>
      </div>`;
    bindWinCtl(el);
    el.querySelector('[data-l=ms]').onclick = async (e) => {
      const b = e.currentTarget; b.classList.add('busy');
      try { await onyx.accounts.loginMicrosoft(); await afterLogin(); }
      catch (err) { if (err.code !== 'cancelled') toast(err.message, 'error', 6000); }
      finally { b.classList.remove('busy'); }
    };
    el.querySelector('[data-l=off]').onclick = () => offlineModal(afterLogin);
    el.querySelector('.quit').onclick = () => adding && S.account ? hideLogin() : onyx.app.quit();
  }
  function hideLogin() { $('#login').classList.add('hidden'); $('#shell').classList.remove('hidden'); }
  async function afterLogin() {
    await loadAccounts();
    hideLogin();
    renderTopbar();
    go('home');
    toast(t('Sesión iniciada como {name}', { name: S.account.name }), 'success');
  }

  function offlineModal(done) {
    modal((m, close) => {
      m.innerHTML = html`<div class="m-ico">${icon('user')}</div>
        <h2>${t('Cuenta offline')}</h2>
        <p class="sub">${t('Elige tu nombre de jugador. No podrás entrar a instancias Premium.')}</p>
        <div class="field"><label class="field-label">${t('Nombre de jugador')}</label>
        <input class="input" maxlength="16" placeholder="Steve" spellcheck="false"></div>
        <div class="note">${t('3-16 caracteres: letras, números o _')}</div>
        <div class="err"></div>
        <button class="btn btn-primary block btn-lg">${icon('check')}${t('Continuar')}</button>`;
      const input = m.querySelector('input'), btn = m.querySelector('.btn'), err = m.querySelector('.err');
      const submit = async () => {
        err.textContent = '';
        try { busy(btn, true); await onyx.accounts.addOffline(input.value); close(); done && done(); }
        catch (e) { err.textContent = e.message; }
        finally { busy(btn, false); }
      };
      btn.onclick = submit;
      input.onkeydown = (e) => { if (e.key === 'Enter') submit(); };
    });
  }

  function addAccountModal() {
    modal((m, close) => {
      m.innerHTML = html`<div class="m-ico">${icon('users')}</div><h2>${t('Añadir cuenta')}</h2>
        <p class="sub">${t('Elige el tipo de cuenta')}</p>
        <button class="login-opt" data-l="ms"><span class="ico"><span class="ms-logo"><i></i><i></i><i></i><i></i></span></span>
          <span><div class="t">${t('Microsoft')}</div><div class="s">${t('Recomendado')}</div></span></button>
        <button class="login-opt" data-l="off"><span class="ico">${icon('user')}</span>
          <span><div class="t">${t('Offline')}</div><div class="s">${t('Sin licencia')}</div></span></button>`;
      m.querySelector('[data-l=ms]').onclick = async (e) => {
        e.currentTarget.classList.add('busy');
        try { await onyx.accounts.loginMicrosoft(); close(); await refreshAccountUi(); toast(t('Cuenta añadida'), 'success'); }
        catch (err) { if (err.code !== 'cancelled') toast(err.message, 'error', 6000); e.currentTarget && e.currentTarget.classList.remove('busy'); }
      };
      m.querySelector('[data-l=off]').onclick = () => { close(); offlineModal(async () => { await refreshAccountUi(); toast(t('Cuenta añadida'), 'success'); }); };
    });
  }

  async function refreshAccountUi() {
    await loadAccounts();
    if (!S.account) { showLogin(); return; }
    renderTopbar();
    rerender();
  }

  // ---------- código de instancia ----------
  function addInstanceModal() {
    modal((m, close) => {
      m.innerHTML = html`<div class="m-ico">${icon('key')}</div>
        <h2>${t('Añadir instancia')}</h2>
        <p class="sub">${t('Introduce el código de acceso de la instancia.')}</p>
        <div class="field"><label class="field-label">${t('Código de acceso')}</label>
        <input class="input code-input" maxlength="14" placeholder="XXXX-XXXX-XXXX" spellcheck="false" autocomplete="off"></div>
        <div class="note">${t('Distingue mayúsculas y minúsculas.')}</div>
        <div class="err"></div>
        <button class="btn btn-primary block btn-lg" disabled>${icon('check')}${t('Canjear código')}</button>`;
      const input = m.querySelector('input'), btn = m.querySelector('.btn'), err = m.querySelector('.err');
      input.addEventListener('input', () => {
        const raw = input.value.replace(/[^A-Za-z0-9]/g, '').slice(0, 12);
        input.value = raw.match(/.{1,4}/g) ? raw.match(/.{1,4}/g).join('-') : '';
        btn.disabled = raw.length !== 12;
        err.textContent = '';
      });
      const submit = async () => {
        if (btn.disabled) return;
        try {
          busy(btn, true);
          const r = await onyx.instances.redeem(input.value);
          close();
          await loadInstances();
          toast(r.already ? t('Ya tenías {name}: se ha actualizado', { name: r.instance.name }) : t('¡{name} añadida!', { name: r.instance.name }), 'success');
          pushNotification({ title: t('Instancia añadida: {name}', { name: r.instance.name }), kind: 'success' });
          go('instance', { id: r.instance.id });
        } catch (e) { err.textContent = e.message; busy(btn, false); }
      };
      btn.onclick = submit;
      input.onkeydown = (e) => { if (e.key === 'Enter') submit(); };
    });
  }

  // ---------- informe ----------
  function reportModal() {
    modal((m, close) => {
      m.innerHTML = html`<div class="m-ico">${icon('alert')}</div>
        <h2>${t('Enviar informe')}</h2><p class="sub">${t('Cuéntanos qué ha fallado.')}</p>
        <div class="checklist">
          <div>${icon('monitor')}${t('Una captura del launcher')}</div>
          <div>${icon('tag')}${t('Los últimos registros (logs)')}</div>
          <div>${icon('cpu')}${t('Información básica del estado')}</div>
          <div>${icon('lock')}${t('Solo el equipo de {studio} tiene acceso al informe.', { studio: esc(S.info.studio) })}</div>
        </div>
        <textarea class="input" placeholder="${t('Qué ha pasado (opcional)')}"></textarea>
        <div class="actions" style="margin-top:16px"><button class="btn btn-ghost" data-a="c">${t('Cancelar')}</button>
        <button class="btn btn-primary" data-a="s">${icon('send')}${t('Enviar')}</button></div>`;
      m.querySelector('[data-a=c]').onclick = close;
      m.querySelector('[data-a=s]').onclick = async (e) => {
        const b = e.currentTarget;
        const msg = m.querySelector('textarea').value;
        // Ocultar el modal para que no salga en la captura
        m.parentElement.style.visibility = 'hidden';
        try {
          await new Promise(r => setTimeout(r, 120));
          const r = await onyx.report.send(msg);
          close();
          toast(r.sent ? t('Informe enviado. ¡Gracias!') : t('Informe guardado en una carpeta para que lo compartas.'), 'success', 5000);
        } catch (err) { m.parentElement.style.visibility = ''; toast(err.message, 'error'); busy(b, false); }
      };
    }, { wide: false });
  }

  // ---------- avisos ----------
  function pushNotification(n) {
    S.notifications.unshift({ ...n, time: Date.now(), local: true });
    updateBell();
  }
  async function loadNotifications() {
    try {
      const remote = await onyx.data.get('notifications.json');
      const list = Array.isArray(remote) ? remote : (remote && remote.items) || [];
      const local = S.notifications.filter(n => n.local);
      S.notifications = [...local, ...list.map(n => ({ ...n, time: n.date ? Date.parse(n.date) : null }))];
    } catch { /* nada */ }
    updateBell();
  }
  function updateBell() {
    const b = $('#tb-bell');
    if (!b) return;
    const seen = Number(localStorage.getItem('onyx.seenNotif') || 0);
    const unread = S.notifications.some(n => (n.time || 0) > seen);
    b.querySelector('.dot') ? (!unread && b.querySelector('.dot').remove()) : (unread && b.insertAdjacentHTML('beforeend', '<span class="dot"></span>'));
  }
  function openNotifications(anchor) {
    dropdown(anchor, (dd) => {
      localStorage.setItem('onyx.seenNotif', String(Date.now()));
      updateBell();
      const items = S.notifications.slice(0, 12);
      dd.innerHTML = `<div class="dd-title">${t('Avisos')}</div>` + (items.length ? items.map(n => html`
        <div class="notif"${n.url ? ` data-url="${esc(n.url)}" style="cursor:pointer"` : ''}><span class="b ${esc(n.kind || '')}"></span><div>
        <div class="t">${esc(n.title)}</div><div class="s">${esc([n.author, n.time ? UI.timeAgo(n.time) : ''].filter(Boolean).join(' · '))}</div></div></div>`).join('')
        : `<div class="dd-empty">${t('No tienes avisos')}</div>`);
      dd.querySelectorAll('[data-url]').forEach(x => x.onclick = () => onyx.app.openExternal(x.dataset.url));
    }, { width: 320 });
  }

  // ---------- barra superior ----------
  function bindWinCtl(root) {
    root.querySelectorAll('[data-w]').forEach(b => b.onclick = () => {
      const a = b.dataset.w;
      if (a === 'min') onyx.win.minimize(); else if (a === 'max') onyx.win.maximize(); else onyx.win.close();
    });
  }

  function renderTopbar() {
    const tb = $('#titlebar');
    const mac = S.info.platform === 'darwin';
    tb.className = 'titlebar' + (mac ? ' mac' : '');
    const r = S.route ? S.route.name : 'home';
    const act = (n) => (r === n ? 'active' : '');
    tb.innerHTML = html`
      <div class="brand">${onyxMark()}<span>${esc(S.info.name || 'Onyx Client')}</span></div>
      <nav>
        <button class="${act('home')}" data-go="home">${t('Inicio')}</button>
        <button class="${r === 'instances' || r === 'instance' ? 'active' : ''}" id="nav-inst">${t('Instancias')} ${icon('chevronDown')}</button>
        <button class="${act('gallery')}" data-go="gallery">${t('Galería')}</button>
        <button class="${act('creators')}" data-go="creators">${t('Creadores')}</button>
      </nav>
      <div class="spacer"></div>
      <div class="tools">
        <button class="icon-btn ${act('console')}" data-go="console" title="${t('Consola')}">${icon('logs')}</button>
        <button class="avatar-btn ${act('skins')}" data-go="skins" title="${t('Skins')}">${Skin3D.head(skinOf(S.account), 30, 0)}</button>
        <button class="icon-btn ${act('settings')}" data-go="settings" title="${t('Ajustes')}">${icon('settings')}</button>
        <span class="tb-sep"></span>
        <button class="icon-btn" id="tb-bell" title="${t('Avisos')}">${icon('bell')}</button>
        <button class="icon-btn" id="tb-report" title="${t('Enviar informe')}">${icon('alert')}</button>
      </div>
      ${mac ? '' : `<div class="winctl"><button data-w="min">${icon('minimize')}</button><button data-w="max" id="tb-max">${icon('maximize')}</button><button class="close" data-w="close">${icon('close')}</button></div>`}`;
    tb.querySelectorAll('[data-go]').forEach(b => b.onclick = () => go(b.dataset.go));
    bindWinCtl(tb);
    $('#nav-inst').onclick = (e) => instancesMenu(e.currentTarget);
    $('#tb-bell').onclick = (e) => openNotifications(e.currentTarget);
    $('#tb-report').onclick = reportModal;
    tb.ondblclick = (e) => { if (e.target === tb || e.target.classList.contains('spacer')) onyx.win.maximize(); };
    updateBell();
  }

  function instancesMenu(anchor) {
    dropdown(anchor, (dd, close) => {
      const items = S.instances.slice(0, 8);
      dd.innerHTML = (items.length ? items.map(i => html`<button class="dd-item" data-id="${esc(i.id)}">
          <span class="ic" style="${i.icon ? `background-image:url('${esc(i.icon)}')` : ''}">${i.icon ? '' : icon('box')}</span>
          <span class="grow">${esc(i.name)}</span><span class="muted" style="font-size:11.5px">${esc(i.minecraft || '')}</span></button>`).join('')
        : `<div class="dd-empty">${t('Aún no hay instancias')}</div>`) +
        `<div class="dd-sep"></div>
         <button class="dd-item" data-a="all"><span class="ic">${icon('layers')}</span>${t('Ver todas')}</button>
         <button class="dd-item" data-a="add"><span class="ic">${icon('plus')}</span>${t('Añadir instancia')}</button>`;
      dd.querySelectorAll('[data-id]').forEach(b => b.onclick = () => { close(); go('instance', { id: b.dataset.id }); });
      dd.querySelector('[data-a=all]').onclick = () => { close(); go('instances'); };
      dd.querySelector('[data-a=add]').onclick = () => { close(); addInstanceModal(); };
    }, { align: 'left', width: 270 });
  }

  // ---------- rutas ----------
  function go(name, params = {}) {
    UI.closeDropdown();
    if (cleanup) { try { cleanup(); } catch { /* nada */ } cleanup = null; }
    S.route = { name, params };
    renderTopbar();
    const view = $('#view');
    view.scrollTop = 0;
    view.innerHTML = '';
    const v = Views[name] || Views.home;
    const r = v(view, params);
    if (typeof r === 'function') cleanup = r;
    else if (r && r.then) r.then(fn => { if (typeof fn === 'function') cleanup = fn; }).catch(e => toast(e.message, 'error'));
  }
  function rerender() { if (S.route) go(S.route.name, S.route.params); }

  // ---------- jugar ----------
  const STAGES = {
    version: 'Preparando versión', libraries: 'Descargando librerías', assets: 'Descargando recursos',
    java: 'Preparando Java', files: 'Sincronizando archivos', launching: 'Iniciando Minecraft', running: 'Jugando', exited: 'Cerrado'
  };
  function stageText(p) {
    if (!p) return '';
    const base = t(STAGES[p.stage] || p.stage);
    return p.total > 1 ? `${base} · ${p.done}/${p.total}` : base;
  }
  async function play(id) {
    if (!S.account) return showLogin();
    const inst = S.instances.find(i => i.id === id);
    if (inst && inst.premium && S.account.type !== 'msa') {
      toast(t('Esta instancia es Premium: necesitas una cuenta de Microsoft.'), 'error', 5000);
      return;
    }
    S.progress[id] = { stage: 'version' };
    document.dispatchEvent(new CustomEvent('onyx:progress', { detail: { id } }));
    try {
      await onyx.instances.play(id);
      pushNotification({ title: t('Jugando a {name}', { name: inst ? inst.name : id }), kind: 'success' });
    } catch (e) {
      delete S.progress[id];
      document.dispatchEvent(new CustomEvent('onyx:progress', { detail: { id } }));
      toast(e.message, 'error', 7000);
    }
  }

  // ---------- arranque ----------
  async function boot() {
    try {
      S.info = await onyx.app.info();
      S.settings = await onyx.settings.get();
    } catch (e) { console.error(e); }
    applySettings();
    $('#splash .logo-wrap').innerHTML = onyxWordmark('logo');
    if (S.info.platform === 'darwin') document.body.classList.add('mac');

    onyx.instances.onProgress((p) => {
      if (p.stage === 'exited') { delete S.progress[p.id]; loadInstances(); }
      else S.progress[p.id] = p;
      document.dispatchEvent(new CustomEvent('onyx:progress', { detail: p }));
    });
    onyx.win.onState(({ maximized }) => { const b = $('#tb-max'); if (b) b.innerHTML = icon(maximized ? 'restore' : 'maximize'); });

    const proceed = await splash();
    if (!proceed) return;

    await loadAccounts().catch(() => {});
    await loadInstances().catch(() => {});
    const sp = $('#splash');
    sp.style.opacity = '0';
    setTimeout(() => sp.remove(), 380);

    if (!S.account) showLogin();
    else { hideLogin(); go('home'); }
    loadNotifications();
    setInterval(loadNotifications, 5 * 60e3);
  }

  window.App = {
    go, rerender, play, stageText, addInstanceModal, addAccountModal, offlineModal, reportModal, showLogin,
    loadAccounts, loadInstances, refreshAccountUi, saveSettings, skinOf, variantOf, pushNotification, renderTopbar
  };
  document.addEventListener('DOMContentLoaded', boot);
})();
