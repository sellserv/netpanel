# Backend (Express + SQLite) Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add an Express + SQLite backend to persist topology state, support multiple named topologies, and replace localStorage with API calls.

**Architecture:** Express server with SQLite (via better-sqlite3) stores topology state as JSON blobs. Two tables: `topologies` (metadata) and `topology_state` (JSON blob). Frontend switches from localStorage to debounced API calls. Vite proxies `/api/*` in dev; Express serves static files + API in production.

**Tech Stack:** Express 4, better-sqlite3, TypeScript (tsx for server), Vite proxy

---

### Task 1: Install backend dependencies

**Files:**
- Modify: `package.json`

**Step 1: Install production dependencies**

Run: `npm install express better-sqlite3`

**Step 2: Install dev dependencies**

Run: `npm install -D @types/express @types/better-sqlite3 tsx`

**Step 3: Verify installation**

Run: `npm ls express better-sqlite3 tsx`
Expected: All three packages listed without errors.

**Step 4: Commit**

```bash
git add package.json package-lock.json
git commit -m "feat: add express, better-sqlite3, tsx dependencies for backend"
```

---

### Task 2: Create the database module

**Files:**
- Create: `server/db.ts`

**Step 1: Create `server/db.ts`**

```ts
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
  `UPDATE topology_state SET state = ? WHERE topology_id = ?`
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
```

**Step 2: Gitignore the data directory**

Add to `.gitignore`:
```
data/
```

**Step 3: Verify TypeScript compiles**

Run: `npx tsx --eval "import './server/db.ts'; console.log('db ok')"`
Expected: Prints "db ok" and creates `data/panel.db`.

**Step 4: Commit**

```bash
git add server/db.ts .gitignore
git commit -m "feat: add SQLite database module with schema and queries"
```

---

### Task 3: Create the Express server

**Files:**
- Create: `server/index.ts`

**Step 1: Create `server/index.ts`**

```ts
import express from 'express'
import path from 'path'
import { fileURLToPath } from 'url'
import crypto from 'crypto'
import {
  listTopologies,
  getTopology,
  getTopologyState,
  createTopologyTransaction,
  saveTopologyTransaction,
  updateTopologyName,
  deleteTopology,
} from './db.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const app = express()
const PORT = parseInt(process.env.PORT || '3001', 10)

app.use(express.json({ limit: '10mb' }))

// --- API Routes ---

// List all topologies
app.get('/api/topologies', (_req, res) => {
  const rows = listTopologies.all()
  res.json(rows)
})

// Create new topology
app.post('/api/topologies', (req, res) => {
  const { name, state } = req.body
  if (!name || typeof name !== 'string') {
    res.status(400).json({ error: 'name is required' })
    return
  }
  const id = crypto.randomUUID()
  const stateJson = JSON.stringify(state ?? { devices: [], connections: [], zones: [], viewBox: { x: -500, y: -300, width: 1600, height: 900 } })
  createTopologyTransaction(id, name.trim(), stateJson)
  res.status(201).json({ id, name: name.trim() })
})

// Get topology with state
app.get('/api/topologies/:id', (req, res) => {
  const row = getTopology.get(req.params.id)
  if (!row) {
    res.status(404).json({ error: 'not found' })
    return
  }
  const stateRow = getTopologyState.get(req.params.id)
  res.json({
    ...row,
    state: stateRow ? JSON.parse(stateRow.state) : null,
  })
})

// Save topology state (auto-save target)
app.put('/api/topologies/:id', (req, res) => {
  const row = getTopology.get(req.params.id)
  if (!row) {
    res.status(404).json({ error: 'not found' })
    return
  }
  const { state, name } = req.body
  if (state !== undefined) {
    saveTopologyTransaction(req.params.id, JSON.stringify(state))
  }
  if (name !== undefined && typeof name === 'string') {
    updateTopologyName.run(name.trim(), req.params.id)
  }
  res.json({ ok: true })
})

// Delete topology
app.delete('/api/topologies/:id', (req, res) => {
  const row = getTopology.get(req.params.id)
  if (!row) {
    res.status(404).json({ error: 'not found' })
    return
  }
  deleteTopology.run(req.params.id)
  res.json({ ok: true })
})

// Export topology as JSON download
app.get('/api/topologies/:id/export', (req, res) => {
  const row = getTopology.get(req.params.id)
  if (!row) {
    res.status(404).json({ error: 'not found' })
    return
  }
  const stateRow = getTopologyState.get(req.params.id)
  const exportData = {
    name: row.name,
    created_at: row.created_at,
    exported_at: new Date().toISOString(),
    state: stateRow ? JSON.parse(stateRow.state) : null,
  }
  res.setHeader('Content-Disposition', `attachment; filename="${row.name.replace(/[^a-zA-Z0-9_-]/g, '_')}.json"`)
  res.json(exportData)
})

// Import topology from JSON
app.post('/api/import', (req, res) => {
  const { name, state } = req.body
  if (!name || !state) {
    res.status(400).json({ error: 'name and state are required' })
    return
  }
  const id = crypto.randomUUID()
  createTopologyTransaction(id, name.trim(), JSON.stringify(state))
  res.status(201).json({ id, name: name.trim() })
})

// --- Static files (production) ---
const distPath = path.join(__dirname, '..', 'dist')
app.use(express.static(distPath))
app.get('*', (_req, res) => {
  res.sendFile(path.join(distPath, 'index.html'))
})

app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`)
})
```

**Step 2: Verify server starts**

Run: `npx tsx server/index.ts &` then `curl http://localhost:3001/api/topologies`
Expected: Returns `[]`
Then kill the background process.

