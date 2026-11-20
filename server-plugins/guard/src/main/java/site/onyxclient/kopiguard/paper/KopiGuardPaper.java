package site.onyxclient.kopiguard.paper;

import java.util.LinkedHashMap;
import java.util.Locale;
import java.util.Map;
import java.util.Set;
import java.util.UUID;
import java.util.concurrent.ConcurrentHashMap;

import org.bukkit.Bukkit;
import org.bukkit.GameMode;
import org.bukkit.Location;
import org.bukkit.World;
import org.bukkit.block.Block;
import org.bukkit.block.data.BlockData;
import org.bukkit.block.data.Waterlogged;
import org.bukkit.command.Command;
import org.bukkit.command.CommandSender;
import org.bukkit.enchantments.Enchantment;
import org.bukkit.entity.Entity;
import org.bukkit.entity.LivingEntity;
import org.bukkit.entity.Player;
import org.bukkit.event.EventHandler;
import org.bukkit.event.EventPriority;
import org.bukkit.event.Listener;
import org.bukkit.event.block.Action;
import org.bukkit.event.block.BlockExplodeEvent;
import org.bukkit.event.entity.EntityDamageByEntityEvent;
import org.bukkit.event.entity.EntityDamageEvent;
import org.bukkit.event.entity.EntityExplodeEvent;
import org.bukkit.event.entity.ProjectileHitEvent;
import org.bukkit.event.entity.ProjectileLaunchEvent;
import org.bukkit.event.player.PlayerChangedWorldEvent;
import org.bukkit.event.player.PlayerInteractEvent;
import org.bukkit.event.player.PlayerJoinEvent;
import org.bukkit.event.player.PlayerMoveEvent;
import org.bukkit.event.player.PlayerQuitEvent;
import org.bukkit.event.player.PlayerRespawnEvent;
import org.bukkit.event.player.PlayerTeleportEvent;
import org.bukkit.event.player.PlayerVelocityEvent;
import org.bukkit.inventory.ItemStack;
import org.bukkit.plugin.java.JavaPlugin;
import org.bukkit.potion.PotionEffect;
import org.bukkit.util.BoundingBox;
import org.bukkit.util.Vector;

import site.onyxclient.kopiguard.core.Engine;
import site.onyxclient.kopiguard.core.Flag;
import site.onyxclient.kopiguard.core.MoveInput;
import site.onyxclient.kopiguard.core.PlayerState;

/**
 * KopiGuard para Paper, Purpur, Folia y Arclight (1.16.5 o más nuevo).
 * Vigila movimiento y combate; los avisos van al panel de Kopi (página KopiGuard) y al chat del staff.
 * Si el jugador usa Kopi Client, el launcher manda foto y vídeo del momento.
 */
public final class KopiGuardPaper extends JavaPlugin implements Listener {
    public static final String VERSION = "1.0.0";
    private static final String[] CHECKS = {"fly", "speed", "reach", "cps", "aura"};

    private final Map<UUID, PlayerState> states = new ConcurrentHashMap<>();
    private final Map<UUID, Location> safe = new ConcurrentHashMap<>();
    private final Set<UUID> muted = ConcurrentHashMap.newKeySet();
    private final Engine engine = new Engine();
    private volatile Settings settings;
    private Reporter reporter;

    @Override
    public void onEnable() {
        settings = Settings.load(getDataFolder());
        apply();
        reporter = new Reporter(getLogger(), settings);
        getServer().getPluginManager().registerEvents(this, this);
        getLogger().info("KopiGuard " + VERSION + (settings.key.isEmpty() ? " — falta la clave: kopiguard key <clave>" : " — listo"));
    }

    @Override
    public void onDisable() {
        if (reporter != null) reporter.shutdown();
    }

    private void apply() {
        engine.sensitivity = settings.sensitivity;
        engine.maxReach = settings.maxReach;
        engine.maxCps = settings.maxCps;
    }

    private PlayerState st(Player p) { return states.computeIfAbsent(p.getUniqueId(), k -> new PlayerState()); }
    private String msg(String key, String... vars) { return Messages.get(settings.language, key, vars); }

