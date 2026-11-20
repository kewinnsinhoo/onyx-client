package site.onyxclient.kopiguard.core;

import java.util.HashMap;
import java.util.HashSet;
import java.util.Iterator;
import java.util.Locale;
import java.util.Map;
import java.util.Set;

/**
 * Las pruebas de KopiGuard en el servidor. Sin Bukkit: recibe datos simples y devuelve un Flag (o null).
 *
 * - fly:   sube más de lo que permite un salto, o se queda en el aire sin caer.
 * - speed: va más rápido de lo posible (contando poción de velocidad, hielo, velocidad de alma…).
 * - reach: golpea desde más lejos de lo normal (contando el ping).
 * - cps:   demasiados clics por segundo, o clics tan regulares que parecen de una máquina.
 * - aura:  golpea a varios a la vez o a alguien que tiene detrás.
 *
 * Lo que NO cuenta (el jugador no tiene la culpa): empujones y golpes, explosiones, cargas de viento,
 * caídas desde muy alto, slime/camas/miel, tridente, élitros, agua, escaleras, vehículos, /fly,
 * teletransportes y el servidor con lag. Eso lo marca el adaptador con PlayerState.exempt().
 */
public final class Engine {
    public static final long DECAY_MS = 4000;  // el nivel baja 1 punto cada 4 s
    public static final long REPORT_GAP_MS = 30_000; // entre dos avisos de la misma prueba, al menos 30 s
    private static final Map<String, double[]> LEVELS = new HashMap<>();
    static {
        // a partir de qué nivel se avisa al panel (y cada cuánto más)
        LEVELS.put("fly", new double[]{4, 12, 30, 80});
        LEVELS.put("speed", new double[]{4, 12, 30, 80});
        LEVELS.put("reach", new double[]{3, 8, 20, 50});
        LEVELS.put("cps", new double[]{5, 15, 40, 100});
        LEVELS.put("aura", new double[]{4, 10, 25, 60});
    }

    public double maxReach = 3.0;   // alcance normal en supervivencia
    public int maxCps = 22;         // más que esto ya no es humano (incluso con «butterfly»)
    public double sensitivity = 1.0; // >1 más permisivo, <1 más estricto

    // ---------------------------------------------------------------- movimiento
    public Flag move(PlayerState st, MoveInput in) {
        long now = in.now;
        if (in.gliding || in.riptiding) st.lastGlideOrRiptide = now;
        if (in.inLiquid || in.climbing) st.lastLiquidOrClimb = now;
        if (in.onBouncy) st.lastBouncy = now;
        if (in.onIce) st.lastIce = now;
        if (in.levitation || in.slowFalling) st.lastLevitation = now;

        boolean off = in.flyAllowed || in.inVehicle || st.exempt(now) || in.tps < 17
            || now - st.lastGlideOrRiptide < 2500 || now - st.lastLevitation < 2000;
        if (off) { st.airMoves = 0; st.groundY = Double.NaN; st.steps.clear(); st.fastWindows = 0; return null; }

        Flag f = fly(st, in);
        Flag s = speed(st, in);
        return f != null ? f : s;
    }

    private Flag fly(PlayerState st, MoveInput in) {
        long now = in.now;
        if (in.nearGround || in.inLiquid || in.climbing) { st.groundY = in.toY; st.airMoves = 0; return null; }
        if (now - st.lastLiquidOrClimb < 1000 || now - st.lastBouncy < 4000) { st.groundY = Double.NaN; st.airMoves = 0; return null; }
        if (Double.isNaN(st.groundY)) st.groundY = in.fromY;
        st.airMoves++;
        double dy = in.toY - in.fromY;
        double rise = in.toY - st.groundY;
        // Un salto normal sube 1,25 bloques; cada nivel de «salto» añade unos 0,6
        double maxRise = (1.30 + 0.70 * in.jumpLevel + 0.25) * sensitivity;
        if (dy > 0.0001 && rise > maxRise && st.airMoves > 2) {
            double amount = 1 + Math.min(5, rise - maxRise);
            return add(st, "fly", amount, now, String.format(Locale.ROOT, "Vuela: sube %s bloques sin apoyo (un salto llega a %s)", num(rise), num(maxRise)), "subida", true);
        }
        // Se queda arriba sin caer (más de 2 s sin bajar de donde saltó)
        if (st.airMoves > 40 * sensitivity && in.toY >= st.groundY - 0.5 && Math.abs(dy) < 0.06) {
            return add(st, "fly", 0.5, now, "Vuela: se queda en el aire sin caer", "flota", true);
        }
        return null;
    }

    private Flag speed(PlayerState st, MoveInput in) {
        long now = in.now;
        if (in.inLiquid) { st.steps.clear(); st.fastWindows = 0; return null; }
        double d = Math.hypot(in.toX - in.fromX, in.toZ - in.fromZ);
        if (d > 10) { st.steps.clear(); st.fastWindows = 0; return null; } // un teletransporte que no se avisó
        st.steps.addLast(new double[]{now, d});
        while (!st.steps.isEmpty() && now - st.steps.peekFirst()[0] > 1000) st.steps.pollFirst();
        double span = now - st.steps.peekFirst()[0];
        if (span < 500) return null;
        double sum = 0;
        Iterator<double[]> it = st.steps.iterator();
        it.next(); // el primero solo marca desde cuándo se cuenta
        while (it.hasNext()) sum += it.next()[1];
        double speed = sum / (span / 1000.0);
        // Correr saltando ≈ 7,1 bloques/s. Con margen para escaleras, losas y lag.
        double allowed = 8.6 * (1 + 0.2 * in.speedLevel);
        if (now - st.lastIce < 2000) allowed *= 2.6;
        if (in.soulSpeed) allowed *= 1.6;
        if (now - st.lastBouncy < 4000) allowed *= 1.8;
        if (in.ping > 250) allowed *= 1.15;
        allowed *= sensitivity;
        if (speed > allowed) st.fastWindows++;
        else if (st.fastWindows > 0) st.fastWindows--;
        if (st.fastWindows >= 3) {
            double amount = 1 + Math.min(5, (speed / allowed - 1) * 10);
            return add(st, "speed", amount, now, String.format(Locale.ROOT, "Va demasiado rápido: %s bloques/s (máx. %s)", num(speed), num(allowed)), "ventanas " + st.fastWindows, true);
        }
        return null;
    }

