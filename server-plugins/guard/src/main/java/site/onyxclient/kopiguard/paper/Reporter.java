package site.onyxclient.kopiguard.paper;

import java.io.ByteArrayOutputStream;
import java.io.InputStream;
import java.io.OutputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.nio.charset.StandardCharsets;
import java.util.LinkedHashMap;
import java.util.Map;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.function.Consumer;
import java.util.logging.Logger;

/** Manda los avisos al panel de Kopi, en un hilo aparte (nunca frena el servidor). */
public final class Reporter {
    private final ExecutorService pool = Executors.newSingleThreadExecutor(r -> {
        Thread t = new Thread(r, "KopiGuard-panel");
        t.setDaemon(true);
        return t;
    });
    private final Logger log;
    private volatile Settings settings;
    private volatile boolean warnedKey;

    public Reporter(Logger log, Settings settings) {
        this.log = log;
        this.settings = settings;
    }

    public void settings(Settings s) { settings = s; warnedKey = false; }

    /** Respuesta del panel: código HTTP y texto. */
    public static final class Answer {
        public final int status;
        public final String body;
        Answer(int status, String body) { this.status = status; this.body = body; }
    }

    public void report(String player, String uuid, String check, String detail, String severity, Map<String, Object> data) {
        Settings s = settings;
        if (s.key.isEmpty()) {
            if (!warnedKey) { warnedKey = true; log.warning("[KopiGuard] Falta la clave del servidor: kopiguard key <clave> (está en el panel → instancia → Protección)"); }
            return;
        }
        Map<String, Object> body = new LinkedHashMap<>();
        body.put("key", s.key);
        body.put("player", player);
        body.put("uuid", uuid);
        body.put("check", check);
        body.put("detail", detail);
        body.put("severity", severity);
        body.put("data", data);
        pool.execute(() -> {
            Answer a = post(s, body);
            if (a.status == 401 && !warnedKey) { warnedKey = true; log.warning("[KopiGuard] El panel dice que la clave no es válida. Crea otra en el panel y ponla con: kopiguard key <clave>"); }
            else if (a.status != 200 && a.status != 401) log.warning("[KopiGuard] No se pudo avisar al panel (" + a.status + ")");
        });
    }

    /** /kopiguard test: comprueba la clave. */
    public void ping(Consumer<Answer> done) {
        Settings s = settings;
        Map<String, Object> body = new LinkedHashMap<>();
        body.put("key", s.key);
        body.put("ping", true);
        pool.execute(() -> done.accept(post(s, body)));
    }

    private static Answer post(Settings s, Map<String, Object> body) {
        HttpURLConnection c = null;
        try {
            c = (HttpURLConnection) new URL(s.panel + "/api/srv/guard").openConnection();
            c.setRequestMethod("POST");
            c.setConnectTimeout(5000);
            c.setReadTimeout(8000);
            c.setDoOutput(true);
            c.setRequestProperty("Content-Type", "application/json");
            c.setRequestProperty("User-Agent", "KopiGuard/" + KopiGuardPaper.VERSION);
            byte[] out = json(body).getBytes(StandardCharsets.UTF_8);
            try (OutputStream o = c.getOutputStream()) { o.write(out); }
            int code = c.getResponseCode();
            InputStream in = code < 400 ? c.getInputStream() : c.getErrorStream();
            ByteArrayOutputStream buf = new ByteArrayOutputStream();
            if (in != null) {
                byte[] b = new byte[4096];
                int n;
                while ((n = in.read(b)) > 0 && buf.size() < 65536) buf.write(b, 0, n);
                in.close();
            }
            return new Answer(code, new String(buf.toByteArray(), StandardCharsets.UTF_8));
        } catch (Exception e) {
            return new Answer(0, String.valueOf(e.getMessage()));
        } finally {
            if (c != null) c.disconnect();
        }
    }

    // JSON pequeño a mano (sin librerías): textos, números, booleanos y mapas
    @SuppressWarnings("unchecked")
    static String json(Object v) {
        if (v == null) return "null";
        if (v instanceof Boolean || v instanceof Integer || v instanceof Long) return String.valueOf(v);
        if (v instanceof Number) {
            double d = ((Number) v).doubleValue();
            return Double.isFinite(d) ? String.valueOf(Math.round(d * 100) / 100.0) : "null";
        }
        if (v instanceof Map) {
            StringBuilder sb = new StringBuilder("{");
            boolean first = true;
            for (Map.Entry<String, Object> e : ((Map<String, Object>) v).entrySet()) {
                if (!first) sb.append(',');
                first = false;
                sb.append(json(e.getKey())).append(':').append(json(e.getValue()));
            }
            return sb.append('}').toString();
        }
        String s = String.valueOf(v);
        StringBuilder sb = new StringBuilder("\"");
        for (char ch : s.toCharArray()) {
            switch (ch) {
                case '"': sb.append("\\\""); break;
                case '\\': sb.append("\\\\"); break;
                case '\n': sb.append("\\n"); break;
                case '\r': sb.append("\\r"); break;
                case '\t': sb.append("\\t"); break;
                default:
                    if (ch < 0x20) sb.append(String.format("\\u%04x", (int) ch));
                    else sb.append(ch);
            }
        }
        return sb.append('"').toString();
    }

    public void shutdown() { pool.shutdown(); }
}
