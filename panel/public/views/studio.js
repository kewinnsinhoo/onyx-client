// Equipo, Papelera, Ajustes, Launchers, Histórico y Referidos.
(function () {
  const V = window.Views;
  const avatar = (u, round = true) => `<span class="av ${round ? 'round' : ''}">${u.avatar ? `<img src="${esc(u.avatar)}" alt="">` : initials(u.name)}</span>`;
  const head = (title, sub, actions = '') => html`<div class="page-head"><div><h1>${title}</h1>${sub ? `<p>${sub}</p>` : ''}</div><span class="grow"></span>${actions}</div>`;
  const inviteUrl = (tk) => `${location.origin}/#/invite/${tk}`;

  // ---------------------------------------------------------------- Equipo
  V.team = async (view) => {
    const [mem, inv] = await Promise.all([sapi('GET', '/members'), can('admin') ? sapi('GET', '/invites') : Promise.resolve({ invites: [] })]);
    const ROLE_HELP = { owner: 'Todo, incluido gestionar dueños', admin: 'Todo menos cambiar dueños: equipo, baneos y papelera', editor: 'Crear y editar instancias, códigos y eventos', viewer: 'Solo ver' };
    view.innerHTML = html`<div class="page">${head(t('Equipo'), t('Las personas que gestionan {studio} en el panel.', { studio: esc(S.studio.name) }),
      can('admin') ? `<button class="btn primary" id="inv">${icon('plus')}${t('Invitar a alguien')}</button>` : '')}
      <div class="card"><h3>${icon('users')}${t('Miembros')}<span class="badge mute">${mem.members.length}</span></h3>
        <div style="margin-top:10px">${mem.members.map(m => html`<div class="list-row">${avatar(m)}
          <span class="grow"><b>${esc(m.name)}</b>${m.global_role === 'creator' ? ` <span class="badge">${icon('crown')}${t('Creador')}</span>` : ''}<br><small style="color:var(--muted)">${t('Desde el {d}', { d: fmtDate(m.added_at, { day: 'numeric', month: 'long', year: 'numeric' }) })}</small></span>
          ${can('admin') && m.user_id !== S.me.user.id ? html`<select class="input" data-role="${esc(m.user_id)}" style="width:160px">${['owner', 'admin', 'editor', 'viewer'].filter(r => r !== 'owner' || S.studio.role === 'owner').map(r => `<option value="${r}" ${m.role === r ? 'selected' : ''}>${roleName(r)}</option>`).join('')}</select>
            <button class="btn icon ghost" data-rm="${esc(m.user_id)}" title="${t('Quitar del studio')}">${icon('trash')}</button>` : `<span class="badge mute">${roleName(m.role)}</span>`}</div>`).join('')}</div></div>
      ${can('admin') ? html`<div class="card"><h3>${icon('link')}${t('Invitaciones pendientes')}</h3><p class="sub">${t('Cada enlace sirve una vez y caduca a los 7 días.')}</p>
        <div style="margin-top:10px">${inv.invites.length ? inv.invites.map(i => html`<div class="list-row"><span class="av">${icon('link')}</span>
          <span class="grow"><b>${roleName(i.role)}</b><br><small class="mono" style="color:var(--muted)">${esc(inviteUrl(i.token))}</small></span>
          <small style="color:var(--faint)">${t('Caduca {d}', { d: fmtDate(i.expires_at) })}</small>
          <button class="btn sm" data-cp="${esc(i.token)}">${icon('copy')}${t('Copiar')}</button><button class="btn sm icon ghost" data-del="${esc(i.token)}">${icon('trash')}</button></div>`).join('')
          : `<p class="help" style="margin:0">${t('No hay invitaciones pendientes.')}</p>`}</div></div>` : ''}
      <div class="card"><h3>${icon('shield')}${t('Qué puede hacer cada rol')}</h3><div class="kv" style="margin-top:14px;grid-template-columns:repeat(auto-fit,minmax(170px,1fr))">
        ${['owner', 'admin', 'editor', 'viewer'].map(r => `<div><small>${roleName(r)}</small><b style="font-weight:500">${t(ROLE_HELP[r])}</b></div>`).join('')}</div></div></div>`;
    $$('[data-role]', view).forEach(s => s.onchange = async () => { try { await sapi('PATCH', `/members/${s.dataset.role}`, { role: s.value }); toast(t('Rol actualizado')); } catch (e) { fail(e); V.team(view); } });
    $$('[data-rm]', view).forEach(b => b.onclick = async () => { if (await confirmBox({ title: t('¿Quitar del studio?'), text: t('Perderá el acceso al panel de este studio.'), ok: t('Quitar'), danger: true })) { try { await sapi('DELETE', `/members/${b.dataset.rm}`); V.team(view); } catch (e) { fail(e); } } });
    $$('[data-cp]', view).forEach(b => b.onclick = () => copy(inviteUrl(b.dataset.cp)));
    $$('[data-del]', view).forEach(b => b.onclick = async () => { try { await sapi('DELETE', `/invites/${b.dataset.del}`); V.team(view); } catch (e) { fail(e); } });
    const inv2 = $('#inv', view);
    if (inv2) inv2.onclick = () => modal((m, close) => {
      let role = 'editor';
      m.innerHTML = html`<div class="mh"><h3>${icon('users')}${t('Invitar a alguien')}</h3></div><div class="mb">
        <p style="margin:0 0 14px">${t('Crea un enlace y envíaselo. La persona lo abre, entra con Discord y queda dentro del studio.')}</p>
        <div style="display:grid;gap:8px">${['admin', 'editor', 'viewer'].map(r => `<button class="option ${r === role ? 'on' : ''}" data-r="${r}"><span><b>${roleName(r)}</b><small>${t(ROLE_HELP[r])}</small></span><span class="radio"></span></button>`).join('')}</div>
        <div id="out" style="margin-top:14px"></div></div>
        <div class="mf"><button class="btn" id="no">${t('Cerrar')}</button><button class="btn primary" id="ok">${icon('link')}${t('Crear enlace')}</button></div>`;
      $$('[data-r]', m).forEach(b => b.onclick = () => { role = b.dataset.r; $$('[data-r]', m).forEach(x => x.classList.toggle('on', x === b)); });
      $('#no', m).onclick = () => { close(); V.team(view); };
      $('#ok', m).onclick = async (e) => {
        busy(e.currentTarget, true);
        try { const r = await sapi('POST', '/invites', { role }); $('#out', m).innerHTML = `<div class="code-box"><span class="mono" style="font-size:12.5px;word-break:break-all">${esc(inviteUrl(r.token))}</span><button class="btn sm" id="cp2">${icon('copy')}${t('Copiar')}</button></div>`; $('#cp2', m).onclick = () => copy(inviteUrl(r.token)); copy(inviteUrl(r.token)); }
        catch (err) { fail(err); } finally { busy(e.currentTarget, false); }
      };
    });
  };

  // ---------------------------------------------------------------- Papelera
  V.trash = async (view) => {
    const { items } = await sapi('GET', '/trash');
    view.innerHTML = html`<div class="page">${head(t('Papelera'), t('Instancias eliminadas. Puedes restaurarlas o borrarlas para siempre.'))}
      <div class="card">${items.length ? items.map(i => html`<div class="list-row"><span class="av">${icon('grid')}</span><span class="grow"><b>${esc(i.name)}</b><br><small style="color:var(--muted)">${t('Eliminada {d}', { d: timeAgo(i.deletedAt) })}</small></span>
        ${can('admin') ? `<button class="btn sm" data-res="${esc(i.id)}">${icon('refresh')}${t('Restaurar')}</button><button class="btn sm danger" data-purge="${esc(i.id)}">${icon('trash')}${t('Borrar para siempre')}</button>` : ''}</div>`).join('')
        : `<div class="empty"><div class="ic">${icon('trash')}</div><h4>${t('La papelera está vacía')}</h4></div>`}</div></div>`;
    $$('[data-res]', view).forEach(b => b.onclick = async () => { try { await sapi('POST', `/instances/${encodeURIComponent(b.dataset.res)}/restore`); toast(t('Instancia restaurada')); V.trash(view); } catch (e) { fail(e); } });
    $$('[data-purge]', view).forEach(b => b.onclick = async () => {
      if (!(await confirmBox({ title: t('¿Borrar para siempre?'), text: t('Se borran la instancia, sus códigos, accesos y baneos. No se puede deshacer.'), ok: t('Borrar para siempre'), danger: true, ico: 'trash' }))) return;
      try { await sapi('DELETE', `/instances/${encodeURIComponent(b.dataset.purge)}/purge`); toast(t('Instancia borrada')); V.trash(view); } catch (e) { fail(e); }
    });
  };

  // ---------------------------------------------------------------- Ajustes
  V.settings = async (view) => {
    const u = S.me.user;
    const bans = can('admin') ? await sapi('GET', '/bans') : { bans: [] };
    view.innerHTML = html`<div class="page">${head(t('Ajustes'), t('Tu cuenta, la apariencia y tu studio.'))}
      <div class="card"><div style="display:flex;align-items:center;gap:16px">${avatar(u)}<div style="flex:1"><h3 style="font-size:20px">${esc(u.name)}</h3>
          <div style="color:var(--muted)">${esc(userRoleLine())}</div><small class="mono" style="color:var(--faint)">${esc(u.id)}</small></div>
        <button class="btn danger" id="out">${icon('logout')}${t('Cerrar sesión')}</button></div></div>
      <div class="card"><h3>${icon('sliders')}${t('Ajustes personales')}</h3>
        <div class="set"><div class="t"><b>${t('Tema')}</b></div><div class="seg" id="theme">${[['dark', 'moon', 'Oscuro'], ['light', 'sun', 'Claro'], ['system', 'monitor', 'Sistema']].map(([k, i, l]) => `<button data-v="${k}" class="${Theme.get() === k ? 'on' : ''}">${icon(i)}${t(l)}</button>`).join('')}</div></div>
        <div class="set"><div class="t"><b>${t('Idioma')}</b></div><div class="seg" id="lang">${[['es', 'Español'], ['ca', 'Català'], ['en', 'English'], ['fr', 'Français']].map(([k, l]) => `<button data-v="${k}" class="${I18N.lang() === k ? 'on' : ''}">${l}</button>`).join('')}</div></div>
        <div class="set"><div class="t"><b>${t('Sesión')}</b><small>${t('La sesión dura 30 días en este navegador.')}</small></div></div></div>
      ${can('admin') ? html`<div class="card"><h3>${icon('building')}${t('Studio')}</h3>
        <div class="row" style="margin-top:14px;align-items:end"><div class="field"><span class="label">${t('Nombre del studio')}</span><input class="input" id="sn" maxlength="50" value="${esc(S.studio.name)}"></div>
          <div class="field"><span class="label">${t('Logo')}</span><div style="display:flex;gap:8px"><input class="input" id="sl" placeholder="https://…" value="${esc(S.studio.logo || '')}"><button class="btn" id="slu">${icon('upload')}</button></div></div>
          <button class="btn primary" id="ss" style="width:fit-content">${icon('check')}${t('Guardar')}</button></div></div>
      <div id="usage"></div>
      <div class="card"><h3>${icon('ban')}${t('Baneos de todo el studio')}</h3><p class="sub">${t('Se aplican a todas las instancias del studio.')}</p>
        <div class="row" style="margin-top:14px"><div style="display:flex;gap:8px"><input class="input" id="bn" placeholder="${t('Nombre de jugador')}"><button class="btn danger solid" id="bna">${icon('plus')}${t('Banear')}</button></div>
          <div style="display:flex;gap:8px"><input class="input" id="bi" placeholder="${t('Dirección IP')}"><button class="btn danger solid" id="bia">${icon('plus')}${t('Banear')}</button></div></div>
        <div class="chips" style="margin-top:12px">${bans.bans.length ? bans.bans.map(b => `<span class="chip">${icon(b.kind === 'ip' ? 'globe' : 'user')}${esc(b.value)}<button class="x" data-unban="${esc(b.value)}" data-kind="${b.kind}">${icon('x')}</button></span>`).join('') : `<span class="help">${t('No hay nadie baneado.')}</span>`}</div></div>` : ''}
    </div>`;
    $('#out', view).onclick = async () => { await fetch('/auth/logout', { method: 'POST' }); S.me = null; go('/login'); };
    if ($('#usage', view)) usageCard($('#usage', view)).catch(() => {});
    $$('#theme button', view).forEach(b => b.onclick = () => { Theme.set(b.dataset.v); V.settings(view); });
    $$('#lang button', view).forEach(b => b.onclick = () => { I18N.set(b.dataset.v); rerender(); });
    const ss = $('#ss', view);
    if (ss) {
      ss.onclick = async () => { busy(ss, true); try { await sapi('PATCH', '', { name: $('#sn', view).value, logo: $('#sl', view).value.trim() || null }); S.me = null; toast(t('Cambios guardados')); rerender(); } catch (e) { fail(e); busy(ss, false); } };
      $('#slu', view).onclick = async (e) => { const f = await pickFile('image/*'); if (!f) return; busy(e.currentTarget, true); try { const r = await upload(f); $('#sl', view).value = r.url; } catch (err) { fail(err); } finally { busy(e.currentTarget, false); } };
      const ban = async (kind, input) => { try { await sapi('POST', '/bans', { kind, value: $(input, view).value.trim() }); toast(t('Baneado')); V.settings(view); } catch (e) { fail(e); } };
      $('#bna', view).onclick = () => ban('name', '#bn');
      $('#bia', view).onclick = () => ban('ip', '#bi');
      $$('[data-unban]', view).forEach(b => b.onclick = async () => { try { await sapi('DELETE', `/bans/${encodeURIComponent(b.dataset.unban)}?kind=${b.dataset.kind}`); V.settings(view); } catch (e) { fail(e); } });
    }
  };

  // ---------------------------------------------------------------- Histórico
  V.history = async (view) => {
    const h = await sapi('GET', '/history');
    view.innerHTML = html`<div class="page">${head(t('Histórico'), t('Quién ha jugado, cuántas partidas y en qué instancia.'))}
      <div class="grid g3"><div class="card stat"><span class="k"><i>${icon('activity')}</i>${t('Partidas')}</span><span class="v">${h.plays}</span><span class="s">${t('Últimos 90 días')}</span></div>
        <div class="card stat" style="margin:0"><span class="k"><i>${icon('users')}</i>${t('Jugadores distintos')}</span><span class="v">${h.players}</span><span class="s">${t('Últimos 90 días')}</span></div>
        <div class="card stat" style="margin:0"><span class="k"><i>${icon('star')}</i>${t('Récord a la vez')}</span><span class="v">${h.topDays[0] ? h.topDays[0].peak : 0}</span><span class="s">${h.topDays[0] ? esc(h.topDays[0].instance) : '—'}</span></div></div>
      <div class="card" style="margin-top:16px"><div class="card-head"><h3>${icon('activity')}${t('Jugadores a la vez')}</h3><span class="grow"></span><small style="color:var(--muted)">${t('Últimos 30 días')}</small></div>${areaChart(h.chart)}</div>
      <div class="grid g2" style="margin-top:16px">
        <div class="card" style="margin:0"><h3>${icon('star')}${t('Días con más jugadores a la vez')}</h3><div style="margin-top:8px">
          ${h.topDays.length ? h.topDays.map((d, n) => html`<div class="list-row"><span class="av" style="${n === 0 ? 'background:var(--warn-bg);color:var(--warn)' : ''}">${n + 1}</span>
            <span class="grow"><b>${fmtDate(d.day, { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' })}</b><br><small style="color:var(--muted)">${t('hacia las {h}', { h: new Date(d.at).toLocaleTimeString(I18N.locale(), { hour: '2-digit', minute: '2-digit' }) })} · ${esc(d.instance)}</small></span>
            <span style="text-align:right"><b style="font:800 18px Sora">${d.peak}</b><br><small style="color:var(--faint)">${t('a la vez')}</small></span></div>`).join('') : `<p class="help">${t('Todavía no hay partidas.')}</p>`}</div></div>
        <div class="card" style="margin:0"><h3>${icon('grid')}${t('Récord de cada instancia')}</h3><div style="margin-top:8px">
          ${h.records.length ? h.records.map(r => html`<div class="list-row"><span class="grow"><b>${esc(r.instance)}</b><br><small style="color:var(--muted)">${r.at ? t('Récord: {d}', { d: fmtDateTime(r.at) }) : ''} · ${t('{p} partidas en {d} días', { p: r.plays, d: r.days })}</small></span>
            <span style="text-align:right"><b style="font:800 18px Sora">${r.peak}</b><br><small style="color:var(--faint)">${t('a la vez')}</small></span></div>`).join('') : `<p class="help">${t('Todavía no hay partidas.')}</p>`}</div></div></div></div>`;
  };

  // ---------------------------------------------------------------- Referidos
  V.referrals = async (view) => {
    const r = await sapi('GET', '/referrals');
    view.innerHTML = html`<div class="page">${head(t('Referidos'), t('Jugadores que eligieron a {studio} al instalar el launcher («¿Te ha traído un studio?»).', { studio: esc(S.studio.name) }))}
      <div class="card refcode"><div class="grow"><h3>${icon('link')}${t('Tu código de referido')}</h3><p class="sub">${t('Los jugadores lo escriben en el launcher al instalarlo o en Ajustes → Referidos.')}</p></div>
        <code class="code-big">${esc(S.studio.id.toUpperCase())}</code><button class="btn" id="ref-copy">${icon('copy')}${t('Copiar')}</button></div>
      <div class="grid g2"><div class="card stat" style="margin:0"><span class="k"><i>${icon('link')}</i>${t('Total')}</span><span class="v">${r.total}</span></div>
        <div class="card stat" style="margin:0"><span class="k"><i>${icon('calendar')}</i>${t('Últimos 30 días')}</span><span class="v">${r.month}</span></div></div>
      <div class="grid g2" style="margin-top:16px">
        <div class="card" style="margin:0"><h3>${icon('users')}${t('Últimas vinculaciones')}</h3><div style="margin-top:8px">
          ${r.last.length ? r.last.map(x => `<div class="list-row"><span class="av round">${initials(x.player_name)}</span><span class="grow"><b>${esc(x.player_name)}</b></span><small style="color:var(--muted)">${timeAgo(x.created_at)}</small></div>`).join('')
            : `<p class="help">${t('Todavía nadie ha elegido tu studio.')}</p>`}</div></div>
        <div class="card" style="margin:0"><h3>${icon('star')}${t('Studios con más referidos')}</h3><div style="margin-top:8px">
          ${r.ranking.map((s, n) => `<div class="list-row"><span class="av">${n + 1}</span><span class="grow"><b>${esc(s.name)}</b></span><b>${s.n}</b></div>`).join('')}</div></div></div></div>`;
    $('#ref-copy', view).onclick = () => copy(S.studio.id.toUpperCase());
  };
})();
