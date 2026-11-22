// Esquema de la base de datos. El servidor lo aplica solo al arrancar (sin comandos aparte).
// Para cambios futuros, añade otro elemento al final de MIGRATIONS (nunca edites los anteriores).
export const MIGRATIONS = [
  `-- Kopi Panel: esquema inicial (Cloudflare D1 / SQLite)
CREATE TABLE users (
  id TEXT PRIMARY KEY,               -- id de Discord
  name TEXT NOT NULL,
  avatar TEXT,
  global_role TEXT NOT NULL DEFAULT 'user', -- 'creator' | 'user'
  created_at INTEGER NOT NULL,
  last_login INTEGER
);

CREATE TABLE sessions (
  token_hash TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  expires_at INTEGER NOT NULL
);
CREATE INDEX sessions_user ON sessions(user_id);

CREATE TABLE studios (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  logo TEXT,
  created_by TEXT,
  created_at INTEGER NOT NULL,
  deleted_at INTEGER
);

CREATE TABLE members (
  studio_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  role TEXT NOT NULL,                -- owner | admin | editor | viewer
  added_at INTEGER NOT NULL,
  PRIMARY KEY (studio_id, user_id)
);
CREATE INDEX members_user ON members(user_id);

CREATE TABLE invites (
  token TEXT PRIMARY KEY,
  studio_id TEXT,                    -- NULL: invitación para crear un studio nuevo (solo el Creador)
  studio_name TEXT,
  role TEXT NOT NULL,
  created_by TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  expires_at INTEGER NOT NULL,
  used_by TEXT,
  used_at INTEGER
);

CREATE TABLE instances (
  id TEXT PRIMARY KEY,
  studio_id TEXT NOT NULL,
  data TEXT NOT NULL,                -- JSON con todo lo editable
  state TEXT NOT NULL DEFAULT 'open',-- open | locked
  hidden INTEGER NOT NULL DEFAULT 0,
  created_by TEXT,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  deleted_at INTEGER
);
CREATE INDEX instances_studio ON instances(studio_id);

CREATE TABLE codes (
  code TEXT PRIMARY KEY,
  instance_id TEXT NOT NULL,
  max_uses INTEGER,                  -- NULL = ilimitados
  uses INTEGER NOT NULL DEFAULT 0,
  created_by TEXT,
  created_at INTEGER NOT NULL
);
CREATE INDEX codes_instance ON codes(instance_id);

CREATE TABLE access (
  instance_id TEXT NOT NULL,
  player_key TEXT NOT NULL,          -- nombre en minúsculas
  player_name TEXT NOT NULL,
  uuid TEXT,
  via TEXT NOT NULL,                 -- code | manual
  code TEXT,
  last_ip TEXT,
  created_at INTEGER NOT NULL,
  PRIMARY KEY (instance_id, player_key)
);

CREATE TABLE bans (
  scope TEXT NOT NULL,               -- 'studio:<id>' | 'instance:<id>'
  kind TEXT NOT NULL,                -- name | ip
  value TEXT NOT NULL,
  created_by TEXT,
  created_at INTEGER NOT NULL,
  PRIMARY KEY (scope, kind, value)
);

CREATE TABLE player_tokens (
  token_hash TEXT PRIMARY KEY,
  player_key TEXT NOT NULL,
  player_name TEXT NOT NULL,
  uuid TEXT,
  verified INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL,
  expires_at INTEGER NOT NULL
);

CREATE TABLE challenges (
  id TEXT PRIMARY KEY,
  created_at INTEGER NOT NULL
);

CREATE TABLE plays (
  id TEXT PRIMARY KEY,
  instance_id TEXT NOT NULL,
  studio_id TEXT NOT NULL,
  player_key TEXT NOT NULL,
  player_name TEXT NOT NULL,
  started_at INTEGER NOT NULL,
  last_seen INTEGER NOT NULL,
  ended_at INTEGER
);
CREATE INDEX plays_instance ON plays(instance_id, last_seen);
CREATE INDEX plays_studio ON plays(studio_id, started_at);

CREATE TABLE media (
  id TEXT PRIMARY KEY,
  studio_id TEXT NOT NULL,
  name TEXT NOT NULL,
  type TEXT NOT NULL,
  size INTEGER NOT NULL,
  sha1 TEXT,
  created_by TEXT,
  created_at INTEGER NOT NULL
);
CREATE INDEX media_studio ON media(studio_id);
`,
  `CREATE TABLE events (
  id TEXT PRIMARY KEY,
  studio_id TEXT NOT NULL,
  instance_id TEXT,
  title TEXT NOT NULL,
  category TEXT NOT NULL,
  color TEXT NOT NULL,
  description TEXT,
  image TEXT,
  starts_at INTEGER NOT NULL,
  ends_at INTEGER,
  public INTEGER NOT NULL DEFAULT 1,
  created_by TEXT,
  created_at INTEGER NOT NULL,
  deleted_at INTEGER
);
CREATE INDEX events_time ON events(starts_at);
CREATE TABLE referrals (
  player_key TEXT PRIMARY KEY,
  player_name TEXT NOT NULL,
  studio_id TEXT NOT NULL,
  created_at INTEGER NOT NULL
);
CREATE INDEX referrals_studio ON referrals(studio_id, created_at);
CREATE TABLE status_checks (
  service TEXT NOT NULL,
  at INTEGER NOT NULL,
  ok INTEGER NOT NULL,
  ms INTEGER
);
CREATE INDEX status_service ON status_checks(service, at)`,
  `-- Herramientas del Creador: suspender studios, límites, bloquear usuarios, actividad, avisos y ajustes
ALTER TABLE studios ADD COLUMN suspended_at INTEGER;
ALTER TABLE studios ADD COLUMN suspend_reason TEXT;
ALTER TABLE studios ADD COLUMN max_instances INTEGER;
ALTER TABLE studios ADD COLUMN max_storage_mb INTEGER;
ALTER TABLE studios ADD COLUMN note TEXT;
ALTER TABLE users ADD COLUMN blocked_at INTEGER;
CREATE TABLE audit (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  at INTEGER NOT NULL,
  user_id TEXT,
  user_name TEXT,
  studio_id TEXT,
  action TEXT NOT NULL,
  target TEXT,
  detail TEXT
);
CREATE INDEX audit_studio ON audit(studio_id, at);
CREATE INDEX audit_at ON audit(at);
CREATE TABLE notices (
  id TEXT PRIMARY KEY,
  studio_id TEXT,
  title TEXT NOT NULL,
  body TEXT,
  kind TEXT NOT NULL DEFAULT 'info',
  url TEXT,
  starts_at INTEGER NOT NULL,
  ends_at INTEGER,
  created_by TEXT,
  created_at INTEGER NOT NULL,
  deleted_at INTEGER
);
CREATE INDEX notices_time ON notices(starts_at);
CREATE TABLE settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
)`,
  `-- Launchers de marca (el launcher propio de un studio)
ALTER TABLE studios ADD COLUMN brand_allowed INTEGER NOT NULL DEFAULT 0;
CREATE TABLE brands (
  id TEXT PRIMARY KEY,
  studio_id TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  data TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  build_requested_at INTEGER,
  built_version TEXT
)`,
  `-- Kopi Skins: skins de los jugadores no premium (subidas desde el launcher) y caché de las premium
CREATE TABLE skins (
  name_key TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  owner_hash TEXT NOT NULL,
  png_hash TEXT NOT NULL,
  variant TEXT NOT NULL,
  value TEXT NOT NULL,
  signature TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);
CREATE TABLE skin_premium (
  name_key TEXT PRIMARY KEY,
  uuid TEXT,
  name TEXT,
  value TEXT,
  signature TEXT,
  fetched_at INTEGER NOT NULL
)`,
  `-- Capas de Kopi: qué capas tiene cada jugador y cuál lleva puesta
CREATE TABLE cape_owned (
  player_key TEXT NOT NULL,          -- nombre de Minecraft en minúsculas
  cape_id TEXT NOT NULL,
  player_name TEXT NOT NULL,
  source TEXT NOT NULL,              -- 'gift' (regalada desde el panel)
  granted_by TEXT,
  granted_by_name TEXT,
  created_at INTEGER NOT NULL,
  PRIMARY KEY (player_key, cape_id)
);
CREATE INDEX cape_owned_cape ON cape_owned(cape_id);
CREATE TABLE cape_worn (
  player_key TEXT PRIMARY KEY,
  player_name TEXT NOT NULL,
  cape_id TEXT NOT NULL,
  owner_hash TEXT,                   -- cuentas no premium: la clave secreta de su launcher (como la skin)
  updated_at INTEGER NOT NULL
)`,
  `-- KopiGuard: detecciones del anticheat (el launcher avisa mientras se juega)
CREATE TABLE guard_events (
  id TEXT PRIMARY KEY,
  studio_id TEXT NOT NULL,
  instance_id TEXT NOT NULL,
  play_id TEXT,
  player_key TEXT NOT NULL,
  player_name TEXT NOT NULL,
  type TEXT NOT NULL,                -- mod | pack | file | program
  severity TEXT NOT NULL,            -- high | medium | low
  detail TEXT NOT NULL,
  data TEXT,                         -- JSON: items, mods cargados, programa (nombre, ruta, huella)
  status TEXT NOT NULL DEFAULT 'new',-- new | reviewed | dismissed | sanctioned
  kicked INTEGER NOT NULL DEFAULT 0,
  handled_by TEXT,
  handled_at INTEGER,
  created_at INTEGER NOT NULL
);
CREATE INDEX guard_studio ON guard_events(studio_id, created_at);
CREATE INDEX guard_play ON guard_events(play_id);
CREATE INDEX guard_player ON guard_events(instance_id, player_key);
ALTER TABLE plays ADD COLUMN kick_reason TEXT`,
  `-- KopiGuard: captura y vídeo de cada detección (en MEDIA) y cámaras en directo
ALTER TABLE guard_events ADD COLUMN media TEXT;
CREATE TABLE guard_live (
  play_id TEXT PRIMARY KEY,
  studio_id TEXT NOT NULL,
  frame TEXT,                        -- última imagen del juego (JPEG en base64)
  hd INTEGER NOT NULL DEFAULT 0,
  none INTEGER NOT NULL DEFAULT 0,   -- 1: juego minimizado; 2: ese equipo no puede capturar
  at INTEGER,
  focus_at INTEGER                   -- alguien está mirando a este jugador en grande
);
CREATE INDEX guard_live_studio ON guard_live(studio_id);
CREATE TABLE guard_watch (studio_id TEXT PRIMARY KEY, at INTEGER NOT NULL)`,
  `-- KopiGuard: el plugin del servidor (movimiento y combate). Cada instancia tiene una clave para su servidor.
CREATE TABLE guard_keys (
  key TEXT PRIMARY KEY,
  instance_id TEXT NOT NULL UNIQUE,
  studio_id TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  used_at INTEGER
);
ALTER TABLE plays ADD COLUMN snap TEXT     -- detección del servidor que espera foto y vídeo del launcher`,
  `-- Uso del launcher (anónimo): cada instalación es un número al azar; país por Cloudflare, sin IP
CREATE TABLE installs (
  id TEXT PRIMARY KEY,
  first_at INTEGER NOT NULL,
  last_at INTEGER NOT NULL,
  country TEXT,
  version TEXT,
  platform TEXT,
  lang TEXT,
  brand TEXT,
  opens INTEGER NOT NULL DEFAULT 1
);
CREATE INDEX installs_first ON installs(first_at);
CREATE INDEX installs_last ON installs(last_at);
CREATE TABLE install_days (day INTEGER NOT NULL, id TEXT NOT NULL, PRIMARY KEY (day, id))`,
  // Directos: canales de Twitch, TikTok y Kick (de jugadores, o 'inst:<id>' = canal oficial de una instancia)
  `CREATE TABLE channels (
  owner TEXT NOT NULL,
  platform TEXT NOT NULL,
  handle TEXT NOT NULL,
  live INTEGER NOT NULL DEFAULT 0,
  title TEXT,
  viewers INTEGER,
  thumb TEXT,
  live_since INTEGER,
  manual_until INTEGER,
  checked_at INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (owner, platform)
);
CREATE INDEX channels_checked ON channels(checked_at)`,
  // Insignias: las del studio, las dadas a mano, cuándo se ganó cada una y la vitrina (3 favoritas)
  `CREATE TABLE studio_badges (
  id TEXT PRIMARY KEY,
  studio_id TEXT NOT NULL,
  name TEXT NOT NULL,
  description TEXT,
  rarity TEXT NOT NULL DEFAULT 'rare',
  data TEXT,
  created_by TEXT,
  created_at INTEGER NOT NULL,
  deleted_at INTEGER
);
CREATE INDEX studio_badges_studio ON studio_badges(studio_id);
CREATE TABLE badge_grants (
  badge_id TEXT NOT NULL,
  player_key TEXT NOT NULL,
  player_name TEXT NOT NULL,
  granted_by TEXT,
  granted_at INTEGER NOT NULL,
  PRIMARY KEY (badge_id, player_key)
);
CREATE INDEX badge_grants_player ON badge_grants(player_key);
CREATE TABLE player_badges (
  player_key TEXT NOT NULL,
  badge_id TEXT NOT NULL,
  earned_at INTEGER NOT NULL,
  PRIMARY KEY (player_key, badge_id)
);
CREATE INDEX player_badges_badge ON player_badges(badge_id);
CREATE TABLE player_showcase (
  player_key TEXT PRIMARY KEY,
  showcase TEXT NOT NULL,
  updated_at INTEGER NOT NULL
)`,
  // Perfil público en la web (onyxclient.site/u/<nombre>): solo si el jugador lo activa
  `CREATE TABLE player_public (
  player_key TEXT PRIMARY KEY,
  player_name TEXT NOT NULL,
  public INTEGER NOT NULL DEFAULT 0,
  updated_at INTEGER NOT NULL
)`,
  // Grupos de jugadores del studio (VIP, Testers…): dan acceso a las instancias que los eligen
  `CREATE TABLE player_groups (
  id TEXT PRIMARY KEY,
  studio_id TEXT NOT NULL,
  name TEXT NOT NULL,
  color TEXT,
  created_by TEXT,
  created_at INTEGER NOT NULL,
  deleted_at INTEGER
);
CREATE INDEX player_groups_studio ON player_groups(studio_id);
CREATE TABLE group_members (
  group_id TEXT NOT NULL,
  player_key TEXT NOT NULL,
  player_name TEXT NOT NULL,
  added_by TEXT,
  added_at INTEGER NOT NULL,
  PRIMARY KEY (group_id, player_key)
);
CREATE INDEX group_members_player ON group_members(player_key)`,
  // Reportes de jugadores (un jugador denuncia a otro desde el launcher; el staff lo ve en el panel)
  `CREATE TABLE player_reports (
  id TEXT PRIMARY KEY,
  studio_id TEXT NOT NULL,
  instance_id TEXT NOT NULL,
  play_id TEXT,
  reporter_key TEXT NOT NULL,
  reporter_name TEXT NOT NULL,
  target_key TEXT NOT NULL,
  target_name TEXT NOT NULL,
  reason TEXT NOT NULL,
  text TEXT,
  shot INTEGER,
  status TEXT NOT NULL DEFAULT 'new',
  note TEXT,
  handled_by TEXT,
  handled_at INTEGER,
  created_at INTEGER NOT NULL
);
CREATE INDEX player_reports_studio ON player_reports(studio_id, status, created_at);
CREATE INDEX player_reports_target ON player_reports(studio_id, target_key);
CREATE INDEX player_reports_reporter ON player_reports(reporter_key, created_at)`,
  // Rendimiento: el resumen de cada partida que manda el launcher (carga, memoria, PC y cierres)
  `CREATE TABLE play_perf (
  play_id TEXT PRIMARY KEY,
  instance_id TEXT NOT NULL,
  studio_id TEXT NOT NULL,
  player_key TEXT NOT NULL,
  at INTEGER NOT NULL,
  load_ms INTEGER,
  minutes INTEGER,
  mem_peak INTEGER,
  mem_avg INTEGER,
  mem_alloc INTEGER,
  mods INTEGER,
  perf_mode INTEGER,
  ram INTEGER,
  cpu TEXT,
  cores INTEGER,
  gpu TEXT,
  os TEXT,
  crash_kind TEXT,
  crash_mod TEXT
);
CREATE INDEX play_perf_instance ON play_perf(instance_id, at)`,
  // Cámaras en vídeo (WebRTC): el panel solo «presenta» al navegador del staff y al launcher del jugador.
  // offer = lo que propone el navegador; answer = lo que contesta el launcher. El vídeo va directo entre los dos.
  `CREATE TABLE guard_rtc (
  id TEXT PRIMARY KEY,
  play_id TEXT NOT NULL,
  studio_id TEXT NOT NULL,
  user_id TEXT,
  offer TEXT NOT NULL,
  answer TEXT,
  state TEXT NOT NULL DEFAULT 'new',
  created_at INTEGER NOT NULL,
  updated_at INTEGER
);
CREATE INDEX guard_rtc_play ON guard_rtc(play_id, state)`,
  // Fallos de conexión de los launchers (sin datos del jugador): web, error, país y compañía de internet
  `CREATE TABLE net_errors (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  at INTEGER NOT NULL,
  host TEXT NOT NULL,
  kind TEXT NOT NULL,
  chrome TEXT,
  node TEXT,
  version TEXT,
  os TEXT,
  country TEXT,
  isp TEXT
);
CREATE INDEX net_errors_at ON net_errors(at)`
];

export function statements(sql) {
  return sql.replace(/--[^\n]*/g, '').split(';').map(s => s.trim()).filter(Boolean);
}

let ready = null;
export function ensureSchema(DB) {
  if (!ready) ready = (async () => {
    await DB.prepare('CREATE TABLE IF NOT EXISTS _schema (version INTEGER NOT NULL)').run();
    const row = await DB.prepare('SELECT MAX(version) AS v FROM _schema').first();
    const current = (row && row.v) || 0;
    for (let i = current; i < MIGRATIONS.length; i++) {
      const stmts = statements(MIGRATIONS[i]).map(s => DB.prepare(s));
      stmts.push(DB.prepare('INSERT INTO _schema (version) VALUES (?)').bind(i + 1));
      await DB.batch(stmts);
    }
  })().catch((e) => { ready = null; throw e; });
  return ready;
}
