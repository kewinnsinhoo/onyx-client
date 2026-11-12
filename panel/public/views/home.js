// Inicio: estado del studio en tiempo real.
(function () {
  const V = window.Views;

  function greeting() {
    const h = new Date().getHours();
    return h < 6 ? t('Buenas noches') : h < 12 ? t('Buenos días') : h < 20 ? t('Buenas tardes') : t('Buenas noches');
  }

  // Gráfica de área en SVG (sin librerías)
  window.areaChart = function (points) {
    const W = 640, H = 170, pad = { l: 4, r: 4, t: 14, b: 24 };
    const max = Math.max(4, ...points.map(p => p.peak));
    const x = (i) => pad.l + (i / Math.max(1, points.length - 1)) * (W - pad.l - pad.r);
    const y = (v) => pad.t + (1 - v / max) * (H - pad.t - pad.b);
    const line = points.map((p, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)},${y(p.peak).toFixed(1)}`).join('');
    const area = `${line}L${x(points.length - 1).toFixed(1)},${H - pad.b}L${x(0)},${H - pad.b}Z`;
    const lab = (i) => points[i] ? fmtDate(points[i].day) : '';
    const mid = Math.floor(points.length / 2);
    return `<svg class="chart" viewBox="0 0 ${W} ${H}" preserveAspectRatio="none" role="img" aria-label="${esc(t('Jugadores a la vez por día'))}">
      <defs><linearGradient id="cgrad" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="var(--accent)" stop-opacity=".35"/><stop offset="1" stop-color="var(--accent)" stop-opacity="0"/></linearGradient></defs>
      <line class="grid" x1="0" x2="${W}" y1="${y(max)}" y2="${y(max)}"/><line class="grid" x1="0" x2="${W}" y1="${y(max / 2)}" y2="${y(max / 2)}"/>
      <text x="${W - 4}" y="${y(max) - 4}" text-anchor="end">${max}</text>
      <path class="area" d="${area}"/><path class="line" d="${line}" vector-effect="non-scaling-stroke"/>
      <text x="2" y="${H - 6}">${lab(0)}</text><text x="${x(mid)}" y="${H - 6}" text-anchor="middle">${lab(mid)}</text><text x="${W - 2}" y="${H - 6}" text-anchor="end">${t('Hoy')}</text>
    </svg>`;
  };

  window.instCard = function (i) {
    const d = i.data, l = d.look;
    const st = i.hidden ? `<span class="badge mute">${icon('eyeOff')}${t('Oculta')}</span>` : i.state === 'locked' ? `<span class="badge bad">${icon('lock')}${t('Bloqueada')}</span>` : `<span class="badge ok"><span class="dot"></span>${t('Activa')}</span>`;
    return html`<a class="inst" href="#/instance/${encodeURIComponent(i.id)}">
      <div class="art">${l.background ? `<img src="${esc(l.background)}" alt="" loading="lazy">` : ''}<div class="badges">${st}</div></div>
      <div class="body"><div class="ico">${l.icon ? `<img src="${esc(l.icon)}" alt="">` : initials(d.name)}</div>
        <div style="min-width:0"><h4>${esc(d.name)}</h4><small>${esc(d.minecraft)} · ${loaderName(d.loader)} · ${esc(t(d.category))}</small></div>
        <div class="play">${i.playing}<small>${t('jugando')}</small></div></div></a>`;
  };

  V.home = async (view) => {
    view.innerHTML = `<div class="page"><div class="skel" style="height:60px;margin-bottom:24px"></div><div class="grid g3"><div class="skel" style="height:120px"></div><div class="skel" style="height:120px"></div><div class="skel" style="height:120px"></div></div></div>`;
    const o = await sapi('GET', '/overview');
    const first = String(S.me.user.name).split(' ')[0];
    view.innerHTML = html`<div class="page">
      <div class="page-head"><div><h1>${greeting()}, ${esc(first)}</h1><p>${t('Estado de tu studio en tiempo real.')}</p></div><span class="grow"></span>
        <button class="btn" id="ev">${icon('calendar')}${t('Publicar un evento')}</button>
        ${can('editor') ? `<button class="btn primary" id="new">${icon('plus')}${t('Nueva instancia')}</button>` : ''}</div>
      <div class="grid g3">
        <div class="card stat"><span class="k"><i>${icon('gamepad')}</i>${t('Jugando ahora')}</span><span class="v">${o.playingNow}</span><span class="s">${o.playingNow ? t('{n} conectados', { n: o.playingNow }) : t('Nadie conectado')}</span></div>
        <div class="card stat"><span class="k"><i>${icon('grid')}</i>${t('Instancias')}</span><span class="v">${o.instances}</span><span class="s">${t('{n} activas', { n: o.activeInstances })}</span></div>
        <div class="card stat"><span class="k"><i>${icon('calendar')}</i>${t('Eventos')}</span><span class="v">${o.events}</span><span class="s">${t('{n} próximos', { n: o.events })}</span></div>
      </div>
      <div class="grid g-main" style="margin-top:16px">
        <div>
          <div class="card"><div class="card-head"><h3>${icon('activity')}${t('Jugadores')}</h3><span class="grow"></span><small style="color:var(--muted)">${t('Últimos 30 días')}</small></div>
            <div class="nums"><div><b>${o.peak.peak}</b><small>${o.peak.day ? t('Máximo a la vez · {d}', { d: fmtDate(o.peak.day) }) : t('Máximo a la vez')}</small></div>
              <div><b>${o.plays}</b><small>${t('Partidas')}</small></div><div><b>${o.playersWithAccess}</b><small>${t('Jugadores con acceso')}</small></div></div>
            ${areaChart(o.chart)}</div>
          <div class="card"><div class="card-head"><h3>${icon('grid')}${t('Instancias')}</h3><span class="grow"></span><a class="btn ghost sm" href="#/instances">${t('Todas')}${icon('chevRight')}</a></div>
            ${o.list.length ? o.list.map(i => html`<a class="list-row" href="#/instance/${encodeURIComponent(i.id)}">
                <span class="av">${i.data.look.icon ? `<img src="${esc(i.data.look.icon)}" alt="">` : initials(i.data.name)}</span>
                <span class="grow"><b>${esc(i.data.name)}</b><br><small style="color:var(--muted)">${esc(S.studio.name)} · ${esc(i.data.minecraft)} · ${loaderName(i.data.loader)}</small></span>
                ${i.state === 'locked' ? `<span class="badge bad">${t('Bloqueada')}</span>` : `<span class="badge ok">${t('Activa')}</span>`}
                <b style="min-width:30px;text-align:right">${i.playing}</b></a>`).join('')
              : `<div class="empty"><p>${t('Todavía no hay instancias.')}</p></div>`}
          </div>
        </div>
        <div class="card"><div class="card-head"><h3>${icon('calendar')}${t('Próximos eventos')}</h3><span class="grow"></span><a class="btn ghost sm" href="#/events">${t('Todos')}${icon('chevRight')}</a></div>
          ${o.nextEvents && o.nextEvents.length ? o.nextEvents.map(e => html`<a class="list-row" href="#/events"><span class="av" style="background:color-mix(in srgb, ${esc(e.color)} 20%, transparent);color:${esc(e.color)}">${icon('calendar')}</span>
            <span class="grow"><b>${esc(e.title)}</b><br><small style="color:var(--muted)">${fmtDateTime(e.starts_at)}</small></span></a>`).join('')
            : `<p style="margin:0;color:var(--muted)">${t('No hay eventos próximos.')}</p>`}</div>
      </div></div>`;
    $('#ev').onclick = () => go('/events');
    const n = $('#new'); if (n) n.onclick = () => Views.wizard();
  };
})();
