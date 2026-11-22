// Galería (capturas F2), Creadores y Consola
(function () {
  const { esc, html, toast } = UI;
  const V = window.Views = window.Views || {};

  V.gallery = async function (root) {
    root.innerHTML = `<div class="page"><h1 class="title">${t('Galería')}</h1><div id="g-body"></div></div>`;
    const body = root.querySelector('#g-body');
    let shots = [];
    try { shots = await onyx.gallery.list(); } catch (e) { toast(e, 'error'); }
    if (!shots.length) {
      body.innerHTML = html`<div class="center-empty"><div class="ico">${icon('image')}</div>
        <div class="t">${t('No hay capturas aún')}</div><div class="s">${t('Pulsa F2 mientras juegas')}</div></div>`;
      return;
    }
    body.innerHTML = `<div class="gallery-grid">${shots.map((s, i) => html`<div class="shot" data-i="${i}">
      <img loading="lazy" src="${esc(s.url)}"><div class="cap"><span>${esc(s.instance)}</span><span>${UI.timeAgo(s.time)}</span></div></div>`).join('')}</div>`;
    body.querySelectorAll('.shot').forEach(el => el.onclick = () => lightbox(shots, Number(el.dataset.i), () => V.gallery(root)));
  };

  function lightbox(shots, i, onChange) {
    const lb = document.createElement('div');
    lb.className = 'lightbox';
    const draw = () => {
      const s = shots[i];
      lb.innerHTML = html`<img src="${esc(s.url)}"><div class="row">
        <button class="btn btn-outline" data-a="prev">${icon('chevronLeft')}</button>
        <button class="btn btn-outline" data-a="open">${icon('external')}${t('Abrir')}</button>
        <button class="btn btn-outline" data-a="copy">${icon('copy')}${t('Copiar imagen')}</button>
        <button class="btn btn-danger" data-a="del">${icon('trash')}${t('Eliminar')}</button>
        <button class="btn btn-outline" data-a="next">${icon('chevronRight')}</button>
        <button class="btn btn-ghost" data-a="close">${icon('close')}</button></div>`;
      lb.querySelector('[data-a=prev]').onclick = () => { i = (i - 1 + shots.length) % shots.length; draw(); };
      lb.querySelector('[data-a=next]').onclick = () => { i = (i + 1) % shots.length; draw(); };
      lb.querySelector('[data-a=open]').onclick = () => onyx.gallery.open(s.path);
      lb.querySelector('[data-a=copy]').onclick = async () => { try { await onyx.gallery.copy(s.path); toast(t('Imagen copiada: pégala donde quieras'), 'success'); } catch (e) { toast(t(e.message, e.vars), 'error'); } };
      lb.querySelector('[data-a=close]').onclick = close;
      lb.querySelector('[data-a=del]').onclick = async () => {
        await onyx.gallery.remove(s.path);
        close(); onChange();
      };
    };
    const onKey = (e) => {
      if (e.key === 'Escape') close();
      if (e.key === 'ArrowLeft') { i = (i - 1 + shots.length) % shots.length; draw(); }
      if (e.key === 'ArrowRight') { i = (i + 1) % shots.length; draw(); }
    };
    function close() { lb.remove(); document.removeEventListener('keydown', onKey); }
    document.addEventListener('keydown', onKey);
    lb.addEventListener('mousedown', (e) => { if (e.target === lb) close(); });
    draw();
    document.body.appendChild(lb);
  }

  // ---------- Creadores ----------
  const SOCIAL_ICON = { instagram: 'instagram', discord: 'discord', x: 'xsocial', twitter: 'xsocial', tiktok: 'tiktok', youtube: 'youtube', twitch: 'twitch', github: 'github', web: 'globe' };

  V.creators = async function (root) {
    root.innerHTML = `<div class="page"><h1 class="title">${t('Creadores')}</h1><div id="c-body"></div></div>`;
    const body = root.querySelector('#c-body');
    let list = [];
    try { list = (await onyx.data.get('creators.json')) || []; } catch { /* nada */ }
    if (!Array.isArray(list)) list = list.creators || [];
    if (!list.length) {
      body.innerHTML = html`<div class="center-empty"><div class="ico">${icon('users')}</div><div class="t">${t('Pronto conocerás al equipo')}</div>
        <div class="s">${t('Los creadores se añaden en creators.json del repositorio de datos.')}</div></div>`;
      return;
    }
    body.innerHTML = `<div class="creators">${list.map((c, i) => html`<div class="creator">
      <div class="stage" data-i="${i}"></div>
      <div class="n">${esc(c.name)}</div>
      ${c.handle ? `<div class="h">${esc(c.handle)}</div>` : ''}
      <div class="socials">${Object.entries(c.socials || {}).filter(([, u]) => u).map(([k, u]) =>
        `<button title="${esc(k)}" data-url="${esc(u)}">${icon(SOCIAL_ICON[k] || 'link')}</button>`).join('')}</div>
    </div>`).join('')}</div>`;
    body.querySelectorAll('[data-url]').forEach(b => b.onclick = () => onyx.app.openExternal(b.dataset.url));

    const viewers = [];
    for (const [i, c] of list.entries()) {
      const stage = body.querySelector(`.stage[data-i="${i}"]`);
      const v = new Skin3D.SkinViewer(stage, { rotY: i % 2 ? 22 : -22, zoom: 0.62 });
      viewers.push(v);
      let skin = c.skin, variant = c.model || 'classic';
      if (!skin && c.username) {
        try { const p = await onyx.skins.lookup(c.username); if (p) { skin = p.skin; variant = p.variant; } } catch { /* nada */ }
      }
      v.setSkin(skin, variant);
    }
    return () => viewers.forEach(v => v.destroy());
  };

  // ---------- Consola del juego ----------
  V.console = async function (root) {
    root.innerHTML = html`<div class="page">
      <div class="page-head"><h1 class="title">${t('Consola')}</h1>
        <div class="row"><button class="btn btn-outline btn-sm" id="cl-copy">${icon('copy')}${t('Copiar')}</button>
        <button class="btn btn-outline btn-sm" id="cl-folder">${icon('folder')}${t('Registros del launcher')}</button></div></div>
      <div class="console" id="cl"></div></div>`;
    const box = root.querySelector('#cl');
    const append = (text) => {
      const atBottom = box.scrollHeight - box.scrollTop - box.clientHeight < 40;
      for (const line of String(text).split('\n')) {
        if (!line) continue;
        const d = document.createElement('div');
        if (/\b(ERROR|FATAL|Exception)\b/.test(line)) d.className = 'e'; else if (/\bWARN\b/.test(line)) d.className = 'w';
        d.textContent = line;
        box.appendChild(d);
      }
      while (box.childElementCount > 3000) box.firstChild.remove();
      if (atBottom) box.scrollTop = box.scrollHeight;
    };
    const existing = await onyx.game.log().catch(() => '');
    if (existing) append(existing);
    else box.innerHTML = `<div class="muted">${t('Aquí verás lo que escribe Minecraft cuando juegues.')}</div>`;
    root.querySelector('#cl-copy').onclick = () => { navigator.clipboard.writeText(box.innerText); toast(t('Copiado'), 'success', 1500); };
    root.querySelector('#cl-folder').onclick = () => onyx.app.openPath('logs');
    const off = onyx.game.onLog((txt) => { if (box.querySelector('.muted')) box.innerHTML = ''; append(txt); });
    return off;
  };
})();