    private static boolean judged(Player p) {
        GameMode g = p.getGameMode();
        return (g == GameMode.SURVIVAL || g == GameMode.ADVENTURE) && !p.hasPermission("kopiguard.bypass");
    }

    // ---------------------------------------------------------------- lo que no cuenta
    @EventHandler(priority = EventPriority.MONITOR, ignoreCancelled = true)
    public void onVelocity(PlayerVelocityEvent e) { // empujones, golpes, explosiones, lanzadores…
        double v = e.getVelocity().length();
        st(e.getPlayer()).exempt(System.currentTimeMillis(), 1500 + (long) (v * 1500), "empujón");
    }

    @EventHandler(priority = EventPriority.MONITOR, ignoreCancelled = true)
    public void onDamage(EntityDamageEvent e) {
        if (!(e.getEntity() instanceof Player)) return;
        String c = e.getCause().name();
        long ms = c.contains("EXPLOSION") ? 4000 : c.contains("ENTITY") || c.contains("PROJECTILE") ? 1500 : 0;
        if (ms > 0) st((Player) e.getEntity()).exempt(System.currentTimeMillis(), ms, "golpe");
    }

    private void exemptAround(Location at, double r, long ms, String why) {
        if (at == null || at.getWorld() == null) return;
        for (Entity en : at.getWorld().getNearbyEntities(at, r, r, r)) {
            if (en instanceof Player) st((Player) en).exempt(System.currentTimeMillis(), ms, why);
        }
    }

    @EventHandler(priority = EventPriority.MONITOR, ignoreCancelled = true)
    public void onExplode(EntityExplodeEvent e) { exemptAround(e.getLocation(), 8, 4000, "explosión"); }

    @EventHandler(priority = EventPriority.MONITOR, ignoreCancelled = true)
    public void onBlockExplode(BlockExplodeEvent e) { exemptAround(e.getBlock().getLocation(), 8, 4000, "explosión"); }

    private static boolean windCharge(Entity en) { return en != null && en.getType().name().contains("WIND_CHARGE"); }

    @EventHandler(priority = EventPriority.MONITOR, ignoreCancelled = true)
    public void onLaunch(ProjectileLaunchEvent e) {
        if (windCharge(e.getEntity()) && e.getEntity().getShooter() instanceof Player) st((Player) e.getEntity().getShooter()).exempt(System.currentTimeMillis(), 4000, "carga de viento");
    }

    @EventHandler(priority = EventPriority.MONITOR)
    public void onHit(ProjectileHitEvent e) {
        if (windCharge(e.getEntity())) exemptAround(e.getEntity().getLocation(), 6, 4000, "carga de viento");
    }

    @EventHandler(priority = EventPriority.MONITOR, ignoreCancelled = true)
    public void onTeleport(PlayerTeleportEvent e) { st(e.getPlayer()).exempt(System.currentTimeMillis(), 2000, "teletransporte"); safe.remove(e.getPlayer().getUniqueId()); }

    @EventHandler(priority = EventPriority.MONITOR)
    public void onRespawn(PlayerRespawnEvent e) { st(e.getPlayer()).exempt(System.currentTimeMillis(), 3000, "reaparece"); safe.remove(e.getPlayer().getUniqueId()); }

    @EventHandler(priority = EventPriority.MONITOR)
    public void onWorld(PlayerChangedWorldEvent e) { st(e.getPlayer()).exempt(System.currentTimeMillis(), 3000, "cambia de mundo"); safe.remove(e.getPlayer().getUniqueId()); }

    @EventHandler(priority = EventPriority.MONITOR)
    public void onJoin(PlayerJoinEvent e) { st(e.getPlayer()).exempt(System.currentTimeMillis(), 5000, "entra"); }

    @EventHandler(priority = EventPriority.MONITOR)
    public void onQuit(PlayerQuitEvent e) {
        UUID id = e.getPlayer().getUniqueId();
        states.remove(id);
        safe.remove(id);
    }

