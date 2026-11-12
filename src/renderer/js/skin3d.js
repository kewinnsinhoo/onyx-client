// Visor de skins en 3D hecho con CSS (sin librerías), + cabezas y vistas planas.
(function () {
  const STEVE = 'assets/default-skin.png';

  function loadImage(url) {
    return new Promise((resolve) => {
      if (!url) return resolve(null);
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = () => resolve(null);
      img.src = url;
    });
  }

  function el(cls, style) {
    const d = document.createElement('div');
    if (cls) d.className = cls;
    if (style) d.style.cssText = style;
    return d;
  }

  // Crea un cubo con las 6 caras usando el layout UV de Minecraft.
  function cuboid(w, h, d, u, v, tex, s, opts = {}) {
    const cube = el('cube');
    const faces = {
      front: [u + d, v + d, w, h],
      back: [u + d + w + d, v + d, w, h],
      right: [u, v + d, d, h],
      left: [u + d + w, v + d, d, h],
      top: [u + d, v, w, d],
      bottom: [u + d + w, v, w, d]
    };
    if (opts.swapFB) { const t = faces.front; faces.front = faces.back; faces.back = t; }
    const tf = {
      front: `translateZ(${d * s / 2}px)`,
      back: `rotateY(180deg) translateZ(${d * s / 2}px)`,
      right: `rotateY(-90deg) translateZ(${w * s / 2}px)`,
      left: `rotateY(90deg) translateZ(${w * s / 2}px)`,
      top: `rotateX(90deg) translateZ(${h * s / 2}px)`,
      bottom: `rotateX(-90deg) translateZ(${h * s / 2}px) scaleY(-1)`
    };
    for (const [name, [fx, fy, fw, fh]] of Object.entries(faces)) {
      const f = el('face ' + name);
      const W = fw * s, H = fh * s;
      f.style.cssText = `width:${W + 0.4}px;height:${H + 0.4}px;left:${-W / 2}px;top:${-H / 2}px;` +
        `background-image:url("${tex.url}");background-size:${tex.w * s}px ${tex.h * s}px;` +
        `background-position:${-fx * s}px ${-fy * s}px;transform:${tf[name]};`;
      cube.appendChild(f);
    }
    return cube;
  }

  function part(cls, x, y, z, s) {
    const p = el('part ' + cls);
    const pos = `translate3d(${x * s}px, ${y * s}px, ${z * s}px)`;
    p.style.setProperty('--pos', pos);
    p.style.transform = pos;
    return p;
  }

  function placeCube(cube, ox, oy, oz, s, scale) {
    cube.style.transform = `translate3d(${ox * s}px, ${oy * s}px, ${oz * s}px)` + (scale ? ` scale3d(${scale[0]}, ${scale[1]}, ${scale[2]})` : '');
    return cube;
  }

  class SkinViewer {
    constructor(container, opts = {}) {
      this.container = container;
      this.opts = Object.assign({ scale: 7, rotY: -28, rotX: -8, interactive: true, spin: 'none', walk: false }, opts);
      this.root = el('skin3d');
      this.shadow = el('shadow');
      this.scene = el('scene');
      this.root.appendChild(this.shadow);
      this.root.appendChild(this.scene);
      container.appendChild(this.root);
      this.ry = this.opts.rotY; this.rx = this.opts.rotX;
      this.skinUrl = null; this.variant = 'classic'; this.capeUrl = null;
      this.walk = this.opts.walk; this.root.classList.toggle('walking', this.walk);
      if (this.opts.interactive) this._bindDrag();
      this._tick = this._tick.bind(this);
      this._t0 = performance.now();
      if (this.opts.spin !== 'none') this._raf = requestAnimationFrame(this._tick);
      this._apply();
    }

    _bindDrag() {
      let down = null;
      this._onDown = (e) => { down = { x: e.clientX, y: e.clientY, ry: this.ry, rx: this.rx }; this.dragging = true; };
      this._onMove = (e) => {
        if (!down) return;
        this.ry = down.ry + (e.clientX - down.x) * 0.6;
        this.rx = Math.max(-35, Math.min(35, down.rx - (e.clientY - down.y) * 0.4));
        this._apply();
      };
      this._onUp = () => { down = null; this.dragging = false; };
      this.root.addEventListener('pointerdown', this._onDown);
      window.addEventListener('pointermove', this._onMove);
      window.addEventListener('pointerup', this._onUp);
    }

    _tick(t) {
      if (!this.dragging) {
        if (this.opts.spin === 'rotate') this.ry += 0.35;
        if (this.opts.spin === 'sway') this.ry = this.opts.rotY + Math.sin((t - this._t0) / 1400) * 18;
        this._apply();
      }
      this._raf = requestAnimationFrame(this._tick);
    }

    _apply() {
      const s = this.opts.scale;
      this.scene.style.transform = `translateY(${4 * s}px) rotateX(${this.rx}deg) rotateY(${this.ry}deg)`;
      this.shadow.style.transform = `translateY(${16.5 * s}px) scale(${s / 7})`;
    }

    async setSkin(url, variant) {
      this.skinUrl = url || STEVE;
      this.variant = variant === 'slim' ? 'slim' : 'classic';
      const token = (this._token = Symbol());
      const img = await loadImage(this.skinUrl) || await loadImage(STEVE);
      if (token !== this._token) return;
      this.skinImg = img;
      this._build();
    }

    async setCape(url) {
      this.capeUrl = url || null;
      this.capeImg = url ? await loadImage(url) : null;
      this._build();
    }

    setVariant(variant) { this.variant = variant === 'slim' ? 'slim' : 'classic'; this._build(); }
    setWalk(on) { this.walk = !!on; this.root.classList.toggle('walking', this.walk); }
    setOuter(on) { this.root.classList.toggle('no-outer', !on); }
    setCapeVisible(on) { this.root.classList.toggle('no-cape', !on); }

    _build() {
      if (!this.skinImg) return;
      const s = this.opts.scale;
      const img = this.skinImg;
      const legacy = img.naturalHeight * 2 === img.naturalWidth;
      const tex = { url: this.skinUrl, w: 64, h: legacy ? 32 : 64 };
      const aw = this.variant === 'slim' ? 3 : 4;
      this.scene.innerHTML = '';

      const add = (p, base, over, offset, scale) => {
        p.appendChild(placeCube(cuboid(...base, tex, s), ...offset, s));
        if (over) {
          const l = placeCube(cuboid(...over, tex, s), ...offset, s, scale);
          l.classList.add('layer');
          p.appendChild(l);
        }
        this.scene.appendChild(p);
      };
      const limbScale = (w) => [(w + 0.5) / w, 12.5 / 12, 4.5 / 4];

      // Cabeza
      add(part('p-head', 0, -12, 0, s), [8, 8, 8, 0, 0], [8, 8, 8, 32, 0], [0, -4, 0], [1.125, 1.125, 1.125]);
      // Cuerpo
      add(part('p-body', 0, -6, 0, s), [8, 12, 4, 16, 16], legacy ? null : [8, 12, 4, 16, 32], [0, 0, 0], [8.5 / 8, 12.5 / 12, 4.5 / 4]);
      // Brazos
      add(part('arm-r', -(4 + aw / 2), -10, 0, s), [aw, 12, 4, 40, 16], legacy ? null : [aw, 12, 4, 40, 32], [0, 4, 0], limbScale(aw));
      add(part('arm-l', 4 + aw / 2, -10, 0, s), legacy ? [aw, 12, 4, 40, 16] : [aw, 12, 4, 32, 48], legacy ? null : [aw, 12, 4, 48, 48], [0, 4, 0], limbScale(aw));
      // Piernas
      add(part('leg-r', -2, 0, 0, s), [4, 12, 4, 0, 16], legacy ? null : [4, 12, 4, 0, 32], [0, 6, 0], limbScale(4));
      add(part('leg-l', 2, 0, 0, s), legacy ? [4, 12, 4, 0, 16] : [4, 12, 4, 16, 48], legacy ? null : [4, 12, 4, 0, 48], [0, 6, 0], limbScale(4));

      // Capa
      if (this.capeImg) {
        const ci = this.capeImg;
        const ratio = ci.naturalWidth % 64 === 0 ? ci.naturalWidth / 64 : 1;
        const ctex = { url: this.capeUrl, w: ci.naturalWidth / ratio, h: ci.naturalHeight / ratio };
        const p = part('cape', 0, -12, -2.6, s);
        p.style.setProperty('--pos', `translate3d(0px, ${-12 * s}px, ${-2.6 * s}px) rotateY(180deg)`);
        p.style.transform = `var(--pos) rotateX(12deg)`;
        p.appendChild(placeCube(cuboid(10, 16, 1, 0, 0, ctex, s), 0, 8, 0, s));
        this.scene.appendChild(p);
      }
    }

    destroy() {
      cancelAnimationFrame(this._raf);
      if (this._onMove) { window.removeEventListener('pointermove', this._onMove); window.removeEventListener('pointerup', this._onUp); }
      this.root.remove();
    }
  }

  // Cabeza 2D (avatar) a partir de la textura de skin
  function head(url, size = 32, radius) {
    const k = size / 8;
    const u = url || STEVE;
    const r = radius != null ? `border-radius:${radius}px;` : '';
    return `<div class="head" style="width:${size}px;height:${size}px;${r}">` +
      `<div style="background-image:url('${u}');background-size:${64 * k}px auto;background-position:${-8 * k}px ${-8 * k}px"></div>` +
      `<div style="background-image:url('${u}');background-size:${64 * k}px auto;background-position:${-40 * k}px ${-8 * k}px"></div></div>`;
  }

  // Vista plana de frente (para miniaturas)
  function flat(url, scale = 3.2, variant = 'classic') {
    const u = url || STEVE;
    const aw = variant === 'slim' ? 3 : 4;
    const k = scale;
    const W = 16 * k, H = 32 * k;
    const piece = (x, y, w, h, sx, sy) =>
      `<div style="left:${x * k}px;top:${y * k}px;width:${w * k}px;height:${h * k}px;` +
      `background-image:url('${u}');background-size:${64 * k}px auto;background-position:${-sx * k}px ${-sy * k}px"></div>`;
    const ox = 4 - aw; // desplazamiento por brazos finos
    return `<div class="flat-skin" data-skin="${u}" style="width:${W}px;height:${H}px">` +
      piece(4, 0, 8, 8, 8, 8) + piece(4, 8, 8, 12, 20, 20) +
      piece(ox, 8, aw, 12, 44, 20) + piece(12, 8, aw, 12, 36, 52) +
      piece(4, 20, 4, 12, 4, 20) + piece(8, 20, 4, 12, 20, 52) +
      `<div class="ov" style="position:absolute;inset:0">` +
      piece(4, 0, 8, 8, 40, 8) + piece(4, 8, 8, 12, 20, 36) +
      piece(ox, 8, aw, 12, 44, 36) + piece(12, 8, aw, 12, 52, 52) +
      piece(4, 20, 4, 12, 4, 36) + piece(8, 20, 4, 12, 4, 52) + `</div></div>`;
  }

  // Las skins antiguas (64x32) no tienen brazo/pierna izquierda propia: corregir miniaturas.
  async function fixLegacy(root) {
    for (const node of root.querySelectorAll('.flat-skin[data-skin]')) {
      const img = await loadImage(node.dataset.skin);
      if (img && img.naturalHeight * 2 === img.naturalWidth) {
        const parts = node.children;
        // brazo izq. y pierna izq. -> usar los derechos; ocultar capa exterior salvo el sombrero
        parts[3].style.backgroundPosition = parts[2].style.backgroundPosition;
        parts[5].style.backgroundPosition = parts[4].style.backgroundPosition;
        const ov = node.querySelector('.ov');
        if (ov) [...ov.children].slice(1).forEach(c => c.remove());
      }
    }
  }

  function capePreview(url, scale = 4) {
    const k = scale;
    return `<div class="cape-img" style="width:${10 * k}px;height:${16 * k}px;background-image:url('${url}');background-size:${64 * k}px auto;background-position:${-1 * k}px ${-1 * k}px"></div>`;
  }

  window.Skin3D = { SkinViewer, head, flat, fixLegacy, capePreview, STEVE, loadImage };
})();
