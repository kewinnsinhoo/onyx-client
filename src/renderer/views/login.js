// Pantalla de inicio de sesión: «Por favor inicia sesión con tu cuenta», con Microsoft o sin premium,
// y el idioma. Sustituye a la bienvenida por pasos.
(function () {
  const { esc, html, toast } = UI;
  const LANGS = [['es', 'Español'], ['en', 'English'], ['ca', 'Català'], ['fr', 'Français']];

  async function done() {
    await App.saveSettings({ onboarded: true });
    App.enterApp(true);
  }

  function render(root) {
    const mac = S.info.platform === 'darwin';
    const lang = S.settings.language || 'es';
    root.innerHTML = html`
      <header class="titlebar ${mac ? 'mac' : ''}">
        <div class="brand">${brandMark()}<span class="ver">v${esc(S.info.version || '')}</span></div>
        <div class="spacer"></div>
        ${mac ? '' : `<div class="winctl"><button data-w="min">${icon('minimize')}</button><button data-w="max">${icon('maximize')}</button><button class="close" data-w="close">${icon('close')}</button></div>`}
      </header>
      <div class="lg-body">
        <img class="lg-bg${S.info && S.info.brand ? ' is-brand' : ''}" src="${esc(brandArt())}" alt="">
        <div class="lg-box">
          <h1 class="lg-title"><span>${t('Por favor')} <em>${t('inicia sesión')}</em></span><span class="thin">${t('con tu cuenta')}</span></h1>
          <div class="lg-btns">
            <button class="lg-btn ms" id="lg-ms"><span class="ms-logo"><i></i><i></i><i></i><i></i></span>${t('Cuenta de Microsoft')}</button>
            <button class="lg-btn off" id="lg-off">${icon('user')}${t('Sin premium')}</button>
          </div>
          <label class="lg-lang">${t('Idioma')}
            <span class="sel"><select id="lg-lang">${LANGS.map(([id, n]) => `<option value="${id}" ${id === lang ? 'selected' : ''}>${n}</option>`).join('')}</select>${icon('chevronDown')}</span>
          </label>
        </div>
      </div>`;
    App.bindWinCtl(root);
    root.querySelector('#lg-lang').onchange = async (e) => { await App.saveSettings({ language: e.target.value }); render(root); };
    const ms = root.querySelector('#lg-ms');
    ms.onclick = async () => {
      ms.disabled = true; ms.classList.add('busy');
      try { await App.microsoftLogin(); await done(); }
      catch (err) { if (err.code !== 'cancelled') toast(err, 'error', 7000); }
      finally { ms.disabled = false; ms.classList.remove('busy'); }
    };
    root.querySelector('#lg-off').onclick = () => App.offlineModal(done);
  }

  function show() {
    const root = document.getElementById('onboard');
    root.classList.remove('hidden');
    root.classList.add('login');
    render(root);
  }

  window.Login = { show };
})();