    // ---------------------------------------------------------------- movimiento
    @EventHandler(priority = EventPriority.HIGH, ignoreCancelled = true)
    public void onMove(PlayerMoveEvent e) {
        Location from = e.getFrom(), to = e.getTo();
        if (to == null || from.getWorld() != to.getWorld()) return;
        if (from.getX() == to.getX() && from.getY() == to.getY() && from.getZ() == to.getZ()) return; // solo gira la cabeza
        Player p = e.getPlayer();
        if (!settings.fly && !settings.speed) return;
        PlayerState st = st(p);
        MoveInput in = new MoveInput();
        in.now = System.currentTimeMillis();
        in.fromX = from.getX(); in.fromY = from.getY(); in.fromZ = from.getZ();
        in.toX = to.getX(); in.toY = to.getY(); in.toZ = to.getZ();
        in.flyAllowed = !judged(p) || p.getAllowFlight() || p.isFlying();
        in.inVehicle = p.isInsideVehicle();
        in.gliding = p.isGliding();
        in.riptiding = p.isRiptiding();
        World w = to.getWorld();
        Block feet = w.getBlockAt(to.getBlockX(), to.getBlockY(), to.getBlockZ());
        Block head = feet.getRelative(0, 1, 0);
        Block below = w.getBlockAt(to.getBlockX(), (int) Math.floor(to.getY() - 0.5), to.getBlockZ());
        in.inLiquid = liquid(feet) || liquid(head) || liquid(below) && to.getY() - Math.floor(to.getY()) < 0.2;
        in.climbing = climbable(feet) || climbable(head);
        String under = below.getType().name();
        in.onBouncy = under.contains("SLIME") || under.contains("HONEY") || under.endsWith("_BED") || under.equals("BED_BLOCK");
        in.onIce = under.contains("ICE");
        in.soulSpeed = (under.contains("SOUL_SAND") || under.contains("SOUL_SOIL")) && soulSpeedBoots(p);
        in.nearGround = nearGround(to, w) || standingOnEntity(p);
        for (PotionEffect pe : p.getActivePotionEffects()) {
            String n = (pe.getType().toString() + " " + pe.getType().getName()).toLowerCase(Locale.ROOT);
            int lvl = pe.getAmplifier() + 1;
            if (n.contains("jump")) in.jumpLevel = Math.max(in.jumpLevel, lvl);
            else if (n.contains("speed")) in.speedLevel = Math.max(in.speedLevel, lvl);
            else if (n.contains("levitation")) in.levitation = true;
            else if (n.contains("slow_falling")) in.slowFalling = true;
            else if (n.contains("dolphin")) in.dolphin = true;
        }
        in.ping = ping(p);
        in.tps = tps();

        Flag f = engine.move(st, in);
        if (f != null && (("fly".equals(f.check) && settings.fly) || ("speed".equals(f.check) && settings.speed))) {
            handle(p, f);
            Location back = safe.get(p.getUniqueId());
            if (f.setback && settings.setback && back != null && back.getWorld() == to.getWorld()) {
                Location b = back.clone();
                b.setYaw(to.getYaw());
                b.setPitch(to.getPitch());
                e.setTo(b);
            }
        } else if (in.nearGround && !in.inVehicle) {
            safe.put(p.getUniqueId(), to.clone());
        }
    }

    private static boolean liquid(Block b) {
        if (b.isLiquid()) return true;
        String n = b.getType().name();
        if (n.contains("WATER") || n.contains("LAVA") || n.contains("BUBBLE_COLUMN") || n.contains("KELP") || n.contains("SEAGRASS")) return true;
        BlockData d = b.getBlockData();
        return d instanceof Waterlogged && ((Waterlogged) d).isWaterlogged();
    }

    private static boolean climbable(Block b) {
        String n = b.getType().name();
        return n.contains("LADDER") || n.contains("VINE") || n.contains("SCAFFOLDING") || n.contains("COBWEB") || n.equals("WEB")
            || n.contains("POWDER_SNOW") || n.contains("SWEET_BERRY");
    }

