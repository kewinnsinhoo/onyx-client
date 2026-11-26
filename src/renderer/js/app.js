// Aplicación: arranque, barra lateral, rutas, cuentas y modales globales.
(function () {
  const { esc, $, html, toast, modal, dropdown, busy } = UI;
  const S = window.S = { info: {}, settings: {}, accounts: { accounts: [], active: null }, account: null, instances: [], progress: {}, route: null, notifications: [] };
  const Views = window.Views = window.Views || {};
  let cleanup = null;

  // ---------- launcher de marca (nombre, logo, colores y fondo del studio) ----------
  const hexRgb = (h) => { const n = parseInt(h.slice(1), 16); return [n >> 16 & 255, n >> 8 & 255, n & 255]; };
  const mix = (h, w, k) => { const a = hexRgb(h), b = hexRgb(w); return '#' + a.map((v, i) => Math.round(v + (b[i] - v) * k).toString(16).padStart(2, '0')).join(''); };
  function applyBrand() {
    const b = S.info.brand;
    if (!b) return;
    document.body.classList.add('branded');
    document.title = b.name;
    if (window.I18N && I18N.brand) I18N.brand(b.name); // los textos dicen el nombre de la marca en vez de Kopi
    const ok = (c) => /^#[0-9a-f]{6}$/i.test(c || '');
    if (ok(b.accent)) {
      // Luz de un color (0 negro … 1 blanco): con colores claros (p. ej. blanco) el texto de los botones va oscuro
      const lum = (h) => { const c = hexRgb(h).map(v => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; }); return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2]; };
      const a = b.accent;
      let a2 = ok(b.accent2) ? b.accent2 : mix(a, '#000000', 0.25);
      // un degradado de blanco a negro no se puede leer con ningún color de texto: el segundo color se acerca al primero
      if (Math.abs(lum(a) - lum(a2)) > 0.35) a2 = mix(a, '#000000', 0.22);
      const [r, g, bl] = hexRgb(a), [r2, g2, b2] = hexRgb(a2);
      const st = document.documentElement.style;
      st.setProperty('--on-accent', lum(mix(a, a2, 0.5)) > 0.4 ? '#15111b' : '#ffffff');
      st.setProperty('--accent', a);
      st.setProperty('--accent-2', a2);
      st.setProperty('--accent-soft', `rgba(${r},${g},${bl},.14)`);
      st.setProperty('--accent-grad', `linear-gradient(135deg, ${mix(a, '#ffffff', 0.18)} 0%, ${a} 55%, ${a2} 100%)`);
      st.setProperty('--accent-shadow', `0 10px 28px -8px rgba(${r2},${g2},${b2},.65)`);
      // Fondo, bordes y textos con el tono de la marca (si no, quedaba el morado de Kopi)
      const tint = (base, k) => mix(base, a, k);
      const rgb = (h) => hexRgb(h).join(' ');
      st.setProperty('--k1', rgb(a));
      st.setProperty('--k2', rgb(a2));
      st.setProperty('--k3', rgb(mix(a, '#ffffff', 0.2)));
      st.setProperty('--accent-light', mix(a, '#ffffff', 0.3));
      st.setProperty('--deep-1', tint('#1e1e23', 0.10));
      st.setProperty('--deep-2', tint('#121215', 0.06));
      st.setProperty('--deep-3', tint('#0f0f12', 0.05));
      st.setProperty('--deep-4', tint('#0b0b0d', 0.04));
      st.setProperty('--bg', tint('#09090b', 0.035));
      st.setProperty('--bg-2', tint('#0f0f12', 0.05));
      st.setProperty('--surface-solid', tint('#151518', 0.05));
      st.setProperty('--border', `rgba(${r},${g},${bl},.10)`);
      st.setProperty('--border-strong', `rgba(${r},${g},${bl},.20)`);
      st.setProperty('--text', tint('#f5f5f7', 0.05));
      st.setProperty('--text-2', tint('#d6d6db', 0.07));
      st.setProperty('--muted', tint('#9b9ba4', 0.10));
      st.setProperty('--faint', tint('#66666e', 0.10));
      st.setProperty('--glow-1', `rgba(${r2},${g2},${b2},.22)`);
      st.setProperty('--glow-2', `rgba(${r},${g},${bl},.12)`);
    }
    if (b.background && !/\.(webm|mp4)$/i.test(b.background)) {
      document.body.style.setProperty('--brand-bg', `url("${String(b.background).replace(/["\\]/g, '')}")`);
      document.body.classList.add('has-brand-bg');
    }
  }
  // Logo de arriba: el del studio (si lo tiene) o su nombre escrito; en Kopi, el de Kopi
  window.brandMark = (cls = '') => {
    const b = S.info && S.info.brand;
    if (!b) return `<img class="${cls}" src="assets/logo-wordmark.png" alt="Kopi Client">`;
    return b.logo ? `<img class="${cls} brand-logo" src="${esc(b.logo)}" alt="${esc(b.name)}">` : `<b class="${cls} brand-name">${esc(b.name)}</b>`;
  };

  // Dibujo grande de fondo (inicio de sesión, tarjeta del perfil): el pulpo de Kopi o, en un launcher de marca,
  // su logo (o su icono si no tiene logo)
  window.brandArt = () => {
    const b = S.info && S.info.brand;
    return b ? (b.logo || 'assets/icon.png') : 'assets/logo-mark.png';
  };

  // ---------- utilidades de estado ----------
  function applySettings() {
    document.documentElement.dataset.theme = ['onyx', 'oled', 'amethyst', 'aurora', 'indigo'].includes(S.settings.theme) ? S.settings.theme : 'onyx';
    document.body.classList.toggle('reduce-motion', !!S.settings.reduceMotion);
    I18N.set(S.settings.language || 'es');
  }
  async function saveSettings(patch) {
    S.settings = await onyx.settings.set(patch);
    applySettings();
    return S.settings;
  }
  const premiumSkins = {};
  // ---------- marcos y fondos de perfil (del panel) ----------
  S.look = { owned: { frame: ['none', 'silver'], bg: ['none', 'night'] }, worn: { frame: null, bg: null } };
  let lookFor = null;
  async function loadLooks() {
    const who = S.account && S.account.id;
    const r = await onyx.looks.get();
    if (!r || !r.owned || (S.account && S.account.id) !== who) return;
    S.look = r;
    renderChrome();
    document.dispatchEvent(new CustomEvent('onyx:look', { detail: r }));
  }
  const myFrame = () => (S.look && S.look.worn && S.look.worn.frame) || null;
  const myBg = () => (S.look && S.look.worn && S.look.worn.bg) || null;
  // Una cara con el marco que lleva el jugador (solo la cuenta activa tiene marco)
  const framedHead = (acc, size, radius = 0) => {
    const h = Skin3D.head(skinOf(acc), size, radius);
    return acc && S.account && acc.id === S.account.id && myFrame() && window.KopiCosmetics ? KopiCosmetics.wrap(h, myFrame(), size) : h;
  };
  async function loadAccounts() {
    S.accounts = await onyx.accounts.list();
    S.account = S.accounts.accounts.find(a => a.id === S.accounts.active) || S.accounts.accounts[0] || null;
    if (S.account && S.account.id !== lookFor) { lookFor = S.account.id; S.look = { ...S.look, worn: { frame: null, bg: null } }; loadLooks().catch(() => {}); }
    // Cuentas offline sin skin propia: usar la skin de Minecraft del jugador premium con ese nombre (si existe)
    for (const a of S.accounts.accounts) {
      if (a.type === 'msa' || (a.localSkin && a.localSkin.data)) continue;
      const key = a.name.toLowerCase();
      if (premiumSkins[key] === undefined) {
        premiumSkins[key] = null;
        onyx.skins.lookup(a.name).then((p) => {
          if (!p || !p.skin) return;
          premiumSkins[key] = p;
          loadAccounts().then(() => { renderTopbar(); if (S.route && ['home', 'skins', 'settings'].includes(S.route.name)) rerender(); });
        }).catch(() => {});
      } else if (premiumSkins[key]) {
        a.skin = premiumSkins[key].skin;
        a.skinVariant = premiumSkins[key].variant;
      }
    }
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

  // La actualización no se pudo instalar sola: se explica en la pantalla de carga y se puede seguir
  function updateFailed(reason, version) {
    const box = $('#splash');
    $('#splash .bar').classList.add('hidden');
    const msg = reason === 'dmg'
      ? t('Kopi Client está abierto desde el instalador. Arrástralo a Aplicaciones y ábrelo desde ahí: así se actualizará solo.')
      : t('La versión {v} no se pudo instalar sola. Descárgala e instálala encima: no pierdes nada.', { v: version || '' });
    $('#splash .label').innerHTML = html`<div class="upd-fail"><p>${msg}</p><div class="row">
      <button class="btn btn-primary" data-a="get">${icon('download')}${t('Descargar a mano')}</button>
      <button class="btn btn-outline" data-a="go">${t('Seguir sin actualizar')}</button></div></div>`;
    return new Promise((resolve) => {
      box.querySelector('[data-a="get"]').onclick = async () => onyx.app.openExternal(await onyx.updater.page());
      box.querySelector('[data-a="go"]').onclick = () => { $('#splash .bar').classList.remove('hidden', 'indeterminate'); resolve(true); };
    });
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
      // Si en 40 s no se ha cerrado para instalar, no se queda aquí para siempre: se explica y se sigue
      const res = await Promise.race([
        Promise.resolve(onyx.updater.install()).catch(() => ({ ok: false })),
        new Promise(ok => setTimeout(() => ok({ ok: false, reason: 'timeout' }), 40000))
      ]);
      if (res && res.ok === false && res.reason !== 'none') return updateFailed(res.reason, r.version);
      if (res && res.ok) await new Promise(ok => setTimeout(ok, 40000)).then(() => updateFailed('timeout', r.version));
      return false;
    }
    fill.style.width = '100%';
    label.textContent = t('Cargando...');
    await new Promise(res => setTimeout(res, 350));
    return true;
  }

  // ---------- cuenta: pantalla de inicio de sesión ----------
  function showLogin() {
    closeDrawer();
    $('#shell').classList.add('hidden');
    Login.show();
  }
  async function enterApp(firstTime) {
    await loadAccounts();
    $('#onboard').classList.add('hidden');
    $('#shell').classList.remove('hidden');
    renderChrome();
    go('home');
    if (firstTime && S.account) toast(t('¡Bienvenido, {name}!', { name: S.account.name }), 'success');
    whatsNew().catch(() => {});
    setTimeout(() => checkBadges().catch(() => {}), 2500);
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

  // Login de Microsoft: se abre el navegador del sistema y aquí se muestra una espera.
  async function microsoftLogin() {
    let closeWait = null, cancelled = false;
    const waitModal = () => modal((m, close) => {
      closeWait = close;
      m.classList.add('ms-wait');
      m.innerHTML = html`<div class="m-ico ms-ico"><span class="ms-logo"><i></i><i></i><i></i><i></i></span></div>
        <h2>${t('Continúa en tu navegador')}</h2>
        <p class="sub">${t('Hemos abierto la página de Microsoft en tu navegador. Inicia sesión ahí y vuelve: se completará solo.')}</p>
        <div class="ms-wait-row"><span class="ms-dots"><i></i><i></i><i></i></span>${t('Esperando a Microsoft…')}</div>
        <div class="actions"><button class="btn btn-ghost" data-a="cancel">${t('Cancelar')}</button>
          <button class="btn btn-outline" data-a="reopen">${icon('external')}${t('Abrir de nuevo')}</button></div>
        <button class="ms-alt" data-a="window">${t('¿No se abre? Iniciar sesión en una ventana del launcher')}</button>`;
      m.querySelector('[data-a=cancel]').onclick = () => { cancelled = true; onyx.accounts.cancelLogin(); };
      m.querySelector('[data-a=reopen]').onclick = () => onyx.accounts.reopenLogin();
      m.querySelector('[data-a=window]').onclick = () => { cancelled = 'window'; onyx.accounts.cancelLogin(); };
    }, { dismissable: false });
    waitModal();
    try {
      return await onyx.accounts.loginMicrosoft('browser');
    } catch (e) {
      if (cancelled === 'window') { if (closeWait) closeWait(); closeWait = null; return onyx.accounts.loginMicrosoft('window'); }
      throw e;
    } finally { if (closeWait) closeWait(); }
  }

  function addAccountModal() {
    modal((m, close) => {
      m.innerHTML = html`<div class="m-ico">${icon('users')}</div><h2>${t('Añadir cuenta')}</h2>
        <p class="sub">${t('Elige el tipo de cuenta')}</p>
        <button class="opt-card" data-l="ms"><span class="ico"><span class="ms-logo"><i></i><i></i><i></i><i></i></span></span>
          <span><div class="t">${t('Microsoft')}</div><div class="s">${t('Recomendado')}</div></span></button>
        <button class="opt-card" data-l="off"><span class="ico">${icon('user')}</span>
          <span><div class="t">${t('Offline')}</div><div class="s">${t('Sin licencia')}</div></span></button>`;
      m.querySelector('[data-l=ms]').onclick = async (e) => {
        e.currentTarget.classList.add('busy');
        try { await microsoftLogin(); close(); await refreshAccountUi(); toast(t('Cuenta añadida'), 'success'); }
        catch (err) { if (err.code !== 'cancelled') toast(err, 'error', 6000); e.currentTarget && e.currentTarget.classList.remove('busy'); }
      };
      m.querySelector('[data-l=off]').onclick = () => { close(); offlineModal(async () => { await refreshAccountUi(); toast(t('Cuenta añadida'), 'success'); }); };
    });
  }

  async function refreshAccountUi() {
    await loadAccounts();
    if (!S.account) { showLogin(); return; }
    renderChrome();
    rerender();
  }

  // ---------- cuentas: la actual destacada, las otras y cerrar sesión ----------
  function accountsModal() {
    closeDrawer();
    modal((m, close) => {
      const draw = () => {
        const all = S.accounts.accounts, cur = S.account;
        const others = all.filter(a => !cur || a.id !== cur.id);
        const kind = (a) => a.type === 'msa' ? 'Microsoft' : t('Sin premium');
        m.classList.add('acc-modal');
        m.innerHTML = html`<div class="acc-k">${t('Cuentas')}</div>
          ${cur ? html`<div class="acc-cur">${Skin3D.head(skinOf(cur), 64, 0)}
            <div><b>${esc(cur.name)}</b><span class="tag">${t('Jugando ahora')}</span><small>${kind(cur)}</small></div></div>` : ''}
          <div class="acc-k2">${t('Otras cuentas')}</div>
          <p class="acc-p">${t('Añade otra cuenta para cambiar de jugador sin cerrar sesión.')}</p>
          ${others.map(a => html`<div class="acc-row">${Skin3D.head(skinOf(a), 40, 0)}
            <div class="grow"><b>${esc(a.name)}</b><small>${kind(a)}</small></div>
            <button class="btn btn-outline btn-sm" data-use="${esc(a.id)}">${t('Usar')}</button>
            <button class="icon-btn" data-rm="${esc(a.id)}" title="${t('Quitar')}">${icon('trash')}</button></div>`).join('')}
          <button class="acc-add" id="acc-add"><span class="ic">${icon('plus')}</span><span><b>${t('Añadir otra cuenta')}</b><small>${t('Microsoft o sin premium')}</small></span></button>
          <div class="acc-foot"><button class="acc-out" id="acc-out">${icon('logout')}${t('Cerrar sesión')}</button></div>`;
        m.querySelectorAll('[data-use]').forEach(b => b.onclick = async () => { await onyx.accounts.setActive(b.dataset.use); await refreshAccountUi(); draw(); });
        m.querySelectorAll('[data-rm]').forEach(b => b.onclick = async () => { await onyx.accounts.remove(b.dataset.rm); await loadAccounts(); draw(); });
        m.querySelector('#acc-add').onclick = () => { close(); addAccountModal(); };
        m.querySelector('#acc-out').onclick = () => { close(); logout(); };
      };
      draw();
    });
  }
  // Cerrar sesión: quita la cuenta en uso. Si no queda ninguna, vuelve a la pantalla de inicio de sesión.
  async function logout() {
    closeDrawer();
    if (!S.account) return showLogin();
    if (!(await UI.confirmModal({ title: t('¿Cerrar sesión?'), text: t('Se quitará {name} de este launcher. Podrás volver a entrar cuando quieras.', { name: S.account.name }), confirm: t('Cerrar sesión'), danger: true, ico: 'logout' }))) return;
    await onyx.accounts.remove(S.account.id);
    await refreshAccountUi();
  }

  // ---------- panel lateral (al pulsar tu avatar) ----------
  function closeDrawer() {
    const d = document.getElementById('drawer');
    if (!d) return;
    d.classList.remove('open');
    setTimeout(() => d.remove(), 220);
  }
  function openDrawer() {
    if (document.getElementById('drawer')) return closeDrawer();
    const d = document.createElement('div');
    d.id = 'drawer';
    const acc = S.account, b = S.info.brand;
    const item = (a, ic, label) => `<button class="dr-item" data-a="${a}">${icon(ic)}<span>${t(label)}</span></button>`;
    d.innerHTML = html`<div class="dr-shade"></div><aside class="dr-panel">
      <button class="dr-back" title="${t('Cerrar')}">${icon('chevronLeft')}</button>
      <div class="dr-me"><div class="dr-skin ${myFrame() ? 'framed' : ''}">${framedHead(acc, 112, 0)}<button class="dr-swap" title="${t('Cambiar de cuenta')}">${icon('refresh')}</button></div>
        <b>${esc(acc ? acc.name : t('Sin cuenta'))}</b><small>${acc ? (acc.type === 'msa' ? 'Microsoft' : t('Sin premium')) : ''}</small></div>
      <nav class="dr-list">
        ${item('profile', 'idcard', 'Mi perfil')}${item('skins', 'user', 'Editar skin')}${item('settings', 'settings', 'Ajustes')}${item('gallery', 'image', 'Galería')}${item('creators', 'users', 'Creadores')}
        ${item('help', 'alert', 'Ayuda y comentarios')}${item('about', 'info', 'Acerca de')}
        ${item('accounts', 'refresh', 'Cambiar de cuenta')}${item('logout', 'logout', 'Cerrar sesión')}
      </nav>
      <div class="dr-foot">${b ? (b.logo ? `<img src="${esc(b.logo)}" alt="">` : `<b>${esc(b.name)}</b>`) : '<img src="assets/logo-studio.png" alt="Kopi Studio">'}
        <button class="dr-terms" data-a="terms">${t('Términos y condiciones')}</button></div>
    </aside>`;
    document.body.appendChild(d);
    requestAnimationFrame(() => d.classList.add('open'));
    d.querySelector('.dr-shade').onclick = closeDrawer;
    d.querySelector('.dr-back').onclick = closeDrawer;
    d.querySelector('.dr-swap').onclick = accountsModal;
    d.querySelectorAll('[data-a]').forEach(btn => btn.onclick = () => {
      const a = btn.dataset.a;
      if (a === 'accounts') return accountsModal();
      if (a === 'logout') return logout();
      closeDrawer();
      if (a === 'help') return reportModal();
      if (a === 'about') return go('settings', { tab: 'about' });
      if (a === 'terms') return go('settings', { tab: 'terms' });
      go(a);
    });
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
        } catch (e) { err.textContent = t(e.message, e.vars); busy(btn, false); }
      };
      btn.onclick = submit;
      input.onkeydown = (e) => { if (e.key === 'Enter') submit(); };
    });
  }

  // ---------- informe ----------
  function reportModal(prefill) {
    modal((m, close) => {
      m.innerHTML = html`<div class="m-ico">${icon('alert')}</div>
        <h2>${t('Enviar informe')}</h2><p class="sub">${t('Cuéntanos qué ha fallado.')}</p>
        <div class="checklist">
          <div>${icon('monitor')}${t('Una captura del launcher')}</div>
          <div>${icon('tag')}${t('Los últimos registros (logs)')}</div>
          <div>${icon('cpu')}${t('Información básica del estado')}</div>
          <div>${icon('lock')}${t('Solo el equipo de {studio} tiene acceso al informe.', { studio: esc(S.info.studio) })}</div>
        </div>
        <textarea class="input" placeholder="${t('Qué ha pasado (opcional)')}">${esc(typeof prefill === 'string' ? prefill : '')}</textarea>
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
        } catch (err) { m.parentElement.style.visibility = ''; toast(t(err.message, err.vars), 'error'); busy(b, false); }
      };
    }, { wide: false });
  }

  // ---------- novedades del launcher ----------
  // «1.7.6-beta.2» → [1, 7, 6]; compara versiones
  const vnum = (v) => String(v || '0').split('-')[0].split('.').map(n => parseInt(n, 10) || 0);
  const vcmp = (a, b) => { const x = vnum(a), y = vnum(b); for (let i = 0; i < 3; i++) if ((x[i] || 0) !== (y[i] || 0)) return (x[i] || 0) - (y[i] || 0); return 0; };
  const LANG_COL = { es: 1, en: 2, ca: 3, fr: 4 };
  const clText = (item) => item[LANG_COL[S.settings.language] || 1] || item[1];
  function changesModal(entries, { updated } = {}) {
    if (!entries.length) return;
    const app = S.info.name || 'Kopi Client';
    const fmt = (d) => { try { return new Date(d + 'T12:00:00').toLocaleDateString(I18N.locale ? I18N.locale() : undefined, { day: 'numeric', month: 'long', year: 'numeric' }); } catch { return d; } };
    const [first, ...rest] = entries;
    modal((m, close) => {
      m.classList.add('changes-modal');
      m.innerHTML = html`<div class="ch-hero"><div class="ch-glow"></div>${brandMark()}</div>
        <span class="ch-ver">v${esc(first.v)}</span>
        <h2>${updated ? t('¡{app} se ha actualizado!', { app: esc(app) }) : t('Novedades del launcher')}</h2>
        <p class="sub">${updated ? t('Esto es lo nuevo:') : t('Lo que ha traído cada versión.')}</p>
        <div class="ch-list">
          <div class="ch-items">${first.items.map(it => `<div class="ch-item"><span class="ch-ic">${icon(it[0])}</span><span>${esc(clText(it))}</span></div>`).join('')}</div>
          ${rest.map(e => html`<div class="ch-old"><div class="ch-old-h"><b>v${esc(e.v)}</b><small>${esc(fmt(e.date))}</small></div>
            ${e.items.map(it => `<div class="ch-item sm"><span class="ch-ic">${icon(it[0])}</span><span>${esc(clText(it))}</span></div>`).join('')}</div>`).join('')}
        </div>
        <div class="actions"><button class="btn btn-primary" data-a="ok">${updated ? t('¡Genial!') : t('Cerrar')}</button></div>`;
      m.querySelector('[data-a=ok]').onclick = close;
    }, { wide: true });
  }
  // Al abrir el launcher: si se ha actualizado, enseña una vez lo nuevo de las versiones que no había visto
  async function whatsNew() {
    const cur = S.info.version, seen = S.settings.lastSeenVersion;
    if (!cur || !window.CHANGELOG) return;
    // Primera vez que se abre (recién instalado): nada que enseñar
    if (!seen && !S.settings.onboarded) { await saveSettings({ lastSeenVersion: cur }).catch(() => {}); return; }
    if (seen && vcmp(cur, seen) <= 0) return;
    // Venía de una versión sin este aviso: solo lo de esta versión
    const list = CHANGELOG.filter(e => e.items.length && vcmp(e.v, cur) <= 0 && (seen ? vcmp(e.v, seen) > 0 : vcmp(e.v, cur) === 0)).slice(0, 4);
    await saveSettings({ lastSeenVersion: cur }).catch(() => {});
    if (list.length) setTimeout(() => changesModal(list, { updated: true }), 700);
  }
  // ---------- insignias: ¿hay alguna nueva? ----------
  // Se miran al abrir el launcher y al acabar de jugar. La primera vez se guardan sin avisar (si no, saldrían todas).
  S.badges = null;
  async function checkBadges() {
    const r = await onyx.badges.list();
    if (!r || !r.badges) return null;
    S.badges = r;
    document.dispatchEvent(new CustomEvent('onyx:badges', { detail: r }));
    const earned = r.badges.filter(b => b.earned).map(b => b.id);
    const seen = S.settings.seenBadges;
    if (!Array.isArray(seen)) { await saveSettings({ seenBadges: earned }).catch(() => {}); return r; }
    const fresh = r.badges.filter(b => b.earned && !seen.includes(b.id));
    if (fresh.length) {
      await saveSettings({ seenBadges: [...new Set([...seen, ...earned])] }).catch(() => {});
      const R = Badge.RARITIES;
      fresh.sort((a, b) => R.indexOf(b.rarity) - R.indexOf(a.rarity));
      newBadgeModal(fresh);
    }
    return r;
  }
  const badgeName = (b) => b.custom || b.cat === 'event' ? b.name : t(b.name);
  const badgeDesc = (b) => b.custom ? b.desc : t(b.desc);
  // La medalla aparece girando con rayos de luz detrás; si son varias, se ven en fila
  function newBadgeModal(list) {
    const b = list[0];
    modal((m, close) => {
      m.classList.add('nb-modal', 'r-' + b.rarity);
      m.innerHTML = html`<div class="nb-rays"></div>
        <div class="nb-medal">${Badge.medal(b, 132)}</div>
        <span class="nb-k">${list.length > 1 ? t('¡{n} insignias nuevas!', { n: list.length }) : t('¡Insignia nueva!')}</span>
        <h2>${esc(badgeName(b))}</h2>
        <span class="bdg-r r-${b.rarity}">${t(Badge.rarityName[b.rarity])}</span>
        <p class="sub">${esc(badgeDesc(b))}${b.studio ? ` · ${esc(b.studio)}` : ''}</p>
        ${list.length > 1 ? `<div class="nb-more">${list.slice(1, 7).map(x => `<span title="${esc(badgeName(x))}">${Badge.medal(x, 40)}</span>`).join('')}</div>` : ''}
        <div class="actions"><button class="btn btn-ghost" data-a="no">${t('Cerrar')}</button><button class="btn btn-primary" data-a="yes">${icon('user')}${t('Ver en mi perfil')}</button></div>`;
      m.querySelector('[data-a=no]').onclick = close;
      m.querySelector('[data-a=yes]').onclick = () => { close(); go('profile'); };
    });
  }

  const allChanges = () => changesModal((window.CHANGELOG || []).filter(e => e.items.length && vcmp(e.v, S.info.version) <= 0), { updated: false });

  // ---------- novedades de la instancia ----------
  // Solo lo que escribe el studio (las listas automáticas de mods que cambian ya no se enseñan)
  const newsOf = (i) => (i.news || []).filter(n => n.text && String(n.text).trim());
  const unseenNews = (i) => newsOf(i).filter(n => n.at > (i.newsSeen || 0)).length;
  // Texto del studio: las líneas con «-» salen como lista; el resto, como párrafos
  function newsText(s) {
    const out = [];
    let list = [];
    const flush = () => { if (list.length) { out.push(`<ul>${list.map(x => `<li>${esc(x)}</li>`).join('')}</ul>`); list = []; } };
    for (const line of String(s || '').split(/\r?\n/)) {
      const l = line.trim();
      if (/^[-•*]\s+/.test(l)) list.push(l.replace(/^[-•*]\s+/, ''));
      else { flush(); if (l) out.push(`<p>${esc(l)}</p>`); }
    }
    flush();
    return out.join('');
  }
  function newsModal(id) {
    const inst = S.instances.find(i => i.id === id);
    if (!inst || !newsOf(inst).length) return;
    const seen = inst.newsSeen || 0;
    modal((m, close) => {
      m.classList.add('news-modal');
      m.innerHTML = html`<div class="m-ico">${icon('megaphone')}</div>
        <h2>${t('Novedades de {name}', { name: esc(inst.name) })}</h2>
        <p class="sub">${inst.studio && inst.studio.name ? t('Lo último de {studio}.', { studio: esc(inst.studio.name) }) : t('Lo último de la instancia.')}</p>
        <div class="news-list">${newsOf(inst).map(n => html`<div class="news-item ${n.at > seen ? 'new' : ''}">
          <div class="news-meta"><span>${esc(UI.timeAgo(n.at))}</span>${n.at > seen ? `<span class="news-new">${t('Nuevo')}</span>` : ''}</div>
          <div class="news-text">${newsText(n.text)}</div>
        </div>`).join('')}</div>
        <div class="actions"><button class="btn btn-primary" data-a="ok">${t('Entendido')}</button></div>`;
      m.querySelector('[data-a=ok]').onclick = close;
    }, { wide: true });
    // vistas: se quita el puntito
    onyx.instances.seenNews(id).then(v => {
      const i = S.instances.find(x => x.id === id);
      if (i) i.newsSeen = (v && v.newsSeen) || Date.now();
      renderChrome();
      document.dispatchEvent(new CustomEvent('onyx:news', { detail: { id } }));
    }).catch(() => {});
  }

  // ---------- arreglo de cierres ----------
  // El juego se cerró con un error: qué pasó, en palabras sencillas, y un botón para arreglarlo.
  const CRASH = {
    memory: ['cpu', 'El juego se quedó sin memoria', 'Minecraft necesitaba más memoria (RAM) de la que tenía ({mb} MB).'],
    heap: ['cpu', 'Java no pudo arrancar con tanta memoria', 'Esta instancia pide {mb} MB de memoria y tu PC no puede darle tanta ahora mismo.'],
    jvmargs: ['settings', 'Hay un ajuste de Java que no vale', 'Los argumentos de Java que pusiste en Ajustes no funcionan.'],
    java: ['coffee', 'La versión de Java no es la correcta', 'Esta versión de Minecraft necesita otra Java distinta de la que elegiste en Ajustes.'],
    missing: ['package', 'Falta un mod', 'El mod «{mod}» necesita «{dep}» y no está en la instancia.'],
    incompatible: ['package', 'Hay mods que no se llevan bien', 'Algunos mods de la instancia no funcionan juntos.'],
    duplicate: ['package', 'Hay un mod repetido', 'La instancia tiene dos copias del mismo mod.'],
    corrupt: ['download', 'Un archivo está dañado', 'Algún archivo de la instancia se descargó mal o se ha roto.'],
    perf: ['zap', 'El modo rendimiento choca con un mod', 'Los mods de rendimiento de Kopi no se llevan bien con algún mod de esta instancia.'],
    mixin: ['package', 'Un mod choca con otro', 'Dos mods de la instancia chocan entre sí.'],
    driver: ['monitor', 'Fallo del controlador de la tarjeta gráfica', 'El controlador de tu tarjeta gráfica se ha cerrado. Casi siempre se arregla actualizándolo.'],
    jvm: ['alert', 'Java se ha cerrado de golpe', 'Puede ser la tarjeta gráfica, un mod o el propio PC.'],
    generic: ['alert', 'El juego se ha cerrado con un error', 'Minecraft se ha cerrado de golpe.']
  };
  function crashText(c) {
    const v = c.vars || {};
    if (c.kind === 'incompatible' && v.mod && v.dep) return t('«{mod}» no funciona con la versión de «{dep}» que trae la instancia.', v);
    if (c.kind === 'mixin' && v.mod) return t('El mod «{mod}» choca con otro mod de la instancia.', v);
    if (c.kind === 'driver' && v.vendor) return t('El controlador de tu tarjeta gráfica {vendor} se ha cerrado. Casi siempre se arregla actualizándolo.', v);
    if (c.kind === 'generic' && v.desc) return t('Minecraft dice: «{desc}».', v) + (v.error ? ` (${esc(v.error)})` : '');
    return t(CRASH[c.kind][2], v);
  }
  const FIX_LABEL = {
    ram: (f, c) => c.kind === 'heap' ? t('Bajar la memoria a {mb} MB y jugar', { mb: f.mb }) : t('Subir la memoria a {mb} MB y jugar', { mb: f.mb }),
    repair: () => t('Reparar los archivos y jugar'),
    perf: () => t('Apagar el modo rendimiento y jugar'),
    java: () => t('Usar la Java automática y jugar'),
    jvmargs: () => t('Quitar los argumentos de Java y jugar'),
    drivers: (f) => f.url ? t('Actualizar el controlador de {vendor}', { vendor: f.vendor }) : null
  };
  function crashModal(id, c) {
    const inst = S.instances.find(i => i.id === id);
    const [ic, title] = CRASH[c.kind] || CRASH.generic;
    const fix = (c.fixes || []).find(f => FIX_LABEL[f.type] && FIX_LABEL[f.type](f, c));
    const onlyStudio = ['missing', 'incompatible', 'mixin'].includes(c.kind);
    modal((m, close) => {
      m.classList.add('crash');
      m.innerHTML = html`<div class="m-ico bad">${icon(ic)}</div>
        <h2>${t(title)}</h2>
        <p class="sub">${crashText(c)}</p>
        ${inst ? `<div class="crash-inst">${icon('box')}<span>${esc(inst.name)}</span></div>` : ''}
        ${onlyStudio ? `<p class="crash-note">${icon('info')}<span>${t('Esto lo tiene que arreglar el studio de la instancia. Mándales el informe para que lo vean.')}</span></p>` : ''}
        <div class="crash-acts">
          ${fix ? `<button class="btn btn-primary" data-a="fix">${icon(fix.type === 'drivers' ? 'external' : 'wrench')}${esc(FIX_LABEL[fix.type](fix, c))}</button>` : ''}
          <button class="btn ${fix ? 'btn-ghost' : 'btn-primary'}" data-a="report">${icon('send')}${t('Enviar el error al studio')}</button>
        </div>
        ${c.lines && c.lines.length ? html`<details class="crash-more"><summary>${t('Ver detalles')}</summary>
          <pre>${esc(c.lines.join('\n'))}</pre><button class="btn btn-ghost btn-sm" data-a="copy">${icon('copy')}${t('Copiar')}</button></details>` : ''}
        <div class="actions"><button class="btn btn-ghost" data-a="close">${t('Cerrar')}</button>
          <button class="btn btn-ghost" data-a="again">${icon('play')}${t('Volver a jugar')}</button></div>`;
      const $a = (a) => m.querySelector(`[data-a=${a}]`);
      $a('close').onclick = close;
      $a('again').onclick = () => { close(); play(id); };
      $a('report').onclick = () => { close(); reportModal(`${t(title)} — ${inst ? inst.name : id}\n${(c.lines || []).slice(0, 4).join('\n')}`); };
      const cp = $a('copy');
      if (cp) cp.onclick = () => { navigator.clipboard.writeText(c.lines.join('\n')).then(() => toast(t('Copiado'), 'success')).catch(() => {}); };
      const fb = $a('fix');
      if (fb) fb.onclick = async () => {
        if (fix.type === 'drivers') { onyx.app.openExternal(fix.url); return; }
        busy(fb, true);
        try {
          if (fix.type === 'ram') await onyx.instances.setMemory(id, fix.mb);
          else if (fix.type === 'perf') await onyx.instances.setPerfMode(id, false);
          else if (fix.type === 'repair') await onyx.instances.update(id);
          else if (fix.type === 'java' || fix.type === 'jvmargs') { await onyx.crash.fix(id, { type: fix.type }); S.settings = await onyx.settings.get(); }
          await loadInstances();
          close();
          toast(t('Arreglado. Volviendo a abrir el juego…'), 'success', 4000);
          play(id);
        } catch (err) { busy(fb, false); toast(t(err.message, err.vars), 'error'); }
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
      // En un launcher de marca, los avisos de Kopi hablan de la marca («¡Bienvenido a Nova Launcher!» · Nova Studios)
      const b = S.info && S.info.brand;
      const own = (n) => ({ ...n, title: t(n.title || ''), body: n.body ? t(n.body) : n.body,
        author: b && /^kopi( studios?| client)?$/i.test(String(n.author || '').trim()) ? (b.studioName || b.name) : n.author });
      S.notifications = [...local, ...list.map(n => own({ ...n, time: n.date ? Date.parse(n.date) : null }))];
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
        <div class="t">${esc(n.title)}</div>${n.body ? `<div class="m">${esc(n.body)}</div>` : ''}<div class="s">${esc([n.author, n.time ? UI.timeAgo(n.time) : ''].filter(Boolean).join(' · '))}</div></div></div>`).join('')
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

  const SECTION = { home: 'Inicio', instances: 'Instancias', instance: 'Instancias', gallery: 'Galería', creators: 'Creadores', profile: 'Mi perfil', skins: 'Skins', settings: 'Ajustes', console: 'Consola' };

  function renderChrome() {
    const tb = $('#titlebar');
    const mac = S.info.platform === 'darwin';
    const r = S.route ? S.route.name : 'home';
    tb.className = 'titlebar' + (mac ? ' mac' : '');
    tb.innerHTML = html`
      <div class="brand">${brandMark()}<span class="ver">v${esc(S.info.version || '')}</span></div>
      <span class="crumb">${t(SECTION[r] || 'Inicio')}</span>
      <div class="spacer"></div>
      <div class="tools">
        <button class="icon-btn ${r === 'console' ? 'active' : ''}" data-go="console" title="${t('Consola')}">${icon('logs')}</button>
        <button class="icon-btn" id="tb-bell" title="${t('Avisos')}">${icon('bell')}</button>
        <button class="icon-btn" id="tb-report" title="${t('Enviar informe')}">${icon('alert')}</button>
      </div>
      ${mac ? '' : `<span class="tb-sep"></span><div class="winctl"><button data-w="min">${icon('minimize')}</button><button data-w="max" id="tb-max">${icon('maximize')}</button><button class="close" data-w="close">${icon('close')}</button></div>`}`;
    tb.querySelectorAll('[data-go]').forEach(b => b.onclick = () => go(b.dataset.go));
    bindWinCtl(tb);
    $('#tb-bell').onclick = (e) => openNotifications(e.currentTarget);
    $('#tb-report').onclick = reportModal;
    tb.ondblclick = (e) => { if (e.target === tb || e.target.classList.contains('spacer') || e.target.classList.contains('crumb')) onyx.win.maximize(); };

    const sb = $('#sidebar');
    const curInst = r === 'instance' && S.route.params ? S.route.params.id : null;
    const tileBg = (i) => i.icon || i.banner;
    const inMenu = ['instances', 'profile', 'skins', 'gallery', 'creators', 'settings'].includes(r) || (r === 'instance' && !S.instances.find(i => i.id === curInst));
    sb.innerHTML = html`
      <button class="sb-home ${r === 'home' ? 'active' : ''}" data-go="home" title="${t('Inicio')}">${icon('home')}</button>
      <span class="nav-sep"></span>
      <div class="inst-pins">
        ${S.instances.map(i => html`<button class="pin ${curInst === i.id ? 'active' : ''}" data-inst="${esc(i.id)}" title="${esc(i.name)}"
          style="${tileBg(i) ? `background-image:url('${esc(tileBg(i))}')` : ''}">${tileBg(i) ? '' : `<b>${esc(i.name.slice(0, 2).toUpperCase())}</b>`}${S.progress[i.id] && S.progress[i.id].stage === 'running' ? '<span class="live"></span>' : unseenNews(i) ? `<span class="pin-news" title="${esc(t('Novedades'))}"></span>` : ''}</button>`).join('')}
      </div>
      <div class="bottom">
        <button class="sb-add" id="sb-add" title="${t('Añadir instancia')}">${icon('plus')}</button>
        <button class="avatar-btn ${inMenu ? 'active' : ''} ${myFrame() ? 'framed' : ''}" id="sb-me" title="${esc(S.account ? S.account.name : t('Más opciones'))}">${framedHead(S.account, 50, 0)}</button>
      </div>`;
    sb.querySelectorAll('[data-go]').forEach(b => b.onclick = () => go(b.dataset.go));
    sb.querySelectorAll('[data-inst]').forEach(b => b.onclick = () => go('instance', { id: b.dataset.inst }));
    $('#sb-add').onclick = addInstanceModal;
    $('#sb-me').onclick = openDrawer;
    updateBell();
  }
  const renderTopbar = renderChrome;

  // ---------- rutas ----------
  function go(name, params = {}) {
    UI.closeDropdown();
    closeDrawer();
    if (cleanup) { try { cleanup(); } catch { /* nada */ } cleanup = null; }
    S.route = { name, params };
    renderChrome();
    if (onyx.discord && onyx.discord.presence) onyx.discord.presence(name, params.id || null).catch(() => {});
    const view = $('#view');
    view.scrollTop = 0;
    view.innerHTML = '';
    delete view.dataset.still;
    const v = Views[name] || Views.home;
    const r = v(view, params);
    if (typeof r === 'function') cleanup = r;
    else if (r && r.then) r.then(fn => { if (typeof fn === 'function') cleanup = fn; }).catch(e => toast(e, 'error'));
  }
  function rerender() { if (S.route) go(S.route.name, S.route.params); }

  // ---------- jugar ----------
  const STAGES = {
    version: 'Preparando versión', libraries: 'Descargando librerías', assets: 'Descargando recursos',
    java: 'Preparando Java', loader: 'Instalando el loader', unlock: 'Abriendo los mods', files: 'Sincronizando archivos', launching: 'Iniciando Minecraft', running: 'Jugando', exited: 'Cerrado'
  };
  function stageText(p) {
    if (!p) return '';
    const base = t(STAGES[p.stage] || p.stage);
    return p.total > 1 ? `${base} · ${p.done}/${p.total}` : base;
  }
  async function play(id, opts) {
    if (!S.account) return showLogin();
    const inst = S.instances.find(i => i.id === id);
    if (inst && inst.premium && S.account.type !== 'msa') {
      toast(t('Esta instancia es Premium: necesitas una cuenta de Microsoft.'), 'error', 5000);
      return;
    }
    S.progress[id] = { stage: 'version' };
    document.dispatchEvent(new CustomEvent('onyx:progress', { detail: { id } }));
    try {
      await onyx.instances.play(id, opts);
      pushNotification({ title: t('Jugando a {name}', { name: inst ? inst.name : id }), kind: 'success' });
    } catch (e) {
      delete S.progress[id];
      document.dispatchEvent(new CustomEvent('onyx:progress', { detail: { id } }));
      const vars = { ...(e.vars || {}) };
      if (vars.at) vars.date = new Date(vars.at).toLocaleString(I18N.locale(), { weekday: 'long', day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit' });
      toast(t(e.message, vars), e.code === 'predownloaded' ? 'success' : 'error', 8000);
      // La instancia ya no es tuya: se quita de la lista
      if (e.removed) { await loadInstances(); renderChrome(); if (S.route && S.route.name === 'instance' && S.route.params.id === id) go('home'); }
    }
  }

  // ---------- arranque ----------
  async function boot() {
    try {
      S.info = await onyx.app.info();
      S.settings = await onyx.settings.get();
    } catch (e) { console.error(e); }
    applySettings();
    applyBrand();
    $('#splash .logo-wrap').innerHTML = brandMark();
    if (S.info.platform === 'darwin') document.body.classList.add('mac');

    onyx.instances.onProgress((p) => {
      const was = S.progress[p.id] && S.progress[p.id].stage;
      if (p.stage === 'exited') {
        delete S.progress[p.id];
        loadInstances().then(renderChrome);
        setTimeout(() => checkBadges().catch(() => {}), 4000); // ¿ganó alguna insignia jugando?
        if (p.kicked) toast(t('El studio ha cerrado la instancia'), 'error', 9000);
        else if (p.crash) crashModal(p.id, p.crash); // se cerró con un error: qué pasó y cómo arreglarlo
      }
      else S.progress[p.id] = p;
      if ((p.stage === 'running') !== (was === 'running')) renderChrome();
      document.dispatchEvent(new CustomEvent('onyx:progress', { detail: p }));
    });
    // Jugar con amigos: tu mundo se abrió por internet (la dirección ya está copiada)
    S.friends = {};
    if (onyx.instances.onFriends) onyx.instances.onFriends((f) => {
      if (f.address) {
        S.friends[f.id] = f.address;
        toast(t('Tu mundo está abierto. Dirección copiada: {addr}', { addr: f.address }), 'success', 9000);
      } else delete S.friends[f.id];
      document.dispatchEvent(new CustomEvent('onyx:friends', { detail: f }));
    });
    // Instancias siempre al día: lo que se descarga en segundo plano
    S.bg = {};
    if (onyx.instances.onBackground) onyx.instances.onBackground((b) => {
      if (b.state === 'updating') S.bg[b.id] = b; else delete S.bg[b.id];
      if (b.list) { S.instances = b.list; renderChrome(); }
      document.dispatchEvent(new CustomEvent('onyx:bg', { detail: b }));
    });
    // El panel añadió o cambió instancias (lista manual, instancia pública, nueva portada...)
    if (onyx.instances.onChanged) onyx.instances.onChanged((payload) => {
      const list = Array.isArray(payload) ? payload : payload.list;
      const removed = (payload && payload.removed) || [];
      S.instances = list;
      renderChrome();
      for (const name of removed) toast(t('Ya no tienes acceso a {name}', { name }), 'info', 7000);
      // Si estabas mirando una instancia que ya no tienes, vuelve al inicio
      if (S.route && S.route.name === 'instance' && !list.some(i => i.id === S.route.params.id)) return go('home');
      if (S.route && ['home', 'instances', 'instance'].includes(S.route.name)) { const v = document.getElementById('view'); if (v) v.dataset.still = '1'; rerender(); }
    });
    onyx.win.onState(({ maximized }) => { const b = $('#tb-max'); if (b) b.innerHTML = icon(maximized ? 'restore' : 'maximize'); });

    const proceed = await splash();
    if (!proceed) return;

    await loadAccounts().catch(() => {});
    await loadInstances().catch(() => {});
    const sp = $('#splash');
    sp.style.opacity = '0';
    setTimeout(() => sp.remove(), 380);

    if (!S.settings.onboarded || !S.account) showLogin();
    else enterApp(false);
    loadNotifications();
    setInterval(loadNotifications, 5 * 60e3); // los avisos nuevos del panel llegan solos
    setInterval(loadNotifications, 5 * 60e3);
  }

  window.App = {
    go, rerender, play, stageText, checkBadges, newBadgeModal, badgeName, badgeDesc, crashModal, newsModal, unseenNews, newsOf, allChanges, whatsNew, addInstanceModal, addAccountModal, accountsModal, logout, openDrawer, closeDrawer, offlineModal, reportModal, showLogin, enterApp, bindWinCtl,
    loadAccounts, loadInstances, loadLooks, myFrame, myBg, framedHead, refreshAccountUi, microsoftLogin, saveSettings, skinOf, variantOf, pushNotification, renderTopbar, renderChrome
  };
  document.addEventListener('DOMContentLoaded', boot);
})();
