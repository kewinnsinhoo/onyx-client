// Listas de versiones de Minecraft y de cada loader (con caché de 1 hora).
const MOJANG = 'https://piston-meta.mojang.com/mc/game/version_manifest_v2.json';

async function cached(key, ctx, load, ttl = 3600) {
  const cache = typeof caches !== 'undefined' && caches.default;
  const req = new Request(`https://onyx-cache.local/${key}`);
  if (cache) { const hit = await cache.match(req); if (hit) return hit.json(); }
  const data = await load();
  if (cache && !data.error) {
    const res = new Response(JSON.stringify(data), { headers: { 'Content-Type': 'application/json', 'Cache-Control': `public, max-age=${ttl}` } });
    const put = cache.put(req, res);
    if (ctx && ctx.waitUntil) ctx.waitUntil(put); else await put;
  }
  return data;
}

async function getJson(url) {
  const r = await fetch(url, { headers: { 'User-Agent': 'KopiPanel/1.0' } });
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
  return r.json();
}

export function versions(ctx) {
  return cached('mc-versions', ctx, async () => {
    const m = await getJson(MOJANG);
    return {
      latest: m.latest,
      versions: m.versions.map(v => ({ id: v.id, type: v.type, date: v.releaseTime }))
    };
  });
}

// Comparar versiones (números primero; "beta" detrás de la estable)
export function cmpVersion(a, b) {
  const pa = String(a).split(/[.\-+]/), pb = String(b).split(/[.\-+]/);
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const x = pa[i], y = pb[i];
    if (x === undefined) return y && /^\d+$/.test(y) ? -1 : 1;
    if (y === undefined) return /^\d+$/.test(x) ? 1 : -1;
    const nx = /^\d+$/.test(x), ny = /^\d+$/.test(y);
    if (nx && ny) { const d = Number(x) - Number(y); if (d) return d; }
    else if (nx !== ny) return nx ? 1 : -1;
    else if (x !== y) return x < y ? -1 : 1;
  }
  return 0;
}
export function neoPrefix(mc) {
  const p = String(mc).split('.');
  if (p[0] === '1') return `${p[1]}.${p[2] || 0}.`;
  return `${p[0]}.${p[1] || 0}.${p[2] || 0}.`;
}

export async function loaderVersions(type, mc, ctx) {
  if (!type || !mc || type === 'vanilla') return { versions: [] };
  if (!/^[A-Za-z0-9._ -]{1,40}$/.test(mc)) return { versions: [] };
  return cached(`loader-${type}-${mc}`, ctx, async () => {
    try {
      if (type === 'fabric' || type === 'quilt') {
        const base = type === 'fabric' ? 'https://meta.fabricmc.net/v2/versions/loader/' : 'https://meta.quiltmc.org/v3/versions/loader/';
        const list = await getJson(base + encodeURIComponent(mc));
        const v = list.map(x => ({ id: x.loader.version, stable: x.loader.stable !== false && !/beta|pre|rc/i.test(x.loader.version) }));
        return { versions: v.map(x => x.id), recommended: (v.find(x => x.stable) || v[0] || {}).id || null };
      }
      if (type === 'forge') {
        const r = await fetch('https://maven.minecraftforge.net/net/minecraftforge/forge/maven-metadata.xml');
        const xml = r.ok ? await r.text() : '';
        const all = [...xml.matchAll(/<version>([^<]+)<\/version>/g)].map(m => m[1]).filter(v => v.startsWith(mc + '-')).map(v => v.slice(mc.length + 1));
        let rec = null;
        try { const pr = await getJson('https://files.minecraftforge.net/net/minecraftforge/forge/promotions_slim.json'); rec = pr.promos[`${mc}-recommended`] || pr.promos[`${mc}-latest`] || null; } catch { /* nada */ }
        all.sort(cmpVersion).reverse();
        return { versions: all, recommended: rec || all[0] || null };
      }
      if (type === 'neoforge') {
        const legacy = mc === '1.20.1';
        const data = await getJson(`https://maven.neoforged.net/api/maven/versions/releases/net/neoforged/${legacy ? 'forge' : 'neoforge'}`);
        let list = (data.versions || []);
        list = legacy ? list.filter(v => v.startsWith('1.20.1-')).map(v => v.slice(8)) : list.filter(v => v.startsWith(neoPrefix(mc)));
        list.sort(cmpVersion).reverse();
        return { versions: list, recommended: list.find(v => !/beta|alpha|rc/i.test(v)) || list[0] || null };
      }
    } catch (e) {
      return { versions: [], error: 'No se pudo consultar las versiones' };
    }
    return { versions: [] };
  });
}
