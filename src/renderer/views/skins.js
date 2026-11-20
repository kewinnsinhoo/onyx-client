// Skins: visor 3D, biblioteca, subir, capas y explorar.
(function () {
  const { esc, html, toast, busy } = UI;
  const V = window.Views = window.Views || {};

  V.skins = function (root, params = {}) {
    const acc = S.account;
    const isMsa = acc && acc.type === 'msa';
    const activeCape = isMsa ? (acc.capes || []).find(c => c.active) : null;
    const current = { name: acc ? acc.name : 'Steve', skin: App.skinOf(acc), variant: App.variantOf(acc), source: 'current' };
    let preview = { ...current };
    let tab = params.tab || 'library';
    let walk = false, outer = true, capeOn = true;
    // Capas de Kopi de la cuenta (regaladas desde el panel)
    const kopi = { owned: [], worn: null, loaded: false };
    let kopiLoading = null;
    const loadKopi = () => kopiLoading || (kopiLoading = onyx.capes.kopi()
      .then(r => { kopi.owned = (r && r.owned) || []; kopi.worn = (r && r.worn) || null; })
      .catch(() => { /* sin panel o sin conexión: se ven como bloqueadas */ })
      .finally(() => { kopi.loaded = true; }));

    root.innerHTML = html`<div class="page">
      <div class="page-head"><h1 class="title">${t('Skins')}</h1>
        <button class="link-btn" id="sk-web">${icon('external')}${t('Abrir en la web')}</button></div>
      <div class="viewer-card" id="sk-viewer">
        <div class="viewer-tools">
          <button data-t="walk" title="${t('Animación')}">${icon('play')}</button>
          <button data-t="outer" class="on" title="${t('Segunda capa')}">${icon('layers')}</button>
          <button data-t="cape" class="on" title="${t('Capa')}">${icon('cape')}</button>
          <button data-t="shot" title="${t('Captura')}">${icon('camera')}</button>
        </div>
      </div>
      <div class="skin-bar">
        <div class="who"><span id="sk-head"></span><div><div class="n" id="sk-name"></div><div class="s" id="sk-state"></div></div></div>
        <div class="segmented" id="sk-variant"><button data-v="classic">${t('Clásico')}</button><button data-v="slim">Slim</button></div>
        <div class="grow"></div>
        <button class="btn btn-ghost" id="sk-discard">${t('Descartar')}</button>
        <button class="btn btn-primary btn-lg" id="sk-apply">${icon('check')}${t('Aplicar')}</button>
      </div>
      <div class="tabs" style="margin-top:28px" id="sk-tabs">
        <button data-tab="library">${t('Biblioteca')}</button><button data-tab="upload">${t('Subir')}</button>
        <button data-tab="capes">${t('Capas')}</button><button data-tab="explore">${t('Explorar')}</button>
      </div>
      <div id="sk-body"></div>
    </div>`;

    const $ = (s) => root.querySelector(s);
    const viewer = new Skin3D.SkinViewer($('#sk-viewer'), { scale: 8, rotY: -26, rotX: -6 });
    // La capa del muñeco: la de Kopi que lleva puesta (animada) o, si no, la oficial de Minecraft
    let baseTimer = 0;
    function baseCape() {
      clearInterval(baseTimer); baseTimer = 0;
      const kc = kopi.worn && KopiCapes.get(kopi.worn);
      if (!kc) { viewer.setCape(activeCape ? activeCape.url.replace(/^http:/, 'https:') : null); return; }
      let f = 0;
      const show = () => viewer.setCape(KopiCapes.texture(kc, f++).toDataURL());
      show();
      if (kc.frames > 1) baseTimer = setInterval(show, 1000 / kc.fps);
    }
    baseCape();
    loadKopi().then(() => { if (!trying && root.isConnected) baseCape(); });

    const dirty = () => preview.skin !== current.skin || preview.variant !== current.variant;

    function drawPreview() {
      viewer.setSkin(preview.skin, preview.variant);
      $('#sk-head').innerHTML = Skin3D.head(preview.skin, 36, 7);
      $('#sk-name').textContent = preview.name;
      $('#sk-state').textContent = dirty() ? t('Sin aplicar') : (isMsa ? t('En uso') : t('En uso (en servidores con Kopi Skins)'));
      root.querySelectorAll('#sk-variant button').forEach(b => b.classList.toggle('on', b.dataset.v === preview.variant));
      $('#sk-apply').disabled = !dirty();
      $('#sk-discard').disabled = !dirty();
    }

    // Herramientas del visor
    root.querySelectorAll('.viewer-tools [data-t]').forEach(b => b.onclick = async () => {
      const k = b.dataset.t;
      if (k === 'walk') { walk = !walk; viewer.setWalk(walk); b.innerHTML = icon(walk ? 'pause' : 'play'); b.classList.toggle('on', walk); }
      if (k === 'outer') { outer = !outer; viewer.setOuter(outer); b.classList.toggle('on', outer); }
      if (k === 'cape') { capeOn = !capeOn; viewer.setCapeVisible(capeOn); b.classList.toggle('on', capeOn); }
      if (k === 'shot') {
        const r = $('#sk-viewer').getBoundingClientRect();
        const tools = $('.viewer-tools'); tools.style.visibility = 'hidden';
        await new Promise(res => requestAnimationFrame(() => setTimeout(res, 30)));
        try { await onyx.skins.screenshot({ x: r.left + 1, y: r.top + 1, width: r.width - 2, height: r.height - 2 }); toast(t('Captura guardada'), 'success'); }
        catch (e) { toast(e.message, 'error'); }
        tools.style.visibility = '';
      }
    });

    root.querySelectorAll('#sk-variant button').forEach(b => b.onclick = () => { preview.variant = b.dataset.v; drawPreview(); });
    $('#sk-discard').onclick = () => { preview = { ...current }; drawPreview(); };
    $('#sk-web').onclick = () => onyx.app.openExternal(isMsa ? `https://namemc.com/profile/${encodeURIComponent(acc.name)}` : 'https://namemc.com/minecraft-skins');

    $('#sk-apply').onclick = async (e) => {
      const btn = e.currentTarget;
      busy(btn, true, t('Aplicando...'));
      try {
        const opts = { variant: preview.variant };
        if (preview.skin !== current.skin) {
          if (preview.skin.startsWith('data:')) opts.data = preview.skin; else opts.url = preview.skin;
        }
        if (preview.skin.startsWith('data:') && preview.source === 'upload') {
          await onyx.skins.libraryAdd({ name: preview.name, data: preview.skin, variant: preview.variant }).catch(() => {});
        }
        await onyx.skins.apply(opts);
        await App.loadAccounts();
        App.renderTopbar();
        toast(isMsa ? t('¡Skin aplicada! Se verá en tu próxima partida.') : t('Skin guardada en el launcher'), 'success');
        App.go('skins', { tab });
      } catch (err) { toast(err.message, 'error', 6000); busy(btn, false); }
    };

    // ---------- pestañas ----------
    function setTab(name) {
      stopTry();
      tab = name;
      root.querySelectorAll('#sk-tabs button').forEach(b => b.classList.toggle('on', b.dataset.tab === tab));
      const body = $('#sk-body');
      ({ library, upload, capes, explore })[tab](body);
    }
    root.querySelectorAll('#sk-tabs button').forEach(b => b.onclick = () => setTab(b.dataset.tab));

    function tile({ skin, variant, name, sub, on, id }) {
      return html`<div class="skin-tile ${on ? 'on' : ''}" data-skin="${esc(skin)}" data-variant="${esc(variant)}" data-name="${esc(name)}">
        ${id ? `<button class="del" data-del="${esc(id)}" title="${t('Quitar')}">${icon('trash')}</button>` : ''}
        <div class="prev">${Skin3D.flat(skin, 3.3, variant)}</div>
        <div class="n">${esc(name)}</div><div class="s">${esc(sub || '')}</div></div>`;
    }
    function bindTiles(body, source) {
      body.querySelectorAll('.skin-tile[data-skin]').forEach(el => {
        el.onclick = (e) => {
          if (e.target.closest('[data-del]')) return;
          preview = { skin: el.dataset.skin, variant: el.dataset.variant, name: el.dataset.name, source };
          body.querySelectorAll('.skin-tile').forEach(x => x.classList.toggle('on', x === el));
          drawPreview();
          if (source !== 'explore') {
            const chosen = preview;
            Skin3D.detectModel(chosen.skin).then(v => { if (preview === chosen && v !== chosen.variant) { chosen.variant = v; drawPreview(); } });
          }
        };
        // Las skins subidas/guardadas: detectar el modelo real (Slim o Clásico) desde el PNG
        if (source !== 'explore' && el.dataset.skin.startsWith('data:')) {
          Skin3D.detectModel(el.dataset.skin).then(v => {
            if (v === el.dataset.variant) return;
            el.dataset.variant = v;
            el.querySelector('.prev').innerHTML = Skin3D.flat(el.dataset.skin, 3.3, v);
            const sub = el.querySelector('.s');
            if (sub && (sub.textContent === 'Slim' || sub.textContent === t('Clásico'))) sub.textContent = v === 'slim' ? 'Slim' : t('Clásico');
            Skin3D.fixLegacy(el);
          });
        }
      });
      Skin3D.fixLegacy(body);
    }

    async function library(body) {
      body.innerHTML = `<div class="muted">${t('Cargando...')}</div>`;
      let list = [];
      try { list = await onyx.skins.library(); } catch (e) { toast(e.message, 'error'); }
      body.innerHTML = html`<div class="row" style="margin-bottom:14px"><div class="t" style="font-weight:700">${t('Biblioteca')} <span class="muted" style="font-weight:500">${list.length}</span></div>
        <div class="grow"></div><button class="btn btn-outline btn-sm" id="lib-save">${icon('plus')}${t('Guardar la actual')}</button></div>
        <div class="skin-grid">${tile({ ...current, sub: t('Actual'), on: preview.skin === current.skin })}
        ${list.map(s => tile({ skin: s.data, variant: s.variant, name: s.name, sub: s.variant === 'slim' ? 'Slim' : t('Clásico'), id: s.id, on: preview.skin === s.data })).join('')}</div>`;
      bindTiles(body, 'library');
      body.querySelectorAll('[data-del]').forEach(b => b.onclick = async () => { await onyx.skins.libraryRemove(b.dataset.del); library(body); });
      body.querySelector('#lib-save').onclick = async () => {
        try {
          const data = current.skin.startsWith('data:') ? current.skin : await onyx.skins.dataUrl(current.skin);
          await onyx.skins.libraryAdd({ name: current.name, data, variant: current.variant });
          toast(t('Guardada en la biblioteca'), 'success'); library(body);
        } catch (e) { toast(e.message, 'error'); }
      };
    }

    function upload(body) {
      body.innerHTML = html`<div class="drop-zone" id="dz">${icon('upload')}
        <div class="t">${t('Suelta tu PNG aquí')}</div>
        <button class="btn btn-outline btn-sm" id="dz-pick">${t('Elegir archivo')}</button>
        <div class="s">${t('PNG · 64×64 o 64×32 · máx. 512 KB')}</div></div>`;
      const dz = body.querySelector('#dz');
      const useData = async (name, data) => {
        try {
          await onyx.skins.validate(data);
          const variant = await Skin3D.detectModel(data);
          preview = { skin: data, variant, name: name || 'Skin', source: 'upload' };
          drawPreview();
          toast(t('Vista previa lista: pulsa Aplicar'), 'success');
        } catch (e) { toast(e.message, 'error'); }
      };
      body.querySelector('#dz-pick').onclick = async () => {
        try { const f = await onyx.skins.pickFile(); if (f) useData(f.name, f.data); } catch (e) { toast(e.message, 'error'); }
      };
      dz.ondragover = (e) => { e.preventDefault(); dz.classList.add('over'); };
      dz.ondragleave = () => dz.classList.remove('over');
      dz.ondrop = (e) => {
        e.preventDefault(); dz.classList.remove('over');
        const f = e.dataTransfer.files[0];
        if (!f || !/\.png$/i.test(f.name)) return toast(t('Tiene que ser un archivo PNG'), 'error');
        const r = new FileReader();
        r.onload = () => useData(f.name.replace(/\.png$/i, ''), r.result);
        r.readAsDataURL(f);
      };
    }

    // ---------- capas ----------
    // Probar una capa de Kopi en el visor (animada). Se quita al cambiar de pestaña o salir.
    let trying = null;
    function stopTry() {
      if (!trying) return;
      clearInterval(trying.timer); trying = null;
      viewer.showBack(false);
      baseCape();
    }
    function tryCape(id) {
      const was = trying && trying.id;
      stopTry();
      if (was === id) return;
      const cape = KopiCapes.get(id);
      clearInterval(baseTimer); baseTimer = 0;
      let f = 0;
      const show = () => viewer.setCape(KopiCapes.texture(cape, f++).toDataURL());
      show();
      viewer.showBack(true);
      if (!capeOn) { capeOn = true; viewer.setCapeVisible(true); root.querySelector('.viewer-tools [data-t=cape]').classList.add('on'); }
      trying = { id, timer: cape.frames > 1 ? setInterval(show, 1000 / cape.fps) : 0 };
      root.querySelector('#sk-viewer').scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }

    function capes(body) {
      const list = isMsa ? (acc.capes || []) : [];
      const K = KopiCapes.list, R = KopiCapes.RARITY;
      const mine = K.filter(c => kopi.owned.includes(c.id));
      const tryBtn = (c) => { const on = trying && trying.id === c.id; return `<button class="kc-try ${on ? 'on' : ''}" data-try="${c.id}">${icon(on ? 'x' : 'play')}<span>${esc(t(on ? 'Quitar' : 'Probar'))}</span></button>`; };
      const card = (c) => {
        const own = kopi.owned.includes(c.id), worn = kopi.worn === c.id;
        return html`<div class="kc-card ${own ? 'owned' : ''} ${worn ? 'worn' : ''}" style="--rc:${R[c.rarity].color}">
          <div class="kc-art"><canvas data-kc="${c.id}"></canvas>${worn ? `<span class="kc-worn" title="${esc(t('La llevas puesta'))}">${icon('check')}</span>` : ''}</div>
          <div class="kc-info">
            <div class="kc-top"><b>${t(c.name)}</b>${c.frames > 1 ? `<span class="kc-anim">${icon('sparkles')}${t('Animada')}</span>` : ''}</div>
            <div class="kc-r">${t(R[c.rarity].label)}</div>
            ${own ? `<div class="kc-own">${icon(worn ? 'check' : 'sparkles')}<span>${esc(t(worn ? 'La llevas puesta' : 'Es tuya'))}</span></div>`
              : `<div class="kc-lock">${icon('lock')}<span>${esc(t('Por ahora no se puede conseguir.'))}</span></div>`}
            ${own ? `<button class="kc-try kc-wear ${worn ? 'on' : ''}" data-wear="${worn ? '' : c.id}">${icon(worn ? 'x' : 'cape')}<span>${esc(t(worn ? 'Quitármela' : 'Ponérmela'))}</span></button>` : tryBtn(c)}
          </div>
        </div>`;
      };
      body.innerHTML = html`<button class="kc-banner" id="kc-go">
          <span class="kc-minis">${(mine.length ? mine : K).slice(0, 3).map(c => `<canvas data-kc="${c.id}"></canvas>`).join('')}</span>
          <span class="kc-bt"><b>${t('Capas de Kopi')}</b><span>${mine.length ? t('{n} de {total} conseguidas', { n: mine.length, total: K.length }) : t('{n} por conseguir', { n: K.length })}</span></span>
          <span class="kc-arrow">${icon('chevronRight')}</span>
        </button>

        <div class="kc-h"><div><b>${t('Capas de Minecraft')}</b> <span class="muted">${list.length}</span></div>
          ${isMsa ? `<span class="kc-chip">${icon('globe')}${t('En todo Minecraft')}</span>` : ''}</div>
        ${isMsa ? html`<div class="skin-grid">
          <div class="skin-tile ${activeCape ? '' : 'on'}" data-cape=""><div class="prev cape-tile">${icon('x')}</div><div class="n">${t('Sin capa')}</div><div class="s">&nbsp;</div></div>
          ${list.map(c => html`<div class="skin-tile ${c.active ? 'on' : ''}" data-cape="${esc(c.id)}">
            <div class="prev cape-tile">${Skin3D.capePreview(c.url.replace(/^http:/, 'https:'), 4.2)}</div>
            <div class="n">${esc(c.alias || 'Capa')}</div><div class="s">Minecraft</div></div>`).join('')}
        </div>
        ${list.length ? '' : `<p class="muted" style="margin-top:14px;font-size:12.5px">${t('Tu cuenta aún no tiene capas oficiales de Minecraft.')}</p>`}`
        : `<p class="kc-note">${icon('lock')}${t('Las capas oficiales necesitan una cuenta de Microsoft.')}</p>`}

        <div class="kc-h" id="kc-sec"><div><b>${t('Capas de Kopi')}</b> <span class="muted">${K.length}</span></div>
          <span class="kc-chip pink">${icon('sparkles')}${t('Exclusivas de Kopi Client')}</span></div>
        <p class="kc-intro">${t('Capas animadas que solo tiene la gente de Kopi Client. Pronto podrás ganarlas jugando.')}</p>
        ${mine.length ? html`<div class="kc-rar mine"><i></i>${t('Tus capas')} <span class="muted">${mine.length}</span></div>
          <div class="kc-grid">${mine.map(card).join('')}</div>
          <p class="kc-ingame">${icon('info')}<span>${t('Dentro del juego se ve animada en las instancias con Fabric 1.21.1 o más nuevo, y quieta en las demás.')}</span></p>` : ''}
        ${['legendary', 'epic', 'rare', 'common'].map(r => {
          const cs = K.filter(c => c.rarity === r && !kopi.owned.includes(c.id));
          return cs.length ? html`<div class="kc-rar"><i style="background:${R[r].color}"></i>${t(R[r].label)} <span class="muted">${cs.length}</span></div>
            <div class="kc-grid">${cs.map(card).join('')}</div>` : '';
        }).join('')}`;

      body.querySelectorAll('canvas[data-kc]').forEach(cv => KopiCapes.mount(cv, KopiCapes.get(cv.dataset.kc)));
      body.querySelector('#kc-go').onclick = () => body.querySelector('#kc-sec').scrollIntoView({ behavior: 'smooth', block: 'start' });
      body.querySelectorAll('[data-try]').forEach(b => b.onclick = () => {
        tryCape(b.dataset.try);
        body.querySelectorAll('[data-try]').forEach(x => {
          const on = !!trying && trying.id === x.dataset.try;
          x.classList.toggle('on', on);
          x.innerHTML = `${icon(on ? 'x' : 'play')}<span>${esc(t(on ? 'Quitar' : 'Probar'))}</span>`;
        });
      });
      // Ponerse / quitarse una capa de Kopi (se guarda en el panel y se ve en el juego)
      body.querySelectorAll('[data-wear]').forEach(b => b.onclick = async () => {
        const id = b.dataset.wear || null;
        stopTry(); busy(b, true);
        try {
          const r = await onyx.capes.kopiWear(id);
          kopi.worn = (r && r.worn) || null;
          baseCape();
          if (kopi.worn && !capeOn) { capeOn = true; viewer.setCapeVisible(true); root.querySelector('.viewer-tools [data-t=cape]').classList.add('on'); }
          toast(id ? t('Capa de Kopi puesta') : t('Capa quitada'), 'success');
          capes(body);
        } catch (e) { toast(t(e.message, e.vars), 'error'); busy(b, false); }
      });
      body.querySelectorAll('[data-cape]').forEach(el => el.onclick = async () => {
        stopTry();
        const id = el.dataset.cape || null;
        body.querySelectorAll('[data-cape]').forEach(x => x.classList.toggle('on', x === el));
        const c = list.find(x => x.id === id);
        viewer.setCape(c ? c.url.replace(/^http:/, 'https:') : null);
        try { await onyx.skins.setCape(id); await App.loadAccounts(); toast(id ? t('Capa equipada') : t('Capa quitada'), 'success'); }
        catch (e) { toast(e.message, 'error'); }
      });
      // La primera vez se pregunta al panel qué capas tiene la cuenta
      if (!kopi.loaded) loadKopi().then(() => { if (body.isConnected && body.querySelector('#kc-sec')) capes(body); });
    }

    function explore(body) {
      body.innerHTML = html`<div class="row"><input class="input" id="ex-q" placeholder="${t('Nombre del jugador')}" style="max-width:330px" spellcheck="false">
        <button class="btn btn-outline" id="ex-go" style="height:44px">${icon('search')}${t('Buscar')}</button></div>
        <div id="ex-res" style="margin-top:20px"><p class="muted" style="text-align:center;padding:40px 0;font-size:12.5px">${t('Busca un jugador por su nombre.')}</p></div>`;
      const q = body.querySelector('#ex-q'), res = body.querySelector('#ex-res'), go = body.querySelector('#ex-go');
      const search = async () => {
        if (!q.value.trim()) return;
        busy(go, true);
        try {
          const p = await onyx.skins.lookup(q.value);
          if (!p || !p.skin) { res.innerHTML = `<p class="muted" style="text-align:center;padding:40px 0">${t('No se encontró a ese jugador premium.')}</p>`; return; }
          res.innerHTML = `<div class="skin-grid">${tile({ skin: p.skin, variant: p.variant, name: p.name, sub: 'Premium' })}</div>`;
          bindTiles(res, 'explore');
        } catch (e) { res.innerHTML = `<p class="muted" style="text-align:center;padding:40px 0">${esc(e.message)}</p>`; }
        finally { busy(go, false); }
      };
      go.onclick = search;
      q.onkeydown = (e) => { if (e.key === 'Enter') search(); };
    }

    drawPreview();
    setTab(tab);

    // Skin propia guardada en el launcher (offline): corregir el modelo si se guardó mal.
    if (current.skin.startsWith('data:')) {
      Skin3D.detectModel(current.skin).then(async (v) => {
        if (v === current.variant) return;
        const wasSame = preview.skin === current.skin && preview.variant === current.variant;
        current.variant = v;
        if (wasSame) { preview.variant = v; drawPreview(); }
        if (!isMsa) { try { await onyx.skins.apply({ data: current.skin, variant: v }); await App.loadAccounts(); } catch { /* nada */ } }
      });
    }
    return () => { stopTry(); clearInterval(baseTimer); viewer.destroy(); };
  };
})();
