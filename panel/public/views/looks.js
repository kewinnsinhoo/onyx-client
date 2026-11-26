// Marcos y fondos de perfil (solo el Creador): verlos animados, regalarlos y quitarlos.
// El dibujo viene de /js/cosmetics.js (el mismo en el launcher y en la web).
(function () {
  const V = window.Views;
  const K = window.KopiCosmetics;
  const isCreator = () => S.me && S.me.user.role === 'creator';
  const num = (n) => Number(n || 0).toLocaleString(I18N.locale());
  const ORDER = { mythic: 0, legendary: 1, epic: 2, rare: 3, common: 4 };
  const players = (n) => (n === 1 ? t('1 jugador') : t('{n} jugadores', { n: num(n) }));
  const KIND = { frame: { list: K.FRAMES, get: K.getFrame, title: 'Marcos' }, bg: { list: K.BGS, get: K.getBg, title: 'Fondos' } };
  let tab = 'frame';

  const rarity = (it) => K.RARITY[it.rarity];
  const rarityBadge = (it) => `<span class="badge cape-rarity" style="--r:${rarity(it).color}"><span class="dot"></span>${esc(t(rarity(it).label))}</span>`;
  const FACE = 'data:image/svg+xml;utf8,' + encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 8 8" shape-rendering="crispEdges"><rect width="8" height="8" fill="#c58c5a"/><rect width="8" height="2" fill="#3b2414"/><rect y="2" width="1" height="1" fill="#3b2414"/><rect x="7" y="2" width="1" height="1" fill="#3b2414"/><rect x="1" y="4" width="2" height="1" fill="#fff"/><rect x="2" y="4" width="1" height="1" fill="#2563eb"/><rect x="5" y="4" width="2" height="1" fill="#fff"/><rect x="5" y="4" width="1" height="1" fill="#2563eb"/><rect x="3" y="6" width="2" height="1" fill="#7c3f20"/></svg>');
  // La muestra: un marco alrededor de una cara, o un fondo en una tarjetita con una cara
  const sample = (kind, it, big) => kind === 'frame'
    ? `<div class="lk-stage ${big ? 'big' : ''}">${K.wrap(`<img class="lk-face" src="${FACE}" alt="">`, it.id, big ? 112 : 70)}</div>`
    : `<div class="lk-stage lk-bgs ${big ? 'big' : ''}">${K.bgLayer(it.id)}<img class="lk-face sm" src="${FACE}" alt=""><span class="lk-bar"></span></div>`;
  const how = (it) => it.free ? t('Gratis para todos') : it.badge ? t('Con la insignia «{b}»', { b: t(it.badge === 'kopi-creator' ? 'Creador' : 'Equipo Kopi') }) : null;
  const head = (name) => `<span class="cape-head"><span>${initials(name)}</span><img src="https://mc-heads.net/avatar/${encodeURIComponent(name)}/32" alt="" width="32" height="32" loading="lazy" onerror="this.remove()"></span>`;

  V.looks = async (view) => {
    if (!isCreator()) return V.notFound(view);
    const data = await api('GET', '/onyx/looks');
    const draw = () => {
      const k = KIND[tab];
      const stats = Object.fromEntries(data[tab].map(x => [x.id, x]));
      const list = k.list.filter(x => x.id !== 'none').sort((a, b) => ORDER[a.rarity] - ORDER[b.rarity]);
      const given = (kk) => data[kk].reduce((n, x) => n + x.owners, 0), wearing = (kk) => data[kk].reduce((n, x) => n + x.wearing, 0);
      const stat = (ic, label, v) => html`<div class="card stat" style="margin:0"><span class="k"><i>${icon(ic)}</i>${label}</span><span class="v">${v}</span></div>`;
      view.innerHTML = html`<div class="page">
        <div class="page-head"><div><h1>${t('Marcos y fondos')}</h1><p>${t('Decoran el perfil de los jugadores: el marco va alrededor de su cara y el fondo detrás de su tarjeta, en el launcher y en su perfil de la web. Todos se mueven.')}</p></div></div>
        <div class="grid g3" style="margin-bottom:16px">${stat('sparkles', t('Marcos y fondos'), K.FRAMES.length + K.BGS.length - 2)}${stat('gift', t('Regalados'), num(given('frame') + given('bg')))}${stat('user', t('Puestos ahora'), num(wearing('frame') + wearing('bg')))}</div>
        <div class="seg lk-tabs">${Object.entries(KIND).map(([id, x]) => `<button class="${id === tab ? 'on' : ''}" data-tab="${id}">${t(x.title)} <small>${x.list.length - 1}</small></button>`).join('')}</div>
        <div class="cape-grid lk-grid">${list.map(it => html`<button class="cape-card" data-open="${esc(it.id)}" style="--r:${rarity(it).color}">
          <div class="lk-wrap">${sample(tab, it)}${rarityBadge(it)}</div>
          <div class="cape-info"><b>${esc(t(it.name))}</b></div>
          <small>${how(it) ? esc(how(it)) : stats[it.id].owners ? players(stats[it.id].owners) : t('Nadie lo tiene todavía')}${stats[it.id].wearing ? ` · ${stats[it.id].wearing === 1 ? t('1 lo lleva') : t('{n} lo llevan', { n: num(stats[it.id].wearing) })}` : ''}</small>
        </button>`).join('')}</div>
        <div class="note" style="margin-top:18px">${icon('info')}<span>${t('Los gratis los tiene todo el mundo y los de insignia, quien tenga esa insignia. El resto se regala desde aquí. El jugador se lo pone desde su perfil del launcher.')}</span></div>
      </div>`;
      $$('[data-tab]', view).forEach(b => b.onclick = () => { tab = b.dataset.tab; draw(); });
      $$('[data-open]', view).forEach(b => b.onclick = () => open(tab, k.get(b.dataset.open), () => V.looks(view)));
    };
    draw();
  };

  // ---------------------------------------------------------------- uno: regalar y quitar
  function open(kind, it, onChange) {
    let changed = false;
    const auto = how(it);
    modal((m, done) => {
      m.classList.add('cape-dlg');
      m.innerHTML = html`<div class="mh"><h3>${icon(kind === 'frame' ? 'user' : 'image')}${esc(t(it.name))}</h3><button class="btn ghost icon sm" data-x title="${t('Cerrar')}">${icon('x')}</button></div>
        <div class="mb cape-modal lk-modal">
          <div class="cape-side">${sample(kind, it, true)}<div class="cape-facts">${rarityBadge(it)}<span class="badge mute">${t(kind === 'frame' ? 'Marco' : 'Fondo')}</span></div></div>
          <div class="cape-main">${auto ? html`<div class="empty" style="padding:26px 10px"><div class="ic">${icon(it.free ? 'users' : 'sparkles')}</div><h4>${esc(auto)}</h4><p>${t('Este no hace falta regalarlo: lo tiene solo quien le toca.')}</p></div>` : html`
            <div class="field"><span class="label">${t('Regalar a')}</span>
              <div class="cape-give"><input class="input" id="names" maxlength="900" placeholder="${t('Nombre de Minecraft')}" autocomplete="off" spellcheck="false">
                <button class="btn primary" id="give">${icon('gift')}${t('Regalar')}</button></div>
              <span class="help">${t('Puedes poner varios nombres separados por comas.')}</span></div>
            <div class="cape-owners-head"><b>${t('Quién lo tiene')}</b><span class="grow"></span><small id="count"></small></div>
            <div id="owners" class="cape-owners"><p class="help">${t('Cargando…')}</p></div>`}
          </div>
        </div>`;
      $('[data-x]', m).onclick = done;
      if (auto) return;
      const box = $('#owners', m), input = $('#names', m), give = $('#give', m);
      const load = async () => {
        const { owners } = await api('GET', `/onyx/looks/${kind}/${it.id}`);
        $('#count', m).textContent = owners.length ? players(owners.length) : '';
        box.innerHTML = owners.length ? owners.map(o => html`<div class="list-row">${head(o.name)}
          <span class="grow"><b>${esc(o.name)}</b>${o.wearing ? ` <span class="badge ok">${icon('check')}${t('Lo lleva puesto')}</span>` : ''}<br>
            <small style="color:var(--faint)">${timeAgo(o.at)}${o.by ? ' · ' + t('por {n}', { n: esc(o.by) }) : ''}</small></span>
          <button class="btn sm ghost" data-take="${esc(o.name)}">${t('Quitar')}</button></div>`).join('')
          : html`<div class="empty" style="padding:22px 10px"><div class="ic">${icon('gift')}</div><h4>${t('Nadie lo tiene todavía')}</h4><p>${t('Escribe arriba el nombre de un jugador para regalárselo.')}</p></div>`;
        $$('[data-take]', box).forEach(b => b.onclick = async () => {
          if (!(await confirmBox({ title: t('¿Quitárselo a {n}?', { n: b.dataset.take }), text: t('Dejará de tenerlo y, si lo llevaba puesto, dejará de verse en su perfil.'), ok: t('Quitar'), danger: true, ico: 'sparkles' }))) return;
          try { await api('DELETE', `/onyx/looks/${kind}/${it.id}/${encodeURIComponent(b.dataset.take)}`); changed = true; toast(t('Quitado')); load(); } catch (e) { fail(e); }
        });
      };
      const send = async () => {
        const names = input.value.trim();
        if (!names) { input.focus(); return; }
        busy(give, true);
        try {
          const r = await api('POST', `/onyx/looks/${kind}/${it.id}`, { name: names });
          changed = true; input.value = '';
          toast(r.added === 1 ? t('Regalado a 1 jugador') : r.added ? t('Regalado a {n} jugadores', { n: r.added }) : t('Ya lo tenían'));
          await load();
        } catch (e) { fail(e); } finally { busy(give, false); }
      };
      give.onclick = send;
      input.onkeydown = (e) => { if (e.key === 'Enter') send(); };
      load().catch(fail);
    }, { wide: true });
    const obs = new MutationObserver(() => { if (!document.querySelector('.lk-modal')) { obs.disconnect(); if (changed) onChange(); } });
    obs.observe(document.body, { childList: true });
  }
})();
