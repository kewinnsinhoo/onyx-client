// Editor de skins sencillo: se pinta sobre la textura (64×64) y se ve al momento en el muñeco 3D.
// Herramientas: lápiz, goma, cuentagotas, cubo de pintura, espejo (lo que pintas en un lado se pinta en el
// otro), capa base o exterior, deshacer/rehacer, paleta y colores recientes.
// SkinEditor.open({ skin, variant, name, onSave({ data, variant, name }) })
(function () {
  const { esc, html, toast, modal } = UI;

  // ---------------------------------------------------------------- mapa de la textura
  // Caras de una caja (w ancho, h alto, d fondo) que empieza en (ox, oy) en la textura de Minecraft
  const BOX = (ox, oy, w, h, d) => ({
    top: [ox + d, oy, w, d], bottom: [ox + d + w, oy, w, d],
    right: [ox, oy + d, d, h], front: [ox + d, oy + d, w, h], left: [ox + d + w, oy + d, d, h], back: [ox + 2 * d + w, oy + d, w, h]
  });
  function parts(slim) {
    const aw = slim ? 3 : 4;
    return {
      head: { name: 'Cabeza', mirror: 'head', base: BOX(0, 0, 8, 8, 8), over: BOX(32, 0, 8, 8, 8) },
      body: { name: 'Cuerpo', mirror: 'body', base: BOX(16, 16, 8, 12, 4), over: BOX(16, 32, 8, 12, 4) },
      rarm: { name: 'Brazo derecho', mirror: 'larm', base: BOX(40, 16, aw, 12, 4), over: BOX(40, 32, aw, 12, 4) },
      larm: { name: 'Brazo izquierdo', mirror: 'rarm', base: BOX(32, 48, aw, 12, 4), over: BOX(48, 48, aw, 12, 4) },
      rleg: { name: 'Pierna derecha', mirror: 'lleg', base: BOX(0, 16, 4, 12, 4), over: BOX(0, 32, 4, 12, 4) },
      lleg: { name: 'Pierna izquierda', mirror: 'rleg', base: BOX(16, 48, 4, 12, 4), over: BOX(0, 48, 4, 12, 4) }
    };
  }
  const FACE_NAME = { top: 'arriba', bottom: 'abajo', right: 'lado derecho', left: 'lado izquierdo', front: 'delante', back: 'detrás' };
  const SWAP = { right: 'left', left: 'right' };

  // Qué hay en el píxel (x, y): parte, capa, cara y posición dentro de la cara
  function locate(P, x, y) {
    for (const [key, p] of Object.entries(P)) {
      for (const layer of ['base', 'over']) {
        for (const [face, [fx, fy, fw, fh]] of Object.entries(p[layer])) {
          if (x >= fx && x < fx + fw && y >= fy && y < fy + fh) return { key, layer, face, u: x - fx, v: y - fy, w: fw };
        }
      }
    }
    return null;
  }
  // El píxel «del otro lado» (espejo izquierda ↔ derecha)
  function mirrorOf(P, x, y) {
    const l = locate(P, x, y);
    if (!l) return null;
    const other = P[P[l.key].mirror];
    const face = SWAP[l.face] || l.face;
    const [fx, fy, fw] = other[l.layer][face];
    const mx = fx + (fw - 1 - l.u), my = fy + l.v;
    return mx === x && my === y ? null : [mx, my];
  }

  // ---------------------------------------------------------------- colores
  const PALETTE = [
    '#000000', '#3f3f3f', '#7f7f7f', '#bfbfbf', '#ffffff', '#5a3825', '#8b5a2b', '#c68642',
    '#e0ac69', '#f1c27d', '#ffdbac', '#ffb6a3', '#7a0000', '#d11f1f', '#ff6b35', '#ffb000',
    '#ffe14d', '#3c9b2e', '#7ed957', '#0f6e6e', '#2ec4b6', '#1d3fbf', '#4a90ff', '#9ad0ff',
    '#5b2a86', '#a259ff', '#ff5fa2', '#f58ee0'
  ];
  const hex = (r, g, b) => '#' + [r, g, b].map(n => n.toString(16).padStart(2, '0')).join('');
  const rgb = (h) => [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)];

  // ---------------------------------------------------------------- abrir una imagen como 64×64
  async function loadPixels(src, slim) {
    let url = src;
    if (url && !url.startsWith('data:') && /^https?:/.test(url)) url = await onyx.skins.dataUrl(url); // sin «tainted canvas»
    const img = await new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = rej; i.src = url || Skin3D.DEFAULT_DATA; });
    const c = document.createElement('canvas'); c.width = 64; c.height = 64;
    const g = c.getContext('2d');
    g.drawImage(img, 0, 0);
    const data = g.getImageData(0, 0, 64, 64);
    if (img.height === 32) { // skin antigua (64×32): el brazo y la pierna izquierdos son el espejo de los derechos
      const P = parts(slim), px = data.data;
      for (const [from, to] of [['rarm', 'larm'], ['rleg', 'lleg']]) {
        for (const [face, [fx, fy, fw, fh]] of Object.entries(P[from].base)) {
          for (let y = 0; y < fh; y++) for (let x = 0; x < fw; x++) {
            const m = mirrorOf(P, fx + x, fy + y);
            if (!m) continue;
            const a = ((fy + y) * 64 + fx + x) * 4, b = (m[1] * 64 + m[0]) * 4;
            for (let k = 0; k < 4; k++) px[b + k] = px[a + k];
          }
        }
      }
    }
    return data;
  }

  // ---------------------------------------------------------------- el editor
  function open({ skin, variant = 'classic', name = 'Mi skin', onSave }) {
    let slim = variant === 'slim';
    let P = parts(slim);
    let img = null;               // ImageData 64×64
    let tool = 'pen', layer = 'base', mirror = false, color = '#f58ee0', zoom = 8;
    const recent = [];
    const undo = [], redo = [];
    let viewer = null, dirty = false, pushT = 0;

    modal((m, close) => {
      m.classList.add('skin-editor');
      m.innerHTML = html`
        <div class="se-head"><span class="se-ico">${icon('brush')}</span><div><h2>${t('Editor de skins')}</h2><p class="sub">${t('Pinta sobre la textura y mira el resultado en 3D.')}</p></div>
          <span class="grow"></span><button class="icon-btn" data-a="x" title="${t('Cerrar')}">${icon('close')}</button></div>
        <div class="se-main">
          <div class="se-tools">
            ${[['pen', 'brush', 'Lápiz', 'B'], ['eraser', 'eraser', 'Goma', 'E'], ['picker', 'droplet', 'Cuentagotas', 'I'], ['fill', 'bucket', 'Cubo de pintura', 'G']]
              .map(([k, ic, lb, key]) => `<button class="se-tool" data-tool="${k}" title="${esc(t(lb))} (${key})">${icon(ic)}</button>`).join('')}
            <span class="se-sep"></span>
            <button class="se-tool" data-a="mirror" title="${t('Espejo: lo que pintas en un lado se pinta en el otro')} (M)">${icon('mirror')}</button>
            <span class="se-sep"></span>
            <button class="se-tool" data-a="undo" title="${t('Deshacer')} (Ctrl+Z)">${icon('undo')}</button>
            <button class="se-tool" data-a="redo" title="${t('Rehacer')} (Ctrl+Y)">${icon('redo')}</button>
            <span class="se-sep"></span>
            <button class="se-tool" data-a="zin" title="${t('Acercar')}">${icon('plus')}</button>
            <button class="se-tool" data-a="zout" title="${t('Alejar')}">${icon('minus')}</button>
          </div>
          <div class="se-canvas-wrap">
            <div class="se-layers"><div class="segmented" id="se-layer"><button data-l="base">${t('Capa base')}</button><button data-l="over">${t('Capa exterior')}</button></div>
              <span class="se-where" id="se-where">${t('Pasa el ratón por la textura')}</span></div>
            <div class="se-scroll"><canvas id="se-canvas"></canvas></div>
          </div>
          <div class="se-side">
            <div class="se-3d" id="se-3d"></div>
            <div class="se-colors">
              <div class="se-cur"><input type="color" id="se-color" value="${color}" title="${t('Elegir color')}"><span id="se-hex" class="mono">${color}</span></div>
              <div class="se-pal">${PALETTE.map(c => `<button style="--c:${c}" data-c="${c}" title="${c}"></button>`).join('')}</div>
              <div class="se-recent-wrap"><small>${t('Recientes')}</small><div class="se-pal se-recent" id="se-recent"></div></div>
            </div>
          </div>
        </div>
        <div class="se-foot">
          <input class="input" id="se-name" maxlength="40" value="${esc(name)}" placeholder="${t('Nombre de la skin')}">
          <div class="segmented" id="se-variant"><button data-v="classic">${t('Clásico')}</button><button data-v="slim">Slim</button></div>
          <button class="btn btn-ghost" data-a="new">${icon('refresh')}${t('Empezar de cero')}</button>
          <span class="grow"></span>
          <button class="btn btn-ghost" data-a="cancel">${t('Cancelar')}</button>
          <button class="btn btn-primary" data-a="save">${icon('check')}${t('Guardar en mi biblioteca')}</button>
        </div>`;
      const $ = (s) => m.querySelector(s);
      const cv = $('#se-canvas'), g = cv.getContext('2d');
      const tryClose = async () => {
        if (dirty && !(await UI.confirmModal({ title: t('¿Salir sin guardar?'), text: t('Perderás los cambios de la skin.'), confirm: t('Salir'), danger: true, ico: 'brush' }))) return;
        cleanup(); close();
      };

      // --- pintar en pantalla
      function draw() {
        if (!img) return; // todavía cargando la skin
        cv.width = cv.height = 64 * zoom;
        g.imageSmoothingEnabled = false;
        // cuadros de fondo (transparente)
        for (let y = 0; y < 64; y++) for (let x = 0; x < 64; x++) {
          g.fillStyle = (x + y) % 2 ? '#1c1424' : '#241a2e';
          g.fillRect(x * zoom, y * zoom, zoom, zoom);
        }
        const tmp = document.createElement('canvas'); tmp.width = tmp.height = 64;
        tmp.getContext('2d').putImageData(img, 0, 0);
        g.drawImage(tmp, 0, 0, 64 * zoom, 64 * zoom);
        // lo que no es de la capa elegida, más apagado
        for (const p of Object.values(P)) {
          for (const lay of ['base', 'over']) {
            for (const [fx, fy, fw, fh] of Object.values(p[lay])) {
              if (lay !== layer) { g.fillStyle = 'rgba(10,6,14,.62)'; g.fillRect(fx * zoom, fy * zoom, fw * zoom, fh * zoom); }
              g.strokeStyle = lay === layer ? 'rgba(245,142,224,.55)' : 'rgba(255,255,255,.08)';
              g.lineWidth = 1;
              g.strokeRect(fx * zoom + .5, fy * zoom + .5, fw * zoom - 1, fh * zoom - 1);
            }
          }
        }
        if (zoom >= 7) { // rejilla fina
          g.strokeStyle = 'rgba(255,255,255,.05)';
          g.beginPath();
          for (let i = 1; i < 64; i++) { g.moveTo(i * zoom + .5, 0); g.lineTo(i * zoom + .5, 64 * zoom); g.moveTo(0, i * zoom + .5); g.lineTo(64 * zoom, i * zoom + .5); }
          g.stroke();
        }
      }
      const toData = () => { const c = document.createElement('canvas'); c.width = c.height = 64; c.getContext('2d').putImageData(img, 0, 0); return c.toDataURL('image/png'); };
      function push3d() {
        clearTimeout(pushT);
        pushT = setTimeout(() => { if (viewer) viewer.setSkin(toData(), slim ? 'slim' : 'classic'); }, 90);
      }
      const snapshot = () => { undo.push(new Uint8ClampedArray(img.data)); if (undo.length > 80) undo.shift(); redo.length = 0; };

      // --- herramientas
      const at = (x, y) => (y * 64 + x) * 4;
      function setPx(x, y, c) { // c = [r,g,b,a]
        const l = locate(P, x, y);
        if (!l || l.layer !== layer) return;
        const i = at(x, y), d = img.data;
        d[i] = c[0]; d[i + 1] = c[1]; d[i + 2] = c[2]; d[i + 3] = c[3];
        if (mirror) { const mm = mirrorOf(P, x, y); if (mm) { const j = at(mm[0], mm[1]); d[j] = c[0]; d[j + 1] = c[1]; d[j + 2] = c[2]; d[j + 3] = c[3]; } }
      }
      function fill(x, y, c) {
        const l = locate(P, x, y);
        if (!l || l.layer !== layer) return;
        const [fx, fy, fw, fh] = P[l.key][l.layer][l.face];
        const d = img.data, i0 = at(x, y), target = [d[i0], d[i0 + 1], d[i0 + 2], d[i0 + 3]];
        if (target.every((v, k) => v === c[k])) return;
        const same = (i) => d[i] === target[0] && d[i + 1] === target[1] && d[i + 2] === target[2] && d[i + 3] === target[3];
        const stack = [[x, y]], seen = new Set();
        while (stack.length) {
          const [px, py] = stack.pop();
          if (px < fx || py < fy || px >= fx + fw || py >= fy + fh || seen.has(px + ',' + py)) continue;
          seen.add(px + ',' + py);
          if (!same(at(px, py))) continue;
          setPx(px, py, c);
          stack.push([px + 1, py], [px - 1, py], [px, py + 1], [px, py - 1]);
        }
      }
      const cell = (e) => { const r = cv.getBoundingClientRect(); return [Math.floor((e.clientX - r.left) / (r.width / 64)), Math.floor((e.clientY - r.top) / (r.height / 64))]; };
      function setColor(c, remember) {
        color = c;
        $('#se-color').value = c; $('#se-hex').textContent = c;
        m.querySelectorAll('.se-pal [data-c]').forEach(b => b.classList.toggle('on', b.dataset.c === c));
        if (remember && !recent.includes(c)) { recent.unshift(c); recent.length = Math.min(recent.length, 10); drawRecent(); }
      }
      function drawRecent() {
        $('#se-recent').innerHTML = recent.map(c => `<button style="--c:${c}" data-c="${c}" title="${c}"></button>`).join('') || `<span class="se-empty">${t('Aún nada')}</span>`;
        $('#se-recent').querySelectorAll('[data-c]').forEach(b => b.onclick = () => { setColor(b.dataset.c); setTool('pen'); });
      }
      function act(x, y) {
        if (!img || x < 0 || y < 0 || x > 63 || y > 63) return;
        if (tool === 'picker') {
          const i = at(x, y), d = img.data;
          if (d[i + 3] > 0) { setColor(hex(d[i], d[i + 1], d[i + 2]), true); setTool('pen'); }
          return;
        }
        const c = tool === 'eraser' ? [0, 0, 0, 0] : [...rgb(color), 255];
        if (tool === 'fill') fill(x, y, c); else setPx(x, y, c);
        if (tool !== 'eraser') { if (!recent.includes(color)) { recent.unshift(color); recent.length = Math.min(recent.length, 10); drawRecent(); } }
        dirty = true;
        draw(); push3d();
      }
      let painting = false, last = null;
      cv.onpointerdown = (e) => {
        e.preventDefault();
        if (!img) return;
        const [x, y] = cell(e);
        if (tool !== 'picker') snapshot();
        painting = tool === 'pen' || tool === 'eraser';
        last = [x, y];
        act(x, y);
        cv.setPointerCapture(e.pointerId);
      };
      cv.onpointermove = (e) => {
        const [x, y] = cell(e);
        const l = locate(P, x, y);
        $('#se-where').textContent = l ? `${t(P[l.key].name)} · ${t(FACE_NAME[l.face])}${l.layer === 'over' ? ' · ' + t('capa exterior') : ''}` : t('Esta zona no se ve en el juego');
        if (!painting || (last && last[0] === x && last[1] === y)) return;
        // línea entre el punto anterior y este (para que no queden huecos al mover rápido)
        const [x0, y0] = last, n = Math.max(Math.abs(x - x0), Math.abs(y - y0));
        for (let k = 1; k <= n; k++) act(Math.round(x0 + (x - x0) * k / n), Math.round(y0 + (y - y0) * k / n));
        last = [x, y];
      };
      cv.onpointerup = cv.onpointercancel = () => { painting = false; last = null; };
      function setTool(k) { tool = k; m.querySelectorAll('[data-tool]').forEach(b => b.classList.toggle('on', b.dataset.tool === k)); cv.dataset.tool = k; }
      function setLayer(l) {
        layer = l;
        m.querySelectorAll('#se-layer button').forEach(b => b.classList.toggle('on', b.dataset.l === l));
        if (viewer && viewer.setOuter) viewer.setOuter(true);
        draw();
      }
      function step(from, to) {
        if (!from.length) return;
        to.push(new Uint8ClampedArray(img.data));
        img.data.set(from.pop());
        dirty = true; draw(); push3d();
      }
      m.querySelectorAll('[data-tool]').forEach(b => b.onclick = () => setTool(b.dataset.tool));
      m.querySelectorAll('#se-layer button').forEach(b => b.onclick = () => setLayer(b.dataset.l));
      m.querySelectorAll('.se-pal:not(.se-recent) [data-c]').forEach(b => b.onclick = () => { setColor(b.dataset.c); if (tool === 'eraser' || tool === 'picker') setTool('pen'); });
      $('#se-color').oninput = (e) => setColor(e.target.value);
      $('#se-color').onchange = (e) => setColor(e.target.value, true);
      const mb = $('[data-a=mirror]');
      mb.onclick = () => { mirror = !mirror; mb.classList.toggle('on', mirror); };
      $('[data-a=undo]').onclick = () => step(undo, redo);
      $('[data-a=redo]').onclick = () => step(redo, undo);
      $('[data-a=zin]').onclick = () => { zoom = Math.min(14, zoom + 1); draw(); };
      $('[data-a=zout]').onclick = () => { zoom = Math.max(4, zoom - 1); draw(); };
      $('[data-a=x]').onclick = tryClose;
      $('[data-a=cancel]').onclick = tryClose;
      m.querySelectorAll('#se-variant button').forEach(b => b.onclick = () => {
        slim = b.dataset.v === 'slim'; P = parts(slim);
        m.querySelectorAll('#se-variant button').forEach(x => x.classList.toggle('on', x.dataset.v === b.dataset.v));
        draw(); push3d();
      });
      $('[data-a=new]').onclick = async () => {
        if (!(await UI.confirmModal({ title: t('¿Empezar de cero?'), text: t('Se borra lo que has pintado y empiezas con una skin básica.'), confirm: t('Empezar'), ico: 'refresh' }))) return;
        snapshot();
        img = await loadPixels(Skin3D.DEFAULT_DATA, slim);
        dirty = true; draw(); push3d();
      };
      $('[data-a=save]').onclick = async (e) => {
        const btn = e.currentTarget;
        UI.busy(btn, true);
        try {
          const data = toData();
          await onyx.skins.validate(data);
          await onSave({ data, variant: slim ? 'slim' : 'classic', name: $('#se-name').value.trim() || t('Mi skin') });
          dirty = false; cleanup(); close();
        } catch (err) { toast(t(err.message, err.vars), 'error'); UI.busy(btn, false); }
      };
      const onKey = (e) => {
        if (!m.isConnected) return;
        if (e.target && e.target.tagName === 'INPUT' && e.target.type !== 'color') return;
        const k = e.key.toLowerCase();
        if ((e.ctrlKey || e.metaKey) && k === 'z') { e.preventDefault(); step(undo, redo); }
        else if ((e.ctrlKey || e.metaKey) && k === 'y') { e.preventDefault(); step(redo, undo); }
        else if (k === 'b') setTool('pen'); else if (k === 'e') setTool('eraser'); else if (k === 'i') setTool('picker'); else if (k === 'g') setTool('fill');
        else if (k === 'm') mb.click();
      };
      document.addEventListener('keydown', onKey);
      function cleanup() { document.removeEventListener('keydown', onKey); clearTimeout(pushT); if (viewer && viewer.destroy) viewer.destroy(); }

      // --- arrancar
      setTool('pen'); setLayer('base'); setColor(color); drawRecent();
      m.querySelectorAll('#se-variant button').forEach(x => x.classList.toggle('on', x.dataset.v === (slim ? 'slim' : 'classic')));
      loadPixels(skin, slim).catch(() => loadPixels(Skin3D.DEFAULT_DATA, slim)).then((d) => {
        img = d;
        draw();
        viewer = new Skin3D.SkinViewer($('#se-3d'), { scale: 6, rotY: -28, rotX: -6, zoom: 0.78 });
        push3d();
      });
    }, { wide: true, dismissable: false });
  }

  window.SkinEditor = { open, parts, locate, mirrorOf };
})();
