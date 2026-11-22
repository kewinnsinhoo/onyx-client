// Utilidades de interfaz: escape HTML, modales, toasts, menús desplegables, markdown.
(function () {
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const $ = (sel, root = document) => root.querySelector(sel);
  const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];

  function html(strings, ...vals) {
    return strings.reduce((acc, s, i) => acc + s + (i < vals.length ? (vals[i] == null || vals[i] === false ? '' : vals[i]) : ''), '');
  }

  function toast(message, type = 'info', ms = 3800) {
    const root = $('#toasts');
    const t = document.createElement('div');
    t.className = 'toast ' + type;
    // Un error se puede pasar entero: se traduce con sus datos ({host}, {name}…)
    let text = message && typeof message === 'object' && 'message' in message
      ? (window.t ? window.t(message.message, message.vars) : message.message)
      : (window.t ? window.t(String(message)) : String(message));
    text = String(text).replace(/\{host\}/g, 'internet'); // por si un dato no llegó
    t.innerHTML = icon(type === 'error' ? 'alert' : type === 'success' ? 'check' : 'info') + `<div>${esc(text)}</div>`;
    root.appendChild(t);
    setTimeout(() => { t.style.opacity = '0'; t.style.transition = 'opacity .3s'; setTimeout(() => t.remove(), 300); }, ms);
  }

  // Modal genérico. build(modalEl, close) rellena el contenido.
  function modal(build, { wide = false, dismissable = true } = {}) {
    const root = $('#modal-root');
    const back = document.createElement('div');
    back.className = 'backdrop';
    const m = document.createElement('div');
    m.className = 'modal' + (wide ? ' wide' : '');
    back.appendChild(m);
    root.appendChild(back);
    let closed = false;
    const close = () => { if (closed) return; closed = true; back.style.opacity = '0'; back.style.transition = 'opacity .15s'; setTimeout(() => back.remove(), 150); document.removeEventListener('keydown', onKey); };
    const onKey = (e) => { if (e.key === 'Escape' && dismissable) close(); };
    document.addEventListener('keydown', onKey);
    back.addEventListener('mousedown', (e) => { if (e.target === back && dismissable) close(); });
    build(m, close);
    const first = m.querySelector('input, textarea');
    if (first) setTimeout(() => first.focus(), 50);
    return close;
  }

  function confirmModal({ title, text, confirm = t('Confirmar'), danger = false, ico = 'alert' }) {
    return new Promise((resolve) => {
      modal((m, close) => {
        m.innerHTML = html`<div class="m-ico">${icon(ico)}</div><h2>${esc(title)}</h2><p class="sub">${esc(text)}</p>
          <div class="actions"><button class="btn btn-ghost" data-a="no">${t('Cancelar')}</button>
          <button class="btn ${danger ? 'btn-danger' : 'btn-primary'}" data-a="yes">${esc(confirm)}</button></div>`;
        m.querySelector('[data-a=no]').onclick = () => { close(); resolve(false); };
        m.querySelector('[data-a=yes]').onclick = () => { close(); resolve(true); };
      });
    });
  }

  // Menú desplegable anclado a un elemento
  let openDD = null;
  function dropdown(anchor, build, { align = 'right', width, side } = {}) {
    if (openDD) { const same = openDD.anchor === anchor; closeDropdown(); if (same) return; }
    const dd = document.createElement('div');
    dd.className = 'dropdown';
    if (width) dd.style.width = width + 'px';
    document.body.appendChild(dd);
    build(dd, closeDropdown);
    const r = anchor.getBoundingClientRect();
    const w = dd.offsetWidth;
    if (side === 'right') { // a la derecha del botón, pegado por abajo (para la barra lateral)
      dd.style.top = Math.max(8, Math.min(window.innerHeight - dd.offsetHeight - 8, r.bottom - dd.offsetHeight)) + 'px';
      dd.style.left = (r.right + 12) + 'px';
    } else {
      dd.style.top = (r.bottom + 8) + 'px';
      dd.style.left = Math.max(8, Math.min(window.innerWidth - w - 8, align === 'right' ? r.right - w : r.left)) + 'px';
    }
    anchor.classList.add('active');
    openDD = { el: dd, anchor };
    setTimeout(() => document.addEventListener('mousedown', outside), 0);
  }
  function outside(e) { if (openDD && !openDD.el.contains(e.target) && !openDD.anchor.contains(e.target)) closeDropdown(); }
  function closeDropdown() {
    if (!openDD) return;
    openDD.anchor.classList.remove('active');
    openDD.el.remove();
    openDD = null;
    document.removeEventListener('mousedown', outside);
  }

  // Markdown mínimo para los términos (títulos, listas, negrita, citas, enlaces).
  function markdown(src) {
    const inline = (s) => esc(s)
      .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
      .replace(/\*(.+?)\*/g, '<em>$1</em>')
      .replace(/\[([^\]]+)\]\((https?:[^)]+)\)/g, '<a href="$2" target="_blank">$1</a>');
    const lines = String(src || '').replace(/\r/g, '').split('\n');
    let out = '', list = null, para = [];
    const flushP = () => { if (para.length) { out += `<p>${inline(para.join(' '))}</p>`; para = []; } };
    const flushL = () => { if (list) { out += `</${list}>`; list = null; } };
    for (const raw of lines) {
      const line = raw.trimEnd();
      let m;
      if (!line.trim()) { flushP(); flushL(); continue; }
      if ((m = line.match(/^(#{1,3})\s+(.*)$/))) { flushP(); flushL(); out += `<h${m[1].length}>${inline(m[2])}</h${m[1].length}>`; continue; }
      if ((m = line.match(/^>\s?(.*)$/))) { flushP(); flushL(); out += `<blockquote>${inline(m[1])}</blockquote>`; continue; }
      if ((m = line.match(/^\s*[-*]\s+(.*)$/))) { flushP(); if (list !== 'ul') { flushL(); out += '<ul>'; list = 'ul'; } out += `<li>${inline(m[1])}</li>`; continue; }
      if ((m = line.match(/^\s*\d+[.)]\s+(.*)$/))) { flushP(); if (list !== 'ol') { flushL(); out += '<ol>'; list = 'ol'; } out += `<li>${inline(m[1])}</li>`; continue; }
      flushL(); para.push(line.trim());
    }
    flushP(); flushL();
    return out;
  }

  function timeAgo(ts) {
    if (!ts) return '';
    const d = new Date(ts);
    return d.toLocaleDateString(I18N.locale(), { day: 'numeric', month: 'short' }) + ' ' + d.toLocaleTimeString(I18N.locale(), { hour: '2-digit', minute: '2-digit' });
  }

  function busy(btn, on, label) {
    if (!btn) return;
    if (on) { btn.dataset.html = btn.innerHTML; btn.disabled = true; btn.innerHTML = icon('refresh', 'spin') + (label ? `<span>${esc(label)}</span>` : ''); }
    else { btn.disabled = false; if (btn.dataset.html) btn.innerHTML = btn.dataset.html; }
  }

  window.UI = { esc, $, $$, html, toast, modal, confirmModal, dropdown, closeDropdown, markdown, timeAgo, busy };
})();
