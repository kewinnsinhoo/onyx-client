// Ficha de una instancia con pestañas.
(function () {
  const V = window.Views;
  const TABS = [
    ['summary', 'info', 'Resumen'], ['files', 'folder', 'Archivos'], ['look', 'sparkles', 'Personalización'],
    ['game', 'gamepad', 'Juego'], ['launch', 'rocket', 'Arranque'], ['access', 'users', 'Acceso'], ['protect', 'shield', 'Protección'], ['players', 'activity', 'Jugadores']
  ];
  const B32 = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  const genCode = () => { const a = crypto.getRandomValues(new Uint8Array(12)); const s = [...a].map(b => B32[b % 32]).join(''); return `${s.slice(0, 4)}-${s.slice(4, 8)}-${s.slice(8)}`; };
  const toLocal = (ts) => { if (!ts) return ''; const d = new Date(ts); d.setMinutes(d.getMinutes() - d.getTimezoneOffset()); return d.toISOString().slice(0, 16); };
  const fromLocal = (v) => (v ? new Date(v).getTime() : null);
  const sw = (id, on) => `<label class="switch"><input type="checkbox" id="${id}" ${on ? 'checked' : ''}><span></span></label>`;

  V.instance = async (view, r) => {
    const id = r.parts[1];
    const tab = TABS.some(x => x[0] === r.parts[2]) ? r.parts[2] : 'summary';
    view.innerHTML = `<div class="page"><div class="skel" style="height:170px"></div></div>`;
    const inst = await sapi('GET', `/instances/${encodeURIComponent(id)}`);
    let d = structuredClone(inst.data);
    let orig = JSON.stringify(d);
    const base = `/instances/${encodeURIComponent(id)}`;
    const editable = can('editor');
    let timer = null;

    const bar = savebar({
      onSave: async () => { const res = await sapi('PATCH', base, { data: d }); d = res.data; inst.data = res.data; orig = JSON.stringify(d); paintHead(); },
      onDiscard: () => { d = JSON.parse(orig); drawTab(); }
    });
    const changed = () => { bar.set(editable && JSON.stringify(d) !== orig); const pv = $('#pv'); if (pv) pv.innerHTML = previewHtml(d); };

    view.innerHTML = html`<div class="page"><div id="head"></div>
      <nav class="tabs">${TABS.map(([k, i, l]) => `<a href="#/instance/${encodeURIComponent(id)}/${k}" class="${k === tab ? 'on' : ''}">${icon(i)}${t(l)}</a>`).join('')}</nav>
      <div id="tab"></div></div>`;

    function paintHead() {
      const l = inst.data.look;
      $('#head').innerHTML = html`<div class="ihead"><div class="bg">${l.background ? `<img src="${esc(l.background)}" alt="">` : ''}</div>
        <div class="in"><div>
          <div style="display:flex;gap:8px;align-items:center;margin-bottom:8px"><a class="btn ghost sm icon" href="#/instances" title="${t('Volver')}">${icon('chevLeft')}</a>
            ${inst.state === 'locked' ? `<span class="badge bad">${icon('lock')}${t('Bloqueada')}</span>` : `<span class="badge ok"><span class="dot"></span>${t('Abierta')}</span>`}
            ${inst.hidden ? `<span class="badge mute">${icon('eyeOff')}${t('Oculta')}</span>` : ''}</div>
          <h1>${esc(inst.data.name)}</h1><div class="meta">${esc(S.studio.name)} · ${esc(inst.data.minecraft)} · ${loaderName(inst.data.loader)}</div></div>
          ${editable ? html`<div class="acts">
            <button class="btn" id="h-hide">${icon(inst.hidden ? 'eye' : 'eyeOff')}${inst.hidden ? t('Mostrar') : t('Ocultar')}</button>
            <button class="btn ${inst.state === 'locked' ? 'green' : ''}" id="h-lock">${icon(inst.state === 'locked' ? 'unlock' : 'lock')}${inst.state === 'locked' ? t('Desbloquear') : t('Bloquear')}</button>
            <button class="btn icon" id="h-dup" title="${t('Duplicar')}">${icon('copy')}</button>
            ${can('admin') ? `<button class="btn icon danger" id="h-del" title="${t('Eliminar')}">${icon('trash')}</button>` : ''}</div>` : ''}
        </div></div>`;
      if (!editable) return;
      $('#h-hide').onclick = async (e) => { busy(e.currentTarget, true); try { const res = await sapi('PATCH', base, { hidden: !inst.hidden }); inst.hidden = res.hidden; toast(inst.hidden ? t('Instancia oculta en el launcher') : t('Instancia visible en el launcher')); paintHead(); } catch (err) { fail(err); busy(e.currentTarget, false); } };
      $('#h-lock').onclick = async (e) => {
        const locking = inst.state !== 'locked';
        busy(e.currentTarget, true);
        try { const res = await sapi('PATCH', base, { state: locking ? 'locked' : 'open' }); inst.state = res.state; toast(locking ? t('Instancia bloqueada: solo entra el staff') : t('Instancia abierta')); paintHead(); }
        catch (err) { fail(err); busy(e.currentTarget, false); }
      };
      $('#h-dup').onclick = async () => { try { const res = await sapi('POST', `${base}/duplicate`); toast(t('Copia creada (oculta y bloqueada)')); go(`/instance/${encodeURIComponent(res.id)}`); } catch (err) { fail(err); } };
      const del = $('#h-del');
      if (del) del.onclick = async () => {
        if (!(await confirmBox({ title: t('¿Enviar a la papelera?'), text: t('Los jugadores dejarán de verla. Podrás restaurarla desde la Papelera.'), ok: t('Enviar a la papelera'), danger: true, ico: 'trash' }))) return;
        try { await sapi('DELETE', base); bar.hide(); toast(t('Instancia enviada a la papelera')); go('/instances'); } catch (err) { fail(err); }
      };
    }
    paintHead();

    // ---------------------------------------------------------------- pestañas
    async function drawTab() {
      const el = $('#tab');
      if (timer) { clearInterval(timer); timer = null; }
      const fn = { summary, files, look, game, launch, access, protect, players }[tab];
      await fn(el);
      if (!editable) $$('#tab input, #tab select, #tab textarea, #tab .option, #tab .chip, #tab [data-edit]').forEach(x => { x.disabled = true; });
    }

    // Resumen
    async function summary(el) {
      const s = inst.stats || {};
      el.innerHTML = html`<div class="grid g-main">
        <div><div class="grid g2">
          <div class="card stat"><span class="k"><i>${icon('gamepad')}</i>${t('Jugando ahora')}</span><span class="v">${s.playing || 0}</span></div>
          <div class="card stat" style="margin:0"><span class="k"><i>${icon('users')}</i>${t('Jugadores con acceso')}</span><span class="v">${s.players || 0}</span></div>
          <div class="card stat" style="margin:0"><span class="k"><i>${icon('activity')}</i>${t('Partidas')}</span><span class="v">${s.plays || 0}</span></div>
          <div class="card stat" style="margin:0"><span class="k"><i>${icon('key')}</i>${t('Códigos')}</span><span class="v">${s.codes || 0}</span></div></div>
          <div class="card" style="margin-top:16px"><div class="card-head"><h3>${icon('info')}${t('Datos')}</h3><span class="grow"></span>${editable ? `<a class="btn sm" href="#/instance/${encodeURIComponent(id)}/game">${icon('edit')}${t('Editar')}</a>` : ''}</div>
            <div class="kv">
              <div><small>${t('Versión')}</small><b>${esc(d.minecraft)}</b></div>
              <div><small>${t('Loader')}</small><b>${loaderName(d.loader)}${d.loader.type !== 'vanilla' && d.loader.version !== 'latest' ? ' ' + esc(d.loader.version) : ''}</b></div>
              <div><small>Java</small><b>${d.java === 'auto' ? t('Automático') : 'Java ' + esc(d.java)}</b></div>
              <div><small>${t('Studio')}</small><b>${esc(S.studio.name)}</b></div>
              <div><small>${t('Límite')}</small><b>${d.access.maxPlayers || t('Sin límite')}</b></div>
              <div><small>${t('Solo Premium')}</small><b>${d.access.premiumOnly ? t('Sí') : t('No')}</b></div>
              <div><small>${t('Categoría')}</small><b>${esc(t(d.category))}</b></div>
              <div><small>${t('Archivos')}</small><b>${d.files.length}</b></div>
              <div><small>${t('Servidor')}</small><b>${d.server.address ? esc(d.server.address) : '—'}</b></div>
              <div><small>${t('Creada')}</small><b>${fmtDate(inst.createdAt, { day: 'numeric', month: 'short', year: 'numeric' })}</b></div>
            </div></div></div>
        <div><div id="pv">${previewHtml(d)}</div></div></div>`;
    }

    // Archivos
    async function files(el) {
      // Explorador de archivos (views/files.js). Cada cambio se guarda al momento.
      FilesTab(el, {
        getData: () => d,
        editable,
        persist: async (patch) => {
          const res = await sapi('PATCH', base, { data: patch });
          const o = JSON.parse(orig);
          for (const k of Object.keys(patch)) { d[k] = res.data[k]; o[k] = res.data[k]; inst.data[k] = res.data[k]; }
          orig = JSON.stringify(o);
          changed(); paintHead();
        }
      });
    }

    // Personalización
    async function look(el) {
      const SLOTS = [['background', 'Fondo', 'image'], ['logo', 'Logo', 'image'], ['icon', 'Icono de la barra lateral', 'image'],
        ['backgroundAnimated', 'Fondo animado', 'film'], ['logoAnimated', 'Logo animado', 'image'], ['iconAnimated', 'Icono animado de la barra lateral', 'image']];
      const STATIC = { backgroundAnimated: 'background', logoAnimated: 'logo', iconAnimated: 'icon' };
      const accept = (k) => k === 'backgroundAnimated' ? 'video/webm,video/mp4,image/gif,image/webp' : k.endsWith('Animated') ? 'image/gif,image/webp' : 'image/png,image/jpeg,image/webp,image/gif';
      const media = (u, k) => !u ? icon(k === 'backgroundAnimated' ? 'film' : 'image') : /\.(webm|mp4)(\?|$)/i.test(u) ? `<video src="${esc(u)}" muted autoplay loop playsinline></video>` : `<img src="${esc(u)}" alt="">`;
      el.innerHTML = html`<div class="split">
        <nav class="subnav">${[['general', 'edit', 'General'], ['cover', 'image', 'Portada'], ['music', 'music', 'Música'], ['extras', 'sparkles', 'Extras'], ['comp', 'puzzle', 'Componentes']].map(([k, i, l], n) => `<a href="#" data-go="${k}" class="${n ? '' : 'on'}">${icon(i)}${t(l)}</a>`).join('')}</nav>
        <div>
          <div class="card" id="s-general"><h3>${icon('edit')}${t('General')}</h3>
            <div class="row" style="margin-top:16px"><div class="field"><span class="label">${t('Nombre')}</span><input class="input" id="l-name" maxlength="60" value="${esc(d.name)}"></div>
              <div class="field"><span class="label">${t('Categoría')}</span><input class="input" id="l-cat" list="cats" maxlength="30" value="${esc(d.category)}"><datalist id="cats">${CATEGORIES.map(c => `<option value="${esc(c)}">`).join('')}</datalist></div></div>
            <div class="field"><span class="label">${t('Descripción')}</span><input class="input" id="l-desc" maxlength="200" value="${esc(d.description)}"></div>
            <div class="field"><span class="label">${t('Sobre esta instancia')}</span><textarea class="input" id="l-about" maxlength="4000" rows="5" placeholder="${t('Texto largo que verán en la página de la instancia. Separa párrafos con una línea en blanco.')}">${esc(d.about)}</textarea></div></div>
          <div class="card" id="s-cover"><h3>${icon('image')}${t('Portada')}</h3>
            <div class="note" style="margin:14px 0">${icon('info')}<span>${t('Un fondo, logo o icono animado necesita también su imagen fija.')}</span></div>
            <div class="slots" style="grid-template-columns:repeat(3,1fr)">${SLOTS.map(([k, l]) => html`<div class="slot ${STATIC[k] && !d.look[STATIC[k]] ? 'off' : ''}" data-slot="${k}">
                <div class="pv">${media(d.look[k], k)}</div><b>${t(l)}</b>
                <div class="ctl"><input class="input" data-url="${k}" placeholder="https://…" value="${esc(d.look[k] || '')}">
                  <button class="btn sm" data-up="${k}">${icon('upload')}</button><button class="btn sm icon ghost" data-clear="${k}">${icon('x')}</button></div></div>`).join('')}</div>
            <div class="grid" style="grid-template-columns:minmax(0,1fr) minmax(0,1.15fr);align-items:start;margin-top:20px"><div>
            <div class="colors" style="flex-direction:column;align-items:flex-start;gap:14px;margin-top:0"><label class="color-pick"><input type="color" id="l-accent" value="${d.look.accent}"><span class="label">${t('Color de acento')}</span></label>
              <label class="color-pick"><input type="color" id="l-play" value="${d.look.playColor}"><span class="label">${t('Color del botón Jugar')}</span><button class="btn sm ghost" id="l-reset">${t('Restablecer')}</button></label></div>
            <div class="chips" style="margin-top:18px;gap:12px;flex-direction:column;align-items:flex-start">${[['vignette', 'Viñeta sobre el fondo'], ['hideTitle', 'Ocultar el título'], ['hideTech', 'Ocultar los datos técnicos'], ['hideAuthor', 'Ocultar el autor'], ['snow', 'Que caiga nieve']]
              .map(([k, l]) => `<label class="check"><input type="checkbox" data-flag="${k}" ${d.look[k] ? 'checked' : ''}>${t(l)}</label>`).join('')}</div></div>
              <div id="pv">${previewHtml(d)}</div></div></div>
          <div class="card" id="s-music"><h3>${icon('music')}${t('Música')}</h3><p class="sub">${t('Suena de fondo en la página de la instancia del launcher.')}</p>
            <div class="field" style="margin-top:14px"><span class="label">${t('Música de ambiente')}</span><div style="display:flex;gap:8px">
              <input class="input" id="m-url" placeholder="https://… (.mp3, .ogg)" value="${esc(d.look.music.url || '')}"><button class="btn" id="m-up">${icon('upload')}${t('Subir')}</button><button class="btn" id="m-try">${icon('play')}${t('Probar')}</button></div></div>
            <div class="row" style="align-items:end"><div class="field"><span class="label">${t('Volumen inicial')}</span><input class="input" id="m-vol" type="number" min="0" max="100" value="${d.look.music.volume}"></div>
              <label class="check" style="height:40px"><input type="checkbox" id="m-loop" ${d.look.music.loop ? 'checked' : ''}>${t('Repetir en bucle')}</label></div></div>
          <div class="card" id="s-extras"><h3>${icon('sparkles')}${t('Extras')}</h3><p class="sub">${t('Un patrocinador aparece con su logo en la página de la instancia.')}</p>
            <div class="row" style="margin-top:14px"><div class="field"><span class="label">${t('Patrocinador')}</span><input class="input" id="x-name" maxlength="60" placeholder="${t('Nombre')}" value="${esc(d.look.sponsor.name)}"></div>
              <div class="field"><span class="label">${t('Enlace')}</span><input class="input" id="x-url" placeholder="https://…" value="${esc(d.look.sponsor.url || '')}"></div></div>
            <div class="field"><span class="label">${t('Logo del patrocinador')}</span><div style="display:flex;gap:8px"><input class="input" id="x-logo" placeholder="https://…" value="${esc(d.look.sponsor.logo || '')}"><button class="btn" id="x-up">${icon('upload')}${t('Subir')}</button></div></div></div>
          <div class="card" id="s-comp"><h3>${icon('puzzle')}${t('Componentes')}</h3><p class="sub">${t('Rachas, clasificaciones y novedades dentro del launcher. Llegan pronto.')}</p></div>
        </div></div>`;
      $$('[data-go]', el).forEach(a => a.onclick = (e) => { e.preventDefault(); $$('[data-go]', el).forEach(x => x.classList.toggle('on', x === a)); $('#s-' + a.dataset.go).scrollIntoView({ behavior: 'smooth', block: 'start' }); });
      const bindIn = (sel, fn) => { const i = $(sel, el); if (i) i.oninput = () => { fn(i); changed(); }; };
      bindIn('#l-name', i => { d.name = i.value; });
      bindIn('#l-cat', i => { d.category = i.value; });
      bindIn('#l-desc', i => { d.description = i.value; });
      bindIn('#l-about', i => { d.about = i.value; });
      bindIn('#l-accent', i => { d.look.accent = i.value; });
      bindIn('#l-play', i => { d.look.playColor = i.value; });
      $('#l-reset', el).onclick = () => { d.look.playColor = '#c13fd6'; $('#l-play', el).value = '#c13fd6'; changed(); };
      $$('[data-flag]', el).forEach(c => c.onchange = () => { d.look[c.dataset.flag] = c.checked; changed(); });
      const setSlot = (k, v) => {
        d.look[k] = v || null;
        if (!v && ['background', 'logo', 'icon'].includes(k)) d.look[k + 'Animated'] = null;
        changed(); look(el);
      };
      $$('[data-url]', el).forEach(i => i.onchange = () => {
        const k = i.dataset.url, v = i.value.trim();
        if (v && STATIC[k] && !d.look[STATIC[k]]) { toast(t('Primero pon la imagen fija'), 'err'); i.value = ''; return; }
        setSlot(k, v);
      });
      $$('[data-clear]', el).forEach(b => b.onclick = () => setSlot(b.dataset.clear, null));
      $$('[data-up]', el).forEach(b => b.onclick = async () => {
        const k = b.dataset.up;
        if (STATIC[k] && !d.look[STATIC[k]]) return toast(t('Primero pon la imagen fija'), 'err');
        const f = await pickFile(accept(k)); if (!f) return;
        busy(b, true);
        try { const r2 = await upload(f); setSlot(k, r2.url); } catch (e) { fail(e); busy(b, false); }
      });
      bindIn('#m-url', i => { d.look.music.url = i.value.trim() || null; });
      bindIn('#m-vol', i => { d.look.music.volume = Math.max(0, Math.min(100, Number(i.value) || 0)); });
      $('#m-loop', el).onchange = (e) => { d.look.music.loop = e.target.checked; changed(); };
      let audio = null;
      $('#m-try', el).onclick = () => {
        if (audio) { audio.pause(); audio = null; return; }
        if (!d.look.music.url) return toast(t('Pon primero una canción'), 'err');
        audio = new Audio(d.look.music.url); audio.volume = d.look.music.volume / 100; audio.play().catch(() => toast(t('No se pudo reproducir'), 'err'));
      };
      $('#m-up', el).onclick = async (e) => { const f = await pickFile('audio/*'); if (!f) return; busy(e.currentTarget, true); try { const r2 = await upload(f); d.look.music.url = r2.url; changed(); look(el); } catch (err) { fail(err); busy(e.currentTarget, false); } };
      bindIn('#x-name', i => { d.look.sponsor.name = i.value; });
      bindIn('#x-url', i => { d.look.sponsor.url = i.value.trim() || null; });
      bindIn('#x-logo', i => { d.look.sponsor.logo = i.value.trim() || null; });
      $('#x-up', el).onclick = async (e) => { const f = await pickFile('image/*'); if (!f) return; busy(e.currentTarget, true); try { const r2 = await upload(f); d.look.sponsor.logo = r2.url; changed(); look(el); } catch (err) { fail(err); busy(e.currentTarget, false); } };
      return () => { if (audio) audio.pause(); };
    }

    // Juego
    async function game(el) {
      el.innerHTML = html`<div class="card"><h3>${icon('gamepad')}${t('Juego')}</h3><p class="sub">${t('Si cambias la versión o el loader, los jugadores descargarán lo nuevo la próxima vez que jueguen.')}</p>
          <div class="row" style="margin-top:16px"><div class="field"><span class="label">${t('Versión de Minecraft')}</span><select class="input" id="g-mc"><option>${esc(d.minecraft)}</option></select>
            <label class="check" style="font-weight:500;font-size:12.5px"><input type="checkbox" id="g-snap">${t('Mostrar snapshots y versiones antiguas')}</label></div>
            <div class="field"><span class="label">Java</span><select class="input" id="g-java">${['auto', '8', '17', '21', '25'].map(j => `<option value="${j}" ${d.java === j ? 'selected' : ''}>${j === 'auto' ? t('Automático (recomendado)') : 'Java ' + j}</option>`).join('')}</select></div></div>
          <div class="field" style="margin-top:16px"><span class="label">${t('Loader')}</span><div class="loaders">${LOADERS.map(L => html`<button class="option ${d.loader.type === L.id ? 'on' : ''}" data-l="${L.id}"><span class="ic">${icon(L.i)}</span><b>${L.t}</b><small>${t(L.s)}</small></button>`).join('')}</div></div>
          <div class="field" style="margin-top:16px;max-width:360px"><span class="label">${t('Versión del loader')}</span><select class="input" id="g-lv"></select></div></div>
        <div class="card"><h3>${icon('globe')}${t('Servidor')}</h3><p class="sub">${t('Para mostrar los jugadores conectados y entrar directamente al pulsar Jugar.')}</p>
          <div class="row" style="margin-top:16px;align-items:end"><div class="field"><span class="label">${t('Dirección')}</span><input class="input" id="g-addr" placeholder="play.tuservidor.com" value="${esc(d.server.address)}"></div>
            <div class="field" style="max-width:140px"><span class="label">${t('Puerto')}</span><input class="input" id="g-port" type="number" value="${d.server.port}"></div>
            <label class="check" style="height:40px"><input type="checkbox" id="g-auto" ${d.server.autoJoin ? 'checked' : ''}>${t('Entrar al servidor al abrir el juego')}</label></div></div>
        <div class="card"><h3>${icon('user')}${t('Skins de Kopi')}</h3><p class="sub">${t('Con Fabric, Quilt, Forge o NeoForge, el launcher añade solo un mod para que todos vean las skins (premium y las de Kopi), aunque el servidor esté en modo offline. No hay que instalar nada en el servidor.')}</p>
          <label class="check" style="margin-top:12px"><input type="checkbox" id="g-skins" ${d.kopiSkins !== false ? 'checked' : ''} ${d.loader.type === 'vanilla' ? 'disabled' : ''}>${d.loader.type === 'vanilla' ? t('No disponible en Vanilla (elige un loader)') : t('Activar las skins de Kopi en esta instancia')}</label></div>`;
      const lv = $('#g-lv', el);
      await versionSelect($('#g-mc', el), d.minecraft, false);
      const bindMc = () => { const s = $('#g-mc', el); s.onchange = s.oninput = () => { d.minecraft = s.value; d.loader.version = 'latest'; fillLoaderVersions(lv, d.loader.type, d.minecraft, 'latest'); changed(); }; };
      bindMc();
      $('#g-snap', el).onchange = async (e) => { await versionSelect($('#g-mc', el), d.minecraft, e.target.checked); bindMc(); };
      fillLoaderVersions(lv, d.loader.type, d.minecraft, d.loader.version);
      lv.onchange = () => { d.loader.version = lv.value; changed(); };
      $('#g-java', el).onchange = (e) => { d.java = e.target.value; changed(); };
      $$('[data-l]', el).forEach(b => b.onclick = () => { if (!editable) return; d.loader = { type: b.dataset.l, version: 'latest' }; $$('[data-l]', el).forEach(x => x.classList.toggle('on', x === b)); fillLoaderVersions(lv, d.loader.type, d.minecraft, 'latest'); changed(); });
      $('#g-addr', el).oninput = (e) => { d.server.address = e.target.value.trim(); changed(); };
      $('#g-port', el).oninput = (e) => { d.server.port = Number(e.target.value) || 25565; changed(); };
      $('#g-auto', el).onchange = (e) => { d.server.autoJoin = e.target.checked; changed(); };
      $('#g-skins', el).onchange = (e) => { d.kopiSkins = e.target.checked; changed(); };
    }

    // Arranque
    async function launch(el) {
      const MODES = [['keep', 'Conservar', 'No se borra nada del equipo del jugador. Puede añadir sus propios mods.'],
        ['managed', 'Gestionada', 'Dentro de las carpetas que envías se borra lo que sobra. Mundos y capturas no se tocan.'],
        ['reset', 'Reinicio total', 'La instancia queda exactamente como la envías. Se borra todo lo demás.']];
      const PMODES = [['once', 'Del jugador · se instala una vez'], ['player', 'Del jugador · nunca se toca'], ['studio', 'Del studio · siempre se actualiza']];
      const QUICK = ['config', 'options.txt', 'config/voicechat', 'saves', 'screenshots', 'shaderpacks', 'resourcepacks', 'servers.dat'];
      const draw = () => {
        el.innerHTML = html`<div class="card"><h3>${icon('folder')}${t('Sincronización')}</h3><p class="sub">${t('Qué pasa con los archivos del jugador cuando actualizas la instancia.')}</p>
            <div style="display:grid;gap:8px;margin-top:16px">${MODES.map(([k, l, s]) => `<button class="option ${d.sync.mode === k ? 'on' : ''}" data-m="${k}"><span><b>${t(l)}</b><small>${t(s)}</small></span><span class="radio"></span></button>`).join('')}</div>
            <div class="field" style="margin-top:20px"><span class="label">${t('Archivos del jugador')}</span><span class="help">${t('Rutas que el launcher trata de forma especial. Ej.: las opciones del juego se instalan una vez y luego son del jugador.')}</span></div>
            <div style="display:grid;gap:8px;margin-top:10px">${d.sync.playerPaths.map((p, i) => html`<div style="display:flex;gap:8px"><input class="input mono" data-pp="${i}" value="${esc(p.path)}" style="flex:1.2">
              <select class="input" data-pm="${i}" style="flex:1">${PMODES.map(([k, l]) => `<option value="${k}" ${p.mode === k ? 'selected' : ''}>${t(l)}</option>`).join('')}</select>
              <button class="btn icon ghost" data-prm="${i}">${icon('trash')}</button></div>`).join('')}</div>
            <div class="chips" style="margin-top:10px;align-items:center"><button class="btn sm" id="pp-add">${icon('plus')}${t('Añadir ruta')}</button>${QUICK.map(q => `<span class="tag" data-q="${esc(q)}">${esc(q)}</span>`).join('')}</div></div>
          <div class="card"><h3>${icon('clock')}${t('Horario y bloqueo')}</h3><p class="sub">${t('Abre y cierra la instancia sola. El staff entra siempre.')}</p>
            <div class="set" style="margin-top:8px"><div class="t"><b>${t('Permitir la descarga anticipada')}</b><small>${t('Los jugadores pueden descargar todo antes de que abra, para entrar al instante.')}</small></div>${sw('s-pre', d.schedule.predownload)}</div>
            <div class="set"><div class="t"><b>${t('Sacar a quien siga dentro al cerrar')}</b><small>${t('Al llegar la hora de cierre o al bloquearla, el juego se cierra para los que no son staff.')}</small></div>${sw('s-kick', d.schedule.kickOnClose)}</div>
            <div class="row" style="margin-top:12px"><div class="field"><span class="label">${t('Abre el')}</span><input class="input" type="datetime-local" id="s-open" value="${toLocal(d.schedule.opensAt)}"></div>
              <div class="field"><span class="label">${t('Cierra el')}</span><input class="input" type="datetime-local" id="s-close" value="${toLocal(d.schedule.closesAt)}"></div></div>
            <div class="field"><span class="label">${t('Mensaje cuando está bloqueada')}</span><input class="input" id="s-msg" maxlength="140" placeholder="${t('Ej.: Volvemos a las 18:00')}" value="${esc(d.lockedMessage)}"></div></div>`;
        $$('[data-m]', el).forEach(b => b.onclick = () => { if (!editable) return; d.sync.mode = b.dataset.m; changed(); draw(); });
        $$('[data-pp]', el).forEach(i => i.oninput = () => { d.sync.playerPaths[i.dataset.pp].path = i.value.trim(); changed(); });
        $$('[data-pm]', el).forEach(s => s.onchange = () => { d.sync.playerPaths[s.dataset.pm].mode = s.value; changed(); });
        $$('[data-prm]', el).forEach(b => b.onclick = () => { d.sync.playerPaths.splice(Number(b.dataset.prm), 1); changed(); draw(); });
        $('#pp-add', el).onclick = () => { d.sync.playerPaths.push({ path: '', mode: 'once' }); changed(); draw(); };
        $$('[data-q]', el).forEach(q => q.onclick = () => { if (!editable || d.sync.playerPaths.some(p => p.path === q.dataset.q)) return; d.sync.playerPaths.push({ path: q.dataset.q, mode: ['saves', 'screenshots', 'servers.dat'].includes(q.dataset.q) ? 'player' : 'once' }); changed(); draw(); });
        $('#s-pre', el).onchange = (e) => { d.schedule.predownload = e.target.checked; changed(); };
        $('#s-kick', el).onchange = (e) => { d.schedule.kickOnClose = e.target.checked; changed(); };
        $('#s-open', el).onchange = (e) => { d.schedule.opensAt = fromLocal(e.target.value); changed(); };
        $('#s-close', el).onchange = (e) => { d.schedule.closesAt = fromLocal(e.target.value); changed(); };
        $('#s-msg', el).oninput = (e) => { d.lockedMessage = e.target.value; changed(); };
      };
      draw();
    }

    // Protección: KopiGuard (anticheat)
    function protect(el) {
      d.guard = d.guard || { enabled: false, autoKick: false, packsOk: false, webhook: '' };
      const draw = () => {
        const g = d.guard, off = d.loader.type === 'vanilla';
        el.innerHTML = html`<div class="card"><div class="card-head"><div><h3>${icon('shield')}KopiGuard</h3><p class="sub">${t('El anticheat de Kopi. Mientras se juega, el launcher avisa en la página KopiGuard de lo que no debería pasar.')}</p></div><span class="grow"></span>${sw('gd-on', g.enabled)}</div>
            <div class="g-list">
              <div><span class="badge g-type t-mod">${icon('package')}${t('Mod')}</span><span>${t('Alguien añade un mod que no es de la instancia.')}</span></div>
              <div><span class="badge g-type t-pack">${icon('image')}${t('Paquete')}</span><span>${t('Alguien añade un paquete de texturas o de shaders.')}</span></div>
              <div><span class="badge g-type t-file">${icon('file')}${t('Archivo')}</span><span>${t('Alguien cambia un archivo de la instancia o añade uno en config.')}</span></div>
              <div><span class="badge g-type t-program">${icon('cpu')}${t('Programa')}</span><span>${t('Alguien tiene abierto un autoclicker u otro programa de trampas.')}</span></div>
              <div><span class="badge g-type t-move">${icon('move')}${t('Movimiento')}</span><span>${t('Con el plugin del servidor: alguien vuela o va demasiado rápido.')}</span></div>
              <div><span class="badge g-type t-combat">${icon('crosshair')}${t('Combate')}</span><span>${t('Con el plugin del servidor: golpea desde muy lejos, a varios a la vez o hace demasiados clics.')}</span></div>
            </div>
            <div class="g-extra"><span>${icon('camera')}${t('Cada detección importante llega con una foto y un vídeo de 10 s del juego.')}</span><span>${icon('video')}${t('En Cámaras ves en directo el juego de quien esté jugando.')}</span></div>
            ${off ? `<p class="help" style="margin-top:12px">${t('En Vanilla solo se vigilan los programas y los paquetes (no hay mods).')}</p>` : ''}</div>
          <div class="card ${g.enabled ? '' : 'g-dim'}"><h3>${icon('settings')}${t('Opciones')}</h3>
            <div class="set" style="margin-top:8px"><div class="t"><b>${t('Expulsar al momento a quien use un programa de trampas')}</b><small>${t('Se le cierra el juego al momento. El resto de avisos los revisas tú.')}</small></div>${sw('gd-kick', g.autoKick)}</div>
            <div class="set"><div class="t"><b>${t('Permitir paquetes de texturas y shaders')}</b><small>${t('No avisa si alguien añade uno (por ejemplo, si dejas usar los suyos).')}</small></div>${sw('gd-packs', g.packsOk)}</div>
            <div class="field" style="margin-top:12px"><span class="label">${t('Avisar en un canal de Discord (opcional)')}</span><span class="help">${t('Pega el enlace de un webhook de Discord: cada detección llegará también allí.')}</span>
              <input class="input mono" id="gd-hook" placeholder="https://discord.com/api/webhooks/…" value="${esc(g.webhook || '')}"></div></div>
          <div class="card ${g.enabled ? '' : 'g-dim'}" id="gd-srv"><div class="skel" style="height:120px"></div></div>
          <p class="help g-note">${icon('info')}${t('Los jugadores lo aceptan en los términos del launcher. De los programas abiertos, el launcher solo avisa de los de trampas, nunca envía la lista completa.')}</p>`;
        serverCard($('#gd-srv', el)).catch(() => { $('#gd-srv', el).remove(); });
        $('#gd-on', el).onchange = (e) => { g.enabled = e.target.checked; changed(); draw(); };
        $('#gd-kick', el).onchange = (e) => { g.autoKick = e.target.checked; changed(); };
        $('#gd-packs', el).onchange = (e) => { g.packsOk = e.target.checked; changed(); };
        $('#gd-hook', el).oninput = (e) => { g.webhook = e.target.value.trim(); changed(); };
      };
      draw();
    }

    // KopiGuard: el plugin del servidor y su clave
    const PLUGIN_URL = 'https://github.com/kewinnsinhoo/onyx-client/releases/download/kopi-guard-v1.0.0/KopiGuard.jar';
    async function serverCard(box) {
      if (!can('admin') && !(S.me && S.me.user.role === 'creator')) { box.remove(); return; }
      let k = await sapi('GET', `/guard/key/${encodeURIComponent(id)}`), shown = false;
      const draw = () => {
        box.innerHTML = html`<div class="card-head"><div><h3>${icon('server')}${t('Plugin del servidor')}</h3>
            <p class="sub">${t('Para pillar vuelo, velocidad, alcance, autoclicker y golpes a varios a la vez. Funciona en Paper, Purpur, Folia y Arclight (1.16.5 o más nuevo). No cuenta los empujones, explosiones, caídas, slime, tridente ni élitros.')}</p></div>
            <span class="grow"></span><span class="badge ${k.usedAt ? 'ok' : 'mute'}">${k.usedAt ? t('Conectado {t}', { t: timeAgo(k.usedAt) }) : t('Sin conectar')}</span></div>
          <ol class="g-steps">
            <li>${t('Descarga el plugin y ponlo en la carpeta <b>plugins</b> del servidor.')} <a class="btn sm" href="${PLUGIN_URL}" target="_blank" rel="noopener">${icon('download')}KopiGuard.jar</a></li>
            <li>${t('Reinicia el servidor y escribe en la consola:')}<div class="g-key"><code class="mono">${shown ? esc(`kopiguard key ${k.key}`) : 'kopiguard key ••••••••••••••••••••••••'}</code>
              <button class="btn ghost sm" id="gk-show">${icon(shown ? 'eyeOff' : 'eye')}${shown ? t('Ocultar') : t('Mostrar')}</button>
              <button class="btn sm" id="gk-copy">${icon('copy')}${t('Copiar')}</button></div></li>
            <li>${t('Comprueba que va con <code>kopiguard test</code>.')}</li>
          </ol>
          <div class="g-keyfoot"><span class="help">${t('La clave es como una contraseña: no la compartas. Si se filtra, crea otra.')}</span><span class="grow"></span>
            <button class="btn ghost sm" id="gk-new">${icon('refresh')}${t('Crear otra clave')}</button></div>`;
        $('#gk-show', box).onclick = () => { shown = !shown; draw(); };
        $('#gk-copy', box).onclick = () => copy(`kopiguard key ${k.key}`);
        $('#gk-new', box).onclick = async () => {
          if (!(await confirmBox({ title: t('¿Crear otra clave?'), text: t('La clave actual deja de funcionar: tendrás que poner la nueva en el servidor.'), ok: t('Crear otra'), ico: 'refresh' }))) return;
          try { k = await sapi('POST', `/guard/key/${encodeURIComponent(id)}`, {}); shown = true; draw(); toast(t('Clave nueva creada')); } catch (e) { fail(e); }
        };
      };
      draw();
    }

    // Acceso
    async function access(el) {
      el.innerHTML = `<div class="skel" style="height:300px"></div>`;
      const [codes, acc, bans] = await Promise.all([sapi('GET', `${base}/codes`), sapi('GET', `${base}/access`), sapi('GET', `${base}/bans`)]);
      const manual = acc.players.filter(p => p.via === 'manual');
      const saveStaff = async (list) => {
        const res = await sapi('PATCH', base, { data: { access: { staff: list } } });
        d.access.staff = res.data.access.staff; inst.data.access.staff = res.data.access.staff;
        const o = JSON.parse(orig); o.access.staff = res.data.access.staff; orig = JSON.stringify(o); changed();
      };
      el.innerHTML = html`
        <div class="card"><h3>${icon('shield')}${t('Quién puede entrar')}</h3>
          <div class="set" style="margin-top:8px"><div class="t"><b>${t('Pública en el launcher')}</b><small>${t('Cualquiera la ve y puede jugar sin código ni lista.')}</small></div>${sw('a-pub', d.access.public)}</div>
          <div class="set"><div class="t"><b>${t('Aceptar códigos de invitación')}</b><small>${t('Si lo apagas, los códigos dejan de funcionar (quien ya entró, sigue).')}</small></div>${sw('a-codes', d.access.codes)}</div>
          <div class="set"><div class="t"><b>${t('Solo Premium')}</b><small>${t('Solo cuentas de Microsoft con Minecraft, verificadas por Mojang.')}</small></div>${sw('a-prem', d.access.premiumOnly)}</div>
          <div class="set"><div class="t"><b>${t('Límite de jugadores a la vez')}</b><small>${t('Vacío = sin límite. El staff entra aunque esté lleno.')}</small></div><input class="input" id="a-max" type="number" min="1" style="width:130px" placeholder="${t('Sin límite')}" value="${d.access.maxPlayers || ''}"></div></div>

        <div class="card"><div class="card-head"><div><h3>${icon('users')}${t('Whitelist manual')}</h3><p class="sub">${t('Estos nombres pueden entrar sin código.')}</p></div></div>
          ${editable ? `<div style="display:flex;gap:8px"><input class="input" id="wl-in" placeholder="${t('Nombre de jugador (puedes pegar varios)')}"><button class="btn" id="wl-add">${icon('plus')}${t('Añadir')}</button></div>` : ''}
          <div class="chips" style="margin-top:12px">${manual.length ? manual.map(p => `<span class="chip">${esc(p.player_name)}${editable ? `<button class="x" data-unwl="${esc(p.player_key)}">${icon('x')}</button>` : ''}</span>`).join('') : `<span class="help">${t('Nadie en la lista todavía.')}</span>`}</div></div>

        <div class="card"><div class="card-head"><div><h3>${icon('crown')}${t('Whitelist de staff')}</h3><p class="sub">${t('Entran aunque la instancia esté bloqueada, llena o fuera de horario.')}</p></div></div>
          ${editable ? `<div style="display:flex;gap:8px"><input class="input" id="st-in" placeholder="${t('Nombre de jugador')}"><button class="btn" id="st-add">${icon('plus')}${t('Añadir')}</button></div>` : ''}
          <div class="chips" style="margin-top:12px">${d.access.staff.length ? d.access.staff.map(n => `<span class="chip">${icon('crown')}${esc(n)}${editable ? `<button class="x" data-unst="${esc(n)}">${icon('x')}</button>` : ''}</span>`).join('') : `<span class="help">${t('No hay nadie en la lista de staff.')}</span>`}</div></div>

        <div class="card"><div class="card-head"><div><h3>${icon('key')}${t('Códigos de acceso')}</h3><p class="sub">${t('Cada código añade la instancia al launcher de quien lo canjea.')}</p></div><span class="grow"></span>
            ${editable ? `<button class="btn primary" id="c-new">${icon('plus')}${t('Crear un código')}</button>` : ''}</div>
          ${codes.codes.length ? html`<table class="table"><thead><tr><th>${t('Código')}</th><th>${t('Usos')}</th><th>${t('Creado')}</th><th></th></tr></thead><tbody>
            ${codes.codes.map(c => html`<tr><td><b class="mono">${esc(c.code)}</b></td>
              <td>${c.uses} / ${c.max_uses == null ? '∞' : c.max_uses} ${c.max_uses != null && c.uses >= c.max_uses ? `<span class="badge mute">${t('Agotado')}</span>` : ''}</td>
              <td>${fmtDate(c.created_at)}</td><td class="r"><button class="btn sm icon ghost" data-cp="${esc(c.code)}" title="${t('Copiar')}">${icon('copy')}</button>
              ${editable ? `<button class="btn sm icon ghost" data-cdel="${esc(c.code)}" title="${t('Eliminar')}">${icon('trash')}</button>` : ''}</td></tr>`).join('')}</tbody></table>`
            : `<p class="help" style="margin:0">${t('No hay ningún código creado.')}</p>`}</div>

        <div class="card"><div class="card-head"><div><h3>${icon('link')}${t('Enlace corto')}</h3><p class="sub">${t('Un enlace que abre el launcher, añade la instancia y canjea el código de una vez.')}</p></div><span class="grow"></span><span class="badge mute">${t('Próximamente')}</span></div></div>

        <div class="card"><div class="card-head"><h3>${icon('check')}${t('Jugadores con acceso')}<span class="badge mute">${acc.players.length}</span></h3></div>
          ${acc.players.length ? html`<table class="table"><thead><tr><th>${t('Jugador')}</th><th>${t('Vía')}</th><th>${t('Cuándo')}</th>${can('admin') ? '<th>IP</th>' : ''}<th></th></tr></thead><tbody>
            ${acc.players.map(p => html`<tr><td><b>${esc(p.player_name)}</b>${p.uuid ? ` <span class="badge ok" title="${t('Verificado por Mojang')}">${icon('check')}</span>` : ''}</td>
              <td>${p.via === 'code' ? `<span class="badge">${t('Código')} <span class="mono">${esc(p.code || '')}</span></span>` : `<span class="badge mute">${t('Manual')}</span>`}</td>
              <td>${timeAgo(p.created_at)}</td>${can('admin') ? `<td class="mono" style="font-size:12px">${esc(p.last_ip || '—')}</td>` : ''}
              <td class="r">${editable ? `<button class="btn sm ghost" data-unacc="${esc(p.player_key)}">${icon('x')}${t('Quitar el acceso')}</button>` : ''}${can('admin') ? `<button class="btn sm danger" data-ban="${esc(p.player_name)}">${icon('ban')}${t('Banear')}</button>` : ''}</td></tr>`).join('')}</tbody></table>`
            : `<p class="help" style="margin:0">${t('Todavía nadie ha entrado.')}</p>`}</div>

        <div class="card"><h3>${icon('ban')}${t('Baneados')}</h3><p class="sub">${t('Un jugador o una IP baneada no puede canjear códigos ni entrar. También se aplican los baneos de todo el studio (Ajustes).')}</p>
          ${can('admin') ? `<div class="row" style="margin-top:14px"><div style="display:flex;gap:8px"><input class="input" id="b-name" placeholder="${t('Nombre de jugador')}"><button class="btn danger solid" id="b-name-add">${icon('plus')}${t('Banear')}</button></div>
            <div style="display:flex;gap:8px"><input class="input" id="b-ip" placeholder="${t('Dirección IP')}"><button class="btn danger solid" id="b-ip-add">${icon('plus')}${t('Banear')}</button></div></div>` : ''}
          <div class="chips" style="margin-top:12px">${bans.bans.length ? bans.bans.map(b => `<span class="chip">${icon(b.kind === 'ip' ? 'globe' : 'user')}<span class="${b.kind === 'ip' ? 'mono' : ''}">${esc(b.value)}</span>${can('admin') ? `<button class="x" data-unban="${esc(b.value)}" data-kind="${b.kind}">${icon('x')}</button>` : ''}</span>`).join('') : `<span class="help">${t('No hay nadie baneado.')}</span>`}</div></div>`;

      const sync = (sel, fn, ev = 'onchange') => { const i = $(sel, el); if (i) i[ev] = () => { fn(i); changed(); }; };
      sync('#a-pub', i => { d.access.public = i.checked; });
      sync('#a-codes', i => { d.access.codes = i.checked; });
      sync('#a-prem', i => { d.access.premiumOnly = i.checked; });
      sync('#a-max', i => { d.access.maxPlayers = Number(i.value) || null; }, 'oninput');
      const reload = () => access(el);
      const act = async (btn, fn, msg) => { busy(btn, true); try { await fn(); if (msg) toast(msg); reload(); } catch (e) { fail(e); busy(btn, false); } };
      const wl = $('#wl-add', el);
      if (wl) { const go2 = () => act(wl, () => sapi('POST', `${base}/access`, { names: $('#wl-in', el).value.split(/[\s,]+/).filter(Boolean) }), t('Añadido a la whitelist')); wl.onclick = go2; $('#wl-in', el).onkeydown = (e) => { if (e.key === 'Enter') go2(); }; }
      $$('[data-unwl]', el).forEach(b => b.onclick = () => act(b, () => sapi('DELETE', `${base}/access/${encodeURIComponent(b.dataset.unwl)}`)));
      const st = $('#st-add', el);
      if (st) { const go3 = () => { const v = $('#st-in', el).value.trim(); if (!/^[A-Za-z0-9_]{2,16}$/.test(v)) return toast(t('Nombre de jugador no válido'), 'err'); act(st, () => saveStaff([...d.access.staff, v]), t('Añadido al staff')); }; st.onclick = go3; $('#st-in', el).onkeydown = (e) => { if (e.key === 'Enter') go3(); }; }
      $$('[data-unst]', el).forEach(b => b.onclick = () => act(b, () => saveStaff(d.access.staff.filter(n => n !== b.dataset.unst))));
      $$('[data-cp]', el).forEach(b => b.onclick = () => copy(b.dataset.cp));
      $$('[data-cdel]', el).forEach(b => b.onclick = async () => { if (await confirmBox({ title: t('¿Eliminar el código?'), text: t('Dejará de funcionar. Quien ya lo canjeó sigue teniendo acceso.'), ok: t('Eliminar'), danger: true, ico: 'trash' })) act(b, () => sapi('DELETE', `${base}/codes/${encodeURIComponent(b.dataset.cdel)}`), t('Código eliminado')); });
      $$('[data-unacc]', el).forEach(b => b.onclick = () => act(b, () => sapi('DELETE', `${base}/access/${encodeURIComponent(b.dataset.unacc)}`), t('Acceso quitado')));
      $$('[data-ban]', el).forEach(b => b.onclick = async () => { if (await confirmBox({ title: t('¿Banear a {name}?', { name: b.dataset.ban }), text: t('No podrá entrar ni canjear códigos en esta instancia.'), ok: t('Banear'), danger: true, ico: 'ban' })) act(b, () => sapi('POST', `${base}/bans`, { kind: 'name', value: b.dataset.ban }), t('Jugador baneado')); });
      const bn = $('#b-name-add', el); if (bn) bn.onclick = () => act(bn, () => sapi('POST', `${base}/bans`, { kind: 'name', value: $('#b-name', el).value.trim() }), t('Jugador baneado'));
      const bi = $('#b-ip-add', el); if (bi) bi.onclick = () => act(bi, () => sapi('POST', `${base}/bans`, { kind: 'ip', value: $('#b-ip', el).value.trim() }), t('IP baneada'));
      $$('[data-unban]', el).forEach(b => b.onclick = () => act(b, () => sapi('DELETE', `${base}/bans/${encodeURIComponent(b.dataset.unban)}?kind=${b.dataset.kind}`), t('Baneo quitado')));
      const cn = $('#c-new', el);
      if (cn) cn.onclick = () => modal((m, close) => {
        m.innerHTML = html`<div class="mh"><h3>${icon('key')}${t('Crear un código')}</h3><button class="btn ghost icon" id="cc-x">${icon('x')}</button></div><div class="mb">
          <div style="display:flex;gap:8px"><input class="input big mono" id="cc-code" style="text-align:center;letter-spacing:.12em" value="${genCode()}" maxlength="14"><button class="btn icon" id="cc-re" title="${t('Generar otro')}" style="height:46px;width:46px">${icon('refresh')}</button></div>
          <p class="help" style="margin:8px 0 0">${t('12 letras o números, como FEST-2026-ABCD. Escribe el tuyo o genera uno.')}</p>
          <div class="row" style="margin-top:16px;align-items:end"><div class="field"><span class="label">${t('Usos máximos')}</span><input class="input" id="cc-max" type="number" min="1" value="100"></div>
            <label class="check" style="height:40px"><input type="checkbox" id="cc-unl">${t('Ilimitados')}</label>
            <div class="field"><span class="label">${t('Cantidad')}</span><input class="input" id="cc-qty" type="number" min="1" max="200" value="1"></div></div></div>
          <div class="mf"><button class="btn" id="cc-no">${t('Cancelar')}</button><button class="btn primary" id="cc-ok">${icon('check')}${t('Crear')}</button></div>`;
        $('#cc-x', m).onclick = $('#cc-no', m).onclick = close;
        $('#cc-re', m).onclick = () => { $('#cc-code', m).value = genCode(); };
        $('#cc-unl', m).onchange = (e) => { $('#cc-max', m).disabled = e.target.checked; };
        $('#cc-qty', m).oninput = (e) => { $('#cc-code', m).disabled = Number(e.target.value) > 1; };
        $('#cc-ok', m).onclick = async (e) => {
          busy(e.currentTarget, true);
          const qty = Number($('#cc-qty', m).value) || 1;
          try {
            const r2 = await sapi('POST', `${base}/codes`, { code: qty > 1 ? undefined : $('#cc-code', m).value, maxUses: Number($('#cc-max', m).value) || 100, unlimited: $('#cc-unl', m).checked, quantity: qty });
            close(); toast(r2.codes.length > 1 ? t('{n} códigos creados', { n: r2.codes.length }) : t('Código creado')); reload();
          } catch (err) { fail(err); busy(e.currentTarget, false); }
        };
      });
    }

    // Jugadores en vivo
    async function players(el) {
      const draw = async () => {
        const r2 = await sapi('GET', `${base}/players`).catch(() => ({ players: [] }));
        el.innerHTML = html`<div class="card"><div class="card-head"><div><h3>${icon('activity')}${t('Jugando ahora')}<span class="badge ok">${r2.players.length}</span></h3><p class="sub">${t('Se actualiza solo cada 15 segundos.')}</p></div></div>
          ${r2.players.length ? html`<table class="table"><thead><tr><th>${t('Jugador')}</th><th>${t('Desde')}</th><th>${t('Última señal')}</th></tr></thead><tbody>
            ${r2.players.map(p => `<tr><td><b>${esc(p.player_name)}</b></td><td>${fmtDateTime(p.started_at)}</td><td>${timeAgo(p.last_seen)}</td></tr>`).join('')}</tbody></table>`
            : `<div class="empty"><div class="ic">${icon('gamepad')}</div><h4>${t('Nadie conectado')}</h4><p>${t('Cuando alguien pulse Jugar en el launcher, aparecerá aquí.')}</p></div>`}</div>`;
      };
      await draw();
      timer = setInterval(draw, 15000);
    }

    await drawTab();
    return () => { if (timer) clearInterval(timer); bar.hide(); };
  };
})();
