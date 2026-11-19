package site.onyxclient.kopiskins;

import java.io.ByteArrayOutputStream;
import java.io.InputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.net.URLEncoder;
import java.nio.charset.StandardCharsets;
import java.util.Locale;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;
import java.util.function.Consumer;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

/**
 * Pide al panel de Kopi la skin de un jugador (la propiedad «textures» ya firmada).
 * - Premium: su skin real de Mojang.
 * - No premium: la skin que eligió en Kopi Client.
 * Guarda las respuestas unos minutos para no preguntar en cada entrada.
 * Sin dependencias: funciona en Paper, Velocity y BungeeCord (Java 8+).
 */
public final class SkinService {

    /** Propiedad «textures» lista para poner en el perfil del jugador. */
    public static final class Skin {
        public final String value;
        public final String signature;
        public final String source;

        Skin(String value, String signature, String source) {
            this.value = value;
            this.signature = signature;
            this.source = source;
        }
    }

    private static final class Entry {
        final Skin skin;
        final long expires;

        Entry(Skin skin, long expires) {
            this.skin = skin;
            this.expires = expires;
        }
    }

    private static final Pattern NAME = Pattern.compile("^[A-Za-z0-9_]{2,16}$");
    private static final Pattern VALUE = Pattern.compile("\"value\"\\s*:\\s*\"([^\"]+)\"");
    private static final Pattern SIGNATURE = Pattern.compile("\"signature\"\\s*:\\s*\"([^\"]+)\"");
    private static final Pattern SOURCE = Pattern.compile("\"source\"\\s*:\\s*\"([a-z]+)\"");

    public static final String VERSION = "1.0.0";

    private final String base;
    private final int timeoutMs;
    private final long cacheMs;
    private final Consumer<String> warn;
    private final Map<String, Entry> cache = new ConcurrentHashMap<String, Entry>();

    public SkinService(String panelUrl, int timeoutMs, int cacheSeconds, Consumer<String> warn) {
        String u = panelUrl == null || panelUrl.trim().isEmpty() ? "https://panel.onyxclient.site" : panelUrl.trim();
        while (u.endsWith("/")) u = u.substring(0, u.length() - 1);
        this.base = u;
        this.timeoutMs = Math.max(1000, timeoutMs);
        this.cacheMs = Math.max(0, cacheSeconds) * 1000L;
        this.warn = warn;
    }

    /** Skin de un jugador, o null si no tiene (sale con la skin por defecto). Bloquea: llamar fuera del hilo principal. */
    public Skin get(String name) {
        if (name == null || !NAME.matcher(name).matches()) return null;
        String key = name.toLowerCase(Locale.ROOT);
        long now = System.currentTimeMillis();
        Entry e = cache.get(key);
        if (e != null && e.expires > now) return e.skin;
        try {
            Skin s = fetch(name);
            // Si no tiene skin se recuerda menos tiempo: puede ponérsela en el launcher en cualquier momento
            cache.put(key, new Entry(s, now + (s != null ? cacheMs : Math.min(cacheMs, 60000L))));
            return s;
        } catch (Exception ex) {
            warn.accept("No se pudo pedir la skin de " + name + " al panel: " + ex.getMessage());
            return e != null ? e.skin : null; // si el panel falla, la última que se conocía
        }
    }

    /** Olvida lo guardado (por ejemplo, tras cambiar la skin en el launcher). */
    public void forget(String name) {
        if (name == null) cache.clear();
        else cache.remove(name.toLowerCase(Locale.ROOT));
    }

    private Skin fetch(String name) throws Exception {
        URL url = new URL(base + "/api/public/skin/" + URLEncoder.encode(name, "UTF-8"));
        HttpURLConnection c = (HttpURLConnection) url.openConnection();
        c.setConnectTimeout(timeoutMs);
        c.setReadTimeout(timeoutMs);
        c.setRequestProperty("User-Agent", "KopiSkins/" + VERSION);
        c.setRequestProperty("Accept", "application/json");
        try {
            int code = c.getResponseCode();
            if (code == 404) return null;
            if (code != 200) throw new IllegalStateException("respuesta " + code);
            String body = read(c.getInputStream());
            return parse(body);
        } finally {
            c.disconnect();
        }
    }

    /** Lee la respuesta del panel: {"source":"premium|kopi","value":"...","signature":"..."}. */
    public static Skin parse(String body) {
        Matcher v = VALUE.matcher(body);
        Matcher s = SIGNATURE.matcher(body);
        if (!v.find() || !s.find()) return null;
        Matcher src = SOURCE.matcher(body);
        return new Skin(v.group(1), s.group(1), src.find() ? src.group(1) : "kopi");
    }

    private static String read(InputStream in) throws Exception {
        try (InputStream is = in) {
            ByteArrayOutputStream out = new ByteArrayOutputStream();
            byte[] buf = new byte[4096];
            int n;
            while ((n = is.read(buf)) != -1) {
                out.write(buf, 0, n);
                if (out.size() > 64 * 1024) throw new IllegalStateException("respuesta demasiado grande");
            }
            return new String(out.toByteArray(), StandardCharsets.UTF_8);
        }
    }
}
