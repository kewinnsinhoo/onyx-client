// Kopi Client — web. Sin dependencias.
(function () {
  const REPO = 'kewinnsinhoo/onyx-client';
  const RELEASES = `https://github.com/${REPO}/releases`;
  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  // Borde de la barra al bajar
  const barra = document.querySelector('.barra');
  if (barra) {
    const f = () => barra.classList.toggle('con-borde', window.scrollY > 8);
    f(); window.addEventListener('scroll', f, { passive: true });
  }

  // Año del pie
  document.querySelectorAll('[data-anio]').forEach(el => { el.textContent = new Date().getFullYear(); });

  // ---------- El código se escribe solo (una vez) ----------
  const codigo = document.querySelector('.codigo');
  if (codigo) {
    const texto = codigo.dataset.codigo || 'KOPI-DEMO-2026';
    const celdas = [...codigo.querySelectorAll('.c')];
    const letras = texto.replace(/-/g, '').split('');
    const pinta = (n) => celdas.forEach((c, i) => {
      c.textContent = i < n ? letras[i] : '';
      c.classList.toggle('lleno', i < n);
      c.classList.toggle('cursor', i === n);
    });
    if (reduceMotion) { pinta(letras.length); codigo.classList.add('hecho'); }
    else {
      pinta(0);
      let n = 0;
      setTimeout(function paso() {
        n++; pinta(n);
        if (n < letras.length) setTimeout(paso, 70 + Math.random() * 70);
        else setTimeout(() => codigo.classList.add('hecho'), 250);
      }, 900);
    }
  }

  // ---------- Versiones desde GitHub ----------
  function cache(key, ms, load) {
    try {
      const raw = sessionStorage.getItem(key);
      if (raw) { const v = JSON.parse(raw); if (Date.now() - v.t < ms) return Promise.resolve(v.d); }
    } catch (e) { /* sin almacenamiento */ }
    return load().then(d => { try { sessionStorage.setItem(key, JSON.stringify({ t: Date.now(), d })); } catch (e) { /* nada */ } return d; });
  }
  // Solo las versiones de Kopi (vX.Y.Z); las releases brand-<id> de los launchers de marca se ignoran
  const fetchRel = (repo) => fetch(`https://api.github.com/repos/${repo}/releases?per_page=30`, { headers: { Accept: 'application/vnd.github+json' } })
    .then(r => { if (!r.ok) throw new Error('GitHub ' + r.status); return r.json(); })
    .then(list => list.filter(r => !r.draft && /^v\d/.test(r.tag_name)).map(r => ({
      tag: r.tag_name, pre: r.prerelease, date: r.published_at,
      assets: r.assets.map(a => ({ name: a.name, url: a.browser_download_url, size: a.size, count: a.download_count }))
    })));
  const releases = () => cache('onyx-releases-3', 10 * 60e3, () => fetchRel(REPO));

  const tipos = {
    win: (a) => /\.exe$/i.test(a.name) && !/blockmap/i.test(a.name),
    macArm: (a) => /arm64\.dmg$/i.test(a.name),
    macIntel: (a) => /x64\.dmg$/i.test(a.name),
    linux: (a) => /\.AppImage$/i.test(a.name)
  };
  // El archivo más nuevo de cada tipo (Mac a veces llega más tarde que Windows)
  function ultimos(list) {
    const stable = list.filter(r => !r.pre);
    const out = {};
    for (const k of Object.keys(tipos)) {
      for (const r of stable) { const a = r.assets.find(tipos[k]); if (a) { out[k] = { ...a, tag: r.tag }; break; } }
    }
    out.tag = stable[0] && stable[0].tag;
    out.date = stable[0] && stable[0].date;
    return out;
  }
  const mb = (b) => `${Math.round(b / 1048576)} MB`;

  function sistema() {
    const ua = navigator.userAgent || '';
    const p = (navigator.userAgentData && navigator.userAgentData.platform) || navigator.platform || '';
    if (/android|iphone|ipad/i.test(ua)) return 'movil';
    if (/win/i.test(p) || /windows/i.test(ua)) return 'win';
    if (/mac/i.test(p) || /mac os/i.test(ua)) return 'mac';
    if (/linux/i.test(p) || /linux/i.test(ua)) return 'linux';
    return 'win';
  }

  // Número de descargas (solo si ya es un número que luzca)
  document.querySelectorAll('[data-descargas]').forEach(el => {
    releases().then(list => {
      let n = 0;
      list.forEach(r => r.assets.forEach(a => { if (tipos.win(a) || tipos.linux(a) || /\.dmg$/i.test(a.name)) n += a.count; }));
      if (n >= 100) el.innerHTML = `<strong>${n.toLocaleString('es')}</strong> descargas en Windows, macOS y Linux.`;
    }).catch(() => {});
  });

  // ---------- Página de descargas ----------
  const pagina = document.querySelector('[data-pagina="descargas"]');
  if (pagina) {
    const so = sistema();
    const principal = document.getElementById('descarga-principal');
    const textoPrincipal = principal.querySelector('span');
    const version = document.getElementById('version');
    const nombres = { win: 'Windows', mac: 'macOS', linux: 'Linux' };
    if (so !== 'movil') textoPrincipal.textContent = `Descargar para ${nombres[so]}`;

    const pon = (id, a, etiqueta) => {
      const el = document.getElementById(id);
      if (!el) return;
      if (a) { el.href = a.url; el.removeAttribute('aria-disabled'); el.title = `${a.name} (${mb(a.size)})`; if (etiqueta) el.querySelector('span').textContent = etiqueta; }
      else { el.href = RELEASES; el.setAttribute('aria-disabled', 'true'); el.querySelector('span').textContent = 'Próximamente'; }
    };

    releases().then(list => {
      const u = ultimos(list);
      pon('dl-win', u.win);
      pon('dl-mac-arm', u.macArm);
      pon('dl-mac-intel', u.macIntel);
      if (!u.macArm && !u.macIntel) { const i = document.getElementById('dl-mac-intel'); if (i) i.hidden = true; }
      pon('dl-linux', u.linux);
      const elegido = so === 'win' ? u.win : so === 'linux' ? u.linux : so === 'mac' ? u.macArm : null;
      if (elegido) {
        principal.href = elegido.url;
        principal.title = elegido.name;
        if (so === 'mac') textoPrincipal.textContent = 'Descargar para Mac (Apple Silicon)';
      } else {
        principal.href = '#plataformas';
      }
      if (u.tag) {
        const fecha = u.date ? new Date(u.date).toLocaleDateString('es', { day: 'numeric', month: 'long', year: 'numeric' }) : '';
        version.innerHTML = `<span class="punto"></span>Versión ${u.tag.replace(/^v/, '')}${fecha ? `, publicada el ${fecha}` : ''}`;
      }
    }).catch(() => {
      // Sin acceso a GitHub: todos los botones llevan a la página de versiones
      ['dl-win', 'dl-mac-arm', 'dl-mac-intel', 'dl-linux'].forEach(id => { const el = document.getElementById(id); if (el) el.href = RELEASES; });
      principal.href = RELEASES + '/latest';
      version.textContent = 'No se pudo consultar la última versión. Los botones te llevan a GitHub.';
    });
  }
})();
