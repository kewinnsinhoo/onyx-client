// Ruleta diaria: una tirada al día. Puede tocar una capa, un marco o un fondo que aún no tienes.
// El premio lo decide el panel; aquí solo se gira la rueda hasta su casilla y se enseña el premio.
(function () {
  const { html, esc, toast } = UI;
  const V = window.Views = window.Views || {};

  // Las 8 casillas, en el sentido de las agujas del reloj empezando arriba
  const SEG = ['legendary', 'none', 'rare', 'epic', 'none', 'rare', 'epic', 'rare'];
  const LOOK = {
    legendary: { a: '#fde68a', b: '#d97706', ink: '#3b2203', ic: 'crown', label: 'Legendaria' },
    epic: { a: '#f0abfc', b: '#9333ea', ink: '#2e0a3d', ic: 'sparkles', label: 'Épica' },
    rare: { a: '#93c5fd', b: '#2563eb', ink: '#0b1d44', ic: 'star', label: 'Rara' },
    none: { a: '#3f3650', b: '#221b2e', ink: '#cbbfe0', ic: 'refresh', label: '¡Casi!' }
  };
  const ICON = { crown: 'm3 8 4.5 4L12 5l4.5 7L21 8l-2 11H5z', sparkles: 'M12 3l1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8z', star: 'm12 3 2.7 5.6 6.1.9-4.4 4.3 1 6.1L12 17l-5.4 2.9 1-6.1-4.4-4.3 6.1-.9z', refresh: 'M4 12a8 8 0 0 1 14-5.3L20 9M20 4v5h-5M20 12a8 8 0 0 1-14 5.3L4 15M4 20v-5h5' };
  const fmtLeft = (ms) => {
    const s = Math.max(0, Math.ceil(ms / 1000)), h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), x = s % 60;
    return h ? `${h} h ${String(m).padStart(2, '0')} min` : `${m} min ${String(x).padStart(2, '0')} s`;
  };
  const KIND = { cape: 'Capa', frame: 'Marco', bg: 'Fondo' };
  const prizeName = (p) => {
    if (!p) return '';
    const it = p.kind === 'cape' ? KopiCapes.get(p.id) : p.kind === 'frame' ? KopiCosmetics.getFrame(p.id) : KopiCosmetics.getBg(p.id);
    return it ? t(it.name) : p.id;
  };

  // La rueda en SVG (radio 100, centro 0,0)
  function wheelSvg() {
    const r = 100, seg = (i) => {
      const a0 = (i * 45 - 90 - 22.5) * Math.PI / 180, a1 = (i * 45 - 90 + 22.5) * Math.PI / 180;
      const L = LOOK[SEG[i]], mid = (i * 45 - 90) * Math.PI / 180;
      const ix = Math.cos(mid) * 58, iy = Math.sin(mid) * 58;
      return `<path d="M0 0 L${(Math.cos(a0) * r).toFixed(2)} ${(Math.sin(a0) * r).toFixed(2)} A${r} ${r} 0 0 1 ${(Math.cos(a1) * r).toFixed(2)} ${(Math.sin(a1) * r).toFixed(2)}Z" fill="url(#sg-${SEG[i]})" stroke="#140f1c" stroke-width="1.6"/>
        <g transform="translate(${ix.toFixed(2)} ${iy.toFixed(2)}) rotate(${i * 45})"><g transform="translate(-9 -6) scale(.75)"><path d="${ICON[L.ic]}" fill="${SEG[i] === 'none' ? 'none' : L.ink}" stroke="${L.ink}" stroke-width="${SEG[i] === 'none' ? 2.4 : 1}" stroke-linecap="round" stroke-linejoin="round"/></g>
          <text y="-19" text-anchor="middle" font-size="8.5" font-weight="800" fill="${L.ink}" font-family="Sora, system-ui, sans-serif">${esc(t(L.label))}</text></g>`;
    };
    const grad = Object.entries(LOOK).map(([k, L]) => `<radialGradient id="sg-${k}" cx="0" cy="0" r="100" gradientUnits="userSpaceOnUse"><stop offset=".25" stop-color="${L.a}"/><stop offset="1" stop-color="${L.b}"/></radialGradient>`).join('');
    const bulbs = Array.from({ length: 16 }, (_, i) => { const a = (i * 22.5 - 90) * Math.PI / 180; return `<circle class="sp-bulb ${i % 2 ? 'b' : 'a'}" cx="${(Math.cos(a) * 108).toFixed(2)}" cy="${(Math.sin(a) * 108).toFixed(2)}" r="3.4"/>`; }).join('');
    return `<svg class="sp-svg" viewBox="-118 -118 236 236" aria-hidden="true"><defs>${grad}<linearGradient id="sp-rim" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#fde68a"/><stop offset=".5" stop-color="#b45309"/><stop offset="1" stop-color="#fde68a"/></linearGradient></defs>
      <circle r="112" fill="#140f1c" stroke="url(#sp-rim)" stroke-width="5"/>${bulbs}
      <g class="sp-wheel" id="sp-wheel">${SEG.map((_, i) => seg(i)).join('')}<circle r="100" fill="none" stroke="rgba(255,255,255,.18)" stroke-width="1"/></g></svg>`;
  }

  V.spin = function (root) {
    let st = null, spinning = false, angle = 0, timer = 0, gone = false;

    function render() {
      const ready = st && st.ready;
      const odds = st ? st.odds : [['none', 45], ['rare', 42], ['epic', 10], ['legendary', 3]];
      root.innerHTML = html`<div class="page sp-page">
        <div class="page-head"><h1 class="title">${t('Ruleta diaria')}</h1></div>
        <div class="sp-grid">
          <div class="sp-stage ${ready ? 'ready' : ''}">
            <div class="sp-glow"></div>
            <div class="sp-pointer"><svg viewBox="0 0 30 36"><path d="M15 34 2 6a13 13 0 0 1 26 0z" fill="#fde68a" stroke="#b45309" stroke-width="2"/><circle cx="15" cy="10" r="4" fill="#b45309"/></svg></div>
            ${wheelSvg()}
            <button class="sp-go" id="sp-go" ${ready && !spinning ? '' : 'disabled'}>${spinning ? t('Girando…') : ready ? t('¡GIRAR!') : icon('clock')}</button>
          </div>
          <div class="sp-side">
            <section class="card sp-status ${ready ? 'ready' : ''}">
              ${!st ? html`<div class="sp-big">${t('Cargando…')}</div>`
                : ready ? html`<span class="sp-chip">${icon('gift')}${t('¡Lista!')}</span><div class="sp-big">${t('Tienes una tirada')}</div><p>${t('Gira la ruleta: puede tocarte una capa, un marco o un fondo que aún no tienes.')}</p>`
                : html`<span class="sp-chip off">${icon('clock')}${t('Vuelve más tarde')}</span><div class="sp-big" id="sp-left">${esc(fmtLeft(st.next - Date.now()))}</div><p>${t('para tu próxima tirada. Hay una cada día.')}</p>`}
              ${st ? html`<div class="sp-left">${t('Te quedan {n} premios por conseguir', { n: st.left })}<span class="sp-bar"><i style="width:${Math.round((1 - st.left / Math.max(1, st.total)) * 100)}%"></i></span></div>` : ''}
            </section>
            <section class="card sp-odds"><b>${t('Probabilidades')}</b>
              ${odds.slice().reverse().map(([k, p]) => html`<div class="sp-odd"><i style="background:linear-gradient(135deg, ${LOOK[k].a}, ${LOOK[k].b})"></i><span>${t(k === 'none' ? '¡Casi! (nada esta vez)' : LOOK[k].label)}</span><b>${p} %</b></div>`).join('')}
              <small>${t('Siempre te toca algo que no tienes. Los exclusivos no salen en la ruleta.')}</small>
            </section>
            ${st && st.recent && st.recent.length ? html`<section class="card sp-recent"><b>${t('Tus últimas tiradas')}</b>
              ${st.recent.map(r => html`<div class="sp-rec"><i style="background:linear-gradient(135deg, ${LOOK[r.rarity || 'none'].a}, ${LOOK[r.rarity || 'none'].b})"></i>
                <span>${r.kind ? esc(`${t(KIND[r.kind])} ${prizeName(r)}`) : t('¡Casi!')}</span><small>${esc(UI.timeAgo(r.at))}</small></div>`).join('')}</section>` : ''}
          </div>
        </div>
      </div>`;
      const wheel = root.querySelector('#sp-wheel');
      wheel.style.transform = `rotate(${angle}deg)`;
      const go = root.querySelector('#sp-go');
      if (go) go.onclick = spin;
    }

    async function load() {
      try { st = await onyx.spin.get(); } catch { st = null; }
      if (gone) return;
      if (!st) { root.innerHTML = html`<div class="page"><div class="empty">${icon('gift')}<h3>${t('La ruleta no está disponible ahora')}</h3><p>${t('Inicia sesión y comprueba tu conexión.')}</p></div></div>`; return; }
      S.spin = st; App.renderChrome();
      render();
    }

    async function spin() {
      if (spinning || !st || !st.ready) return;
      spinning = true;
      const btn = root.querySelector('#sp-go');
      btn.disabled = true; btn.textContent = t('Girando…');
      let r;
      try { r = await onyx.spin.go(); } catch (e) {
        spinning = false; toast(t(e.message, e.vars), 'error'); return load();
      }
      // la casilla del premio (si hay varias de esa rareza, una al azar)
      const opts = SEG.map((k, i) => [k, i]).filter(([k]) => k === r.tier).map(([, i]) => i);
      const i = opts[Math.floor(Math.random() * opts.length)];
      const jitter = (Math.random() - 0.5) * 30;
      const base = Math.ceil(angle / 360) * 360;
      angle = base + 360 * 6 - i * 45 + jitter;
      const wheel = root.querySelector('#sp-wheel');
      root.querySelector('.sp-stage').classList.add('spinning');
      wheel.style.transition = 'transform 5.2s cubic-bezier(.12, .62, .08, 1)';
      wheel.style.transform = `rotate(${angle}deg)`;
      await new Promise(res => setTimeout(res, 5400));
      if (gone) return;
      spinning = false;
      st = { ...st, ready: false, next: r.next, left: st.left - (r.prize ? 1 : 0), recent: [{ at: Date.now(), kind: r.prize && r.prize.kind, id: r.prize && r.prize.id, rarity: r.prize && r.prize.rarity }, ...(st.recent || [])].slice(0, 6) };
      S.spin = st; App.renderChrome();
      render();
      prizeModal(r);
      if (r.prize && r.prize.kind !== 'cape') App.loadLooks().catch(() => {});
    }

    // El premio en grande, con rayos de luz; un botón para ponérselo ya
    function prizeModal(r) {
      const p = r.prize, L = LOOK[r.tier];
      UI.modal((m, close) => {
        m.classList.add('sp-prize', 'r-' + r.tier);
        const show = !p ? `<div class="sp-none">${icon('refresh')}</div>`
          : p.kind === 'cape' ? '<div class="sp-cape"><canvas id="sp-cv"></canvas></div>'
            : p.kind === 'frame' ? `<div class="sp-frame">${KopiCosmetics.wrap(Skin3D.head(App.skinOf(S.account), 104, 0), p.id, 104)}</div>`
              : `<div class="sp-bgcard">${KopiCosmetics.bgLayer(p.id)}${Skin3D.head(App.skinOf(S.account), 54, 0)}<b>${esc(S.account ? S.account.name : '')}</b></div>`;
        m.innerHTML = html`<div class="sp-rays" style="--a:${L.a}"></div>
          <div class="sp-pbody">
            <span class="sp-tier" style="--a:${L.a};--b:${L.b}">${t(p ? L.label : '¡Casi!')}</span>
            ${show}
            <h2>${p ? esc(t('¡{kind} {name}!', { kind: t(KIND[p.kind]), name: prizeName(p) })) : t('¡Por poco!')}</h2>
            <p>${p ? t('Ya es tuyo. Póntelo cuando quieras.') : t('Esta vez no ha tocado nada. Vuelve mañana para otra tirada.')}</p>
            <div class="sp-acts">${p ? `<button class="btn btn-primary" id="sp-wear">${icon('check')}${t('Ponérmelo')}</button>` : ''}<button class="btn btn-ghost" id="sp-ok">${t(p ? 'Luego' : 'Vale')}</button></div>
          </div>`;
        if (p && p.kind === 'cape') KopiCapes.mount(m.querySelector('#sp-cv'), KopiCapes.get(p.id));
        m.querySelector('#sp-ok').onclick = close;
        const wear = m.querySelector('#sp-wear');
        if (wear) wear.onclick = async () => {
          UI.busy(wear, true);
          try {
            if (p.kind === 'cape') await onyx.capes.kopiWear(p.id);
            else { const w = await onyx.looks.wear({ [p.kind]: p.id }); if (w && w.worn) S.look = { ...S.look, worn: w.worn }; App.renderChrome(); }
            toast(t('¡Puesto!'), 'success'); close();
          } catch (e) { toast(t(e.message, e.vars), 'error'); UI.busy(wear, false); }
        };
      });
      if (p) confetti(L);
    }
    function confetti(L) {
      const box = document.createElement('div');
      box.className = 'sp-confetti';
      const cols = [L.a, L.b, '#ffffff', '#fde68a'];
      box.innerHTML = Array.from({ length: 70 }, (_, i) => `<i style="left:${Math.random() * 100}%;background:${cols[i % cols.length]};animation-delay:${(Math.random() * 0.6).toFixed(2)}s;animation-duration:${(2.2 + Math.random() * 1.6).toFixed(2)}s;transform:rotate(${Math.round(Math.random() * 360)}deg)"></i>`).join('');
      document.body.appendChild(box);
      setTimeout(() => box.remove(), 4400);
    }

    render();
    load();
    timer = setInterval(() => {
      if (!st || st.ready || spinning) return;
      if (Date.now() >= st.next) return load();
      const el = root.querySelector('#sp-left');
      if (el) el.textContent = fmtLeft(st.next - Date.now());
    }, 1000);
    return () => { gone = true; clearInterval(timer); };
  };
})();
