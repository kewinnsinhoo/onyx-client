// Uso del launcher (solo el Creador): instalaciones, activos cada día, nuevas, países, sistemas, versiones e idiomas.
// Todo anónimo: cada instalación es un número al azar; no hay IP ni nombres.
(function () {
  const V = window.Views;
  const RANGES = [7, 30, 90];
  const num = (v) => Number(v || 0).toLocaleString(I18N.locale());
  const flag = (c) => /^[A-Z]{2}$/.test(c) ? String.fromCodePoint(...[...c].map(ch => 0x1f1e6 + ch.charCodeAt(0) - 65)) : '🌐';
  const country = (c) => { if (!/^[A-Z]{2}$/.test(c)) return t('Desconocido'); try { return new Intl.DisplayNames([I18N.locale()], { type: 'region' }).of(c); } catch { return c; } };
  const SYS = { win32: ['Windows', 'monitor'], darwin: ['macOS', 'monitor'], linux: ['Linux', 'monitor'], other: [null, 'monitor'] };
  const LANG = { es: 'Español', en: 'English', ca: 'Català', fr: 'Français' };
  const isCreator = () => S.me && S.me.user.role === 'creator';

  // Barras por día (una serie; el título la nombra). Tooltip al pasar el ratón.
  function bars(daily, key, label) {
    const W = 520, H = 190, L = 30, R = 6, T = 10, B = 24;
    const max = Math.max(1, ...daily.map(d => d[key]));
    const raw = max / 4, mag = Math.pow(10, Math.floor(Math.log10(Math.max(1, raw))));
    const step = Math.max(1, [1, 2, 5, 10].map(k => k * mag).find(s => s >= raw) || 10 * mag);
    const top = step * Math.ceil(max / step);
    const n = daily.length, cw = (W - L - R) / n, bw = Math.max(2, Math.min(26, cw - 2));
    const y = (v) => T + (H - T - B) * (1 - v / top);
    const ticks = []; for (let v = 0; v <= top; v += step) ticks.push(v);
    const every = n <= 7 ? 1 : n <= 31 ? 5 : 14;
    const fmt = (ts, o) => new Date(ts).toLocaleDateString(I18N.locale(), o);
    return `<svg class="st-bars" viewBox="0 0 ${W} ${H}" role="img" aria-label="${esc(label)}">
      ${ticks.map(v => `<line x1="${L}" x2="${W - R}" y1="${y(v)}" y2="${y(v)}" class="st-grid"/><text x="${L - 8}" y="${y(v) + 4}" class="st-ax" text-anchor="end">${v}</text>`).join('')}
      ${daily.map((d, i) => {
        const v = d[key], x = L + i * cw + (cw - bw) / 2, h = Math.max(0, y(0) - y(v)), r = Math.min(4, h, bw / 2);
        return `<g class="st-col" data-tip="${esc(`${fmt(d.day, { weekday: 'long', day: 'numeric', month: 'long' })}|${label}: ${num(v)}`)}"><rect x="${L + i * cw}" y="${T}" width="${cw}" height="${H - T - B}" class="st-hit"/>
          ${v ? `<path d="M${x},${y(0)} v${-(h - r)} q0,-${r} ${r},-${r} h${bw - 2 * r} q${r},0 ${r},${r} v${h - r} z" class="st-bar"/>` : ''}
          ${i % every === (n - 1) % every ? `<text x="${L + i * cw + cw / 2}" y="${H - 8}" class="st-ax" text-anchor="middle">${fmt(d.day, { day: 'numeric', month: 'short' })}</text>` : ''}</g>`;
      }).join('')}</svg>`;
  }
  const meter = (rows, total) => rows.map(r => html`<div class="st-inst"><div class="st-inst-t"><b>${r.label}</b><span>${num(r.n)} · ${total ? Math.round(r.n / total * 100) : 0}%</span></div>
    <div class="st-track"><i style="width:${total ? Math.max(1.5, r.n / total * 100).toFixed(1) : 0}%"></i></div></div>`).join('');

  V.usage = async (view) => {
    if (!isCreator()) return V.notFound(view);
    let days = 30;
    async function load() { draw(await api('GET', `/onyx/launcher?days=${days}`)); }
    function draw(o) {
      const sum = (l) => l.reduce((n, r) => n + r.n, 0);
      const latest = o.versions.map(v => v.v).filter(Boolean).sort((a, b) => b.localeCompare(a, undefined, { numeric: true }))[0];
      const deltaNew = o.newPrev ? Math.round((o.newInRange - o.newPrev) / o.newPrev * 100) : null;
      view.innerHTML = html`<div class="page st-page">
        <div class="page-head"><div><h1>${t('Uso del launcher')}</h1><p>${t('Cuánta gente usa el launcher, desde dónde y con qué. Es anónimo: sin IP ni nombres.')}</p></div><span class="grow"></span>
          <div class="seg">${RANGES.map(d => `<button class="${days === d ? 'on' : ''}" data-days="${d}">${t('{n} días', { n: d })}</button>`).join('')}</div></div>
        <div class="st-kpis">
          <div class="card stat st-kpi"><span class="k"><i>${icon('download')}</i>${t('Instalaciones')}</span><span class="v">${num(o.total)}</span>
            <span class="st-delta ${o.newToday ? 'up' : 'mute'}">${o.newToday ? '▲ ' : ''}${t('{n} nuevas hoy', { n: num(o.newToday) })}</span><small>${t('{n} jugadores con cuenta', { n: num(o.accounts) })}</small></div>
          <div class="card stat st-kpi"><span class="k"><i>${icon('activity')}</i>${t('Abiertos hoy')}</span><span class="v">${num(o.activeToday)}</span><small>${t('instalaciones que abrieron el launcher hoy')}</small></div>
          <div class="card stat st-kpi"><span class="k"><i>${icon('users')}</i>${t('Activos 7 días')}</span><span class="v">${num(o.active7)}</span><small>${t('{n} en 30 días', { n: num(o.active30) })}</small></div>
          <div class="card stat st-kpi"><span class="k"><i>${icon('sparkles')}</i>${t('Nuevas en {n} días', { n: days })}</span><span class="v">${num(o.newInRange)}</span>
            ${deltaNew == null ? `<span class="st-delta mute">${t('Sin datos antes')}</span>` : `<span class="st-delta ${deltaNew >= 0 ? 'up' : 'down'}">${deltaNew >= 0 ? '▲' : '▼'} ${Math.abs(deltaNew)}%</span>`}<small>${t('comparado con los {n} días anteriores', { n: days })}</small></div>
        </div>
        <div class="grid g2 st-row">
          <div class="card"><div class="card-head"><h3>${icon('activity')}${t('Abiertos cada día')}</h3></div>${bars(o.daily, 'active', t('Abiertos'))}</div>
          <div class="card"><div class="card-head"><h3>${icon('download')}${t('Instalaciones nuevas cada día')}</h3></div>${bars(o.daily, 'fresh', t('Nuevas'))}</div>
        </div>
        <div class="grid g-main st-row">
          <div class="card"><div class="card-head"><h3>${icon('globe')}${t('Países')}</h3><span class="grow"></span><small style="color:var(--muted)">${t('{n} países', { n: o.countries.filter(c => c.c !== '??').length })}</small></div>
            ${o.countries.length ? html`<div class="g-table"><table class="table"><thead><tr><th>${t('País')}</th><th>${t('Instalaciones')}</th><th></th><th>${t('Activas 30 días')}</th></tr></thead><tbody>
              ${o.countries.map(c => html`<tr><td><span class="us-country"><span class="us-flag">${flag(c.c)}</span>${esc(country(c.c))}</span></td><td><b>${num(c.n)}</b></td>
                <td style="width:38%"><div class="st-track"><i style="width:${Math.max(1.5, c.n / o.countries[0].n * 100).toFixed(1)}%"></i></div></td><td>${num(c.active)}</td></tr>`).join('')}</tbody></table></div>`
              : `<p class="help">${t('Todavía no hay datos.')}</p>`}</div>
          <div>
            <div class="card"><div class="card-head"><h3>${icon('monitor')}${t('Sistemas')}</h3><span class="grow"></span><small style="color:var(--muted)">${t('Activas 30 días')}</small></div>
              ${o.platforms.length ? meter(o.platforms.map(p => ({ label: SYS[p.p] ? (SYS[p.p][0] || t('Otro')) : esc(p.p), n: p.n })), sum(o.platforms)) : `<p class="help">${t('Todavía no hay datos.')}</p>`}</div>
            <div class="card"><div class="card-head"><h3>${icon('tag')}${t('Versiones')}</h3><span class="grow"></span><small style="color:var(--muted)">${t('Activas 7 días')}</small></div>
              ${o.versions.length ? meter(o.versions.map(v => ({ label: `v${esc(v.v || '?')}${v.v === latest ? ` <span class="badge ok">${t('Última')}</span>` : ''}`, n: v.n })), sum(o.versions)) : `<p class="help">${t('Todavía no hay datos.')}</p>`}</div>
            <div class="card"><div class="card-head"><h3>${icon('globe')}${t('Idiomas')}</h3></div>
              ${o.langs.length ? meter(o.langs.map(l => ({ label: esc(LANG[l.l] || l.l), n: l.n })), sum(o.langs)) : `<p class="help">${t('Todavía no hay datos.')}</p>`}</div>
            ${o.brands.length ? html`<div class="card"><div class="card-head"><h3>${icon('rocket')}${t('Launchers de marca')}</h3></div>${meter(o.brands.map(b => ({ label: esc(b.b), n: b.n })), sum(o.brands))}</div>` : ''}
          </div>
        </div>
        <p class="help g-note">${icon('info')}${t('Cada instalación cuenta una vez al día. El país lo da la conexión; la IP no se guarda.')}</p>
      </div>`;
      $$('[data-days]', view).forEach(b => b.onclick = () => { days = Number(b.dataset.days); load().catch(fail); });
      tips(view);
    }
    view.innerHTML = `<div class="page"><div class="skel" style="height:70px;margin-bottom:16px"></div><div class="st-kpis">${'<div class="skel" style="height:118px"></div>'.repeat(4)}</div></div>`;
    await load();
  };

  function tips(view) {
    let tip = $('.st-tip', view);
    if (!tip) { tip = document.createElement('div'); tip.className = 'st-tip'; view.appendChild(tip); }
    $$('[data-tip]', view).forEach(el => {
      el.addEventListener('mousemove', (e) => {
        const [a, ...rest] = el.dataset.tip.split('|');
        tip.innerHTML = `<b>${esc(a)}</b>${rest.map(x => `<span>${esc(x)}</span>`).join('')}`;
        tip.style.left = `${Math.min(e.clientX + 14, innerWidth - tip.offsetWidth - 10)}px`;
        tip.style.top = `${e.clientY + 14}px`;
        tip.classList.add('on'); el.classList.add('hover');
      });
      el.addEventListener('mouseleave', () => { tip.classList.remove('on'); el.classList.remove('hover'); });
    });
  }
})();