    /** ¿Hay algo sólido justo debajo de los pies? (lo mira el servidor: el cliente podría mentir) */
    private static boolean nearGround(Location at, World w) {
        double[] off = {-0.3, 0, 0.3};
        double[] dy = {-0.001, -0.5};
        for (double oy : dy) for (double ox : off) for (double oz : off) {
            Block b = w.getBlockAt((int) Math.floor(at.getX() + ox), (int) Math.floor(at.getY() + oy), (int) Math.floor(at.getZ() + oz));
            if (!b.isPassable()) return true;
        }
        return false;
    }

    /** De pie sobre un barco, una vagoneta o un shulker. */
    private static boolean standingOnEntity(Player p) {
        for (Entity en : p.getNearbyEntities(0.8, 1.2, 0.8)) {
            String n = en.getType().name();
            if (n.contains("BOAT") || n.contains("RAFT") || n.contains("MINECART") || (n.contains("SHULKER") && !n.contains("BULLET"))) return true;
        }
        return false;
    }

    private static boolean soulSpeedBoots(Player p) {
        ItemStack boots = p.getInventory().getBoots();
        if (boots == null) return false;
        for (Enchantment en : boots.getEnchantments().keySet()) if (en.getKey().getKey().contains("soul_speed")) return true;
        return false;
    }

    private static int ping(Player p) {
        try { return (Integer) Player.class.getMethod("getPing").invoke(p); } catch (Throwable ignored) { }
        try {
            Object spigot = p.getClass().getMethod("spigot").invoke(p);
            return (Integer) spigot.getClass().getMethod("getPing").invoke(spigot);
        } catch (Throwable ignored) { return 0; }
    }

    private static double tps() {
        try { return Math.min(20, Bukkit.getTPS()[0]); } catch (Throwable ignored) { return 20; } // Folia/otros: sin dato
    }

    // ---------------------------------------------------------------- combate
    @EventHandler(priority = EventPriority.MONITOR)
    public void onAttack(EntityDamageByEntityEvent e) {
        if (!(e.getDamager() instanceof Player) || !(e.getEntity() instanceof LivingEntity)) return;
        if (e.getCause() != EntityDamageEvent.DamageCause.ENTITY_ATTACK) return; // el barrido de la espada no cuenta
        Player p = (Player) e.getDamager();
        if (!judged(p)) return;
        PlayerState st = st(p);
        long now = System.currentTimeMillis();
        double tps = tps();
        if (settings.cps) { Flag c = engine.click(st, now, tps); if (c != null) handle(p, c); }
        if (!settings.reach && !settings.aura) return;
        Location eye = p.getEyeLocation();
        BoundingBox box = e.getEntity().getBoundingBox();
        Vector toTarget = box.getCenter().subtract(eye.toVector());
        double angle = toTarget.lengthSquared() < 1e-6 ? 0 : Math.toDegrees(eye.getDirection().angle(toTarget));
        Flag f = engine.attack(st, now, e.getEntity().getEntityId(), new double[]{eye.getX(), eye.getY(), eye.getZ()},
            new double[]{box.getMinX(), box.getMinY(), box.getMinZ(), box.getMaxX(), box.getMaxY(), box.getMaxZ()}, angle, ping(p), tps);
        if (f != null && (("reach".equals(f.check) && settings.reach) || ("aura".equals(f.check) && settings.aura))) handle(p, f);
    }

    @EventHandler(priority = EventPriority.MONITOR)
    public void onClick(PlayerInteractEvent e) {
        // Solo clics al aire: romper bloques muy rápido (eficiencia + prisa) no es un autoclicker
        if (e.getAction() != Action.LEFT_CLICK_AIR || !settings.cps || !judged(e.getPlayer())) return;
        Flag f = engine.click(st(e.getPlayer()), System.currentTimeMillis(), tps());
        if (f != null) handle(e.getPlayer(), f);
    }

