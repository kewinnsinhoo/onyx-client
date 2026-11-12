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
  // Cada cara lleva su "lado" para poder iluminarla (variables --l-*).
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
      bottom: `rotateX(-90deg) translateZ(${h * s / 2}px)`
    };
    for (const [name, [fx, fy, fw, fh]] of Object.entries(faces)) {
      const f = el('face ' + name);
      const W = fw * s, H = fh * s;
      f.style.cssText = `width:${W + 0.5}px;height:${H + 0.5}px;left:${-W / 2}px;top:${-H / 2}px;` +
        `background-image:url("${tex.url}");background-size:${tex.w * s}px ${tex.h * s}px;` +
        `background-position:${-fx * s}px ${-fy * s}px;transform:${tf[name]};filter:brightness(var(--l-${name},1));`;
      cube.appendChild(f);
    }
    return cube;
  }

  function placeCube(cube, ox, oy, oz, s, scale) {
    cube.style.transform = `translate3d(${ox * s}px, ${oy * s}px, ${oz * s}px)` + (scale ? ` scale3d(${scale[0]}, ${scale[1]}, ${scale[2]})` : '');
    return cube;
  }

  const DEG = Math.PI / 180;
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const lerp = (a, b, k) => a + (b - a) * k;
  const smooth = (x) => x * x * (3 - 2 * x);

  // Ratón global (la cabeza lo sigue esté donde esté)
  const mouse = { x: window.innerWidth / 2, y: window.innerHeight * 0.3, active: false };
  window.addEventListener('mousemove', (e) => { mouse.x = e.clientX; mouse.y = e.clientY; mouse.active = true; }, { passive: true });

  class SkinViewer {
    constructor(container, opts = {}) {
      this.container = container;
      this.opts = Object.assign({ scale: 7, rotY: -24, rotX: -6, interactive: true, spin: 'none', walk: false, wave: true, follow: true }, opts);
      this.root = el('skin3d');
      this.shadow = el('shadow');
      this.scene = el('scene');
      this.root.appendChild(this.shadow);
      this.root.appendChild(this.scene);
      container.appendChild(this.root);
      this.ry = this.opts.rotY; this.rx = this.opts.rotX;
      this.skinUrl = null; this.variant = 'classic'; this.capeUrl = null;
      this.walk = !!this.opts.walk;
      this.parts = {};
      this.head = { yaw: 0, pitch: 0 };
      this.waveStart = null;
      this.phase = Math.random() * 10;
      if (this.opts.interactive) this._bindDrag();
      this._tick = this._tick.bind(this);
      this._t0 = performance.now();
      this._raf = requestAnimationFrame(this._tick);
    }

    _bindDrag() {
      let down = null;
      this._onDown = (e) => { down = { x: e.clientX, y: e.clientY, ry: this.ry, rx: this.rx }; this.dragging = true; };
      this._onMove = (e) => {
        if (!down) return;
        this.ry = down.ry + (e.clientX - down.x) * 0.6;
        this.rx = clamp(down.rx - (e.clientY - down.y) * 0.4, -35, 35);
      };
      this._onUp = () => { down = null; this.dragging = false; };
      this.root.addEventListener('pointerdown', this._onDown);
      window.addEventListener('pointermove', this._onMove);
      window.addEventListener('pointerup', this._onUp);
      // Doble clic: volver a saludar
      this.root.addEventListener('dblclick', () => this.wave());
    }

    wave() { this.waveStart = performance.now(); }

    // Ilumina cada cara según hacia dónde mira (luz fija desde la cámara, arriba a la izquierda).
    _light(partEl, yaw) {
      const LIGHT = -35;
      const side = (faceYaw) => {
        const c = Math.cos((faceYaw + yaw - LIGHT) * DEG);
        return (0.58 + 0.44 * Math.max(0, c)).toFixed(3);
      };
      const st = partEl.style;
      st.setProperty('--l-front', side(0));
      st.setProperty('--l-left', side(90));
      st.setProperty('--l-back', side(180));
      st.setProperty('--l-right', side(-90));
      st.setProperty('--l-top', '1.08');
      st.setProperty('--l-bottom', '0.5');
    }

    _pose(name, extra) {
      const p = this.parts[name];
      if (!p) return;
      p.el.style.transform = p.base + extra;
    }

    _tick(now) {
      this._raf = requestAnimationFrame(this._tick);
      if (!this.skinImg || !this.root.isConnected) return;
      const t = (now - this._t0) / 1000 + this.phase;

      if (this.opts.spin === 'rotate' && !this.dragging) this.ry += 0.35;
      if (this.opts.spin === 'sway' && !this.dragging) this.ry = this.opts.rotY + Math.sin(t / 1.6) * 10;
      const s = this.opts.scale;
      this.scene.style.transform = `translateY(${4 * s}px) rotateX(${this.rx}deg) rotateY(${this.ry}deg)`;
      this.shadow.style.transform = `translateY(${16.5 * s}px) scale(${s / 7})`;

      // Cabeza: sigue al ratón
      let ty = 0, tp = 0;
      if (this.opts.follow && mouse.active) {
        const r = this.root.getBoundingClientRect();
        const cx = r.left + r.width / 2, cy = r.top + r.height * 0.32;
        const dx = (mouse.x - cx) / Math.max(300, window.innerWidth / 2);
        const dy = (mouse.y - cy) / Math.max(250, window.innerHeight / 2);
        ty = clamp(dx * 55 - this.ry, -50, 50);
        tp = clamp(-dy * 32, -22, 26);
      } else {
        ty = Math.sin(t * 0.5) * 6;
      }
      this.head.yaw = lerp(this.head.yaw, ty, 0.12);
      this.head.pitch = lerp(this.head.pitch, tp, 0.12);

      // Saludo (al abrir y con doble clic)
      let w = 0;
      if (this.waveStart != null) {
        const e = (now - this.waveStart) / 1000;
        const dur = 2.6;
        if (e > dur) this.waveStart = null;
        else w = e < 0.45 ? smooth(e / 0.45) : e > dur - 0.55 ? smooth((dur - e) / 0.55) : 1;
      }

      // Respiración / caminar
      const breathe = Math.sin(t * 1.7);
      let armR = { x: Math.sin(t * 1.1) * 2.2, z: 3.5 + breathe * 2.2 };
      let armL = { x: -Math.sin(t * 1.1) * 2.2, z: -(3.5 + breathe * 2.2) };
      let legR = 0, legL = 0, cape = 8 + breathe * 2;
      if (this.walk) {
        const sw = Math.sin(t * 6.2) * 34;
        armR = { x: sw, z: 3 }; armL = { x: -sw, z: -3 };
        legR = -sw; legL = sw; cape = 18 + Math.abs(Math.sin(t * 6.2)) * 10;
      }
      if (w > 0) {
        armR = { x: lerp(armR.x, -12, w), z: lerp(armR.z, 152 + Math.sin(t * 10) * 20, w) };
      }

      this._pose('p-head', ` rotateY(${this.head.yaw}deg) rotateX(${this.head.pitch + (this.walk ? 0 : breathe * 0.8)}deg)`);
      this._pose('arm-r', ` rotateX(${armR.x}deg) rotateZ(${armR.z}deg)`);
      this._pose('arm-l', ` rotateX(${armL.x}deg) rotateZ(${armL.z}deg)`);
      this._pose('leg-r', ` rotateX(${legR}deg)`);
      this._pose('leg-l', ` rotateX(${legL}deg)`);
      this._pose('cape', ` rotateX(${cape}deg)`);

      for (const [name, p] of Object.entries(this.parts)) {
        const yaw = this.ry + (name === 'p-head' ? this.head.yaw : name === 'cape' ? 180 : 0);
        this._light(p.el, yaw);
      }
    }

    async setSkin(url, variant) {
      const first = !this.skinImg;
      this.skinUrl = url || STEVE;
      this.variant = variant === 'slim' ? 'slim' : 'classic';
      const token = (this._token = Symbol());
      const img = await loadImage(this.skinUrl) || await loadImage(STEVE);
      if (token !== this._token) return;
      this.skinImg = img;
      this._build();
      if (first && this.opts.wave) setTimeout(() => this.wave(), 250);
    }

    async setCape(url) {
      this.capeUrl = url || null;
      this.capeImg = url ? await loadImage(url) : null;
      this._build();
    }

    setVariant(variant) { this.variant = variant === 'slim' ? 'slim' : 'classic'; this._build(); }
    setWalk(on) { this.walk = !!on; }
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
      this.parts = {};

      const part = (name, x, y, z, extraBase = '') => {
        const el2 = el('part ' + name);
        const base = `translate3d(${x * s}px, ${y * s}px, ${z * s}px)${extraBase}`;
        el2.style.transform = base;
        this.parts[name] = { el: el2, base };
        return el2;
      };
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

      add(part('p-head', 0, -12, 0), [8, 8, 8, 0, 0], [8, 8, 8, 32, 0], [0, -4, 0], [1.125, 1.125, 1.125]);
      add(part('p-body', 0, -6, 0), [8, 12, 4, 16, 16], legacy ? null : [8, 12, 4, 16, 32], [0, 0, 0], [8.5 / 8, 12.5 / 12, 4.5 / 4]);
      add(part('arm-r', -(4 + aw / 2), -10, 0), [aw, 12, 4, 40, 16], legacy ? null : [aw, 12, 4, 40, 32], [0, 4, 0], limbScale(aw));
      add(part('arm-l', 4 + aw / 2, -10, 0), legacy ? [aw, 12, 4, 40, 16] : [aw, 12, 4, 32, 48], legacy ? null : [aw, 12, 4, 48, 48], [0, 4, 0], limbScale(aw));
      add(part('leg-r', -2, 0, 0), [4, 12, 4, 0, 16], legacy ? null : [4, 12, 4, 0, 32], [0, 6, 0], limbScale(4));
      add(part('leg-l', 2, 0, 0), legacy ? [4, 12, 4, 0, 16] : [4, 12, 4, 16, 48], legacy ? null : [4, 12, 4, 0, 48], [0, 6, 0], limbScale(4));

      if (this.capeImg) {
        const ci = this.capeImg;
        const ratio = ci.naturalWidth % 64 === 0 ? ci.naturalWidth / 64 : 1;
        const ctex = { url: this.capeUrl, w: ci.naturalWidth / ratio, h: ci.naturalHeight / ratio };
        const p = part('cape', 0, -12, -2.6, ' rotateY(180deg)');
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
