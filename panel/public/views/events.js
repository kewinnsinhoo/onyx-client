// Eventos: calendario mensual del studio. Los públicos salen en la web de Kopi.
(function () {
  const V = window.Views;
  const CATS = [['Evento', '#5b8def'], ['Torneo', '#ef4444'], ['Serie', '#38bdf8'], ['Squid Game', '#8b5cf6'], ['Directo', '#ec4899'], ['Otro', '#94a3b8']];
  const DAY = 864e5;
  const toLocal = (ts) => { if (!ts) return ''; const d = new Date(ts); d.setMinutes(d.getMinutes() - d.getTimezoneOffset()); return d.toISOString().slice(0, 16); };
  const fromLocal = (v) => (v ? new Date(v).getTime() : null);
  const startOfDay = (ts) => { const d = new Date(ts); d.setHours(0, 0, 0, 0); return d.getTime(); };

  V.events = async (view) => {
    let month = new Date(); month.setDate(1); month.setHours(0, 0, 0, 0);
    let selected = null;
    let events = [];
    const instances = (await sapi('GET', '/instances')).instances;

    async function load() {
      const first = new Date(month); const from = first.getTime() - 7 * DAY;
      const to = new Date(month.getFullYear(), month.getMonth() + 1, 1).getTime() + 14 * DAY;
      events = (await sapi('GET', `/events?from=${from}&to=${to}`)).events;
      draw();
    }

    function draw() {
      const y = month.getFullYear(), mo = month.getMonth();
      const first = new Date(y, mo, 1);
      const offset = (first.getDay() + 6) % 7; // lunes primero
      const start = new Date(y, mo, 1 - offset).getTime();
      const days = Array.from({ length: 42 }, (_, i) => start + i * DAY + 3600e3).map(startOfDay);
      const today = startOfDay(Date.now());
      const names = [...Array(7)].map((_, i) => new Date(2024, 0, 1 + i).toLocaleDateString(I18N.locale(), { weekday: 'short' }));
      const evOn = (d) => events.filter(e => startOfDay(e.starts_at) <= d && startOfDay(e.ends_at || e.starts_at) >= d);
      const title = ((s) => s.charAt(0).toUpperCase() + s.slice(1))(first.toLocaleDateString(I18N.locale(), { month: 'long', year: 'numeric' }));
      view.innerHTML = html`<div class="page" style="width:min(1300px,100%)">
        <div class="page-head"><div><h1>${t('Eventos')}</h1><p>${t('Los eventos públicos aparecen en el calendario de onyxclient.site.')}</p></div><span class="grow"></span>
          ${can('editor') ? `<button class="btn primary" id="new">${icon('plus')}${t('Publicar evento')}</button>` : ''}</div>
        <div class="grid" style="grid-template-columns:minmax(0,1fr) 300px;align-items:start">
          <div class="card" style="padding:16px">
            <div style="display:flex;align-items:center;gap:8px;margin-bottom:14px"><button class="btn icon sm" id="prev">${icon('chevLeft')}</button><button class="btn sm" id="today">${t('Hoy')}</button><button class="btn icon sm" id="next">${icon('chevRight')}</button>
              <h3 style="font-size:19px;margin-left:8px">${esc(title)}</h3></div>
            <div class="cal">${names.map(n => `<div class="cal-h">${esc(n)}</div>`).join('')}
              ${days.map(d => { const list = evOn(d); const dt = new Date(d); return html`<div class="cal-d ${dt.getMonth() !== mo ? 'out' : ''} ${d === today ? 'today' : ''}" data-day="${d}">
                <span class="n">${dt.getDate()}</span>${list.slice(0, 3).map(e => `<button class="cal-e ${selected === e.id ? 'sel' : ''}" data-ev="${esc(e.id)}" style="--c:${esc(e.color)}">${startOfDay(e.starts_at) === d ? `<b>${new Date(e.starts_at).toLocaleTimeString(I18N.locale(), { hour: '2-digit', minute: '2-digit' })}</b> ` : ''}${esc(e.title)}</button>`).join('')}
                ${list.length > 3 ? `<small class="more">+${list.length - 3}</small>` : ''}</div>`; }).join('')}</div></div>
          <div class="card" id="side" style="position:sticky;top:84px"></div></div></div>`;
      $('#prev', view).onclick = () => { month = new Date(y, mo - 1, 1); load(); };
      $('#next', view).onclick = () => { month = new Date(y, mo + 1, 1); load(); };
      $('#today', view).onclick = () => { month = new Date(); month.setDate(1); month.setHours(0, 0, 0, 0); load(); };
      const nb = $('#new', view); if (nb) nb.onclick = () => edit(null);
      $$('[data-ev]', view).forEach(b => b.onclick = (e) => { e.stopPropagation(); selected = b.dataset.ev; draw(); });
      if (can('editor')) $$('[data-day]', view).forEach(c => c.ondblclick = () => edit(null, Number(c.dataset.day) + 18 * 3600e3));
      side();
    }

    function side() {
      const el = $('#side', view);
      const e = events.find(x => x.id === selected);
      if (!e) {
        el.innerHTML = html`<div class="empty" style="padding:18px 6px"><div class="ic">${icon('calendar')}</div><h4>${t('Elige un evento')}</h4><p>${t('Pulsa un evento del calendario para ver sus detalles.')}${can('editor') ? ' ' + t('Haz doble clic en un día para crear uno.') : ''}</p></div>
          <div style="display:grid;gap:8px;margin-top:6px">${CATS.map(([n, c]) => `<span style="display:flex;align-items:center;gap:8px;font-size:13px"><i style="width:10px;height:10px;border-radius:3px;background:${c}"></i>${esc(t(n))}</span>`).join('')}</div>`;
        return;
      }
      el.innerHTML = html`${e.image ? `<img src="${esc(e.image)}" alt="" style="width:100%;aspect-ratio:16/9;object-fit:cover;border-radius:12px;margin-bottom:14px">` : ''}
        <span class="badge" style="background:color-mix(in srgb, ${esc(e.color)} 18%, transparent);color:${esc(e.color)}">${esc(t(e.category))}</span>
        <h3 style="font-size:19px;margin:8px 0 4px">${esc(e.title)}</h3>
        <div style="color:var(--muted);font-size:13.5px">${fmtDateTime(e.starts_at)}${e.ends_at ? ' — ' + fmtDateTime(e.ends_at) : ''}</div>
        ${e.instance_name ? `<div class="note" style="margin-top:12px">${icon('grid')}<span>${t('Instancia')}: <b>${esc(e.instance_name)}</b></span></div>` : ''}
        ${e.description ? `<p style="white-space:pre-wrap;margin:12px 0 0">${esc(e.description)}</p>` : ''}
        <div style="margin-top:12px">${e.public ? `<span class="badge ok">${icon('globe')}${t('Público')}</span>` : `<span class="badge mute">${icon('eyeOff')}${t('Solo el studio')}</span>`}</div>
        ${can('editor') ? `<div style="display:flex;gap:8px;margin-top:16px"><button class="btn" id="ed">${icon('edit')}${t('Editar')}</button><button class="btn danger" id="del">${icon('trash')}${t('Eliminar')}</button></div>` : ''}`;
      const ed = $('#ed', el); if (ed) ed.onclick = () => edit(e);
      const del = $('#del', el); if (del) del.onclick = async () => {
        if (!(await confirmBox({ title: t('¿Eliminar el evento?'), text: t('Desaparecerá del calendario.'), ok: t('Eliminar'), danger: true, ico: 'trash' }))) return;
        try { await sapi('DELETE', `/events/${e.id}`); selected = null; toast(t('Evento eliminado')); load(); } catch (err) { fail(err); }
      };
    }

    function edit(ev, at) {
      const e = ev ? { ...ev } : { title: '', category: 'Evento', color: CATS[0][1], description: '', image: null, instance_id: null, starts_at: at || Date.now() + 86400e3, ends_at: null, public: 1 };
      modal((m, close) => {
        m.innerHTML = html`<div class="mh"><h3>${icon('calendar')}${ev ? t('Editar evento') : t('Publicar evento')}</h3><button class="btn ghost icon" id="x">${icon('x')}</button></div><div class="mb">
          <div class="field"><span class="label">${t('Título')}</span><input class="input big" id="e-t" maxlength="80" value="${esc(e.title)}" placeholder="${t('Ej.: Final del torneo')}"></div>
          <div class="row"><div class="field"><span class="label">${t('Categoría')}</span><select class="input" id="e-c">${CATS.map(([n]) => `<option value="${esc(n)}" ${e.category === n ? 'selected' : ''}>${esc(t(n))}</option>`).join('')}</select></div>
            <div class="field"><span class="label">${t('Color')}</span><input type="color" id="e-col" value="${esc(e.color)}" style="height:40px;width:100%;border-radius:11px;border:1px solid var(--line-2);background:var(--input);padding:3px"></div></div>
          <div class="row"><div class="field"><span class="label">${t('Empieza')}</span><input class="input" type="datetime-local" id="e-s" value="${toLocal(e.starts_at)}"></div>
            <div class="field"><span class="label">${t('Termina (opcional)')}</span><input class="input" type="datetime-local" id="e-e" value="${toLocal(e.ends_at)}"></div></div>
          <div class="field"><span class="label">${t('Instancia (opcional)')}</span><select class="input" id="e-i"><option value="">—</option>${instances.map(i => `<option value="${esc(i.id)}" ${e.instance_id === i.id ? 'selected' : ''}>${esc(i.data.name)}</option>`).join('')}</select></div>
          <div class="field"><span class="label">${t('Descripción')}</span><textarea class="input" id="e-d" maxlength="1000">${esc(e.description || '')}</textarea></div>
          <div class="field"><span class="label">${t('Imagen')}</span><div style="display:flex;gap:8px"><input class="input" id="e-img" placeholder="https://…" value="${esc(e.image || '')}"><button class="btn" id="e-up">${icon('upload')}</button></div></div>
          <label class="check" style="margin-top:16px"><input type="checkbox" id="e-p" ${e.public ? 'checked' : ''}>${t('Mostrar en el calendario público de Kopi')}</label></div>
          <div class="mf"><button class="btn" id="no">${t('Cancelar')}</button><button class="btn primary" id="ok">${icon('check')}${ev ? t('Guardar') : t('Publicar')}</button></div>`;
        $('#x', m).onclick = $('#no', m).onclick = close;
        $('#e-c', m).onchange = (x) => { const c = CATS.find(([n]) => n === x.target.value); if (c) $('#e-col', m).value = c[1]; };
        $('#e-up', m).onclick = async (x) => { const f = await pickFile('image/*'); if (!f) return; busy(x.currentTarget, true); try { $('#e-img', m).value = (await upload(f)).url; } catch (err) { fail(err); } finally { busy(x.currentTarget, false); } };
        $('#ok', m).onclick = async (x) => {
          const body = { title: $('#e-t', m).value, category: $('#e-c', m).value, color: $('#e-col', m).value, starts_at: fromLocal($('#e-s', m).value), ends_at: fromLocal($('#e-e', m).value),
            instance_id: $('#e-i', m).value || null, description: $('#e-d', m).value, image: $('#e-img', m).value.trim() || null, public: $('#e-p', m).checked };
          busy(x.currentTarget, true);
          try {
            if (ev) await sapi('PATCH', `/events/${ev.id}`, body); else { const r = await sapi('POST', '/events', body); selected = r.id; }
            close(); toast(ev ? t('Evento guardado') : t('Evento publicado'));
            if (body.starts_at) { month = new Date(body.starts_at); month.setDate(1); month.setHours(0, 0, 0, 0); }
            load();
          } catch (err) { fail(err); busy(x.currentTarget, false); }
        };
      });
    }

    await load();
  };
})();
