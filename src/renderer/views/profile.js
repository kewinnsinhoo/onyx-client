// Mi perfil: una tarjeta con la skin en 3D (con la capa de Kopi puesta, animada), el nombre y lo que
// has jugado; debajo, dónde más juegas y tus capas de Kopi. La tarjeta se puede guardar o copiar como imagen.
(function () {
  const { html, esc, toast, busy } = UI;
  const V = window.Views = window.Views || {};

  function fmtTime(ms) {
    const h = Math.floor(ms / 3600e3), m = Math.floor((ms % 3600e3) / 60e3);
    return h ? `${h} h ${m} min` : `${m} min`;
  }
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
    let viewer = null, capeTimer = 0;

    function render() {
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
      </div>`;

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
    // Las capas de Kopi vienen del panel: cuando lleguen, se vuelve a pintar
    onyx.capes.kopi().then(r => {
      if (!root.isConnected || !r) return;
      kopi.owned = r.owned || []; kopi.worn = r.worn || null;
      if (kopi.owned.length || kopi.worn) render();
    }).catch(() => { /* sin panel o sin conexión */ });
    return () => { clearInterval(capeTimer); if (viewer) viewer.destroy(); };
  };
})();
