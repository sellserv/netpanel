# NetPanel

A network topology builder and monitoring dashboard. Design network layouts visually with drag-and-drop, draw connections between device ports, and monitor device health in real time.

## Features

- **Visual Topology Editor** — SVG canvas with pan, zoom, and grid snapping
- **Device Palette** — Drag and drop routers, switches, firewalls, servers, and more onto the canvas
- **Port Connections** — Draw connections between device ports with visual cabling
- **Zones** — Group devices into labeled, color-coded regions with drag and resize
- **Health Monitoring** — Automatic HTTP, TCP, and ICMP ping checks against device IPs
- **Live Updates** — WebSocket-powered real-time health status indicators on each device
- **Multi-Select** — Shift+click to select and manage multiple devices at once
- **Import / Export** — Save and load topologies as JSON
- **Persistent Storage** — SQLite-backed API with auto-save

## Quick Start with Docker Compose

### Prerequisites

- [Docker](https://docs.docker.com/get-docker/) and [Docker Compose](https://docs.docker.com/compose/install/)

### Run

```bash
git clone https://github.com/sellserv/netpanel.git
cd netpanel
docker compose up -d
```

The app will be available at **http://localhost:3001**.

### Configuration

| Variable | Default | Description |
|----------|---------|-------------|
| `PORT`   | `3001`  | Server listen port |

To change the exposed port, edit `docker-compose.yml`:

```yaml
services:
  panel:
    build: .
    ports:
      - "8080:3001"   # access on port 8080 instead
    volumes:
      - panel-data:/app/data
    restart: unless-stopped

volumes:
  panel-data:
```

### Data Persistence

Topology data is stored in a SQLite database inside the container at `/app/data/`. The `panel-data` Docker volume keeps this data intact across container restarts and rebuilds.

To back up the database:

```bash
docker compose cp panel:/app/data/panel.db ./panel-backup.db
```

### Rebuilding

After pulling updates:

```bash
docker compose up -d --build
```

### Stopping

```bash
docker compose down
```

To remove the data volume as well:

```bash
docker compose down -v
```

## Development

### Prerequisites

- Node.js 22+
- npm

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

- **Frontend:** React, TypeScript, Tailwind CSS, Vite
- **Backend:** Express, better-sqlite3, WebSocket (ws)
- **Runtime:** Node.js 22 (Alpine)
