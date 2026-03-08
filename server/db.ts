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
`)

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

export default db