    // ---------------------------------------------------------------- avisos
    private void handle(Player p, Flag f) {
        if (!f.report) return;
        String vl = String.valueOf(Math.round(f.vl));
        getLogger().info("[" + p.getName() + "] " + f);
        if (settings.alerts) {
            String line = msg("alert", "player", p.getName(), "check", msg(f.check), "detail", f.detail, "vl", vl);
            for (Player staff : Bukkit.getOnlinePlayers()) {
                if (staff.hasPermission("kopiguard.alerts") && !muted.contains(staff.getUniqueId())) staff.sendMessage(line);
            }
        }
        Location l = p.getLocation();
        Map<String, Object> data = new LinkedHashMap<>();
        data.put("vl", f.vl);
        data.put("ping", ping(p));
        data.put("tps", tps());
        data.put("world", l.getWorld() == null ? "" : l.getWorld().getName());
        data.put("x", l.getX());
        data.put("y", l.getY());
        data.put("z", l.getZ());
        if (f.info != null) data.put("info", f.info);
        reporter.report(p.getName(), p.getUniqueId().toString(), f.check, f.detail, f.severity, data);
    }

    // ---------------------------------------------------------------- /kopiguard
    @Override
    public boolean onCommand(CommandSender s, Command cmd, String label, String[] a) {
        String sub = a.length > 0 ? a[0].toLowerCase(Locale.ROOT) : "";
        if (sub.equals("alerts")) {
            if (!(s instanceof Player)) { s.sendMessage(msg("players_only")); return true; }
            if (!s.hasPermission("kopiguard.alerts")) { s.sendMessage(msg("no_perm")); return true; }
            UUID id = ((Player) s).getUniqueId();
            if (muted.remove(id)) s.sendMessage(msg("alerts_on"));
            else { muted.add(id); s.sendMessage(msg("alerts_off")); }
            return true;
        }
        if (!s.hasPermission("kopiguard.admin")) { s.sendMessage(msg("no_perm")); return true; }
        switch (sub) {
            case "key": {
                String k = a.length > 1 ? a[1].trim() : "";
                if (!k.matches("kg_[A-Za-z0-9_-]{20,64}")) { s.sendMessage(msg("key_bad")); return true; }
                try {
                    Settings.set(getDataFolder(), "key", k);
                    reload();
                    s.sendMessage(msg("key_saved"));
                } catch (Exception ex) {
                    s.sendMessage(msg("key_error", "error", String.valueOf(ex.getMessage())));
                }
                return true;
            }
            case "test": {
                if (settings.key.isEmpty()) { s.sendMessage(msg("test_nokey")); return true; }
                s.sendMessage(msg("testing"));
                reporter.ping(ans -> {
                    String body = ans.body == null ? "" : ans.body;
                    if (ans.status == 200 && body.contains("\"off\"")) s.sendMessage(msg("test_off"));
                    else if (ans.status == 200) {
                        java.util.regex.Matcher m = java.util.regex.Pattern.compile("\"instance\"\\s*:\\s*\"([^\"]*)\"").matcher(body);
                        s.sendMessage(msg("test_ok", "instance", m.find() ? m.group(1) : "?"));
                    } else if (ans.status == 401) s.sendMessage(msg("test_bad"));
                    else s.sendMessage(msg("test_fail", "error", ans.status == 0 ? body : "HTTP " + ans.status));
                });
                return true;
            }
            case "reload":
                reload();
                s.sendMessage(msg("reloaded"));
                return true;
            case "status": {
                Player t = a.length > 1 ? Bukkit.getPlayerExact(a[1]) : null;
                if (t == null) { s.sendMessage(msg("not_found")); return true; }
                PlayerState st = states.get(t.getUniqueId());
                StringBuilder sb = new StringBuilder();
                long now = System.currentTimeMillis();
                for (String c : CHECKS) {
                    double v = st == null ? 0 : Engine.level(st, c, now);
                    if (v >= 0.5) sb.append(sb.length() > 0 ? ", " : "").append(msg(c)).append(' ').append(Math.round(v));
                }
                s.sendMessage(msg("status", "player", t.getName(), "levels", sb.length() > 0 ? sb.toString() : msg("status_clean")));
                return true;
            }
            default:
                s.sendMessage(msg("usage"));
                return true;
        }
    }

    private void reload() {
        settings = Settings.load(getDataFolder());
        apply();
        reporter.settings(settings);
    }
}
