# Kopi Skins (plugins de servidor)

En los servidores en **modo offline** (`online-mode=false`) nadie ve las skins, porque el servidor no
habla con Mojang. Kopi Skins pide al panel de Kopi la skin de cada jugador al entrar:

- **Premium:** su skin real, pedida a Mojang desde el propio servidor (Mojang bloquea a Cloudflare).
- **No premium:** la skin que eligió en Kopi Client.

| Archivo | Dónde va |
|---|---|
| `KopiSkins-Paper-*.jar` | `plugins/` de Paper, Purpur o Folia (1.16.5 o más nuevo) |
| `KopiSkins-Velocity-*.jar` | `plugins/` del proxy Velocity (solo en el proxy) |
| `KopiSkins-Bungee-*.jar` | `plugins/` de BungeeCord o Waterfall (solo en el proxy) |

Ajustes: `plugins/KopiSkins/config.properties` (se crea solo). Comando en Paper: `/kopiskins reload`,
`/kopiskins refresh <jugador>`.

Se compila con GitHub Actions → **Kopi Skins (plugins)**.

---

# KopiGuard (plugin del servidor)

El anticheat de Kopi en el servidor. Vigila lo que el launcher no puede ver:

- **Movimiento:** vuelo (subir sin apoyo o quedarse en el aire) y velocidad.
- **Combate:** alcance, clics por segundo (y clics demasiado regulares de un autoclicker), golpes a varios a la vez y a alguien que se tiene detrás.

**No cuenta** (el jugador no tiene la culpa): empujones y golpes, explosiones, cargas de viento, caídas desde muy alto,
slime/camas/miel, tridente, élitros, agua, escaleras y enredaderas, vehículos, `/fly`, teletransportes y el servidor con lag (menos de 17 TPS).

| Archivo | Dónde va |
|---|---|
| `KopiGuard.jar` | `plugins/` de Paper, Purpur, Folia o Arclight (1.16.5 o más nuevo). No va en el proxy. |

1. Pon `KopiGuard.jar` en `plugins/` y reinicia.
2. En la consola: `kopiguard key <clave>` (la clave está en el panel → instancia → Protección → Plugin del servidor).
3. `kopiguard test` para comprobar que habla con el panel.

Los avisos salen en la página **KopiGuard** del panel (tipos Movimiento y Combate) y en el chat de quien tenga el permiso
`kopiguard.alerts` (los op lo tienen; `/kopiguard alerts` para no verlos). Si el jugador usa Kopi Client, el launcher manda
una foto y un vídeo corto del momento.

Comandos (`/kopiguard` o `/kg`): `key <clave>`, `test`, `alerts`, `status <jugador>`, `reload`.
Permisos: `kopiguard.admin`, `kopiguard.alerts`, `kopiguard.bypass` (no se vigila a ese jugador).
Ajustes: `plugins/KopiGuard/config.properties` (idioma es/en/ca/fr, devolver al sitio, pruebas, sensibilidad, alcance y clics máximos).

Se compila con GitHub Actions → **KopiGuard (plugin del servidor)**. Las cuentas se prueban sin servidor: `gradle -p server-plugins :guard:check`.
