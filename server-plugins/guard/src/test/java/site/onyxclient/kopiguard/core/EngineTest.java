package site.onyxclient.kopiguard.core;

import java.util.ArrayList;
import java.util.List;
import java.util.Random;

/** Pruebas de las cuentas de KopiGuard (sin servidor). Se ejecutan con: java EngineTest */
public final class EngineTest {
    static int passed = 0;

    static void check(boolean ok, String what) {
        if (!ok) throw new AssertionError(what);
        passed++;
        System.out.println("  ✓ " + what);
    }

    /** Simula movimientos de 50 ms (un tick). dy y dh = por tick. */
    static List<Flag> run(Engine e, PlayerState st, long[] clock, double[] pos, int ticks, double dy, double dh, Setter s) {
        List<Flag> out = new ArrayList<>();
        for (int i = 0; i < ticks; i++) {
            MoveInput in = new MoveInput();
            clock[0] += 50;
            in.now = clock[0];
            in.fromX = pos[0]; in.fromY = pos[1]; in.fromZ = pos[2];
            pos[0] += dh; pos[1] += dy;
            in.toX = pos[0]; in.toY = pos[1]; in.toZ = pos[2];
            in.tps = 20; in.ping = 40;
            if (s != null) s.set(in, i);
            Flag f = e.move(st, in);
            if (f != null) out.add(f);
        }
        return out;
    }

    interface Setter { void set(MoveInput in, int tick); }

    static List<Flag> jump(Engine e, PlayerState st, long[] clock, double[] pos, double dh) {
        // Un salto de verdad: sube ~1,25 y baja en 12 ticks
        double[] v = {0.42, 0.33, 0.25, 0.17, 0.09, 0.01, -0.07, -0.15, -0.23, -0.30, -0.37, -0.17};
        List<Flag> out = new ArrayList<>();
        for (int i = 0; i < v.length; i++) {
            final boolean ground = i == v.length - 1;
            out.addAll(run(e, st, clock, pos, 1, v[i], dh, (in, t) -> in.nearGround = ground));
        }
        return out;
    }

