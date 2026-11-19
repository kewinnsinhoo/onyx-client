# Kopi Skins (plugins de servidor)

En los servidores en **modo offline** (`online-mode=false`) nadie ve las skins, porque el servidor no
habla con Mojang. Kopi Skins pide al panel de Kopi la skin de cada jugador al entrar:

- **Premium:** su skin real de Mojang.
- **No premium:** la skin que eligió en Kopi Client.

| Archivo | Dónde va |
|---|---|
| `KopiSkins-Paper-*.jar` | `plugins/` de Paper, Purpur o Folia (1.16.5 o más nuevo) |
| `KopiSkins-Velocity-*.jar` | `plugins/` del proxy Velocity (solo en el proxy) |
| `KopiSkins-Bungee-*.jar` | `plugins/` de BungeeCord o Waterfall (solo en el proxy) |

Ajustes: `plugins/KopiSkins/config.properties` (se crea solo). Comando en Paper: `/kopiskins reload`,
`/kopiskins refresh <jugador>`.

Se compila con GitHub Actions → **Kopi Skins (plugins)**.
