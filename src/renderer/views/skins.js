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
    viewer.setCape(activeCape ? activeCape.url.replace(/^http:/, 'https:') : null);

    const dirty = () => preview.skin !== current.skin || preview.variant !== current.variant;

    function drawPreview() {
      viewer.setSkin(preview.skin, preview.variant);
      $('#sk-head').innerHTML = Skin3D.head(preview.skin, 36, 7);
      $('#sk-name').textContent = preview.name;
      $('#sk-state').textContent = dirty() ? t('Sin aplicar') : (isMsa ? t('En uso') : t('Solo en el launcher (offline)'));
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
      body.querySelectorAll('.skin-tile[data-skin]').forEach(el => el.onclick = (e) => {
        if (e.target.closest('[data-del]')) return;
        preview = { skin: el.dataset.skin, variant: el.dataset.variant, name: el.dataset.name, source };
        body.querySelectorAll('.skin-tile').forEach(x => x.classList.toggle('on', x === el));
        drawPreview();
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
          preview = { skin: data, variant: preview.variant, name: name || 'Skin', source: 'upload' };
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

    function capes(body) {
      if (!isMsa) {
        body.innerHTML = html`<div class="center-empty" style="padding:50px 0"><div class="ico">${icon('cape')}</div>
          <div class="t">${t('Las capas necesitan una cuenta de Microsoft')}</div><div class="s">${t('Añade una en Ajustes > Cuentas.')}</div></div>`;
        return;
      }
      const list = acc.capes || [];
      body.innerHTML = html`<div class="row" style="margin-bottom:14px"><div style="font-weight:700">${t('Tuyas')} <span class="muted" style="font-weight:500">${list.length}</span></div></div>
        <div class="skin-grid">
          <div class="skin-tile ${activeCape ? '' : 'on'}" data-cape=""><div class="prev cape-tile">${icon('x')}</div><div class="n">${t('Sin capa')}</div><div class="s">&nbsp;</div></div>
          ${list.map(c => html`<div class="skin-tile ${c.active ? 'on' : ''}" data-cape="${esc(c.id)}">
            <div class="prev cape-tile">${Skin3D.capePreview(c.url.replace(/^http:/, 'https:'), 4.2)}</div>
            <div class="n">${esc(c.alias || 'Capa')}</div><div class="s">Minecraft</div></div>`).join('')}
        </div>
        ${list.length ? '' : `<p class="muted" style="margin-top:14px;font-size:12.5px">${t('Tu cuenta aún no tiene capas oficiales de Minecraft.')}</p>`}`;
      body.querySelectorAll('[data-cape]').forEach(el => el.onclick = async () => {
        const id = el.dataset.cape || null;
        body.querySelectorAll('[data-cape]').forEach(x => x.classList.toggle('on', x === el));
        const c = list.find(x => x.id === id);
        viewer.setCape(c ? c.url.replace(/^http:/, 'https:') : null);
        try { await onyx.skins.setCape(id); await App.loadAccounts(); toast(id ? t('Capa equipada') : t('Capa quitada'), 'success'); }
        catch (e) { toast(e.message, 'error'); }
      });
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
    return () => viewer.destroy();
  };
})();