    public static void main(String[] args) {
        System.out.println("KopiGuard (servidor) — pruebas");
        Engine e = new Engine();
        long[] clock = {1_000_000};

        // 1) andar, correr y saltar: nada
        PlayerState st = new PlayerState();
        double[] pos = {0, 64, 0};
        List<Flag> f = run(e, st, clock, pos, 40, 0, 0.28, (in, t) -> in.nearGround = true);
        for (int i = 0; i < 20; i++) f.addAll(jump(e, st, clock, pos, 0.355)); // correr saltando ≈ 7,1 bloques/s
        check(f.isEmpty(), "andar, correr y saltar no es trampa");

        // 2) subir volando
        st = new PlayerState(); pos = new double[]{0, 64, 0};
        run(e, st, clock, pos, 5, 0, 0, (in, t) -> in.nearGround = true);
        f = run(e, st, clock, pos, 30, 0.4, 0.1, null);
        check(!f.isEmpty() && f.get(0).check.equals("fly"), "subir 12 bloques sin apoyo es vuelo");
        Flag rep = first(f, true);
        check(rep != null && rep.severity.equals("medium"), "avisa al panel al llegar al primer nivel");
        check(count(f, true) <= 2, "no avisa en cada movimiento, solo al pasar niveles");
        check(f.get(f.size() - 1).setback, "le devuelve al suelo cuando ya hay sospecha");

        // 3) flotar quieto en el aire
        st = new PlayerState(); pos = new double[]{0, 64, 0};
        run(e, st, clock, pos, 5, 0, 0, (in, t) -> in.nearGround = true);
        run(e, st, clock, pos, 3, 0.4, 0, null);
        f = run(e, st, clock, pos, 120, 0, 0.2, null);
        check(!f.isEmpty() && f.get(0).detail.contains("sin caer"), "quedarse en el aire es vuelo");

        // 4) le mandan a volar (empujón, explosión, carga de viento): no cuenta
        st = new PlayerState(); pos = new double[]{0, 64, 0};
        run(e, st, clock, pos, 5, 0, 0, (in, t) -> in.nearGround = true);
        st.exempt(clock[0], 3000, "explosión");
        f = run(e, st, clock, pos, 30, 0.8, 1.2, null);
        check(f.isEmpty(), "salir volando por una explosión no cuenta");
        f = run(e, st, clock, pos, 40, -1.5, 0.3, null); // y luego cae desde muy alto
        check(f.isEmpty(), "caer desde muy alto no cuenta");

        // 5) saltar sobre slime
        st = new PlayerState(); pos = new double[]{0, 64, 0};
        run(e, st, clock, pos, 3, 0, 0, (in, t) -> { in.nearGround = true; in.onBouncy = true; });
        f = run(e, st, clock, pos, 10, 0.6, 0.2, null);
        check(f.isEmpty(), "rebotar en slime no cuenta");

        // 6) élitros, tridente, /fly y agua
        st = new PlayerState(); pos = new double[]{0, 64, 0};
        f = run(e, st, clock, pos, 60, 0.5, 2, (in, t) -> in.gliding = true);
        f.addAll(run(e, st, clock, pos, 20, 1, 3, (in, t) -> in.riptiding = true));
        f.addAll(run(e, st, clock, pos, 60, 0.5, 0.5, (in, t) -> in.flyAllowed = true));
        f.addAll(run(e, st, clock, pos, 60, 0.3, 0.2, (in, t) -> in.inLiquid = true));
        check(f.isEmpty(), "élitros, tridente, /fly y agua no cuentan");

        // 7) velocidad
        st = new PlayerState(); pos = new double[]{0, 64, 0};
        f = run(e, st, clock, pos, 60, 0, 1.0, (in, t) -> in.nearGround = true); // 20 bloques/s
        check(!f.isEmpty() && f.get(0).check.equals("speed"), "20 bloques/s es demasiado");
        st = new PlayerState();
        f = run(e, st, clock, pos, 60, 0, 0.75, (in, t) -> { in.nearGround = true; in.onIce = true; }); // 15 b/s en hielo
        check(f.isEmpty(), "15 bloques/s sobre hielo no cuenta");
        st = new PlayerState();
        f = run(e, st, clock, pos, 60, 0, 0.5, (in, t) -> { in.nearGround = true; in.speedLevel = 2; }); // 10 b/s con velocidad II
        check(f.isEmpty(), "10 bloques/s con poción de velocidad II no cuenta");
        st = new PlayerState();
        f = run(e, st, clock, pos, 10, 0, 0, (in, t) -> in.nearGround = true);
        st.exempt(clock[0], 2000, "empujón");
        f.addAll(run(e, st, clock, pos, 20, 0, 1.2, (in, t) -> in.nearGround = true));
        check(f.isEmpty(), "un empujón fuerte no cuenta como velocidad");

        // 8) alcance
        st = new PlayerState();
        double[] eye = {0, 65.62, 0};
        double[] near = {2.7, 64, -0.3, 3.3, 65.8, 0.3};   // a 2,7 bloques
        double[] far = {5.5, 64, -0.3, 6.1, 65.8, 0.3};    // a 5,5 bloques
        check(e.attack(st, clock[0] += 500, 1, eye, near, 5, 60, 20) == null, "golpear a 2,7 bloques es normal");
        check(e.attack(st, clock[0] += 500, 1, eye, new double[]{3.4, 64, -0.3, 4.0, 65.8, 0.3}, 5, 180, 20) == null, "3,4 bloques con 180 ms de ping es normal");
        Flag r = null;
        for (int i = 0; i < 4; i++) { Flag x = e.attack(st, clock[0] += 500, 1, eye, far, 5, 60, 20); if (x != null && x.report) r = x; }
        check(r != null && r.check.equals("reach"), "golpear a 5,5 bloques varias veces es alcance");

        // 9) golpes a varios a la vez y a alguien de detrás
        st = new PlayerState();
        Flag a = null;
        long t0 = clock[0] += 5000;
        e.attack(st, t0, 1, eye, near, 5, 40, 20);
        e.attack(st, t0 + 40, 2, eye, near, 5, 40, 20);
        a = e.attack(st, t0 + 80, 3, eye, near, 5, 40, 20);
        check(a != null && a.check.equals("aura") && a.detail.contains("3"), "golpear a 3 en 80 ms es trampa");
        st = new PlayerState();
        check(e.attack(st, clock[0] += 5000, 1, eye, near, 150, 40, 20) != null, "golpear a quien tienes detrás es trampa");

        // 10) clics
        st = new PlayerState();
        Random rnd = new Random(3);
        List<Flag> c = new ArrayList<>();
        long tc = clock[0] += 5000;
        for (int i = 0; i < 200; i++) { tc += 55 + rnd.nextInt(45); Flag x = e.click(st, tc, 20); if (x != null) c.add(x); } // ~13 cps humanos
        check(c.isEmpty(), "13 clics por segundo con la mano no cuentan");
        st = new PlayerState(); c.clear();
        for (int i = 0; i < 200; i++) { tc += 33; Flag x = e.click(st, tc, 20); if (x != null) c.add(x); } // 30 cps
        check(!c.isEmpty() && c.get(0).detail.contains("clics por segundo"), "30 clics por segundo es demasiado");
        st = new PlayerState(); c.clear();
        for (int i = 0; i < 100; i++) { tc += 83 + (i % 2); Flag x = e.click(st, tc, 20); if (x != null) c.add(x); } // 12 cps exactos
        check(!c.isEmpty() && c.get(0).detail.contains("autoclicker"), "12 clics por segundo exactos es un autoclicker");

        // 11) con el servidor con lag no se mira nada
        st = new PlayerState(); pos = new double[]{0, 64, 0};
        f = run(e, st, clock, pos, 40, 0.5, 1.5, (in, t) -> in.tps = 12);
        check(f.isEmpty(), "con el servidor a 12 TPS no se juzga a nadie");

        // 12) el nivel baja con el tiempo y vuelve a avisar si reincide
        st = new PlayerState(); pos = new double[]{0, 64, 0};
        run(e, st, clock, pos, 5, 0, 0, (in, t) -> in.nearGround = true);
        f = run(e, st, clock, pos, 30, 0.4, 0, null);
        check(Engine.level(st, "fly", clock[0]) > 0, "hay sospecha tras volar");
        clock[0] += 10 * 60_000;
        check(Engine.level(st, "fly", clock[0]) == 0, "a los 10 minutos ya no queda sospecha");
        run(e, st, clock, pos, 5, 0, 0, (in, t) -> in.nearGround = true);
        f = run(e, st, clock, pos, 30, 0.4, 0, null);
        check(first(f, true) != null, "si vuelve a hacerlo, vuelve a avisar");

        System.out.println("\n" + passed + " pruebas superadas");
    }

    static Flag first(List<Flag> f, boolean report) { for (Flag x : f) if (x.report == report) return x; return null; }
    static int count(List<Flag> f, boolean report) { int n = 0; for (Flag x : f) if (x.report == report) n++; return n; }
}
