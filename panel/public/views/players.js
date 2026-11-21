// Jugadores del studio: buscador y ficha de cada jugador (#/players y #/players/<nombre>).
// En la ficha está todo junto: horas, sesiones, instancias, actividad de 30 días, insignias,
// detecciones de KopiGuard, baneos y directos. Solo con lo que ha pasado en las instancias de este studio.
(function () {
  const V = window.Views;
  const H = 36e5;
  const head = (name, size = 32) => `<span class="pl-head" style="--s:${size}px"><span>${initials(name)}</span><img src="https://mc-heads.net/avatar/${encodeURIComponent(name)}/${size * 2}" alt="" loading="lazy" onerror="this.remove()"></span>`;
  const ST = { new: ['accent', 'Nuevo'], reviewed: ['ok', 'Revisado'], dismissed: ['mute', 'Descartado'], sanctioned: ['danger', 'Sancionado'] };
  const SEV = { high: '#ff5470', medium: '#ffb547', low: '#8b93a7' };
  const TYPE = { mod: 'Mod', pack: 'Paquete', file: 'Archivo', program: 'Programa', move: 'Movimiento', combat: 'Combate' };
  const PLAT = { twitch: 'Twitch', tiktok: 'TikTok', kick: 'Kick' };
  const fmtH = (h) => h >= 100 ? Math.round(h).toLocaleString(I18N.locale()) : h.toLocaleString(I18N.locale(), { maximumFractionDigits: 1 });
  const dateShort = (ms) => ms ? new Date(ms).toLocaleDateString(I18N.locale(), { day: 'numeric', month: 'short', year: 'numeric' }) : '—';

  V.players = async (view, r) => {
    const name = r.parts[1] ? decodeURIComponent(r.parts[1]) : '';
    return name ? ficha(view, name) : list(view, r);
  };

  // ------------------------------------------------ lista y buscador
  async function list(view, r) {
    let q = r.query.get('q') || '', data = null, timer = 0;
    view.innerHTML = `<div class="page"><div class="skel" style="height:420px"></div></div>`;
    const load = async () => {
      data = await sapi('GET', `/players${q ? '?q=' + encodeURIComponent(q) : ''}`);
      paint();
    };
    function paint() {
      const box = $('#pl-list', view);
      const rows = data.players;
      const body = rows.length ? html`<div class="pl-rows">${rows.map(p => html`<a class="pl-row" href="#/players/${encodeURIComponent(p.name)}">
          ${head(p.name)}<div class="pl-n"><b>${esc(p.name)}</b>${p.online ? `<span class="pl-on"><i></i>${t('Jugando ahora')}</span>` : `<small>${esc(timeAgo(p.last))}</small>`}</div>
          <span class="pl-c"><b>${fmtH(p.hours)} h</b><small>${t('jugadas')}</small></span>
          <span class="pl-c"><b>${p.sessions}</b><small>${p.sessions === 1 ? t('sesión') : t('sesiones')}</small></span>
          <span class="pl-c"><b>${p.instances}</b><small>${p.instances === 1 ? t('instancia') : t('instancias')}</small></span>
          <span class="pl-go">${icon('chevRight')}</span></a>`).join('')}</div>`
        : `<div class="empty"><div class="ic">${icon('users')}</div><h4>${q ? t('Nadie se llama así') : t('Todavía no ha jugado nadie')}</h4><p>${q ? t('Prueba con otro nombre.') : t('Cuando alguien juegue a vuestras instancias, saldrá aquí.')}</p></div>`;
      if (box) { box.innerHTML = body; $('#pl-total', view).textContent = t('{n} jugadores', { n: data.total.toLocaleString(I18N.locale()) }); return; }
      view.innerHTML = html`<div class="page pl-page">
        <div class="page-head"><div><h1>${t('Jugadores')}</h1><p>${t('Busca a cualquiera que haya jugado a vuestras instancias y mira su ficha.')}</p></div></div>
        <div class="card pl-card">
          <div class="pl-top"><label class="pl-search">${icon('search')}<input class="input" id="pl-q" placeholder="${t('Nombre de Minecraft…')}" value="${esc(q)}" autocomplete="off" spellcheck="false"></label>
            <span class="muted" id="pl-total">${t('{n} jugadores', { n: data.total.toLocaleString(I18N.locale()) })}</span></div>
          <div id="pl-list">${body}</div>
        </div></div>`;
      const inp = $('#pl-q', view);
      inp.focus(); inp.setSelectionRange(inp.value.length, inp.value.length);
      inp.oninput = () => { clearTimeout(timer); timer = setTimeout(() => { q = inp.value.trim(); load().catch(fail); }, 250); };
      inp.onkeydown = (e) => { if (e.key === 'Enter' && /^[A-Za-z0-9_]{2,16}$/.test(inp.value.trim())) go('/players/' + encodeURIComponent(inp.value.trim())); };
    }
    try { await load(); } catch (e) { view.innerHTML = `<div class="page"><div class="card empty"><h4>${esc(e.message)}</h4></div></div>`; }
    return () => clearTimeout(timer);
  }

  // ------------------------------------------------ ficha
  async function ficha(view, name) {
    view.innerHTML = `<div class="page"><div class="skel" style="height:220px;margin-bottom:16px"></div><div class="skel" style="height:320px"></div></div>`;
    let f;
    try { f = await sapi('GET', `/players/${encodeURIComponent(name)}`); }
    catch (e) {
      view.innerHTML = html`<div class="page"><a class="back" href="#/players">${icon('chevLeft')}${t('Jugadores')}</a>
        <div class="card empty"><div class="ic">${icon('users')}</div><h4>${esc(t(e.message))}</h4><p>${esc(name)}</p></div></div>`;
      return;
    }
    const studioBan = f.bans.find(b => b.scope === 'studio');
    function draw() {
      const maxH = Math.max(1, ...f.days.map(d => d.hours));
      const live = f.channels.find(c => c.live);
      const g = f.guard;
      view.innerHTML = html`<div class="page pl-page">
        <a class="back" href="#/players">${icon('chevLeft')}${t('Jugadores')}</a>
        <div class="card pl-hero">
          ${head(f.name, 76)}
          <div class="pl-who">
            <h1>${esc(f.name)}</h1>
            <div class="pl-chips">
              ${f.online ? `<span class="chip on"><i></i>${esc(t('Jugando ahora en {i}', { i: f.online.instance }))}</span>` : `<span class="chip">${icon('clock')}${esc(f.stats.last ? t('Última vez: {t}', { t: timeAgo(f.stats.last) }) : t('Sin partidas'))}</span>`}
              ${f.bans.length ? `<span class="chip ban">${icon('ban')}${esc(studioBan ? t('Baneado del studio') : t('Baneado en {i}', { i: f.bans.map(b => b.instance).join(', ') }))}</span>` : ''}
              ${f.staff.length ? `<span class="chip staff">${icon('shield')}${esc(t('Staff de {i}', { i: f.staff.join(', ') }))}</span>` : ''}
              ${live ? `<a class="chip live" href="${esc(live.url)}" target="_blank" rel="noopener"><i></i>${esc(t('En directo en {p}', { p: PLAT[live.platform] }))}</a>` : ''}
              ${f.referral ? `<span class="chip ref">${icon('heart')}${t('Llegó a Kopi por vuestro studio')}</span>` : ''}
            </div>
            <div class="pl-groups">${f.groups.map(g => `<span class="gr-chip" style="--gc:${esc(g.color)}"><i></i>${esc(g.name)}${can('editor') ? `<button data-ungr="${esc(g.id)}" title="${t('Sacar del grupo')}">${icon('x')}</button>` : ''}</span>`).join('')}
              ${can('editor') ? `<button class="gr-chip add" id="pl-addgr">${icon('plus')}${t('Añadir a un grupo')}</button>` : ''}</div>
          </div>
          <span class="grow"></span>
          <div class="pl-acts">
            <a class="btn" href="#/guard?q=${encodeURIComponent(f.name)}">${icon('shield')}${t('Ver en KopiGuard')}</a>
            ${can('admin') ? `<button class="btn ${studioBan ? '' : 'danger'}" id="pl-ban">${icon('ban')}${studioBan ? t('Quitar baneo') : t('Banear del studio')}</button>` : ''}
          </div>
        </div>

        <div class="pl-stats">
          ${[['clock', t('Horas jugadas'), `${fmtH(f.stats.hours)} h`], ['gamepad', t('Sesiones'), f.stats.sessions.toLocaleString(I18N.locale())],
            ['activity', t('Media por sesión'), f.stats.avgMin >= 60 ? `${Math.floor(f.stats.avgMin / 60)} h ${f.stats.avgMin % 60} min` : `${f.stats.avgMin} min`],
            ['calendar', t('Primera vez'), dateShort(f.stats.first)], ['logout', t('Expulsiones'), f.stats.kicks]]
            .map(([ic, k, v]) => `<div class="card pl-stat"><span class="k">${icon(ic)}${esc(k)}</span><b>${esc(String(v))}</b></div>`).join('')}
        </div>

        <div class="pl-grid">
          <div class="card">
            <div class="card-head"><div><h3>${icon('activity')}${t('Actividad')}</h3><p class="sub">${t('Horas jugadas cada día, últimos 30 días')}</p></div></div>
            <div class="pl-chart" role="img" aria-label="${esc(t('Horas jugadas cada día, últimos 30 días'))}">
              <span class="pl-max">${fmtH(maxH)} h</span>
              <div class="pl-bars">${f.days.map(d => `<div class="pl-bar ${d.hours ? '' : 'zero'}" data-tip="${esc(new Date(d.day).toLocaleDateString(I18N.locale(), { weekday: 'short', day: 'numeric', month: 'short' }))}: ${esc(fmtH(d.hours))} h"><i style="height:${d.hours ? Math.max(4, d.hours / maxH * 100) : 0}%"></i></div>`).join('')}</div>
              <div class="pl-axis"><span>${esc(dateShort(f.days[0].day))}</span><span>${t('Hoy')}</span></div>
              <div class="pl-tip" id="pl-tip" hidden></div>
            </div>
          </div>
          <div class="card">
            <div class="card-head"><div><h3>${icon('grid')}${t('Instancias')}</h3><p class="sub">${t('Dónde ha jugado y cuánto')}</p></div></div>
            ${f.instances.length ? `<div class="pl-insts">${f.instances.map(i => {
              const pct = f.stats.hours ? Math.round(i.hours / f.stats.hours * 100) : 0;
              return html`<a class="pl-inst" href="#/instance/${encodeURIComponent(i.id)}"><div class="pl-it"><b>${esc(i.name)}</b><span>${fmtH(i.hours)} h · ${i.sessions === 1 ? t('1 sesión') : t('{n} sesiones', { n: i.sessions })}</span></div>
                <div class="pl-ib"><i style="width:${pct}%"></i></div><small>${esc(t('Última vez: {t}', { t: timeAgo(i.last) }))}</small></a>`;
            }).join('')}</div>` : `<p class="help">${t('Sin partidas.')}</p>`}
          </div>
        </div>

        <div class="card">
          <div class="card-head"><div><h3>${icon('shield')}KopiGuard</h3><p class="sub">${g.total === 1 ? t('1 detección en vuestras instancias') : g.total ? t('{n} detecciones en vuestras instancias', { n: g.total }) : t('Ninguna detección: juega limpio.')}</p></div>
            <span class="grow"></span>${g.total ? `<a class="btn sm" href="#/guard?q=${encodeURIComponent(f.name)}">${t('Ver todas')}${icon('chevRight')}</a>` : ''}</div>
          ${g.total ? html`<div class="pl-gst">${Object.entries(ST).map(([k, [cls, l]]) => `<span class="badge ${cls}">${esc(t(l))} · ${g.byStatus[k] || 0}</span>`).join('')}${g.high ? `<span class="badge danger">${icon('alert')}${esc(g.high === 1 ? t('1 grave') : t('{n} graves', { n: g.high }))}</span>` : ''}</div>
            <div class="pl-glist">${g.recent.map(e => html`<div class="pl-g"><i class="sev" style="background:${SEV[e.severity] || SEV.low}"></i>
              <div class="grow"><b>${esc(e.detail)}</b><small>${esc(t(TYPE[e.type] || e.type))} · ${esc(e.instance)} · ${esc(fmtDateTime(e.at))}${e.kicked ? ' · ' + esc(t('Expulsado')) : ''}</small></div>
              <span class="badge ${ST[e.status] ? ST[e.status][0] : 'mute'}">${esc(t(ST[e.status] ? ST[e.status][1] : e.status))}</span></div>`).join('')}</div>`
            : `<div class="pl-clean">${icon('check')}<span>${t('Ninguna detección: juega limpio.')}</span></div>`}
        </div>

        <div class="pl-grid">
          <div class="card">
            <div class="card-head"><div><h3>${icon('badge')}${t('Insignias')}</h3><p class="sub">${t('{n} conseguidas', { n: f.badges.length })}</p></div></div>
            ${f.badges.length ? `<div class="pl-badges">${f.badges.map(b => `<div class="pl-b" title="${esc(b.custom || b.cat === 'event' ? b.desc : t(b.desc))}">${Badge.medal(b, 46)}<small>${esc(b.custom || b.cat === 'event' ? b.name : t(b.name))}</small></div>`).join('')}</div>` : `<p class="help">${t('Todavía no tiene insignias.')}</p>`}
          </div>
          <div class="card">
            <div class="card-head"><div><h3>${icon('video')}${t('Directos')}</h3><p class="sub">${t('Sus canales (los pone él en el launcher)')}</p></div></div>
            ${f.channels.length ? `<div class="pl-chans">${f.channels.map(c => `<a class="pl-chan ${c.live ? 'live' : ''}" href="${esc(c.url)}" target="_blank" rel="noopener"><span class="plat-dot ${c.platform}"></span><b>${PLAT[c.platform]}</b><span>${esc(c.handle)}</span>${c.live ? `<span class="badge live-b"><span class="dot"></span>${t('EN DIRECTO')}</span>` : ''}</a>`).join('')}</div>` : `<p class="help">${t('No ha puesto ningún canal.')}</p>`}
          </div>
        </div>
      </div>`;

      // ayuda al pasar por las barras
      const tip = $('#pl-tip', view), chart = $('.pl-chart', view);
      $$('.pl-bar', view).forEach(b => {
        b.onmouseenter = () => { tip.textContent = b.dataset.tip; tip.hidden = false; const r = b.getBoundingClientRect(), c = chart.getBoundingClientRect(); tip.style.left = (r.left - c.left + r.width / 2) + 'px'; };
        b.onmouseleave = () => { tip.hidden = true; };
      });
      $$('[data-ungr]', view).forEach(b => b.onclick = async () => {
        try { await sapi('DELETE', `/groups/${b.dataset.ungr}/members/${encodeURIComponent(f.name)}`); toast(t('Sacado del grupo')); return ficha(view, f.name); } catch (e) { fail(e); }
      });
      const ag = $('#pl-addgr', view);
      if (ag) ag.onclick = async () => {
        const all = (await sapi('GET', '/groups').catch(() => ({ groups: [] }))).groups.filter(g => !f.groups.some(x => x.id === g.id));
        if (!all.length) return go('/groups');
        dropdown(ag, all.map(g => ({ icon: 'layers', label: g.name, hint: g.members === 1 ? t('1 jugador') : t('{n} jugadores', { n: g.members }),
          run: async () => { try { await sapi('POST', `/groups/${g.id}/members`, { names: [f.name] }); toast(t('Añadido a {g}', { g: g.name })); ficha(view, f.name); } catch (e) { fail(e); } } })));
      };
      const ban = $('#pl-ban', view);
      if (ban) ban.onclick = async () => {
        if (studioBan) {
          busy(ban, true);
          try { await sapi('DELETE', `/bans/${encodeURIComponent(f.key)}?kind=name`); toast(t('Baneo quitado')); return ficha(view, f.name); } catch (e) { busy(ban, false); fail(e); }
          return;
        }
        if (!(await confirmBox({ title: t('¿Banear a {n} del studio?', { n: f.name }), text: t('No podrá jugar a ninguna de vuestras instancias hasta que le quites el baneo.'), ok: t('Banear'), danger: true }))) return;
        busy(ban, true);
        try { await sapi('POST', '/bans', { kind: 'name', value: f.name }); toast(t('{n} baneado del studio', { n: f.name })); return ficha(view, f.name); } catch (e) { busy(ban, false); fail(e); }
      };
    }
    draw();
  }
})();
