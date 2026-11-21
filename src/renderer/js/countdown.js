// Cuenta atrás: hasta que abre una instancia (o empieza el próximo evento de su calendario).
//   - En la página de la instancia: grande, con días, horas, minutos y segundos que cambian con animación.
//     Los últimos 10 segundos laten, y al llegar a cero lo celebra (confeti) y ya se puede jugar.
//   - En Inicio: pequeña, encima del botón Jugar.
// El studio la enciende o apaga (y pone el texto de encima) en el panel: Instancia → Juego → Horario y bloqueo.
(function () {
  const DAY = 864e5, H = 36e5, M = 6e4;

  // ¿Hay algo que contar? → { at, kind: 'open'|'event', title, color } o null
  function target(inst, now = Date.now()) {
    if (!inst) return null;
    const sc = inst.schedule || {};
    if (sc.countdown === false) return null;
    if (sc.opensAt && sc.opensAt > now) return { at: sc.opensAt, kind: 'open', title: sc.countdownText || '', color: null };
    const ev = inst.nextEvent;
    if (ev && ev.startsAt > now && ev.startsAt - now < 60 * DAY) return { at: ev.startsAt, kind: 'event', title: ev.title || '', color: ev.color || null };
    return null;
  }

  function parts(ms) {
    ms = Math.max(0, ms);
    return { d: Math.floor(ms / DAY), h: Math.floor(ms % DAY / H), m: Math.floor(ms % H / M), s: Math.floor(ms % M / 1000) };
  }
  const two = (n) => String(n).padStart(2, '0');

  const okColor = (c) => /^#[0-9a-f]{6}$/i.test(String(c || '')) ? c : null;
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  function kicker(info, inst) {
    if (info.kind === 'event') return t('{title} empieza en', { title: info.title || t('El evento') });
    return info.title || t('{name} abre en', { name: inst.name });
  }
  function when(at) {
    const s = new Date(at).toLocaleString(I18N.locale(), { weekday: 'long', day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit' });
    return s.charAt(0).toUpperCase() + s.slice(1);
  }

  // Monta la cuenta atrás en «el». Devuelve una función para pararla.
  // opts: { size: 'big'|'mini', onZero() }
  function mount(el, inst, opts = {}) {
    const info = target(inst);
    if (!el) return () => {};
    if (!info) { el.innerHTML = ''; el.hidden = true; return () => {}; }
    el.hidden = false;
    const big = opts.size !== 'mini';
    const color = okColor(info.color);
    el.classList.add('cd', big ? 'cd-big' : 'cd-mini');
    if (color) el.style.setProperty('--cd', color);
    const units = [['d', t('días')], ['h', t('horas')], ['m', t('min')], ['s', t('seg')]];
    if (big) {
      el.innerHTML = `<span class="cd-k">${esc(kicker(info, inst))}</span>
        <div class="cd-row">${units.map(([u, l], n) => `${n ? '<i class="cd-sep">:</i>' : ''}<div class="cd-t" data-u="${u}"><b><span>--</span></b><small>${esc(l)}</small></div>`).join('')}</div>
        <span class="cd-when">${esc(when(info.at))}</span>`;
    } else {
      el.innerHTML = `<span class="cd-dot"></span><span class="cd-mk">${esc(info.kind === 'event' ? t('{title} en', { title: info.title || t('El evento') }) : t('Abre en'))}</span><b class="cd-mt">--</b>`;
    }
    let last = {}, done = false;
    const tick = () => {
      const left = info.at - Date.now();
      const p = parts(left);
      if (big) {
        // sin días: solo horas, minutos y segundos
        el.querySelector('[data-u="d"]').classList.toggle('gone', p.d === 0);
        el.querySelector('.cd-sep').classList.toggle('gone', p.d === 0);
        for (const [u] of units) {
          const v = u === 'd' ? String(p.d) : two(p[u]);
          if (last[u] === v) continue;
          const b = el.querySelector(`[data-u="${u}"] b`);
          b.innerHTML = `<span class="${last[u] == null ? '' : 'tick'}">${v}</span>`;
          last[u] = v;
        }
        el.classList.toggle('cd-final', left > 0 && left <= 10e3);
      } else {
        const txt = p.d ? `${p.d} ${t('d')} ${two(p.h)}:${two(p.m)}:${two(p.s)}` : `${two(p.h)}:${two(p.m)}:${two(p.s)}`;
        el.querySelector('.cd-mt').textContent = txt;
      }
      if (left <= 0 && !done) {
        done = true;
        clearInterval(timer);
        if (opts.onZero) opts.onZero(info);
      }
    };
    tick();
    const timer = setInterval(tick, 250);
    return () => clearInterval(timer);
  }

  // ¡Ya está! Confeti y un mensaje grande encima de «host»; se quita solo
  function celebrate(host, info, inst) {
    if (!host) return;
    const colors = ['#ff6ec7', '#ffd23f', '#3ddc84', '#2ec4f1', '#a35cff', '#ff8a3d', '#ffffff'];
    const party = document.createElement('div');
    party.className = 'cd-party';
    party.innerHTML = `<div class="cd-conf">${Array.from({ length: 70 }, (_, n) => {
      const x = (n * 37) % 100, dx = ((n * 53) % 60) - 30, r = (n * 97) % 360, d = 1.6 + (n % 7) * 0.22, delay = (n % 10) * 0.05;
      return `<i style="left:${x}%;--dx:${dx}vw;--r:${r}deg;background:${colors[n % colors.length]};animation-duration:${d}s;animation-delay:${delay}s;${n % 3 ? '' : 'border-radius:50%;'}"></i>`;
    }).join('')}</div>
      <div class="cd-done"><span>${esc(info.kind === 'event' ? t('¡Empieza!') : t('¡Ya está abierta!'))}</span><b>${esc(info.kind === 'event' ? (info.title || inst.name) : inst.name)}</b></div>`;
    host.appendChild(party);
    setTimeout(() => party.classList.add('out'), 5200);
    setTimeout(() => party.remove(), 6000);
    // aviso del sistema si el launcher no está delante
    try {
      if (!document.hasFocus() && window.Notification) new Notification(info.kind === 'event' ? t('¡Empieza {title}!', { title: info.title || inst.name }) : t('¡{name} ya está abierta!', { name: inst.name }), { body: t('Entra a Kopi y pulsa Jugar.') });
    } catch { /* nada */ }
  }

  window.Countdown = { target, parts, mount, celebrate };
})();
