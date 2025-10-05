import Database from 'better-sqlite3';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import fs from 'node:fs';
import { logger } from './logger.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '../../../../');
const dbPath = process.env.POE_COACH_DB ?? path.join(root, 'db', 'craftcoach.db');

fs.mkdirSync(path.dirname(dbPath), { recursive: true });

export const db = new Database(dbPath);

db.pragma('journal_mode = WAL');

db.exec(`
CREATE TABLE IF NOT EXISTS metadata (
  key TEXT PRIMARY KEY,
  value TEXT
);

CREATE TABLE IF NOT EXISTS mods (
  id TEXT PRIMARY KEY,
  base TEXT,
  type TEXT,
  domain TEXT,
  generation_type TEXT,
  full_text TEXT,
  group_id TEXT,
  spawn_weights_json TEXT,
  tags_json TEXT
);
CREATE INDEX IF NOT EXISTS idx_mods_base ON mods(base);
CREATE INDEX IF NOT EXISTS idx_mods_group ON mods(group_id);

CREATE TABLE IF NOT EXISTS mod_groups (
  id TEXT PRIMARY KEY,
  label TEXT,
  type TEXT
);

CREATE TABLE IF NOT EXISTS tags (
  id TEXT PRIMARY KEY,
  description TEXT
);

CREATE TABLE IF NOT EXISTS bases (
  id TEXT PRIMARY KEY,
  name TEXT,
  tags_json TEXT
);

CREATE TABLE IF NOT EXISTS passive_tree (
  id INTEGER PRIMARY KEY,
  version TEXT,
  json TEXT,
  fetched_at TEXT DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS trade_static (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  payload TEXT,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS trade_stats (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  payload TEXT,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS prices_ninja (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  item TEXT,
  league TEXT,
  chaos_value REAL,
  divine_value REAL,
  payload TEXT,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_prices_ninja_item_league ON prices_ninja(item, league);

CREATE TABLE IF NOT EXISTS prices_watch (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  item TEXT,
  league TEXT,
  chaos_value REAL,
  divine_value REAL,
  payload TEXT,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_prices_watch_item_league ON prices_watch(item, league);

CREATE TABLE IF NOT EXISTS pob_build_cache (
  pob_hash TEXT PRIMARY KEY,
  payload TEXT,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP
);
`);

logger.info({ dbPath }, 'SQLite database initialized');