**Step 3: Commit**

```bash
git add server/index.ts
git commit -m "feat: add Express server with topology CRUD API endpoints"
```

---

### Task 4: Add npm scripts and Vite proxy

**Files:**
- Modify: `package.json` (scripts section)
- Modify: `vite.config.ts` (add proxy)

**Step 1: Update `package.json` scripts**

Replace the `scripts` section:
```json
"scripts": {
  "dev": "concurrently \"vite\" \"tsx watch server/index.ts\"",
  "dev:client": "vite",
  "dev:server": "tsx watch server/index.ts",
  "build": "tsc -b && vite build",
  "start": "tsx server/index.ts",
  "lint": "eslint .",
  "preview": "vite preview"
}
```

Install concurrently: `npm install -D concurrently`

**Step 2: Add Vite proxy in `vite.config.ts`**

```ts
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

export default defineConfig({
  base: './',
  plugins: [react(), tailwindcss()],
  server: {
    proxy: {
      '/api': 'http://localhost:3001',
    },
  },
})
```

**Step 3: Verify dev setup**

Run: `npm run dev:server &` then (in another terminal or after a moment) verify `curl http://localhost:3001/api/topologies` returns `[]`. Kill the process.

**Step 4: Commit**

```bash
git add package.json package-lock.json vite.config.ts
git commit -m "feat: add dev scripts with concurrently and Vite API proxy"
```

---

### Task 5: Create API client module

**Files:**
- Create: `src/api.ts`

**Step 1: Create `src/api.ts`**

