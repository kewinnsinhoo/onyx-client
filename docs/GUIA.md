# Guía de Kopi Client (todo gratis con GitHub)

> **Resumen rápido (noviembre 2026)**
> - **Onyx Client ahora se llama Kopi Client (de Kopi Studio), desde la 1.4.0.** Por dentro se mantienen algunos nombres antiguos a propósito, para que nadie pierda nada: la carpeta de ajustes (`Onyx Client`) y la del juego (`.onyxclient`), el id del studio principal (`onyx-studios`), los repos (`onyx-client`, `onyx-data`) y el dominio `onyxclient.site`.
> - **Código y descargas:** todo en `kewinnsinhoo/onyx-client`. Se compila con GitHub Actions **en este mismo repo** (lo que acordamos con GitHub Support al recuperar la cuenta: nada de compilar el código desde otro repo ni de borrar ejecuciones).
> - **Publicar una versión de Kopi:** sube `version` en `package.json`, sube los cambios y en `onyx-client` → Actions → **Publicar nueva versión** → Run workflow. Los launchers 1.2.x y 1.3.x se actualizan solos desde aquí.
> - **Launchers de marca:** se crean y compilan desde el panel (Launchers). Se fabrican con **Launcher de marca** en este repo y se publican en la release `brand-<id>`.
> - **Secretos:** `GITHUB_TOKEN` en Cloudflare `onyx-panel` (mandar fabricar marcas: token fine-grained de `onyx-client` con **Actions: lectura y escritura** y **Contents: lectura**).
> - `onyx-client-releases` ya no se usa.
> - Notificaciones, creadores, studios y términos del launcher: `web/data/` (se publican en `onyxclient.site/data/`).
> - Instancias, códigos, eventos y referidos: en Kopi Panel. El sistema antiguo de `onyx-data` ya no se usa.
> - **Capas de Kopi (1.4.7):** en Skins → Capas hay un apartado con capas exclusivas del cliente, animadas y dibujadas por código en `src/renderer/js/capes.js` (pixel art 10×16, como Minecraft). Se pueden «Probar» en el muñeco 3D. Por ahora ninguna se puede conseguir; aún no se ven dentro del juego.
> - **Regalar capas (panel):** en Kopi Panel → **Capas de Kopi** (solo el Creador) pulsas una capa, escribes uno o varios nombres de Minecraft (separados por comas) y **Regalar**. Ahí ves quién la tiene y quién la lleva puesta, y puedes quitarla. Para el juego, el panel fabrica la capa animada en `panel.onyxclient.site/capes/<nombre>.png` (para el mod Cape Provider en Fabric) y una quieta para CustomSkinLoader. El dibujo de las capas está dos veces, en `src/renderer/js/capes.js` (launcher) y `panel/public/js/cape-art.js` (panel): si cambias una, cambia la otra (una prueba lo avisa). En el launcher (Skins → Capas) el jugador ve «Tus capas» y pulsa **Ponérmela**. En las instancias **Fabric** el launcher pone solo el mod **Cape Provider** (y **Fabric API** si la instancia no la trae), como `mods/kopi-skins-*.jar`, y lo configura para pedir las capas al panel: así se ven **animadas** (en Fabric 1.21.1 o más nuevo). En el resto se ven quietas con CustomSkinLoader. Si el studio ya trae otro mod de capas (MinecraftCapes, Capes…), no se pone Cape Provider porque no pueden ir juntos.
> - **Instancia bloqueada con pre-descarga:** si el studio bloquea la instancia pero deja la pre-descarga, el launcher enseña «Instancia bloqueada» arriba y una tarjeta «Pre-descarga abierta» con «Descargar ya».
> - **Skins de Kopi en el juego (sin tocar el servidor):** en las instancias con Fabric, Quilt, Forge o NeoForge el launcher pone solo el mod **CustomSkinLoader** (de Modrinth, la versión que toca) como `mods/kopi-skins-*.jar` y lo configura en este orden: la skin que mande el servidor, luego Kopi (`panel.onyxclient.site/csl/`, skins elegidas en el launcher) y luego Mojang (premium). Guarda la última skin conocida de cada jugador por si Mojang dice "demasiadas peticiones" (429). Se puede desactivar por instancia en el panel (Juego → Skins de Kopi). En Vanilla no hay mods: ahí sirven los plugins de servidor.
> - **Kopi Skins (plugins de servidor, opcional):** plugins en `server-plugins/` para Paper/Purpur/Folia, Velocity y BungeeCord/Waterfall. Se compilan en Actions → **Kopi Skins (plugins)** (marca «publicar» para sacar los .jar en la release `kopi-skins-v…`). Premium: su skin real. No premium: la que eligen en Kopi Client (el launcher la sube al panel y el panel la convierte con MineSkin; secreto opcional `MINESKIN_API_KEY` en Cloudflare `onyx-panel`).
> - **Antes de hacer privado este repo** hay que mover las descargas fuera de GitHub (por ejemplo a Cloudflare R2): en un repo privado nadie podría descargar ni actualizar.


