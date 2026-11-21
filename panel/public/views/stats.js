// Estadísticas del studio: jugadores, horas, nuevos y los que vuelven (comparado con el periodo anterior),
// jugadores cada día, a qué horas juega la gente (mapa de calor), instancias y los que más juegan.
(function () {
  const V = window.Views;
  const RANGES = [7, 30, 90];
  const head = (name) => `<span class="g-head"><span>${initials(name)}</span><img src="https://mc-heads.net/avatar/${encodeURIComponent(name)}/28" alt="" loading="lazy" onerror="this.remove()"></span>`;
  const num = (v) => Number(v || 0).toLocaleString(I18N.locale(), { maximumFractionDigits: 1 });
  const hours = (h) => h >= 1 || h === 0 ? t('{n} h', { n: num(h) }) : t('{n} min', { n: Math.round(h * 60) });
  // Lunes primero; nombres en el idioma del panel
  const WD = [1, 2, 3, 4, 5, 6, 0];
  const dayName = (wd, style = 'long') => new Date(Date.UTC(2026, 10, 15 + wd)).toLocaleDateString(I18N.locale(), { weekday: style, timeZone: 'UTC' }); // 15/11/2026 fue domingo
  const hh = (h) => `${String(h).padStart(2, '0')}:00`;

  function delta(cur, prev, suffix = '') {
    if (!prev && !cur) return `<span class="st-delta mute">${t('Sin datos antes')}</span>`;
    if (!prev) return `<span class="st-delta up">▲ ${t('Nuevo')}</span>`;
    const p = Math.round((cur - prev) / prev * 100);
    if (p === 0) return `<span class="st-delta mute">= ${t('Igual que antes')}</span>`;
    return `<span class="st-delta ${p > 0 ? 'up' : 'down'}">${p > 0 ? '▲' : '▼'} ${Math.abs(p)}%${suffix}</span>`;
  }

  // Barras de jugadores por día (una serie: sin leyenda, el título la nombra). Tooltip al pasar el ratón.
  function bars(daily) {
    const W = 760, Hh = 200, L = 34, R = 8, T = 10, B = 26;
    const max = Math.max(1, ...daily.map(d => d.players));
    // pasos «redondos» (1, 2, 5, 10, 20, 50…) para el eje
    const raw = max / 4, mag = Math.pow(10, Math.floor(Math.log10(Math.max(1, raw))));
    const step = Math.max(1, [1, 2, 5, 10].map(k => k * mag).find(s => s >= raw) || 10 * mag);
    const top = step * Math.ceil(max / step);
    const n = daily.length, cw = (W - L - R) / n, bw = Math.max(2, Math.min(28, cw - 2));
    const y = (v) => T + (Hh - T - B) * (1 - v / top);
    const ticks = []; for (let v = 0; v <= top; v += step) ticks.push(v);
    const every = n <= 7 ? 1 : n <= 31 ? 5 : 14;
    const fmt = (ts, o) => new Date(ts).toLocaleDateString(I18N.locale(), o);
    return `<svg class="st-bars" viewBox="0 0 ${W} ${Hh}" role="img" aria-label="${esc(t('Jugadores cada día'))}">
      ${ticks.map(v => `<line x1="${L}" x2="${W - R}" y1="${y(v)}" y2="${y(v)}" class="st-grid"/><text x="${L - 8}" y="${y(v) + 4}" class="st-ax" text-anchor="end">${v}</text>`).join('')}
      ${daily.map((d, i) => {
        const x = L + i * cw + (cw - bw) / 2, h = Math.max(0, y(0) - y(d.players));
        const tip = `${fmt(d.day, { weekday: 'long', day: 'numeric', month: 'long' })}|${t('{n} jugadores', { n: d.players })}|${t('{n} nuevos', { n: d.fresh })} · ${hours(d.hours)}`;
        return `<g class="st-col" data-tip="${esc(tip)}"><rect x="${L + i * cw}" y="${T}" width="${cw}" height="${Hh - T - B}" class="st-hit"/>
          ${d.players ? `<path d="M${x},${y(0)} v${-(h - Math.min(4, h))} q0,-${Math.min(4, h)} ${Math.min(4, bw / 2)},-${Math.min(4, h)} h${bw - 2 * Math.min(4, bw / 2)} q${Math.min(4, bw / 2)},0 ${Math.min(4, bw / 2)},${Math.min(4, h)} v${h - Math.min(4, h)} z" class="st-bar"/>` : ''}
          ${i % every === (n - 1) % every ? `<text x="${L + i * cw + cw / 2}" y="${Hh - 8}" class="st-ax" text-anchor="middle">${fmt(d.day, { day: 'numeric', month: 'short' })}</text>` : ''}</g>`;
      }).join('')}
    </svg>`;
  }

  // Mapa de calor: un solo color, más intenso = más gente a la vez de media
  function heatmap(heat) {
    const max = Math.max(0, ...heat.flat());
    return `<div class="st-heat" role="table" aria-label="${esc(t('Cuándo juega la gente'))}">
      <span></span>${Array.from({ length: 24 }, (_, h) => `<span class="st-hh">${h % 3 === 0 ? h : ''}</span>`).join('')}
      ${WD.map(wd => `<span class="st-wd">${esc(dayName(wd, 'short'))}</span>${heat[wd].map((v, h) => {
        const a = max ? v / max : 0;
        return `<span class="st-cell" style="--a:${a ? (0.12 + a * 0.88).toFixed(2) : 0}" data-tip="${esc(`${dayName(wd)} · ${hh(h)}–${hh((h + 1) % 24)}|${t('{n} a la vez de media', { n: num(v) })}`)}"></span>`;
      }).join('')}`).join('')}
    </div>
    <div class="st-scale"><span>${t('Menos')}</span><i style="--a:.12"></i><i style="--a:.4"></i><i style="--a:.7"></i><i style="--a:1"></i><span>${t('Más')}</span></div>`;
  }

  V.stats = async (view) => {
    const f = { days: 30, instance: '' };
    let asTable = false;
    const tz = new Date().getTimezoneOffset();

    async function load() {
      const p = new URLSearchParams({ days: f.days, tz });
      if (f.instance) p.set('instance', f.instance);
      draw(await sapi('GET', `/stats?${p}`));
    }

    function draw(r) {
      const any = r.now.plays || r.now.players;
      const card = (ic, k, v, d, s) => html`<div class="card stat st-kpi"><span class="k"><i>${icon(ic)}</i>${k}</span><span class="v">${v}</span>${d}${s ? `<small>${s}</small>` : ''}</div>`;
      view.innerHTML = html`<div class="page st-page">
        <div class="page-head"><div><h1>${t('Estadísticas')}</h1><p>${t('Cuánta gente juega en tus instancias, cuándo y cuánto tiempo.')}</p></div><span class="grow"></span>
          <div class="st-ctrl"><select class="input g-sel" id="st-inst"><option value="">${t('Todas las instancias')}</option>${r.list.map(i => `<option value="${esc(i.id)}" ${f.instance === i.id ? 'selected' : ''}>${esc(i.name)}</option>`).join('')}</select>
          <div class="seg">${RANGES.map(d => `<button class="${f.days === d ? 'on' : ''}" data-days="${d}">${t('{n} días', { n: d })}</button>`).join('')}</div></div></div>
        <div class="st-kpis">
          ${card('users', t('Jugadores'), num(r.now.players), delta(r.now.players, r.prev.players), t('distintos'))}
          ${card('clock', t('Horas jugadas'), num(r.now.hours), delta(r.now.hours, r.prev.hours), t('{n} partidas · {m} min de media', { n: num(r.now.plays), m: r.now.avgMin }))}
          ${card('sparkles', t('Jugadores nuevos'), num(r.now.fresh), delta(r.now.fresh, r.prev.fresh), t('su primera partida'))}
          ${card('refresh', t('Vuelven'), r.returning == null ? '—' : `${r.returning}%`, '', r.returning == null ? t('Sin datos del periodo anterior') : t('{a} de {b} del periodo anterior', { a: r.back, b: r.prevPlayers }))}
        </div>
        <p class="help st-vs">${t('Las flechas comparan con los {n} días anteriores.', { n: f.days })}</p>
        ${any ? html`
        <div class="card"><div class="card-head"><h3>${icon('chart')}${t('Jugadores cada día')}</h3><span class="grow"></span>
            <button class="btn ghost sm" id="st-table">${icon(asTable ? 'chart' : 'list')}${asTable ? t('Ver gráfica') : t('Ver como tabla')}</button></div>
          ${asTable ? html`<div class="g-table"><table class="table"><thead><tr><th>${t('Día')}</th><th>${t('Jugadores')}</th><th>${t('Nuevos')}</th><th>${t('Horas')}</th></tr></thead><tbody>
              ${r.daily.slice().reverse().map(d => `<tr><td>${esc(fmtDate(d.day, { weekday: 'short', day: 'numeric', month: 'short' }))}</td><td>${d.players}</td><td>${d.fresh}</td><td>${num(d.hours)}</td></tr>`).join('')}</tbody></table></div>`
            : bars(r.daily)}</div>
        <div class="grid g2 st-row">
          <div class="card"><div class="card-head"><h3>${icon('calendar')}${t('Cuándo juega la gente')}</h3></div>
            ${r.best ? `<p class="st-best">${icon('star')}<span>${t('La hora con más gente: <b>{d} a las {h}</b> ({n} a la vez de media). Buen momento para un evento.', { d: esc(dayName(r.best.wd)), h: hh(r.best.h), n: num(r.best.v) })}</span></p>` : ''}
            ${heatmap(r.heat)}</div>
          <div class="card"><div class="card-head"><h3>${icon('grid')}${f.instance ? t('Esta instancia') : t('Instancias')}</h3></div>
            ${r.instances.length ? (() => { const mx = Math.max(...r.instances.map(i => i.hours), 0.1); return r.instances.slice(0, 8).map(i => html`<div class="st-inst">
                <div class="st-inst-t"><b>${esc(i.name)}</b><span>${hours(i.hours)}</span></div>
                <div class="st-track"><i style="width:${Math.max(2, i.hours / mx * 100).toFixed(1)}%"></i></div>
                <small>${t('{p} jugadores · {n} partidas', { p: i.players, n: i.plays })}</small></div>`).join(''); })() : `<p class="help">${t('Sin partidas en este periodo.')}</p>`}</div>
        </div>
        <div class="card"><div class="card-head"><h3>${icon('star')}${t('Los que más juegan')}</h3><span class="grow"></span><small style="color:var(--muted)">${t('Últimos {n} días', { n: f.days })}</small></div>
          <div class="g-table"><table class="table"><thead><tr><th>#</th><th>${t('Jugador')}</th><th>${t('Horas')}</th><th>${t('Días')}</th><th>${t('Partidas')}</th><th>${t('Última vez')}</th></tr></thead><tbody>
          ${r.top.map((p, i) => html`<tr><td class="st-rank ${i < 3 ? 'r' + (i + 1) : ''}">${i + 1}</td><td><span class="g-player">${head(p.name)}<b>${esc(p.name)}</b></span></td>
            <td><b>${hours(p.hours)}</b></td><td>${p.days}</td><td>${p.plays}</td><td class="nowrap" title="${esc(fmtDateTime(p.last))}">${timeAgo(p.last)}</td></tr>`).join('')}</tbody></table></div></div>`
        : html`<div class="card empty"><div class="ic">${icon('chart')}</div><h4>${t('Todavía no hay partidas en este periodo')}</h4><p>${t('Cuando la gente juegue a tus instancias desde Kopi Client, aquí verás cuántos, cuándo y cuánto tiempo.')}</p></div>`}
      </div>`;
      $$('[data-days]', view).forEach(b => b.onclick = () => { f.days = Number(b.dataset.days); load().catch(fail); });
      $('#st-inst', view).onchange = (e) => { f.instance = e.target.value; load().catch(fail); };
      const tb = $('#st-table', view); if (tb) tb.onclick = () => { asTable = !asTable; draw(r); };
      tips(view);
    }

    view.innerHTML = `<div class="page"><div class="skel" style="height:70px;margin-bottom:16px"></div><div class="st-kpis">${'<div class="skel" style="height:118px"></div>'.repeat(4)}</div><div class="skel" style="height:260px;margin-top:16px"></div></div>`;
    await load();
  };

  // Un único tooltip que sigue al ratón por las barras y las celdas (también lo usa Rendimiento)
  window.stTips = (view) => tips(view);
  function tips(view) {
    let tip = $('.st-tip', view);
    if (!tip) { tip = document.createElement('div'); tip.className = 'st-tip'; view.appendChild(tip); }
    const show = (el, e) => {
      const [a, ...rest] = el.dataset.tip.split('|');
      tip.innerHTML = `<b>${esc(a)}</b>${rest.map(x => `<span>${esc(x)}</span>`).join('')}`;
      tip.style.left = `${Math.min(e.clientX + 14, innerWidth - tip.offsetWidth - 10)}px`;
      tip.style.top = `${e.clientY + 14}px`;
      tip.classList.add('on');
    };
    $$('[data-tip]', view).forEach(el => {
      el.addEventListener('mousemove', (e) => { show(el, e); el.classList.add('hover'); });
      el.addEventListener('mouseleave', () => { tip.classList.remove('on'); el.classList.remove('hover'); });
    });
  }
})();
