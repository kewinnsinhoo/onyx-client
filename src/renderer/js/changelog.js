// Novedades del launcher: lo que trae cada versión, contado para el jugador (no para el studio).
// Al actualizarse, el launcher enseña una vez las de las versiones nuevas (App.whatsNew).
// Cada versión publicada TIENE que tener aquí su entrada (lo comprueba test/run-tests.js).
// Formato: { v, date: 'AAAA-MM-DD', items: [[icono, es, en, ca, fr], ...] } — la más nueva arriba.
window.CHANGELOG = [
  {
    v: '1.7.6', date: '2026-11-20', items: [
      ['sparkles', 'Al actualizarse, el launcher te enseña lo que trae cada versión (¡como ahora!).',
        'After updating, the launcher shows you what each version brings (like right now!).',
        'En actualitzar-se, el launcher t’ensenya què porta cada versió (com ara!).',
        'Après une mise à jour, le launcher te montre ce qu’apporte chaque version (comme maintenant !).'],
      ['history', 'Puedes volver a verlas cuando quieras en Ajustes → Acerca de → Novedades del launcher.',
        'You can see them again anytime in Settings → About → What’s new.',
        'Les pots tornar a veure quan vulguis a Configuració → Quant a → Novetats del launcher.',
        'Tu peux les revoir quand tu veux dans Paramètres → À propos → Nouveautés du launcher.']
    ]
  },
  {
    v: '1.7.5', date: '2026-11-20', items: [
      ['wrench', 'Si el juego se cierra con un error, el launcher te dice qué pasó en palabras sencillas y te da un botón para arreglarlo (memoria, Java, mods, tarjeta gráfica…).',
        'If the game closes with an error, the launcher tells you what happened in plain words and gives you a button to fix it (memory, Java, mods, graphics card…).',
        'Si el joc es tanca amb un error, el launcher et diu què ha passat en paraules senzilles i et dona un botó per arreglar-ho (memòria, Java, mods, targeta gràfica…).',
        'Si le jeu se ferme avec une erreur, le launcher t’explique ce qui s’est passé simplement et te propose un bouton pour réparer (mémoire, Java, mods, carte graphique…).'],
      ['megaphone', 'Novedades de las instancias: mira lo nuevo que prepara cada studio y qué mods han cambiado. Un puntito te avisa cuando hay algo nuevo.',
        'Instance news: see what each studio has prepared and which mods changed. A little dot tells you when there’s something new.',
        'Novetats de les instàncies: mira què prepara cada studio i quins mods han canviat. Un puntet t’avisa quan hi ha alguna cosa nova.',
        'Nouveautés des instances : découvre ce que prépare chaque studio et quels mods ont changé. Un petit point te prévient quand il y a du nouveau.']
    ]
  },
  {
    v: '1.7.4', date: '2026-11-20', items: [
      ['discord', 'Tu estado de Discord muestra también el studio y su logo mientras juegas.',
        'Your Discord status now also shows the studio and its logo while you play.',
        'El teu estat de Discord també mostra el studio i el seu logo mentre jugues.',
        'Ton statut Discord affiche aussi le studio et son logo pendant que tu joues.'],
      ['shield', 'KopiGuard también puede vigilar desde el servidor del studio (vuelo, velocidad, alcance…), sin contar empujones, explosiones ni caídas.',
        'KopiGuard can now also watch from the studio’s server (flying, speed, reach…), ignoring knockback, explosions and falls.',
        'KopiGuard també pot vigilar des del servidor del studio (vol, velocitat, abast…), sense comptar empentes, explosions ni caigudes.',
        'KopiGuard peut aussi surveiller depuis le serveur du studio (vol, vitesse, portée…), sans compter les reculs, explosions et chutes.']
    ]
  },
  {
    v: '1.7.3', date: '2026-11-20', items: [
      ['wrench', 'Arreglos de KopiGuard en Windows: las cámaras ya funcionan y no sale el borde amarillo alrededor del juego.',
        'KopiGuard fixes on Windows: cameras now work and there’s no yellow border around the game.',
        'Arranjaments de KopiGuard a Windows: les càmeres ja funcionen i no surt la vora groga al voltant del joc.',
        'Corrections de KopiGuard sur Windows : les caméras fonctionnent et il n’y a plus de bordure jaune autour du jeu.']
    ]
  },
  {
    v: '1.7.0', date: '2026-11-20', items: [
      ['video', 'KopiGuard: en las instancias que lo usan, el studio puede ver una foto y un vídeo corto cuando salta algo, y ver el juego en directo. Solo la ventana del juego, nunca el resto de tu pantalla.',
        'KopiGuard: in instances that use it, the studio can see a screenshot and a short video when something is detected, and watch the game live. Only the game window, never the rest of your screen.',
        'KopiGuard: a les instàncies que el fan servir, el studio pot veure una foto i un vídeo curt quan salta alguna cosa, i veure el joc en directe. Només la finestra del joc, mai la resta de la pantalla.',
        'KopiGuard : dans les instances qui l’utilisent, le studio peut voir une capture et une courte vidéo en cas de détection, et voir le jeu en direct. Seulement la fenêtre du jeu, jamais le reste de ton écran.']
    ]
  },
  {
    v: '1.6.0', date: '2026-11-20', items: [
      ['shield', 'Llega KopiGuard, el anticheat de los studios. Las instancias que lo usan llevan la etiqueta «KopiGuard».',
        'Say hello to KopiGuard, the studios’ anticheat. Instances that use it show a “KopiGuard” label.',
        'Arriba KopiGuard, l’anticheat dels studios. Les instàncies que el fan servir porten l’etiqueta «KopiGuard».',
        'Voici KopiGuard, l’anticheat des studios. Les instances qui l’utilisent affichent l’étiquette « KopiGuard ».']
    ]
  },
  {
    v: '1.5.2', date: '2026-11-19', items: [
      ['lock', 'Los mods de las instancias quedan protegidos: se guardan cifrados y no se pueden copiar.',
        'Instance mods are now protected: they’re stored encrypted and can’t be copied.',
        'Els mods de les instàncies queden protegits: es guarden xifrats i no es poden copiar.',
        'Les mods des instances sont protégés : ils sont chiffrés et ne peuvent pas être copiés.']
    ]
  },
  {
    v: '1.5.0', date: '2026-11-19', items: [
      ['zap', 'Modo rendimiento: mods que hacen que el juego vaya más fluido, en cada instancia (menú ⋯ de la instancia).',
        'Performance mode: mods that make the game run smoother, per instance (instance ⋯ menu).',
        'Mode rendiment: mods que fan que el joc vagi més fluid, a cada instància (menú ⋯ de la instància).',
        'Mode performance : des mods qui rendent le jeu plus fluide, par instance (menu ⋯ de l’instance).'],
      ['idcard', 'Mi perfil: una tarjeta con tu skin, tu capa y tus horas para compartir.',
        'My profile: a card with your skin, cape and hours to share.',
        'El meu perfil: una targeta amb la teva skin, la teva capa i les teves hores per compartir.',
        'Mon profil : une carte avec ton skin, ta cape et tes heures à partager.']
    ]
  },
  {
    v: '1.4.8', date: '2026-11-18', items: [
      ['sparkles', 'Capas de Kopi: póntelas en el launcher y se ven animadas dentro del juego.',
        'Kopi capes: put them on in the launcher and they show up animated in-game.',
        'Capes de Kopi: posa-te-les al launcher i es veuen animades dins del joc.',
        'Capes Kopi : mets-les dans le launcher et elles s’affichent animées en jeu.']
    ]
  }
];
