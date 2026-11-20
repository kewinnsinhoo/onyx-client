// Solo para previsualizar la interfaz en un navegador normal (sin Electron).
// Dentro del launcher real "window.onyx" ya existe y este archivo no hace nada.
(function () {
  if (window.onyx) return;
  const q = new URLSearchParams(location.search);
  const wait = (v, ms = 120) => new Promise(r => setTimeout(() => r(v), ms));
  const SK = 'assets/default-skin.png';
  const ALT = q.get('alt') || SK;
  let settings = {
    language: q.get('lang') || 'es', theme: q.get('theme') || 'onyx', memoryMb: 8192, windowWidth: '1920', windowHeight: '1080',
    fastDownload: true, afterLaunch: 'minimize', updateChannel: 'stable', hardwareAcceleration: true, onboarded: !q.get('onboard'),
    referral: q.get('noref') ? null : { code: 'KOPI', name: 'Kopi Studio', logo: null, linkedAt: Date.parse('2026-10-21') }, discord: null
  };
  const loggedOut = q.get('login') === '1' || q.get('onboard') === '1';
  let kopiWorn = q.get('worn') || null;
  const accounts = loggedOut ? [] : [
    { id: 'msa-1', type: 'msa', name: 'Kewinsinho', uuid: 'x', skin: SK, skinVariant: 'classic', capes: [] },
    { id: 'off-2', type: 'offline', name: 'Invitado', uuid: 'y', skin: null }
  ];
  const instances = q.get('empty') ? [] : [
    { id: 'survival-onyx', name: 'IGNITE EXTREMO 3', studio: { name: 'Kopi Studio' }, description: 'IGNITE EXTREMO 3 es una serie de supervivencia extrema donde cada día el mundo se vuelve más peligroso. Los participantes deberán completar misiones, proteger sus refugios y sobrevivir con vidas limitadas.\n\nEl azufre se extiende, los monstruos evolucionan y poderosos jefes comienzan a despertar.', minecraft: '1.21.1', loader: { type: 'fabric', version: '0.16.5' }, premium: false, guard: true, addedAt: Date.now() - 1e8, lastPlayed: Date.now() - 4e6, playTime: 5.4e6, server: { address: 'play.kopi.gg' },
      source: 'panel', category: 'Serie', banner: q.get('look') ? '../../web/img/arte-3.webp' : null, logo: q.get('look') ? 'assets/logo-wordmark.png' : null,
      look: q.get('look') ? { accent: '#f59e0b', playColor: '#ea580c', vignette: true, snow: true, music: { url: 'x.mp3', volume: 30, loop: true }, sponsor: { name: 'HostNova', url: 'https://example.com' } } : {},
      schedule: q.get('soon') ? { opensAt: Date.now() + 2 * 864e5, predownload: true } : null,
      newsSeen: Date.now() - 3 * 864e5,
      news: [
        { id: 'n3', at: Date.now() - 2 * 3600e3, text: '¡Temporada 2 ya está aquí!\n- Mapa nuevo con 3 biomas\n- Evento PvP el sábado a las 20:00\n- Arreglado el lag del spawn' },
        { id: 'n2', at: Date.now() - 5 * 3600e3, text: '', auto: { added: ['create-0.5.1', 'farmers-delight-1.5'], updated: ['sodium-0.6.0'], removed: ['optifine-hd'], config: 2 } },
        { id: 'n1', at: Date.now() - 6 * 864e5, text: 'Bienvenidos a IGNITE EXTREMO 3. Lee las normas en Discord.' }
      ] },
    { id: 'torneo', name: q.get('pre') ? 'dedsafio' : 'Torneo PvP', category: q.get('pre') ? 'Serie' : 'Torneo', studio: { name: 'Kopi Studio', logo: q.get('pre') ? 'assets/logo-wordmark.png' : null }, banner: q.get('pre') ? '../../web/img/arte-3.webp' : null, schedule: q.get('pre') ? { predownload: true } : null, minecraft: '1.8.9', loader: { type: 'vanilla' }, premium: false, addedAt: Date.now() - 3e8, state: 'locked', lockedMessage: 'Volvemos a las 18:00', source: 'panel', staff: !!q.get('staff'), playTime: 2.1e6 },
    { id: 'eventos', name: 'Eventos Kopi', description: '', minecraft: '1.20.4', loader: { type: 'vanilla' }, premium: true, addedAt: Date.now() - 2e8 }
  ];
  window.onyx = {
    platform: q.get('platform') || 'win32',
    win: { minimize: wait, maximize: wait, close: wait, onState: () => () => {} },
    app: {
      info: () => wait({ name: 'Kopi Client', studio: 'Kopi Studio', version: '1.4.1', core: '1.0.0', build: 2026, platform: q.get('platform') || 'win32', totalMemMb: 15 * 1024, discordInvite: 'https://discord.gg/x', githubRepo: 'onyx/onyx-client', gameDir: 'C:\\Users\\Kewin\\AppData\\Roaming\\.onyxclient',
        brand: q.get('brand') ? { id: 'nova', name: 'Nova Launcher', studio: 'nova-estudios', studioName: 'Nova Estudios', accent: '#f59e0b', accent2: '#ea580c', tagline: 'Los eventos de Nova', logo: null, background: '../../web/img/arte-2.webp', web: 'https://nova.gg', store: null, onlyStudio: true } : null }),
      quit: wait, openExternal: wait, openPath: wait, showItem: wait, relaunch: wait, clearCache: wait
    },
    settings: { get: () => wait({ ...settings }), set: (p) => { settings = { ...settings, ...p }; return wait({ ...settings }); } },
    updater: { check: () => wait({ status: 'latest' }, Number(q.get('splash') || 400)), install: wait, onEvent: () => () => {} },
    accounts: {
      list: () => wait({ accounts: [...accounts], active: accounts[0] ? accounts[0].id : null }),
      loginMicrosoft: () => wait(null, q.get('mswait') ? 600000 : 300), cancelLogin: wait, reopenLogin: wait, addOffline: (n) => { accounts.push({ id: 'off-' + n, type: 'offline', name: n, uuid: 'z' }); return wait({ name: n }); }, setActive: wait, remove: wait, refresh: wait
    },
    discord: { link: () => wait({ username: 'kewin' }), unlink: wait, presence: wait },
    crash: { fix: wait },
    skins: {
      library: () => wait([{ id: 'a', name: 'Hoodie blanco', variant: 'classic', data: ALT }, { id: 'b', name: 'Kopi', variant: 'slim', data: SK }]),
      libraryAdd: wait, libraryRemove: wait, lookup: (n) => wait({ name: n, skin: ALT, variant: 'classic' }), dataUrl: wait,
      pickFile: wait, validate: wait, apply: wait, setCape: wait, screenshot: wait
    },
    profile: { card: () => wait(null, 300) },
    capes: {
      kopi: () => wait({ owned: (q.has('capes') ? q.get('capes') : 'kopi,fire').split(',').filter(Boolean), worn: kopiWorn }),
      kopiWear: (id) => { kopiWorn = id || null; return wait({ ok: true, worn: kopiWorn }); }
    },
    data: {
      get: (n) => wait(n === 'creators.json' ? [
        { name: 'Kewinsinho', handle: '@kewinn', skin: SK, socials: { instagram: 'https://instagram.com', discord: 'https://discord.com', x: 'https://x.com' } },
        { name: 'Luis Enrique', handle: '@enriqueqq', skin: ALT, socials: { instagram: 'https://instagram.com', discord: 'https://discord.com', tiktok: 'https://tiktok.com' } }
      ] : n === 'notifications.json' ? [
        { title: 'Bienvenido a Kopi Client', date: '2026-10-26T09:55:00Z' },
        { title: 'Nueva instancia de eventos disponible', author: 'Kopi Studio', kind: 'success', date: '2026-10-21T14:58:00Z' }
      ] : null),
      terms: () => fetch('terms/es.md').then(r => r.text()).catch(() => '# Términos')
    },
    instances: {
      list: () => wait(instances), get: (id) => wait(instances.find(i => i.id === id)), redeem: () => wait(null, 300).then(() => { throw new Error('Código no válido o caducado'); }),
      remove: wait, setMemory: wait, seenNews: (id) => { const i = instances.find(x => x.id === id); if (i) i.newsSeen = Date.now(); return wait(i); }, setPerfMode: (id, on) => { const i = instances.find(x => x.id === id); if (i) i.perfMode = !!on; return wait(i); }, setFriendsMode: (id, on) => { const i = instances.find(x => x.id === id); if (i) i.friendsMode = !!on; return wait(i); }, onFriends: (cb) => { window.__friends = cb; return () => {}; }, play: wait, stop: wait, onProgress: (cb) => { window.__progress = cb; return () => {}; }, onChanged: () => () => {}, sync: wait,
      status: () => wait({ online: 0, max: 100 }, 600), wipe: wait, update: () => wait(null, 800), importPack: () => wait(12)
    },
    game: { log: () => wait('[12:00:01] [Render thread/INFO]: Setting user: Kewinsinho\n[12:00:02] [Render thread/WARN]: Ejemplo de aviso\n'), onLog: () => () => {} },
    gallery: { list: () => wait([]), remove: wait, open: wait, copy: wait },
    referrals: {
      ranking: () => wait([{ code: 'NEXO', name: 'NexoStudio', players: 56 }, { code: 'KOPI', name: 'Kopi Studio', players: 36 }, { code: 'CRUX', name: 'Crux Network', players: 29 }]),
      link: (c) => wait({ code: c, name: 'Kopi Studio', linkedAt: Date.now() })
    },
    report: { send: () => wait({ sent: true }, 500) }
  };
})();