En esta carpeta hay dos proyectos:

| Carpeta | Para qué sirve | ¿Cada cuánto lo tocas? |
|---|---|---|
| `onyx-client` | El programa (el launcher). GitHub lo compila solo para Windows, Mac y Linux. | Solo cuando quieras sacar una versión nueva |
| `onyx-data` | El contenido: códigos, instancias, creadores, avisos, estudios y términos. El launcher lo lee de internet. | Siempre que quieras añadir cosas |

Si cambias algo en `onyx-data`, **todos los launchers lo ven en 1-5 minutos sin reinstalar nada.**

---

## Paso 1 · Cuenta de GitHub y GitHub Desktop
1. Crea una cuenta gratis en **github.com**.
2. Instala **GitHub Desktop** (desktop.github.com) e inicia sesión con tu cuenta. Así subes las carpetas sin usar comandos.

## Paso 2 · Subir los dos repositorios (públicos)
Repite esto con `onyx-client` y después con `onyx-data`:
1. En GitHub Desktop: **File → Add local repository…** y elige la carpeta.
2. Te dirá que no es un repositorio: pulsa **"create a repository"** y después **Create repository**.
3. Pulsa **Publish repository**. **Quita la marca de "Keep this code private"** (tiene que ser público para que las descargas y las actualizaciones sean gratis).
4. Los nombres tienen que ser exactamente **`onyx-client`** y **`onyx-data`**.

> No tienes que escribir tu usuario de GitHub en ningún archivo: al compilar se rellena solo.

## Paso 3 · Login premium con Microsoft (Azure, gratis)
1. Entra en **portal.azure.com** con tu cuenta de Microsoft.
   - Si te deja entrar y ves el buscador de arriba, sigue al punto 2.
   - Si sale un error (por ejemplo "Interaction required" o algo del inquilino "Microsoft Services"), tu cuenta todavía no tiene "directorio". Crea la **cuenta gratuita de Azure** en **azure.microsoft.com/free** con la misma cuenta de Microsoft. Pide teléfono y una **tarjeta de crédito o débito normal** (no prepago): solo es para verificar que eres una persona. Puede aparecer una retención temporal de 1 USD que luego se devuelve. Registrar la app no cuesta nada.
2. Busca **"Microsoft Entra ID"** → **Registros de aplicaciones** → **Nuevo registro**.
   - Nombre: `Kopi Client`
   - Tipos de cuenta: **"Solo cuentas personales de Microsoft"**
   - URI de redirección: elige **"Cliente público/nativo (móvil y escritorio)"** y pega:
     `https://login.microsoftonline.com/common/oauth2/nativeclient`
   - Después, en **Administrar → Autenticación**, dentro de "Aplicaciones móviles y de escritorio" añade otra URI: `http://localhost` y guarda. Es la que usa el launcher para iniciar sesión **en tu navegador** (la primera sirve para la ventana de reserva).
3. Pulsa **Registrar**. En la página que se abre copia dos datos:
   - **"Id. de aplicación (cliente)"** → es el Client ID que va en el launcher.
   - **"Id. de directorio (inquilino)"** → lo pide el formulario de Mojang.
