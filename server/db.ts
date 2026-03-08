import Database from 'better-sqlite3'
import path from 'path'
import fs from 'fs'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const DATA_DIR = path.join(__dirname, '..', 'data')

if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true })
}

const db = new Database(path.join(DATA_DIR, 'panel.db'))

db.pragma('journal_mode = WAL')
db.pragma('foreign_keys = ON')

db.exec(`
  CREATE TABLE IF NOT EXISTS topologies (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    created_at TEXT DEFAULT (datetime('now')),
    updated_at TEXT DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS topology_state (
    topology_id TEXT PRIMARY KEY REFERENCES topologies(id) ON DELETE CASCADE,
    state TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS health_results (
    device_id TEXT NOT NULL,
    topology_id TEXT NOT NULL,
    status TEXT NOT NULL,
    latency INTEGER,
    error TEXT,
    metrics TEXT,
    checked_at TEXT DEFAULT (datetime('now')),
    PRIMARY KEY (device_id, topology_id)
  );
`)

// Migration: add metrics column if missing
try {
  db.exec(`ALTER TABLE health_results ADD COLUMN metrics TEXT`)
} catch {
  // column already exists
}

export interface TopologyRow {
  id: string
  name: string
  created_at: string
  updated_at: string
}

export interface TopologyStateRow {
  topology_id: string
  state: string
}

export const listTopologies = db.prepare<[], TopologyRow>(
  'SELECT id, name, created_at, updated_at FROM topologies ORDER BY updated_at DESC'
)

export const getTopology = db.prepare<[string], TopologyRow>(
  'SELECT id, name, created_at, updated_at FROM topologies WHERE id = ?'
)

export const getTopologyState = db.prepare<[string], TopologyStateRow>(
  'SELECT topology_id, state FROM topology_state WHERE topology_id = ?'
)

export const insertTopology = db.prepare<[string, string]>(
  'INSERT INTO topologies (id, name) VALUES (?, ?)'
)

export const insertTopologyState = db.prepare<[string, string]>(
  'INSERT INTO topology_state (topology_id, state) VALUES (?, ?)'
)

export const updateTopologyState = db.prepare<[string, string]>(
  'UPDATE topology_state SET state = ? WHERE topology_id = ?'
)

export const updateTopologyTimestamp = db.prepare<[string]>(
  `UPDATE topologies SET updated_at = datetime('now') WHERE id = ?`
)

export const updateTopologyName = db.prepare<[string, string]>(
  'UPDATE topologies SET name = ? WHERE id = ?'
)

export const deleteTopology = db.prepare<[string]>(
  'DELETE FROM topologies WHERE id = ?'
)

export const createTopologyTransaction = db.transaction((id: string, name: string, state: string) => {
  insertTopology.run(id, name)
  insertTopologyState.run(id, state)
})

export const saveTopologyTransaction = db.transaction((id: string, state: string) => {
  updateTopologyState.run(state, id)
  updateTopologyTimestamp.run(id)
})

export interface HealthResultRow {
  device_id: string
  topology_id: string
  status: string
  latency: number | null
  error: string | null
  metrics: string | null
  checked_at: string
}

export const getHealthResults = db.prepare<[string], HealthResultRow>(
  'SELECT device_id, topology_id, status, latency, error, metrics, checked_at FROM health_results WHERE topology_id = ?'
)

export const upsertHealthResult = db.prepare<[string, string, string, number | null, string | null, string | null]>(
  `INSERT INTO health_results (device_id, topology_id, status, latency, error, metrics, checked_at)
   VALUES (?, ?, ?, ?, ?, ?, datetime('now'))
   ON CONFLICT (device_id, topology_id) DO UPDATE SET
     status = excluded.status,
     latency = excluded.latency,
     error = excluded.error,
     metrics = excluded.metrics,
     checked_at = excluded.checked_at`
)

export const deleteHealthResultsForTopology = db.prepare<[string]>(
  'DELETE FROM health_results WHERE topology_id = ?'
)

export const deleteHealthResult = db.prepare<[string, string]>(
  'DELETE FROM health_results WHERE device_id = ? AND topology_id = ?'
)

export default db
