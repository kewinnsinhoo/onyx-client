package site.onyxclient.kopiguard.core;

/**
 * Un movimiento del jugador, ya traducido del servidor (Paper, Arclight…) a datos simples.
 * Así las pruebas no dependen de Bukkit y se pueden probar solas.
 */
public final class MoveInput {
    public long now;                 // ms
    public double fromX, fromY, fromZ, toX, toY, toZ;
    public boolean nearGround;       // hay un bloque sólido justo debajo (lo mira el servidor, no el cliente)
    public boolean inLiquid;         // agua, lava, burbujas
    public boolean climbing;         // escalera, enredadera, andamio, telaraña, nieve polvo…
    public boolean onIce;            // hielo debajo (se va más rápido)
    public boolean onBouncy;         // slime, cama, miel… debajo
    public boolean gliding;          // élitros
    public boolean riptiding;        // tridente con propulsión
    public boolean flyAllowed;       // creativo, espectador o /fly
    public boolean inVehicle;        // caballo, barco, vagoneta…
    public int jumpLevel;            // salto (0 = sin efecto)
    public int speedLevel;           // velocidad (0 = sin efecto)
    public boolean levitation;
    public boolean slowFalling;
    public boolean dolphin;          // gracia del delfín
    public boolean soulSpeed;        // botas con velocidad de alma sobre arena de almas
    public int ping;                 // ms
    public double tps;               // 20 = normal
}
