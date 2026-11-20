// Capas de Kopi (solo el Creador): ver las capas animadas, regalarlas a jugadores y quitarlas.
// El dibujo de cada capa viene de /js/cape-art.js (el mismo que usa el servidor para el juego).
(function () {
  const V = window.Views;
  const ART = window.KopiCapeArt;
  const isCreator = () => S.me && S.me.user.role === 'creator';
  const num = (n) => Number(n || 0).toLocaleString(I18N.locale());
  const RARITY_ORDER = { legendary: 0, epic: 1, rare: 2, common: 3 };
  const players = (n) => (n === 1 ? t('1 jugador') : t('{n} jugadores', { n: num(n) }));

  // ---------------------------------------------------------------- miniaturas animadas (un solo reloj para todas)
  const live = new Set();
  let timer = 0, tick = 0;
  const reduced = () => matchMedia('(prefers-reduced-motion: reduce)').matches;
  function paint(ctx, cape, f) {
    const grid = ART.pixels(cape, f);
    for (let y = 0; y < ART.H; y++) for (let x = 0; x < ART.W; x++) { ctx.fillStyle = grid[y][x]; ctx.fillRect(x, y, 1, 1); }
  }
  function loop() {
    tick++;
    for (const it of live) {
      if (!it.cv.isConnected) { live.delete(it); continue; }
      const step = Math.floor(tick * it.cape.fps / 24);
      if (step !== it.last) { it.last = step; paint(it.ctx, it.cape, step); }
    }
    if (!live.size) { clearInterval(timer); timer = 0; }
  }
  function mount(cv, cape) {
    cv.width = ART.W; cv.height = ART.H;
    const it = { cv, cape, ctx: cv.getContext('2d'), last: -1 };
    paint(it.ctx, cape, 0);
    if (cape.frames > 1 && !reduced()) { live.add(it); if (!timer) timer = setInterval(loop, 1000 / 24); }
  }
  const mountAll = (root) => $$('canvas[data-cape]', root).forEach(cv => mount(cv, ART.get(cv.dataset.cape)));

  const rarity = (c) => ART.RARITY[c.rarity];
  const rarityBadge = (c) => `<span class="badge cape-rarity" style="--r:${rarity(c).color}"><span class="dot"></span>${esc(t(rarity(c).label))}</span>`;
  const stage = (c, size = '', badge = '') => `<div class="cape-stage ${size}" style="--r:${rarity(c).color}">${badge}<div class="cape-hang"><canvas data-cape="${esc(c.id)}" aria-label="${esc(t(c.name))}"></canvas></div></div>`;
  // Cara del jugador (si no carga, sus iniciales)
  const head = (name) => `<span class="cape-head"><span>${initials(name)}</span><img src="https://mc-heads.net/avatar/${encodeURIComponent(name)}/32" alt="" width="32" height="32" loading="lazy" onerror="this.remove()"></span>`;

  // ---------------------------------------------------------------- página
  V.capes = async (view) => {
    if (!isCreator()) return V.notFound(view);
    const { capes } = await api('GET', '/onyx/capes');
    const stats = Object.fromEntries(capes.map(c => [c.id, c]));
    const list = ART.CAPES.slice().sort((a, b) => RARITY_ORDER[a.rarity] - RARITY_ORDER[b.rarity]);
    const total = capes.reduce((n, c) => n + c.owners, 0), wearing = capes.reduce((n, c) => n + c.wearing, 0);
    const stat = (ic, k, v) => html`<div class="card stat" style="margin:0"><span class="k"><i>${icon(ic)}</i>${k}</span><span class="v">${v}</span></div>`;
    view.innerHTML = html`<div class="page">
      <div class="page-head"><div><h1>${t('Capas de Kopi')}</h1><p>${t('Capas animadas que solo tiene la gente de Kopi Client. Regálalas a quien quieras: el jugador se la pone desde el launcher y se ve dentro del juego.')}</p></div></div>
      <div class="grid g3" style="margin-bottom:16px">${stat('sparkles', t('Capas diferentes'), list.length)}${stat('gift', t('Capas regaladas'), num(total))}${stat('user', t('La llevan puesta'), num(wearing))}</div>
      <div class="cape-grid">${list.map(c => html`<button class="cape-card" data-open="${esc(c.id)}" style="--r:${rarity(c).color}">
        ${stage(c, '', rarityBadge(c))}
        <div class="cape-info"><b>${esc(t(c.name))}</b></div>
        <small>${stats[c.id].owners ? players(stats[c.id].owners) : t('Nadie la tiene todavía')}${stats[c.id].wearing ? ` · ${stats[c.id].wearing === 1 ? t('1 la lleva') : t('{n} la llevan', { n: num(stats[c.id].wearing) })}` : ''}</small>
      </button>`).join('')}</div>
      <div class="note" style="margin-top:18px">${icon('info')}<span>${t('Dentro del juego se ve animada en las instancias con Fabric 1.21.1 o más nuevo, y quieta en las demás. Solo la ven quienes juegan con Kopi Client.')}</span></div>
    </div>`;
    mountAll(view);
    $$('[data-open]', view).forEach(b => b.onclick = () => openCape(ART.get(b.dataset.open), () => V.capes(view)));
  };

  // ---------------------------------------------------------------- una capa: regalar y quitar
  function openCape(cape, onChange) {
    let changed = false;
    const close = modal((m, done) => {
      m.classList.add('cape-dlg');
      m.innerHTML = html`<div class="mh"><h3>${icon('sparkles')}${esc(t(cape.name))}</h3><button class="btn ghost icon sm" data-x title="${t('Cerrar')}">${icon('x')}</button></div>
        <div class="mb cape-modal">
          <div class="cape-side">${stage(cape, 'big')}
            <div class="cape-facts">${rarityBadge(cape)}<span class="badge mute">${cape.frames > 1 ? `${icon('play')}${t('Animada')}` : t('Sin animación')}</span></div></div>
          <div class="cape-main">
            <div class="field"><span class="label">${t('Regalar a')}</span>
              <div class="cape-give"><input class="input" id="names" maxlength="900" placeholder="${t('Nombre de Minecraft')}" autocomplete="off" spellcheck="false">
                <button class="btn primary" id="give">${icon('gift')}${t('Regalar')}</button></div>
              <span class="help">${t('Puedes poner varios nombres separados por comas.')}</span></div>
            <div class="cape-owners-head"><b>${t('Quién la tiene')}</b><span class="grow"></span><small id="count"></small></div>
            <div id="owners" class="cape-owners"><p class="help">${t('Cargando…')}</p></div>
          </div>
        </div>`;
      mount($('canvas[data-cape]', m), cape);
      $('[data-x]', m).onclick = done;
      const box = $('#owners', m), input = $('#names', m), give = $('#give', m);
      const load = async () => {
        const { owners } = await api('GET', `/onyx/capes/${cape.id}`);
        $('#count', m).textContent = owners.length ? players(owners.length) : '';
        box.innerHTML = owners.length ? owners.map(o => html`<div class="list-row">${head(o.name)}
          <span class="grow"><b>${esc(o.name)}</b>${o.wearing ? ` <span class="badge ok">${icon('check')}${t('La lleva puesta')}</span>` : ''}<br>
            <small style="color:var(--faint)">${timeAgo(o.at)}${o.by ? ' · ' + t('por {n}', { n: esc(o.by) }) : ''}</small></span>
          <button class="btn sm ghost" data-take="${esc(o.name)}">${t('Quitar')}</button></div>`).join('')
          : html`<div class="empty" style="padding:22px 10px"><div class="ic">${icon('gift')}</div><h4>${t('Nadie la tiene todavía')}</h4><p>${t('Escribe arriba el nombre de un jugador para regalársela.')}</p></div>`;
        $$('[data-take]', box).forEach(b => b.onclick = async () => {
          if (!(await confirmBox({ title: t('¿Quitarle la capa a {n}?', { n: b.dataset.take }), text: t('Dejará de tenerla y, si la llevaba puesta, dejará de verse en el juego.'), ok: t('Quitar'), danger: true, ico: 'sparkles' }))) return;
          try { await api('DELETE', `/onyx/capes/${cape.id}/${encodeURIComponent(b.dataset.take)}`); changed = true; toast(t('Capa quitada')); load(); } catch (e) { fail(e); }
        });
      };
      const send = async () => {
        const names = input.value.trim();
        if (!names) { input.focus(); return; }
        busy(give, true);
        try {
          const r = await api('POST', `/onyx/capes/${cape.id}`, { name: names });
          changed = true; input.value = '';
          toast(r.added === 1 ? t('Capa regalada a 1 jugador') : r.added ? t('Capa regalada a {n} jugadores', { n: r.added }) : t('Ya la tenían'));
          await load();
        } catch (e) { fail(e); } finally { busy(give, false); }
      };
      give.onclick = send;
      input.onkeydown = (e) => { if (e.key === 'Enter') send(); };
      load().catch(fail);
    }, { wide: true });
    // al cerrar, se actualizan los números de la página
    const obs = new MutationObserver(() => { if (!document.querySelector('.cape-modal')) { obs.disconnect(); if (changed) onChange(); } });
    obs.observe(document.body, { childList: true });
    return close;
  }
})();
