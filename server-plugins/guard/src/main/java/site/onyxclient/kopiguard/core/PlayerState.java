package site.onyxclient.kopiguard.core;

import java.util.ArrayDeque;
import java.util.HashMap;
import java.util.Map;

/** Lo que se recuerda de cada jugador mientras está conectado. */
public final class PlayerState {
    // Momento hasta el que no se mira el movimiento (empujones, explosiones, teletransportes…)
    long exemptMoveUntil;
    String exemptWhy = "";

    // Vuelo
    double groundY = Double.NaN;  // altura del último suelo
    int airMoves;                 // movimientos seguidos en el aire
    long lastBouncy, lastLiquidOrClimb, lastGlideOrRiptide, lastIce, lastLevitation;

    // Velocidad: distancias horizontales recientes (ms, bloques)
    final ArrayDeque<double[]> steps = new ArrayDeque<>();
    int fastWindows;

    // Combate
    final ArrayDeque<Long> clicks = new ArrayDeque<>();
    final ArrayDeque<long[]> hits = new ArrayDeque<>(); // [ms, id del golpeado]
    int behindHits;

    // Nivel de sospecha por prueba (baja solo con el tiempo) y último aviso enviado
    final Map<String, double[]> vl = new HashMap<>();   // prueba → [nivel, ms de la última subida]
    final Map<String, Integer> reportedLevel = new HashMap<>();
    final Map<String, Long> reportedAt = new HashMap<>();

    /** No mirar el movimiento durante ms (lo más largo gana). */
    public void exempt(long now, long ms, String why) {
        if (now + ms > exemptMoveUntil) { exemptMoveUntil = now + ms; exemptWhy = why; }
        airMoves = 0;
        groundY = Double.NaN;
        steps.clear();
        fastWindows = 0;
    }

    public boolean exempt(long now) { return now < exemptMoveUntil; }
    public String exemptWhy() { return exemptWhy; }
}
