// Bienvenida por pasos: idioma → cuenta → studio (opcional) → ajustes. Sin términos y condiciones.
(function () {
  const { esc, html, toast, busy } = UI;
  const STEPS = ['lang', 'account', 'studio', 'advanced'];
  const LANGS = [['es', 'Español'], ['ca', 'Català'], ['en', 'English'], ['fr', 'Français']];

  let state = { step: 'welcome', accountOnly: false };

  function art() {
    const stars = Array.from({ length: 70 }, () =>
      `<i style="left:${(Math.random() * 100).toFixed(1)}%;top:${(Math.random() * 70).toFixed(1)}%;animation-delay:${(Math.random() * 3).toFixed(2)}s;opacity:${(0.2 + Math.random() * 0.7).toFixed(2)};transform:scale(${(0.6 + Math.random() * 0.9).toFixed(2)})"></i>`).join('');
    const minis = [[14, 20, 54, 0], [78, 16, 40, 1.4], [70, 70, 64, 2.6], [20, 72, 36, 3.6]]
      .map(([x, y, w, d]) => `<img class="mini" src="assets/logo-mark.png" style="left:${x}%;top:${y}%;width:${w}px;animation-delay:-${d}s">`).join('');
    return `<div class="ob-art"><div class="stars">${stars}</div><div class="grid"></div><div class="ground"></div>${minis}<img class="hero-cube" src="assets/logo-mark.png"></div>`;
  }

  function show({ startAt = 'welcome', accountOnly = false } = {}) {
    state = { step: startAt, accountOnly };
    const root = document.getElementById('onboard');
    root.classList.remove('hidden');
    const mac = S.info.platform === 'darwin';
    root.innerHTML = html`
      <header class="titlebar ${mac ? 'mac' : ''}">
        <div class="brand"><img src="assets/logo-wordmark.png" alt="Onyx Client"><span class="ver">v${esc(S.info.version || '')}</span></div>
        <div class="spacer"></div>
        ${mac ? '' : `<div class="winctl"><button data-w="min">${icon('minimize')}</button><button data-w="max">${icon('maximize')}</button><button class="close" data-w="close">${icon('close')}</button></div>`}
      </header>
      <div class="ob-body"><div class="ob-left" id="ob-left"></div><div class="ob-right">${art()}</div></div>`;
    App.bindWinCtl(root);
    render();
  }

  function go(step) { state.step = step; render(); }
  function next() {
    const i = STEPS.indexOf(state.step);
    if (state.step === 'welcome') return go('lang');
    if (i < STEPS.length - 1) return go(STEPS[i + 1]);
    finish();
  }
  function back() {
    const i = STEPS.indexOf(state.step);
    go(i <= 0 ? 'welcome' : STEPS[i - 1]);
  }
  async function finish() {
    await App.saveSettings({ onboarded: true });
    App.enterApp(true);
  }

  function frame({ title, sub, body, nextLabel = t('Siguiente'), nextDisabled = false, showBack = true, top = false }) {
    const idx = STEPS.indexOf(state.step);
    const steps = state.accountOnly ? '' :
      `<div class="ob-steps">${STEPS.map((s, i) => `<i class="${i <= idx ? 'on' : ''}"></i>`).join('')}</div>
       <div class="ob-count">${idx + 1} / ${STEPS.length}</div>`;
    return html`
      <div class="ob-content ${top ? 'top' : ''}">
        ${steps}
        <h1>${title}</h1>
        <p class="ob-sub">${sub}</p>
        ${body}
      </div>
      <div class="ob-nav">
        ${showBack && !state.accountOnly ? `<button class="btn btn-ghost" id="ob-back">${icon('arrowLeft')}${t('Atrás')}</button>` : '<span></span>'}
        <button class="btn btn-primary btn-lg" id="ob-next" ${nextDisabled ? 'disabled' : ''}>${nextLabel}${icon('arrowRight')}</button>
      </div>`;
  }

  function bindNav(left) {
    const b = left.querySelector('#ob-back');
    if (b) b.onclick = back;
    const n = left.querySelector('#ob-next');
    if (n) n.onclick = () => (state.accountOnly ? App.enterApp(false) : next());
  }

  function render() {
    const left = document.getElementById('ob-left');
    if (!left) return;
    const s = state.step;

    if (s === 'welcome') {
      left.innerHTML = html`<div class="ob-content ob-welcome">
          <img class="wordmark" src="assets/logo-wordmark.png" alt="Onyx Client">
          <h1>${t('Bienvenido')}</h1>
          <p class="ob-sub">${t('Las instancias de tu studio de Minecraft, listas para jugar en un clic.')}</p>
          <div><button class="btn btn-primary btn-lg" id="ob-start">${t('Empezar')}${icon('arrowRight')}</button></div>
        </div>`;
      left.querySelector('#ob-start').onclick = next;
      return;
    }

    if (s === 'lang') {
      const cur = S.settings.language || 'es';
      left.innerHTML = frame({
        title: t('Elige tu idioma'), sub: t('Puedes cambiarlo después en Ajustes.'),
        body: `<div class="lang-grid" style="max-width:440px">${LANGS.map(([id, name]) =>
          `<button class="lang-opt ${cur === id ? 'on' : ''}" data-lang="${id}">${flag(id)}${name}${cur === id ? `<span class="check">${icon('check')}</span>` : ''}</button>`).join('')}</div>`,
        showBack: true
      });
      left.querySelectorAll('[data-lang]').forEach(b => b.onclick = async () => { await App.saveSettings({ language: b.dataset.lang }); render(); });
      bindNav(left);
      return;
    }

    if (s === 'account') {
      const acc = S.account;
      const connected = acc ? html`<div class="list-item" style="max-width:440px;margin-bottom:14px;border-color:var(--accent);background:var(--accent-soft)">
          ${Skin3D.head(App.skinOf(acc), 42, 9)}
          <div class="grow"><div class="name">${esc(acc.name)}</div><div class="sub">${acc.type === 'msa' ? 'Microsoft' : t('Offline')}</div></div>
          <span class="badge success">${icon('check')}${t('Conectada')}</span></div>` : '';
      left.innerHTML = frame({
        title: t('Conecta tu cuenta'), sub: t('Inicia sesión con tu cuenta de Microsoft para jugar con tu skin y en instancias Premium.'),
        body: html`${connected}
          <button class="opt-card" data-l="ms"><span class="ico"><span class="ms-logo"><i></i><i></i><i></i><i></i></span></span>
            <span class="grow"><div class="t">${t('Iniciar sesión con Microsoft')}</div><div class="s">${t('Recomendado')}</div></span>${icon('chevronRight')}</button>
          <button class="opt-card" data-l="off"><span class="ico">${icon('user')}</span>
            <span class="grow"><div class="t">${t('Cuenta offline')}</div><div class="s">${t('Sin licencia · no disponible en instancias Premium')}</div></span>${icon('chevronRight')}</button>`,
        nextDisabled: !acc,
        nextLabel: state.accountOnly ? t('Continuar') : t('Siguiente')
      });
      left.querySelector('[data-l=ms]').onclick = async (e) => {
        const b = e.currentTarget; b.classList.add('busy');
        try { await App.microsoftLogin(); await App.loadAccounts(); toast(t('Sesión iniciada como {name}', { name: S.account.name }), 'success'); render(); }
        catch (err) { if (err.code !== 'cancelled') toast(err.message, 'error', 7000); }
        finally { b.classList.remove('busy'); }
      };
      left.querySelector('[data-l=off]').onclick = () => App.offlineModal(async () => { await App.loadAccounts(); render(); });
      bindNav(left);
      return;
    }

    if (s === 'studio') {
      const ref = S.settings.referral;
      left.innerHTML = frame({
        title: t('¿Te ha traído un studio?'), sub: t('Si tienes su código de referido, ponlo aquí. Es opcional y solo se puede poner una vez.'),
        body: ref ? html`<div class="ref-card" style="max-width:440px">
              <span class="studio-logo" style="${ref.logo ? `background-image:url('${esc(ref.logo)}')` : ''}">${ref.logo ? '' : esc(String(ref.name).slice(0, 2).toUpperCase())}</span>
              <div class="grow"><div style="font-weight:750;font-size:16px">${esc(ref.name)}</div><div class="muted" style="font-size:12px;margin-top:3px">${esc(ref.code)}</div></div>
              <span class="badge success">${icon('check')}${t('Vinculada')}</span></div>`
          : html`<div class="row" style="max-width:440px"><input class="input" id="ob-ref" placeholder="${t('Código del estudio')}" style="text-transform:uppercase" spellcheck="false">
              <button class="btn btn-outline" id="ob-ref-go" style="height:44px">${t('Vincular')}</button></div>`,
        nextLabel: ref ? t('Siguiente') : t('Omitir')
      });
      const go2 = left.querySelector('#ob-ref-go');
      if (go2) go2.onclick = async () => {
        busy(go2, true);
        try { const r = await onyx.referrals.link(left.querySelector('#ob-ref').value); S.settings.referral = r; toast(t('¡Ahora apoyas a {s}!', { s: r.name }), 'success'); render(); }
        catch (e) { toast(e.message, 'error'); busy(go2, false); }
      };
      bindNav(left);
      return;
    }

    if (s === 'advanced') {
      const totalGb = Math.max(2, Math.floor((S.info.totalMemMb || 8192) / 1024));
      const recGb = Math.max(2, Math.floor(totalGb * 0.72));
      let gb = Math.min(totalGb, Math.max(2, Math.round((S.settings.memoryMb || 4096) / 1024)));
      left.innerHTML = frame({
        title: t('Ajustes avanzados'), sub: t('Opcional. Puedes cambiarlo cuando quieras.'),
        body: html`<div class="card" style="max-width:440px">
            <div class="mem-head"><h3>${icon('cpu')}${t('Memoria')}</h3>
              <div class="stepper"><button id="m-minus">${icon('minimize')}</button><span class="val" id="m-val"></span><button id="m-plus">${icon('plus')}</button></div></div>
            <div class="mem-slider"><div class="track"><div class="fill" id="m-fill"></div><div class="danger" style="width:${((totalGb - recGb) / (totalGb - 2 || 1)) * 100}%"></div></div>
              <div class="thumb" id="m-thumb"></div><input type="range" id="m-range" min="2" max="${totalGb}" step="1" value="${gb}"></div>
            <div class="mem-scale"><span>2 GB</span><span>${totalGb} GB</span></div>
            <div class="hint">${t('{t} GB en este equipo · recomendado hasta {r} GB', { t: totalGb, r: recGb })}</div></div>
          <div class="card" style="max-width:440px"><h3>${icon('monitor')}${t('Ventana de juego')}</h3>
            <div class="row"><input class="input" id="w-w" style="text-align:center" placeholder="${t('Automática')}" value="${esc(S.settings.windowWidth || '')}">
            <span class="muted">×</span><input class="input" id="w-h" style="text-align:center" placeholder="${t('Automática')}" value="${esc(S.settings.windowHeight || '')}"></div></div>`,
        nextLabel: t('Finalizar'), top: true
      });
      const range = left.querySelector('#m-range');
      const draw = () => {
        const pct = ((gb - 2) / (totalGb - 2 || 1)) * 100;
        left.querySelector('#m-val').textContent = gb + ' GB';
        left.querySelector('#m-fill').style.width = pct + '%';
        left.querySelector('#m-thumb').style.left = pct + '%';
        range.value = gb;
      };
      const set = (v) => { gb = Math.max(2, Math.min(totalGb, v)); draw(); };
      range.oninput = () => set(Number(range.value));
      left.querySelector('#m-minus').onclick = () => set(gb - 1);
      left.querySelector('#m-plus').onclick = () => set(gb + 1);
      draw();
      bindNav(left);
      left.querySelector('#ob-next').onclick = async () => {
        await App.saveSettings({
          memoryMb: gb * 1024,
          windowWidth: left.querySelector('#w-w').value.replace(/\D/g, ''),
          windowHeight: left.querySelector('#w-h').value.replace(/\D/g, '')
        });
        finish();
      };
    }
  }

  window.Onboarding = { show };
})();
