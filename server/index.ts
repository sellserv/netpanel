import express from 'express'
import type { Request, Response } from 'express'
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

// List all topologies
app.get('/api/topologies', (_req: Request, res: Response) => {
  const rows = listTopologies.all()
  res.json(rows)
})

// Create new topology
app.post('/api/topologies', (req: Request, res: Response) => {
  const { name, state } = req.body
  if (!name || typeof name !== 'string') {
    res.status(400).json({ error: 'name is required' })
    return
  }
  const id = crypto.randomUUID()
  const stateJson = JSON.stringify(
    state ?? {
      devices: [],
      connections: [],
      zones: [],
      viewBox: { x: -500, y: -300, width: 1600, height: 900 },
    }
  )
  createTopologyTransaction(id, name.trim(), stateJson)
  res.status(201).json({ id, name: name.trim() })
})

// Get topology with state
app.get('/api/topologies/:id', (req: Request, res: Response) => {
  const id = String(req.params.id)
  const row = getTopology.get(id)
  if (!row) {
    res.status(404).json({ error: 'not found' })
    return
  }
  const stateRow = getTopologyState.get(id)
  res.json({
    ...row,
    state: stateRow ? JSON.parse(stateRow.state) : null,
  })
})

// Save topology state (auto-save target)
app.put('/api/topologies/:id', (req: Request, res: Response) => {
  const id = String(req.params.id)
  const row = getTopology.get(id)
  if (!row) {
    res.status(404).json({ error: 'not found' })
    return
  }
  const { state, name } = req.body
  if (state !== undefined) {
    saveTopologyTransaction(id, JSON.stringify(state))
  }
  if (name !== undefined && typeof name === 'string') {
    updateTopologyName.run(name.trim(), id)
  }
  res.json({ ok: true })
})

// Delete topology
app.delete('/api/topologies/:id', (req: Request, res: Response) => {
  const id = String(req.params.id)
  const row = getTopology.get(id)
  if (!row) {
    res.status(404).json({ error: 'not found' })
    return
  }
  deleteTopology.run(id)
  res.json({ ok: true })
})

// Export topology as JSON download
app.get('/api/topologies/:id/export', (req: Request, res: Response) => {
  const id = String(req.params.id)
  const row = getTopology.get(id)
  if (!row) {
    res.status(404).json({ error: 'not found' })
    return
  }
  const stateRow = getTopologyState.get(id)
  const exportData = {
    name: row.name,
    created_at: row.created_at,
    exported_at: new Date().toISOString(),
    state: stateRow ? JSON.parse(stateRow.state) : null,
  }
  res.setHeader(
    'Content-Disposition',
    `attachment; filename="${row.name.replace(/[^a-zA-Z0-9_-]/g, '_')}.json"`
  )
  res.json(exportData)
})

// Import topology from JSON
app.post('/api/import', (req: Request, res: Response) => {
  const { name, state } = req.body
  if (!name || !state) {
    res.status(400).json({ error: 'name and state are required' })
    return
  }
  const id = crypto.randomUUID()
  createTopologyTransaction(id, name.trim(), JSON.stringify(state))
  res.status(201).json({ id, name: name.trim() })
})

// Static files (production)
const distPath = path.join(__dirname, '..', 'dist')
app.use(express.static(distPath))
app.get('{*path}', (_req: Request, res: Response) => {
  res.sendFile(path.join(distPath, 'index.html'))
})

app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`)
})
