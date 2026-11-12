// Entrada: login con Discord, invitaciones y estados sin studio.
(function () {
  const V = window.Views;
  const box = (inner) => { document.body.innerHTML = `<div class="gate"><div class="box">${inner}</div></div>`; };
  const ERR = { cancelled: 'Cancelaste el inicio de sesión.', state: 'La sesión caducó. Vuelve a intentarlo.', discord: 'Discord no respondió. Vuelve a intentarlo.' };

  V.login = (r) => {
    const next = r.query.get('next') || '/';
    const err = r.query.get('error');
    box(html`<img class="logo" src="/img/logo-wordmark.png" alt="Onyx Client">
      <h1>${t('Panel de studios')}</h1>
      <p>${t('Entra con tu cuenta de Discord para gestionar las instancias de tu studio.')}</p>
      ${err ? `<div class="note warn" style="margin-bottom:16px;text-align:left">${icon('alert')}<span>${esc(t(ERR[err] || 'No se pudo iniciar sesión.'))}</span></div>` : ''}
      <a class="btn discord" href="/auth/login?next=${encodeURIComponent('/' + (next.startsWith('#') ? next : '#' + next))}">${icon('discord')}${t('Continuar con Discord')}</a>
      <p style="margin:18px 0 0;font-size:12.5px">${t('Solo pueden entrar los studios invitados por Onyx.')}</p>`);
  };

  V.invite = async (r) => {
    const token = r.parts[1] || '';
    box(`<div class="skel" style="height:180px"></div>`);
    let info;
    try { info = await api('GET', `/invites/${encodeURIComponent(token)}`, undefined, { quiet: true }); }
    catch (e) {
      return box(html`<div class="empty"><div class="ic">${icon('link')}</div><h4>${t('Invitación no válida')}</h4><p>${esc(e.message)}</p>
        <a class="btn" href="#/">${t('Ir al panel')}</a></div>`);
    }
    let me = null;
    try { me = await api('GET', '/me', undefined, { quiet: true }); } catch { /* sin sesión */ }
    box(html`<img class="logo" src="/img/logo-wordmark.png" alt="Onyx Client">
      <h1>${t('Te han invitado')}</h1>
      <p>${t('{by} te invita a {studio} como {role}.', { by: info.by || 'Onyx', studio: info.studio, role: roleName(info.role) })}</p>
      ${me ? `<button class="btn primary" style="width:100%;height:46px" id="accept">${icon('check')}${t('Aceptar invitación')}</button>
              <p style="margin:14px 0 0;font-size:12.5px">${t('Entrarás como {name}.', { name: esc(me.user.name) })}</p>`
           : `<a class="btn discord" href="/auth/login?next=${encodeURIComponent('/#/invite/' + token)}">${icon('discord')}${t('Continuar con Discord')}</a>`}`);
    const b = $('#accept');
    if (b) b.onclick = async () => {
      busy(b, true);
      try { const res = await api('POST', `/invites/${encodeURIComponent(token)}/accept`); S.me = null; try { localStorage.setItem('onyx-studio', res.studio); } catch { /* nada */ } location.hash = '#/'; location.reload(); }
      catch (e) { fail(e); busy(b, false); }
    };
  };

  V.noStudio = () => {
    box(html`<img class="logo" src="/img/logo-wordmark.png" alt="Onyx Client">
      <h1>${t('Aún no tienes studio')}</h1>
      <p>${t('Para entrar necesitas una invitación. Pídele a Onyx o al dueño de tu studio el enlace de invitación y ábrelo con esta cuenta.')}</p>
      <div class="pick" style="cursor:default;margin-bottom:16px"><span class="av" style="border-radius:50%">${S.me.user.avatar ? `<img src="${esc(S.me.user.avatar)}" alt="">` : initials(S.me.user.name)}</span><span><b>${esc(S.me.user.name)}</b><small>Discord</small></span></div>
      <button class="btn" style="width:100%" id="out">${icon('logout')}${t('Cerrar sesión')}</button>`);
    $('#out').onclick = async () => { await fetch('/auth/logout', { method: 'POST' }); location.hash = '#/login'; location.reload(); };
  };

  V.offline = (e) => box(html`<div class="empty"><div class="ic">${icon('alert')}</div><h4>${t('No se pudo conectar')}</h4><p>${esc(e.message)}</p><button class="btn" onclick="location.reload()">${icon('refresh')}${t('Reintentar')}</button></div>`);

  V.notFound = (view) => { view.innerHTML = html`<div class="page"><div class="card empty"><div class="ic">${icon('search')}</div><h4>${t('Esta página no existe')}</h4><a class="btn" href="#/">${t('Ir al inicio')}</a></div></div>`; };

  V.soon = (view, title, text, ico) => {
    view.innerHTML = html`<div class="page"><div class="page-head"><div><h1>${esc(title)}</h1></div></div>
      <div class="card empty"><div class="ic">${icon(ico)}</div><h4>${t('Próximamente')}</h4><p>${esc(text)}</p></div></div>`;
  };
})();