```ts
export interface TopologySummary {
  id: string
  name: string
  created_at: string
  updated_at: string
}

export interface TopologyFull extends TopologySummary {
  state: {
    devices: import('./types').Device[]
    connections: import('./types').Connection[]
    zones: import('./types').Zone[]
    viewBox: import('./types').ViewBox
  } | null
}

const BASE = '/api'

async function request<T>(path: string, options?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    headers: { 'Content-Type': 'application/json' },
    ...options,
  })
  if (!res.ok) {
    const body = await res.json().catch(() => ({}))
    throw new Error(body.error || `HTTP ${res.status}`)
  }
  return res.json()
}

export async function listTopologies(): Promise<TopologySummary[]> {
  return request('/topologies')
}

export async function createTopology(name: string): Promise<{ id: string; name: string }> {
  return request('/topologies', {
    method: 'POST',
    body: JSON.stringify({ name }),
  })
}

export async function loadTopology(id: string): Promise<TopologyFull> {
  return request(`/topologies/${id}`)
}

export async function saveTopology(id: string, state: object): Promise<void> {
  await request(`/topologies/${id}`, {
    method: 'PUT',
    body: JSON.stringify({ state }),
  })
}

export async function renameTopology(id: string, name: string): Promise<void> {
  await request(`/topologies/${id}`, {
    method: 'PUT',
    body: JSON.stringify({ name }),
  })
}

export async function deleteTopology(id: string): Promise<void> {
  await request(`/topologies/${id}`, { method: 'DELETE' })
}

export function exportTopologyUrl(id: string): string {
  return `${BASE}/topologies/${id}/export`
}

export async function importTopology(data: { name: string; state: object }): Promise<{ id: string; name: string }> {
  return request('/import', {
    method: 'POST',
    body: JSON.stringify(data),
  })
}
```

**Step 2: Verify TypeScript compiles**

Run: `npx tsc --noEmit -p tsconfig.app.json`
Expected: No errors.

**Step 3: Commit**

```bash
git add src/api.ts
git commit -m "feat: add API client module for topology CRUD operations"
```

---

### Task 6: Update state management — replace localStorage with API

**Files:**
- Modify: `src/state.ts`

**Step 1: Update `src/state.ts`**

Replace the `useTopology` hook to use API calls instead of localStorage. Keep the reducer unchanged. Add a `LOAD_STATE` dispatch on mount. Replace the localStorage save with a debounced PUT.

The new `useTopology` hook:

```ts
export function useTopology() {
  const [state, dispatch] = useReducer(reducer, initialState)
  const [currentTopologyId, setCurrentTopologyId] = useState<string | null>(null)
  const [topologies, setTopologies] = useState<{ id: string; name: string }[]>([])
  const [loading, setLoading] = useState(true)
  const saveTimeout = useRef<ReturnType<typeof setTimeout>>()
  const skipSave = useRef(true)

  // Load topology list on mount
  useEffect(() => {
    import('./api').then(api => {
      api.listTopologies().then(list => {
        setTopologies(list)
        if (list.length > 0) {
          const first = list[0]
          setCurrentTopologyId(first.id)
          api.loadTopology(first.id).then(full => {
            if (full.state) {
              dispatch({ type: 'LOAD_STATE', state: { ...initialState, ...full.state, selectedIds: [], selectionType: null } })
            }
            setLoading(false)
            // Allow saving after initial load
            setTimeout(() => { skipSave.current = false }, 500)
          })
        } else {
          // Create default topology
          api.createTopology('Untitled').then(created => {
            setTopologies([created])
            setCurrentTopologyId(created.id)
            setLoading(false)
            setTimeout(() => { skipSave.current = false }, 500)
          })
        }
      })
    })
  }, [])

  // Auto-save on state change (debounced)
  useEffect(() => {
    if (skipSave.current || !currentTopologyId) return
    clearTimeout(saveTimeout.current)
    saveTimeout.current = setTimeout(() => {
      const { selectedIds, selectionType, ...rest } = state
      import('./api').then(api => {
        api.saveTopology(currentTopologyId, rest)
      })
    }, 500)
    return () => clearTimeout(saveTimeout.current)
  }, [state, currentTopologyId])

  const switchTopology = useCallback(async (id: string) => {
    skipSave.current = true
    const api = await import('./api')
    const full = await api.loadTopology(id)
    if (full.state) {
      dispatch({ type: 'LOAD_STATE', state: { ...initialState, ...full.state, selectedIds: [], selectionType: null } })
    }
    setCurrentTopologyId(id)
    setTimeout(() => { skipSave.current = false }, 500)
  }, [])

  const createNewTopology = useCallback(async (name: string) => {
    skipSave.current = true
    const api = await import('./api')
    const created = await api.createTopology(name)
    setTopologies(prev => [created, ...prev])
    setCurrentTopologyId(created.id)
    dispatch({ type: 'LOAD_STATE', state: initialState })
    setTimeout(() => { skipSave.current = false }, 500)
  }, [])

  const deleteCurrentTopology = useCallback(async () => {
    if (!currentTopologyId) return
    const api = await import('./api')
    await api.deleteTopology(currentTopologyId)
    const remaining = topologies.filter(t => t.id !== currentTopologyId)
    setTopologies(remaining)
    if (remaining.length > 0) {
      await switchTopology(remaining[0].id)
    } else {
      const created = await api.createTopology('Untitled')
      setTopologies([created])
      setCurrentTopologyId(created.id)
      dispatch({ type: 'LOAD_STATE', state: initialState })
      setTimeout(() => { skipSave.current = false }, 500)
    }
  }, [currentTopologyId, topologies, switchTopology])

  const refreshTopologies = useCallback(async () => {
    const api = await import('./api')
    const list = await api.listTopologies()
    setTopologies(list)
  }, [])

  return {
    state,
    dispatch,
    currentTopologyId,
    topologies,
    loading,
    switchTopology,
    createNewTopology,
    deleteCurrentTopology,
    refreshTopologies,
  }
}
```

