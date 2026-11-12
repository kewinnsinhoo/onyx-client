// Simulación local de Cloudflare D1 (sobre node:sqlite) y KV (en memoria). Solo para pruebas.
import { DatabaseSync } from 'node:sqlite';

const val = (v) => (v === undefined ? null : typeof v === 'boolean' ? (v ? 1 : 0) : v);

class Stmt {
  constructor(db, sql, args = []) { this.db = db; this.sql = sql; this.args = args; }
  bind(...args) { return new Stmt(this.db, this.sql, args.map(val)); }
  async first(col) { const r = this.db.prepare(this.sql).get(...this.args); return r === undefined ? null : col ? r[col] : { ...r }; }
  async all() { return { results: this.db.prepare(this.sql).all(...this.args).map(r => ({ ...r })), success: true }; }
  async run() { const r = this.db.prepare(this.sql).run(...this.args); return { success: true, meta: { changes: r.changes } }; }
}

export function makeD1(file = ':memory:') {
  const db = new DatabaseSync(file);
  return {
    raw: db,
    prepare: (sql) => new Stmt(db, sql),
    async batch(stmts) {
      db.exec('BEGIN');
      try { const out = []; for (const s of stmts) out.push(await s.run()); db.exec('COMMIT'); return out; }
      catch (e) { db.exec('ROLLBACK'); throw e; }
    },
    async exec(sql) { db.exec(sql); }
  };
}

export function makeKV() {
  const m = new Map();
  return {
    async put(k, v, opts = {}) { m.set(k, { v: Buffer.from(v), meta: opts.metadata || null }); },
    async get(k) { const e = m.get(k); return e ? e.v : null; },
    async getWithMetadata(k) { const e = m.get(k); return e ? { value: new Uint8Array(e.v), metadata: e.meta } : { value: null, metadata: null }; },
    async delete(k) { m.delete(k); },
    _map: m
  };
}
