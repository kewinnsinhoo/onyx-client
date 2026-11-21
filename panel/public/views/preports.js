// Reportes de jugadores (#/reports): lo que los jugadores denuncian desde el launcher, con su captura.
// El staff lo revisa, lo descarta o toma medidas (y puede banear al momento o ir a la ficha del jugador).
(function () {
  const V = window.Views;
  const head = (name) => `<span class="pl-head" style="--s:36px"><span>${initials(name)}</span><img src="https://mc-heads.net/avatar/${encodeURIComponent(name)}/72" alt="" loading="lazy" onerror="this.remove()"></span>`;
  const REASON = { cheats: ['zap', 'Trampas'], abuse: ['alert', 'Insultos o acoso'], grief: ['trash', 'Romper construcciones'], exploit: ['puzzle', 'Aprovechar fallos'], other: ['more', 'Otro motivo'] };
  const ST = { new: ['accent', 'Nuevo'], reviewed: ['ok', 'Revisado'], dismissed: ['mute', 'Descartado'], actioned: ['danger', 'Con medidas'] };
  const TABS = [['new', 'Nuevos'], ['reviewed', 'Revisados'], ['actioned', 'Con medidas'], ['dismissed', 'Descartados'], ['all', 'Todos']];

  V.reports = async (view, route) => {
    let status = (route && route.query.get('status')) || 'new', data = null;
    const shotUrl = (id) => `/api/s/${encodeURIComponent(S.studio.id)}/reports/${encodeURIComponent(id)}/shot`;
    view.innerHTML = `<div class="page"><div class="skel" style="height:420px"></div></div>`;
    const load = async () => { data = await sapi('GET', `/reports?status=${status}`); draw(); };

    function draw() {
      const c = data.counts, all = Object.values(c).reduce((a, b) => a + b, 0);
      view.innerHTML = html`<div class="page rp-page">
        <div class="page-head"><div><h1>${t('Reportes de jugadores')}</h1><p>${t('Lo que denuncian los jugadores desde el launcher mientras juegan a vuestras instancias.')}</p></div></div>
        <div class="seg rp-tabs">${TABS.map(([k, l]) => `<button class="${status === k ? 'on' : ''}" data-st="${k}">${esc(t(l))}<span class="n">${k === 'all' ? all : c[k] || 0}</span></button>`).join('')}</div>
        ${data.reports.length ? `<div class="rp-list">${data.reports.map(card).join('')}</div>`
          : html`<div class="card empty"><div class="ic">${icon('flag')}</div><h4>${status === 'new' ? t('No hay reportes nuevos') : t('Nada por aquí')}</h4>
            <p>${t('Los jugadores denuncian desde el launcher: en la instancia, botón ⋯ → Denunciar a un jugador.')}</p></div>`}
      </div>`;
      $$('[data-st]', view).forEach(b => { b.onclick = () => { status = b.dataset.st; load().catch(fail); }; });
      $$('[data-big]', view).forEach(a => { a.onclick = (e) => { e.preventDefault(); bigShot(a.dataset.big); }; });
      $$('[data-act]', view).forEach(b => { b.onclick = () => act(b, data.reports.find(r => r.id === b.dataset.id), b.dataset.act); });
    }

    function card(r) {
      const [ic, label] = REASON[r.reason] || REASON.other;
      return html`<div class="card rp-card ${r.status}">
        ${r.shot ? `<a class="rp-shot" href="#" data-big="${esc(r.id)}" title="${esc(t('Abrir en grande'))}"><img src="${shotUrl(r.id)}" alt="" loading="lazy"><span>${icon('maximize')}</span></a>`
          : `<div class="rp-shot none">${icon('image')}<small>${t('Sin captura')}</small></div>`}
        <div class="rp-body">
          <div class="rp-top">${head(r.target)}<div class="rp-who"><a href="#/players/${encodeURIComponent(r.target)}"><b>${esc(r.target)}</b></a>
              <small>${esc(t('Denunciado por {n}', { n: r.reporter }))} · ${esc(r.instance)} · ${esc(timeAgo(r.at))}</small></div>
            <span class="grow"></span><span class="badge ${ST[r.status][0]}">${esc(t(ST[r.status][1]))}</span></div>
          <div class="rp-reason">${icon(ic)}<b>${esc(t(label))}</b>${r.times > 1 ? `<span class="rp-rep">${icon('alert')}${esc(t('Denunciado {n} veces por {m} jugadores', { n: r.times, m: r.reporters }))}</span>` : ''}</div>
          ${r.text ? `<p class="rp-text">${esc(r.text)}</p>` : `<p class="rp-text muted">${t('Sin explicación.')}</p>`}
          ${r.note ? `<p class="rp-note">${icon('edit')}<span>${esc(r.note)}</span></p>` : ''}
          ${can('editor') ? html`<div class="rp-acts">
            ${r.status !== 'reviewed' ? `<button class="btn sm" data-act="reviewed" data-id="${esc(r.id)}">${icon('check')}${t('Revisado')}</button>` : ''}
            ${r.status !== 'dismissed' ? `<button class="btn sm ghost" data-act="dismissed" data-id="${esc(r.id)}">${icon('x')}${t('Descartar')}</button>` : ''}
            ${r.status !== 'actioned' ? `<button class="btn sm" data-act="actioned" data-id="${esc(r.id)}">${icon('flag')}${t('Tomar medidas')}</button>` : ''}
            ${can('admin') ? `<button class="btn sm danger" data-act="ban" data-id="${esc(r.id)}">${icon('ban')}${t('Banear del studio')}</button>` : ''}
            <span class="grow"></span><a class="btn sm ghost" href="#/players/${encodeURIComponent(r.target)}">${icon('users')}${t('Ver ficha')}</a></div>` : ''}
        </div></div>`;
    }

    async function act(btn, r, what) {
      if (what === 'ban') {
        if (!(await confirmBox({ title: t('¿Banear a {n} del studio?', { n: r.target }), text: t('No podrá jugar a ninguna de vuestras instancias hasta que le quites el baneo.'), ok: t('Banear'), danger: true }))) return;
        busy(btn, true);
        try {
          await sapi('POST', '/bans', { kind: 'name', value: r.target });
          await sapi('PATCH', `/reports/${r.id}`, { status: 'actioned', note: r.note || t('Baneado del studio') });
          toast(t('{n} baneado del studio', { n: r.target })); load();
        } catch (e) { busy(btn, false); fail(e); }
        return;
      }
      if (what === 'actioned') {
        // ¿qué se hizo? (se queda apuntado para el resto del staff)
        modal((m, close) => {
          m.innerHTML = html`<div class="mh"><h3>${icon('flag')}${t('Tomar medidas')}</h3><button class="btn ghost icon sm" data-x>${icon('x')}</button></div>
            <div class="mb"><label class="field"><span class="label">${t('¿Qué habéis hecho? (lo ve el resto del staff)')}</span>
              <input class="input" id="rn" maxlength="300" placeholder="${t('Ej.: avisado por el chat, expulsado 1 día…')}" value="${esc(r.note || '')}"></label></div>
            <div class="mf"><button class="btn" data-x>${t('Cancelar')}</button><button class="btn primary" id="rok">${icon('check')}${t('Guardar')}</button></div>`;
          $$('[data-x]', m).forEach(x => { x.onclick = close; });
          setTimeout(() => $('#rn', m).focus(), 30);
          $('#rn', m).onkeydown = (e) => { if (e.key === 'Enter') $('#rok', m).click(); };
          $('#rok', m).onclick = async (e) => {
            busy(e.currentTarget, true);
            try { await sapi('PATCH', `/reports/${r.id}`, { status: 'actioned', note: $('#rn', m).value }); close(); toast(t('Guardado')); load(); } catch (err) { busy(e.currentTarget, false); fail(err); }
          };
        });
        return;
      }
      busy(btn, true);
      try { await sapi('PATCH', `/reports/${r.id}`, { status: what }); toast(what === 'dismissed' ? t('Descartado') : t('Marcado como revisado')); load(); } catch (e) { busy(btn, false); fail(e); }
    }

    function bigShot(id) {
      modal((m, close) => {
        m.classList.add('rp-lightbox');
        m.innerHTML = `<button class="btn ghost icon sm rp-x" data-x>${icon('x')}</button><img src="${shotUrl(id)}" alt="">`;
        $('[data-x]', m).onclick = close;
      }, { wide: true });
    }

    try { await load(); } catch (e) { view.innerHTML = `<div class="page"><div class="card empty"><h4>${esc(e.message)}</h4></div></div>`; }
  };
})();
