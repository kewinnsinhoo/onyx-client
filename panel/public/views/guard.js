// KopiGuard (anticheat): lo que han visto los launchers mientras se jugaba en las instancias del studio.
// Arriba los números; luego filtros (tipo, estado, gravedad, texto, instancia, fechas), la lista y el
// detalle de cada detección con sus botones: revisar, descartar, sancionar y expulsar.
(function () {
  const V = window.Views;
  const TYPES = [['', 'grid', 'Todos'], ['mod', 'package', 'Mod'], ['pack', 'image', 'Paquete'], ['file', 'file', 'Archivo'], ['program', 'cpu', 'Programa']];
  const STATUS = [['', 'Todos'], ['new', 'Nuevo'], ['reviewed', 'Revisado'], ['dismissed', 'Descartado'], ['sanctioned', 'Sancionado']];
  const SEV = { high: ['danger', 'Alta'], medium: ['warn', 'Media'], low: ['info', 'Baja'] };
  const ST = { new: ['accent', 'Nuevo'], reviewed: ['ok', 'Revisado'], dismissed: ['mute', 'Descartado'], sanctioned: ['danger', 'Sancionado'] };
  const TYPE_NAME = Object.fromEntries(TYPES.slice(1).map(([k, i, l]) => [k, [i, l]]));
  const day = (v, end) => { if (!v) return ''; const d = new Date(v + 'T00:00:00'); if (end) d.setHours(23, 59, 59, 999); return String(d.getTime()); };
  const head = (name) => `<span class="g-head"><span>${initials(name)}</span><img src="https://mc-heads.net/avatar/${encodeURIComponent(name)}/28" alt="" loading="lazy" onerror="this.remove()"></span>`;
  const badge = ([cls, label], extra = '') => `<span class="badge ${cls}">${extra}${esc(t(label))}</span>`;

  V.guard = async (view) => {
    const f = { type: '', status: '', severity: '', q: '', instance: '', from: '', to: '' };
    let rows = [], more = false, last = null;

    const query = (before) => {
      const p = new URLSearchParams();
      for (const k of ['type', 'status', 'severity', 'q', 'instance']) if (f[k]) p.set(k, f[k]);
      if (f.from) p.set('from', day(f.from)); if (f.to) p.set('to', day(f.to, true));
      if (before) p.set('before', String(before));
      return `/guard?${p}`;
    };
    const anyFilter = () => Object.values(f).some(Boolean);

    async function load(append) {
      const r = await sapi('GET', query(append ? rows[rows.length - 1].at : null));
      rows = append ? rows.concat(r.events) : r.events;
      more = r.more; last = r;
      draw();
    }

    function draw() {
      const r = last, total = Object.values(r.types).reduce((a, b) => a + b, 0);
      const stat = (ic, k, v, s) => html`<div class="card stat g-stat"><span class="k"><i>${icon(ic)}</i>${k}</span><span class="v">${v}</span>${s ? `<small>${s}</small>` : ''}</div>`;
      view.innerHTML = html`<div class="page g-page">
        <div class="page-head"><div><h1>${icon('shield')}KopiGuard</h1><p>${t('El anticheat de tus instancias: lo que ve el launcher mientras se juega.')}</p></div>
          <span class="grow"></span><button class="btn ghost" id="g-reload">${icon('refresh')}${t('Actualizar')}</button></div>
        <div class="grid g3" style="margin-bottom:16px">
          ${stat('shield', t('Instancias con KopiGuard'), r.stats.guarded)}
          ${stat('activity', t('Detecciones'), r.stats.total)}
          ${stat('logout', t('Expulsiones'), r.stats.kicks24h, t('Últimas 24 h'))}
        </div>
        <div class="card g-card">
          <div class="g-bar">
            <div class="seg">${TYPES.map(([k, i, l]) => `<button class="${f.type === k ? 'on' : ''}" data-type="${k}">${icon(i)}${esc(t(l))}<span class="n">${k ? (r.types[k] || 0) : total}</span></button>`).join('')}</div>
          </div>
          <div class="g-bar">
            <div class="seg sm">${STATUS.map(([k, l]) => `<button class="${f.status === k ? 'on' : ''}" data-status="${k}">${esc(t(l))}</button>`).join('')}</div>
            <select class="input g-sel" id="g-sev"><option value="">${t('Cualquier gravedad')}</option>${Object.entries(SEV).map(([k, [, l]]) => `<option value="${k}" ${f.severity === k ? 'selected' : ''}>${esc(t(l))}</option>`).join('')}</select>
            <label class="g-search">${icon('search')}<input class="input" id="g-q" placeholder="${t('Buscar jugador o detalle…')}" value="${esc(f.q)}"></label>
            <select class="input g-sel" id="g-inst"><option value="">${t('Todas las instancias')}</option>${r.instances.map(i => `<option value="${esc(i.id)}" ${f.instance === i.id ? 'selected' : ''}>${esc(i.name)}${i.guarded ? '' : ' · ' + esc(t('sin KopiGuard'))}</option>`).join('')}</select>
            <label class="g-date"><span>${t('Desde')}</span><input class="input" type="date" id="g-from" value="${f.from}"></label>
            <label class="g-date"><span>${t('Hasta')}</span><input class="input" type="date" id="g-to" value="${f.to}"></label>
            ${anyFilter() ? `<button class="btn sm ghost" id="g-clear">${icon('x')}${t('Quitar filtros')}</button>` : ''}
          </div>
          ${rows.length ? html`<div class="g-table"><table class="table"><thead><tr><th>${t('Cuándo')}</th><th>${t('Instancia')}</th><th>${t('Tipo')}</th><th>${t('Jugador')}</th><th>${t('Detalle')}</th><th>${t('Estado')}</th></tr></thead><tbody>
            ${rows.map(e => html`<tr class="g-row" data-id="${esc(e.id)}">
              <td class="nowrap" title="${esc(fmtDateTime(e.at))}">${timeAgo(e.at)}</td>
              <td class="nowrap"><span class="g-inst">${esc(e.instanceName)}</span></td>
              <td><span class="badge g-type t-${e.type}">${icon(TYPE_NAME[e.type][0])}${esc(t(TYPE_NAME[e.type][1]))}</span></td>
              <td><span class="g-player">${head(e.player)}<b>${esc(e.player)}</b></span></td>
              <td class="g-detail">${esc(e.detail)}${e.extra ? ` <span class="g-more">${t('y {n} más', { n: e.extra })}</span>` : ''}</td>
              <td class="nowrap">${badge(SEV[e.severity])} ${badge(ST[e.status])}${e.kicked ? ` <span class="badge danger solid">${icon('logout')}${t('Expulsado')}</span>` : ''}</td>
            </tr>`).join('')}</tbody></table></div>
            <div class="g-foot"><span>${t('Mostrando {n}', { n: rows.length })}</span>${more ? `<button class="btn sm" id="g-more">${t('Cargar más')}</button>` : ''}</div>`
          : html`<div class="empty"><div class="ic">${icon('shield')}</div><h4>${anyFilter() ? t('Nada con estos filtros') : t('Todo limpio')}</h4>
              <p>${anyFilter() ? t('Prueba a quitar algún filtro.') : r.stats.guarded ? t('Cuando el launcher vea algo raro mientras se juega, aparecerá aquí.') : t('Activa KopiGuard en una instancia: editor de la instancia → Protección.')}</p></div>`}
        </div>
        <p class="help g-note">${icon('info')}${t('KopiGuard se activa en cada instancia, en su editor → Protección. De los programas abiertos, el launcher solo avisa de los de trampas.')}</p>
      </div>`;
      $('#g-reload', view).onclick = () => load().catch(fail);
      $$('[data-type]', view).forEach(b => b.onclick = () => { f.type = b.dataset.type; load().catch(fail); });
      $$('[data-status]', view).forEach(b => b.onclick = () => { f.status = b.dataset.status; load().catch(fail); });
      $('#g-sev', view).onchange = (e) => { f.severity = e.target.value; load().catch(fail); };
      $('#g-inst', view).onchange = (e) => { f.instance = e.target.value; load().catch(fail); };
      $('#g-from', view).onchange = (e) => { f.from = e.target.value; load().catch(fail); };
      $('#g-to', view).onchange = (e) => { f.to = e.target.value; load().catch(fail); };
      let qt = 0;
      const qi = $('#g-q', view);
      qi.oninput = () => { clearTimeout(qt); qt = setTimeout(() => { f.q = qi.value.trim(); load().then(() => { const n = $('#g-q', view); n.focus(); n.setSelectionRange(n.value.length, n.value.length); }).catch(fail); }, 350); };
      const clear = $('#g-clear', view);
      if (clear) clear.onclick = () => { Object.keys(f).forEach(k => { f[k] = ''; }); load().catch(fail); };
      const mo = $('#g-more', view);
      if (mo) mo.onclick = () => load(true).catch(fail);
      $$('.g-row', view).forEach(tr => tr.onclick = () => openEvent(tr.dataset.id, () => load().catch(fail)));
    }

    view.innerHTML = `<div class="page"><div class="skel" style="height:120px;margin-bottom:16px"></div><div class="skel" style="height:420px"></div></div>`;
    await load();
  };

  // Foto y vídeo de la detección (el launcher los sube justo después de avisar)
  function mediaBlock(e) {
    const m = e.media, base = `/api/s/${encodeURIComponent(S.studio.id)}/guard/${encodeURIComponent(e.id)}`;
    if (!m) return `<div class="g-sec g-media">${icon('image')}<div><b>${t('Sin captura')}</b><small>${t('Las detecciones leves (y a partir de la sexta de una partida) no llevan foto ni vídeo.')}</small></div></div>`;
    if (!m.shot && !m.video) return `<div class="g-sec g-media">${icon('image')}<div><b>${t('Captura y vídeo')}</b><small>${t('Todavía no han llegado. Si el jugador tenía el juego minimizado, no habrá.')}</small></div></div>`;
    return html`<div class="g-shots">
      ${m.shot ? `<a class="g-shot" href="${base}/shot" target="_blank" rel="noopener" title="${esc(t('Abrir en grande'))}"><img src="${base}/shot" alt="" loading="lazy"><span class="g-cap">${icon('camera')}${t('Captura')}</span></a>` : ''}
      ${m.video ? `<div class="g-shot g-vid"><video src="${base}/video" controls preload="metadata" playsinline></video><span class="g-cap">${icon('video')}${t('Vídeo · 10 s')}</span></div>` : ''}
    </div>`;
  }

  // ---------------------------------------------------------------- detalle (panel lateral)
  async function openEvent(id, onChange) {
    let changed = false;
    const close = modal((m, done) => {
      m.classList.add('g-drawer');
      m.innerHTML = `<div class="skel" style="height:100%"></div>`;
      const render = async () => {
        const { event: e } = await sapi('GET', `/guard/${encodeURIComponent(id)}`);
        const d = e.data || {}, p = d.process;
        const canEdit = can('editor') || (S.me && S.me.user.role === 'creator');
        m.innerHTML = html`<div class="mh"><h3>${icon('shield')}${t('Detección de KopiGuard')}</h3><button class="btn ghost icon sm" data-x title="${t('Cerrar')}">${icon('x')}</button></div>
          <div class="mb g-dbody">
            <div class="g-who">${head(e.player)}<div><b>${esc(e.player)}</b><small>${esc(e.instanceName)} · ${esc(fmtDateTime(e.at))}</small></div>
              <span class="grow"></span>${e.playing ? `<span class="badge ok">${icon('activity')}${t('Jugando ahora')}</span>` : ''}</div>
            ${e.livePlay && (can('editor') || (S.me && S.me.user.role === 'creator')) ? `<a class="btn sm g-live-btn" href="#/cameras?play=${encodeURIComponent(e.livePlay)}" data-x>${icon('video')}${t('Ver su cámara en directo')}</a>` : ''}
            <div class="g-tags"><span class="badge g-type t-${e.type}">${icon(TYPE_NAME[e.type][0])}${esc(t(TYPE_NAME[e.type][1]))}</span>${badge(SEV[e.severity])}${badge(ST[e.status])}${e.kicked ? `<span class="badge danger solid">${icon('logout')}${t('Expulsado')}</span>` : ''}</div>
            <h4 class="g-title">${esc(e.detail)}</h4>
            ${(d.items || []).length > 1 ? html`<ul class="g-items">${d.items.map(x => `<li class="mono">${esc(x)}</li>`).join('')}</ul>` : ''}
            ${p ? html`<div class="g-sec"><span class="label">${t('Datos técnicos')}</span>
              <div class="g-kv"><span>${t('Programa')}</span><b>${esc(p.name)}</b></div>
              ${p.path ? `<div class="g-kv"><span>${t('Ruta')}</span><code>${esc(p.path)}</code></div>` : ''}
              ${p.hash ? `<div class="g-kv"><span>${t('Huella')}</span><code>${esc(p.hash)}</code></div>` : ''}</div>` : ''}
            ${(d.mods || []).length ? html`<details class="g-sec g-mods"><summary><span class="label">${t('Mods cargados ({n})', { n: d.mods.length })}</span></summary>
              <div class="chips">${d.mods.map(x => `<span class="tag mono">${esc(x)}</span>`).join('')}</div></details>` : ''}
            ${mediaBlock(e)}
            ${e.others ? `<p class="help">${e.others === 1 ? t('Este jugador tiene 1 detección más en esta instancia.') : t('Este jugador tiene {n} detecciones más en esta instancia.', { n: e.others })}</p>` : ''}
            ${e.handledBy ? `<p class="help">${t('Último cambio: {who}, {when}', { who: esc(e.handledBy), when: esc(fmtDateTime(e.handledAt)) })}</p>` : ''}
          </div>
          ${canEdit ? html`<div class="mf g-actions">
            <button class="btn" data-a="reviewed" ${e.status === 'reviewed' ? 'disabled' : ''}>${icon('check')}${t('Revisar')}</button>
            <button class="btn" data-a="dismissed" ${e.status === 'dismissed' ? 'disabled' : ''}>${icon('x')}${t('Descartar')}</button>
            <button class="btn danger" data-a="sanction" ${e.status === 'sanctioned' ? 'disabled' : ''}>${icon('ban')}${t('Sancionar')}</button>
            <button class="btn danger" data-a="kick" ${e.playing ? '' : `disabled title="${esc(t('Solo si está jugando ahora'))}"`}>${icon('logout')}${t('Expulsar')}</button>
          </div>` : ''}`;
        $$('[data-x]', m).forEach(x => { x.onclick = () => done(); });
        $$('[data-a]', m).forEach(b => b.onclick = async () => {
          const a = b.dataset.a;
          if (a === 'sanction' && !(await confirmBox({ title: t('¿Sancionar a {n}?', { n: e.player }), text: t('Queda baneado en {i}: no podrá volver a entrar. Si está jugando, se le cierra el juego.', { i: e.instanceName }), ok: t('Sancionar'), danger: true, ico: 'ban' }))) return;
          if (a === 'kick' && !(await confirmBox({ title: t('¿Expulsar a {n}?', { n: e.player }), text: t('Se le cierra el juego en unos segundos. Podrá volver a entrar.'), ok: t('Expulsar'), danger: true, ico: 'logout' }))) return;
          busy(b, true);
          try {
            await sapi('POST', `/guard/${encodeURIComponent(id)}`, { action: a });
            changed = true;
            toast({ reviewed: t('Marcada como revisada'), dismissed: t('Descartada'), sanction: t('{n} sancionado', { n: e.player }), kick: t('{n} expulsado', { n: e.player }) }[a]);
            await render();
          } catch (err) { fail(err); busy(b, false); }
        });
      };
      render().catch(err => { fail(err); done(); });
    });
    const obs = new MutationObserver(() => { if (!document.querySelector('.g-drawer')) { obs.disconnect(); if (changed) onChange(); } });
    obs.observe(document.body, { childList: true });
    return close;
  }
})();
