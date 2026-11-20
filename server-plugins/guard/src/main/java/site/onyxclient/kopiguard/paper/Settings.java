package site.onyxclient.kopiguard.paper;

import java.io.File;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.util.ArrayList;
import java.util.List;
import java.util.Properties;
import java.io.StringReader;

/** Ajustes de KopiGuard en plugins/KopiGuard/config.properties (se crea solo la primera vez). */
public final class Settings {
    public final String panel;
    public final String key;
    public final String language;
    public final boolean setback;
    public final boolean alerts;
    public final boolean fly, speed, reach, cps, aura;
    public final double sensitivity;
    public final double maxReach;
    public final int maxCps;

    private static final String DEFAULT =
        "# KopiGuard: el anticheat de Kopi en el servidor (vuelo, velocidad, alcance, clics y golpes a varios).\n" +
        "# Los avisos llegan a la página KopiGuard del panel de Kopi.\n" +
        "\n" +
        "# La clave de tu instancia (panel → instancia → Protección → Plugin del servidor).\n" +
        "# También se puede poner desde la consola con: kopiguard key <clave>\n" +
        "key=\n" +
        "\n" +
        "# Idioma de los mensajes: es, en, ca o fr\n" +
        "language=es\n" +
        "\n" +
        "# Devolver al jugador a donde estaba si vuela o va demasiado rápido\n" +
        "setback=true\n" +
        "\n" +
        "# Avisar en el chat a quien tenga el permiso kopiguard.alerts (los op lo tienen)\n" +
        "alerts=true\n" +
        "\n" +
        "# Pruebas (true = activada)\n" +
        "check.fly=true\n" +
        "check.speed=true\n" +
        "check.reach=true\n" +
        "check.cps=true\n" +
        "check.aura=true\n" +
        "\n" +
        "# 1.0 = normal. Más alto = más permisivo (menos avisos); más bajo = más estricto.\n" +
        "sensitivity=1.0\n" +
        "\n" +
        "# Alcance normal en supervivencia (cámbialo si tu servidor lo modifica) y clics por segundo máximos\n" +
        "max-reach=3.0\n" +
        "max-cps=22\n" +
        "\n" +
        "# Panel de Kopi (no lo cambies)\n" +
        "panel=https://panel.onyxclient.site\n";

    private Settings(Properties p) {
        panel = p.getProperty("panel", "https://panel.onyxclient.site").trim().replaceAll("/+$", "");
        key = p.getProperty("key", "").trim();
        String l = p.getProperty("language", "es").trim().toLowerCase();
        language = l.matches("es|en|ca|fr") ? l : "es";
        setback = bool(p, "setback", true);
        alerts = bool(p, "alerts", true);
        fly = bool(p, "check.fly", true);
        speed = bool(p, "check.speed", true);
        reach = bool(p, "check.reach", true);
        cps = bool(p, "check.cps", true);
        aura = bool(p, "check.aura", true);
        sensitivity = Math.max(0.5, Math.min(3.0, dbl(p, "sensitivity", 1.0)));
        maxReach = Math.max(2.0, Math.min(10.0, dbl(p, "max-reach", 3.0)));
        maxCps = (int) Math.max(10, Math.min(60, dbl(p, "max-cps", 22)));
    }

    private static boolean bool(Properties p, String k, boolean def) {
        String v = p.getProperty(k);
        return v == null ? def : !"false".equalsIgnoreCase(v.trim());
    }

    private static double dbl(Properties p, String k, double def) {
        try { return Double.parseDouble(p.getProperty(k).trim()); } catch (Exception e) { return def; }
    }

    private static File file(File folder) { return new File(folder, "config.properties"); }

    public static Settings load(File folder) {
        Properties p = new Properties();
        File f = file(folder);
        try {
            if (!f.exists()) {
                folder.mkdirs();
                Files.write(f.toPath(), DEFAULT.getBytes(StandardCharsets.UTF_8));
            }
            p.load(new StringReader(new String(Files.readAllBytes(f.toPath()), StandardCharsets.UTF_8)));
        } catch (Exception ignored) {
            // sin permisos de escritura: valores por defecto
        }
        return new Settings(p);
    }

    /** Cambia (o añade) una línea «nombre=valor» sin tocar el resto del archivo. */
    public static void set(File folder, String name, String value) throws Exception {
        load(folder); // por si no existe
        File f = file(folder);
        List<String> lines = new ArrayList<>(Files.readAllLines(f.toPath(), StandardCharsets.UTF_8));
        boolean done = false;
        for (int i = 0; i < lines.size(); i++) {
            String t = lines.get(i).trim();
            if (t.startsWith(name + "=") || t.startsWith(name + " =")) { lines.set(i, name + "=" + value); done = true; }
        }
        if (!done) lines.add(name + "=" + value);
        Files.write(f.toPath(), String.join("\n", lines).concat("\n").getBytes(StandardCharsets.UTF_8));
    }
}
