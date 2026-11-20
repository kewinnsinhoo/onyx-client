// Mi perfil: una tarjeta con la skin en 3D (con la capa de Kopi puesta, animada), el nombre y lo que
// has jugado; debajo, dónde más juegas y tus capas de Kopi. La tarjeta se puede guardar o copiar como imagen.
(function () {
  const { html, esc, toast, busy } = UI;
  const V = window.Views = window.Views || {};

  function fmtTime(ms) {
    const h = Math.floor(ms / 3600e3), m = Math.floor((ms % 3600e3) / 60e3);
    return h ? `${h} h ${m} min` : `${m} min`;
  }
  // Directos: nombre y cómo se ve el enlace de cada plataforma
  const PLAT = { twitch: ['Twitch', 'twitch.tv/', 'twitch.tv/tu_canal'], tiktok: ['TikTok', 'tiktok.com/@', '@tu_usuario'], kick: ['Kick', 'kick.com/', 'kick.com/tu_canal'] };
  V.PLAT = PLAT;
  const loaderName = (l) => ({ fabric: 'Fabric', forge: 'Forge', neoforge: 'NeoForge', quilt: 'Quilt' }[l && l.type] || 'Vanilla');

  V.profile = function (root) {
    const acc = S.account;
    const isMsa = acc && acc.type === 'msa';
    const activeCape = isMsa ? (acc.capes || []).find(c => c.active) : null;
    const played = S.instances.filter(i => (i.playTime || 0) > 0).sort((a, b) => b.playTime - a.playTime);
    const total = S.instances.reduce((n, i) => n + (i.playTime || 0), 0);
    const last = S.instances.reduce((n, i) => Math.max(n, i.lastPlayed || 0), 0);
    const K = KopiCapes.list;
    const kopi = { owned: [], worn: null };
    let ch = { twitch: '', tiktok: '', kick: '' }, chLoaded = false, draft = {};
    let bd = S.badges; // insignias (del panel)
    const CATS = [['time', 'Tiempo jugado'], ['streak', 'Rachas'], ['explore', 'Explorador'], ['fair', 'Juego limpio'], ['seniority', 'Antigüedad'], ['community', 'Comunidad'],
      ['special', 'Especiales'], ['event', 'Eventos'], ['studio', 'De los studios'], ['secret', 'Secretas']];
    const unitTxt = (p) => p.unit === 'h' ? t('{a} / {b} h', { a: p.cur, b: p.max }) : p.unit === 'd' ? t('{a} / {b} días', { a: Math.floor(p.cur), b: p.max }) : t('{a} / {b} instancias', { a: p.cur, b: p.max });
    const showcased = () => (bd ? bd.showcase.map(id => bd.badges.find(b => b.id === id)).filter(Boolean) : []);
    let viewer = null, capeTimer = 0;

    function render() {
      // lo que estabas escribiendo no se pierde si la página se vuelve a pintar
      root.querySelectorAll('[data-ch]').forEach(i => { if (!i.disabled) draft[i.dataset.ch] = i.value; });
      const mine = K.filter(c => kopi.owned.includes(c.id));
      const worn = kopi.worn && KopiCapes.get(kopi.worn);
      const max = played.length ? played[0].playTime : 1;
      root.innerHTML = html`<div class="page pf-page">
        <div class="page-head"><h1 class="title">${t('Mi perfil')}</h1>
          <div class="pf-actions">
            <button class="btn btn-ghost" id="pf-copy">${icon('copy')}${t('Copiar imagen')}</button>
            <button class="btn btn-primary" id="pf-save">${icon('download')}${t('Guardar tarjeta')}</button>
          </div></div>

        <div class="pf-card" id="pf-card" style="${worn ? `--pf:${KopiCapes.RARITY[worn.rarity].color}` : ''}">
          <img class="pf-mark" src="assets/logo-mark.png" alt="">
          <div class="pf-viewer" id="pf-viewer"></div>
          <div class="pf-info">
            <span class="pf-kicker">${t('Jugador de Kopi Client')}</span>
            <h2 class="pf-name">${esc(acc ? acc.name : 'Steve')}</h2>
            <div class="pf-tags">
              ${isMsa ? `<span class="badge premium">${icon('check')}Premium</span>` : `<span class="badge accent">${icon('user')}${t('Sin premium')}</span>`}
              ${worn ? `<span class="badge pf-cape">${icon('cape')}${t('Capa {name}', { name: t(worn.name) })}</span>` : ''}
            </div>
            ${showcased().length ? `<div class="pf-vit">${showcased().map(b => `<span class="pf-vb" title="${esc(App.badgeName(b))}">${Badge.medal(b, 40)}<small>${esc(App.badgeName(b))}</small></span>`).join('')}</div>` : ''}
            ${Object.keys(PLAT).some(k => ch[k]) ? `<div class="pf-chans">${Object.keys(PLAT).filter(k => ch[k]).map(k => `<span class="pf-chan"><i class="plat-dot ${k}"></i>${esc(PLAT[k][1] + ch[k])}</span>`).join('')}</div>` : ''}
            <div class="pf-stats">
              <div><span>${t('Tiempo jugado')}</span><b>${fmtTime(total)}</b></div>
              <div><span>${t('Instancias jugadas')}</span><b>${played.length}</b></div>
              <div><span>${t('Capas de Kopi')}</span><b>${mine.length}<small> / ${K.length}</small></b></div>
            </div>
            ${last ? `<span class="pf-last">${icon('clock')}${t('Última partida: {when}', { when: UI.timeAgo(last) })}</span>` : ''}
          </div>
          <img class="pf-brand" src="assets/logo-wordmark.png" alt="Kopi Client">
        </div>

        <div class="pf-cols">
          <section class="card pf-sec">
            <div class="pf-h"><b>${t('Dónde más juegas')}</b></div>
            ${played.length ? played.slice(0, 6).map(i => html`<button class="pf-inst" data-inst="${esc(i.id)}">
              <span class="ic" style="${i.icon || i.banner ? `background-image:url('${esc(i.icon || i.banner)}')` : ''}">${i.icon || i.banner ? '' : esc(i.name.slice(0, 2).toUpperCase())}</span>
              <span class="tx"><b>${esc(i.name)}</b><small>${esc(i.minecraft || '')} · ${loaderName(i.loader)}</small>
                <span class="bar"><i style="width:${Math.max(4, Math.round(i.playTime / max * 100))}%"></i></span></span>
              <span class="tm">${fmtTime(i.playTime)}</span>
            </button>`).join('')
            : `<div class="pf-empty">${icon('box')}<span>${t('Aún no has jugado a ninguna instancia.')}</span></div>`}
          </section>
          <section class="card pf-sec">
            <div class="pf-h"><b>${t('Tus capas de Kopi')}</b><button class="link-btn" id="pf-capes">${t('Ver capas')}${icon('chevronRight')}</button></div>
            ${mine.length ? html`<div class="pf-capes">${mine.map(c => html`<div class="pf-capecard ${kopi.worn === c.id ? 'on' : ''}" style="--rc:${KopiCapes.RARITY[c.rarity].color}">
              <canvas data-kc="${c.id}"></canvas><b>${t(c.name)}</b><small>${kopi.worn === c.id ? t('La llevas puesta') : t(KopiCapes.RARITY[c.rarity].label)}</small></div>`).join('')}</div>`
            : `<div class="pf-empty">${icon('sparkles')}<span>${t('Aún no tienes capas de Kopi. Pronto podrás ganarlas jugando.')}</span></div>`}
          </section>
        </div>

        ${bd ? html`<section class="card pf-sec pf-badges">
          <div class="pf-h"><b>${icon('award')}${t('Insignias')}<span class="pf-bn">${bd.badges.filter(b => b.earned).length} / ${bd.badges.length}</span></b>
            <span class="pf-hint">${t('Pulsa una para verla. Las 3 de tu vitrina salen en tu tarjeta.')}</span></div>
          <div class="pf-bcats">${CATS.map(([c, n]) => { const list = bd.badges.filter(b => b.cat === c); return list.length ? html`<div class="pf-bcat"><span class="pf-bct">${t(n)}</span><div class="pf-bgrid">${list.map(b => html`<button class="pf-bt ${b.earned ? 'on' : ''} r-${b.rarity}" data-bd="${esc(b.id)}">
              ${bd.showcase.includes(b.id) ? `<span class="pf-star" title="${t('En tu vitrina')}">${icon('star')}</span>` : ''}
              ${Badge.medal(b, 50)}<b>${esc(!b.earned && b.secret ? '???' : App.badgeName(b))}</b>
              ${!b.earned && b.progress ? `<span class="pf-bp"><i style="width:${Math.round(b.progress.cur / b.progress.max * 100)}%"></i></span><small>${esc(unitTxt(b.progress))}</small>` : `<small>${b.earned ? t(Badge.rarityName[b.rarity]) : t('Bloqueada')}</small>`}
            </button>`).join('')}</div></div>` : ''; }).join('')}</div>
        </section>` : ''}

        <section class="card pf-sec pf-streams">
          <div class="pf-h"><b>${icon('video')}${t('Tus directos')}</b><span class="pf-hint">${t('Cuando emitas mientras juegas, sales en «En directo ahora» de la instancia y el studio te ve.')}</span></div>
          <div class="pf-plat">${Object.entries(PLAT).map(([k, [n, , ph]]) => html`<label class="pf-prow"><i class="plat-dot ${k}"></i><b>${n}</b>
            <input class="input" data-ch="${k}" value="${esc(draft[k] ?? ch[k] ?? '')}" placeholder="${esc(ph)}" spellcheck="false" autocomplete="off" ${chLoaded ? '' : 'disabled'}></label>`).join('')}</div>
          <div class="pf-sfoot"><span class="pf-hint">${t('Solo se usa para enseñar tu directo. Déjalo vacío para quitarlo.')}</span>
            <button class="btn btn-primary btn-sm" id="pf-ch-save" ${chLoaded ? '' : 'disabled'}>${icon('check')}${t('Guardar')}</button></div>
        </section>
      </div>`;

      root.querySelectorAll('[data-bd]').forEach(el => { el.onclick = () => badgeModal(bd.badges.find(b => b.id === el.dataset.bd)); });
      const save = root.querySelector('#pf-ch-save');
      save.onclick = async () => {
        const body = {};
        root.querySelectorAll('[data-ch]').forEach(i => { body[i.dataset.ch] = i.value.trim(); });
        busy(save, true);
        try { const r = await onyx.streams.save(body); ch = r.channels; draft = {}; toast(t('Canales guardados'), 'success'); render(); }
        catch (err) { toast(t(err.message, err.vars), 'error'); busy(save, false); }
      };

      // la skin en 3D, andando, con la capa puesta (la de Kopi animada; si no, la oficial)
      if (viewer) { clearInterval(capeTimer); viewer.destroy(); }
      viewer = new Skin3D.SkinViewer(root.querySelector('#pf-viewer'), { scale: 7, rotY: -32, rotX: -4, walk: true, zoom: 0.8 });
      viewer.setSkin(App.skinOf(acc), App.variantOf(acc));
      if (worn) {
        let f = 0;
        const show = () => viewer.setCape(KopiCapes.texture(worn, f++).toDataURL());
        show();
        if (worn.frames > 1) capeTimer = setInterval(show, 1000 / worn.fps);
      } else viewer.setCape(activeCape ? activeCape.url.replace(/^http:/, 'https:') : null);

      root.querySelectorAll('canvas[data-kc]').forEach(cv => KopiCapes.mount(cv, KopiCapes.get(cv.dataset.kc)));
      root.querySelectorAll('[data-inst]').forEach(b => b.onclick = () => App.go('instance', { id: b.dataset.inst }));
      root.querySelector('#pf-capes').onclick = () => App.go('skins', { tab: 'capes' });
      const card = (copy) => async (e) => {
        const b = e.currentTarget, r = root.querySelector('#pf-card').getBoundingClientRect();
        busy(b, true);
        try {
          await onyx.profile.card({ x: r.left, y: r.top, width: r.width, height: r.height }, copy);
          toast(copy ? t('Imagen copiada: pégala donde quieras') : t('Tarjeta guardada en Imágenes'), 'success');
        } catch (err) { toast(t(err.message, err.vars), 'error'); }
        finally { busy(b, false); }
      };
      root.querySelector('#pf-copy').onclick = card(true);
      root.querySelector('#pf-save').onclick = card(false);
    }

    render();
    // Tus canales de directo (del panel)
    // Una insignia en grande: cómo se gana, cuándo la ganaste y ponerla o quitarla de la vitrina
    function badgeModal(b) {
      const hidden = !b.earned && b.secret;
      UI.modal((m, close) => {
        const inVit = bd.showcase.includes(b.id);
        m.classList.add('bd-modal', 'r-' + b.rarity);
        m.innerHTML = html`<div class="bd-big ${b.earned ? 'on' : ''}">${Badge.medal(b, 112)}</div>
          <h2>${esc(hidden ? '???' : App.badgeName(b))}</h2>
          <span class="bdg-r r-${b.rarity}">${t(Badge.rarityName[b.rarity])}</span>
          <p class="sub">${esc(hidden ? t('Es secreta: descubre tú cómo se gana.') : App.badgeDesc(b))}${b.studio ? `<br><small>${t('De {studio}', { studio: esc(b.studio) })}</small>` : ''}</p>
          ${b.earned ? `<span class="bd-when">${icon('check')}${t('Ganada {when}', { when: UI.timeAgo(b.at) })}</span>`
            : b.progress ? `<div class="bd-prog"><span class="pf-bp"><i style="width:${Math.round(b.progress.cur / b.progress.max * 100)}%"></i></span><small>${esc(unitTxt(b.progress))}</small></div>` : ''}
          <div class="actions"><button class="btn btn-ghost" data-a="no">${t('Cerrar')}</button>
            ${b.earned ? `<button class="btn ${inVit ? 'btn-ghost' : 'btn-primary'}" data-a="vit">${icon('star')}${inVit ? t('Quitar de la vitrina') : t('Poner en la vitrina')}</button>` : ''}</div>`;
        m.querySelector('[data-a=no]').onclick = close;
        const v = m.querySelector('[data-a=vit]');
        if (v) v.onclick = async () => {
          let ids = bd.showcase.filter(x => x !== b.id);
          if (!inVit) ids = [b.id, ...ids].slice(0, 3);
          UI.busy(v, true);
          try {
            const r = await onyx.badges.showcase(ids);
            bd = { ...bd, showcase: r.showcase }; S.badges = bd;
            close(); render();
            toast(inVit ? t('Quitada de tu vitrina') : t('En tu vitrina. Sale en tu tarjeta.'), 'success');
          } catch (e) { toast(t(e.message, e.vars), 'error'); UI.busy(v, false); }
        };
      });
    }
    // Insignias: se piden al panel (y se avisa de las nuevas)
    App.checkBadges().then(r => { if (r && root.isConnected) { bd = r; render(); } }).catch(() => {});

    onyx.streams.channels().then(r => {
      if (!root.isConnected) return;
      ch = (r && r.channels) || ch; chLoaded = true; render();
    }).catch(() => { chLoaded = true; if (root.isConnected) render(); });
    // Las capas de Kopi vienen del panel: cuando lleguen, se vuelve a pintar
    onyx.capes.kopi().then(r => {
      if (!root.isConnected || !r) return;
      kopi.owned = r.owned || []; kopi.worn = r.worn || null;
      if (kopi.owned.length || kopi.worn) render();
    }).catch(() => { /* sin panel o sin conexión */ });
    return () => { clearInterval(capeTimer); if (viewer) viewer.destroy(); };
  };
})();
