// Cámaras en directo (KopiGuard): lo que ve cada jugador de las instancias con KopiGuard, solo la ventana
// del juego. La cuadrícula se refresca cada pocos segundos; al pulsar a un jugador se le mira en grande
// (imágenes seguidas y más nítidas). El panel no graba: solo guarda la última imagen mientras se juega.
(function () {
  const V = window.Views;
  const FRESH = 30e3; // una imagen de hace menos de 30 s cuenta como «en directo»
  const base = () => `/api/s/${encodeURIComponent(S.studio.id)}/guard/live`;
  const imgUrl = (play, at) => `${base()}/${encodeURIComponent(play)}/img?t=${at}`;
  const head = (name) => `<span class="g-head"><span>${initials(name)}</span><img src="https://mc-heads.net/avatar/${encodeURIComponent(name)}/28" alt="" loading="lazy" onerror="this.remove()"></span>`;
  const since = (at) => { const m = Math.max(0, Math.floor((Date.now() - at) / 60e3)); return m < 60 ? t('{n} min', { n: m }) : t('{h} h {m} min', { h: Math.floor(m / 60), m: m % 60 }); };

  V.cameras = async (view, route) => {
    if (!can('editor') && !(S.me && S.me.user.role === 'creator')) {
      view.innerHTML = html`<div class="page"><div class="card empty"><div class="ic">${icon('lock')}</div><h4>${t('Solo para quien modera')}</h4><p>${t('Las cámaras las ven los editores, administradores y el dueño del studio.')}</p></div></div>`;
      return;
    }
    const f = { instance: '', q: '' };
    let data = null, timer = 0, alive = true;

    function draw() {
      const list = data.players.filter(p => (!f.instance || p.instance === f.instance) && (!f.q || p.player.toLowerCase().includes(f.q.toLowerCase())));
      const insts = [...new Map(data.players.map(p => [p.instance, p.instanceName])).entries()];
      const grid = $('#cam-grid', view);
      const focusQ = document.activeElement && document.activeElement.id === 'cam-q';
      view.innerHTML = html`<div class="page cam-page">
        <div class="page-head"><div><h1><span class="cam-dot"></span>${t('Cámaras en directo')}</h1><p>${t('Lo que ve cada jugador de tus instancias con KopiGuard. Solo la ventana del juego.')}</p></div>
          <span class="grow"></span><span class="badge ${data.players.length ? 'ok' : 'mute'} cam-count">${icon('users')}${t('{n} jugando', { n: data.players.length })}</span></div>
        ${data.players.length ? html`<div class="g-bar cam-bar">
            <label class="g-search">${icon('search')}<input class="input" id="cam-q" placeholder="${t('Buscar jugador…')}" value="${esc(f.q)}"></label>
            ${insts.length > 1 ? `<select class="input g-sel" id="cam-inst"><option value="">${t('Todas las instancias')}</option>${insts.map(([id, n]) => `<option value="${esc(id)}" ${f.instance === id ? 'selected' : ''}>${esc(n)}</option>`).join('')}</select>` : ''}
          </div>
          <div class="cam-grid" id="cam-grid">${list.map(card).join('') || `<div class="card empty" style="grid-column:1/-1"><h4>${t('Nadie con ese nombre')}</h4></div>`}</div>`
        : html`<div class="card empty"><div class="ic">${icon('video')}</div><h4>${data.guarded ? t('Nadie está jugando ahora') : t('Ninguna instancia tiene KopiGuard')}</h4>
            <p>${data.guarded ? t('Cuando alguien entre a jugar en una instancia con KopiGuard, su cámara aparecerá aquí.') : t('Actívalo en el editor de una instancia → Protección.')}</p></div>`}
        <p class="help g-note">${icon('info')}${t('La primera imagen tarda hasta 20 segundos. Las cámaras no se graban: el panel solo guarda la última imagen mientras se juega.')}</p>
      </div>`;
      const q = $('#cam-q', view);
      if (q) { q.oninput = () => { f.q = q.value.trim(); draw(); }; if (focusQ) { q.focus(); q.setSelectionRange(q.value.length, q.value.length); } }
      const si = $('#cam-inst', view);
      if (si) si.onchange = () => { f.instance = si.value; draw(); };
      $$('.cam-card', view).forEach(c => c.onclick = () => watch(c.dataset.play, data.players.find(p => p.play === c.dataset.play)));
      void grid;
    }

    function card(p) {
      const live = p.frameAt && Date.now() - p.frameAt < FRESH;
      return html`<button class="cam-card" data-play="${esc(p.play)}">
        <div class="cam-screen">
          ${p.frameAt ? `<img src="${imgUrl(p.play, p.frameAt)}" alt="">` : `<div class="cam-wait"><span class="spin-ring"></span><small>${t('Conectando…')}</small></div>`}
          ${p.hidden ? `<div class="cam-hidden">${icon('eyeOff')}<small>${t('Juego minimizado')}</small></div>` : ''}
${p.off ? `<div class="cam-hidden">${icon('monitor')}<small>${t('Este equipo no permite capturar el juego')}</small></div>` : ''}
          ${live ? `<span class="cam-live">${t('EN DIRECTO')}</span>` : ''}
          <span class="cam-time">${icon('clock')}${since(p.startedAt)}</span>
        </div>
        <div class="cam-foot">${head(p.player)}<div><b>${esc(p.player)}</b><small>${esc(p.instanceName)}</small></div>${icon('maximize')}</div>
      </button>`;
    }

    async function load() {
      try { data = await sapi('GET', '/guard/live', undefined, { quiet: true }); if (alive) draw(); }
      catch (e) { if (!data) throw e; }
    }
    const tick = async () => {
      if (!alive) return;
      if (!document.hidden && !document.querySelector('.cam-viewer')) await load().catch(() => {});
      timer = setTimeout(tick, 5000);
    };
    view.innerHTML = `<div class="page"><div class="skel" style="height:80px;margin-bottom:16px"></div><div class="cam-grid">${'<div class="skel" style="aspect-ratio:16/10"></div>'.repeat(6)}</div></div>`;
    await load();
    timer = setTimeout(tick, 5000);
    const want = route && route.query && route.query.get('play');
    const p0 = want && data.players.find(p => p.play === want);
    if (p0) watch(p0.play, p0);
    return () => { alive = false; clearTimeout(timer); };
  };

  // ---------------------------------------------------------------- un jugador en grande
  function watch(play, p) {
    let alive = true, timer = 0, lastAt = 0, frames = [];
    const close = modal((m, done) => {
      m.classList.add('wide', 'cam-viewer');
      m.innerHTML = html`<div class="mh">${head(p.player)}<h3 style="flex:none">${esc(p.player)}</h3><span class="cam-sub">${esc(p.instanceName)}</span>
          <span class="grow"></span><span class="badge mute" id="cv-state">${t('Conectando…')}</span>
          <button class="btn ghost icon sm" data-x title="${t('Cerrar')}">${icon('x')}</button></div>
        <div class="cv-stage" id="cv-stage"><div class="cam-wait"><span class="spin-ring"></span><small>${t('Pidiendo la imagen al launcher… (hasta 20 s)')}</small></div></div>
        <div class="mf">
          <button class="btn" id="cv-shot" disabled>${icon('camera')}${t('Guardar captura')}</button>
          <button class="btn" id="cv-full">${icon('maximize')}${t('Pantalla completa')}</button>
          <a class="btn ghost" href="#/guard" id="cv-dets">${icon('shield')}${t('Detecciones')}</a>
          <span class="grow"></span>
          ${can('editor') || (S.me && S.me.user.role === 'creator') ? `<button class="btn danger" id="cv-kick">${icon('logout')}${t('Expulsar')}</button>` : ''}
        </div>`;
      $('[data-x]', m).onclick = done;
      $('#cv-dets', m).onclick = () => done();
      const stage = $('#cv-stage', m), state = $('#cv-state', m);
      $('#cv-full', m).onclick = () => { (stage.requestFullscreen || stage.webkitRequestFullscreen || (() => {})).call(stage); };
      $('#cv-shot', m).onclick = () => {
        const a = document.createElement('a');
        a.href = imgUrl(play, lastAt); a.download = `${p.player}-${new Date(lastAt).toISOString().slice(0, 19).replace(/[:T]/g, '-')}.jpg`;
        document.body.appendChild(a); a.click(); a.remove();
      };
      const kick = $('#cv-kick', m);
      if (kick) kick.onclick = async () => {
        if (!(await confirmBox({ title: t('¿Expulsar a {n}?', { n: p.player }), text: t('Se le cierra el juego en unos segundos. Podrá volver a entrar.'), ok: t('Expulsar'), danger: true, ico: 'logout' }))) return;
        busy(kick, true);
        try { await sapi('POST', `/guard/live/${encodeURIComponent(play)}`, { action: 'kick' }); toast(t('{n} expulsado', { n: p.player })); done(); }
        catch (e) { fail(e); busy(kick, false); }
      };
      const show = (at) => new Promise((resolve) => {
        const img = new Image();
        img.onload = () => {
          let el = $('img', stage);
          if (!el) { stage.innerHTML = '<img alt=""><span class="cam-live">' + esc(t('EN DIRECTO')) + '</span>'; el = $('img', stage); }
          el.src = img.src; resolve();
        };
        img.onerror = () => resolve();
        img.src = imgUrl(play, at);
      });
      const loop = async () => {
        if (!alive) return;
        try {
          const r = await sapi('GET', `/guard/live/${encodeURIComponent(play)}`, undefined, { quiet: true });
          if (!r.playing) {
            state.className = 'badge mute'; state.textContent = t('Ya no está jugando');
            if (kick) kick.disabled = true;
          } else if (r.off) {
            stage.innerHTML = `<div class="cam-wait">${icon('monitor')}<small>${esc(t('Este equipo no permite capturar el juego (en Mac hay que dar permiso para grabar la pantalla).'))}</small></div>`;
            state.className = 'badge mute'; state.textContent = t('Sin cámara');
          } else if (r.frameAt && r.frameAt !== lastAt) {
            lastAt = r.frameAt;
            await show(r.frameAt);
            $('#cv-shot', m).disabled = false;
            frames = frames.filter(x => x > Date.now() - 5000).concat(Date.now());
            stage.classList.toggle('hidden-win', r.hidden);
            state.className = 'badge ' + (r.hidden ? 'warn' : 'danger solid');
            state.textContent = r.hidden ? t('Juego minimizado') : t('En directo · {n} img/s', { n: (frames.length / 5).toFixed(1).replace(/\.0$/, '') });
          } else if (r.frameAt && Date.now() - r.frameAt > 8000) {
            state.className = 'badge warn'; state.textContent = t('Sin imagen nueva hace {n} s', { n: Math.round((Date.now() - r.frameAt) / 1000) });
          }
        } catch { /* se reintenta */ }
        timer = setTimeout(loop, 600);
      };
      loop();
    }, { wide: true });
    const obs = new MutationObserver(() => { if (!document.querySelector('.cam-viewer')) { alive = false; clearTimeout(timer); obs.disconnect(); } });
    obs.observe(document.body, { childList: true, subtree: true });
    return close;
  }
})();
