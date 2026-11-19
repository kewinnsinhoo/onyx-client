# Guía de Kopi Client (todo gratis con GitHub)

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
1. Entra en **portal.azure.com** con tu cuenta de Microsoft. No hace falta tarjeta.
2. Busca **"Microsoft Entra ID"** → **Registros de aplicaciones** → **Nuevo registro**.
   - Nombre: `Kopi Client`
   - Tipos de cuenta: **"Solo cuentas personales de Microsoft"**
   - URI de redirección: elige **"Cliente público/nativo (móvil y escritorio)"** y pega:
     `https://login.microsoftonline.com/common/oauth2/nativeclient`
3. Pulsa **Registrar** y copia el **"Id. de aplicación (cliente)"**.
4. En **Autenticación**, activa **"Permitir flujos de clientes públicos" = Sí** y guarda.
5. **Pide permiso a Mojang** en este formulario: **https://aka.ms/mce-reviewappid**. Pon el Client ID, el nombre `Kopi Client` y explica que es el launcher de tu estudio. Mientras no te aprueben, el login premium dará error; las cuentas offline sí funcionan.

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
- `reportWebhook` (opcional): en tu Discord, abre los ajustes del canal → **Integraciones → Webhooks → Nuevo webhook → Copiar URL** y pégala aquí. Así los informes del botón ⚠ te llegan a ese canal. Si lo dejas vacío, el informe se guarda en el PC del jugador.

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
- `loader.type`: `vanilla`, `fabric` o `quilt`.
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

## Cosas a saber
- **Windows** mostrará "Windows protegió su PC" porque el .exe no está firmado (la firma cuesta dinero). Hay que pulsar **Más información → Ejecutar de todas formas**.
- **Mac**: la primera vez, clic derecho sobre la app → **Abrir**. Si no deja, ve a **Ajustes del Sistema → Privacidad y seguridad → Abrir igualmente**. Sin firma de Apple, en Mac las actualizaciones automáticas no se instalan solas: hay que descargar la nueva versión desde Releases.
- **Loaders:** ahora mismo funcionan Vanilla, Fabric y Quilt. Forge y NeoForge se pueden añadir más adelante.
- **Skins:** en cuentas de Microsoft se cambian de verdad en Minecraft (64×64 o 64×32). En cuentas offline solo se ven dentro del launcher.
- **Probar en tu PC sin compilar** (opcional): instala Node.js 20, abre una terminal en `onyx-client` y ejecuta `npm install` y después `npm start`.
- Las carpetas de datos del juego están en `%APPDATA%\.onyxclient` (Windows), `~/Library/Application Support/onyxclient` (Mac) y `~/.onyxclient` (Linux).
