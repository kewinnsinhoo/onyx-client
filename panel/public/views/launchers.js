// Launchers: Onyx Client oficial + el launcher propio del studio (marca), con vista previa y fabricación.
(function () {
  const V = window.Views;
  const RELEASES = ['kewinnsinhoo/onyx-client-releases', 'kewinnsinhoo/onyx-client'];
  const head = (title, sub, actions = '') => html`<div class="page-head"><div><h1>${title}</h1>${sub ? `<p>${sub}</p>` : ''}</div><span class="grow"></span>${actions}</div>`;
  const OS_ICON = { windows: 'monitor', mac: 'monitor', 'mac-arm': 'monitor', linux: 'monitor' };

  async function onyxRelease() {
    for (const r of RELEASES) {
      try { const j = await (await fetch(`https://api.github.com/repos/${r}/releases/latest`)).json(); if (j && j.tag_name) return j; } catch { /* siguiente */ }
    }
    return null;
  }

  // Vista previa del launcher con la marca (se actualiza mientras se edita)
  function preview(d) {
    const a = d.accent || '#8e9bff', a2 = d.accent2 || a;
    return html`<div class="lp" style="--a:${esc(a)};--a2:${esc(a2)}">
      <div class="lp-win" style="${d.background ? `--bg:url('${esc(d.background)}')` : ''}">
        <div class="lp-top">${d.logo ? `<img src="${esc(d.logo)}" alt="">` : `<b>${esc(d.name || t('Tu launcher'))}</b>`}<span class="v">v1.3.0</span><span class="grow"></span><i></i><i></i><i></i></div>
        <div class="lp-body">
          <div class="lp-side"><span class="on"></span><span></span><span></span><span></span><span class="pin">${d.icon ? `<img src="${esc(d.icon)}" alt="">` : ''}</span></div>
          <div class="lp-main">
            <div class="lp-hello">${t('Buenas tardes,')} <b>Steve</b></div>
            ${d.tagline ? `<div class="lp-tag">${esc(d.tagline)}</div>` : ''}
            <div class="lp-card"><div class="ic">${d.icon ? `<img src="${esc(d.icon)}" alt="">` : ''}</div><div class="grow"><b>${t('Tu instancia')}</b><small>1.21.1 · Fabric</small></div><span class="play">${t('Jugar')}</span></div>
          </div>
        </div>
      </div>
      <div class="lp-cap">${d.icon ? `<img src="${esc(d.icon)}" alt="">` : `<span class="noicon">${icon('image')}</span>`}<span><b>${esc(d.name || t('Tu launcher'))}</b><small>${t('Así se verá en el escritorio y en la barra de tareas')}</small></span></div>
    </div>`;
  }

  function runBadge(run) {
    if (!run) return `<span class="badge mute">${t('Sin compilar')}</span>`;
    if (run.status !== 'completed') return `<span class="badge warn"><span class="dot"></span>${t('Fabricando…')}</span>`;
    if (run.conclusion === 'success') return `<span class="badge ok">${icon('check')}${t('Listo')}</span>`;
    return `<span class="badge bad">${icon('alert')}${t('Falló')}</span>`;
  }

  const isPng = (f) => f && (f.type === 'image/png' || /\.png$/i.test(f.name));
  const imgSize = (file) => new Promise((res) => { const i = new Image(); i.onload = () => res({ w: i.naturalWidth, h: i.naturalHeight }); i.onerror = () => res(null); i.src = URL.createObjectURL(file); });

  V.launchers = async (view) => {
    const [rel, st] = await Promise.all([onyxRelease(), sapi('GET', '/brand')]);
    const creator = S.me.user.role === 'creator';
    const all = creator ? await api('GET', '/onyx/brands').catch(() => null) : null;
    const d = st.brand ? { ...st.brand } : { name: '', accent: '#8e9bff', accent2: '', tagline: '', onlyStudio: true };
    const pageUrl = st.brand ? `${location.origin}/l/${st.brand.id}` : '';
    const editable = can('admin') && st.allowed && !S.studio.suspended;

    const brandCard = !st.allowed ? html`<div class="card empty"><div class="ic">${icon('lock')}</div><h4>${t('Launcher propio')}</h4>
        <p>${t('Un launcher con el nombre, el icono, el logo y los colores de {s}, con sus propios instaladores. Onyx Studios lo activa para cada studio.', { s: esc(S.studio.name) })}</p>
        ${creator ? `<a class="btn primary" href="#/studios/${esc(S.studio.id)}">${icon('crown')}${t('Activarlo en la ficha del studio')}</a>` : ''}</div>`
      : html`<div class="grid lb-grid">
        <div class="card" style="margin:0"><h3>${icon('rocket')}${t('Tu launcher propio')}</h3>
          <p class="sub">${t('El nombre y el icono se aplican al compilar. Los colores, el logo, el fondo y los enlaces llegan solos a los launchers ya instalados.')}</p>
          <div class="field" style="margin-top:14px"><span class="label">${t('Nombre del launcher')}</span><input class="input" id="b-name" maxlength="40" value="${esc(d.name)}" placeholder="${t('Ej.: Nova Launcher')}" ${editable ? '' : 'disabled'}></div>
          <div class="lb-slots">
            ${[['icon', 'Icono', 'PNG cuadrado, 512 × 512 o más. Obligatorio.'], ['logo', 'Logo', 'Opcional. PNG con fondo transparente; sale arriba a la izquierda.'], ['background', 'Fondo', 'Opcional. Una imagen que se ve, oscurecida, detrás de todo.']].map(([k, l, h]) => html`
            <div class="lb-slot" data-k="${k}"><div class="pv ${k}">${d[k] ? `<img src="${esc(d[k])}" alt="">` : icon('image')}</div>
              <div class="grow"><b>${t(l)}</b><small>${t(h)}</small></div>
              ${editable ? `<button class="btn sm" data-up="${k}">${icon('upload')}${d[k] ? t('Cambiar') : t('Subir')}</button>${d[k] && k !== 'icon' ? `<button class="btn sm icon ghost" data-rm="${k}">${icon('x')}</button>` : ''}` : ''}</div>`).join('')}
          </div>
          <div class="row"><div class="field"><span class="label">${t('Color principal')}</span><div class="color-pick"><input type="color" id="b-acc" value="${esc(d.accent || '#8e9bff')}" ${editable ? '' : 'disabled'}><span class="mono">${esc(d.accent || '#8e9bff')}</span></div></div>
            <div class="field"><span class="label">${t('Color secundario (opcional)')}</span><div class="color-pick"><input type="color" id="b-acc2" value="${esc(d.accent2 || d.accent || '#5b67e8')}" ${editable ? '' : 'disabled'}><span class="mono">${esc(d.accent2 || '—')}</span></div></div></div>
          <div class="field"><span class="label">${t('Frase de bienvenida (opcional)')}</span><input class="input" id="b-tag" maxlength="120" value="${esc(d.tagline || '')}" placeholder="${t('Ej.: Los mejores eventos de Minecraft')}" ${editable ? '' : 'disabled'}></div>
          <div class="row"><div class="field"><span class="label">Discord</span><input class="input" id="b-dc" value="${esc(d.discord || '')}" placeholder="https://discord.gg/…" ${editable ? '' : 'disabled'}></div>
            <div class="field"><span class="label">${t('Web')}</span><input class="input" id="b-web" value="${esc(d.web || '')}" placeholder="https://" ${editable ? '' : 'disabled'}></div></div>
          <div class="field"><span class="label">${t('Tienda (opcional)')}</span><input class="input" id="b-store" value="${esc(d.store || '')}" placeholder="https://" ${editable ? '' : 'disabled'}></div>
          <div class="set"><div class="t"><b>${t('Solo las instancias de {s}', { s: esc(S.studio.name) })}</b><small>${t('Los códigos de otros studios no se pueden usar en tu launcher.')}</small></div>
            <label class="switch"><input type="checkbox" id="b-only" ${d.onlyStudio !== false ? 'checked' : ''} ${editable ? '' : 'disabled'}><span></span></label></div>
          ${editable ? html`<div style="display:flex;gap:8px;margin-top:16px;flex-wrap:wrap"><button class="btn" id="b-save">${icon('check')}${t('Guardar')}</button>
            <button class="btn primary" id="b-build" ${st.brand && st.brand.icon ? '' : 'disabled'}>${icon('rocket')}${t('Compilar launcher')}</button></div>
            <p class="help" style="margin-top:8px">${t('Compilar tarda unos 15 minutos. Se fabrica para Windows, macOS y Linux.')}</p>` : ''}
        </div>
        <div>
          <div class="card" style="margin:0" id="b-pv">${preview(d)}</div>
          ${st.brand ? html`<div class="card" style="margin-top:16px"><div class="card-head"><h3>${icon('download')}${t('Instaladores')}</h3><span class="grow"></span>${runBadge(st.run)}</div>
            ${st.run && st.run.status !== 'completed' ? `<p class="sub">${t('GitHub lo está fabricando. Esta página se actualiza sola.')}</p>` : ''}
            ${st.run && st.run.conclusion === 'failure' ? `<p class="sub">${t('Algo falló al fabricarlo. Revisa que el icono sea un PNG cuadrado y vuelve a intentarlo.')}</p>` : ''}
            ${st.run ? `<a class="btn sm ghost" href="${esc(st.run.url)}" target="_blank" rel="noopener" style="margin:6px 0">${icon('external')}${t('Ver en GitHub')}</a>` : ''}
            <div style="display:grid;gap:8px;margin-top:10px">${st.downloads.files.length ? st.downloads.files.map(f => html`<a class="dl-row" href="${esc(f.url)}">${icon(OS_ICON[f.os] || 'download')}<span class="grow"><b>${esc(f.label)}</b><small>${esc(f.name)}</small></span><span class="size">${fmtSize(f.size)}</span>${icon('download')}</a>`).join('')
              : `<p class="help" style="margin:0">${t('Cuando termine la primera fabricación, aquí salen los instaladores.')}</p>`}</div>
            ${st.downloads.files.length ? html`<div class="field" style="margin-top:14px"><span class="label">${t('Página de descarga para tus jugadores')}</span><div class="code-box"><span class="mono" style="font-size:12.5px;word-break:break-all">${esc(pageUrl)}</span><button class="btn sm" id="b-cp">${icon('copy')}${t('Copiar')}</button><a class="btn sm" href="${esc(pageUrl)}" target="_blank" rel="noopener">${icon('external')}</a></div></div>` : ''}
          </div>` : ''}
          ${creator && !st.github ? `<div class="note warn" style="margin-top:16px">${icon('alert')}<span>${t('El panel aún no está conectado con GitHub: falta el secreto GITHUB_TOKEN en Cloudflare. Sin él no se puede compilar.')}</span></div>` : ''}
        </div></div>`;

    view.innerHTML = html`<div class="page">${head(t('Launchers'), t('Los launchers desde los que tus jugadores entran a tus instancias.'))}
      <div class="card"><div style="display:flex;align-items:center;gap:16px"><img src="/img/icon.png" alt="" style="width:56px;height:56px;border-radius:14px">
        <div style="flex:1"><h3 style="font-size:18px">Onyx Client <span class="badge ok">${t('Oficial')}</span></h3>
          <div style="color:var(--muted)">${rel && rel.tag_name ? t('Versión {v}, publicada {d}', { v: esc(rel.tag_name.replace(/^v/, '')), d: fmtDate(Date.parse(rel.published_at), { day: 'numeric', month: 'long' }) }) : t('Windows, macOS y Linux')}</div></div>
        <a class="btn" href="https://onyxclient.site/download.html" target="_blank" rel="noopener">${icon('external')}${t('Página de descarga')}</a></div></div>
      ${brandCard}
      ${all ? html`<div class="card" style="margin-top:16px"><div class="card-head"><h3>${icon('crown')}${t('Todos los launchers de marca')}</h3><span class="grow"></span>
        <button class="btn sm" id="b-all" ${all.brands.length && all.github ? '' : 'disabled'}>${icon('refresh')}${t('Recompilar todos')}</button></div>
        <p class="sub">${t('Cuando publicas una versión nueva de Onyx, se recompilan solos. Este botón es por si quieres forzarlo.')}</p>
        ${all.brands.length ? html`<table class="table" style="margin-top:8px"><thead><tr><th>${t('Launcher')}</th><th>${t('Studio')}</th><th>${t('Versión')}</th><th>${t('Estado')}</th></tr></thead><tbody>
          ${all.brands.map(b => `<tr><td><b>${esc(b.name)}</b> <small class="mono" style="color:var(--faint)">${esc(b.id)}</small></td><td>${esc(b.studioName)}</td><td>${esc(b.builtVersion || '—')}</td><td>${runBadge(b.run)}</td></tr>`).join('')}</tbody></table>`
          : `<p class="help">${t('Ningún studio tiene launcher propio todavía.')}</p>`}</div>` : ''}
    </div>`;

    // ------------------------------------------------ eventos
    const read = () => ({
      name: $('#b-name', view).value.trim(), accent: $('#b-acc', view).value, accent2: $('#b-acc2', view).dataset.set ? $('#b-acc2', view).value : (d.accent2 || null),
      tagline: $('#b-tag', view).value.trim(), discord: $('#b-dc', view).value.trim(), web: $('#b-web', view).value.trim(), store: $('#b-store', view).value.trim(),
      onlyStudio: $('#b-only', view).checked, icon: d.icon || null, logo: d.logo || null, background: d.background || null
    });
    const repaint = () => { const pv = $('#b-pv', view); if (pv) pv.innerHTML = preview({ ...d, ...read() }); };
    if ($('#b-name', view)) {
      ['#b-name', '#b-tag'].forEach(sel => $(sel, view).oninput = repaint);
      $('#b-acc', view).oninput = (e) => { e.target.nextElementSibling.textContent = e.target.value; repaint(); };
      $('#b-acc2', view).oninput = (e) => { e.target.dataset.set = '1'; e.target.nextElementSibling.textContent = e.target.value; repaint(); };
    }
    $$('[data-up]', view).forEach(b => b.onclick = async () => {
      const k = b.dataset.up;
      const f = await pickFile(k === 'background' ? 'image/png,image/jpeg,image/webp' : 'image/png' + (k === 'logo' ? ',image/webp' : ''));
      if (!f) return;
      if (k === 'icon') {
        if (!isPng(f)) return toast(t('El icono tiene que ser PNG'), 'err');
        const sz = await imgSize(f);
        if (!sz || sz.w !== sz.h || sz.w < 256) return toast(t('El icono tiene que ser cuadrado y de al menos 256 px (mejor 512 o 1024)'), 'err');
      }
      busy(b, true);
      try { const r = await upload(f); d[k] = r.url; Object.assign(d, read(), { [k]: r.url }); await sapi('PUT', '/brand', { ...read(), [k]: r.url }); toast(t('Imagen guardada')); V.launchers(view); }
      catch (e) { fail(e); busy(b, false); }
    });
    $$('[data-rm]', view).forEach(b => b.onclick = async () => { const k = b.dataset.rm; try { await sapi('PUT', '/brand', { ...read(), [k]: null }); V.launchers(view); } catch (e) { fail(e); } });
    const sv = $('#b-save', view);
    if (sv) sv.onclick = async () => { busy(sv, true); try { await sapi('PUT', '/brand', read()); toast(t('Launcher guardado')); V.launchers(view); } catch (e) { fail(e); busy(sv, false); } };
    const bd = $('#b-build', view);
    if (bd) bd.onclick = async () => {
      if (!(await confirmBox({ title: t('¿Compilar tu launcher?'), text: t('GitHub fabricará los instaladores para Windows, macOS y Linux. Tarda unos 15 minutos.'), ok: t('Compilar'), ico: 'rocket' }))) return;
      busy(bd, true);
      try { await sapi('PUT', '/brand', read()); await sapi('POST', '/brand/build'); toast(t('Fabricando tu launcher…')); setTimeout(() => V.launchers(view), 4000); }
      catch (e) { fail(e); busy(bd, false); }
    };
    const cp = $('#b-cp', view); if (cp) cp.onclick = () => copy(pageUrl);
    const ab = $('#b-all', view);
    if (ab) ab.onclick = async () => {
      if (!(await confirmBox({ title: t('¿Recompilar todos?'), text: t('Se fabrican otra vez todos los launchers de marca con la versión actual de Onyx.'), ok: t('Recompilar'), ico: 'refresh' }))) return;
      try { const r = await api('POST', '/onyx/brands/rebuild'); toast(t('{n} launchers en cola', { n: r.n })); setTimeout(() => V.launchers(view), 4000); } catch (e) { fail(e); }
    };
    // Mientras se fabrica, se actualiza sola
    const working = (st.run && st.run.status !== 'completed') || (all && all.brands.some(b => b.run && b.run.status !== 'completed'));
    if (working) {
      const tm = setTimeout(() => { if (document.body.contains(view) && S.route && S.route.parts[0] === 'launchers') V.launchers(view); }, 20000);
      return () => clearTimeout(tm);
    }
  };
})();
