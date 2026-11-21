// Pestaña "Archivos" de una instancia: un explorador con carpetas, subidas, Modrinth y .mrpack.
// Los archivos son una lista de rutas (mods/sodium.jar...). Las carpetas salen de esas rutas,
// más las que se crean a mano (data.dirs), aunque estén vacías.
(function () {
  const MAX = 500 * 1024 * 1024; // igual que MAX_UPLOAD_MB (los grandes se suben en trozos)
  const TEXT = /\.(json5?|toml|txt|cfg|conf|properties|ya?ml|ini|mcmeta|snbt|js|md|csv|lang|xml)$/i;
  const JUNK = /(^|\/)(\.DS_Store|Thumbs\.db|desktop\.ini|__MACOSX\/.*)$/i;
  const MR = 'https://api.modrinth.com/v2';
  const LOADER_MR = { fabric: 'fabric', quilt: 'quilt', forge: 'forge', neoforge: 'neoforge' };
  const mrCache = new Map(); // sha1 → { url, project } | null

  const join = (a, b) => (a ? `${a}/${b}` : b);
  const base = (p) => p.split('/').pop();
  const dirOf = (p) => p.split('/').slice(0, -1).join('/');
  const under = (p, dir) => !dir || p === dir || p.startsWith(dir + '/');
  const absUrl = (u) => (u && u.startsWith('/') ? location.origin + u : u);
  const validName = (n) => !!n && n.length <= 80 && !/[\\/:*?"<>|]/.test(n) && n !== '.' && n !== '..';
  const isModrinth = (f) => /^https:\/\/cdn\.modrinth\.com\//.test(f.url || '');
  const ago = (ts) => (ts ? timeAgo(ts) : '—');

  // ---------------------------------------------------------------- zip (leer y escribir)
  async function unzip(file) {
    const buf = new Uint8Array(await file.arrayBuffer());
    const dv = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);
    let e = buf.length - 22;
    while (e >= 0 && dv.getUint32(e, true) !== 0x06054b50) e--;
    if (e < 0) throw new Error(t('No es un archivo .zip válido'));
    const n = dv.getUint16(e + 10, true);
    let p = dv.getUint32(e + 16, true);
    const out = [];
    const dec = new TextDecoder();
    for (let i = 0; i < n; i++) {
      if (dv.getUint32(p, true) !== 0x02014b50) break;
      const method = dv.getUint16(p + 10, true), csize = dv.getUint32(p + 20, true), usize = dv.getUint32(p + 24, true);
      const nl = dv.getUint16(p + 28, true), xl = dv.getUint16(p + 30, true), cl = dv.getUint16(p + 32, true);
      const off = dv.getUint32(p + 42, true);
      const name = dec.decode(buf.subarray(p + 46, p + 46 + nl)).replace(/\\/g, '/');
      p += 46 + nl + xl + cl;
      if (name.endsWith('/') || JUNK.test(name)) continue;
      out.push({
        name, size: usize,
        async read() {
          const start = off + 30 + dv.getUint16(off + 26, true) + dv.getUint16(off + 28, true);
          const data = buf.subarray(start, start + csize);
          if (method === 0) return data;
          if (method === 8) return new Uint8Array(await new Response(new Blob([data]).stream().pipeThrough(new DecompressionStream('deflate-raw'))).arrayBuffer());
          throw new Error(t('Este .zip usa una compresión no compatible'));
        }
      });
    }
    return out;
  }

  const CRC = (() => { const tb = new Uint32Array(256); for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; tb[n] = c >>> 0; } return tb; })();
  const crc32 = (u8) => { let c = 0xffffffff; for (let i = 0; i < u8.length; i++) c = CRC[(c ^ u8[i]) & 0xff] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; };
  function zip(entries) { // entries: [{ name, data: Uint8Array }] → Blob (sin comprimir)
    const enc = new TextEncoder(), parts = [], central = [];
    let off = 0;
    for (const e of entries) {
      const name = enc.encode(e.name), crc = crc32(e.data), size = e.data.length;
      const h = new DataView(new ArrayBuffer(30));
      h.setUint32(0, 0x04034b50, true); h.setUint16(4, 20, true); h.setUint16(6, 0x0800, true);
      h.setUint32(14, crc, true); h.setUint32(18, size, true); h.setUint32(22, size, true); h.setUint16(26, name.length, true);
      parts.push(h.buffer, name, e.data);
      const c = new DataView(new ArrayBuffer(46));
      c.setUint32(0, 0x02014b50, true); c.setUint16(4, 20, true); c.setUint16(6, 20, true); c.setUint16(8, 0x0800, true);
      c.setUint32(16, crc, true); c.setUint32(20, size, true); c.setUint32(24, size, true); c.setUint16(28, name.length, true); c.setUint32(42, off, true);
      central.push(c.buffer, name);
      off += 30 + name.length + size;
    }
    const csize = central.reduce((a, b) => a + (b.byteLength || b.length), 0);
    const end = new DataView(new ArrayBuffer(22));
    end.setUint32(0, 0x06054b50, true); end.setUint16(8, entries.length, true); end.setUint16(10, entries.length, true);
    end.setUint32(12, csize, true); end.setUint32(16, off, true);
    return new Blob([...parts, ...central, end.buffer], { type: 'application/zip' });
  }

  // Lee lo que se suelta en la página, carpetas incluidas
  async function fromDrop(dt) {
    const roots = [...(dt.items || [])].map(i => i.webkitGetAsEntry && i.webkitGetAsEntry()).filter(Boolean);
    if (!roots.length) return { files: [...dt.files].map(f => ({ file: f, rel: f.name })), dirs: [] };
    const files = [], dirs = [];
    const walk = async (entry, prefix) => {
      if (entry.isFile) { const f = await new Promise((res, rej) => entry.file(res, rej)); files.push({ file: f, rel: prefix + f.name }); return; }
      if (!entry.isDirectory) return;
      const here = prefix + entry.name;
      dirs.push(here);
      const r = entry.createReader();
      let batch;
      do { batch = await new Promise((res, rej) => r.readEntries(res, rej)); for (const e of batch) await walk(e, here + '/'); } while (batch.length);
    };
    for (const e of roots) await walk(e, '');
    return { files, dirs };
  }

  async function pool(items, n, fn, onStep) {
    let i = 0, done = 0;
    const errors = [];
    await Promise.all(Array.from({ length: Math.min(n, items.length) }, async () => {
      while (i < items.length) {
        const it = items[i++];
        try { await fn(it); } catch (e) { errors.push({ it, e }); }
        done++; onStep && onStep(done, items.length, it);
      }
    }));
    return errors;
  }

  const putBlob = (blob, name, type = 'application/octet-stream', onProgress) => uploadBlob(blob, name, type, onProgress);

  // ---------------------------------------------------------------- menú desplegable
  function dropdown(anchor, items) {
    document.querySelectorAll('.fm-menu').forEach(x => x.remove());
    const m = document.createElement('div');
    m.className = 'fm-menu';
    m.innerHTML = items.map((it, i) => it === '-' ? '<hr>' : `<button data-i="${i}" class="${it.danger ? 'danger' : ''}">${icon(it.icon)}<span>${esc(it.label)}${it.hint ? `<small>${esc(it.hint)}</small>` : ''}</span></button>`).join('');
    document.body.appendChild(m);
    const r = anchor.getBoundingClientRect();
    const w = m.offsetWidth, h = m.offsetHeight;
    m.style.left = Math.max(8, Math.min(r.right - w, innerWidth - w - 8)) + 'px';
    m.style.top = (r.bottom + 6 + h > innerHeight ? r.top - h - 6 : r.bottom + 6) + 'px';
    const close = () => { m.remove(); document.removeEventListener('mousedown', out, true); };
    const out = (e) => { if (!m.contains(e.target) && !anchor.contains(e.target)) close(); };
    setTimeout(() => document.addEventListener('mousedown', out, true));
    m.querySelectorAll('button').forEach(b => b.onclick = () => { close(); items[b.dataset.i].run(); });
  }

  // ---------------------------------------------------------------- la pestaña
  window.FilesTab = function (el, { getData, editable, persist }) {
    const st = { cwd: '', q: '', sel: new Set(), sort: { k: 'name', dir: 1 }, busy: null, mr: null, upd: null };
    const D = () => getData();
    const files = () => D().files || [];
    const dirs = () => D().dirs || [];
    const save = (patch) => persist({ files: D().files, dirs: D().dirs, ...patch });

    // Hijos de una carpeta: subcarpetas (con conteo, tamaño y fecha) y archivos
    function children(dir) {
      const folders = new Map(), list = [];
      const pre = dir ? dir + '/' : '';
      const addFolder = (name) => { if (!folders.has(name)) folders.set(name, { name, path: join(dir, name), count: 0, size: 0, at: 0 }); return folders.get(name); };
      for (const f of files()) {
        if (!f.path.startsWith(pre)) continue;
        const rest = f.path.slice(pre.length);
        if (!rest.includes('/')) { list.push(f); continue; }
        const fo = addFolder(rest.split('/')[0]);
        fo.count++; fo.size += f.size || 0; fo.at = Math.max(fo.at, f.at || 0);
      }
      for (const p of dirs()) if (p.startsWith(pre) && p.length > pre.length) addFolder(p.slice(pre.length).split('/')[0]);
      return { folders: [...folders.values()], files: list };
    }
    const allDirs = () => {
      const set = new Set(dirs().flatMap(p => p.split('/').map((_, i, a) => a.slice(0, i + 1).join('/'))));
      for (const f of files()) { const parts = f.path.split('/').slice(0, -1); parts.forEach((_, i) => set.add(parts.slice(0, i + 1).join('/'))); }
      return [...set].sort();
    };

    function sortRows(rows, key) {
      const { k, dir } = st.sort;
      return rows.sort((a, b) => {
        const va = k === 'name' ? key(a).toLowerCase() : k === 'size' ? (a.size || 0) : (a.at || 0);
        const vb = k === 'name' ? key(b).toLowerCase() : k === 'size' ? (b.size || 0) : (b.at || 0);
        return (va < vb ? -1 : va > vb ? 1 : 0) * dir;
      });
    }

    function origin(f) {
      if (isModrinth(f)) return `<span class="fm-tag mr">${icon('modrinth')}Modrinth</span>`;
      if ((f.url || '').startsWith('/m/')) return `<span class="fm-tag">${t('Subido')}</span>`;
      return `<span class="fm-tag mute">${t('Enlace')}</span>`;
    }

    // ------------------------------------------------ dibujo
    function draw() {
      const all = files();
      const total = all.reduce((a, f) => a + (f.size || 0), 0);
      const nMr = all.filter(isModrinth).length;
      const crumbs = st.cwd ? st.cwd.split('/') : [];
      let folders, list;
      if (st.q) {
        const q = st.q.toLowerCase();
        folders = allDirs().filter(p => under(p, st.cwd) && p !== st.cwd && base(p).toLowerCase().includes(q)).map(p => ({ name: base(p), path: p, ...stats(p), deep: true }));
        list = all.filter(f => under(f.path, st.cwd) && base(f.path).toLowerCase().includes(q)).map(f => ({ ...f, deep: true }));
      } else ({ folders, files: list } = children(st.cwd));
      folders = sortRows(folders, x => x.name);
      list = sortRows(list.slice(), x => base(x.path));
      const keys = [...folders.map(f => 'd:' + f.path), ...list.map(f => 'f:' + f.path)];
      for (const k of [...st.sel]) if (!keys.includes(k)) st.sel.delete(k);
      const allOn = keys.length && keys.every(k => st.sel.has(k));
      const arrow = (k) => st.sort.k === k ? icon('chevDown') : '';
      const mrBanner = st.mr && st.mr.length && editable
        ? `<div class="fm-banner">${icon('modrinth')}<span>${t('{n} archivos subidos también están en Modrinth ({size}). Con el enlace de Modrinth se descargan más rápido y no ocupan espacio.', { n: st.mr.length, size: fmtSize(st.mr.reduce((a, x) => a + (x.f.size || 0), 0)) })}</span><button class="btn sm" id="fm-tomr">${t('Pasar a Modrinth')}</button></div>` : '';

      const updBanner = st.upd && st.upd.length && editable
        ? `<div class="fm-banner upd">${icon('refresh')}<span>${st.upd.length === 1 ? t('1 mod tiene versión nueva para Minecraft {mc}.', { mc: esc(D().minecraft) }) : t('{n} mods tienen versión nueva para Minecraft {mc}.', { n: st.upd.length, mc: esc(D().minecraft) })}</span><button class="btn sm primary" id="fm-upd">${t('Ver y actualizar')}</button></div>` : '';

      el.innerHTML = html`<div class="card fm">
        <div class="fm-head">
          <div><h3>${icon('folder')}${t('Archivos')}</h3><p class="sub">${t('Mods, configuración y mundos que recibe el jugador. Solo se descarga lo que cambia.')}</p></div>
          <span class="grow"></span>
          <span class="fm-stats">${t('{n} archivos', { n: all.length })}${total ? ` · ${fmtSize(total)}` : ''}${nMr ? ` · ${t('{n} de Modrinth', { n: nMr })}` : ''}</span>
          <button class="btn sm" id="fm-export" ${all.length ? '' : 'disabled'}>${icon('download')}${t('Exportar')}</button>
        </div>
        ${updBanner}${mrBanner}
        <div class="fm-bar">
          <nav class="fm-crumbs"><a href="#" data-cd="">${icon('home')}${t('raíz')}</a>${crumbs.map((c, i) => `<span class="sep">${icon('chevRight')}</span><a href="#" data-cd="${esc(crumbs.slice(0, i + 1).join('/'))}">${esc(c)}</a>`).join('')}</nav>
          <span class="grow"></span>
          <label class="fm-search">${icon('search')}<input id="fm-q" placeholder="${t('Buscar…')}" value="${esc(st.q)}"></label>
          ${editable ? `<button class="btn sm fm-modsbtn" id="fm-mods">${icon('modrinth')}${t('Buscar mods')}</button>
          <button class="btn sm" id="fm-new">${icon('plus')}${t('Nuevo')}${icon('chevDown')}</button>
          <button class="btn sm" id="fm-imp">${icon('download')}${t('Importar')}${icon('chevDown')}</button>
          <button class="btn sm primary" id="fm-up">${icon('upload')}${t('Subir')}${icon('chevDown')}</button>` : ''}
        </div>
        ${st.sel.size && editable ? `<div class="fm-selbar"><b>${t('{n} seleccionados', { n: st.sel.size })}</b><span class="grow"></span>
          <button class="btn sm" id="fm-mv">${icon('move')}${t('Mover')}</button><button class="btn sm danger" id="fm-rm">${icon('trash')}${t('Borrar')}</button><button class="btn sm ghost" id="fm-unsel">${t('Cancelar')}</button></div>` : ''}
        <div class="fm-prog" id="fm-prog" ${st.busy ? '' : 'hidden'}><div class="progress"><i style="width:${st.busy ? st.busy.pct : 0}%"></i></div><span>${st.busy ? esc(st.busy.text) : ''}</span></div>
        <div class="fm-list" id="fm-drop">
          <div class="fm-row fm-th">
            <span>${editable ? `<input type="checkbox" id="fm-all" ${allOn ? 'checked' : ''}>` : ''}</span>
            <a href="#" data-sort="name" class="${st.sort.k === 'name' ? 'on' : ''} ${st.sort.dir < 0 ? 'desc' : ''}">${t('Nombre')}${arrow('name')}</a>
            <a href="#" data-sort="size" class="${st.sort.k === 'size' ? 'on' : ''} ${st.sort.dir < 0 ? 'desc' : ''}">${t('Tamaño')}${arrow('size')}</a>
            <a href="#" data-sort="at" class="${st.sort.k === 'at' ? 'on' : ''} ${st.sort.dir < 0 ? 'desc' : ''}">${t('Modificado')}${arrow('at')}</a>
            <span></span>
          </div>
          ${st.cwd && !st.q ? `<div class="fm-row fm-up" data-cd="${esc(dirOf(st.cwd))}"><span></span><span class="fm-name">${icon('chevLeft')}<b>..</b></span><span></span><span></span><span></span></div>` : ''}
          ${folders.map(f => html`<div class="fm-row ${st.sel.has('d:' + f.path) ? 'sel' : ''}" data-key="d:${esc(f.path)}">
            <span>${editable ? `<input type="checkbox" data-pick="d:${esc(f.path)}" ${st.sel.has('d:' + f.path) ? 'checked' : ''}>` : ''}</span>
            <a href="#" class="fm-name" data-cd="${esc(f.path)}"><span class="fi dir">${icon('folder')}</span><b>${esc(f.name)}</b>${f.count ? `<span class="fm-count">${f.count}</span>` : ''}${f.deep ? `<small>${esc(dirOf(f.path) || t('raíz'))}</small>` : ''}</a>
            <span class="fm-num">${f.size ? fmtSize(f.size) : '—'}</span><span class="fm-num">${ago(f.at)}</span>
            <span class="fm-act">${editable ? `<button class="btn sm icon ghost" data-menu="d:${esc(f.path)}">${icon('more')}</button>` : ''}</span></div>`).join('')}
          ${list.map(f => html`<div class="fm-row ${st.sel.has('f:' + f.path) ? 'sel' : ''}" data-key="f:${esc(f.path)}">
            <span>${editable ? `<input type="checkbox" data-pick="f:${esc(f.path)}" ${st.sel.has('f:' + f.path) ? 'checked' : ''}>` : ''}</span>
            <a href="#" class="fm-name" data-open="${esc(f.path)}"><span class="fi">${icon(TEXT.test(f.path) ? 'edit' : /\.jar$/i.test(f.path) ? 'puzzle' : 'file')}</span><b>${esc(base(f.path))}</b>${origin(f)}${f.deep ? `<small>${esc(dirOf(f.path) || t('raíz'))}</small>` : ''}</a>
            <span class="fm-num">${fmtSize(f.size)}</span><span class="fm-num">${ago(f.at)}</span>
            <span class="fm-act"><button class="btn sm icon ghost" data-menu="f:${esc(f.path)}">${icon('more')}</button></span></div>`).join('')}
          ${!folders.length && !list.length ? `<div class="fm-empty">${st.q ? `<p>${t('Nada coincide con «{q}».', { q: esc(st.q) })}</p>` : html`<div class="ic">${icon('folder')}</div><h4>${st.cwd ? t('Carpeta vacía') : t('Sin archivos')}</h4>
            <p>${editable ? t('Arrastra aquí archivos o carpetas, o usa Subir. Para mods, pulsa Buscar mods.') : t('Todavía no hay archivos.')}</p>${editable && !st.cwd ? `<button class="btn primary" id="fm-mods2" style="margin-top:12px">${icon('modrinth')}${t('Buscar mods')}</button>` : ''}`}</div>` : ''}
        </div>
        <p class="help" style="margin:12px 0 0">${t('Máximo 500 MB por archivo subido. Los mods también se pueden añadir desde Modrinth o con un enlace.')}</p>
      </div>`;
      bind();
    }
    function stats(p) {
      let count = 0, size = 0, at = 0;
      for (const f of files()) if (f.path.startsWith(p + '/')) { count++; size += f.size || 0; at = Math.max(at, f.at || 0); }
      return { count, size, at };
    }
    const setProg = (pct, text) => {
      st.busy = { pct, text };
      const box = $('#fm-prog', el);
      if (!box) return;
      box.hidden = false;
      box.querySelector('i').style.width = pct + '%';
      box.querySelector('span').textContent = text;
    };
    const endProg = () => { st.busy = null; const box = $('#fm-prog', el); if (box) box.hidden = true; };

    // ------------------------------------------------ eventos
    function bind() {
      $$('[data-cd]', el).forEach(a => a.onclick = (e) => { e.preventDefault(); st.cwd = a.dataset.cd; st.q = ''; st.sel.clear(); draw(); });
      $$('[data-sort]', el).forEach(a => a.onclick = (e) => { e.preventDefault(); const k = a.dataset.sort; st.sort = { k, dir: st.sort.k === k ? -st.sort.dir : 1 }; draw(); });
      const q = $('#fm-q', el);
      q.oninput = () => { st.q = q.value.trim(); const pos = q.selectionStart; draw(); const n = $('#fm-q', el); n.focus(); n.setSelectionRange(pos, pos); };
      $$('[data-pick]', el).forEach(c => c.onchange = () => { c.checked ? st.sel.add(c.dataset.pick) : st.sel.delete(c.dataset.pick); draw(); });
      const all = $('#fm-all', el);
      if (all) all.onchange = () => { $$('[data-pick]', el).forEach(c => all.checked ? st.sel.add(c.dataset.pick) : st.sel.delete(c.dataset.pick)); draw(); };
      $$('[data-open]', el).forEach(a => a.onclick = (e) => { e.preventDefault(); openFile(files().find(f => f.path === a.dataset.open)); });
      $$('[data-menu]', el).forEach(b => b.onclick = () => rowMenu(b, b.dataset.menu));
      const on = (id, fn) => { const b = $(id, el); if (b) b.onclick = () => fn(b); };
      on('#fm-new', (b) => dropdown(b, [
        { icon: 'folderPlus', label: t('Carpeta'), run: newFolder },
        { icon: 'filePlus', label: t('Archivo de texto'), hint: t('options.txt, un .json de config…'), run: newText }
      ]));
      on('#fm-imp', (b) => dropdown(b, [
        { icon: 'modrinth', label: t('Desde Modrinth'), hint: t('Busca mods, resource packs o shaders'), run: modrinthModal },
        { icon: 'package', label: t('Modpack .mrpack'), hint: t('Añade todos sus mods y ajustes'), run: () => pickOne('.mrpack,.zip').then(f => f && importMrpack(f)) },
        { icon: 'box', label: t('Archivo .zip'), hint: t('Lo descomprime en esta carpeta'), run: () => pickOne('.zip').then(f => f && importZip(f)) },
        { icon: 'link', label: t('Enlace de descarga'), run: linkModal }
      ]));
      on('#fm-up', (b) => dropdown(b, [
        { icon: 'file', label: t('Archivos'), run: () => pickMany(false) },
        { icon: 'folder', label: t('Carpeta entera'), hint: t('Con todo lo que tenga dentro'), run: () => pickMany(true) }
      ]));
      on('#fm-export', exportZip);
      on('#fm-tomr', toModrinth);
      on('#fm-mods', () => modrinthModal());
      on('#fm-mods2', () => modrinthModal());
      on('#fm-upd', updatesModal);
      on('#fm-unsel', () => { st.sel.clear(); draw(); });
      on('#fm-rm', () => removeKeys([...st.sel]));
      on('#fm-mv', () => moveModal([...st.sel]));
      const drop = $('#fm-drop', el);
      if (editable) {
        drop.ondragover = (e) => { e.preventDefault(); drop.classList.add('over'); };
        drop.ondragleave = (e) => { if (!drop.contains(e.relatedTarget)) drop.classList.remove('over'); };
        drop.ondrop = async (e) => {
          e.preventDefault(); drop.classList.remove('over');
          if (st.busy) return;
          const got = await fromDrop(e.dataTransfer);
          uploadMany(got.files, got.dirs.map(d => join(st.cwd, d)));
        };
      }
    }

    function rowMenu(btn, key) {
      const isDir = key.startsWith('d:'), path = key.slice(2);
      const f = !isDir && files().find(x => x.path === path);
      const items = [];
      if (isDir) items.push({ icon: 'folder', label: t('Abrir'), run: () => { st.cwd = path; st.q = ''; st.sel.clear(); draw(); } });
      else {
        if (TEXT.test(path)) items.push({ icon: 'edit', label: editable ? t('Editar') : t('Ver'), run: () => openFile(f) });
        items.push({ icon: 'download', label: t('Descargar'), run: () => download(f) });
        items.push({ icon: 'link', label: t('Copiar enlace'), run: () => copy(absUrl(f.url)) });
      }
      if (editable) {
        items.push('-');
        items.push({ icon: 'edit', label: t('Cambiar nombre'), run: () => renameModal(key) });
        items.push({ icon: 'move', label: t('Mover a…'), run: () => moveModal([key]) });
        items.push({ icon: 'trash', label: t('Borrar'), danger: true, run: () => removeKeys([key]) });
      }
      dropdown(btn, items);
    }

    // ------------------------------------------------ acciones
    const pickOne = (accept) => new Promise((res) => { const i = document.createElement('input'); i.type = 'file'; i.accept = accept; i.onchange = () => res(i.files[0] || null); i.click(); });
    function pickMany(folder) {
      const i = document.createElement('input');
      i.type = 'file'; i.multiple = true;
      if (folder) i.webkitdirectory = true;
      i.onchange = () => {
        const list = [...i.files].map(f => ({ file: f, rel: f.webkitRelativePath || f.name }));
        const dirSet = new Set();
        for (const x of list) { const parts = x.rel.split('/').slice(0, -1); parts.forEach((_, k) => dirSet.add(join(st.cwd, parts.slice(0, k + 1).join('/')))); }
        uploadMany(list, [...dirSet]);
      };
      i.click();
    }

    // Sube archivos (con su ruta relativa) a la carpeta actual
    async function uploadMany(list, newDirs = [], target = st.cwd) {
      list = list.filter(x => !JUNK.test(x.rel));
      const big = list.filter(x => x.file.size > MAX);
      const ok = list.filter(x => x.file.size <= MAX && x.file.size > 0);
      if (!ok.length && !newDirs.length) { if (big.length) tooBig(big); return; }
      const done = [];
      setProg(0, t('Subiendo {i} de {n}…', { i: 0, n: ok.length }));
      const errs = await pool(ok, 4, async (x) => {
        // Los archivos grandes enseñan su propio progreso mientras suben
        const big1 = x.file.size > 20 * 1048576 ? (f) => setProg(Math.round(f * 100), t('Subiendo {name} · {p}%', { name: x.rel, p: Math.round(f * 100) })) : null;
        const r = await putBlob(x.file, x.file.name, x.file.type || 'application/octet-stream', big1);
        done.push({ path: join(target, x.rel), url: r.url, sha1: r.sha1, size: r.size, name: x.file.name, at: Date.now() });
      }, (i, n, x) => setProg(Math.round(i / n * 100), t('Subiendo {i} de {n} · {name}', { i, n, name: x.rel })));
      const d = D();
      const paths = new Set(done.map(f => f.path));
      d.files = [...d.files.filter(f => !paths.has(f.path)), ...done];
      d.dirs = [...new Set([...dirs(), ...newDirs])];
      try { await save(); } catch (e) { endProg(); return fail(e); }
      endProg(); draw();
      if (done.length) toast(t('{n} archivos subidos', { n: done.length }));
      if (errs.length) toast(t('{n} archivos no se pudieron subir: {e}', { n: errs.length, e: errs[0].e.message }), 'err');
      if (big.length) tooBig(big);
      checkModrinth();
    }
    function tooBig(big) {
      modal((m, close) => {
        m.innerHTML = html`<div class="mh"><h3>${icon('alert')}${t('Archivos de más de 500 MB')}</h3></div><div class="mb">
          <p style="margin:0 0 10px">${t('Estos no se han subido. Si son mods, búscalos en Importar → Modrinth; si no, súbelos a otro sitio y añádelos con un enlace.')}</p>
          <ul class="fm-biglist">${big.map(x => `<li><span>${esc(x.rel)}</span><b>${fmtSize(x.file.size)}</b></li>`).join('')}</ul></div>
          <div class="mf"><button class="btn primary" id="ok">${t('Entendido')}</button></div>`;
        $('#ok', m).onclick = close;
      });
    }

    function nameModal({ title, ico, label, value = '', ok }) {
      return new Promise((resolve) => modal((m, close) => {
        m.innerHTML = html`<div class="mh"><h3>${icon(ico)}${esc(title)}</h3></div><div class="mb">
          <div class="field"><span class="label">${esc(label)}</span><input class="input mono" id="nm" value="${esc(value)}" maxlength="80"></div></div>
          <div class="mf"><button class="btn" id="no">${t('Cancelar')}</button><button class="btn primary" id="yes">${esc(ok)}</button></div>`;
        const i = $('#nm', m);
        const dot = value.lastIndexOf('.');
        setTimeout(() => { i.focus(); i.setSelectionRange(0, dot > 0 ? dot : value.length); }, 50);
        const go = () => { const v = i.value.trim(); if (!validName(v)) return toast(t('Ese nombre no vale: sin / \\ : * ? " < > |'), 'err'); close(); resolve(v); };
        $('#no', m).onclick = () => { close(); resolve(null); };
        $('#yes', m).onclick = go;
        i.onkeydown = (e) => { if (e.key === 'Enter') go(); };
      }));
    }
    const exists = (p) => files().some(f => f.path === p || f.path.startsWith(p + '/')) || dirs().some(x => x === p || x.startsWith(p + '/'));

    async function newFolder() {
      const n = await nameModal({ title: t('Nueva carpeta'), ico: 'folderPlus', label: t('Nombre'), ok: t('Crear') });
      if (!n) return;
      const p = join(st.cwd, n);
      if (exists(p)) return toast(t('Ya existe algo con ese nombre'), 'err');
      D().dirs = [...dirs(), p];
      try { await save(); toast(t('Carpeta creada')); draw(); } catch (e) { fail(e); }
    }
    async function newText() {
      const n = await nameModal({ title: t('Nuevo archivo de texto'), ico: 'filePlus', label: t('Nombre'), value: 'options.txt', ok: t('Crear') });
      if (!n) return;
      const p = join(st.cwd, n);
      if (files().some(f => f.path === p)) return toast(t('Ya existe algo con ese nombre'), 'err');
      editor(p, '');
    }

    async function renameModal(key) {
      const isDir = key.startsWith('d:'), path = key.slice(2);
      const n = await nameModal({ title: t('Cambiar nombre'), ico: 'edit', label: t('Nombre nuevo'), value: base(path), ok: t('Guardar') });
      if (!n || n === base(path)) return;
      const to = join(dirOf(path), n);
      if (exists(to)) return toast(t('Ya existe algo con ese nombre'), 'err');
      relocate([[key, to]]);
    }
    // Cambia rutas: [[clave, rutaNueva]]
    async function relocate(pairs) {
      const d = D();
      for (const [key, to] of pairs) {
        const from = key.slice(2);
        if (key.startsWith('d:')) {
          d.files = d.files.map(f => under(f.path, from) ? { ...f, path: to + f.path.slice(from.length), at: Date.now() } : f);
          d.dirs = d.dirs.map(x => under(x, from) ? to + x.slice(from.length) : x);
        } else d.files = d.files.map(f => f.path === from ? { ...f, path: to, at: Date.now() } : f);
      }
      // si dos acaban en la misma ruta, gana el último
      const seen = new Map(); for (const f of d.files) seen.set(f.path, f); d.files = [...seen.values()];
      d.dirs = [...new Set(d.dirs)];
      st.sel.clear();
      try { await save(); draw(); toast(t('Hecho')); } catch (e) { fail(e); }
    }
    function moveModal(keys) {
      const options = ['', ...allDirs()].filter(p => !keys.some(k => k.startsWith('d:') && under(p, k.slice(2))));
      modal((m, close) => {
        m.innerHTML = html`<div class="mh"><h3>${icon('move')}${t('Mover {n} elementos', { n: keys.length })}</h3></div><div class="mb">
          <div class="field"><span class="label">${t('Carpeta de destino')}</span><select class="input" id="to">${options.map(p => `<option value="${esc(p)}" ${p === st.cwd ? 'selected' : ''}>${esc(p || t('raíz'))}</option>`).join('')}</select></div>
          <div class="field"><span class="label">${t('O escribe una carpeta nueva')}</span><input class="input mono" id="tonew" placeholder="mods/opcionales"></div></div>
          <div class="mf"><button class="btn" id="no">${t('Cancelar')}</button><button class="btn primary" id="yes">${t('Mover')}</button></div>`;
        $('#no', m).onclick = close;
        $('#yes', m).onclick = () => {
          const typed = $('#tonew', m).value.trim().replace(/\\/g, '/').replace(/^\/+|\/+$/g, '');
          if (typed && typed.split('/').some(x => !validName(x))) return toast(t('Ese nombre no vale: sin / \\ : * ? " < > |'), 'err');
          const dest = typed || $('#to', m).value;
          close();
          relocate(keys.map(k => [k, join(dest, base(k.slice(2)))]).filter(([k, to]) => k.slice(2) !== to));
        };
      });
    }
    async function removeKeys(keys) {
      const nFiles = files().filter(f => keys.some(k => k.startsWith('d:') ? under(f.path, k.slice(2)) : f.path === k.slice(2))).length;
      const ok = await confirmBox({ title: t('¿Borrar?'), text: t('Se quitarán {n} archivos de la instancia. Los jugadores dejarán de recibirlos.', { n: nFiles }), ok: t('Borrar'), danger: true, ico: 'trash' });
      if (!ok) return;
      const d = D();
      const gone = (p) => keys.some(k => k.startsWith('d:') ? under(p, k.slice(2)) : p === k.slice(2));
      d.files = d.files.filter(f => !gone(f.path));
      d.dirs = d.dirs.filter(x => !gone(x));
      st.sel.clear();
      try { await save(); draw(); toast(t('Borrado')); } catch (e) { fail(e); }
    }

    function download(f) {
      const a = document.createElement('a');
      a.href = absUrl(f.url); a.download = base(f.path); a.target = '_blank'; a.rel = 'noopener';
      document.body.appendChild(a); a.click(); a.remove();
    }
    async function openFile(f) {
      if (!f) return;
      if (!TEXT.test(f.path)) return download(f);
      if (f.size > 1024 * 1024) return toast(t('Es demasiado grande para editarlo aquí'), 'err');
      try {
        const r = await fetch(absUrl(f.url));
        if (!r.ok) throw new Error(r.status);
        editor(f.path, await r.text(), f);
      } catch { toast(t('No se pudo abrir el archivo'), 'err'); }
    }
    function editor(path, text, existing) {
      modal((m, close) => {
        m.innerHTML = html`<div class="mh"><h3>${icon('edit')}<span class="mono" style="font-size:14px">${esc(path)}</span></h3><button class="btn sm icon ghost" id="x">${icon('x')}</button></div>
          <div class="mb" style="padding:0"><textarea class="fm-editor" id="tx" spellcheck="false" ${editable ? '' : 'readonly'}></textarea></div>
          <div class="mf"><span class="help grow" style="margin:0">${t('Al guardar, los jugadores reciben la versión nueva la próxima vez que jueguen.')}</span>
            <button class="btn" id="no">${editable ? t('Cancelar') : t('Cerrar')}</button>${editable ? `<button class="btn primary" id="yes">${icon('check')}${t('Guardar')}</button>` : ''}</div>`;
        const ta = $('#tx', m);
        ta.value = text;
        ta.onkeydown = (e) => { if (e.key === 'Tab') { e.preventDefault(); const s = ta.selectionStart; ta.setRangeText('  ', s, ta.selectionEnd, 'end'); } };
        $('#x', m).onclick = close; $('#no', m).onclick = close;
        const yes = $('#yes', m);
        if (yes) yes.onclick = async () => {
          busy(yes, true);
          try {
            const r = await putBlob(new Blob([ta.value], { type: 'text/plain' }), base(path), 'text/plain');
            const d = D();
            d.files = [...d.files.filter(f => f.path !== path), { path, url: r.url, sha1: r.sha1, size: r.size, name: base(path), at: Date.now() }];
            await save(); close(); draw(); toast(existing ? t('Archivo guardado') : t('Archivo creado'));
          } catch (e) { busy(yes, false); fail(e); }
        };
      }, { wide: true });
    }

    function linkModal() {
      const guess = (name) => st.cwd ? join(st.cwd, name) : /\.jar$/i.test(name) ? `mods/${name}` : /\.zip$/i.test(name) ? `resourcepacks/${name}` : name;
      modal((m, close) => {
        m.innerHTML = html`<div class="mh"><h3>${icon('link')}${t('Añadir por enlace')}</h3></div><div class="mb">
          <div class="field"><span class="label">${t('Enlace de descarga')}</span><input class="input" id="u" placeholder="https://cdn.modrinth.com/data/…/sodium.jar"></div>
          <div class="field"><span class="label">${t('Ruta en el PC del jugador')}</span><input class="input mono" id="p" placeholder="mods/sodium.jar"></div></div>
          <div class="mf"><button class="btn" id="no">${t('Cancelar')}</button><button class="btn primary" id="yes">${t('Añadir')}</button></div>`;
        const u = $('#u', m), p = $('#p', m);
        u.oninput = () => { if (!p.dataset.touched) { const n = decodeURIComponent(u.value.split('?')[0].split('/').pop() || ''); p.value = n ? guess(n) : ''; } };
        p.oninput = () => { p.dataset.touched = 1; };
        $('#no', m).onclick = close;
        $('#yes', m).onclick = async () => {
          if (!/^https:\/\//.test(u.value.trim())) return toast(t('El enlace debe empezar por https://'), 'err');
          const path = p.value.trim().replace(/\\/g, '/').replace(/^\/+/, '');
          if (!path || path.split('/').some(x => !validName(x))) return toast(t('Escribe la ruta del archivo'), 'err');
          const d = D();
          d.files = [...d.files.filter(f => f.path !== path), { path, url: u.value.trim(), sha1: null, size: null, name: base(path), at: Date.now() }];
          try { await save(); close(); draw(); toast(t('Archivo añadido')); } catch (e) { fail(e); }
        };
      });
    }

    // ------------------------------------------------ Modrinth
    const mrJson = async (path, init) => { const r = await fetch(MR + path, init); if (!r.ok) throw new Error('Modrinth ' + r.status); return r.json(); };
    async function pickVersion(projectId, type) {
      const d = D();
      const params = new URLSearchParams({ game_versions: JSON.stringify([d.minecraft]) });
      const lo = LOADER_MR[d.loader && d.loader.type];
      if (type === 'mod' && lo) params.set('loaders', JSON.stringify([lo]));
      const vs = await mrJson(`/project/${projectId}/version?${params}`);
      return vs.find(v => v.version_type === 'release') || vs[0] || null;
    }
    const folderFor = (type) => ({ mod: 'mods', resourcepack: 'resourcepacks', shader: 'shaderpacks', datapack: 'datapacks' }[type] || 'mods');
    // Añade un proyecto de Modrinth y sus dependencias obligatorias
    async function addFromModrinth(project, type, added = new Set()) {
      if (added.has(project)) return [];
      added.add(project);
      const v = await pickVersion(project, type);
      if (!v) return null;
      const file = v.files.find(f => f.primary) || v.files[0];
      const out = [{ path: `${folderFor(type)}/${file.filename}`, url: file.url, sha1: file.hashes.sha1, size: file.size, name: file.filename, at: Date.now(), mr: v.project_id }];
      for (const dep of v.dependencies || []) {
        if (dep.dependency_type !== 'required' || !dep.project_id) continue;
        if (files().some(f => f.mr === dep.project_id)) continue;
        const more = await addFromModrinth(dep.project_id, 'mod', added).catch(() => null);
        if (more) out.push(...more);
      }
      return out;
    }
    function modrinthModal() {
      const d = D();
      let type = 'mod', timer = null;
      modal((m, close) => {
        m.innerHTML = html`<div class="mh"><h3>${icon('modrinth')}${t('Añadir desde Modrinth')}</h3><button class="btn sm icon ghost" id="x">${icon('x')}</button></div>
          <div class="mb">
            <div class="fm-mrbar"><div class="seg" id="ty">${[['mod', t('Mods')], ['resourcepack', t('Resource packs')], ['shader', t('Shaders')]].map(([k, l]) => `<button data-ty="${k}" class="${k === type ? 'on' : ''}">${l}</button>`).join('')}</div>
              <label class="fm-search grow">${icon('search')}<input id="q" placeholder="${t('Buscar en Modrinth…')}"></label></div>
            <p class="help" style="margin:10px 0 12px">${t('Solo salen versiones para Minecraft {mc}{loader}. Las dependencias obligatorias se añaden solas.', { mc: esc(d.minecraft), loader: d.loader && d.loader.type !== 'vanilla' ? ' · ' + esc(d.loader.type) : '' })}</p>
            <div class="fm-mrlist" id="res"><p class="help">${t('Escribe para buscar.')}</p></div></div>`;
        $('#x', m).onclick = close;
        const q = $('#q', m), res = $('#res', m);
        const search = async () => {
          const facets = [[`project_type:${type}`], [`versions:${d.minecraft}`]];
          const lo = LOADER_MR[d.loader && d.loader.type];
          if (type === 'mod' && lo) facets.push([`categories:${lo}`]);
          res.innerHTML = `<p class="help">${t('Buscando…')}</p>`;
          try {
            const r = await mrJson(`/search?limit=20&index=relevance&query=${encodeURIComponent(q.value.trim())}&facets=${encodeURIComponent(JSON.stringify(facets))}`);
            const have = new Set(files().map(f => f.mr).filter(Boolean));
            res.innerHTML = r.hits.length ? r.hits.map(h => html`<div class="fm-mr">
              ${h.icon_url ? `<img src="${esc(h.icon_url)}" alt="">` : `<span class="ph">${icon('box')}</span>`}
              <div class="grow"><b>${esc(h.title)}</b><p>${esc(h.description)}</p><small>${t('{n} descargas', { n: Number(h.downloads).toLocaleString(I18N.locale()) })} · ${esc(h.author)}</small></div>
              <button class="btn sm ${have.has(h.project_id) ? '' : 'primary'}" data-add="${esc(h.project_id)}" ${have.has(h.project_id) ? 'disabled' : ''}>${have.has(h.project_id) ? icon('check') + t('Añadido') : icon('plus') + t('Añadir')}</button></div>`).join('')
              : `<p class="help">${t('No hay resultados para esta versión.')}</p>`;
            $$('[data-add]', res).forEach(b => b.onclick = async () => {
              busy(b, true);
              try {
                const got = await addFromModrinth(b.dataset.add, type);
                if (!got) { busy(b, false); return toast(t('No hay versión para Minecraft {mc}', { mc: d.minecraft }), 'err'); }
                const dd = D();
                const paths = new Set(got.map(f => f.path));
                dd.files = [...dd.files.filter(f => !paths.has(f.path)), ...got];
                await save();
                b.classList.remove('busy', 'primary'); b.innerHTML = icon('check') + t('Añadido');
                toast(got.length > 1 ? t('{name} añadido (+{n} dependencias)', { name: got[0].name, n: got.length - 1 }) : t('{name} añadido', { name: got[0].name }));
                draw();
                checkUpdates();
              } catch (e) { busy(b, false); fail(e); }
            });
          } catch { res.innerHTML = `<p class="help">${t('No se pudo conectar con Modrinth.')}</p>`; }
        };
        q.oninput = () => { clearTimeout(timer); timer = setTimeout(search, 300); };
        $$('[data-ty]', m).forEach(b => b.onclick = () => { type = b.dataset.ty; $$('[data-ty]', m).forEach(x => x.classList.toggle('on', x === b)); search(); });
        search();
      }, { wide: true });
    }

    // Archivos subidos que también están en Modrinth (por su huella SHA-1)
    async function checkModrinth() {
      const mine = files().filter(f => (f.url || '').startsWith('/m/') && f.sha1);
      const ask = [...new Set(mine.map(f => f.sha1).filter(h => !mrCache.has(h)))];
      try {
        for (let i = 0; i < ask.length; i += 500) {
          const part = ask.slice(i, i + 500);
          const r = await mrJson('/version_files', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ hashes: part, algorithm: 'sha1' }) });
          for (const h of part) {
            const v = r[h];
            const file = v && v.files.find(x => x.hashes && x.hashes.sha1 === h);
            mrCache.set(h, file ? { url: file.url, project: v.project_id } : null);
          }
        }
      } catch { return; }
      const before = st.mr ? st.mr.length : 0;
      st.mr = mine.map(f => ({ f, hit: mrCache.get(f.sha1) })).filter(x => x.hit);
      if (st.mr.length !== before && !st.busy) draw();
    }
    // Mods de Modrinth con versión nueva para esta versión de Minecraft y este loader (de una vez, por su huella)
    async function checkUpdates() {
      const d = D();
      const lo = LOADER_MR[d.loader && d.loader.type];
      const mods = files().filter(f => isModrinth(f) && f.sha1 && /\.jar$/i.test(f.path) && f.path.startsWith('mods/'));
      if (!lo || !mods.length) { if (st.upd && st.upd.length) { st.upd = []; draw(); } return; }
      const out = [];
      try {
        for (let i = 0; i < mods.length; i += 500) {
          const part = mods.slice(i, i + 500);
          const r = await mrJson('/version_files/update', { method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ hashes: part.map(f => f.sha1), algorithm: 'sha1', loaders: [lo], game_versions: [d.minecraft] }) });
          for (const f of part) {
            const v = r[f.sha1];
            if (!v) continue;
            const nf = v.files.find(x => x.primary) || v.files[0];
            if (!nf || nf.hashes.sha1 === f.sha1) continue;
            out.push({ f, v, nf });
          }
        }
      } catch { return; }
      // ¿cómo se llaman? (para enseñar el nombre bonito y el icono)
      const ids = [...new Set(out.map(x => x.v.project_id))];
      if (ids.length) {
        try {
          const ps = await mrJson(`/projects?ids=${encodeURIComponent(JSON.stringify(ids))}`);
          const by = Object.fromEntries(ps.map(p => [p.id, p]));
          out.forEach(x => { const p = by[x.v.project_id]; x.title = p ? p.title : base(x.f.path); x.icon = p && p.icon_url; });
        } catch { out.forEach(x => { x.title = base(x.f.path); }); }
      }
      const had = st.upd ? st.upd.length : -1;
      st.upd = out;
      if (out.length !== had && !st.busy) draw();
    }

    function updatesModal() {
      const list = st.upd || [];
      const pick = new Set(list.map(x => x.f.path));
      modal((m, close) => {
        const paint = () => {
          m.innerHTML = html`<div class="mh"><h3>${icon('refresh')}${t('Actualizar mods')}</h3><button class="btn sm icon ghost" id="x">${icon('x')}</button></div>
            <div class="mb">
              <p class="help" style="margin:0 0 12px">${t('Versiones nuevas de Modrinth para Minecraft {mc}. Los jugadores descargan solo los mods que cambian.', { mc: esc(D().minecraft) })}</p>
              <label class="fm-uall"><input type="checkbox" id="ua" ${pick.size === list.length ? 'checked' : ''}><b>${t('Todos')}</b><span class="muted">${pick.size} / ${list.length}</span></label>
              <div class="fm-ulist">${list.map(x => html`<label class="fm-u">
                <input type="checkbox" data-u="${esc(x.f.path)}" ${pick.has(x.f.path) ? 'checked' : ''}>
                ${x.icon ? `<img src="${esc(x.icon)}" alt="">` : `<span class="ph">${icon('puzzle')}</span>`}
                <div class="grow"><b>${esc(x.title || base(x.f.path))}</b>
                  <span class="fm-uv"><s>${esc(base(x.f.path))}</s>${icon('chevRight')}<em>${esc(x.nf.filename)}</em></span></div>
                <span class="fm-tag ${x.v.version_type === 'release' ? 'mr' : 'mute'}">${esc(x.v.version_type === 'release' ? t('Estable') : x.v.version_type === 'beta' ? 'Beta' : 'Alpha')}</span></label>`).join('')}</div>
            </div>
            <div class="mf"><button class="btn" id="no">${t('Cancelar')}</button><button class="btn primary" id="ok" ${pick.size ? '' : 'disabled'}>${icon('refresh')}${t('Actualizar {n}', { n: pick.size })}</button></div>`;
          $('#x', m).onclick = close; $('#no', m).onclick = close;
          $('#ua', m).onchange = (e) => { pick.clear(); if (e.target.checked) list.forEach(x => pick.add(x.f.path)); paint(); };
          $$('[data-u]', m).forEach(c => c.onchange = () => { c.checked ? pick.add(c.dataset.u) : pick.delete(c.dataset.u); paint(); });
          $('#ok', m).onclick = async (e) => {
            busy(e.currentTarget, true);
            const d = D();
            const swap = new Map(list.filter(x => pick.has(x.f.path)).map(x => [x.f.path, x]));
            d.files = d.files.map(f => {
              const x = swap.get(f.path);
              if (!x) return f;
              return { path: dirOf(f.path) ? dirOf(f.path) + '/' + x.nf.filename : x.nf.filename, url: x.nf.url, sha1: x.nf.hashes.sha1, size: x.nf.size, name: x.nf.filename, at: Date.now(), mr: x.v.project_id };
            });
            try {
              await save();
              st.upd = list.filter(x => !swap.has(x.f.path));
              close(); draw();
              toast(swap.size === 1 ? t('1 mod actualizado') : t('{n} mods actualizados', { n: swap.size }));
            } catch (err) { busy(e.currentTarget, false); fail(err); }
          };
        };
        paint();
      }, { wide: true });
    }

    async function toModrinth(btn) {
      busy(btn, true);
      const map = new Map(st.mr.map(x => [x.f.path, x.hit]));
      const d = D();
      d.files = d.files.map(f => map.has(f.path) ? { ...f, url: map.get(f.path).url, mr: map.get(f.path).project } : f);
      try { await save(); toast(t('{n} archivos pasan a descargarse desde Modrinth', { n: map.size })); st.mr = []; draw(); } catch (e) { busy(btn, false); fail(e); }
    }

    // ------------------------------------------------ importar .zip / .mrpack
    async function importZip(file) {
      try {
        setProg(0, t('Leyendo {name}…', { name: file.name }));
        const entries = await unzip(file);
        const list = [];
        for (const e of entries) list.push({ file: new File([await e.read()], base(e.name)), rel: e.name });
        endProg();
        uploadMany(list, []);
      } catch (e) { endProg(); fail(e); }
    }
    async function importMrpack(file) {
      try {
        setProg(0, t('Leyendo {name}…', { name: file.name }));
        const entries = await unzip(file);
        const idx = entries.find(e => e.name === 'modrinth.index.json');
        if (!idx) { endProg(); return importZip(file); }
        const index = JSON.parse(new TextDecoder().decode(await idx.read()));
        const linked = (index.files || []).filter(f => !(f.env && f.env.client === 'unsupported') && f.downloads && f.downloads[0]).map(f => ({
          path: String(f.path).replace(/\\/g, '/'), url: f.downloads[0], sha1: f.hashes && f.hashes.sha1, size: f.fileSize, name: base(String(f.path)), at: Date.now(),
          ...((f.downloads[0].match(/cdn\.modrinth\.com\/data\/([A-Za-z0-9]{8})\//) || [])[1] ? { mr: f.downloads[0].match(/cdn\.modrinth\.com\/data\/([A-Za-z0-9]{8})\//)[1] } : {})
        })).filter(f => /^https:\/\//.test(f.url));
        const over = [];
        for (const e of entries) {
          const m = e.name.match(/^(client-)?overrides\/(.+)$/);
          if (m && !JUNK.test(m[2])) over.push({ file: new File([await e.read()], base(m[2])), rel: m[2] });
        }
        endProg();
        // ¿Cambiar la versión de la instancia a la del modpack?
        const dep = index.dependencies || {};
        const lo = dep['fabric-loader'] ? ['fabric', dep['fabric-loader']] : dep['quilt-loader'] ? ['quilt', dep['quilt-loader']] : dep.neoforge ? ['neoforge', dep.neoforge] : dep.forge ? ['forge', dep.forge] : ['vanilla', null];
        const d = D();
        const patch = {};
        if (dep.minecraft && (dep.minecraft !== d.minecraft || lo[0] !== d.loader.type || (lo[1] && lo[1] !== d.loader.version))) {
          const yes = await confirmBox({ title: t('Versión del modpack'), ico: 'package', ok: t('Cambiar la versión'),
            text: t('{pack} es para Minecraft {mc} con {loader}. La instancia ahora usa {cur}. ¿La cambio para que coincida?', { pack: index.name || file.name, mc: dep.minecraft, loader: lo[1] ? `${lo[0]} ${lo[1]}` : lo[0], cur: `${d.minecraft} · ${d.loader.type}` }) });
          if (yes) { patch.minecraft = dep.minecraft; patch.loader = { type: lo[0], version: lo[1] || 'latest' }; }
        }
        const paths = new Set(linked.map(f => f.path));
        d.files = [...d.files.filter(f => !paths.has(f.path)), ...linked];
        await save(patch);
        toast(t('{n} mods añadidos desde el modpack', { n: linked.length }));
        if (over.length) await uploadMany(over, [], ''); else draw();
      } catch (e) { endProg(); fail(e); }
    }

    // ------------------------------------------------ exportar todo en un .zip
    async function exportZip(btn) {
      busy(btn, true);
      const all = files().filter(f => under(f.path, st.cwd));
      const entries = [], failed = [];
      await pool(all, 4, async (f) => {
        try {
          const r = await fetch(absUrl(f.url));
          if (!r.ok) throw new Error(r.status);
          entries.push({ name: st.cwd ? f.path.slice(st.cwd.length + 1) : f.path, data: new Uint8Array(await r.arrayBuffer()) });
        } catch { failed.push(f); }
      }, (i, n, f) => setProg(Math.round(i / n * 100), t('Preparando {i} de {n} · {name}', { i, n, name: f.path })));
      if (failed.length) entries.push({ name: 'no-incluidos.txt', data: new TextEncoder().encode(failed.map(f => `${f.path}\t${absUrl(f.url)}`).join('\n')) });
      endProg(); busy(btn, false);
      const a = document.createElement('a');
      a.href = URL.createObjectURL(zip(entries));
      a.download = `${(D().name || 'instancia').replace(/[^\w\- ]+/g, '_')}${st.cwd ? '-' + base(st.cwd) : ''}.zip`;
      a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 60e3);
      if (failed.length) toast(t('{n} archivos no se pudieron incluir (están en no-incluidos.txt)', { n: failed.length }), 'err');
    }

    draw();
    checkModrinth();
    checkUpdates();
  };
})();
