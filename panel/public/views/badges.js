// Insignias del studio: las crea el studio y las da a mano (a quien gane un torneo, por ejemplo) o salen solas
// (jugar X horas en una instancia, o jugarla). Los jugadores las ven en su perfil del launcher.
// El Creador ve además las especiales de Kopi («Equipo Kopi», «Beta tester») y las da a mano.
(function () {
  const V = window.Views;
  const RAR = () => ({ common: t('Común'), rare: t('Rara'), epic: t('Épica'), legendary: t('Legendaria') });
  const ruleText = (b, insts) => {
    const n = (id) => (insts.find(i => i.id === id) || {}).name || id;
    if (b.rule.type === 'hours') return t('Sola: {h} h jugando {inst}', { h: b.rule.hours, inst: n(b.rule.instance) });
    if (b.rule.type === 'played') return t('Sola: jugar {inst}', { inst: n(b.rule.instance) });
    return t('A mano');
  };

  V.badges = async (view) => {
    const isCreator = !!(S.me && S.me.user.role === 'creator');
    view.innerHTML = `<div class="page"><div class="skel" style="height:420px"></div></div>`;
    let data, special = null;
    try {
      [data, special] = await Promise.all([sapi('GET', '/badges'), isCreator ? api('GET', '/onyx/badges').catch(() => null) : null]);
    } catch (e) { view.innerHTML = `<div class="page"><div class="card empty"><h4>${esc(e.message)}</h4></div></div>`; return; }

    function draw() {
      const r = RAR();
      view.innerHTML = html`<div class="page bdg-page">
        <div class="page-head"><div><h1>${t('Insignias')}</h1><p>${t('Premia a tus jugadores. Salen en su perfil del launcher y pueden ponerlas en su vitrina.')}</p></div>
          <span class="grow"></span>${can('editor') ? `<button class="btn primary" id="bdg-new">${icon('plus')}${t('Nueva insignia')}</button>` : ''}</div>
        ${data.badges.length ? html`<div class="bdg-grid">${data.badges.map(b => html`<button class="bdg-card r-${b.rarity}" data-b="${esc(b.id)}">
            <span class="bdg-m">${Badge.medal({ ...b, earned: true }, 64)}</span>
            <b>${esc(b.name)}</b><span class="bdg-r r-${b.rarity}">${r[b.rarity]}</span>
            ${b.description ? `<p>${esc(b.description)}</p>` : ''}
            <span class="bdg-foot"><span>${icon(b.rule.type === 'manual' ? 'gift' : 'zap')}${esc(ruleText(b, data.instances))}</span><span>${icon('users')}${b.holders}</span></span></button>`).join('')}</div>`
          : html`<div class="card empty bdg-empty"><div class="bdg-demo">${['common', 'rare', 'epic', 'legendary'].map((x, n) => Badge.medal({ icon: ['star', 'flame', 'gem', 'trophy'][n], rarity: x, earned: true }, 54)).join('')}</div>
              <h4>${t('Aún no hay insignias')}</h4><p>${t('Crea una para el ganador de un torneo, para quien juegue 10 horas a tu evento o para quien estuvo el primer día.')}</p>
              ${can('editor') ? `<button class="btn primary" id="bdg-new2">${icon('plus')}${t('Nueva insignia')}</button>` : ''}</div>`}
        ${special ? html`<div class="card bdg-special"><div class="card-head"><div><h3>${icon('crown')}${t('Insignias especiales de Kopi')}</h3>
            <p class="sub">${t('Solo las das tú, como Creador. Las ve todo el mundo en el perfil del jugador.')}</p></div></div>
            <div class="bdg-sp">${special.special.map(s => html`<div class="bdg-sprow">
              <span class="bdg-m">${Badge.medal({ ...s, earned: true }, 46)}</span>
              <div class="bdg-spt"><b>${esc(t(s.name))}</b><span>${esc(t(s.desc))}</span>
                <div class="bdg-who">${s.players.map(p => `<span class="bdg-chip">${esc(p.name)}<button data-rm="${esc(s.id)}" data-n="${esc(p.name)}" title="${t('Quitar')}">${icon('x')}</button></span>`).join('') || `<small>${t('Nadie todavía')}</small>`}</div></div>
              <div class="bdg-give"><input class="input" data-sp="${esc(s.id)}" placeholder="${t('Nombre de Minecraft')}" spellcheck="false" autocomplete="off"><button class="btn" data-spgo="${esc(s.id)}">${icon('gift')}${t('Dar')}</button></div>
            </div>`).join('')}</div></div>` : ''}
      </div>`;
      [$('#bdg-new', view), $('#bdg-new2', view)].forEach(b => { if (b) b.onclick = () => editor(null); });
      $$('[data-b]', view).forEach(el => { el.onclick = () => detail(data.badges.find(b => b.id === el.dataset.b)); });
      $$('[data-spgo]', view).forEach(btn => {
        btn.onclick = async () => {
          const inp = $(`[data-sp="${btn.dataset.spgo}"]`, view);
          if (!inp.value.trim()) return inp.focus();
          busy(btn, true);
          try { special = await api('POST', '/onyx/badges', { badge: btn.dataset.spgo, names: inp.value }); toast(t('Insignia dada')); draw(); } catch (e) { fail(e); busy(btn, false); }
        };
      });
      $$('[data-rm]', view).forEach(btn => {
        btn.onclick = async () => { try { special = await api('DELETE', '/onyx/badges', { badge: btn.dataset.rm, names: btn.dataset.n }); draw(); } catch (e) { fail(e); } };
      });
    }

    // Crear o cambiar una insignia (con la medalla en grande mientras se edita)
    function editor(b) {
      const f = b ? { ...b, rule: { ...b.rule } } : { name: '', description: '', rarity: 'rare', icon: 'trophy', color: null, rule: { type: 'manual' } };
      modal((m, close) => {
        const r = RAR();
        m.innerHTML = html`<div class="mh"><h3>${icon('badge')}${b ? t('Editar insignia') : t('Nueva insignia')}</h3><button class="btn ghost icon sm" data-x>${icon('x')}</button></div>
          <div class="mb bdg-ed">
            <div class="bdg-prev"><span id="ed-m"></span><b id="ed-n"></b><span id="ed-r"></span></div>
            <div class="bdg-form">
              <label class="field"><span class="label">${t('Nombre')}</span><input class="input" id="ed-name" maxlength="40" value="${esc(f.name)}" placeholder="${t('Campeón del torneo')}"></label>
              <label class="field"><span class="label">${t('Descripción')}</span><input class="input" id="ed-desc" maxlength="120" value="${esc(f.description)}" placeholder="${t('Ganó la final de IGNITE 3')}"></label>
              <div class="field"><span class="label">${t('Rareza')}</span><div class="seg" id="ed-rar">${Badge.RARITIES.map(x => `<button class="${f.rarity === x ? 'on' : ''}" data-r="${x}">${r[x]}</button>`).join('')}</div></div>
              <div class="field"><span class="label">${t('Icono')}</span><div class="bdg-icons" id="ed-ic">${data.icons.map(i => `<button class="${f.icon === i ? 'on' : ''}" data-i="${i}" title="${i}"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${Badge.path(i)}</svg></button>`).join('')}</div></div>
              <div class="field"><span class="label">${t('Color')}</span><div class="bdg-colors" id="ed-col"><button class="${!f.color ? 'on' : ''}" data-c="" title="${t('El de la rareza')}">${icon('sparkles')}</button>
                ${['#ff4d6d', '#ff8a3d', '#ffd23f', '#3ddc84', '#2ec4f1', '#4d7cff', '#a35cff', '#ff5ec4', '#9aa4b8'].map(c => `<button class="${f.color === c ? 'on' : ''}" data-c="${c}" style="background:${c}"></button>`).join('')}</div></div>
              <div class="field"><span class="label">${t('Cómo se gana')}</span>
                <select class="input" id="ed-type"><option value="manual">${t('La doy yo a mano')}</option><option value="hours">${t('Sola: jugar X horas en una instancia')}</option><option value="played">${t('Sola: jugar una instancia')}</option></select>
                <div class="bdg-rule" id="ed-rule"></div></div>
            </div>
          </div>
          <div class="mf">${b ? `<button class="btn danger" id="ed-del">${icon('trash')}${t('Borrar')}</button><span class="grow"></span>` : ''}<button class="btn" data-x>${t('Cancelar')}</button><button class="btn primary" id="ed-ok">${icon('check')}${t('Guardar')}</button></div>`;
        $$('[data-x]', m).forEach(x => { x.onclick = close; });
        const prev = () => {
          $('#ed-m', m).innerHTML = Badge.medal({ ...f, earned: true }, 96);
          $('#ed-n', m).textContent = f.name || t('Nombre de la insignia');
          $('#ed-r', m).className = 'bdg-r r-' + f.rarity; $('#ed-r', m).textContent = r[f.rarity];
        };
        const rule = () => {
          const el = $('#ed-rule', m);
          const opts = data.instances.map(i => `<option value="${esc(i.id)}" ${f.rule.instance === i.id ? 'selected' : ''}>${esc(i.name)}</option>`).join('');
          if (f.rule.type === 'manual') { el.innerHTML = `<span class="help">${t('Después la das escribiendo el nombre de los jugadores.')}</span>`; return; }
          if (!f.rule.instance && data.instances[0]) f.rule.instance = data.instances[0].id;
          el.innerHTML = html`<select class="input" id="ed-inst">${opts}</select>${f.rule.type === 'hours' ? `<label class="bdg-h"><input class="input" id="ed-hours" type="number" min="1" max="5000" value="${f.rule.hours || 5}"><span>${t('horas')}</span></label>` : ''}`;
          $('#ed-inst', m).onchange = (e) => { f.rule.instance = e.target.value; };
          const hh = $('#ed-hours', m);
          if (hh) hh.oninput = () => { f.rule.hours = Number(hh.value) || 1; };
        };
        $('#ed-type', m).value = f.rule.type;
        $('#ed-type', m).onchange = (e) => { f.rule = { type: e.target.value, instance: f.rule.instance, hours: f.rule.hours || 5 }; rule(); };
        $('#ed-name', m).oninput = (e) => { f.name = e.target.value; prev(); };
        $('#ed-desc', m).oninput = (e) => { f.description = e.target.value; };
        $$('[data-r]', m).forEach(x => { x.onclick = () => { f.rarity = x.dataset.r; $$('[data-r]', m).forEach(y => y.classList.toggle('on', y === x)); prev(); }; });
        $$('[data-i]', m).forEach(x => { x.onclick = () => { f.icon = x.dataset.i; $$('[data-i]', m).forEach(y => y.classList.toggle('on', y === x)); prev(); }; });
        $$('[data-c]', m).forEach(x => { x.onclick = () => { f.color = x.dataset.c || null; $$('[data-c]', m).forEach(y => y.classList.toggle('on', y === x)); prev(); }; });
        prev(); rule();
        $('#ed-ok', m).onclick = async (e) => {
          busy(e.currentTarget, true);
          try {
            const body = { name: f.name, description: f.description, rarity: f.rarity, icon: f.icon, color: f.color, rule: f.rule };
            const saved = b ? await sapi('PATCH', `/badges/${b.id}`, body) : await sapi('POST', '/badges', body);
            data = await sapi('GET', '/badges'); close(); draw(); toast(b ? t('Insignia guardada') : t('Insignia creada'));
            if (!b && saved.rule.type === 'manual') detail(data.badges.find(x => x.id === saved.id));
          } catch (err) { fail(err); busy(e.currentTarget, false); }
        };
        const del = $('#ed-del', m);
        if (del) del.onclick = async () => {
          if (!(await confirmBox({ title: t('¿Borrar la insignia?'), text: t('Se quita a todos los jugadores que la tienen.'), ok: t('Borrar'), danger: true }))) return;
          try { await sapi('DELETE', `/badges/${b.id}`); data = await sapi('GET', '/badges'); close(); draw(); toast(t('Insignia borrada')); } catch (err) { fail(err); }
        };
      }, { wide: true });
    }

    // Quién la tiene, darla a mano y quitarla
    function detail(b) {
      modal(async (m, close) => {
        const r = RAR();
        const paint = (d) => {
          m.innerHTML = html`<div class="mh"><h3>${icon('badge')}${esc(d.name)}</h3><button class="btn ghost icon sm" data-x>${icon('x')}</button></div>
            <div class="mb bdg-det">
              <div class="bdg-prev"><span>${Badge.medal({ ...d, earned: true }, 96)}</span><span class="bdg-r r-${d.rarity}">${r[d.rarity]}</span>
                ${d.description ? `<p>${esc(d.description)}</p>` : ''}<small>${esc(ruleText(d, data.instances))}</small>
                ${can('editor') ? `<button class="btn sm" id="dt-edit">${icon('edit')}${t('Editar')}</button>` : ''}</div>
              <div class="bdg-main">
                ${can('editor') ? html`<div class="field"><span class="label">${t('Dar a')}</span><div class="bdg-give"><input class="input" id="dt-names" maxlength="900" placeholder="${t('Nombre de Minecraft')}" autocomplete="off" spellcheck="false"><button class="btn primary" id="dt-give">${icon('gift')}${t('Dar')}</button></div>
                  <span class="help">${t('Puedes poner varios nombres separados por comas.')}</span></div>` : ''}
                <div class="bdg-hh"><b>${t('Quién la tiene')}</b><span class="grow"></span><small>${d.list.length}</small></div>
                <div class="bdg-list">${d.list.map(p => html`<div class="bdg-li"><span class="g-head"><span>${initials(p.name)}</span><img src="https://mc-heads.net/avatar/${encodeURIComponent(p.name)}/28" alt="" loading="lazy" onerror="this.remove()"></span>
                  <b>${esc(p.name)}</b><span class="badge ${p.via === 'auto' ? 'mute' : 'ok'}">${p.via === 'auto' ? t('Sola') : t('A mano')}</span><span class="grow"></span><small>${esc(timeAgo(p.at))}</small>
                  ${can('editor') && p.via !== 'auto' ? `<button class="btn ghost icon sm" data-q="${esc(p.name)}" title="${t('Quitar')}">${icon('x')}</button>` : ''}</div>`).join('') || `<p class="help">${t('Nadie la tiene todavía.')}</p>`}</div>
              </div></div>`;
          $$('[data-x]', m).forEach(x => { x.onclick = close; });
          const ed = $('#dt-edit', m);
          if (ed) ed.onclick = () => { close(); editor(data.badges.find(x => x.id === d.id)); };
          const give = $('#dt-give', m), names = $('#dt-names', m);
          if (give) {
            names.onkeydown = (e) => { if (e.key === 'Enter') give.click(); };
            give.onclick = async () => {
              if (!names.value.trim()) return names.focus();
              busy(give, true);
              try { const nd = await sapi('POST', `/badges/${d.id}/grant`, { names: names.value }); toast(t('Insignia dada')); refreshList(nd); } catch (e) { fail(e); busy(give, false); }
            };
            setTimeout(() => names.focus(), 40);
          }
          $$('[data-q]', m).forEach(q => { q.onclick = async () => { try { refreshList(await sapi('DELETE', `/badges/${d.id}/grant`, { names: q.dataset.q })); } catch (e) { fail(e); } }; });
        };
        const refreshList = async (nd) => { paint(nd); data = await sapi('GET', '/badges'); draw(); };
        m.innerHTML = `<div class="mb"><div class="skel" style="height:260px"></div></div>`;
        try { paint(await sapi('GET', `/badges/${b.id}`)); } catch (e) { fail(e); close(); }
      }, { wide: true });
    }

    draw();
  };
})();
