// Novedades del launcher: lo que trae cada versión, contado para el jugador (no para el studio).
// Al actualizarse, el launcher enseña una vez las de las versiones nuevas (App.whatsNew).
// Cada versión publicada TIENE que tener aquí su entrada (lo comprueba test/run-tests.js).
// Formato: { v, date: 'AAAA-MM-DD', items: [[icono, es, en, ca, fr], ...] } — la más nueva arriba.
window.CHANGELOG = [
  {
    v: '1.8.9', date: '2026-11-22', items: [
      ['crown', 'Nueva rareza «Mítica» para las insignias: oro que brilla, estrellas que parpadean y una corona. La primera es la insignia «Creador».',
        'New “Mythic” badge rarity: shining gold, twinkling stars and a crown. The first one is the “Creator” badge.',
        'Nova raresa «Mítica» per a les insígnies: or que brilla, estrelles que parpellegen i una corona. La primera és la insígnia «Creador».',
        'Nouvelle rareté « Mythique » pour les badges : or brillant, étoiles scintillantes et une couronne. Le premier est le badge « Créateur ».']
    ]
  },
  {
    v: '1.8.8', date: '2026-11-22', items: [
      ['sparkles', 'Launchers de los studios con su marca en todo: el nombre en todos los textos, su logo en vez del de Kopi, sus colores en fondos y tarjetas, y botones que se leen bien con cualquier color (también blanco).',
        'Studio launchers fully branded: their name in every text, their logo instead of Kopi’s, their colors on backgrounds and cards, and buttons that stay readable with any color (white too).',
        'Launchers dels studios amb la seva marca a tot arreu: el nom a tots els textos, el seu logo en lloc del de Kopi, els seus colors als fons i targetes, i botons que es llegeixen bé amb qualsevol color (també blanc).',
        'Launchers des studios entièrement à leur image : leur nom dans tous les textes, leur logo au lieu de celui de Kopi, leurs couleurs sur les fonds et cartes, et des boutons lisibles avec n’importe quelle couleur (même le blanc).']
    ]
  },
  {
    v: '1.8.7', date: '2026-11-22', items: [
      ['alert', 'Avisos más claros cuando el panel tiene un problema, en vez de «Error interno del servidor».',
        'Clearer warnings when the panel has a problem, instead of “Internal server error”.',
        'Avisos més clars quan el panell té un problema, en lloc d’«Error intern del servidor».',
        'Messages plus clairs quand le panel a un problème, au lieu de « Erreur interne du serveur ».'],
      ['video', 'KopiGuard gasta menos internet: la cuadrícula de cámaras se actualiza cada 12 segundos (el vídeo en grande sigue en directo).',
        'KopiGuard uses less internet: the camera grid updates every 12 seconds (the large live video stays real time).',
        'KopiGuard gasta menys internet: la quadrícula de càmeres s’actualitza cada 12 segons (el vídeo en gran continua en directe).',
        'KopiGuard consomme moins : la grille des caméras se met à jour toutes les 12 secondes (la grande vidéo reste en direct).']
    ]
  },
  {
    v: '1.8.6', date: '2026-11-22', items: [
      ['globe', 'DNS seguro: si tu compañía de internet o tu red cambian la dirección de una web, el launcher la pregunta de forma segura (Cloudflare/Google). Arregla el error de «conexión segura» aunque tu internet vaya bien.',
        'Secure DNS: if your internet provider or network changes a website’s address, the launcher asks for it securely (Cloudflare/Google). Fixes the “secure connection” error even when your internet works fine.',
        'DNS segur: si la teva companyia d’internet o la teva xarxa canvien l’adreça d’una web, el launcher la pregunta de forma segura (Cloudflare/Google). Arregla l’error de «connexió segura» encara que el teu internet vagi bé.',
        'DNS sécurisé : si ton fournisseur internet ou ton réseau modifie l’adresse d’un site, le launcher la demande de façon sécurisée (Cloudflare/Google). Corrige l’erreur de « connexion sécurisée » même si ta connexion marche bien.']
    ]
  },
  {
    v: '1.8.5', date: '2026-11-22', items: [
      ['video', 'Cámaras de KopiGuard en vídeo de verdad: el staff te ve a 720p y 30 imágenes por segundo, sin retraso. Solo la ventana del juego, nunca la pantalla entera ni el sonido.',
        'KopiGuard cameras as real video: the staff sees you at 720p and 30 frames per second, with no delay. Only the game window, never the whole screen or sound.',
        'Càmeres de KopiGuard en vídeo de veritat: l’staff et veu a 720p i 30 imatges per segon, sense retard. Només la finestra del joc, mai la pantalla sencera ni el so.',
        'Caméras KopiGuard en vraie vidéo : le staff te voit en 720p à 30 images par seconde, sans retard. Seulement la fenêtre du jeu, jamais tout l’écran ni le son.']
    ]
  },
  {
    v: '1.8.4', date: '2026-11-22', items: [
      ['user', 'Skins en instancias vanilla: si no eres premium, ahora ves las skins de todos. El launcher lo prepara solo al darle a Jugar.',
        'Skins on vanilla instances: if you’re not premium, you now see everyone’s skins. The launcher sets it up by itself when you press Play.',
        'Skins en instàncies vanilla: si no ets prèmium, ara veus les skins de tothom. El launcher ho prepara sol quan prems Jugar.',
        'Skins sur les instances vanilla : si tu n’es pas premium, tu vois maintenant les skins de tout le monde. Le launcher s’en occupe tout seul quand tu appuies sur Jouer.'],
      ['globe', 'Los avisos de conexión dicen siempre qué web falló, y las descargas lentas se reintentan con más calma.',
        'Connection warnings always say which site failed, and slow downloads are retried more patiently.',
        'Els avisos de connexió diuen sempre quina web ha fallat, i les descàrregues lentes es reintenten amb més calma.',
        'Les avertissements de connexion indiquent toujours quel site a échoué, et les téléchargements lents sont réessayés plus calmement.']
    ]
  },
  {
    v: '1.8.3', date: '2026-11-21', items: [
      ['globe', 'Conexión más fuerte: el launcher se conecta a internet igual que Google Chrome, así funciona con antivirus, VPN y proxies que antes daban «fetch failed». Si una forma falla, prueba otra sola.',
        'Stronger connection: the launcher connects to the internet just like Google Chrome, so it works with antivirus, VPNs and proxies that used to cause “fetch failed”. If one way fails, it tries another by itself.',
        'Connexió més forta: el launcher es connecta a internet igual que Google Chrome, així funciona amb antivirus, VPN i proxies que abans donaven «fetch failed». Si una manera falla, en prova una altra sol.',
        'Connexion plus solide : le launcher se connecte à internet comme Google Chrome, donc ça marche avec les antivirus, VPN et proxys qui donnaient « fetch failed ». Si une méthode échoue, il en essaie une autre tout seul.']
    ]
  },
  {
    v: '1.8.2', date: '2026-11-21', items: [
      ['download', 'Mac: las actualizaciones ya se instalan solas (antes se quedaban en «Instalando actualización…»). Si algo falla, sale un botón para descargarla a mano o seguir jugando.',
        'Mac: updates now install themselves (before, they got stuck on “Installing update…”). If something fails, there’s a button to download it manually or keep playing.',
        'Mac: les actualitzacions ja s’instal·len soles (abans es quedaven a «Instal·lant actualització…»). Si alguna cosa falla, surt un botó per descarregar-la a mà o continuar jugant.',
        'Mac : les mises à jour s’installent enfin toutes seules (avant, elles restaient bloquées sur « Installation de la mise à jour… »). Si ça échoue, un bouton permet de la télécharger ou de continuer à jouer.'],
      ['globe', 'Adiós al «fetch failed»: si falla la conexión, el launcher lo reintenta solo y, si no puede, te dice qué web falló y qué hacer.',
        'Goodbye “fetch failed”: if the connection fails, the launcher retries by itself and, if it still can’t, tells you which site failed and what to do.',
        'Adéu al «fetch failed»: si falla la connexió, el launcher ho reintenta sol i, si no pot, et diu quina web ha fallat i què fer.',
        'Adieu « fetch failed » : si la connexion échoue, le launcher réessaie tout seul et, sinon, te dit quel site a échoué et quoi faire.']
    ]
  },
  {
    v: '1.8.1', date: '2026-11-21', items: [
      ['flag', 'Denunciar a un jugador: en la instancia, botón ⋯ → Denunciar a un jugador. Elige a quién, qué ha hecho y, si quieres, una captura (pulsa F2 en el juego). Lo ve el staff del studio.',
        'Report a player: on the instance, ⋯ button → Report a player. Choose who, what they did and, if you want, a screenshot (press F2 in game). The studio staff will see it.',
        'Denunciar un jugador: a la instància, botó ⋯ → Denunciar un jugador. Tria a qui, què ha fet i, si vols, una captura (prem F2 al joc). Ho veu l’staff de l’studio.',
        'Signaler un joueur : sur l’instance, bouton ⋯ → Signaler un joueur. Choisis qui, ce qu’il a fait et, si tu veux, une capture (appuie sur F2 en jeu). Le staff du studio le verra.'],
      ['zap', 'El launcher le cuenta al studio cuánto tarda en cargar su instancia y si se cierra, para que la hagan más ligera. No se envía nada tuyo: solo la RAM, el procesador y la gráfica.',
        'The launcher tells the studio how long its instance takes to load and whether it crashes, so they can make it lighter. Nothing personal is sent: only RAM, processor and graphics card.',
        'El launcher li explica a l’studio quant triga a carregar la seva instància i si es tanca, perquè la facin més lleugera. No s’envia res teu: només la RAM, el processador i la gràfica.',
        'Le launcher indique au studio le temps de chargement de son instance et si elle plante, pour qu’il l’allège. Rien de personnel n’est envoyé : seulement la RAM, le processeur et la carte graphique.']
    ]
  },
  {
    v: '1.8.0', date: '2026-11-20', items: [
      ['sparkles', 'Nueva capa legendaria TACHAMANIKA: borde RGB que recorre todos los colores del arcoíris.',
        'New legendary cape TACHAMANIKA: an RGB border that cycles through every colour of the rainbow.',
        'Nova capa llegendària TACHAMANIKA: vora RGB que recorre tots els colors de l’arc de Sant Martí.',
        'Nouvelle cape légendaire TACHAMANIKA : une bordure RGB qui passe par toutes les couleurs de l’arc-en-ciel.']
    ]
  },
  {
    v: '1.7.9', date: '2026-11-20', items: [
      ['clock', 'Cuenta atrás: antes de que abra una instancia o empiece su evento, ves en grande los días, horas, minutos y segundos que faltan. Al llegar a cero… ¡fiesta!',
        'Countdown: before an instance opens or its event starts, you see the days, hours, minutes and seconds left in big numbers. When it hits zero… party!',
        'Compte enrere: abans que obri una instància o comenci el seu esdeveniment, veus en gran els dies, hores, minuts i segons que falten. En arribar a zero… festa!',
        'Compte à rebours : avant qu’une instance ouvre ou que son événement commence, tu vois en grand les jours, heures, minutes et secondes restants. À zéro… c’est la fête !']
    ]
  },
  {
    v: '1.7.8', date: '2026-11-20', items: [
      ['globe', 'Tu perfil en la web: una página con tu skin en 3D, tu capa, tus insignias y tus directos. Actívala en Mi perfil y pon el enlace en tu bio de Twitch, TikTok o Discord.',
        'Your profile on the web: a page with your 3D skin, your cape, your badges and your streams. Turn it on in My profile and put the link in your Twitch, TikTok or Discord bio.',
        'El teu perfil a la web: una pàgina amb la teva skin en 3D, la teva capa, les teves insígnies i els teus directes. Activa-la a El meu perfil i posa l’enllaç a la teva bio de Twitch, TikTok o Discord.',
        'Ton profil sur le web : une page avec ton skin en 3D, ta cape, tes badges et tes lives. Active-la dans Mon profil et mets le lien dans ta bio Twitch, TikTok ou Discord.']
    ]
  },
  {
    v: '1.7.7', date: '2026-11-20', items: [
      ['award', 'Insignias: gánalas jugando (horas, rachas, eventos, juego limpio y alguna secreta). Pon tus 3 favoritas en la vitrina y salen en tu tarjeta de perfil.',
        'Badges: earn them by playing (hours, streaks, events, fair play and a few secret ones). Put your 3 favourites in your showcase and they show on your profile card.',
        'Insígnies: guanya-les jugant (hores, ratxes, esdeveniments, joc net i alguna secreta). Posa les teves 3 preferides a la vitrina i surten a la teva targeta de perfil.',
        'Badges : gagne-les en jouant (heures, séries, événements, fair-play et quelques secrets). Mets tes 3 préférés en vitrine et ils apparaissent sur ta carte de profil.'],
      ['users', 'Jugar con amigos: abre tu mundo a tus amigos por internet sin tocar el router. El launcher copia la dirección solo.',
        'Play with friends: open your world to your friends over the internet without touching your router. The launcher copies the address for you.',
        'Jugar amb amics: obre el teu món als teus amics per internet sense tocar el router. El launcher copia l’adreça sol.',
        'Jouer avec des amis : ouvre ton monde à tes amis par internet sans toucher à ta box. Le launcher copie l’adresse tout seul.'],
      ['video', 'Directos: pon tu canal de Twitch, TikTok o Kick en Mi perfil y sal en «En directo ahora» de la instancia cuando emitas.',
        'Streams: add your Twitch, TikTok or Kick channel in My profile and show up in the instance’s “Live now” when you stream.',
        'Directes: posa el teu canal de Twitch, TikTok o Kick a El meu perfil i surt a «En directe ara» de la instància quan emetis.',
        'Lives : ajoute ta chaîne Twitch, TikTok ou Kick dans Mon profil et apparais dans « En direct maintenant » de l’instance quand tu diffuses.'],
      ['brush', 'Editor de skins: retoca tu skin o crea una nueva con lápiz, cubo, espejo y vista 3D.',
        'Skin editor: touch up your skin or make a new one with pencil, bucket, mirror and 3D view.',
        'Editor de skins: retoca la teva skin o crea’n una de nova amb llapis, cubell, mirall i vista 3D.',
        'Éditeur de skins : retouche ton skin ou crée-en un nouveau avec crayon, pot de peinture, miroir et vue 3D.'],
      ['refresh', 'Instancias siempre al día: lo nuevo se descarga mientras el launcher está abierto, así al darle a Jugar entras al momento.',
        'Always up to date: new stuff downloads while the launcher is open, so when you click Play you’re in right away.',
        'Instàncies sempre al dia: el que és nou es descarrega mentre el launcher està obert, i en prémer Jugar entres al moment.',
        'Instances toujours à jour : les nouveautés se téléchargent pendant que le launcher est ouvert, donc en cliquant sur Jouer tu entres tout de suite.']
    ]
  },
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
