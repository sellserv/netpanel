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

function getBase() {
  const path = window.location.pathname.replace(/\/[^/]*$/, '/')
  return `${path}api`
}

const BASE = getBase()

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

export async function fetchHealthResults(topologyId: string): Promise<import('./types').HealthStatus[]> {
  return request(`/topologies/${topologyId}/health`)
}

export interface ProxmoxVm {
  vmid: number
  name: string
  type: 'qemu' | 'lxc'
  status: string
  node: string
  cpu?: number
  maxmem?: number
  mem?: number
  uptime?: number
}

export async function discoverProxmoxVms(host: string, token: string): Promise<ProxmoxVm[]> {
  return request(`/proxmox/vms?host=${encodeURIComponent(host)}&token=${encodeURIComponent(token)}`)
}

export async function proxmoxVmAction(
  action: 'start' | 'shutdown' | 'reboot',
  params: { host: string; node: string; vmid: number; type: string; token: string }
): Promise<{ ok: boolean; upid?: string }> {
  return request(`/proxmox/vms/${action}`, {
    method: 'POST',
    body: JSON.stringify(params),
  })
}
