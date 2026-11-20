// Visor de skins en 3D hecho con CSS (sin librerías), + cabezas y vistas planas.
(function () {
  const STEVE = 'assets/default-skin.png';
  const DEFAULT_DATA = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAEAAAABACAYAAACqaXHeAAAByklEQVR4Xu3asUoDMRgH8It0KM4qtUjnWnSpjk4ivoEO+grS5RQcHB0c7FJ8AUEdfAGhlE59A0Wci9TSinSSbooHBe9s8/UzFxOT/w+6Nbnky5dc7nIiICwtzH3I/lK/OJbWUNo9FNQ1TJoxeXEbIAA2jIJJCIDJ6NsAAbBhFEwS1H1et+feq9F9gvcZkJlmhCft9rYPzqYpbrUMtZWlOqla3jQyA746uLwTBvvVl+CkcBO197S9F1yHi0HddOtTIB5vz6UPO6qoDPpXi+BD6z76uYScAt+tbKy61PfIj3twsbQemxLNxl2s0/n8vPS+ncsVlKZUt9tm1d+sVWLt475/8H4fgAA4N6mZRHLOcw3eehOLjObnZqXGrTY11JqCDNCZATZABhBYGyGOcOsp9vdqo8gp/me8XwO0ZYCtI56EDNAx2bLZ2bHVDofvOi6nREsA0pRcTLmOrsYPxojodPpKT2/l8hq3TSzJpz0u6unQ+zUAAAAAAAAAAPwjPYv/jbS/L1A9/6d4/0YIAaBSxHXKa4Dp02Xq9JfifQYgAFSKuA4BcH2EKQgAFSHXeR8A498H6D7/pyjvBFW/Lxi0Lqk2SlHn/xTvp8An7rBuGjT0eSgAAAAASUVORK5CYII=';

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

  class CssSkinViewer {
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

      if (this.turnTo != null && !this.dragging) {
        this.ry += (this.turnTo - this.ry) * 0.12;
        if (Math.abs(this.turnTo - this.ry) < 0.2) { this.ry = this.turnTo; this.turnTo = null; }
      }
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
    // Girar el muñeco para ver la espalda (al probar capas) o volver de frente
    showBack(on) { this.turnTo = this.opts.rotY + (on ? 180 : 0); }

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


  // ================= Visor WebGL (skinview3d + three.js) =================
  // Es el mismo motor que usan los launchers de Minecraft: luces reales, modelo oficial y animaciones.
  const texCache = new Map();
  async function resolveTexture(url) {
    if (!url || url === STEVE) return DEFAULT_DATA;
    if (url.startsWith('data:')) return url;
    if (/^https?:\/\//.test(url) && window.onyx && onyx.skins && onyx.skins.dataUrl) {
      if (!texCache.has(url)) texCache.set(url, onyx.skins.dataUrl(url).catch(() => null));
      return (await texCache.get(url)) || DEFAULT_DATA;
    }
    return url;
  }

  function webglOk() {
    try { const c = document.createElement('canvas'); return !!(window.skinview3d && (c.getContext('webgl2') || c.getContext('webgl'))); }
    catch { return false; }
  }

  class SkinViewer {
    constructor(container, opts = {}) {
      if (!webglOk()) return new CssSkinViewer(container, opts);
      this.opts = Object.assign({ rotY: -26, interactive: true, wave: true, follow: true, walk: false, zoom: 0.74, fov: 28 }, opts);
      this.container = container;
      this.root = el('skin3d webgl');
      this.canvas = document.createElement('canvas');
      this.root.appendChild(this.canvas);
      container.appendChild(this.root);
      const r = container.getBoundingClientRect();
      const v = this.viewer = new skinview3d.SkinViewer({
        canvas: this.canvas, width: Math.max(50, r.width), height: Math.max(50, r.height),
        pixelRatio: 'match-device', preserveDrawingBuffer: true, zoom: this.opts.zoom, fov: this.opts.fov
      });
      v.background = null;
      // Igual que Minecraft: píxeles nítidos (sin suavizado) y luz como en el juego.
      if (v.fxaaPass) v.fxaaPass.enabled = false;
      // Luz ambiente + luz desde arriba a la izquierda de la cámara (sombras suaves como en NameMC)
      v.globalLight.intensity = 1.9;
      v.cameraLight.intensity = 1.8;
      v.cameraLight.decay = 0;
      v.cameraLight.position.set(-35, 30, 10);
      this._cutout();
      v.controls.enableZoom = false;
      v.controls.enablePan = false;
      v.controls.enableRotate = !!this.opts.interactive;
      v.playerWrapper.rotation.y = this.opts.rotY * DEG;
      this.walk = !!this.opts.walk;
      this.headYaw = 0; this.headPitch = 0;
      this.waveStart = null;
      this.anim = new skinview3d.FunctionAnimation((player, t, delta) => this._animate(player, t, delta));
      v.animation = this.anim;
      this._ro = new ResizeObserver(() => {
        const b = container.getBoundingClientRect();
        if (b.width > 10 && b.height > 10) v.setSize(b.width, b.height);
      });
      this._ro.observe(container);
      this.root.addEventListener('dblclick', () => this.wave());
    }

    wave() { this.waveStart = performance.now(); }

    // La capa exterior (pelo, chaqueta, mangas...) se dibuja como en Minecraft:
    // cada píxel es visible o invisible, sin transparencias "fantasma" ni caras internas raras.
    _cutout() {
      // Colores reales de la skin (sin esto three.js los muestra lavados/más claros)
      for (const tex of [this.viewer.skinTexture, this.viewer.capeTexture, this.viewer.earsTexture]) {
        if (tex && tex.colorSpace !== 'srgb') { tex.colorSpace = 'srgb'; tex.needsUpdate = true; }
      }
      this.viewer.playerObject.traverse((o) => {
        const mats = o.material ? (Array.isArray(o.material) ? o.material : [o.material]) : [];
        for (const m of mats) {
          if (m.transparent) {
            m.transparent = false;
            m.alphaTest = 0.5;
            m.depthWrite = true;
            m.needsUpdate = true;
          }
        }
      });
    }

    _animate(player, t) {
      const skin = player.skin;
      const now = performance.now();

      // --- respiración (quieto) ---
      const breathe = Math.cos(t * 2);
      let rArmX = 0, rArmZ = -(Math.PI * 0.02) - breathe * 0.03;
      let lArmX = 0, lArmZ = (Math.PI * 0.02) + breathe * 0.03;
      let rLeg = 0, lLeg = 0;
      let capeX = Math.PI * 0.06 + Math.sin(t * 2) * 0.01;
      if (this.turnTo != null) {
        const w = this.viewer.playerWrapper;
        w.rotation.y += (this.turnTo - w.rotation.y) * 0.12;
        if (Math.abs(this.turnTo - w.rotation.y) < 0.002) { w.rotation.y = this.turnTo; this.turnTo = null; }
      }

      // --- caminar ---
      if (this.walk) {
        const w = t * 8;
        rLeg = Math.sin(w + Math.PI) * 0.5; lLeg = Math.sin(w) * 0.5;
        rArmX = Math.sin(w) * 0.5; lArmX = Math.sin(w + Math.PI) * 0.5;
        capeX = Math.PI * 0.06 + Math.sin(w / 1.5) * 0.06 + 0.25;
      }

      // --- saludo ---
      if (this.waveStart != null) {
        const e = (now - this.waveStart) / 1000, dur = 2.6;
        if (e > dur) this.waveStart = null;
        else {
          const k = e < 0.4 ? smooth(e / 0.4) : e > dur - 0.5 ? smooth((dur - e) / 0.5) : 1;
          rArmZ = lerp(rArmZ, -(2.55 + Math.sin(e * 11) * 0.32), k);
          rArmX = lerp(rArmX, -0.15, k);
        }
      }

      skin.rightArm.rotation.x = rArmX; skin.rightArm.rotation.z = rArmZ;
      skin.leftArm.rotation.x = lArmX; skin.leftArm.rotation.z = lArmZ;
      skin.rightLeg.rotation.x = rLeg; skin.leftLeg.rotation.x = lLeg;
      player.cape.rotation.x = capeX;

      // --- la cabeza mira al ratón ---
      let ty = Math.sin(t * 0.6) * 0.08, tp = breathe * 0.015;
      if (this.opts.follow && mouse.active) {
        const r = this.canvas.getBoundingClientRect();
        if (r.width) {
          const cam = this.viewer.camera.position;
          const camYaw = Math.atan2(cam.x, cam.z);              // dónde está la cámara
          const body = this.viewer.playerWrapper.rotation.y;   // hacia dónde mira el cuerpo
          const dx = (mouse.x - (r.left + r.width / 2)) / Math.max(320, window.innerWidth / 2);
          const dy = (mouse.y - (r.top + r.height * 0.3)) / Math.max(260, window.innerHeight / 2);
          ty = clamp(camYaw - body + clamp(dx, -1.2, 1.2) * 0.85, -1.0, 1.0);
          tp = clamp(dy * 0.7, -0.5, 0.45);
        }
      }
      this.headYaw = lerp(this.headYaw, ty, 0.1);
      this.headPitch = lerp(this.headPitch, tp, 0.1);
      skin.head.rotation.y = this.headYaw;
      skin.head.rotation.x = this.headPitch;
    }

    async setSkin(url, variant) {
      const first = !this.loaded;
      this.skinUrl = url;
      this.variant = variant === 'slim' ? 'slim' : 'classic';
      const token = (this._token = Symbol());
      const src = await resolveTexture(url);
      if (token !== this._token) return;
      try { await this.viewer.loadSkin(src, { model: this.variant === 'slim' ? 'slim' : 'default' }); }
      catch { await this.viewer.loadSkin(DEFAULT_DATA, { model: 'default' }); }
      this._cutout();
      this.loaded = true;
      if (first && this.opts.wave) setTimeout(() => this.wave(), 200);
    }

    async setCape(url) {
      if (!url) { this.viewer.loadCape(null); return; }
      try { await this.viewer.loadCape(await resolveTexture(url)); this._cutout(); } catch { /* sin capa */ }
    }

    setVariant(variant) { this.setSkin(this.skinUrl, variant); }
    setWalk(on) { this.walk = !!on; }
    setOuter(on) { this.viewer.playerObject.skin.setOuterLayerVisible(!!on); }
    setCapeVisible(on) { this.viewer.playerObject.cape.visible = !!on; this.viewer.playerObject.elytra.visible = !!on; }
    showBack(on) { this.turnTo = (this.opts.rotY + (on ? 180 : 0)) * DEG; }

    destroy() {
      try { this._ro.disconnect(); } catch { /* nada */ }
      try { this.viewer.dispose(); } catch { /* nada */ }
      this.root.remove();
    }
  }


  // Detecta si una skin es Slim (brazos de 3 px) o Clásica (4 px), con la misma regla que usa NameMC:
  // en las skins slim la última columna de cada brazo está vacía (transparente) o es toda negra/blanca.
  const modelCache = new Map();
  async function detectModel(url) {
    if (!url) return 'classic';
    if (modelCache.has(url)) return modelCache.get(url);
    let result = 'classic';
    try {
      const src = await resolveTexture(url);
      const img = await loadImage(src);
      if (img && img.naturalHeight !== img.naturalWidth / 2) {
        const w = img.naturalWidth, h = img.naturalHeight, k = w / 64;
        const c = document.createElement('canvas'); c.width = w; c.height = h;
        const ctx = c.getContext('2d', { willReadFrequently: true });
        ctx.drawImage(img, 0, 0);
        const areas = [[50, 16, 2, 4], [54, 20, 2, 12], [42, 48, 2, 4], [46, 52, 2, 12]]
          .map(([x, y, aw, ah]) => ctx.getImageData(x * k, y * k, aw * k, ah * k).data);
        const transparent = (d) => { for (let i = 3; i < d.length; i += 4) if (d[i] !== 255) return true; return false; };
        const solid = (d, v) => { for (let i = 0; i < d.length; i += 4) if (d[i] !== v || d[i + 1] !== v || d[i + 2] !== v || d[i + 3] !== 255) return false; return true; };
        const slim = areas.some(transparent) || areas.every(d => solid(d, 0)) || areas.every(d => solid(d, 255));
        result = slim ? 'slim' : 'classic';
      }
    } catch { /* si falla, clásico */ }
    modelCache.set(url, result);
    return result;
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

  window.Skin3D = { detectModel, SkinViewer, CssSkinViewer, DEFAULT_DATA, head, flat, fixLegacy, capePreview, STEVE, loadImage };
})();
