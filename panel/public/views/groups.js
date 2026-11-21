// Grupos de jugadores (#/groups): «VIP», «Testers», «Equipo rojo»… Cada instancia elige qué grupos
// pueden entrar (Instancia → Acceso → Grupos con acceso). Meter o sacar a alguien del grupo le da o le quita el acceso.
(function () {
  const V = window.Views;
  const head = (name) => `<span class="pl-head" style="--s:30px"><span>${initials(name)}</span><img src="https://mc-heads.net/avatar/${encodeURIComponent(name)}/60" alt="" loading="lazy" onerror="this.remove()"></span>`;

  V.groups = async (view) => {
    view.innerHTML = `<div class="page"><div class="skel" style="height:360px"></div></div>`;
    let data;
    try { data = await sapi('GET', '/groups'); } catch (e) { view.innerHTML = `<div class="page"><div class="card empty"><h4>${esc(e.message)}</h4></div></div>`; return; }
    const reload = async () => { data = await sapi('GET', '/groups'); draw(); };

    function draw() {
      view.innerHTML = html`<div class="page gr-page">
        <div class="page-head"><div><h1>${t('Grupos de jugadores')}</h1><p>${t('Junta jugadores en grupos y da acceso a tus instancias por grupo: sin códigos ni listas.')}</p></div>
          <span class="grow"></span>${can('editor') ? `<button class="btn primary" id="gr-new">${icon('plus')}${t('Nuevo grupo')}</button>` : ''}</div>
        ${data.groups.length ? html`<div class="gr-grid">${data.groups.map(g => html`<button class="card gr-card" data-g="${esc(g.id)}" style="--gc:${esc(g.color)}">
            <span class="gr-dot"></span>
            <b>${esc(g.name)}</b>
            <span class="gr-n">${g.members === 1 ? t('1 jugador') : t('{n} jugadores', { n: g.members.toLocaleString(I18N.locale()) })}</span>
            <span class="gr-in">${g.instances.length ? `${icon('key')}${esc(t('Acceso a {i}', { i: g.instances.map(i => i.name).join(', ') }))}` : `<span class="muted">${t('Ninguna instancia le da acceso todavía')}</span>`}</span>
          </button>`).join('')}</div>`
          : html`<div class="card empty gr-empty"><div class="gr-demo">${data.colors.slice(0, 4).map((c, n) => `<span style="--gc:${c}">${esc(['VIP', 'Testers', 'Equipo rojo', 'Equipo azul'][n])}</span>`).join('')}</div>
              <h4>${t('Todavía no hay grupos')}</h4><p>${t('Por ejemplo: un grupo «Testers» que entra a la instancia de pruebas, o un «Equipo rojo» y un «Equipo azul» para un evento.')}</p>
              ${can('editor') ? `<button class="btn primary" id="gr-new2">${icon('plus')}${t('Nuevo grupo')}</button>` : ''}</div>`}
        <p class="help gr-help">${icon('info')}<span>${t('Para que un grupo entre a una instancia: Instancia → Acceso → Grupos con acceso.')}</span></p>
      </div>`;
      [$('#gr-new', view), $('#gr-new2', view)].forEach(b => { if (b) b.onclick = () => editGroup(null); });
      $$('[data-g]', view).forEach(b => { b.onclick = () => detail(data.groups.find(g => g.id === b.dataset.g)); });
    }

    // Crear o cambiar nombre y color
    function editGroup(g) {
      const f = g ? { name: g.name, color: g.color } : { name: '', color: data.colors[data.groups.length % data.colors.length], names: '' };
      modal((m, close) => {
        m.innerHTML = html`<div class="mh"><h3>${icon('users')}${g ? t('Editar grupo') : t('Nuevo grupo')}</h3><button class="btn ghost icon sm" data-x>${icon('x')}</button></div>
          <div class="mb" style="display:grid;gap:14px">
            <label class="field"><span class="label">${t('Nombre')}</span><input class="input" id="gn" maxlength="32" value="${esc(f.name)}" placeholder="${t('VIP, Testers, Equipo rojo…')}"></label>
            <div class="field"><span class="label">${t('Color')}</span><div class="gr-colors">${data.colors.map(c => `<button class="${f.color === c ? 'on' : ''}" data-c="${c}" style="background:${c}"></button>`).join('')}</div></div>
            ${g ? '' : `<label class="field"><span class="label">${t('Jugadores (opcional)')}</span><textarea class="input" id="gm" rows="3" placeholder="${t('Nombres de Minecraft separados por comas')}"></textarea></label>`}
          </div>
          <div class="mf">${g && can('editor') ? `<button class="btn danger" id="gdel">${icon('trash')}${t('Borrar')}</button><span class="grow"></span>` : ''}<button class="btn" data-x>${t('Cancelar')}</button><button class="btn primary" id="gok">${icon('check')}${t('Guardar')}</button></div>`;
        $$('[data-x]', m).forEach(x => { x.onclick = close; });
        $$('[data-c]', m).forEach(b => { b.onclick = () => { f.color = b.dataset.c; $$('[data-c]', m).forEach(x => x.classList.toggle('on', x === b)); }; });
        setTimeout(() => $('#gn', m).focus(), 30);
        $('#gok', m).onclick = async (e) => {
          busy(e.currentTarget, true);
          try {
            const body = { name: $('#gn', m).value, color: f.color };
            if (!g) body.names = ($('#gm', m).value || '').trim();
            const saved = g ? await sapi('PATCH', `/groups/${g.id}`, body) : await sapi('POST', '/groups', body);
            close(); await reload(); toast(g ? t('Grupo guardado') : t('Grupo creado'));
            if (!g) detail(data.groups.find(x => x.id === saved.id));
          } catch (err) { busy(e.currentTarget, false); fail(err); }
        };
        const del = $('#gdel', m);
        if (del) del.onclick = async () => {
          if (!(await confirmBox({ title: t('¿Borrar el grupo «{n}»?', { n: g.name }), text: t('Sus jugadores pierden el acceso que les daba el grupo.'), ok: t('Borrar'), danger: true, ico: 'trash' }))) return;
          try { await sapi('DELETE', `/groups/${g.id}`); close(); await reload(); toast(t('Grupo borrado')); } catch (err) { fail(err); }
        };
      });
    }

    // Quién está en el grupo: añadir varios de una vez y quitar
    function detail(g) {
      modal(async (m, close) => {
        let q = '';
        const paint = (d) => {
          const list = d.list.filter(p => !q || p.name.toLowerCase().includes(q));
          m.innerHTML = html`<div class="mh"><h3><span class="gr-dot" style="--gc:${esc(d.color)}"></span>${esc(d.name)}<span class="badge mute">${d.members}</span></h3>
              ${can('editor') ? `<button class="btn ghost sm" id="ged">${icon('edit')}${t('Editar')}</button>` : ''}<button class="btn ghost icon sm" data-x>${icon('x')}</button></div>
            <div class="mb gr-det">
              <p class="help" style="margin:0">${d.instances.length ? esc(t('Este grupo da acceso a: {i}', { i: d.instances.map(i => i.name).join(', ') })) : t('Ninguna instancia le da acceso todavía. Actívalo en Instancia → Acceso.')}</p>
              ${can('editor') ? html`<div class="gr-add"><input class="input" id="gadd" placeholder="${t('Añadir jugadores (puedes pegar varios separados por comas)')}" autocomplete="off" spellcheck="false"><button class="btn primary" id="gaddb">${icon('plus')}${t('Añadir')}</button></div>` : ''}
              ${d.list.length > 8 ? `<label class="gr-find">${icon('search')}<input class="input" id="gq" placeholder="${t('Buscar en el grupo…')}" value="${esc(q)}"></label>` : ''}
              <div class="gr-list">${list.map(p => html`<div class="gr-li">${head(p.name)}<a href="#/players/${encodeURIComponent(p.name)}"><b>${esc(p.name)}</b></a>
                  <small>${p.last ? esc(t('Jugó {t}', { t: timeAgo(p.last) })) : esc(t('Aún no ha jugado'))}</small>
                  ${can('editor') ? `<button class="btn ghost icon sm" data-rm="${esc(p.name)}" title="${t('Sacar del grupo')}">${icon('x')}</button>` : ''}</div>`).join('') || `<p class="help">${d.list.length ? t('Nadie coincide.') : t('El grupo está vacío.')}</p>`}</div>
            </div>`;
          $$('[data-x]', m).forEach(x => { x.onclick = () => { close(); reload(); }; });
          $$('.gr-li a', m).forEach(a => { a.addEventListener('click', () => close()); }); // ir a la ficha cierra la ventana
          const ed = $('#ged', m); if (ed) ed.onclick = () => { close(); editGroup(data.groups.find(x => x.id === d.id) || d); };
          const qi = $('#gq', m);
          if (qi) qi.oninput = () => { q = qi.value.trim().toLowerCase(); const pos = qi.selectionStart; paint(d); const n = $('#gq', m); n.focus(); n.setSelectionRange(pos, pos); };
          const add = $('#gaddb', m), inp = $('#gadd', m);
          if (add) {
            inp.onkeydown = (e) => { if (e.key === 'Enter') add.click(); };
            add.onclick = async () => {
              if (!inp.value.trim()) return inp.focus();
              busy(add, true);
              try { const r = await sapi('POST', `/groups/${d.id}/members`, { names: inp.value }); toast(r.added === 1 ? t('1 jugador añadido') : t('{n} jugadores añadidos', { n: r.added })); paint(await sapi('GET', `/groups/${d.id}`)); $('#gadd', m).focus(); }
              catch (err) { busy(add, false); fail(err); }
            };
          }
          $$('[data-rm]', m).forEach(b => { b.onclick = async () => { busy(b, true); try { await sapi('DELETE', `/groups/${d.id}/members/${encodeURIComponent(b.dataset.rm)}`); paint(await sapi('GET', `/groups/${d.id}`)); } catch (err) { busy(b, false); fail(err); } }; });
        };
        m.innerHTML = `<div class="mb"><div class="skel" style="height:240px"></div></div>`;
        try { paint(await sapi('GET', `/groups/${g.id}`)); } catch (e) { fail(e); close(); }
      }, { wide: true });
    }

    draw();
  };

  // Para otras páginas (Acceso de la instancia, ficha del jugador)
  V.groupChip = (g) => `<span class="gr-chip" style="--gc:${esc(g.color)}"><i></i>${esc(g.name)}</span>`;
})();
