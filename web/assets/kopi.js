// Kopi Client — web de descarga. Sin dependencias.
// Idioma: español o inglés (botón de arriba). Descargas: la última versión publicada en GitHub.
(function () {
  const REPO = 'kewinnsinhoo/onyx-client';
  const RELEASES = `https://github.com/${REPO}/releases`;

  const T = {
    es: {
      'nav.descargas': 'Descargas', 'nav.calendario': 'Calendario', 'nav.panel': 'Panel de studios',
      'top.descargar': 'Descargar Kopi Client',
      'hero.t': 'Descarga Kopi Client para <em>{so}</em>', 'hero.t0': 'Descarga <em>Kopi Client</em>',
      'hero.p': 'Kopi Client es el launcher de Minecraft de Kopi Studio: entra a nuestros eventos y servidores, públicos y privados, con todos los mods siempre al día, en un solo programa muy fácil de usar.',
      'hero.btn': 'Descargar para {so}', 'hero.btn0': 'Ver descargas', 'hero.mas': 'Más opciones de descarga',
      'ver': 'Versión {v}, publicada el {f}', 'ver.err': 'No se pudo consultar la última versión. Los botones te llevan a GitHub.',
      'opts.t': 'Todas las opciones de descarga', 'opts.p': 'Kopi Client funciona en Windows, macOS y Linux. Elige la descarga que corresponde a tu equipo.',
      'dl.win': 'Instalador · 64 bits (Intel / AMD)', 'dl.linux': '64 bits', 'dl.pronto': 'Próximamente',
      'opts.legal1': 'Al descargar Kopi Client aceptas nuestros', 'opts.legal2': 'términos de uso',
      'opts.nota': 'Windows puede avisar de que el programa no es conocido: pulsa «Más información» y «Ejecutar de todas formas».',
      'opts.mac': 'En Mac, la primera vez Apple avisa de que no puede verificar la app: ve a Ajustes del Sistema → Privacidad y seguridad y pulsa «Abrir igualmente». Si dice que está «dañada», abre Terminal y escribe: xattr -cr "/Applications/Kopi Client.app"',
      'foot.estado': 'Estado de los servicios', 'foot.legal': 'Legal', 'foot.terminos': 'Términos de uso',
      'foot.aviso': 'Kopi Client no es un producto oficial de Minecraft. No está aprobado ni asociado con Mojang ni con Microsoft.',
      'mac': 'Mac'
    },
    en: {
      'nav.descargas': 'Downloads', 'nav.calendario': 'Calendar', 'nav.panel': 'Studio panel',
      'top.descargar': 'Download Kopi Client',
      'hero.t': 'Download Kopi Client for <em>{so}</em>', 'hero.t0': 'Download <em>Kopi Client</em>',
      'hero.p': 'Kopi Client is Kopi Studio’s Minecraft launcher: join our events and our public and private servers, with every mod always up to date, all in one easy-to-use app.',
      'hero.btn': 'Download for {so}', 'hero.btn0': 'See downloads', 'hero.mas': 'More download options',
      'ver': 'Version {v}, released {f}', 'ver.err': 'Couldn’t check the latest version. The buttons take you to GitHub.',
      'opts.t': 'All download options', 'opts.p': 'Kopi Client runs on Windows, macOS and Linux. Pick the download for your computer.',
      'dl.win': 'Installer · 64-bit (Intel / AMD)', 'dl.linux': '64-bit', 'dl.pronto': 'Coming soon',
      'opts.legal1': 'By downloading Kopi Client you agree to our', 'opts.legal2': 'terms of use',
      'opts.nota': 'Windows may warn that the app isn’t recognised: click “More info” and then “Run anyway”.',
      'opts.mac': 'On Mac, the first time Apple warns it can’t verify the app: go to System Settings → Privacy & Security and click “Open Anyway”. If it says the app is “damaged”, open Terminal and run: xattr -cr "/Applications/Kopi Client.app"',
      'foot.estado': 'Service status', 'foot.legal': 'Legal', 'foot.terminos': 'Terms of use',
      'foot.aviso': 'Kopi Client is not an official Minecraft product. Not approved by or associated with Mojang or Microsoft.',
      'mac': 'Mac'
    }
  };
  let lang;
  try { lang = localStorage.getItem('kopi-lang'); } catch { /* nada */ }
  if (!T[lang]) lang = /^es\b/i.test(navigator.language || 'es') ? 'es' : 'en';
  const t = (k, v = {}) => (T[lang][k] || T.es[k] || k).replace(/\{(\w+)\}/g, (_, n) => v[n] ?? '');

  // Sistema del visitante
  function sistema() {
    const ua = navigator.userAgent || '';
    const p = (navigator.userAgentData && navigator.userAgentData.platform) || navigator.platform || '';
    if (/android|iphone|ipad/i.test(ua)) return 'movil';
    if (/win/i.test(p) || /windows/i.test(ua)) return 'win';
    if (/mac/i.test(p) || /mac os/i.test(ua)) return 'mac';
    if (/linux/i.test(p) || /linux/i.test(ua)) return 'linux';
    return 'win';
  }
  const so = sistema();
  const NOMBRE = { win: 'Windows', mac: 'macOS', linux: 'Linux' };
  const ICONO = { win: '#i-windows', mac: '#i-apple', linux: '#i-linux' };

  let datos = null; // última versión (cuando llegue de GitHub)

  function pintar() {
    document.documentElement.lang = lang;
    document.getElementById('lang-txt').textContent = lang === 'es' ? 'ES' : 'EN';
    document.querySelectorAll('[data-t]').forEach(el => { el.textContent = t(el.dataset.t); });
    const h = document.getElementById('hero-t');
    if (h) h.innerHTML = so === 'movil' ? t('hero.t0') : t('hero.t', { so: NOMBRE[so] });
    const txt = document.getElementById('dl-main-txt');
    if (txt) txt.textContent = so === 'movil' ? t('hero.btn0') : t('hero.btn', { so: so === 'mac' ? t('mac') : NOMBRE[so] });
    const ico = document.getElementById('dl-main-ico');
    if (ico) { if (so === 'movil') ico.style.display = 'none'; else ico.innerHTML = `<use href="${ICONO[so]}"/>`; }
    document.querySelectorAll('[data-anio]').forEach(el => { el.textContent = new Date().getFullYear(); });
    pintarVersion();
    // otras páginas (perfil público) se pintan en el mismo idioma
    window.KopiLang = lang;
    document.dispatchEvent(new CustomEvent('kopi:lang', { detail: lang }));
  }

  function pintarVersion() {
    const ver = document.getElementById('ver');
    if (!ver) return;
    if (datos === false) { ver.textContent = t('ver.err'); return; }
    if (!datos || !datos.tag) { ver.textContent = ''; return; }
    const f = datos.date ? new Date(datos.date).toLocaleDateString(lang, { day: 'numeric', month: 'long', year: 'numeric' }) : '';
    ver.innerHTML = `<span class="punto"></span>${t('ver', { v: datos.tag.replace(/^v/, ''), f })}`;
    document.querySelectorAll('.dl[aria-disabled="true"] span').forEach(s => { s.textContent = t('dl.pronto'); });
  }

  document.getElementById('lang').onclick = () => {
    lang = lang === 'es' ? 'en' : 'es';
    try { localStorage.setItem('kopi-lang', lang); } catch { /* nada */ }
    pintar();
  };

  // ---------- Descargas desde GitHub ----------
  const tipos = {
    win: (a) => /\.exe$/i.test(a.name) && !/blockmap/i.test(a.name),
    macArm: (a) => /arm64\.dmg$/i.test(a.name),
    macIntel: (a) => /x64\.dmg$/i.test(a.name),
    linux: (a) => /\.AppImage$/i.test(a.name)
  };
  const pon = (id, a) => {
    const el = document.getElementById(id);
    if (!el) return;
    if (a) { el.href = a.url; el.title = `${a.name} (${Math.round(a.size / 1048576)} MB)`; el.removeAttribute('aria-disabled'); }
    else { el.href = RELEASES; el.setAttribute('aria-disabled', 'true'); }
  };

  fetch(`https://api.github.com/repos/${REPO}/releases?per_page=30`, { headers: { Accept: 'application/vnd.github+json' } })
    .then(r => { if (!r.ok) throw new Error('GitHub ' + r.status); return r.json(); })
    .then(list => {
      // Solo versiones de Kopi (vX.Y.Z) publicadas y estables; las releases brand-<id> son de los launchers de marca
      const estables = list.filter(r => !r.draft && !r.prerelease && /^v\d/.test(r.tag_name));
      const u = {};
      for (const k of Object.keys(tipos)) {
        for (const r of estables) { const a = r.assets.find(tipos[k]); if (a) { u[k] = { name: a.name, url: a.browser_download_url, size: a.size }; break; } }
      }
      pon('dl-win', u.win); pon('dl-mac-arm', u.macArm); pon('dl-mac-intel', u.macIntel); pon('dl-linux', u.linux);
      const elegido = so === 'win' ? u.win : so === 'linux' ? u.linux : so === 'mac' ? u.macArm : null;
      if (elegido) document.querySelectorAll('[data-dl="auto"]').forEach(b => { b.href = elegido.url; b.title = elegido.name; });
      datos = estables[0] ? { tag: estables[0].tag_name, date: estables[0].published_at } : null;
      pintarVersion();
    })
    .catch(() => {
      ['dl-win', 'dl-mac-arm', 'dl-mac-intel', 'dl-linux'].forEach(id => { const el = document.getElementById(id); if (el) el.href = RELEASES; });
      const main = document.getElementById('dl-main');
      if (main) main.href = RELEASES + '/latest';
      datos = false;
      pintarVersion();
    });

  pintar();
})();
