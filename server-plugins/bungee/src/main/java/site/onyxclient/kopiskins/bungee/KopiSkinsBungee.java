package site.onyxclient.kopiskins.bungee;

import net.md_5.bungee.api.connection.PendingConnection;
import net.md_5.bungee.api.event.LoginEvent;
import net.md_5.bungee.api.plugin.Listener;
import net.md_5.bungee.api.plugin.Plugin;
import net.md_5.bungee.event.EventHandler;
import net.md_5.bungee.event.EventPriority;
import site.onyxclient.kopiskins.Settings;
import site.onyxclient.kopiskins.SkinService;

import java.lang.reflect.Array;
import java.lang.reflect.Field;
import java.lang.reflect.Method;

/**
 * Kopi Skins para BungeeCord y Waterfall. Se instala solo en el proxy.
 * BungeeCord no tiene una forma oficial de cambiar el perfil, así que se usa la misma técnica que
 * los plugins de skins conocidos (reflexión sobre el LoginResult de la conexión).
 */
public final class KopiSkinsBungee extends Plugin implements Listener {
    private Settings settings;
    private SkinService skins;

    @Override
    public void onEnable() {
        settings = Settings.load(getDataFolder());
        skins = settings.service(msg -> getLogger().warning(msg));
        getProxy().getPluginManager().registerListener(this, this);
        getLogger().info("Kopi Skins " + SkinService.VERSION + " activo (panel: " + settings.panel + ")");
    }

    @EventHandler(priority = EventPriority.HIGH)
    public void onLogin(final LoginEvent event) {
        if (event.isCancelled()) return;
        event.registerIntent(this);
        getProxy().getScheduler().runAsync(this, () -> {
            try {
                apply(event.getConnection());
            } catch (Throwable t) {
                getLogger().warning("No se pudo poner la skin de " + event.getConnection().getName() + ": " + t);
            } finally {
                event.completeIntent(this);
            }
        });
    }

    private void apply(PendingConnection conn) throws Exception {
        Field f = findField(conn.getClass(), "loginProfile");
        Object result = f.get(conn);
        if (result != null && settings.keepExisting && hasTextures(result)) return;
        SkinService.Skin skin = skins.get(conn.getName());
        if (skin == null) return;

        Class<?> propClass = propertyClass();
        Object prop = propClass.getConstructor(String.class, String.class, String.class).newInstance("textures", skin.value, skin.signature);
        Object props = Array.newInstance(propClass, 1);
        Array.set(props, 0, prop);

        if (result == null) {
            // Modo offline: no hay perfil todavía, se crea uno con la skin
            Class<?> lr = Class.forName("net.md_5.bungee.connection.LoginResult");
            String id = conn.getUniqueId() != null ? conn.getUniqueId().toString().replace("-", "") : null;
            result = lr.getConstructor(String.class, String.class, props.getClass()).newInstance(id, conn.getName(), props);
            f.set(conn, result);
        } else {
            Method set = result.getClass().getMethod("setProperties", props.getClass());
            set.invoke(result, props);
        }
    }

    private static boolean hasTextures(Object result) throws Exception {
        Object arr = result.getClass().getMethod("getProperties").invoke(result);
        if (arr == null) return false;
        for (int i = 0; i < Array.getLength(arr); i++) {
            Object p = Array.get(arr, i);
            if ("textures".equals(p.getClass().getMethod("getName").invoke(p))) return true;
        }
        return false;
    }

    // La clase Property cambió de sitio entre versiones de BungeeCord
    private static Class<?> propertyClass() throws ClassNotFoundException {
        String[] names = {"net.md_5.bungee.protocol.data.Property", "net.md_5.bungee.protocol.Property", "net.md_5.bungee.connection.LoginResult$Property"};
        for (String n : names) {
            try { return Class.forName(n); } catch (ClassNotFoundException ignored) { }
        }
        throw new ClassNotFoundException("Property");
    }

    private static Field findField(Class<?> c, String name) throws NoSuchFieldException {
        for (Class<?> k = c; k != null; k = k.getSuperclass()) {
            try {
                Field f = k.getDeclaredField(name);
                f.setAccessible(true);
                return f;
            } catch (NoSuchFieldException ignored) { }
        }
        throw new NoSuchFieldException(name);
    }
}
