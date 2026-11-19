package site.onyxclient.kopiskins.velocity;

import com.google.inject.Inject;
import com.velocitypowered.api.event.EventTask;
import com.velocitypowered.api.event.PostOrder;
import com.velocitypowered.api.event.Subscribe;
import com.velocitypowered.api.event.player.GameProfileRequestEvent;
import com.velocitypowered.api.event.proxy.ProxyInitializeEvent;
import com.velocitypowered.api.plugin.Plugin;
import com.velocitypowered.api.plugin.annotation.DataDirectory;
import com.velocitypowered.api.util.GameProfile;
import org.slf4j.Logger;
import site.onyxclient.kopiskins.Settings;
import site.onyxclient.kopiskins.SkinService;

import java.nio.file.Path;
import java.util.ArrayList;
import java.util.List;

/**
 * Kopi Skins para Velocity. Se instala solo en el proxy: los servidores de detrás reciben la skin
 * con el reenvío de Velocity (modern forwarding).
 */
@Plugin(id = "kopiskins", name = "KopiSkins", version = SkinService.VERSION,
    description = "Las skins de los jugadores en servidores en modo offline (premium y Kopi Client).",
    url = "https://onyxclient.site", authors = {"Kopi Studio"})
public final class KopiSkinsVelocity {
    private final Logger logger;
    private final Path dataDir;
    private Settings settings;
    private SkinService skins;

    @Inject
    public KopiSkinsVelocity(Logger logger, @DataDirectory Path dataDir) {
        this.logger = logger;
        this.dataDir = dataDir;
    }

    @Subscribe
    public void onInit(ProxyInitializeEvent event) {
        settings = Settings.load(dataDir.toFile());
        skins = settings.service(logger::warn);
        logger.info("Kopi Skins {} activo (panel: {})", SkinService.VERSION, settings.panel);
    }

    @Subscribe(order = PostOrder.LATE)
    public EventTask onProfile(GameProfileRequestEvent event) {
        return EventTask.async(() -> {
            GameProfile profile = event.getGameProfile();
            List<GameProfile.Property> props = new ArrayList<>(profile.getProperties());
            boolean has = props.stream().anyMatch(p -> "textures".equals(p.getName()));
            if (has && settings.keepExisting) return;
            SkinService.Skin skin = skins.get(event.getUsername());
            if (skin == null) return;
            props.removeIf(p -> "textures".equals(p.getName()));
            props.add(new GameProfile.Property("textures", skin.value, skin.signature));
            event.setGameProfile(profile.withProperties(props));
        });
    }
}
