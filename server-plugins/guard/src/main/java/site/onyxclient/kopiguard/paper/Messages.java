package site.onyxclient.kopiguard.paper;

import java.util.HashMap;
import java.util.Map;

/** Mensajes del plugin en los 4 idiomas de Kopi: es, en, ca, fr (language= en config.properties). */
final class Messages {
    private static final Map<String, String[]> M = new HashMap<>();
    private static void m(String k, String es, String en, String ca, String fr) { M.put(k, new String[]{es, en, ca, fr}); }

    static {
        m("alert", "§d[KopiGuard] §f{player} §7· §e{check}§7: {detail} §8(nivel {vl})",
            "§d[KopiGuard] §f{player} §7· §e{check}§7: {detail} §8(level {vl})",
            "§d[KopiGuard] §f{player} §7· §e{check}§7: {detail} §8(nivell {vl})",
            "§d[KopiGuard] §f{player} §7· §e{check}§7: {detail} §8(niveau {vl})");
        m("fly", "Vuelo", "Flying", "Vol", "Vol");
        m("speed", "Velocidad", "Speed", "Velocitat", "Vitesse");
        m("reach", "Alcance", "Reach", "Abast", "Portée");
        m("cps", "Clics", "Clicks", "Clics", "Clics");
        m("aura", "Golpes", "Hits", "Cops", "Coups");
        m("usage", "§d[KopiGuard] §7Uso: §f/kopiguard key <clave> §7| §ftest §7| §falerts §7| §fstatus <jugador> §7| §freload",
            "§d[KopiGuard] §7Usage: §f/kopiguard key <key> §7| §ftest §7| §falerts §7| §fstatus <player> §7| §freload",
            "§d[KopiGuard] §7Ús: §f/kopiguard key <clau> §7| §ftest §7| §falerts §7| §fstatus <jugador> §7| §freload",
            "§d[KopiGuard] §7Utilisation : §f/kopiguard key <clé> §7| §ftest §7| §falerts §7| §fstatus <joueur> §7| §freload");
        m("key_saved", "§d[KopiGuard] §aClave guardada. §7Compruébala con §f/kopiguard test",
            "§d[KopiGuard] §aKey saved. §7Check it with §f/kopiguard test",
            "§d[KopiGuard] §aClau desada. §7Comprova-la amb §f/kopiguard test",
            "§d[KopiGuard] §aClé enregistrée. §7Vérifie-la avec §f/kopiguard test");
        m("key_bad", "§d[KopiGuard] §cEsa clave no parece buena (empieza por kg_). Cópiala del panel → instancia → Protección.",
            "§d[KopiGuard] §cThat key doesn't look right (it starts with kg_). Copy it from the panel → instance → Protection.",
            "§d[KopiGuard] §cAquesta clau no sembla bona (comença per kg_). Copia-la del panel → instància → Protecció.",
            "§d[KopiGuard] §cCette clé ne semble pas bonne (elle commence par kg_). Copie-la depuis le panel → instance → Protection.");
        m("key_error", "§d[KopiGuard] §cNo se pudo guardar la clave: {error}", "§d[KopiGuard] §cCouldn't save the key: {error}",
            "§d[KopiGuard] §cNo s'ha pogut desar la clau: {error}", "§d[KopiGuard] §cImpossible d'enregistrer la clé : {error}");
        m("testing", "§d[KopiGuard] §7Preguntando al panel…", "§d[KopiGuard] §7Asking the panel…", "§d[KopiGuard] §7Preguntant al panel…", "§d[KopiGuard] §7Question au panel…");
        m("test_ok", "§d[KopiGuard] §aTodo bien: conectado a la instancia §f{instance}§a.", "§d[KopiGuard] §aAll good: connected to the instance §f{instance}§a.",
            "§d[KopiGuard] §aTot bé: connectat a la instància §f{instance}§a.", "§d[KopiGuard] §aTout va bien : connecté à l'instance §f{instance}§a.");
        m("test_off", "§d[KopiGuard] §eLa clave vale, pero KopiGuard está apagado en esa instancia. Actívalo en el panel → Protección.",
            "§d[KopiGuard] §eThe key works, but KopiGuard is off in that instance. Turn it on in the panel → Protection.",
            "§d[KopiGuard] §eLa clau val, però KopiGuard està apagat en aquesta instància. Activa'l al panel → Protecció.",
            "§d[KopiGuard] §eLa clé fonctionne, mais KopiGuard est désactivé dans cette instance. Active-le dans le panel → Protection.");
        m("test_bad", "§d[KopiGuard] §cLa clave no vale. Cópiala otra vez del panel → instancia → Protección.",
            "§d[KopiGuard] §cThe key isn't valid. Copy it again from the panel → instance → Protection.",
            "§d[KopiGuard] §cLa clau no val. Copia-la una altra vegada del panel → instància → Protecció.",
            "§d[KopiGuard] §cLa clé n'est pas valide. Copie-la à nouveau depuis le panel → instance → Protection.");
        m("test_nokey", "§d[KopiGuard] §cTodavía no hay clave: §f/kopiguard key <clave>", "§d[KopiGuard] §cNo key yet: §f/kopiguard key <key>",
            "§d[KopiGuard] §cEncara no hi ha clau: §f/kopiguard key <clau>", "§d[KopiGuard] §cPas encore de clé : §f/kopiguard key <clé>");
        m("test_fail", "§d[KopiGuard] §cNo se pudo hablar con el panel ({error}).", "§d[KopiGuard] §cCouldn't reach the panel ({error}).",
            "§d[KopiGuard] §cNo s'ha pogut parlar amb el panel ({error}).", "§d[KopiGuard] §cImpossible de joindre le panel ({error}).");
        m("alerts_on", "§d[KopiGuard] §aVerás los avisos en el chat.", "§d[KopiGuard] §aYou'll see alerts in chat.",
            "§d[KopiGuard] §aVeuràs els avisos al xat.", "§d[KopiGuard] §aTu verras les alertes dans le chat.");
        m("alerts_off", "§d[KopiGuard] §7Ya no verás los avisos en el chat.", "§d[KopiGuard] §7You won't see alerts in chat anymore.",
            "§d[KopiGuard] §7Ja no veuràs els avisos al xat.", "§d[KopiGuard] §7Tu ne verras plus les alertes dans le chat.");
        m("reloaded", "§d[KopiGuard] §aAjustes recargados.", "§d[KopiGuard] §aSettings reloaded.", "§d[KopiGuard] §aConfiguració recarregada.", "§d[KopiGuard] §aParamètres rechargés.");
        m("status", "§d[KopiGuard] §f{player}§7: {levels}", "§d[KopiGuard] §f{player}§7: {levels}", "§d[KopiGuard] §f{player}§7: {levels}", "§d[KopiGuard] §f{player}§7: {levels}");
        m("status_clean", "sin sospechas", "no suspicion", "sense sospites", "aucun soupçon");
        m("not_found", "§d[KopiGuard] §cEse jugador no está conectado.", "§d[KopiGuard] §cThat player isn't online.",
            "§d[KopiGuard] §cAquest jugador no està connectat.", "§d[KopiGuard] §cCe joueur n'est pas connecté.");
        m("players_only", "§d[KopiGuard] §cSolo desde el juego.", "§d[KopiGuard] §cIn-game only.", "§d[KopiGuard] §cNomés des del joc.", "§d[KopiGuard] §cSeulement en jeu.");
        m("no_perm", "§d[KopiGuard] §cNo tienes permiso.", "§d[KopiGuard] §cYou don't have permission.", "§d[KopiGuard] §cNo tens permís.", "§d[KopiGuard] §cTu n'as pas la permission.");
    }

    static String get(String lang, String key, String... vars) {
        String[] row = M.get(key);
        if (row == null) return key;
        int i = "en".equals(lang) ? 1 : "ca".equals(lang) ? 2 : "fr".equals(lang) ? 3 : 0;
        String s = row[i];
        for (int k = 0; k + 1 < vars.length; k += 2) s = s.replace("{" + vars[k] + "}", vars[k + 1]);
        return s;
    }
}
