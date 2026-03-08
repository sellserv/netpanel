# Proxmox Per-VM Monitoring, Power Controls, and SSH Terminal

## Overview

Extend NetPanel with three features:
1. Per-VM/LXC monitoring from Proxmox (discovery + manual VMID linking)
2. Power controls (start/shutdown/reboot) with confirmation modals
3. Built-in SSH terminal (bottom drawer, tabbed, xterm.js + ssh2)

## Data Flow

### VM Discovery & Linking

- Server endpoint `GET /api/proxmox/vms?host=IP&token=TOKEN` queries `/api2/json/nodes/{node}/qemu` and `/lxc` for all nodes, returns a flat list of `{ vmid, name, type, status, node }`.
- UI shows a discovery modal where user selects VMs to bulk-add as devices on the canvas.
- Each device gets a new optional field `proxmoxVm?: ProxmoxVmLink` linking it to a specific guest.
- Manual linking: in ConfigPanel, user enters a VMID and selects the Proxmox host device to link.

### Per-VM Metrics

- When a device has `proxmoxVm` set, the monitor fetches `/api2/json/nodes/{node}/{type}/{vmid}/status/current` on each interval.
- Extracted metrics: CPU%, RAM%, disk usage, uptime, status (running/stopped).
- Displayed in the device detail panel, replacing host-level node metrics.

### Power Controls

- Server endpoint: `POST /api/proxmox/vms/:action` with body `{ host, node, vmid, type, token }`.
- Actions: `start`, `shutdown`, `reboot` — proxied to Proxmox API `POST /nodes/{node}/{type}/{vmid}/status/{action}`.
- UI: buttons in ConfigPanel when device has `proxmoxVm`. Click triggers confirmation modal, confirm sends request.

### SSH Terminal

- Server: new WebSocket handler on `/ws/ssh`. Client sends `{ type: 'connect', host, port, username, password?, privateKey? }`. Server uses ssh2 to establish connection, pipes stdin/stdout over WebSocket.
- Client: xterm.js + xterm-addon-fit in a bottom drawer. Tabs tracked in React state — each tab has its own WebSocket and xterm instance.
- Drawer has resize handle, minimize/maximize, and close.
- Connect flow: "SSH" button on ConfigPanel opens credentials dialog (host pre-filled from device IP, port defaults to 22, username, password or key), then opens a new tab in the drawer.

## New Types

```typescript
interface ProxmoxVmLink {
  host: string        // IP of the Proxmox host
  node: string        // Proxmox node name
  vmid: number
  type: 'qemu' | 'lxc'
}

// Added to Device interface:
proxmoxVm?: ProxmoxVmLink
```

## New UI Components

- **VmDiscoveryModal** — lists discovered VMs with checkboxes, "Add to Canvas" button
- **ConfirmModal** — generic confirmation dialog for power actions
- **SshDrawer** — bottom drawer with tab bar, xterm.js terminals, resize handle
- **SshConnectDialog** — modal for SSH credentials
- **Power control buttons** — in ConfigPanel, status-aware (can't start a running VM)

## New Dependencies

- `ssh2` — server-side SSH client
- `xterm` + `@xterm/addon-fit` — browser terminal emulator

## Server Endpoints

| Method | Path | Purpose |
|--------|------|---------|
| GET | `/api/proxmox/vms` | Discover VMs/LXCs from a Proxmox host |
| POST | `/api/proxmox/vms/:action` | Power control (start/shutdown/reboot) |

## WebSocket

| Path | Purpose |
|------|---------|
| `/ws/ssh` | SSH session proxy |
