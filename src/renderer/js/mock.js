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
    referral: q.get('noref') ? null : { code: 'ONYX', name: 'Onyx Studios', logo: null, linkedAt: Date.parse('2026-10-21') }, discord: null
  };
  const loggedOut = q.get('login') === '1' || q.get('onboard') === '1';
  const accounts = loggedOut ? [] : [
    { id: 'msa-1', type: 'msa', name: 'Kewinsinho', uuid: 'x', skin: SK, skinVariant: 'classic', capes: [] },
    { id: 'off-2', type: 'offline', name: 'Invitado', uuid: 'y', skin: null }
  ];
  const instances = q.get('empty') ? [] : [
    { id: 'survival-onyx', name: 'IGNITE EXTREMO 3', studio: { name: 'Onyx Studios' }, description: 'IGNITE EXTREMO 3 es una serie de supervivencia extrema donde cada día el mundo se vuelve más peligroso. Los participantes deberán completar misiones, proteger sus refugios y sobrevivir con vidas limitadas.\n\nEl azufre se extiende, los monstruos evolucionan y poderosos jefes comienzan a despertar.', minecraft: '1.21.1', loader: { type: 'fabric', version: '0.16.5' }, premium: false, addedAt: Date.now() - 1e8, lastPlayed: Date.now() - 4e6, playTime: 5.4e6, server: { address: 'play.onyx.gg' },
      source: 'panel', category: 'Serie', banner: q.get('look') ? '../../web/img/arte-3.webp' : null, logo: q.get('look') ? 'assets/logo-wordmark.png' : null,
      look: q.get('look') ? { accent: '#f59e0b', playColor: '#ea580c', vignette: true, snow: true, music: { url: 'x.mp3', volume: 30, loop: true }, sponsor: { name: 'HostNova', url: 'https://example.com' } } : {},
      schedule: q.get('soon') ? { opensAt: Date.now() + 2 * 864e5, predownload: true } : null },
    { id: 'torneo', name: 'Torneo PvP', category: 'Torneo', minecraft: '1.8.9', loader: { type: 'vanilla' }, premium: false, addedAt: Date.now() - 3e8, state: 'locked', lockedMessage: 'Volvemos a las 18:00', source: 'panel' },
    { id: 'eventos', name: 'Eventos Onyx', description: '', minecraft: '1.20.4', loader: { type: 'vanilla' }, premium: true, addedAt: Date.now() - 2e8 }
  ];
  window.onyx = {
    platform: q.get('platform') || 'win32',
    win: { minimize: wait, maximize: wait, close: wait, onState: () => () => {} },
    app: {
      info: () => wait({ name: 'Onyx Client', studio: 'Onyx Studios', version: '1.1.4', core: '1.0.0', build: 2026, platform: q.get('platform') || 'win32', totalMemMb: 15 * 1024, discordInvite: 'https://discord.gg/x', githubRepo: 'onyx/onyx-client', gameDir: 'C:\\Users\\Kewin\\AppData\\Roaming\\.onyxclient' }),
      quit: wait, openExternal: wait, openPath: wait, showItem: wait, relaunch: wait, clearCache: wait
    },
    settings: { get: () => wait({ ...settings }), set: (p) => { settings = { ...settings, ...p }; return wait({ ...settings }); } },
    updater: { check: () => wait({ status: 'latest' }, Number(q.get('splash') || 400)), install: wait, onEvent: () => () => {} },
    accounts: {
      list: () => wait({ accounts: [...accounts], active: accounts[0] ? accounts[0].id : null }),
      loginMicrosoft: () => wait(null, q.get('mswait') ? 600000 : 300), cancelLogin: wait, reopenLogin: wait, addOffline: (n) => { accounts.push({ id: 'off-' + n, type: 'offline', name: n, uuid: 'z' }); return wait({ name: n }); }, setActive: wait, remove: wait, refresh: wait
    },
    discord: { link: () => wait({ username: 'kewin' }), unlink: wait, presence: wait },
    skins: {
      library: () => wait([{ id: 'a', name: 'Hoodie blanco', variant: 'classic', data: ALT }, { id: 'b', name: 'Onyx', variant: 'slim', data: SK }]),
      libraryAdd: wait, libraryRemove: wait, lookup: (n) => wait({ name: n, skin: ALT, variant: 'classic' }), dataUrl: wait,
      pickFile: wait, validate: wait, apply: wait, setCape: wait, screenshot: wait
    },
    data: {
      get: (n) => wait(n === 'creators.json' ? [
        { name: 'Kewinsinho', handle: '@kewinn', skin: SK, socials: { instagram: 'https://instagram.com', discord: 'https://discord.com', x: 'https://x.com' } },
        { name: 'Luis Enrique', handle: '@enriqueqq', skin: ALT, socials: { instagram: 'https://instagram.com', discord: 'https://discord.com', tiktok: 'https://tiktok.com' } }
      ] : n === 'notifications.json' ? [
        { title: 'Bienvenido a Onyx Client', date: '2026-10-26T09:55:00Z' },
        { title: 'Nueva instancia de eventos disponible', author: 'Onyx Studios', kind: 'success', date: '2026-10-21T14:58:00Z' }
      ] : null),
      terms: () => fetch('terms/es.md').then(r => r.text()).catch(() => '# Términos')
    },
    instances: {
      list: () => wait(instances), get: (id) => wait(instances.find(i => i.id === id)), redeem: () => wait(null, 300).then(() => { throw new Error('Código no válido o caducado'); }),
      remove: wait, setMemory: wait, play: wait, stop: wait, onProgress: () => () => {}, onChanged: () => () => {}, sync: wait,
      status: () => wait({ online: 0, max: 100 }, 600), wipe: wait, update: () => wait(null, 800), importPack: () => wait(12)
    },
    game: { log: () => wait('[12:00:01] [Render thread/INFO]: Setting user: Kewinsinho\n[12:00:02] [Render thread/WARN]: Ejemplo de aviso\n'), onLog: () => () => {} },
    gallery: { list: () => wait([]), remove: wait, open: wait },
    referrals: {
      ranking: () => wait([{ code: 'NEXO', name: 'NexoStudio', players: 56 }, { code: 'ONYX', name: 'Onyx Studios', players: 36 }, { code: 'CRUX', name: 'Crux Network', players: 29 }]),
      link: (c) => wait({ code: c, name: 'Onyx Studios', linkedAt: Date.now() })
    },
    report: { send: () => wait({ sent: true }, 500) }
  };
})();