4. En **Autenticación**, activa **"Permitir flujos de clientes públicos" = Sí** y guarda. No hace falta crear ningún "secreto".
5. **Pide permiso a Mojang** en este formulario: **https://aka.ms/mce-reviewappid**. Acepta las condiciones y pon tu correo, el nombre `Kopi Client`, el Client ID y el Id. de directorio. Explica que es el launcher de tu estudio. Mojang revisa cada solicitud a mano y no da plazos. Mientras no te aprueben, el login premium muestra "Mojang aún no ha aprobado…". Las cuentas offline siguen funcionando.
6. Puedes poner el Client ID en el launcher (paso 5) antes de que llegue la aprobación. Cuando Mojang te apruebe, el login funcionará solo, sin publicar otra versión.

## Paso 4 · Discord (gratis)
1. Entra en **discord.com/developers/applications** → **New Application** → nombre `Kopi Client`.
2. En **OAuth2 → Redirects** añade exactamente: `http://127.0.0.1:53682/discord` y guarda.
3. Copia el **Client ID** (está en OAuth2).
4. Crea una invitación permanente de tu servidor de Discord (para el botón "Discord" del inicio).

## Paso 5 · Configurar `onyx-client/onyx.config.json`
Ábrelo con el Bloc de notas y cambia solo esto:
```json
"microsoftClientId": "el Id. de aplicación de Azure",
"discordClientId": "el Client ID de Discord",
"discordInvite": "https://discord.gg/tu-invitacion",
"reportWebhook": ""
```
- **Informes (botón ⚠ «Enviar informe») → Discord:** el launcher los manda al panel y el panel los reenvía a tu canal. En Discord: ajustes del canal → **Integraciones → Webhooks → Nuevo webhook → Copiar URL**. En Cloudflare → Workers → `onyx-panel` → Configuración → Variables y secretos → **Agregar** → tipo **Secreto**, nombre `DISCORD_REPORT_WEBHOOK`, valor la URL. (Así la URL no va dentro del launcher y nadie puede llenarte el canal de spam; además, máximo un informe por minuto por jugador.) `reportWebhook` aquí solo se usa si el panel no responde; mejor dejarlo vacío. Si nada funciona, el informe se guarda en el PC del jugador.

Después, en GitHub Desktop: escribe un mensaje abajo a la izquierda (por ejemplo "configuración"), pulsa **Commit to main** y luego **Push origin**.

## Paso 6 · Crear el launcher (los instaladores)
1. Entra en `github.com/TU-USUARIO/onyx-client` → pestaña **Actions**. Si te lo pide, pulsa "I understand… enable them".
2. Elige **"Publicar nueva versión"** → botón **Run workflow** → **Run workflow**.
3. Tarda unos 10-20 minutos. Cuando termine, en la página del repo entra en **Releases**:
   - Windows: `Kopi-Client-Setup-1.0.0.exe`
   - Mac: `Kopi-Client-1.0.0-arm64.dmg` (Mac M1/M2/M3/M4) o `-x64.dmg` (Mac Intel)
   - Linux: `Kopi-Client-1.0.0.AppImage`

Ese enlace de Releases es el que compartes con tus jugadores.

## Paso 7 · Sacar actualizaciones
1. En `onyx-client/package.json` sube el número de `"version"` (por ejemplo `1.0.0` → `1.0.1`).
2. Haz **Commit** y **Push** en GitHub Desktop.
3. Vuelve a ejecutar **Run workflow**.

Los launchers abiertos verán "Buscando actualizaciones…", la descargarán y se reiniciarán solos (como en el video).
Para una versión beta usa un número como `1.1.0-beta.1`: solo la recibirán quienes elijan el canal **Beta** en Ajustes → Acerca de.

---

## Kopi Panel (panel.onyxclient.site)

Desde la versión 1.2.0 las instancias, los códigos, los horarios y los eventos se gestionan en el **panel**, sin tocar archivos. Lo de `onyx-data` sigue funcionando para las instancias antiguas.

### Ponerlo en marcha (una sola vez)

1. **Cloudflare → Workers y Pages → Crear → Importar un repositorio** → elige `onyx-client`.
   - Nombre: `onyx-panel`
   - **Ruta / directorio raíz: `panel`**
   - Deja el comando de despliegue como viene (`npx wrangler deploy`). La base de datos (D1), el almacén de archivos (KV) y el dominio `panel.onyxclient.site` se crean solos.
