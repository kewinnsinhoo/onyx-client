package site.onyxclient.kopiguard.core;

/** Una trampa vista: qué prueba, qué pasó (en palabras), gravedad y nivel acumulado. */
public final class Flag {
    public final String check;     // fly, speed, reach, cps, aura
    public final String detail;    // frase para el panel, p. ej. «Vuela: sube 4,2 bloques sin apoyo»
    public final String severity;  // low, medium, high
    public final double vl;        // nivel de sospecha acumulado de esa prueba
    public final String info;      // datos extra (opcional)
    public final boolean report;   // true si toca avisar al panel (al pasar un umbral, no en cada golpe)
    public final boolean setback;  // true si conviene devolverle a donde estaba (vuelo y velocidad)

    public Flag(String check, String detail, String severity, double vl, String info, boolean report, boolean setback) {
        this.check = check;
        this.detail = detail;
        this.severity = severity;
        this.vl = vl;
        this.info = info;
        this.report = report;
        this.setback = setback;
    }

    @Override
    public String toString() {
        return check + "(" + severity + ", vl " + Math.round(vl * 10) / 10.0 + "): " + detail;
    }
}
