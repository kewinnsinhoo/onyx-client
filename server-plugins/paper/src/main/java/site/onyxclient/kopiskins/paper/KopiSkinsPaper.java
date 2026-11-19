package site.onyxclient.kopiskins.paper;

import com.destroystokyo.paper.profile.PlayerProfile;
import com.destroystokyo.paper.profile.ProfileProperty;
import org.bukkit.command.Command;
import org.bukkit.command.CommandSender;
import org.bukkit.event.EventHandler;
import org.bukkit.event.EventPriority;
import org.bukkit.event.Listener;
import org.bukkit.event.player.AsyncPlayerPreLoginEvent;
import org.bukkit.plugin.java.JavaPlugin;
import site.onyxclient.kopiskins.Settings;
import site.onyxclient.kopiskins.SkinService;

/**
 * Kopi Skins para Paper, Purpur y Folia (1.16.5 o más nuevo).
 * Antes de que el jugador entre, le pone su skin en el perfil: así todos la ven desde el primer momento.
 */
public final class KopiSkinsPaper extends JavaPlugin implements Listener {
    private Settings settings;
    private SkinService skins;

    @Override
    public void onEnable() {
        try {
            Class.forName("com.destroystokyo.paper.profile.PlayerProfile");
        } catch (ClassNotFoundException e) {
            getLogger().severe("Kopi Skins necesita Paper (o Purpur/Folia). En Spigot no puede cambiar las skins.");
            getServer().getPluginManager().disablePlugin(this);
            return;
        }
        load();
        getServer().getPluginManager().registerEvents(this, this);
        getLogger().info("Kopi Skins " + SkinService.VERSION + " activo (panel: " + settings.panel + ")");
    }

    private void load() {
        settings = Settings.load(getDataFolder());
        skins = settings.service(msg -> getLogger().warning(msg));
    }

    @EventHandler(priority = EventPriority.HIGH)
    public void onPreLogin(AsyncPlayerPreLoginEvent event) {
        if (event.getLoginResult() != AsyncPlayerPreLoginEvent.Result.ALLOWED) return;
        PlayerProfile profile = event.getPlayerProfile();
        if (settings.keepExisting) {
            for (ProfileProperty p : profile.getProperties()) {
                if ("textures".equals(p.getName())) return; // ya trae skin
            }
        }
        SkinService.Skin skin = skins.get(event.getName());
        if (skin == null) return;
        profile.setProperty(new ProfileProperty("textures", skin.value, skin.signature));
        event.setPlayerProfile(profile);
    }

    @Override
    public boolean onCommand(CommandSender sender, Command command, String label, String[] args) {
        // /kopiskins reload  ·  /kopiskins refresh <jugador>
        if (args.length >= 1 && args[0].equalsIgnoreCase("reload")) {
            load();
            sender.sendMessage("§dKopi Skins: ajustes recargados.");
            return true;
        }
        if (args.length >= 2 && args[0].equalsIgnoreCase("refresh")) {
            skins.forget(args[1]);
            sender.sendMessage("§dKopi Skins: la skin de " + args[1] + " se pedirá otra vez la próxima vez que entre.");
            return true;
        }
        sender.sendMessage("§dKopi Skins " + SkinService.VERSION + "§7 · /kopiskins reload · /kopiskins refresh <jugador>");
        return true;
    }
}
