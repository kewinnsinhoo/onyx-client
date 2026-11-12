// Instancias: lista y asistente "Nueva instancia" con vista previa en directo.
(function () {
  const V = window.Views;
  window.CATEGORIES = ['Evento', 'Torneo', 'Serie', 'Survival', 'Minijuegos', 'Squid Game'];
  window.LOADERS = [
    { id: 'vanilla', i: 'gamepad', t: 'Vanilla', s: 'Minecraft sin mods' },
    { id: 'fabric', i: 'leaf', t: 'Fabric', s: 'Ligero, mods modernos' },
    { id: 'forge', i: 'hammer', t: 'Forge', s: 'El clásico de los modpacks' },
    { id: 'neoforge', i: 'flame', t: 'NeoForge', s: 'El sucesor de Forge' },
    { id: 'quilt', i: 'layers', t: 'Quilt', s: 'Compatible con Fabric' }
  ];

  // ---------- versiones (se piden una vez) ----------
  let versionsP = null;
  window.mcVersions = () => versionsP || (versionsP = api('GET', '/meta/versions').catch(() => { versionsP = null; return null; }));
  const loaderCache = {};
  window.loaderVersions = (type, mc) => {
    const k = `${type}:${mc}`;
    return loaderCache[k] || (loaderCache[k] = api('GET', `/meta/loader?type=${type}&mc=${encodeURIComponent(mc)}`).catch(() => ({ versions: [] })));
  };
  window.versionSelect = async (sel, current, showSnap) => {
    const m = await mcVersions();
    if (!m) { sel.outerHTML = `<input class="input" id="${sel.id}" value="${esc(current)}">`; return; }
    const list = m.versions.filter(v => showSnap ? true : v.type === 'release' || v.id === current);
    sel.innerHTML = list.map(v => `<option value="${esc(v.id)}" ${v.id === current ? 'selected' : ''}>${esc(v.id)}${v.type === 'snapshot' ? ' · snapshot' : v.type.startsWith('old_') ? ' · ' + v.type.replace('old_', '') : ''}</option>`).join('');
  };
  window.fillLoaderVersions = async (sel, type, mc, current) => {
    if (type === 'vanilla') { sel.innerHTML = '<option value="latest">—</option>'; sel.disabled = true; return; }
    sel.disabled = true;
    sel.innerHTML = `<option>${t('Cargando…')}</option>`;
    const r = await loaderVersions(type, mc);
    sel.disabled = false;
    const rec = r.recommended;
    sel.innerHTML = `<option value="latest">${rec ? t('Recomendada ({v})', { v: esc(rec) }) : t('La más nueva')}</option>` +
      r.versions.slice(0, 200).map(v => `<option value="${esc(v)}" ${v === current ? 'selected' : ''}>${esc(v)}</option>`).join('');
    if (!r.versions.length) sel.insertAdjacentHTML('beforeend', `<option disabled>${t('No hay versiones para esta versión de Minecraft')}</option>`);
  };

  // ---------- vista previa (igual que en el launcher) ----------
  window.previewHtml = (d, opts = {}) => {
    const l = d.look;
    const bg = l.backgroundAnimated && opts.animated !== false
      ? `<video src="${esc(l.backgroundAnimated)}" autoplay muted loop playsinline poster="${esc(l.background || '')}" style="width:100%;height:100%;object-fit:cover"></video>`
      : l.background ? `<img src="${esc(l.background)}" alt="">` : '';
    const max = d.access.maxPlayers ? d.access.maxPlayers : '∞';
    return html`<div class="preview">
      <div class="bg">${bg}</div>${l.vignette ? '<div class="vig"></div>' : '<div class="vig" style="opacity:.55"></div>'}${l.snow ? '<div class="snow"></div>' : ''}
      <div class="inner">
        <div class="cat" style="color:${esc(l.accent)}">${esc(t(d.category))}</div>
        ${l.logo ? `<img class="logo" src="${esc(l.logoAnimated || l.logo)}" alt="">` : l.hideTitle ? '' : `<h2>${esc(d.name || t('Sin nombre'))}</h2>`}
        ${d.description ? `<div class="desc">${esc(d.description)}</div>` : ''}
        ${l.hideTech ? '' : `<div class="meta"><span>${icon('cpu')}${esc(d.minecraft)}</span><span>${icon('sliders')}${loaderName(d.loader)}</span><span>${icon('users')}0 / ${max}</span></div>`}
        <span class="go" style="background:${esc(l.playColor)}">${icon('play')}${t('Jugar')}</span>
      </div>
      ${l.hideAuthor ? '' : `<div class="by">${t('por')} <b>${esc(opts.studio || S.studio.name)}</b></div>`}
    </div><div class="preview-cap">${t('Así se verá en el launcher.')}</div>`;
  };

  // ---------- lista ----------
  V.instances = async (view, r) => {
    const q = (r.query.get('q') || '').toLowerCase();
    view.innerHTML = `<div class="page"><div class="skel" style="height:60px;margin-bottom:24px"></div><div class="inst-grid"><div class="skel" style="height:220px"></div><div class="skel" style="height:220px"></div><div class="skel" style="height:220px"></div></div></div>`;
    const { instances } = await sapi('GET', '/instances');
    let filter = 'all';
    const draw = () => {
      const list = instances.filter(i => (!q || i.data.name.toLowerCase().includes(q)) &&
        (filter === 'all' || (filter === 'active' && i.state === 'open' && !i.hidden) || (filter === 'locked' && i.state === 'locked') || (filter === 'hidden' && i.hidden)));
      $('#grid').innerHTML = list.map(instCard).join('') + (can('editor') && filter === 'all' && !q ? `<button class="new-card" id="new2"><div>${icon('plus')}${t('Nueva instancia')}</div></button>` : '');
      if (!list.length && (q || filter !== 'all')) $('#grid').innerHTML = `<div class="card empty" style="grid-column:1/-1"><p>${t('Ninguna instancia coincide.')}</p></div>`;
      const n2 = $('#new2'); if (n2) n2.onclick = () => V.wizard();
    };
    view.innerHTML = html`<div class="page">
      <div class="page-head"><div><h1>${t('Instancias')}</h1><p>${t('Las instancias de tu studio que verán los jugadores en el launcher.')}</p></div><span class="grow"></span>
        ${can('editor') ? `<button class="btn primary" id="new">${icon('plus')}${t('Nueva instancia')}</button>` : ''}</div>
      ${q ? `<div class="note" style="margin-bottom:16px">${icon('search')}<span>${t('Resultados para «{q}»', { q: esc(q) })} · <a href="#/instances" style="color:var(--accent)">${t('Quitar búsqueda')}</a></span></div>` : ''}
      <div class="seg" id="flt" style="margin-bottom:18px">
        ${[['all', 'Todas'], ['active', 'Activas'], ['locked', 'Bloqueadas'], ['hidden', 'Ocultas']].map(([k, l]) => `<button data-f="${k}" class="${k === 'all' ? 'on' : ''}">${t(l)}</button>`).join('')}</div>
      ${instances.length ? '<div class="inst-grid" id="grid"></div>'
        : html`<div class="card empty"><div class="ic">${icon('grid')}</div><h4>${t('Crea tu primera instancia')}</h4><p>${t('Una instancia es un Minecraft preparado para tu evento: versión, loader, mods y quién puede entrar.')}</p>
          ${can('editor') ? `<button class="btn primary" id="new3">${icon('plus')}${t('Nueva instancia')}</button>` : ''}</div>`}
    </div>`;
    const n = $('#new'); if (n) n.onclick = () => V.wizard();
    const n3 = $('#new3'); if (n3) n3.onclick = () => V.wizard();
    if (instances.length) {
      $$('#flt button').forEach(b => b.onclick = () => { filter = b.dataset.f; $$('#flt button').forEach(x => x.classList.toggle('on', x === b)); draw(); });
      draw();
    }
  };

  // ---------- asistente ----------
  V.wizard = () => {
    const d = {
      name: '', category: 'Evento', description: '', minecraft: '1.21.1', loader: { type: 'vanilla', version: 'latest' }, java: 'auto',
      look: { background: null, icon: null, logo: null, accent: '#8e9bff', playColor: '#5b67e8', vignette: true },
      access: { codes: true, list: false, premiumOnly: false, maxPlayers: null }
    };
    let names = '';
    let step = 0;
    const STEPS = ['Nombre', 'Juego', 'Aspecto', 'Acceso'];
    modal((m, close) => {
      const fullD = () => ({ ...d, look: { ...d.look, hideTitle: false, hideTech: false, hideAuthor: false, snow: false } });
      const refresh = () => { const r = $('.wiz .r', m); if (r) r.innerHTML = previewHtml(fullD()); };
      const body = () => {
        if (step === 0) return html`<div class="stepno">${t('Paso {n} de {t}', { n: 1, t: 4 })}</div><h2>${t('¿Cómo se llama?')}</h2><p class="lead">${t('Así aparecerá en el launcher.')}</p>
          <div class="field"><input class="input big" id="w-name" maxlength="60" placeholder="${t('Ej.: Survival de temporada')}" value="${esc(d.name)}"></div>
          <div class="field"><span class="label">${t('Categoría')}</span><div class="chips" id="w-cat">${CATEGORIES.map(c => `<button class="chip ${d.category === c ? 'on' : ''}" data-c="${esc(c)}">${esc(t(c))}</button>`).join('')}</div></div>
          <div class="field"><span class="label">${t('Descripción')}</span><textarea class="input" id="w-desc" maxlength="200" placeholder="${t('Una frase sobre el evento (opcional)')}">${esc(d.description)}</textarea></div>`;
        if (step === 1) return html`<div class="stepno">${t('Paso {n} de {t}', { n: 2, t: 4 })}</div><h2>${t('¿Con qué versión se juega?')}</h2><p class="lead">${t('La versión y el loader deciden qué mods funcionan.')}</p>
          <div class="field"><span class="label">${t('Versión')}</span><select class="input" id="w-mc"><option>${esc(d.minecraft)}</option></select>
            <label class="check" style="font-weight:500;font-size:12.5px"><input type="checkbox" id="w-snap">${t('Mostrar snapshots y versiones antiguas')}</label></div>
          <div class="field"><span class="label">${t('Loader')}</span><div class="loaders">${LOADERS.map(L => html`<button class="option ${d.loader.type === L.id ? 'on' : ''}" data-l="${L.id}"><span class="ic">${icon(L.i)}</span><b>${L.t}</b><small>${t(L.s)}</small></button>`).join('')}</div></div>
          <details style="margin-top:14px" ${d.loader.type !== 'vanilla' ? 'open' : ''}><summary class="label" style="cursor:pointer">${t('Avanzado')}</summary>
            <div class="row" style="margin-top:10px"><div class="field"><span class="label">${t('Versión del loader')}</span><select class="input" id="w-lv"></select></div>
              <div class="field"><span class="label">Java</span><select class="input" id="w-java">${['auto', '8', '17', '21', '25'].map(j => `<option value="${j}" ${d.java === j ? 'selected' : ''}>${j === 'auto' ? t('Automático') : 'Java ' + j}</option>`).join('')}</select></div></div></details>`;
        if (step === 2) return html`<div class="stepno">${t('Paso {n} de {t}', { n: 3, t: 4 })}</div><h2>${t('¿Cómo se ve?')}</h2><p class="lead">${t('Puedes cambiarlo cuando quieras en Personalización.')}</p>
          ${imgField('background', 'Fondo', 'image/*')}${imgField('icon', 'Icono de la barra lateral', 'image/*')}
          <div class="colors"><label class="color-pick"><input type="color" id="w-accent" value="${d.look.accent}"><span class="label">${t('Color de acento')}</span></label>
            <label class="color-pick"><input type="color" id="w-play" value="${d.look.playColor}"><span class="label">${t('Color del botón Jugar')}</span></label></div>`;
        return html`<div class="stepno">${t('Paso {n} de {t}', { n: 4, t: 4 })}</div><h2>${t('¿Quién puede entrar?')}</h2><p class="lead">${t('Nadie entra sin código o sin estar en la lista.')}</p>
          <div class="grid g2" style="gap:10px">
            <button class="option ${d.access.codes ? 'on' : ''}" data-a="codes"><span class="ic">${icon('key')}</span><span><b>${t('Código de invitación')}</b><small>${t('Se crea uno de 100 usos para repartir.')}</small></span></button>
            <button class="option ${d.access.list ? 'on' : ''}" data-a="list"><span class="ic">${icon('users')}</span><span><b>${t('Lista de nombres')}</b><small>${t('Solo entran los nombres que escribas.')}</small></span></button></div>
          ${d.access.list ? `<div class="field" style="margin-top:14px"><span class="label">${t('Nombres de Minecraft, uno por línea')}</span><textarea class="input" id="w-names" placeholder="Steve\nAlex">${esc(names)}</textarea></div>` : ''}
          <div class="row" style="margin-top:14px;align-items:end"><div class="field"><span class="label">${t('Límite de jugadores')}</span><input class="input" id="w-max" type="number" min="1" placeholder="${t('Sin límite')}" value="${d.access.maxPlayers || ''}"></div>
            <label class="check" style="height:40px"><input type="checkbox" id="w-prem" ${d.access.premiumOnly ? 'checked' : ''}>${t('Solo Premium')}</label></div>`;
      };
      const imgField = (key, label, accept) => html`<div class="field"><span class="label">${t(label)}</span><div style="display:flex;gap:8px">
        <input class="input" data-img="${key}" placeholder="https://…" value="${esc(d.look[key] || '')}"><button class="btn" data-up="${key}" data-accept="${accept}">${icon('upload')}${t('Subir')}</button></div></div>`;

      const draw = () => {
        m.innerHTML = html`<div class="mh"><h3 style="flex:none">${icon('sparkles')}${t('Nueva instancia')}</h3>
            <div class="steps">${STEPS.map((s, i) => `${i ? '<i></i>' : ''}<span class="${i === step ? 'on' : i < step ? 'done' : ''}"><b>${i < step ? icon('check') : i + 1}</b><em style="font-style:normal">${t(s)}</em></span>`).join('')}</div>
            <button class="btn ghost icon" id="w-x">${icon('x')}</button></div>
          <div class="wiz"><div class="l">${body()}</div><div class="r"></div></div>
          <div class="mf">${step ? `<button class="btn" id="w-back">${icon('chevLeft')}${t('Anterior')}</button>` : ''}<span class="grow"></span>
            ${step < 3 ? `<button class="btn primary" id="w-next">${t('Siguiente')}${icon('chevRight')}</button>` : `<button class="btn primary" id="w-create">${icon('check')}${t('Crear instancia')}</button>`}</div>`;
        refresh();
        bind();
      };
      const bind = () => {
        $('#w-x', m).onclick = () => close();
        const back = $('#w-back', m); if (back) back.onclick = () => { step--; draw(); };
        const next = $('#w-next', m);
        if (next) next.onclick = () => {
          if (step === 0 && !d.name.trim()) { $('#w-name', m).focus(); return toast(t('Ponle un nombre a la instancia'), 'err'); }
          step++; draw();
        };
        const on = (sel, ev, fn) => { const el = $(sel, m); if (el) el[ev] = fn; };
        on('#w-name', 'oninput', (e) => { d.name = e.target.value; refresh(); });
        on('#w-desc', 'oninput', (e) => { d.description = e.target.value; refresh(); });
        $$('#w-cat .chip', m).forEach(b => b.onclick = () => { d.category = b.dataset.c; $$('#w-cat .chip', m).forEach(x => x.classList.toggle('on', x === b)); refresh(); });
        if (step === 1) {
          const sel = $('#w-mc', m), lv = $('#w-lv', m);
          versionSelect(sel, d.minecraft, false).then(() => {
            const s2 = $('#w-mc', m);
            s2.onchange = s2.oninput = (e) => { d.minecraft = e.target.value; d.loader.version = 'latest'; fillLoaderVersions(lv, d.loader.type, d.minecraft, 'latest'); refresh(); };
          });
          $('#w-snap', m).onchange = (e) => versionSelect($('#w-mc', m), d.minecraft, e.target.checked);
          fillLoaderVersions(lv, d.loader.type, d.minecraft, d.loader.version);
          lv.onchange = (e) => { d.loader.version = e.target.value; };
          $('#w-java', m).onchange = (e) => { d.java = e.target.value; };
          $$('[data-l]', m).forEach(b => b.onclick = () => {
            d.loader = { type: b.dataset.l, version: 'latest' };
            $$('[data-l]', m).forEach(x => x.classList.toggle('on', x === b));
            fillLoaderVersions(lv, d.loader.type, d.minecraft, 'latest');
            if (d.loader.type !== 'vanilla') $('details', m).open = true;
            refresh();
          });
        }
        if (step === 2) {
          $$('[data-img]', m).forEach(i => i.oninput = () => { d.look[i.dataset.img] = i.value.trim() || null; refresh(); });
          $$('[data-up]', m).forEach(b => b.onclick = async () => {
            const f = await pickFile(b.dataset.accept); if (!f) return;
            busy(b, true);
            try { const r = await upload(f); d.look[b.dataset.up] = r.url; $(`[data-img=${b.dataset.up}]`, m).value = r.url; refresh(); }
            catch (e) { fail(e); } finally { busy(b, false); }
          });
          on('#w-accent', 'oninput', (e) => { d.look.accent = e.target.value; refresh(); });
          on('#w-play', 'oninput', (e) => { d.look.playColor = e.target.value; refresh(); });
        }
        if (step === 3) {
          $$('[data-a]', m).forEach(b => b.onclick = () => { const k = b.dataset.a; d.access[k] = !d.access[k]; draw(); });
          on('#w-names', 'oninput', (e) => { names = e.target.value; });
          on('#w-max', 'oninput', (e) => { d.access.maxPlayers = Number(e.target.value) || null; refresh(); });
          on('#w-prem', 'onchange', (e) => { d.access.premiumOnly = e.target.checked; });
          const c = $('#w-create', m);
          c.onclick = async () => {
            if (!d.access.codes && !d.access.list && !(await confirmBox({ title: t('Nadie podrá entrar'), text: t('No elegiste código ni lista de nombres. Podrás añadirlos después en Acceso.'), ok: t('Crear igualmente') }))) return;
            busy(c, true);
            try {
              const nm = d.access.list ? names.split(/[\s,]+/).filter(Boolean) : [];
              const r = await sapi('POST', '/instances', { data: d, names: nm });
              close();
              created(r);
            } catch (e) { fail(e); busy(c, false); }
          };
        }
      };
      draw();
      mcVersions().then(mv => { if (mv && d.minecraft === '1.21.1' && mv.latest && mv.latest.release) { d.minecraft = mv.latest.release; if (step === 1) draw(); else refresh(); } });
    }, { wide: true, closable: false });
  };

  function created(r) {
    modal((m, close) => {
      m.innerHTML = html`<div class="mh"><h3>${icon('check')}${t('Instancia creada')}</h3></div><div class="mb">
        ${r.code ? `<p style="margin:0 0 12px">${t('Este es el código de invitación. Los jugadores lo escriben en el launcher para añadir la instancia.')}</p>
          <div class="code-box"><b>${esc(r.code)}</b><button class="btn sm" id="cp">${icon('copy')}${t('Copiar')}</button></div>
          <p class="help" style="margin-top:10px">${t('Tiene 100 usos. Puedes crear más códigos en Acceso.')}</p>` : `<p style="margin:0">${t('Ya puedes subir archivos y ajustar el acceso.')}</p>`}
      </div><div class="mf"><button class="btn" id="later">${t('Cerrar')}</button><button class="btn primary" id="open">${t('Abrir instancia')}</button></div>`;
      const cp = $('#cp', m); if (cp) cp.onclick = () => copy(r.code);
      $('#later', m).onclick = () => { close(); rerender(); };
      $('#open', m).onclick = () => { close(); go(`/instance/${encodeURIComponent(r.id)}`); };
    });
  }
})();