2. **Discord Developer Portal → tu aplicación → OAuth2 → Redirects** → añade `https://panel.onyxclient.site/auth/callback`.
3. En la misma página copia el **Client Secret**. En Cloudflare → `onyx-panel` → **Configuración → Variables y secretos → Añadir** → tipo **Secreto**, nombre `DISCORD_CLIENT_SECRET`, pega el valor. (No lo pegues en ningún chat.)
4. Añade otro **Secreto** llamado `CREATOR_DISCORD_IDS` con tu ID de Discord (Discord → Ajustes → Avanzado → Modo desarrollador; luego clic derecho en tu perfil → *Copiar ID*). Varios IDs se separan con comas.
5. Abre `panel.onyxclient.site` y entra con Discord. Verás *Creador* en tu perfil y el studio **Kopi Studio** ya creado.

### Uso

- **Studios** (solo el Creador): crea studios nuevos; te da un enlace de invitación para su dueño.
- **Equipo**: invita a gente a tu studio con un rol (Lector, Editor, Administrador, Dueño).
- **Instancias → Nueva instancia**: nombre, versión y loader, aspecto y acceso. Al terminar te da el primer código.
- **Estado de los servicios**: `panel.onyxclient.site/status` (se comprueba cada 5 minutos).
- **Calendario público**: los eventos marcados como públicos salen en `onyxclient.site/calendario.html`.
- **Referidos**: el código de tu studio aparece en *Referidos*; los jugadores lo escriben en el launcher.

## Instancias y códigos de acceso (`onyx-data`)
**Código de prueba incluido:** `KOPI-DEMO-2026` → abre la instancia de ejemplo "Survival Kopi" (Minecraft 1.21.1 con Fabric).

### Crear una instancia
1. Copia `instances/ejemplo-survival.json` y renómbralo, por ejemplo `instances/eventos.json`.
2. Cambia `"id"` por el mismo nombre (`"eventos"`) y rellena el resto:
```json
{
  "id": "eventos",
  "name": "Eventos Kopi",
  "description": "Texto que verán los jugadores",
  "icon": "https://raw.githubusercontent.com/TU-USUARIO/onyx-data/main/img/eventos-icono.png",
  "banner": "https://raw.githubusercontent.com/TU-USUARIO/onyx-data/main/img/eventos-banner.png",
  "studio": { "name": "Kopi Studio", "logo": "https://raw.githubusercontent.com/TU-USUARIO/onyx-data/main/img/studio-logo.png" },
  "about": "Texto largo para la sección 'Sobre esta instancia'. Separa párrafos con una línea en blanco.",
  "premium": true,
  "minecraft": "1.21.1",
  "loader": { "type": "fabric", "version": "latest" },
  "server": { "address": "play.tuservidor.com", "port": 25565, "autoJoin": true },
  "files": [
    { "path": "mods/sodium.jar", "url": "https://cdn.modrinth.com/data/.../sodium.jar", "sha1": "opcional" }
  ]
}
```
- `premium: true` → solo pueden entrar cuentas de Microsoft (las offline no).
- `loader.type`: `vanilla`, `fabric`, `quilt`, `forge` o `neoforge`.
- `loader.version`: `"latest"` (la más nueva estable), `"recommended"` (solo Forge: la recomendada) o una versión exacta. Ejemplos:
  - Fabric / Quilt: `"0.16.5"`
  - Forge: `"47.3.0"` (para Minecraft 1.20.1) o `"10.13.4.1614"` (para 1.7.10)
  - NeoForge: `"21.1.77"` (para Minecraft 1.21.1). Para 1.20.1 usa el número de su web, p. ej. `"47.1.106"`.
- Funciona con todas las versiones de Minecraft de Mojang (también las antiguas y las snapshots). Forge desde la 1.6.4; NeoForge desde la 1.20.1. La primera vez que se abre una instancia con Forge o NeoForge tarda un poco más porque el launcher lo instala ("Instalando el loader").
- `server.autoJoin: true` → el juego entra directamente a tu servidor al abrirse.
- `files` → mods, configs o resource packs. Para los mods, copia el enlace de descarga del archivo en modrinth.com. Si quitas un archivo de la lista, el launcher también lo borra de los jugadores. Los mods que ponga el propio jugador no se tocan.
- Las imágenes las puedes subir a la carpeta `img/` del repo.
- `"maintenance": "Volvemos a las 18:00"` bloquea la instancia temporalmente.
- `studio` muestra "por Kopi Studio" arriba de la instancia, y `about` es el texto de "Sobre esta instancia".
- Si hay `server.address`, la instancia muestra los **jugadores conectados** en vivo (ej. 12 / 100).