Add required imports at top of file:
```ts
import { useReducer, useEffect, useRef, useState, useCallback } from 'react'
```

Remove the `STORAGE_KEY` constant and old `loadState` function. The `loadState` function becomes unused — initial state is just `initialState`.

Update the useReducer call:
```ts
const [state, dispatch] = useReducer(reducer, initialState)
```

**Step 2: Verify TypeScript compiles**

Run: `npx tsc --noEmit -p tsconfig.app.json`
Expected: No errors (App.tsx may show errors — that's expected, we fix it next task).

**Step 3: Commit**

```bash
git add src/state.ts
git commit -m "feat: replace localStorage persistence with API-backed state management"
```

---

### Task 7: Update App.tsx to use new state shape

**Files:**
- Modify: `src/App.tsx`

**Step 1: Update `App.tsx`**

Destructure the new return values from `useTopology()`. Pass topology management props to Sidebar. Show loading state.

Key changes:
- `const { state, dispatch, currentTopologyId, topologies, loading, switchTopology, createNewTopology, deleteCurrentTopology } = useTopology()`
- Add a loading check: `if (loading) return <div className="h-screen w-screen bg-zinc-900 flex items-center justify-center text-zinc-400">Loading...</div>`
- Pass new props to `<Sidebar>`: `topologies`, `currentTopologyId`, `onSwitchTopology={switchTopology}`, `onNewTopology={createNewTopology}`, `onDeleteTopology={deleteCurrentTopology}`, `onExport`, `onImport`

Add export/import handlers:

```ts
const handleExport = useCallback(() => {
  if (!currentTopologyId) return
  window.open(`/api/topologies/${currentTopologyId}/export`, '_blank')
}, [currentTopologyId])

const handleImport = useCallback(() => {
  const input = document.createElement('input')
  input.type = 'file'
  input.accept = '.json'
  input.onchange = async () => {
    const file = input.files?.[0]
    if (!file) return
    const text = await file.text()
    const data = JSON.parse(text)
    const api = await import('./api')
    const created = await api.importTopology({ name: data.name || file.name, state: data.state })
    await switchTopology(created.id)
    // Refresh topology list in sidebar
    const list = await api.listTopologies()
    // Note: we need refreshTopologies for this
  }
  input.click()
}, [switchTopology])
```

Actually, update the destructure to include `refreshTopologies`:
```ts
const { state, dispatch, currentTopologyId, topologies, loading, switchTopology, createNewTopology, deleteCurrentTopology, refreshTopologies } = useTopology()
```

And the import handler becomes:
```ts
const handleImport = useCallback(async () => {
  const input = document.createElement('input')
  input.type = 'file'
  input.accept = '.json'
  input.onchange = async () => {
    const file = input.files?.[0]
    if (!file) return
    const text = await file.text()
    const data = JSON.parse(text)
    const api = await import('./api')
    const created = await api.importTopology({ name: data.name || file.name, state: data.state })
    await refreshTopologies()
    await switchTopology(created.id)
  }
  input.click()
}, [switchTopology, refreshTopologies])
```

**Step 2: Verify TypeScript compiles**

Run: `npx tsc --noEmit -p tsconfig.app.json`
Expected: May have errors related to Sidebar props — that's expected for next task.

**Step 3: Commit**

```bash
git add src/App.tsx
git commit -m "feat: update App to use API-backed topology management"
```

---

### Task 8: Update Sidebar with topology selector

**Files:**
- Modify: `src/components/Sidebar.tsx`

**Step 1: Update Sidebar props and UI**

Add topology management UI to the sidebar header area. Show a dropdown to switch topologies, buttons for new/delete/export/import.

New props interface:
```ts
interface SidebarProps {
  onDragStart: () => void
  topologies: { id: string; name: string }[]
  currentTopologyId: string | null
  onSwitchTopology: (id: string) => void
  onNewTopology: (name: string) => void
  onDeleteTopology: () => void
  onExport: () => void
  onImport: () => void
}
```

Add a topology selector section above the device palette:
- `<select>` dropdown with all topologies, value = currentTopologyId
- "New" button that prompts for a name (window.prompt)
- "Delete" button with confirm dialog
- "Export" and "Import" buttons
- Use lucide-react icons: `Plus`, `Trash2`, `Download`, `Upload`

When collapsed, hide the topology selector (only show when expanded).

**Step 2: Verify TypeScript compiles**

Run: `npx tsc --noEmit -p tsconfig.app.json`
Expected: No errors.

**Step 3: Verify the full app works**

Run: `npm run dev:server &` and `npm run dev:client` (or `npm run dev`)
- Open in browser
- Verify topology loads
- Add a device, wait for auto-save
- Refresh — device should persist
- Create new topology
- Switch between topologies
- Delete a topology
- Export/import

**Step 4: Commit**

```bash
git add src/components/Sidebar.tsx
git commit -m "feat: add topology selector with new/delete/export/import to sidebar"
```

---

### Task 9: Add TypeScript config for server files

**Files:**
- Create: `tsconfig.server.json`

**Step 1: Create `tsconfig.server.json`**

```json
{
  "compilerOptions": {
    "target": "ES2023",
    "module": "ESNext",
    "moduleResolution": "bundler",
    "lib": ["ES2023"],
    "types": ["node"],
    "strict": true,
    "skipLibCheck": true,
    "noEmit": true,
    "verbatimModuleSyntax": true,
    "moduleDetection": "force",
    "erasableSyntaxOnly": true
  },
  "include": ["server"]
}
```

**Step 2: Update root `tsconfig.json` references**

Add the server config to the references array:
```json
{
  "files": [],
  "references": [
    { "path": "./tsconfig.app.json" },
    { "path": "./tsconfig.node.json" },
    { "path": "./tsconfig.server.json" }
  ]
}
```

**Step 3: Verify**

Run: `npx tsc --noEmit -p tsconfig.server.json`
Expected: No errors.

**Step 4: Commit**

```bash
git add tsconfig.server.json tsconfig.json
git commit -m "feat: add TypeScript config for server files"
```

---

### Task 10: Final integration test and cleanup

**Files:**
- Modify: `index.html` (fix title)
- Modify: `.gitignore` (ensure data/ is ignored)

**Step 1: Fix page title**

In `index.html`, change `<title>tempapp</title>` to `<title>Network Panel</title>`.

**Step 2: Verify `.gitignore` has `data/`**

Check `.gitignore` includes `data/`.

**Step 3: Full integration test**

Run: `npm run build && npm start`
- Open `http://localhost:3001` in browser
- Create a topology, add devices, connections, zones
- Refresh — everything persists
- Create second topology, switch between them
- Export one, delete it, import it back
- Verify production build serves correctly

**Step 4: Commit**

```bash
git add index.html .gitignore
git commit -m "chore: fix page title and ensure data dir is gitignored"
```
