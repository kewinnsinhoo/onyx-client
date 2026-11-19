package site.onyxclient.kopiskins;

import java.io.File;
import java.io.FileInputStream;
import java.io.FileOutputStream;
import java.io.InputStream;
import java.io.OutputStream;
import java.nio.charset.StandardCharsets;
import java.util.Properties;

/** Ajustes del plugin en config.properties (se crea solo la primera vez). */
public final class Settings {
    public final String panel;
    public final boolean keepExisting;
    public final int timeoutMs;
    public final int cacheSeconds;
    public final boolean mojangDirect;

    private static final String DEFAULT =
        "# Kopi Skins: las skins de los jugadores en servidores en modo offline.\n" +
        "# Premium: su skin real. No premium: la que eligieron en Kopi Client.\n" +
        "\n" +
        "# Panel de Kopi (no lo cambies salvo que tengas tu propio panel)\n" +
        "panel=https://panel.onyxclient.site\n" +
        "\n" +
        "# Pedir la skin de los premium directamente a Mojang desde este servidor (recomendado)\n" +
        "mojang-direct=true\n" +
        "\n" +
        "# Si el jugador ya trae skin (servidor en modo online o el proxy ya se la puso), no se toca\n" +
        "keep-existing=true\n" +
        "\n" +
        "# Cuánto esperar al panel (milisegundos) y cuánto recordar cada skin (segundos)\n" +
        "timeout-ms=4000\n" +
        "cache-seconds=300\n";

    private Settings(Properties p) {
        panel = p.getProperty("panel", "https://panel.onyxclient.site").trim();
        keepExisting = !"false".equalsIgnoreCase(p.getProperty("keep-existing", "true").trim());
        timeoutMs = toInt(p.getProperty("timeout-ms"), 4000);
        cacheSeconds = toInt(p.getProperty("cache-seconds"), 300);
        mojangDirect = !"false".equalsIgnoreCase(p.getProperty("mojang-direct", "true").trim());
    }

    private static int toInt(String v, int def) {
        try { return Integer.parseInt(v.trim()); } catch (Exception e) { return def; }
    }

    /** Lee (o crea) carpeta/config.properties. */
    public static Settings load(File folder) {
        Properties p = new Properties();
        File f = new File(folder, "config.properties");
        try {
            if (!f.exists()) {
                folder.mkdirs();
                try (OutputStream out = new FileOutputStream(f)) { out.write(DEFAULT.getBytes(StandardCharsets.UTF_8)); }
            }
            try (InputStream in = new FileInputStream(f)) { p.load(in); }
        } catch (Exception ignored) {
            // sin permisos de escritura: valores por defecto
        }
        return new Settings(p);
    }

    public SkinService service(java.util.function.Consumer<String> warn) {
        return new SkinService(panel, timeoutMs, cacheSeconds, mojangDirect, warn);
    }
}