### Packs `.onyxpack`
Un `.onyxpack` es un `.zip` con una carpeta `overrides/` dentro (por ejemplo `overrides/mods/`, `overrides/config/`, `overrides/resourcepacks/`).
En la página de una instancia: botón **⋯ → Instalar desde .onyxpack** copia todo eso dentro de la instancia. Sirve para pasar mods o configs a mano sin subirlos a GitHub.

### Crear un código
1. Abre `onyx-data/herramientas/generar-codigo.html` con doble clic (se abre en tu navegador).
2. Escribe el id (`eventos`), pulsa **Aleatorio** y luego **Generar línea**.
3. Pega la línea dentro de `codes.json`, separada por comas:
```json
{
  "28ae428a19e3370c9fa29bc4b890f4dc0d55e2d7199a7baa375eaad113422477": "ejemplo-survival",
  "la-linea-nueva...": "eventos"
}
```
4. **Commit → Push**. Comparte el código con tus jugadores. Para anular un código, borra su línea.

> En GitHub solo se guarda la "huella" del código, no el código. Aunque el repositorio es público, nadie puede adivinarlo.

### Otros archivos de `onyx-data`
| Archivo | Qué hace |
|---|---|
| `creators.json` | Pantalla **Creadores**: nombre, @usuario, `username` de Minecraft (para la skin 3D) y redes (`instagram`, `discord`, `x`, `tiktok`, `youtube`, `twitch`, `github`, `web`). |
| `notifications.json` | La campanita **Avisos**. `kind` puede ser `success`, `warn` o `danger`. Opcional: `url`. |
| `studios.json` | Estudios para el sistema de **Referidos** (código, nombre, logo). |
| `terms/es.md`, `terms/en.md` | Términos y condiciones. Se pueden editar cuando quieras. |

## Referidos con conteo automático (opcional, gratis)
Sin configurar nada, el ranking muestra los números que pongas a mano en `studios.json` (`players` y `monthly`).
Para que se cuenten solos:
1. Crea un proyecto gratis en **supabase.com**.
2. Ve a **SQL Editor**, pega el contenido de `onyx-client/supabase.sql` y pulsa **Run**.
3. En **Project Settings → API** copia la **Project URL** y la clave **anon public** en `onyx.config.json` → `supabase`.
4. Saca una versión nueva (Paso 7).

---

## Protección de mods (desde la 1.5.1)

- **El launcher no abre nunca la carpeta del juego**: no hay botón de carpeta en las instancias, ni «Carpeta de datos» en Ajustes, y «Capturas» lleva a la Galería del launcher.
- **Mods bajo llave (1.5.2):** mientras no se juega, los mods de cada instancia (todos los `.jar` de `mods/`, menos los públicos de Kopi) se guardan **cifrados** en `<carpeta de datos>/vault/<instancia>/`, con nombres al azar. En `mods/` no queda nada.
  - Al pulsar **Jugar** se abren (paso «Abriendo los mods»), se sincroniza con el studio y empieza el juego. Al **cerrar el juego** vuelven bajo llave.
  - Si el PC se apaga o el launcher se cierra con el juego abierto, se cierran solos la próxima vez que se abre el launcher.
  - La llave es una por ordenador y la protege Windows/macOS: copiar la carpeta `vault` a otro PC no sirve. Si la llave se pierde, los mods se vuelven a descargar al jugar.
  - **Mientras se juega (1.5.3, Fabric 0.14 o más nuevo):** la carpeta `mods/` sigue vacía. Los mods se abren en una carpeta temporal del sistema con nombre al azar (y cada mod con nombre al azar), Fabric los carga desde ahí (`-Dfabric.addMods`, que no sale en los registros) y al cerrar el juego se borra. En Forge/NeoForge/Quilt, mientras se juega están en `mods/` como siempre.
  - **Lo que no se puede evitar:** mientras el juego está abierto, los mods tienen que estar sin cifrar (Minecraft los necesita). Es una protección muy fuerte contra quien busca en la carpeta, pero ningún launcher puede impedirlo al 100 %.

