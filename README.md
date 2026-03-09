# NetPanel

A network topology builder and monitoring dashboard. Design network layouts visually with drag-and-drop, draw connections between device ports, and monitor device health in real time.

## Features

- **Visual Topology Editor** — SVG canvas with pan, zoom, and grid snapping
- **Device Palette** — Drag and drop routers, switches, firewalls, servers, and more onto the canvas
- **Port Connections** — Draw connections between device ports with visual cabling
- **Zones** — Group devices into labeled, color-coded regions with drag and resize
- **Health Monitoring** — Automatic HTTP, TCP, and ICMP ping checks against device IPs
- **API Integrations** — Built-in presets for Proxmox, TrueNAS, Tailscale, and Docker Engine with auto-filled endpoints and metric extraction (CPU, RAM, uptime, container counts, etc.)
- **Proxmox Per-VM Monitoring** — Link devices to specific VMs/LXC containers for per-guest CPU, RAM, disk, and uptime metrics
- **VM Discovery** — Auto-discover Proxmox VMs and containers, bulk-add them to your topology
- **Power Controls** — Start, shutdown, and reboot Proxmox VMs directly from the device panel with confirmation dialogs
- **Built-in SSH Terminal** — Browser-based SSH shell (xterm.js) with tabbed sessions, password and SSH key auth, resizable bottom drawer
- **Live Updates** — WebSocket-powered real-time health status indicators on each device
- **Multi-Select** — Shift+click to select and manage multiple devices at once
- **Import / Export** — Save and load topologies as JSON
- **Persistent Storage** — SQLite-backed API with auto-save

## Quick Start

### Prerequisites

- Ubuntu (or similar) server
- Node.js 22+

### Deploy

```bash
git clone https://github.com/sellserv/netpanel.git
cd netpanel
./setup.sh
```

The setup script installs Node.js (if needed), builds the app, and creates a systemd service. The app will be available at **http://your-server:3001**.

### Service Management

```bash
sudo systemctl status netpanel     # Check status
sudo systemctl restart netpanel    # Restart
sudo journalctl -u netpanel -f     # View logs
```

### Updating

```bash
cd ~/netpanel
git pull
npm ci
npm run build
sudo systemctl restart netpanel
```

### Configuration

| Variable | Default | Description |
|----------|---------|-------------|
| `PORT`   | `3001`  | Server listen port |

### Data Persistence

Topology data is stored in a SQLite database at `data/panel.db`.

To back up:

```bash
cp data/panel.db ~/panel-backup.db
```

## Development

### Setup

```bash
npm install
npm run dev
```

This starts both the Vite dev server (frontend) and the Express API server concurrently. The app will be available at **http://localhost:5173** with the API proxied to port 3001.

### Build

```bash
npm run build
npm start
```

This compiles the frontend and starts the production server on port 3001.

## Tech Stack

- **Frontend:** React, TypeScript, Tailwind CSS, Vite, xterm.js
- **Backend:** Express, better-sqlite3, WebSocket (ws), ssh2
- **Runtime:** Node.js 22
