// Calendario público: lee los eventos publicados en el panel de Kopi.
(function () {
  const API = (() => {
    const q = new URLSearchParams(location.search).get('api');
    return q && /^http:\/\/localhost:\d+$/.test(q) ? q : 'https://panel.onyxclient.site';
  })();
  const DAY = 864e5;
  const $ = (s) => document.querySelector(s);
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const okColor = (c) => /^#[0-9a-f]{6}$/i.test(c || '') ? c : '#f58ee0';
  const okUrl = (u) => /^https:\/\//.test(u || '') || /^http:\/\/localhost/.test(u || '') ? u : null;
  const cap = (s) => s.charAt(0).toUpperCase() + s.slice(1);
  const startOfDay = (t) => { const d = new Date(t); d.setHours(0, 0, 0, 0); return d.getTime(); };
  const hora = (t) => new Date(t).toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' });

  const hoy = new Date();
  let y = hoy.getFullYear(), m = hoy.getMonth(), elegido = null;
  const cache = new Map();

  async function cargar(y, m) {
    const k = `${y}-${m}`;
    if (cache.has(k)) return cache.get(k);
    const from = new Date(y, m, 1).getTime() - 7 * DAY, to = new Date(y, m + 1, 1).getTime() + 7 * DAY;
    const p = fetch(`${API}/api/public/events?from=${from}&to=${to}`).then(r => { if (!r.ok) throw new Error(r.status); return r.json(); }).then(j => j.events || []);
    cache.set(k, p);
    p.catch(() => cache.delete(k));
    return p;
  }
  const delDia = (evs, d) => evs.filter(e => startOfDay(e.starts_at) <= d && startOfDay(e.ends_at || e.starts_at) >= d);

  function rejilla(evs) {
    const first = new Date(y, m, 1);
    const offset = (first.getDay() + 6) % 7;
    const dias = Array.from({ length: 42 }, (_, i) => startOfDay(new Date(y, m, 1 - offset + i).getTime()));
    const nombres = ['L', 'M', 'X', 'J', 'V', 'S', 'D'];
    const hoyD = startOfDay(Date.now());
    $('#cal-titulo').textContent = cap(first.toLocaleDateString('es-ES', { month: 'long', year: 'numeric' }));
    $('#cal-rejilla').innerHTML = nombres.map(n => `<span class="cal-dn" aria-hidden="true">${n}</span>`).join('') + dias.map(d => {
      const es = delDia(evs, d);
      const fuera = new Date(d).getMonth() !== m;
      const cls = ['cal-dia', fuera ? 'fuera' : '', d === hoyD ? 'hoy' : '', d === elegido ? 'sel' : '', es.length ? 'con' : ''].filter(Boolean).join(' ');
      const label = new Date(d).toLocaleDateString('es-ES', { weekday: 'long', day: 'numeric', month: 'long' }) + (es.length ? `, ${es.length} evento${es.length > 1 ? 's' : ''}` : '');
      return `<button class="${cls}" data-d="${d}" aria-label="${esc(label)}" ${es.length ? '' : 'tabindex="-1"'}><span>${new Date(d).getDate()}</span>
        <i class="puntos">${es.slice(0, 3).map(e => `<b style="background:${okColor(e.color)}"></b>`).join('')}</i></button>`;
    }).join('');
    document.querySelectorAll('.cal-dia.con').forEach(b => b.onclick = () => { const d = Number(b.dataset.d); elegido = elegido === d ? null : d; pintar(); });
    const cats = new Map();
    for (const e of evs) if (new Date(e.starts_at).getMonth() === m && e.category) cats.set(e.category, okColor(e.color));
    $('#cal-leyenda').innerHTML = [...cats].map(([c, col]) => `<span><b style="background:${col}"></b>${esc(c)}</span>`).join('');
  }

  function evento(e) {
    const ini = new Date(e.starts_at);
    const varios = e.ends_at && startOfDay(e.ends_at) !== startOfDay(e.starts_at);
    const cuando = varios
      ? `${ini.toLocaleDateString('es-ES', { day: 'numeric', month: 'short' })} – ${new Date(e.ends_at).toLocaleDateString('es-ES', { day: 'numeric', month: 'short' })}`
      : e.ends_at ? `${hora(e.starts_at)} – ${hora(e.ends_at)}` : hora(e.starts_at);
    const logo = okUrl(e.studio_logo);
    const img = okUrl(e.image);
    return `<article class="cal-ev" style="--c:${okColor(e.color)}">
      <div class="fecha"><b>${ini.getDate()}</b><small>${esc(ini.toLocaleDateString('es-ES', { weekday: 'short' }).replace('.', ''))}</small></div>
      <div class="info">
        <h3>${esc(e.title)}</h3>
        <p class="meta"><span><svg><use href="#i-reloj"/></svg>${esc(cuando)}</span>${e.category ? `<span class="cat">${esc(e.category)}</span>` : ''}${e.instance ? `<span class="inst">${esc(e.instance)}</span>` : ''}</p>
        ${e.description ? `<p class="desc">${esc(e.description)}</p>` : ''}
        <p class="studio">${logo ? `<img src="${esc(logo)}" alt="" width="20" height="20">` : `<i>${esc(String(e.studio || '?').slice(0, 2).toUpperCase())}</i>`}${esc(e.studio)}</p>
      </div>
      ${img ? `<img class="arte" src="${esc(img)}" alt="" loading="lazy">` : ''}
    </article>`;
  }

  function agenda(evs) {
    const ini = new Date(y, m, 1).getTime(), fin = new Date(y, m + 1, 1).getTime();
    const esteMes = y === hoy.getFullYear() && m === hoy.getMonth();
    let lista, titulo;
    if (elegido) {
      lista = delDia(evs, elegido);
      titulo = cap(new Date(elegido).toLocaleDateString('es-ES', { weekday: 'long', day: 'numeric', month: 'long' }));
    } else {
      const desde = esteMes ? startOfDay(Date.now()) : ini;
      lista = evs.filter(e => (e.ends_at || e.starts_at) >= desde && e.starts_at < fin);
      titulo = esteMes ? 'Próximos eventos' : `Eventos de ${new Date(y, m, 1).toLocaleDateString('es-ES', { month: 'long' })}`;
    }
    lista.sort((a, b) => a.starts_at - b.starts_at);
    $('#cal-sub').textContent = titulo;
    $('#cal-lista').innerHTML = lista.length ? lista.map(evento).join('')
      : `<p class="cal-vacio">${elegido ? 'No hay eventos este día.' : esteMes ? 'No hay más eventos este mes. Mira el mes que viene.' : 'No hay eventos este mes.'}</p>`;
  }

  async function pintar() {
    try {
      const evs = await cargar(y, m);
      rejilla(evs);
      agenda(evs);
    } catch {
      rejilla([]);
      $('#cal-lista').innerHTML = '<p class="cal-vacio">No se pudo cargar el calendario. Vuelve a intentarlo en un rato.</p>';
    }
  }

  $('#cal-ant').onclick = () => { m--; if (m < 0) { m = 11; y--; } elegido = null; pintar(); };
  $('#cal-sig').onclick = () => { m++; if (m > 11) { m = 0; y++; } elegido = null; pintar(); };
  pintar();
})();