    // ---------------------------------------------------------------- combate
    /**
     * Un golpe cuerpo a cuerpo. eye = ojos del que golpea; box = caja del golpeado (minX, minY, minZ, maxX, maxY, maxZ);
     * angle = grados entre donde mira y donde está el golpeado.
     */
    public Flag attack(PlayerState st, long now, long targetId, double[] eye, double[] box, double angle, int ping, double tps) {
        if (tps < 17) return null;
        st.hits.addLast(new long[]{now, targetId});
        while (!st.hits.isEmpty() && now - st.hits.peekFirst()[0] > 1000) st.hits.pollFirst();
        // Alcance: distancia de los ojos a la caja del otro
        double dx = Math.max(Math.max(box[0] - eye[0], 0), eye[0] - box[3]);
        double dy = Math.max(Math.max(box[1] - eye[1], 0), eye[1] - box[4]);
        double dz = Math.max(Math.max(box[2] - eye[2], 0), eye[2] - box[5]);
        double dist = Math.sqrt(dx * dx + dy * dy + dz * dz);
        double allowed = (maxReach + 0.35 + Math.min(1.2, ping / 1000.0 * 6)) * sensitivity; // el otro se mueve mientras llega el golpe
        if (dist > allowed) {
            return add(st, "reach", 1 + Math.min(4, (dist - allowed) * 2), now,
                String.format(Locale.ROOT, "Golpea desde %s bloques (máx. %s)", num(dist), num(allowed)), "ping " + ping, false);
        }
        // Varios a la vez: 3 o más distintos en 200 ms (el barrido de la espada ya no llega aquí)
        Set<Long> recent = new HashSet<>();
        for (long[] h : st.hits) if (now - h[0] <= 200) recent.add(h[1]);
        if (recent.size() >= 3) {
            return add(st, "aura", 2, now, String.format(Locale.ROOT, "Golpea a %d a la vez", recent.size()), null, false);
        }
        // A alguien que tiene detrás (no le está mirando)
        if (angle > 100 && dist > 1.2) {
            return add(st, "aura", 1, now, String.format(Locale.ROOT, "Golpea a alguien que tiene detrás (%d°)", Math.round(angle)), null, false);
        }
        return null;
    }

    /** Un clic izquierdo (al aire, a un bloque o a alguien). */
    public Flag click(PlayerState st, long now, double tps) {
        st.clicks.addLast(now);
        while (st.clicks.size() > 41) st.clicks.pollFirst();
        if (tps < 17) return null;
        int cps = 0;
        for (long c : st.clicks) if (now - c <= 1000) cps++;
        if (cps > maxCps) {
            return add(st, "cps", 0.25, now, String.format(Locale.ROOT, "Hace %d clics por segundo (máx. %d)", cps, maxCps), null, false);
        }
        // Un autoclicker hace clics casi exactos; una mano no
        if (st.clicks.size() == 41) {
            long first = st.clicks.peekFirst();
            double mean = (now - first) / 40.0;
            if (mean < 110) {
                double sq = 0;
                long prev = -1;
                for (long c : st.clicks) {
                    if (prev >= 0) { double g = c - prev - mean; sq += g * g; }
                    prev = c;
                }
                double sd = Math.sqrt(sq / 40.0);
                if (sd < 6) {
                    st.clicks.clear();
                    return add(st, "cps", 3, now, String.format(Locale.ROOT, "Clics demasiado regulares (%s por segundo, varían %s ms): parece un autoclicker", num(1000 / mean), num(sd)), null, false);
                }
            }
        }
        return null;
    }

    // ---------------------------------------------------------------- nivel de sospecha
    public static double level(PlayerState st, String check, long now) {
        double[] v = st.vl.get(check);
        if (v == null) return 0;
        return Math.max(0, v[0] - (now - (long) v[1]) / (double) DECAY_MS);
    }

    private Flag add(PlayerState st, String check, double amount, long now, String detail, String info, boolean setback) {
        double cur = level(st, check, now);
        if (cur == 0) st.reportedLevel.remove(check);
        double next = cur + amount;
        st.vl.put(check, new double[]{next, now});
        double[] lv = LEVELS.get(check);
        int idx = -1;
        for (int i = 0; i < lv.length; i++) if (next >= lv[i]) idx = i;
        Integer done = st.reportedLevel.get(check);
        Long last = st.reportedAt.get(check);
        boolean report = idx >= 0 && (done == null || idx > done) && (last == null || now - last >= REPORT_GAP_MS);
        if (report) { st.reportedLevel.put(check, idx); st.reportedAt.put(check, now); }
        String severity = idx >= 1 ? "high" : "medium";
        // Solo se devuelve a su sitio cuando ya hay sospecha (un fallo suelto no molesta a nadie)
        return new Flag(check, detail, severity, next, info, report, setback && next >= lv[0] / 2);
    }

    static String num(double v) {
        return String.format(Locale.ROOT, "%.1f", v).replace('.', ',');
    }
}
