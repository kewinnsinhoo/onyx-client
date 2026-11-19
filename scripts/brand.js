// Fábrica de launchers de marca: convierte esta copia de Kopi Client en el launcher de un studio.
// Uso (lo hace GitHub Actions en este repo, workflow «Launcher de marca»):
//   node scripts/brand.js https://panel.onyxclient.site/api/public/brands/<id>/build
//   node scripts/brand.js ./marca.json         (para probar en local)
// Cambia: nombre del programa, icono, carpeta de datos, accesos directos, nombre de los instaladores
// y de dónde se actualiza. Deja brand.json para que el launcher se vista con la marca al abrirse.
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const RELEASES = process.env.RELEASES_REPO || 'kewinnsinhoo/onyx-client';

async function load(src) {
  if (/^https:\/\//.test(src)) {
    const r = await fetch(src);
    if (!r.ok) throw new Error(`No se pudo leer la marca (${r.status})`);
    const j = await r.json();
    return j.brand || j;
  }
  return JSON.parse(fs.readFileSync(src, 'utf8'));
}

async function download(url, dest, { maxMb = 15 } = {}) {
  if (!url) return false;
  if (!/^https:\/\//.test(url)) { // archivo local (pruebas)
    if (!fs.existsSync(url)) return false;
    fs.copyFileSync(url, dest);
    return true;
  }
  const r = await fetch(url);
  if (!r.ok) throw new Error(`No se pudo descargar ${url} (${r.status})`);
  const buf = Buffer.from(await r.arrayBuffer());
  if (buf.length > maxMb * 1048576) throw new Error(`${url} pesa demasiado`);
  fs.writeFileSync(dest, buf);
  return true;
}

// Tamaño de un PNG (el icono debe ser cuadrado y de 512 px o más)
function pngSize(file) {
  const b = fs.readFileSync(file);
  if (b.length < 24 || b.readUInt32BE(0) !== 0x89504e47) return null;
  return { w: b.readUInt32BE(16), h: b.readUInt32BE(20) };
}

const ascii = (s) => String(s).normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^A-Za-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'Launcher';
const color = (c) => (/^#[0-9a-f]{6}$/i.test(c || '') ? c.toLowerCase() : null);
const https = (u) => (/^https:\/\/[^\s]+$/.test(u || '') ? u : null);

async function main() {
  const src = process.argv[2];
  if (!src) throw new Error('Falta la marca: node scripts/brand.js <url o archivo>');
  const b = await load(src);
  if (!/^[a-z][a-z0-9-]{1,31}$/.test(b.id || '')) throw new Error('Id de marca no válido');
  const name = String(b.name || '').trim().slice(0, 40);
  if (name.length < 2) throw new Error('La marca no tiene nombre');
  const slug = ascii(name);

  // Imágenes: icono del programa (obligatorio para que no salga el de Kopi), logo y fondo
  const brandDir = path.join(ROOT, 'src', 'renderer', 'brand');
  fs.mkdirSync(brandDir, { recursive: true });
  const iconTmp = path.join(brandDir, 'icon.png');
  if (await download(b.icon, iconTmp)) {
    const sz = pngSize(iconTmp);
    if (!sz || sz.w !== sz.h || sz.w < 256) throw new Error('El icono tiene que ser un PNG cuadrado de al menos 256 px (mejor 512 o 1024)');
    fs.copyFileSync(iconTmp, path.join(ROOT, 'build', 'icon.png'));
    fs.copyFileSync(iconTmp, path.join(ROOT, 'src', 'renderer', 'assets', 'icon.png'));
  } else console.warn('La marca no tiene icono: se usa el de Kopi');
  const ext = (u, def) => ((String(u || '').split('?')[0].match(/\.(png|webp|jpe?g|gif|webm|mp4)$/i) || [])[1] || def).toLowerCase();
  const logo = b.logo ? `brand/logo.${ext(b.logo, 'png')}` : null;
  const bg = b.background ? `brand/background.${ext(b.background, 'webp')}` : null;
  if (logo) await download(b.logo, path.join(ROOT, 'src', 'renderer', logo));
  if (bg) await download(b.background, path.join(ROOT, 'src', 'renderer', bg), { maxMb: 25 });

  // brand.json: lo lee el launcher al abrirse (src/main/config.js)
  const out = {
    id: b.id,
    name,
    studio: b.studio || null,
    studioName: b.studioName || null,
    accent: color(b.accent),
    accent2: color(b.accent2),
    tagline: String(b.tagline || '').slice(0, 120),
    logo,
    background: bg,
    discord: https(b.discord),
    web: https(b.web),
    store: https(b.store),
    onlyStudio: b.onlyStudio !== false,
    iconUrl: https(b.icon),
    builtAt: new Date().toISOString(),
    config: {
      appName: name,
      ...(b.studioName ? { studioName: b.studioName } : {}),
      ...(https(b.discord) ? { discordInvite: b.discord } : {}),
      ...(/^\d{15,22}$/.test(b.discordClientId || '') ? { discordClientId: b.discordClientId } : {})
    }
  };
  fs.writeFileSync(path.join(ROOT, 'brand.json'), JSON.stringify(out, null, 2));

  // package.json: nombre, id, accesos directos, instaladores y actualizaciones propias
  const pkgFile = path.join(ROOT, 'package.json');
  const pkg = JSON.parse(fs.readFileSync(pkgFile, 'utf8'));
  const bl = pkg.build;
  bl.appId = `site.onyxclient.brand.${b.id}`;
  bl.productName = name;
  bl.copyright = `© ${b.studioName || name} · con la tecnología de Kopi Client`;
  bl.extraMetadata = { ...(bl.extraMetadata || {}), name: `onyx-${b.id}`, productName: name, description: `${name} · Minecraft launcher` };
  bl.files = [...new Set([...(bl.files || []), 'brand.json'])];
  bl.publish = [{ provider: 'generic', url: `https://github.com/${RELEASES}/releases/download/brand-${b.id}` }];
  bl.win.artifactName = `${slug}-Setup-\${version}.\${ext}`;
  bl.nsis.shortcutName = name;
  bl.nsis.uninstallDisplayName = name;
  bl.mac.artifactName = `${slug}-\${version}-\${arch}.\${ext}`;
  bl.linux.artifactName = `${slug}-\${version}.\${ext}`;
  bl.linux.executableName = `onyx-${b.id}`;
  fs.writeFileSync(pkgFile, JSON.stringify(pkg, null, 2));

  console.log(`Marca aplicada: ${name} (${b.id})`);
  console.log(`  actualizaciones: https://github.com/${RELEASES}/releases/tag/brand-${b.id}`);
}

main().catch((e) => { console.error('::error::' + e.message); process.exit(1); });
