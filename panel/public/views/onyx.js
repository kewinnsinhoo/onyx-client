// Herramientas del Creador (Resumen de Kopi, Studios, Usuarios, Jugadores, Avisos, Moderación, Actividad)
// y lo que comparten con los studios: avisos del launcher, registro de actividad y espacio usado.
(function () {
  const V = window.Views;
  const head = (title, sub, actions = '') => html`<div class="page-head"><div><h1>${title}</h1>${sub ? `<p>${sub}</p>` : ''}</div><span class="grow"></span>${actions}</div>`;
  const isCreator = () => S.me && S.me.user.role === 'creator';
  const stat = (ic, k, v, s = '') => html`<div class="card stat" style="margin:0"><span class="k"><i>${icon(ic)}</i>${k}</span><span class="v">${v}</span>${s ? `<span class="s">${s}</span>` : ''}</div>`;
  const num = (n) => Number(n || 0).toLocaleString(I18N.locale());
  const avatar = (u) => `<span class="av round">${u.avatar ? `<img src="${esc(u.avatar)}" alt="">` : initials(u.name || '?')}</span>`;
  const studioAv = (s) => `<span class="av">${s.logo ? `<img src="${esc(s.logo)}" alt="">` : initials(s.name)}</span>`;
  const inviteUrl = (tk) => `${location.origin}/#/invite/${tk}`;
  const dt = (ms) => new Date(ms).toISOString().slice(0, 16);
  const localInput = (ms) => { if (!ms) return ''; const d = new Date(ms); d.setMinutes(d.getMinutes() - d.getTimezoneOffset()); return d.toISOString().slice(0, 16); };
  const fromInput = (v) => (v ? new Date(v).getTime() : null);
  const size0 = (b) => (b ? fmtSize(b) : '0 MB');
  const fmtDur = (ms) => { const h = Math.floor(ms / 3600e3), m = Math.round((ms % 3600e3) / 60e3); return h ? t('{h} h {m} min', { h, m }) : t('{m} min', { m }); };
  void dt;

  // ---------------------------------------------------------------- registro de actividad (compartido)
  const FIELD = { name: 'el nombre', category: 'la categoría', description: 'la descripción', about: 'el texto largo', minecraft: 'la versión', loader: 'el loader', java: 'Java',
    look: 'la personalización', access: 'el acceso', files: 'los archivos', dirs: 'las carpetas', sync: 'la sincronización', schedule: 'el horario', server: 'el servidor', lockedMessage: 'el mensaje de bloqueo' };
  const ACTIONS = {
    'instance.create': ['plus', '{user} creó la instancia {target}'],
    'instance.update': ['edit', '{user} cambió {fields} de {target}'],
    'instance.lock': ['lock', '{user} bloqueó {target}'],
    'instance.unlock': ['unlock', '{user} desbloqueó {target}'],
    'instance.hide': ['eyeOff', '{user} ocultó {target}'],
    'instance.show': ['eye', '{user} volvió a mostrar {target}'],
    'instance.delete': ['trash', '{user} envió {target} a la papelera'],
    'instance.restore': ['refresh', '{user} sacó {target} de la papelera'],
    'instance.purge': ['trash', '{user} borró {target} para siempre'],
    'instance.duplicate': ['copy', '{user} duplicó {from} como {target}'],
    'code.create': ['key', '{user} creó {n} códigos para {target}'],
    'code.delete': ['key', '{user} borró el código {code} de {target}'],
    'access.add': ['users', '{user} dio acceso a {names} en {target}'],
    'access.remove': ['users', '{user} quitó el acceso a {name} en {target}'],
    'ban.add': ['ban', '{user} baneó a {target}'],
    'ban.remove': ['ban', '{user} quitó el baneo a {target}'],
    'member.role': ['users', '{user} cambió el rol de {target} a {role}'],
    'member.remove': ['users', '{user} sacó a {target} del equipo'],
    'invite.create': ['link', '{user} creó una invitación de {role}'],
    'invite.accept': ['users', '{user} entró al studio como {role}'],
    'studio.create': ['building', '{user} creó el studio {target}'],
    'studio.update': ['settings', '{user} cambió los ajustes del studio'],
    'studio.rename': ['edit', '{user} renombró el studio a {target}'],
    'studio.suspend': ['ban', '{user} suspendió el studio {target}'],
    'studio.unsuspend': ['check', '{user} reactivó el studio {target}'],
    'studio.limits': ['sliders', '{user} cambió los límites de {target}'],
    'studio.delete': ['trash', '{user} borró el studio {target}'],
    'storage.clean': ['hardDrive', '{user} liberó {size} de archivos sin usar'],
    'event.create': ['calendar', '{user} creó el evento {target}'],
    'event.update': ['calendar', '{user} editó el evento {target}'],
    'event.delete': ['calendar', '{user} borró el evento {target}'],
    'notice.create': ['megaphone', '{user} publicó el aviso {target}'],
    'notice.update': ['megaphone', '{user} editó el aviso {target}'],
    'notice.delete': ['megaphone', '{user} borró el aviso {target}'],
    'user.block': ['ban', '{user} bloqueó a {target} en el panel'],
    'user.unblock': ['check', '{user} desbloqueó a {target} en el panel'],
    'user.logout': ['logout', '{user} cerró las sesiones de {target}'],
    'ban.global': ['shield', '{user} baneó a {target} en todo Kopi'],
    'unban.global': ['shield', '{user} quitó el baneo global a {target}'],
    'maintenance.on': ['wrench', '{user} activó el modo mantenimiento'],
    'maintenance.off': ['wrench', '{user} desactivó el modo mantenimiento'],
    'brand.allow': ['rocket', '{user} activó el launcher propio de {target}'],
    'brand.deny': ['rocket', '{user} quitó el launcher propio de {target}'],
    'brand.create': ['rocket', '{user} creó el launcher {target}'],
    'brand.update': ['rocket', '{user} cambió el launcher {target}'],
    'brand.build': ['rocket', '{user} mandó compilar el launcher {target}'],
    'brand.rebuild': ['rocket', '{user} mandó recompilar todos los launchers de marca'],
    'cape.give': ['gift', '{user} regaló la capa {target} a {names}'],
    'guard.sanction': ['ban', '{user} sancionó a {target} (KopiGuard)'],
    'guard.kick': ['logout', '{user} expulsó a {target} (KopiGuard)'],
    'cape.take': ['sparkles', '{user} quitó la capa {target} a {name}']
  };
  window.activityText = (a) => {
    let [ic, tpl] = ACTIONS[a.action] || ['activity', a.action];
    if (a.action === 'code.create' && (!a.detail || (a.detail.n || 1) === 1)) tpl = '{user} creó un código para {target}';
    const d = a.detail || {};
    const b = (x) => `<b>${esc(x)}</b>`;
    const vars = {
      user: b(a.user_name || t('Alguien')), target: b(a.action.startsWith('cape.') ? t(a.target || '') : (a.target || '')), from: b(d.from || ''), n: d.n || 1, code: b(d.code || ''),
      names: b((d.names || []).join(', ') + (d.n > (d.names || []).length ? '…' : '')), name: b(d.name || ''),
      role: b(roleName(d.role || '')), size: b(fmtSize(d.bytes || 0)),
      fields: b((d.fields || []).map(f => t(FIELD[f] || f)).join(', ') || t('algo'))
    };
    return { ic, html: t(tpl).replace(/\{(\w+)\}/g, (_, k) => (k in vars ? vars[k] : '')) };
  };
  window.activityList = (items, { studio = false } = {}) => items.length
    ? items.map(a => { const x = activityText(a); return html`<div class="act"><span class="ic">${icon(x.ic)}</span>
        <div class="grow"><p>${x.html}</p><small>${esc(fmtDateTime(a.at))}${studio && a.studio_name ? ` · ${esc(a.studio_name)}` : ''}</small></div></div>`; }).join('')
    : `<p class="help" style="margin:8px 0">${t('Todavía no hay actividad.')}</p>`;

  async function activityPage(view, { global }) {
    let q = '', studio = '', items = [], next = null;
    const studios = global ? (await api('GET', '/onyx/studios')).studios : [];
    const load = async (more) => {
      const params = new URLSearchParams();
      if (q) params.set('q', q);
      if (studio) params.set('studio', studio);
      if (more && next) params.set('before', next);
      const r = global ? await api('GET', '/onyx/audit?' + params) : await sapi('GET', '/activity?' + params);
      items = more ? items.concat(r.items) : r.items; next = r.next;
      $('#act', view).innerHTML = activityList(items, { studio: global });
      $('#more', view).hidden = !next;
    };
    view.innerHTML = html`<div class="page">${head(t('Actividad'), global ? t('Todo lo que pasa en Kopi: quién cambió qué y cuándo. Se guarda 180 días.') : t('Quién del equipo cambió qué y cuándo. Se guarda 180 días.'))}
      <div class="card"><div class="row" style="align-items:end">
        <div class="field"><span class="label">${t('Buscar')}</span><input class="input" id="q" placeholder="${t('Persona, instancia, jugador…')}"></div>
        ${global ? html`<div class="field"><span class="label">${t('Studio')}</span><select class="input" id="st"><option value="">${t('Todos')}</option>${studios.map(s => `<option value="${esc(s.id)}">${esc(s.name)}</option>`).join('')}</select></div>` : ''}
      </div>
      <div id="act" style="margin-top:10px"></div>
      <button class="btn" id="more" hidden style="margin-top:12px">${t('Ver más')}</button></div></div>`;
    let timer;
    $('#q', view).oninput = (e) => { clearTimeout(timer); timer = setTimeout(() => { q = e.target.value.trim(); load(); }, 300); };
    if (global) $('#st', view).onchange = (e) => { studio = e.target.value; load(); };
    $('#more', view).onclick = () => load(true);
    await load();
  }
  V.activity = (view) => can('admin') ? activityPage(view, { global: false }) : V.notFound(view);
  V.audit = (view) => isCreator() ? activityPage(view, { global: true }) : V.notFound(view);

  // ---------------------------------------------------------------- avisos del launcher (compartido)
  const KINDS = [['info', 'Información', 'info'], ['success', 'Novedad', 'sparkles'], ['event', 'Evento', 'calendar'], ['warn', 'Importante', 'alert']];
  const kindBadge = (k) => { const x = KINDS.find(y => y[0] === k) || KINDS[0]; return `<span class="badge nk-${esc(x[0])}">${icon(x[2])}${t(x[1])}</span>`; };
  function noticeState(n) {
    const now = Date.now();
    if (n.starts_at > now) return `<span class="badge warn">${icon('clock')}${t('Programado')}</span>`;
    if (n.ends_at && n.ends_at <= now) return `<span class="badge mute">${t('Terminado')}</span>`;
    return `<span class="badge ok"><span class="dot"></span>${t('Visible')}</span>`;
  }
  async function noticesPage(view, { global }) {
    const get = () => (global ? api('GET', '/onyx/notices') : sapi('GET', '/notices'));
    const studios = global ? (await api('GET', '/onyx/studios')).studios : [];
    const { notices } = await get();
    const editable = global || can('admin');
    view.innerHTML = html`<div class="page">${head(global ? t('Avisos del launcher') : t('Avisos'),
      global ? t('Mensajes que salen en la campana del launcher. Puedes enviarlos a todo Kopi o solo a los jugadores de un studio.') : t('Mensajes que salen en la campana del launcher de los jugadores que tienen alguna instancia de {studio}.', { studio: esc(S.studio.name) }),
      editable ? `<button class="btn primary" id="new">${icon('plus')}${t('Nuevo aviso')}</button>` : '')}
      <div class="card">${notices.length ? html`<div>${notices.map(n => html`<div class="list-row notice-row">
          <span class="grow" style="min-width:0"><b>${esc(n.title)}</b> ${kindBadge(n.kind)} ${noticeState(n)}
            ${n.body ? `<br><small style="color:var(--muted)">${esc(n.body)}</small>` : ''}
            <br><small style="color:var(--faint)">${global ? `${n.studio_id ? t('Para los jugadores de {s}', { s: esc(n.studio_name || n.studio_id) }) : t('Para todo Kopi')} · ` : ''}${esc(fmtDateTime(n.starts_at))}${n.ends_at ? ` → ${esc(fmtDateTime(n.ends_at))}` : ''}${n.by_name ? ` · ${esc(n.by_name)}` : ''}</small></span>
          ${editable ? `<button class="btn sm" data-edit="${esc(n.id)}">${icon('edit')}${t('Editar')}</button><button class="btn sm icon ghost" data-del="${esc(n.id)}">${icon('trash')}</button>` : ''}</div>`).join('')}</div>`
        : html`<div class="empty"><div class="ic">${icon('megaphone')}</div><h4>${t('Sin avisos')}</h4><p>${t('Publica novedades, eventos o cambios importantes y los jugadores los verán en el launcher.')}</p></div>`}</div></div>`;
    const reload = () => noticesPage(view, { global });
    const open = (n = {}) => modal((m, close) => {
      let kind = n.kind || 'info';
      m.innerHTML = html`<div class="mh"><h3>${icon('megaphone')}${n.id ? t('Editar aviso') : t('Nuevo aviso')}</h3></div><div class="mb">
        <div class="field"><span class="label">${t('Título')}</span><input class="input" id="ti" maxlength="90" value="${esc(n.title || '')}" placeholder="${t('Ej.: Mañana empieza IGNITE 4')}"></div>
        <div class="field"><span class="label">${t('Texto (opcional)')}</span><textarea class="input" id="bo" rows="3" maxlength="500">${esc(n.body || '')}</textarea></div>
        <div class="field"><span class="label">${t('Tipo')}</span><div class="seg" id="kd">${KINDS.map(([k, l]) => `<button data-k="${k}" class="${k === kind ? 'on' : ''}">${t(l)}</button>`).join('')}</div></div>
        <div class="field"><span class="label">${t('Enlace al pulsar (opcional)')}</span><input class="input" id="ur" value="${esc(n.url || '')}" placeholder="https://"></div>
        <div class="row"><div class="field"><span class="label">${t('Se muestra desde')}</span><input class="input" type="datetime-local" id="st" value="${esc(localInput(n.starts_at || Date.now()))}"></div>
          <div class="field"><span class="label">${t('Hasta (vacío = siempre)')}</span><input class="input" type="datetime-local" id="en" value="${esc(localInput(n.ends_at))}"></div></div>
        ${global ? html`<div class="field"><span class="label">${t('Quién lo ve')}</span><select class="input" id="au"><option value="all">${t('Todos los jugadores de Kopi')}</option>
          ${studios.map(s => `<option value="${esc(s.id)}" ${n.studio_id === s.id ? 'selected' : ''}>${t('Jugadores de {s}', { s: esc(s.name) })}</option>`).join('')}</select></div>` : ''}
        </div>
        <div class="mf"><button class="btn" id="no">${t('Cancelar')}</button><button class="btn primary" id="ok">${icon('check')}${n.id ? t('Guardar') : t('Publicar')}</button></div>`;
      $$('[data-k]', m).forEach(b => b.onclick = () => { kind = b.dataset.k; $$('[data-k]', m).forEach(x => x.classList.toggle('on', x === b)); });
      $('#no', m).onclick = close;
      $('#ok', m).onclick = async (e) => {
        const body = { title: $('#ti', m).value, body: $('#bo', m).value, kind, url: $('#ur', m).value.trim(), startsAt: fromInput($('#st', m).value) || Date.now(), endsAt: fromInput($('#en', m).value) };
        if (global) body.audience = $('#au', m).value;
        busy(e.currentTarget, true);
        try {
          if (global) await api(n.id ? 'PATCH' : 'POST', `/onyx/notices${n.id ? '/' + n.id : ''}`, body);
          else await sapi(n.id ? 'PATCH' : 'POST', `/notices${n.id ? '/' + n.id : ''}`, body);
          close(); toast(n.id ? t('Aviso guardado') : t('Aviso publicado')); reload();
        } catch (err) { fail(err); busy(e.currentTarget, false); }
      };
    });
    const nb = $('#new', view); if (nb) nb.onclick = () => open();
    $$('[data-edit]', view).forEach(b => b.onclick = () => open(notices.find(n => n.id === b.dataset.edit)));
    $$('[data-del]', view).forEach(b => b.onclick = async () => {
      if (!(await confirmBox({ title: t('¿Borrar el aviso?'), text: t('Dejará de salir en el launcher.'), ok: t('Borrar'), danger: true, ico: 'trash' }))) return;
      try { if (global) await api('DELETE', `/onyx/notices/${b.dataset.del}`); else await sapi('DELETE', `/notices/${b.dataset.del}`); reload(); } catch (e) { fail(e); }
    });
  }
  V.notices = (view) => noticesPage(view, { global: false });
  V.broadcast = (view) => isCreator() ? noticesPage(view, { global: true }) : V.notFound(view);

  // ---------------------------------------------------------------- Resumen de Kopi
  V.onyx = async (view) => {
    if (!isCreator()) return V.notFound(view);
    const o = await api('GET', '/onyx/overview');
    view.innerHTML = html`<div class="page">${head(t('Resumen de Kopi'), t('Cómo va toda la plataforma: todos los studios, instancias y jugadores.'),
      `<a class="btn" href="#/studios">${icon('building')}${t('Studios')}</a><a class="btn primary" href="#/broadcast">${icon('megaphone')}${t('Enviar un aviso')}</a>`)}
      ${o.maintenance.on ? html`<div class="note warn" style="margin-bottom:16px">${icon('wrench')}<span>${t('Modo mantenimiento activado: nadie puede jugar salvo el staff de cada instancia.')} <a href="#/moderation"><b>${t('Desactivar')}</b></a></span></div>` : ''}
      <div class="grid g4">
        ${stat('activity', t('Jugando ahora'), num(o.playingNow), t('{n} partidas en 24 h', { n: num(o.plays24h) }))}
        ${stat('users', t('Jugadores'), num(o.players30), t('distintos en 30 días'))}
        ${stat('grid', t('Instancias'), num(o.instances), t('{n} abiertas', { n: num(o.openInstances) }))}
        ${stat('building', t('Studios'), num(o.studios), o.suspended ? t('{n} suspendidos', { n: o.suspended }) : t('todos activos'))}
      </div>
      <div class="grid g4" style="margin-top:16px">
        ${stat('key', t('Códigos canjeados'), num(o.redeemed), t('{n} códigos creados', { n: num(o.codes) }))}
        ${stat('user', t('Con acceso'), num(o.playersWithAccess), t('jugadores con alguna instancia'))}
        ${stat('shield', t('Gente en el panel'), num(o.users), t('{n} entraron en 30 días', { n: num(o.activeUsers) }))}
        ${stat('hardDrive', t('Espacio usado'), size0(o.storage), t('{n} archivos subidos', { n: num(o.files) }))}
      </div>
      <div class="card" style="margin-top:16px"><div class="card-head"><h3>${icon('activity')}${t('Jugadores a la vez en todo Kopi')}</h3><span class="grow"></span>
        <small style="color:var(--muted)">${o.peak.peak ? t('Récord: {n} el {d}', { n: o.peak.peak, d: fmtDate(o.peak.day) }) : t('Últimos 30 días')}</small></div>${areaChart(o.chart)}</div>
      <div class="grid g-main" style="margin-top:16px">
        <div class="card" style="margin:0"><div class="card-head"><h3>${icon('star')}${t('Studios con más jugadores')}</h3><span class="grow"></span><a class="btn sm ghost" href="#/studios">${t('Ver todos')}</a></div>
          <table class="table" style="margin-top:6px"><thead><tr><th>${t('Studio')}</th><th class="r">${t('Jugando')}</th><th class="r">${t('Jugadores 30 d')}</th><th class="r">${t('Instancias')}</th></tr></thead><tbody>
          ${o.top.map(s => html`<tr><td><a href="#/studios/${esc(s.id)}" style="display:flex;gap:10px;align-items:center;color:var(--text)">${studioAv(s)}<b>${esc(s.name)}</b>${s.suspended ? ` <span class="badge bad">${t('Suspendido')}</span>` : ''}</a></td>
            <td class="r">${s.playingNow}</td><td class="r">${num(s.players30)}</td><td class="r">${s.instances}</td></tr>`).join('')}</tbody></table></div>
        <div class="card" style="margin:0"><div class="card-head"><h3>${icon('history')}${t('Última actividad')}</h3><span class="grow"></span><a class="btn sm ghost" href="#/audit">${t('Ver todo')}</a></div>
          <div style="margin-top:6px">${activityList(o.activity, { studio: true })}</div></div>
      </div></div>`;
  };

  // ---------------------------------------------------------------- Studios (lista y ficha)
  V.studios = async (view, r) => {
    if (!isCreator()) return V.notFound(view);
    if (r && r.parts[1]) return studioDetail(view, r.parts[1]);
    const { studios } = await api('GET', '/onyx/studios');
    view.innerHTML = html`<div class="page">${head(t('Studios'), t('Todos los studios de Kopi. Solo tú (Creador) puedes crear, suspender o poner límites.'), `<button class="btn primary" id="new">${icon('plus')}${t('Nuevo studio')}</button>`)}
      <div class="card"><table class="table"><thead><tr><th>${t('Studio')}</th><th>${t('Dueño')}</th><th class="r">${t('Jugando')}</th><th class="r">${t('Jugadores 30 d')}</th><th class="r">${t('Instancias')}</th><th class="r">${t('Espacio')}</th><th></th></tr></thead><tbody>
        ${studios.map(s => html`<tr class="click" data-open="${esc(s.id)}"><td><div style="display:flex;gap:10px;align-items:center">${studioAv(s)}<span><b>${esc(s.name)}</b><br><small style="color:var(--faint)">${t('Desde {d}', { d: fmtDate(s.created_at, { day: 'numeric', month: 'short', year: 'numeric' }) })}</small></span></div></td>
          <td>${s.owners.length ? esc(s.owners.join(', ')) : `<span class="badge warn">${t('Sin dueño')}</span>`}</td>
          <td class="r">${s.playingNow}</td><td class="r">${num(s.players30)}</td>
          <td class="r">${s.instances}${s.maxInstances ? `<small style="color:var(--faint)"> / ${s.maxInstances}</small>` : ''}</td>
          <td class="r">${size0(s.storage)}${s.maxStorageMb ? `<small style="color:var(--faint)"> / ${s.maxStorageMb} MB</small>` : ''}</td>
          <td class="r">${s.suspended ? `<span class="badge bad">${icon('ban')}${t('Suspendido')}</span>` : `<span class="badge ok"><span class="dot"></span>${t('Activo')}</span>`}</td></tr>`).join('')}</tbody></table></div></div>`;
    $$('[data-open]', view).forEach(tr => tr.onclick = () => go('/studios/' + encodeURIComponent(tr.dataset.open)));
    $('#new', view).onclick = () => modal((m, close) => {
      m.innerHTML = html`<div class="mh"><h3>${icon('building')}${t('Nuevo studio')}</h3></div><div class="mb">
        <div class="field"><span class="label">${t('Nombre del studio')}</span><input class="input" id="n" maxlength="50" placeholder="${t('Ej.: Nova Estudios')}"></div>
        <div id="out" style="margin-top:14px"></div></div>
        <div class="mf"><button class="btn" id="no">${t('Cerrar')}</button><button class="btn primary" id="ok">${icon('check')}${t('Crear studio')}</button></div>`;
      $('#no', m).onclick = () => { close(); V.studios(view); };
      $('#ok', m).onclick = async (e) => {
        busy(e.currentTarget, true);
        try {
          const res = await api('POST', '/studios', { name: $('#n', m).value });
          $('#out', m).innerHTML = html`<p style="margin:0 0 8px">${t('Envía este enlace al dueño del studio. Entrará con Discord y quedará como Dueño:')}</p>
            <div class="code-box"><span class="mono" style="font-size:12.5px;word-break:break-all">${esc(inviteUrl(res.invite))}</span><button class="btn sm" id="cp">${icon('copy')}${t('Copiar')}</button></div>`;
          $('#cp', m).onclick = () => copy(inviteUrl(res.invite));
          $('#ok', m).remove();
          S.me = null;
        } catch (err) { fail(err); busy(e.currentTarget, false); }
      };
    });
  };

  async function studioDetail(view, sid) {
    const d = await api('GET', `/onyx/studios/${encodeURIComponent(sid)}`);
    const s = d.studio, u = d.usage;
    const pct = (a, b) => (b ? Math.min(100, Math.round(a / b * 100)) : 0);
    view.innerHTML = html`<div class="page">
      <div class="page-head"><a class="btn icon ghost" href="#/studios">${icon('chevLeft')}</a>${studioAv(s)}<div><h1>${esc(s.name)}</h1>
        <p>${s.suspended ? `<span class="badge bad">${icon('ban')}${t('Suspendido')}</span> ` : ''}${t('Creado el {d}', { d: fmtDate(s.created_at, { day: 'numeric', month: 'long', year: 'numeric' }) })} · <span class="mono">${esc(s.id)}</span></p></div>
        <span class="grow"></span>
        <button class="btn" id="enter">${icon('external')}${t('Entrar al studio')}</button></div>
      <div class="grid g4">
        ${stat('activity', t('Jugando ahora'), s.playingNow)}${stat('users', t('Jugadores 30 d'), num(s.players30), t('{n} partidas', { n: num(s.plays30) }))}
        ${stat('grid', t('Instancias'), u.instances, u.maxInstances ? t('de {n} permitidas', { n: u.maxInstances }) : t('sin límite'))}
        ${stat('hardDrive', t('Espacio'), size0(u.storage), u.maxStorageMb ? t('de {n} MB', { n: u.maxStorageMb }) : t('sin límite'))}
      </div>
      <div class="grid g2" style="margin-top:16px">
        <div class="card" style="margin:0"><h3>${icon('sliders')}${t('Límites')}</h3><p class="sub">${t('Vacío = sin límite. Sirve para repartir el espacio gratis de Cloudflare entre studios.')}</p>
          <div class="row" style="margin-top:14px"><div class="field"><span class="label">${t('Máximo de instancias')}</span><input class="input" type="number" min="1" id="mi" value="${s.maxInstances || ''}" placeholder="∞"></div>
            <div class="field"><span class="label">${t('Espacio máximo (MB)')}</span><input class="input" type="number" min="10" id="ms" value="${s.maxStorageMb || ''}" placeholder="∞"></div></div>
          ${u.maxStorageMb ? `<div class="meter"><i style="width:${pct(u.storage, u.maxStorageMb * 1048576)}%"></i></div>` : ''}
          <div style="display:flex;gap:8px;margin-top:14px;flex-wrap:wrap"><button class="btn primary" id="savel">${icon('check')}${t('Guardar límites')}</button>
            <button class="btn" id="clean" ${d.orphans ? '' : 'disabled'}>${icon('hardDrive')}${d.orphans ? t('Liberar {n} archivos sin usar', { n: d.orphans }) : t('No hay archivos sin usar')}</button></div></div>
        <div class="card" style="margin:0"><h3>${icon('edit')}${t('Nota privada')}</h3><p class="sub">${t('Solo la ves tú. Para apuntar acuerdos, contactos o lo que quieras.')}</p>
          <textarea class="input" id="note" rows="4" maxlength="1000" style="margin-top:12px">${esc(s.note)}</textarea>
          <button class="btn" id="saven" style="margin-top:10px">${icon('check')}${t('Guardar nota')}</button></div>
      </div>
      <div class="grid g2" style="margin-top:16px">
        <div class="card" style="margin:0"><div class="card-head"><h3>${icon('users')}${t('Equipo')}</h3><span class="grow"></span><button class="btn sm" id="owner">${icon('link')}${t('Enlace para un dueño')}</button></div>
          <div style="margin-top:8px">${d.members.length ? d.members.map(m => `<div class="list-row">${avatar(m)}<span class="grow"><b>${esc(m.name)}</b></span><span class="badge mute">${roleName(m.role)}</span></div>`).join('') : `<p class="help">${t('Nadie todavía. Crea un enlace para su dueño.')}</p>`}</div>
          <div id="ownout"></div></div>
        <div class="card" style="margin:0"><div class="card-head"><h3>${icon('rocket')}${t('Launcher propio')}</h3><span class="grow"></span>
            <label class="switch"><input type="checkbox" id="brand" ${s.brandAllowed ? 'checked' : ''}><span></span></label></div>
          <p class="sub">${t('Si lo activas, su equipo puede crear en Launchers un launcher con su nombre, icono y colores, y fabricarlo.')}</p>
          ${s.brandAllowed ? `<a class="btn sm" id="brandgo" style="margin-top:10px">${icon('external')}${t('Ver su launcher')}</a>` : ''}</div>
      </div>
      <div class="grid" style="margin-top:16px">
        <div class="card ${s.suspended ? '' : 'danger-zone'}" style="margin:0"><h3>${icon('ban')}${s.suspended ? t('Studio suspendido') : t('Zona peligrosa')}</h3>
          ${s.suspended ? html`<p class="sub">${t('Motivo: {r}', { r: esc(s.suspendReason || '—') })}</p><p class="sub">${t('Su equipo solo puede mirar el panel y sus instancias no se pueden jugar.')}</p>
            <button class="btn green" id="unsusp" style="margin-top:12px">${icon('check')}${t('Reactivar studio')}</button>`
          : html`<p class="sub">${t('Suspender: el equipo solo puede mirar el panel y nadie puede jugar sus instancias. Se puede deshacer.')}</p>
            <div style="display:flex;gap:8px;margin-top:12px;flex-wrap:wrap"><button class="btn danger" id="susp" ${sid === 'onyx-studios' ? 'disabled' : ''}>${icon('ban')}${t('Suspender')}</button>
            <button class="btn ghost" id="del" ${sid === 'onyx-studios' ? 'disabled' : ''}>${icon('trash')}${t('Borrar studio')}</button></div>`}</div>
      </div></div>`;
    const reload = () => studioDetail(view, sid);
    const patch = async (body, msg) => { try { await api('PATCH', `/onyx/studios/${encodeURIComponent(sid)}`, body); toast(msg); S.me = null; reload(); } catch (e) { fail(e); } };
    $('#enter', view).onclick = () => { try { localStorage.setItem('onyx-studio', sid); } catch { /* nada */ } S.studio = { id: sid }; S.me = null; go('/'); };
    $('#brand', view).onchange = (e) => patch({ brandAllowed: e.target.checked }, e.target.checked ? t('Launcher propio activado') : t('Launcher propio desactivado'));
    const bg = $('#brandgo', view);
    if (bg) bg.onclick = () => { try { localStorage.setItem('onyx-studio', sid); } catch { /* nada */ } S.studio = { id: sid }; S.me = null; go('/launchers'); };
    $('#savel', view).onclick = () => patch({ maxInstances: $('#mi', view).value || null, maxStorageMb: $('#ms', view).value || null }, t('Límites guardados'));
    $('#saven', view).onclick = () => patch({ note: $('#note', view).value }, t('Nota guardada'));
    $('#clean', view).onclick = async (e) => {
      busy(e.currentTarget, true);
      try { const r = await api('POST', `/onyx/studios/${encodeURIComponent(sid)}/clean`); toast(t('Liberados {size}', { size: fmtSize(r.bytes) })); reload(); } catch (err) { fail(err); busy(e.currentTarget, false); }
    };
    $('#owner', view).onclick = async () => {
      try {
        const r = await api('POST', `/onyx/studios/${encodeURIComponent(sid)}/invite`);
        $('#ownout', view).innerHTML = html`<div class="code-box" style="margin-top:12px"><span class="mono" style="font-size:12.5px;word-break:break-all">${esc(inviteUrl(r.token))}</span><button class="btn sm" id="cpo">${icon('copy')}${t('Copiar')}</button></div>`;
        $('#cpo', view).onclick = () => copy(inviteUrl(r.token)); copy(inviteUrl(r.token));
      } catch (e) { fail(e); }
    };
    const un = $('#unsusp', view); if (un) un.onclick = () => patch({ suspended: false }, t('Studio reactivado'));
    const su = $('#susp', view);
    if (su) su.onclick = () => modal((m, close) => {
      m.innerHTML = html`<div class="mh"><h3>${icon('ban')}${t('Suspender {s}', { s: esc(s.name) })}</h3></div><div class="mb">
        <p style="margin:0 0 12px">${t('Su equipo verá el motivo en el panel. Nadie podrá jugar sus instancias hasta que lo reactives.')}</p>
        <div class="field"><span class="label">${t('Motivo')}</span><input class="input" id="rs" maxlength="200" placeholder="${t('Ej.: Incumple las normas de Kopi')}"></div></div>
        <div class="mf"><button class="btn" id="no">${t('Cancelar')}</button><button class="btn danger" id="ok">${icon('ban')}${t('Suspender')}</button></div>`;
      $('#no', m).onclick = close;
      $('#ok', m).onclick = () => { close(); patch({ suspended: true, reason: $('#rs', m).value }, t('Studio suspendido')); };
    });
    const de = $('#del', view);
    if (de) de.onclick = async () => {
      if (!(await confirmBox({ title: t('¿Borrar {s}?', { s: esc(s.name) }), text: t('Sus instancias dejan de funcionar y su equipo pierde el acceso al panel.'), ok: t('Borrar studio'), danger: true, ico: 'trash' }))) return;
      try { await api('DELETE', `/onyx/studios/${encodeURIComponent(sid)}`); toast(t('Studio borrado')); S.me = null; go('/studios'); } catch (e) { fail(e); }
    };
  }

  // ---------------------------------------------------------------- Usuarios del panel
  V.users = async (view) => {
    if (!isCreator()) return V.notFound(view);
    let q = '';
    view.innerHTML = html`<div class="page">${head(t('Usuarios'), t('Todas las personas que han entrado al panel con Discord.'))}
      <div class="card"><label class="fm-search" style="max-width:360px">${icon('search')}<input id="q" placeholder="${t('Nombre o ID de Discord')}"></label>
        <div id="list" style="margin-top:12px"></div></div></div>`;
    const load = async () => {
      const { users } = await api('GET', '/onyx/users' + (q ? '?q=' + encodeURIComponent(q) : ''));
      $('#list', view).innerHTML = users.length ? html`<table class="table"><thead><tr><th>${t('Persona')}</th><th>${t('Studios')}</th><th>${t('Última vez')}</th><th></th></tr></thead><tbody>
        ${users.map(u => html`<tr><td><div style="display:flex;gap:10px;align-items:center">${avatar(u)}<span><b>${esc(u.name)}</b>${u.global_role === 'creator' ? ` <span class="badge">${icon('crown')}${t('Creador')}</span>` : ''}${u.blocked_at ? ` <span class="badge bad">${t('Bloqueado')}</span>` : ''}<br><small class="mono" style="color:var(--faint)">${esc(u.id)}</small></span></div></td>
          <td>${u.studios.length ? u.studios.map(s => `<span class="chip" style="margin:2px">${esc(s.name)} · ${esc(roleName(s.role))}</span>`).join('') : `<small style="color:var(--faint)">${t('Ninguno')}</small>`}</td>
          <td>${u.last_login ? timeAgo(u.last_login) : '—'}</td>
          <td class="r">${u.global_role === 'creator' ? '' : html`<button class="btn sm icon ghost" data-out="${esc(u.id)}" title="${t('Cerrar sus sesiones')}">${icon('logout')}</button>
            ${u.blocked_at ? `<button class="btn sm" data-unblock="${esc(u.id)}">${t('Desbloquear')}</button>` : `<button class="btn sm danger" data-block="${esc(u.id)}">${icon('ban')}${t('Bloquear')}</button>`}`}</td></tr>`).join('')}</tbody></table>`
        : `<p class="help">${t('Nadie coincide.')}</p>`;
      const act = async (id, body, msg, conf) => {
        if (conf && !(await confirmBox(conf))) return;
        try { await api(body ? 'PATCH' : 'DELETE', `/onyx/users/${id}`, body); toast(msg); load(); } catch (e) { fail(e); }
      };
      $$('[data-block]', view).forEach(b => b.onclick = () => act(b.dataset.block, { blocked: true }, t('Usuario bloqueado'), { title: t('¿Bloquear a esta persona?'), text: t('Se cierra su sesión y no podrá volver a entrar al panel hasta que la desbloquees.'), ok: t('Bloquear'), danger: true, ico: 'ban' }));
      $$('[data-unblock]', view).forEach(b => b.onclick = () => act(b.dataset.unblock, { blocked: false }, t('Usuario desbloqueado')));
      $$('[data-out]', view).forEach(b => b.onclick = () => act(b.dataset.out, null, t('Sesiones cerradas')));
    };
    let timer;
    $('#q', view).oninput = (e) => { clearTimeout(timer); timer = setTimeout(() => { q = e.target.value.trim(); load(); }, 300); };
    await load();
  };

  // ---------------------------------------------------------------- Buscar jugadores en todo Kopi
  V.players = async (view, r) => {
    if (!isCreator()) return V.notFound(view);
    const q0 = (r && r.query.get('q')) || '';
    view.innerHTML = html`<div class="page">${head(t('Jugadores'), t('Busca un jugador de Minecraft en todos los studios: a qué instancias tiene acceso, cuánto juega y si está baneado.'))}
      <div class="card"><label class="fm-search" style="max-width:420px;height:40px">${icon('search')}<input id="q" placeholder="${t('Nombre de Minecraft')}" value="${esc(q0)}"></label></div>
      <div id="res"></div></div>`;
    const load = async (q) => {
      const box = $('#res', view);
      if (q.length < 2) { box.innerHTML = html`<div class="card empty"><div class="ic">${icon('user')}</div><h4>${t('Escribe un nombre')}</h4><p>${t('Con 2 letras ya busca.')}</p></div>`; return; }
      const { players } = await api('GET', '/onyx/players?q=' + encodeURIComponent(q));
      box.innerHTML = players.length ? players.map(p => html`<div class="card player-card">
        <div class="card-head"><img class="head" src="https://mc-heads.net/avatar/${esc(p.uuid || p.name)}/40" alt="" width="40" height="40" loading="lazy" onerror="this.replaceWith(Object.assign(document.createElement('span'),{className:'av',textContent:'${esc(initials(p.name))}'}))">
          <div><h3 style="margin:0">${esc(p.name)} ${p.verified ? `<span class="badge ok">${icon('check')}${t('Premium')}</span>` : `<span class="badge mute">${t('Sin verificar')}</span>`}
            ${p.bans.some(b => b.scope === 'global') ? `<span class="badge bad">${icon('shield')}${t('Baneado en Kopi')}</span>` : ''}</h3>
            <small style="color:var(--muted)">${t('{n} partidas', { n: num(p.plays) })} · ${fmtDur(p.playTime)} · ${p.lastPlay ? t('jugó {t}', { t: timeAgo(p.lastPlay) }) : t('nunca ha jugado')}${p.referral ? ` · ${t('apoya a {s}', { s: esc(p.referral) })}` : ''}</small></div>
          <span class="grow"></span>
          ${p.bans.some(b => b.scope === 'global') ? `<button class="btn sm" data-unban="${esc(p.key)}">${t('Quitar baneo global')}</button>` : `<button class="btn sm danger" data-ban="${esc(p.key)}">${icon('shield')}${t('Banear en todo Kopi')}</button>`}</div>
        ${p.instances.length ? html`<table class="table" style="margin-top:8px"><thead><tr><th>${t('Instancia')}</th><th>${t('Studio')}</th><th>${t('Cómo entró')}</th><th>${t('Última IP')}</th><th>${t('Desde')}</th></tr></thead><tbody>
          ${p.instances.map(i => html`<tr><td><b>${esc(i.name)}</b></td><td>${esc(i.studio)}</td><td>${i.via === 'code' ? `${t('Código')} <span class="mono">${esc(i.code || '')}</span>` : t('Lista manual')}</td>
            <td class="mono">${esc(i.ip || '—')}</td><td>${fmtDate(i.at)}</td></tr>`).join('')}</tbody></table>` : `<p class="help">${t('No tiene acceso a ninguna instancia.')}</p>`}
        ${p.bans.filter(b => b.scope !== 'global').length ? `<p class="help" style="margin-top:10px">${icon('ban')} ${t('Baneado en: {s}', { s: esc(p.bans.filter(b => b.scope !== 'global').map(b => b.scope.split(':')[1]).join(', ')) })}</p>` : ''}
      </div>`).join('') : html`<div class="card empty"><div class="ic">${icon('search')}</div><h4>${t('No hay nadie con ese nombre')}</h4><p>${t('Solo salen jugadores que han usado el launcher con el panel.')}</p></div>`;
      $$('[data-ban]', box).forEach(b => b.onclick = async () => {
        if (!(await confirmBox({ title: t('¿Banear en todo Kopi?'), text: t('{n} no podrá entrar a ninguna instancia de ningún studio.', { n: esc(b.dataset.ban) }), ok: t('Banear'), danger: true, ico: 'shield' }))) return;
        try { await api('POST', '/onyx/bans', { kind: 'name', value: b.dataset.ban }); toast(t('Baneado en todo Kopi')); load(q); } catch (e) { fail(e); }
      });
      $$('[data-unban]', box).forEach(b => b.onclick = async () => { try { await api('DELETE', `/onyx/bans/${encodeURIComponent(b.dataset.unban)}?kind=name`); toast(t('Baneo quitado')); load(q); } catch (e) { fail(e); } });
    };
    let timer;
    $('#q', view).oninput = (e) => { clearTimeout(timer); timer = setTimeout(() => load(e.target.value.trim()), 300); };
    $('#q', view).focus();
    await load(q0);
  };

  // ---------------------------------------------------------------- Moderación: mantenimiento y baneos globales
  V.moderation = async (view) => {
    if (!isCreator()) return V.notFound(view);
    const [{ maintenance: mt }, { bans }] = await Promise.all([api('GET', '/onyx/settings'), api('GET', '/onyx/bans')]);
    view.innerHTML = html`<div class="page">${head(t('Moderación'), t('Controles que afectan a todo Kopi.'))}
      <div class="card ${mt.on ? 'warn-card' : ''}"><div class="card-head"><h3>${icon('wrench')}${t('Modo mantenimiento')}</h3><span class="grow"></span>
        <label class="switch"><input type="checkbox" id="mt" ${mt.on ? 'checked' : ''}><span></span></label></div>
        <p class="sub">${t('Mientras esté activado, nadie puede jugar ninguna instancia (salvo el staff de cada una) y el launcher muestra este mensaje en la campana.')}</p>
        <div class="field" style="margin-top:12px"><span class="label">${t('Mensaje para los jugadores')}</span><input class="input" id="mtm" maxlength="200" value="${esc(mt.message || '')}" placeholder="${t('Ej.: Estamos actualizando Kopi, volvemos en 15 minutos')}"></div>
        ${mt.on && mt.since ? `<p class="help">${t('Activado {t}', { t: timeAgo(mt.since) })}</p>` : ''}
        <button class="btn" id="mts" style="margin-top:6px">${icon('check')}${t('Guardar mensaje')}</button></div>
      <div class="card"><h3>${icon('shield')}${t('Baneos en todo Kopi')}</h3><p class="sub">${t('Un nombre o IP de aquí no puede entrar a ninguna instancia de ningún studio.')}</p>
        <div class="ban-add"><select class="input" id="bk" aria-label="${t('Tipo')}"><option value="name">${t('Nombre')}</option><option value="ip">IP</option></select>
          <input class="input" id="bv" maxlength="45" placeholder="${t('Nombre de Minecraft o IP')}"><button class="btn danger" id="badd">${icon('ban')}${t('Banear')}</button></div>
        <div>${bans.length ? bans.map(b => html`<div class="list-row"><span class="av">${icon(b.kind === 'ip' ? 'globe' : 'user')}</span><span class="grow"><b class="${b.kind === 'ip' ? 'mono' : ''}">${esc(b.value)}</b><br><small style="color:var(--faint)">${timeAgo(b.created_at)}${b.by_name ? ' · ' + esc(b.by_name) : ''}</small></span>
          <button class="btn sm" data-un="${esc(b.value)}" data-k="${b.kind}">${t('Quitar')}</button></div>`).join('') : `<p class="help">${t('Nadie baneado en todo Kopi.')}</p>`}</div></div></div>`;
    const save = async (on) => {
      try { await api('PATCH', '/onyx/settings', { maintenance: { on, message: $('#mtm', view).value } }); toast(on ? t('Mantenimiento activado') : t('Mantenimiento desactivado')); V.moderation(view); }
      catch (e) { fail(e); }
    };
    $('#mt', view).onchange = async (e) => {
      if (e.target.checked && !(await confirmBox({ title: t('¿Activar el modo mantenimiento?'), text: t('Nadie podrá jugar en ningún studio hasta que lo desactives (salvo el staff de cada instancia).'), ok: t('Activar'), danger: true, ico: 'wrench' }))) { e.target.checked = false; return; }
      save(e.target.checked);
    };
    $('#mts', view).onclick = () => save($('#mt', view).checked);
    $('#badd', view).onclick = async () => {
      try { await api('POST', '/onyx/bans', { kind: $('#bk', view).value, value: $('#bv', view).value }); toast(t('Baneado en todo Kopi')); V.moderation(view); } catch (e) { fail(e); }
    };
    $$('[data-un]', view).forEach(b => b.onclick = async () => { try { await api('DELETE', `/onyx/bans/${encodeURIComponent(b.dataset.un)}?kind=${b.dataset.k}`); V.moderation(view); } catch (e) { fail(e); } });
  };

  // ---------------------------------------------------------------- tarjeta de espacio para Ajustes del studio
  window.usageCard = async (box) => {
    const u = await sapi('GET', '/usage');
    const pct = (a, b) => (b ? Math.min(100, Math.round(a / b * 100)) : 0);
    box.innerHTML = html`<div class="card"><h3>${icon('hardDrive')}${t('Espacio y límites')}</h3>
      <div class="grid g2" style="margin-top:14px">
        <div><small style="color:var(--muted)">${t('Archivos subidos')}</small><div style="font:700 20px Sora">${size0(u.storage)}${u.maxStorageMb ? `<small style="color:var(--faint);font-weight:500"> / ${u.maxStorageMb} MB</small>` : ''}</div>
          ${u.maxStorageMb ? `<div class="meter"><i style="width:${pct(u.storage, u.maxStorageMb * 1048576)}%"></i></div>` : `<small style="color:var(--faint)">${t('{n} archivos · sin límite', { n: u.files })}</small>`}</div>
        <div><small style="color:var(--muted)">${t('Instancias')}</small><div style="font:700 20px Sora">${u.instances}${u.maxInstances ? `<small style="color:var(--faint);font-weight:500"> / ${u.maxInstances}</small>` : ''}</div>
          ${u.maxInstances ? `<div class="meter"><i style="width:${pct(u.instances, u.maxInstances)}%"></i></div>` : `<small style="color:var(--faint)">${t('sin límite')}</small>`}</div></div>
      ${can('admin') ? html`<div class="note" style="margin-top:14px">${icon('info')}<span>${u.orphans ? t('Hay {n} archivos subidos que ya no usa ninguna instancia.', { n: u.orphans }) : t('No hay archivos sin usar.')}</span>
        ${u.orphans ? `<button class="btn sm" id="clean">${t('Liberar espacio')}</button>` : ''}</div>` : ''}</div>`;
    const c = $('#clean', box);
    if (c) c.onclick = async () => {
      busy(c, true);
      try { const r = await sapi('POST', '/clean'); toast(t('Liberados {size}', { size: fmtSize(r.bytes) })); usageCard(box); } catch (e) { fail(e); busy(c, false); }
    };
  };
})();