## KopiGuard: el anticheat (desde la 1.6.0)

- **Se activa en cada instancia:** Kopi Panel → editor de la instancia → pestaña **Protección**. Opciones: expulsar al momento a quien use un programa de trampas, permitir paquetes de texturas/shaders y avisar en un canal de Discord (webhook).
- **Qué vigila el launcher mientras se juega** (y la instancia lleva la etiqueta «KopiGuard» en el launcher):
  - **Mod:** mods que no son del studio (al empezar o añadidos durante la partida). Los mods de Kopi (skins, rendimiento) no cuentan.
  - **Paquete:** paquetes de texturas o de shaders que no son del studio (si no se permiten).
  - **Archivo:** un archivo del studio cambiado durante la partida, o uno nuevo en `config/`. Lo que escribe el propio juego (opciones, servidores, registros, capturas, mundos) no cuenta, y se espera 1 minuto a que el juego termine de arrancar.
  - **Programa:** autoclickers, grabadores de macros, Cheat Engine, inyectores, editores de procesos… Solo se envían los que coinciden con la lista (`PROGRAMS` en `panel/src/guard.js`, se amplía sin sacar otra versión del launcher). Las ventanas de navegadores, Discord, OBS, etc. no cuentan aunque digan «auto clicker».
- **Página KopiGuard del panel:** números, pestañas por tipo y estado, gravedad, búsqueda, instancia y fechas. Al pulsar una detección se abre el detalle (datos técnicos, mods cargados) con **Revisar**, **Descartar**, **Sancionar** (ban en esa instancia y se le cierra el juego) y **Expulsar** (solo si está jugando).
- **Límites:** como mucho 60 detecciones por partida y la misma cosa una vez cada 10 minutos. Los latidos pasan a ser cada 20 s para expulsar más rápido.
- **Foto y vídeo (1.7.0):** cada detección importante (no las leves, y como mucho 6 por partida) llega con una foto y un vídeo de 10 s **solo de la ventana de Minecraft** (sin sonido). Se ven en el detalle de la detección y se borran solos a los 30 días (se guardan en el KV `MEDIA`).
- **Cámaras en directo (1.7.0):** menú **Cámaras** del panel (editores, administradores y dueño). Cuadrícula de quien está jugando en instancias con KopiGuard (imagen nueva cada ~5 s) y, al pulsar a alguien, se le ve en grande (~1–2 imágenes por segundo, más nítidas), con **Guardar captura**, **Pantalla completa** y **Expulsar**. La primera imagen tarda hasta 20 s (llega con el latido). No se graba nada: el panel solo guarda la última imagen de cada partida y la borra al acabar. El launcher solo manda imágenes mientras alguien mira.
  - En Mac hace falta que el jugador dé permiso para grabar la pantalla; si no, sale «Este equipo no permite capturar el juego». En Linux con Wayland no hay capturas.
- **Plugin del servidor (KopiGuard 1.0.0, launcher 1.7.4):** `server-plugins/guard`. Vuelo, velocidad, alcance, clics y golpes a varios; no cuenta empujones, explosiones, cargas de viento, caídas, slime, tridente, élitros, agua, escaleras, vehículos, /fly ni lag. Cada instancia tiene una clave (panel → Protección → Plugin del servidor; tabla `guard_keys`). Avisa a `POST /api/srv/guard`; si el jugador juega con Kopi Client, la detección va a su partida y el siguiente latido pide foto y vídeo al launcher (`plays.snap`). Release: `kopi-guard-v1.0.0` (workflow «KopiGuard (plugin del servidor)»). Más en `server-plugins/README.md`.

## Estadísticas del panel (desde la 1.7.4)

- Menú **Estadísticas** (cualquier miembro del studio). 7, 30 o 90 días y por instancia; todo en la hora de quien mira.
- Jugadores distintos, horas jugadas, jugadores nuevos (su primera partida) y los que vuelven (del periodo anterior), con flechas que comparan con el periodo anterior.
- Jugadores cada día (también como tabla), mapa de calor de a qué hora juega la gente con «la hora con más gente» (buena para eventos), horas por instancia y los 10 que más juegan.
- El cálculo está en `panel/src/studio-stats.js` (`computeStats`, probado con datos fijos).
- Está explicado en los términos del launcher (punto 8), en los 4 idiomas.

