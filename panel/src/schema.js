// Esquema de la base de datos. El servidor lo aplica solo al arrancar (sin comandos aparte).
// Para cambios futuros, añade otro elemento al final de MIGRATIONS (nunca edites los anteriores).
export const MIGRATIONS = [
  `-- Onyx Panel: esquema inicial (Cloudflare D1 / SQLite)
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
CREATE INDEX status_service ON status_checks(service, at)`
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