## Arreglo de cierres (desde la 1.7.5)

- Si Minecraft se cierra con un error (no cuando lo cierra el jugador ni cuando el studio le expulsa), el launcher lee el registro del juego, el informe de `crash-reports/` y el de Java (`hs_err_pid*.log`) de esa partida y explica qué pasó en una ventana, con un botón para arreglarlo.
- Qué reconoce (`src/main/crash.js`, probado con mensajes reales): sin memoria (sube la RAM), demasiada memoria para el PC (la baja), argumentos de Java que no valen (los quita), Java equivocada (vuelve a la automática), mod que falta / versión que no vale / mod repetido (reparar archivos o avisar al studio), archivo dañado (reparar), el modo rendimiento choca (lo apaga), un mod choca con otro, controlador de la tarjeta gráfica (AMD, Intel, NVIDIA: abre su página de descargas) y el resto con lo que dice el informe de Minecraft.
- Siempre hay «Enviar el error al studio» (el informe de siempre, ya con el error escrito) y «Ver detalles» con las líneas importantes.

## Novedades de la instancia (desde la 1.7.5)

- Panel → instancia → pestaña **Novedades**: el studio escribe lo nuevo (las líneas con «-» salen como lista). Se guardan las 30 últimas; al launcher le llegan las 10 últimas.
- **Se apuntan solas** las altas, bajas y actualizaciones de mods, paquetes de texturas y shaders, y cuántos ajustes (`config/`) cambiaron, cada vez que se cambian archivos (los cambios de la misma media hora se juntan). La primera subida de una instancia nueva no cuenta.
- En el launcher: botón **Novedades** con un contador en la instancia y un puntito en su icono del lateral. Las novedades sin ver se enseñan solas una vez al abrir la instancia. Las de antes de añadir la instancia no cuentan como nuevas.

## Novedades del launcher (desde la 1.7.6)

- La primera vez que se abre el launcher después de actualizarse sale una ventana «¡Kopi Client se ha actualizado!» con lo que trae la versión nueva (y las que se saltó, hasta 4). Recién instalado no sale nada.
- Se pueden volver a ver en Ajustes → Acerca de → **Novedades del launcher**.
- Están en `src/renderer/js/changelog.js`, contadas para el jugador y en es, en, ca y fr. **Cada versión nueva tiene que tener su entrada arriba del todo**: si no, la prueba «Novedades del launcher al día» falla y no se puede publicar sin darse cuenta.

## Cosas a saber
- **Windows** mostrará "Windows protegió su PC" porque el .exe no está firmado (la firma cuesta dinero). Hay que pulsar **Más información → Ejecutar de todas formas**.
- **Mac**: la primera vez, clic derecho sobre la app → **Abrir**. Si no deja, ve a **Ajustes del Sistema → Privacidad y seguridad → Abrir igualmente**. Si sale «Kopi Client está dañado» (versiones hasta la 1.4.8 sin la firma ad-hoc, o si macOS se pone pesado), abre **Terminal** y escribe `xattr -cr "/Applications/Kopi Client.app"` y pulsa Enter; después ya abre. Desde la 1.4.8 la app de Mac lleva una firma «ad-hoc» gratuita para que no salga ese aviso de «dañado». Sin firma de Apple, en Mac las actualizaciones automáticas no se instalan solas: hay que descargar la nueva versión desde Releases.
- **Loaders:** ahora mismo funcionan Vanilla, Fabric y Quilt. Forge y NeoForge se pueden añadir más adelante.
- **Skins:** en cuentas de Microsoft se cambian de verdad en Minecraft (64×64 o 64×32). En cuentas offline solo se ven dentro del launcher.
- **Probar en tu PC sin compilar** (opcional): instala Node.js 20, abre una terminal en `onyx-client` y ejecuta `npm install` y después `npm start`.
- Las carpetas de datos del juego están en `%APPDATA%\.onyxclient` (Windows), `~/Library/Application Support/onyxclient` (Mac) y `~/.onyxclient` (Linux).
